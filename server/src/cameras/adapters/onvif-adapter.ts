import type { CameraAdapter, CameraConnectionInput, CameraDiscoveryResult, CameraCapabilities, ConnectionTestResult, StreamProfile, CapabilityEvidence } from '../camera-adapter';
import { cameraStreamUrl, emptyCapabilities, redactCameraSecrets } from '../camera-adapter';
import { probeMediaStream } from '../../media/media-probe';
import { randomUUID } from 'node:crypto';

function call<T>(run: (callback: (error: Error | null, value: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => run((error, value) => error ? reject(error) : resolve(value)));
}

function includesCapability(value: unknown, words: string[]) {
    const text = JSON.stringify(value ?? {}).toLowerCase();
    return words.some(word => text.includes(word));
}

export class OnvifAdapter implements CameraAdapter {
    readonly protocol = 'ONVIF' as const;

    async discover(input: CameraConnectionInput): Promise<CameraDiscoveryResult> {
        const capabilities = emptyCapabilities('onvif');
        const evidence: CapabilityEvidence[] = [];

        try {
            const onvif = await import('onvif');
            
            const candidates = [...new Set([input.onvif_port ?? input.port, 80, 8080, 8899, 8000, 8001].filter(Boolean))];
            let cam: any;
            let lastError: any;

            for (const port of candidates) {
                try {
                    cam = await new Promise<any>((resolve, reject) => {
                        let instance: any;
                        instance = new (onvif as any).Cam({
                            hostname: input.ip,
                            port: port,
                            username: input.username,
                            password: input.password,
                        }, (error: Error) => error ? reject(error) : resolve(instance));
                    });
                    break; // Connected successfully
                } catch (err) {
                    lastError = err;
                }
            }

            if (!cam) throw lastError;

            const [profiles, information, onvifCapabilities, services] = await Promise.all([
                call<any[]>(callback => cam.getProfiles(callback)),
                call<any>(callback => cam.getDeviceInformation(callback)).catch(() => ({})),
                call<any>(callback => cam.getCapabilities(callback)).catch(() => ({})),
                typeof cam.getServices === 'function' ? call<any>(callback => cam.getServices(true, callback)).catch(() => ({})) : Promise.resolve({}),
            ]);

            const streamProfiles: StreamProfile[] = [];
            
            for (const [index, profile] of profiles.entries()) {
                const token = profile?.$?.token;
                let streamUri: string | undefined;
                let snapshotUri: string | undefined;
                
                try { streamUri = (await call<any>(callback => cam.getStreamUri({ protocol: 'RTSP', profileToken: token }, callback)))?.uri; } catch { /* ignore */ }
                try { snapshotUri = (await call<any>(callback => cam.getSnapshotUri({ profileToken: token }, callback)))?.uri; } catch { /* ignore */ }
                
                const onvifProfile: StreamProfile = {
                    id: token ?? `onvif-${index}`,
                    name: profile?.name ?? profile?.Name,
                    streamUri,
                    snapshotUri,
                };

                // Si hay URL de stream, usamos ffprobe para obtener los valores REALES del hardware
                if (streamUri) {
                    const probeUrl = cameraStreamUrl(input, streamUri);
                    const probe = await probeMediaStream(probeUrl, 10000);
                    
                    onvifProfile.validationStatus = probe.success && probe.rawInfo?.hasVideo ? 'valid' : 'invalid';
                    onvifProfile.validationErrorCategory = probe.errorCategory;
                    onvifProfile.validationErrorMessage = probe.stderrSummary;
                    onvifProfile.validationDurationMs = probe.durationMs;
                    onvifProfile.validationTransport = probe.transportUsed;

                    if (probe.success && probe.rawInfo) {
                        const raw = probe.rawInfo;
                        onvifProfile.codec = raw.video?.normalizedCodec;
                        onvifProfile.rawCodec = raw.video?.rawCodec;
                        onvifProfile.normalizedCodec = raw.video?.normalizedCodec;
                        onvifProfile.displayCodec = raw.video?.displayCodec;
                        onvifProfile.profile = raw.video?.profile;
                        onvifProfile.level = raw.video?.level;
                        onvifProfile.width = raw.video?.width;
                        onvifProfile.height = raw.video?.height;
                        onvifProfile.fps = raw.video?.fps;
                        onvifProfile.bitrate = raw.video?.bitrate;
                        onvifProfile.pixFmt = raw.video?.pixFmt;
                        onvifProfile.colorSpace = raw.video?.colorSpace;
                        
                        onvifProfile.audioCodec = raw.audio?.normalizedCodec;
                        onvifProfile.audioSampleRate = raw.audio?.sampleRate;
                        onvifProfile.audioChannels = raw.audio?.channels;
                        onvifProfile.audioBitrate = raw.audio?.bitrate;
                        
                        // Grabamos la evidencia de que hay audio en el stream RTSP
                        if (raw.hasAudio) {
                            if (!capabilities.audio.codecs.includes(raw.audio!.normalizedCodec)) {
                                capabilities.audio.codecs.push(raw.audio!.normalizedCodec);
                                capabilities.audio.sampleRates.push(raw.audio!.sampleRate);
                            }
                            
                            // Prevent duplicate evidences across profiles, just add one per stream type
                            if (!evidence.some(e => e.entity === 'stream_audio' && e.source === 'rtsp')) {
                                evidence.push({
                                    entity: 'stream_audio', detected: true, verified: true, readable: true, controllable: false, source: 'rtsp', confidence: 'verified',
                                    evidence: { codec: raw.audio!.displayCodec, sampleRate: raw.audio!.sampleRate }, lastVerifiedAt: new Date().toISOString()
                                });
                            }
                        }
                    }
                } else {
                    onvifProfile.validationStatus = 'not_tested';
                    onvifProfile.validationErrorMessage = 'ONVIF no devolvió una URI RTSP para este perfil.';
                }

                streamProfiles.push(onvifProfile);
            }

            // --- STRICT CAPABILITY EVALUATION ---
            const ptz = !!(onvifCapabilities?.PTZ ?? onvifCapabilities?.ptz);
            if (ptz) {
                evidence.push({ entity: 'ptz', detected: true, verified: true, readable: false, controllable: true, source: 'onvif-device', confidence: 'anunciado', lastVerifiedAt: new Date().toISOString() });
            }

            const events = !!(onvifCapabilities?.Events ?? onvifCapabilities?.events);
            if (events) {
                evidence.push({ entity: 'motion', detected: true, verified: true, readable: true, controllable: false, source: 'onvif-events', confidence: 'anunciado', lastVerifiedAt: new Date().toISOString() });
            }

            // Real Relay Checks
            let relays: any[] = [];
            try { relays = await call<any[]>(callback => cam.getRelayOutputs(callback)); } catch { /* ignore */ }
            if (relays.length > 0) {
                for (const relay of relays) {
                    evidence.push({ 
                        entity: 'relay', detected: true, verified: true, readable: true, controllable: true, source: 'onvif-deviceio', confidence: 'verified',
                        evidence: { token: relay.token || relay.$.token }, lastVerifiedAt: new Date().toISOString() 
                    });
                }
            }

            // Fallbacks based on capabilities string matching (only if we didn't find real relays)
            const advertisedLight = relays.length === 0 && includesCapability([onvifCapabilities, services], ['light', 'floodlight', 'illuminator', 'spotlight', 'lamp']);
            const advertisedSiren = relays.length === 0 && includesCapability([onvifCapabilities, services], ['siren', 'alarm', 'audioalarm']);
            
            if (advertisedLight) evidence.push({ entity: 'light', detected: true, verified: false, readable: false, controllable: false, source: 'onvif-device', confidence: 'anunciado', lastVerifiedAt: new Date().toISOString() });
            if (advertisedSiren) evidence.push({ entity: 'siren', detected: true, verified: false, readable: false, controllable: false, source: 'onvif-device', confidence: 'anunciado', lastVerifiedAt: new Date().toISOString() });

            capabilities.discoveryStatus = 'online';
            capabilities.lastCheckedAt = new Date().toISOString();
            capabilities.manufacturer = information?.Manufacturer ?? information?.manufacturer;
            capabilities.model = information?.Model ?? information?.model;
            capabilities.firmware = information?.FirmwareVersion ?? information?.firmwareVersion;
            capabilities.serialNumber = information?.SerialNumber ?? information?.serialNumber;
            capabilities.capabilityEvidence = evidence;

            // En un discovery ONVIF estricto, capabilities.video.profiles SOLO incluye streams con validationStatus == valid
            const validProfiles = streamProfiles.filter(p => p.validationStatus === 'valid');
            capabilities.video.profiles = streamProfiles; // Save all, but we pick default from valid
            capabilities.video.supportsH264 = validProfiles.some(p => p.normalizedCodec === 'H264');
            capabilities.video.supportsH265 = validProfiles.some(p => p.normalizedCodec === 'H265');
            
            // Auto-select safest profile: Valid H264 > Valid H265 > First Valid > First (if none valid)
            capabilities.video.selectedProfileId = 
                validProfiles.find(p => p.normalizedCodec === 'H264')?.id ??
                validProfiles.find(p => p.normalizedCodec === 'H265')?.id ??
                validProfiles[0]?.id ?? 
                streamProfiles[0]?.id;

            capabilities.audio.available = evidence.some(e => e.entity === 'stream_audio' && e.verified);
            
            capabilities.controls.ptz = ptz;
            capabilities.controls.motionEvents = events;
            
            // Only light/siren control if we have relays (or explicitly mapped, which happens upstream)
            capabilities.controls.lightControl = evidence.some(e => (e.entity === 'relay' || e.entity === 'light') && e.controllable);
            capabilities.controls.sirenControl = evidence.some(e => (e.entity === 'relay' || e.entity === 'siren') && e.controllable);
            
            capabilities.preview.snapshot = streamProfiles.some(profile => !!profile.snapshotUri);
            
            // Only allow preview if at least ONE profile is valid RTSP
            capabilities.preview.rtsp = validProfiles.length > 0;
            capabilities.preview.mjpeg = validProfiles.length > 0;
            capabilities.yolo.available = validProfiles.length > 0;
            
            if (validProfiles.length === 0) {
                capabilities.onvifConnected = true;
                capabilities.onvifRtspFailureReason = 'ONVIF conectó correctamente, pero FFprobe no pudo abrir los flujos RTSP asociados.';
                capabilities.yolo.reason = 'El flujo de video RTSP no pudo validarse.';
            }

            return { capabilities, streamProfiles };
        } catch (error) {
            capabilities.discoveryStatus = /unauthorized|authentication|not authorized|401/i.test(error instanceof Error ? error.message : String(error)) ? 'authentication_failed' : 'error';
            capabilities.lastCheckedAt = new Date().toISOString();
            throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { capabilities });
        }
    }

    async getCapabilities(input: CameraConnectionInput): Promise<CameraCapabilities> { 
        return (await this.discover(input)).capabilities; 
    }
    
    async testConnection(input: CameraConnectionInput): Promise<ConnectionTestResult> {
        try { 
            const result = await this.discover(input); 
            return { success: true, status: result.capabilities.discoveryStatus }; 
        } catch (error) { 
            return { success: false, status: (error as { capabilities?: CameraCapabilities }).capabilities?.discoveryStatus ?? 'error', message: error instanceof Error ? error.message : String(error) }; 
        }
    }

    async executeAction(input: CameraConnectionInput, action: 'light' | 'siren' | 'relay', state: boolean, evidence?: CapabilityEvidence): Promise<void> {
        const onvif = await import('onvif');
        const candidates = [...new Set([input.onvif_port ?? input.port, 80, 8080, 8899, 8000, 8001].filter(Boolean))];
        let cam: any;
        for (const port of candidates) {
            try {
                cam = await new Promise<any>((resolve, reject) => {
                    const instance = new (onvif as any).Cam({ hostname: input.ip, port: port, username: input.username, password: input.password }, (err: Error) => err ? reject(err) : resolve(instance));
                });
                break;
            } catch (e) { /* ignore */ }
        }
        if (!cam) throw new Error('No se pudo conectar a la cámara vía ONVIF para ejecutar la acción');

        let relays: any[] = [];
        try { relays = await call<any[]>(callback => cam.getRelayOutputs(callback)); } catch (e) { /* ignore */ }

        if (relays.length > 0) {
            // If evidence is provided, use the exact token, else try all relays
            const tokenToUse = evidence?.evidence?.token as string | undefined;
            let successCount = 0;
            
            for (const relay of relays) {
                const token = relay.token || relay.$.token;
                if (tokenToUse && token !== tokenToUse) continue;
                
                const logicalState = state ? 'active' : 'inactive';
                try {
                    await call<void>(callback => cam.setRelayOutputState({ RelayOutputToken: token, LogicalState: logicalState }, callback));
                    successCount++;
                } catch (e) { /* ignore */ }
            }
            if (successCount === 0) throw new Error('Se encontraron relevadores pero ninguno aceptó el comando');
        } else {
            throw new Error(`La cámara no expone relevadores (RelayOutputs) vía ONVIF para encender/apagar la ${action === 'light' ? 'luz' : 'sirena'}.`);
        }
    }

    async startPreview(_input: CameraConnectionInput) {
        return { sessionId: randomUUID() };
    }
}
