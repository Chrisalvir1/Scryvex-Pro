import type { CameraAdapter, CameraConnectionInput, CameraDiscoveryResult, CameraCapabilities, ConnectionTestResult, StreamProfile } from '../camera-adapter';
import { emptyCapabilities } from '../camera-adapter';

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
        try {
            const onvif = await import('onvif');
            const cam = await new Promise<any>((resolve, reject) => {
                let instance: any;
                instance = new (onvif as any).Cam({
                    hostname: input.ip,
                    port: input.onvif_port ?? input.port,
                    username: input.username,
                    password: input.password,
                }, (error: Error) => error ? reject(error) : resolve(instance));
            });

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
                try { streamUri = (await call<any>(callback => cam.getStreamUri({ protocol: 'RTSP', profileToken: token }, callback)))?.uri; } catch { /* a profile may not expose RTSP */ }
                try { snapshotUri = (await call<any>(callback => cam.getSnapshotUri({ profileToken: token }, callback)))?.uri; } catch { /* snapshots are optional */ }
                const video = profile?.videoEncoderConfiguration ?? profile?.VideoEncoderConfiguration;
                const audio = profile?.audioEncoderConfiguration ?? profile?.AudioEncoderConfiguration;
                const codec = video?.encoding ?? video?.Encoding;
                const audioCodec = audio?.encoding ?? audio?.Encoding;
                const sampleRate = audio?.sampleRate ?? audio?.SampleRate;
                streamProfiles.push({
                    id: token ?? `onvif-${index}`,
                    name: profile?.name ?? profile?.Name,
                    codec: typeof codec === 'string' ? codec.toUpperCase() : undefined,
                    width: video?.resolution?.width ?? video?.Resolution?.Width,
                    height: video?.resolution?.height ?? video?.Resolution?.Height,
                    fps: video?.rateControl?.frameRateLimit ?? video?.RateControl?.FrameRateLimit,
                    bitrate: video?.rateControl?.bitrateLimit ?? video?.RateControl?.BitrateLimit,
                    streamUri,
                    snapshotUri,
                });
                if (typeof audioCodec === 'string' && !capabilities.audio.codecs.includes(audioCodec.toUpperCase())) capabilities.audio.codecs.push(audioCodec.toUpperCase());
                if (typeof sampleRate === 'number' && !capabilities.audio.sampleRates.includes(sampleRate)) capabilities.audio.sampleRates.push(sampleRate);
            }

            const ptz = !!(onvifCapabilities?.PTZ ?? onvifCapabilities?.ptz);
            const events = !!(onvifCapabilities?.Events ?? onvifCapabilities?.events);
            const audioInput = includesCapability(onvifCapabilities, ['audiosource', 'audioinput']);
            const audioOutput = includesCapability(onvifCapabilities, ['audiooutput', 'audiodestination']);
            const relayOrAuxiliary = includesCapability(onvifCapabilities, ['relayoutput', 'auxiliarycommands']);
            const advertisedLight = includesCapability([onvifCapabilities, services], ['light', 'floodlight', 'illuminator', 'spotlight', 'lamp']);
            const advertisedSiren = includesCapability([onvifCapabilities, services], ['siren', 'alarm', 'audioalarm']);
            const detectedEntities = [
                ...(ptz ? ['ptz'] : []), ...(events ? ['motion_events'] : []), ...(audioInput ? ['microphone'] : []),
                ...(audioOutput ? ['speaker'] : []), ...(advertisedLight ? ['light'] : []), ...(advertisedSiren ? ['siren'] : []),
            ];

            capabilities.discoveryStatus = 'online';
            capabilities.lastCheckedAt = new Date().toISOString();
            capabilities.manufacturer = information?.Manufacturer ?? information?.manufacturer;
            capabilities.model = information?.Model ?? information?.model;
            capabilities.firmware = information?.FirmwareVersion ?? information?.firmwareVersion;
            capabilities.serialNumber = information?.SerialNumber ?? information?.serialNumber;
            capabilities.detectedEntities = detectedEntities;
            capabilities.video.profiles = streamProfiles;
            capabilities.video.supportsH264 = streamProfiles.some(profile => profile.codec === 'H264' || profile.codec === 'H.264');
            capabilities.video.supportsH265 = streamProfiles.some(profile => profile.codec === 'H265' || profile.codec === 'H.265' || profile.codec === 'HEVC');
            capabilities.video.selectedProfileId = streamProfiles.find(profile => !!profile.streamUri)?.id ?? streamProfiles[0]?.id;
            capabilities.audio.available = capabilities.audio.codecs.length > 0;
            capabilities.audio.input = audioInput;
            capabilities.audio.output = audioOutput;
            capabilities.controls.microphone = audioInput;
            capabilities.controls.speaker = audioOutput;
            capabilities.controls.twoWayAudio = audioInput && audioOutput;
            capabilities.controls.ptz = ptz;
            capabilities.controls.motionEvents = events;
            // ONVIF exposes relays/auxiliary commands but does not semantically
            // label them as a light or siren. Preserve that fact without guessing.
            capabilities.controls.light = advertisedLight;
            capabilities.controls.lightControl = advertisedLight && relayOrAuxiliary;
            capabilities.controls.siren = advertisedSiren;
            capabilities.controls.sirenControl = advertisedSiren && relayOrAuxiliary;
            capabilities.preview.snapshot = streamProfiles.some(profile => !!profile.snapshotUri);
            capabilities.preview.rtsp = streamProfiles.some(profile => !!profile.streamUri);
            return { capabilities, streamProfiles };
        } catch (error) {
            capabilities.discoveryStatus = /unauthorized|authentication|not authorized|401/i.test(error instanceof Error ? error.message : String(error)) ? 'authentication_failed' : 'error';
            capabilities.lastCheckedAt = new Date().toISOString();
            throw Object.assign(new Error(error instanceof Error ? error.message : String(error)), { capabilities });
        }
    }

    async getCapabilities(input: CameraConnectionInput): Promise<CameraCapabilities> { return (await this.discover(input)).capabilities; }
    async testConnection(input: CameraConnectionInput): Promise<ConnectionTestResult> {
        try { const result = await this.discover(input); return { success: true, status: result.capabilities.discoveryStatus }; }
        catch (error) { return { success: false, status: (error as { capabilities?: CameraCapabilities }).capabilities?.discoveryStatus ?? 'error', message: error instanceof Error ? error.message : String(error) }; }
    }
}
