import { randomUUID } from 'node:crypto';
import type { CameraAdapter, CameraCapabilities, CameraConnectionInput, CameraDiscoveryResult, ConnectionTestResult, StreamProfile } from '../camera-adapter';
import { cameraStreamUrl, emptyCapabilities, redactCameraSecrets } from '../camera-adapter';
import { probeMediaStream } from '../../media/media-probe';
import { evaluateHomeKitCompatibility } from '../../hksv/compatibility';

export class RtspAdapter implements CameraAdapter {
    readonly protocol = 'RTSP' as const;

    async discover(input: CameraConnectionInput): Promise<CameraDiscoveryResult> {
        const base = emptyCapabilities('rtsp');
        const profiles: StreamProfile[] = [];
        
        try {
            if (!input.rtsp_url) throw new Error('La cámara RTSP no tiene rtsp_url configurada');
            
            const safeUrl = cameraStreamUrl(input, input.rtsp_url);
            const probeResult = await probeMediaStream(safeUrl, 10000);
            
            if (!probeResult.success || !probeResult.rawInfo?.hasVideo) {
                const message = probeResult.stderrSummary || 'ffprobe no pudo analizar el stream RTSP de forma exitosa.';
                throw new Error(`RTSP Error [${probeResult.errorCategory || 'unknown'}]: ${message}`);
            }

            const raw = probeResult.rawInfo;
            
            // Build the primary profile from the raw info
            const primaryProfile: StreamProfile = {
                id: 'rtsp-0',
                name: 'Principal',
                codec: raw.video?.normalizedCodec,
                rawCodec: raw.video?.rawCodec,
                normalizedCodec: raw.video?.normalizedCodec,
                displayCodec: raw.video?.displayCodec,
                profile: raw.video?.profile,
                level: raw.video?.level,
                width: raw.video?.width,
                height: raw.video?.height,
                fps: raw.video?.fps,
                bitrate: raw.video?.bitrate,
                pixFmt: raw.video?.pixFmt,
                colorSpace: raw.video?.colorSpace,
                streamUri: input.rtsp_url, // Original raw URI, without injected creds (we inject at runtime)
                
                audioCodec: raw.audio?.normalizedCodec,
                audioSampleRate: raw.audio?.sampleRate,
                audioChannels: raw.audio?.channels,
                audioBitrate: raw.audio?.bitrate,
                
                validationStatus: 'valid',
                validationTransport: probeResult.transportUsed,
                validationDurationMs: probeResult.durationMs,
            };
            
            profiles.push(primaryProfile);

            // Populate capabilities based on the single RTSP profile
            base.discoveryStatus = 'online';
            base.lastCheckedAt = new Date().toISOString();
            base.video.profiles = profiles;
            base.video.supportsH264 = profiles.some(p => p.normalizedCodec === 'H264');
            base.video.supportsH265 = profiles.some(p => p.normalizedCodec === 'H265');
            base.video.selectedProfileId = profiles[0]?.id;
            
            base.preview.rtsp = true;
            base.preview.mjpeg = true;
            base.yolo.available = true;

            // Audio from stream ONLY
            if (raw.hasAudio && raw.audio) {
                base.audio.available = true;
                base.audio.codecs = [raw.audio.normalizedCodec];
                base.audio.sampleRates = [raw.audio.sampleRate];
                
                // Add capability evidence for stream audio
                base.capabilityEvidence?.push({
                    entity: 'stream_audio',
                    detected: true,
                    verified: true,
                    readable: true,
                    controllable: false,
                    source: 'rtsp',
                    confidence: 'verified',
                    evidence: {
                        codec: raw.audio.displayCodec,
                        sampleRate: raw.audio.sampleRate,
                        channels: raw.audio.channels
                    },
                    lastVerifiedAt: new Date().toISOString()
                });
            }

            // Evidence for video
            base.capabilityEvidence?.push({
                entity: 'video',
                detected: true,
                verified: true,
                readable: true,
                controllable: false,
                source: 'rtsp',
                confidence: 'verified',
                evidence: {
                    codec: raw.video?.displayCodec,
                    resolution: `${raw.video?.width}x${raw.video?.height}`,
                    fps: raw.video?.fps
                },
                lastVerifiedAt: new Date().toISOString()
            });

            // Calculate HomeKit Compatibility (even though the router normally does it, it's safe to run here)
            const hkMatrix = evaluateHomeKitCompatibility(input.id || 'temp', profiles);
            base.matter.supportsMatterRemux = hkMatrix.remuxOptions.canRemuxH264 || hkMatrix.remuxOptions.canRemuxH265;
            base.matter.available = true;

            return { capabilities: base, streamProfiles: profiles };

        } catch (error) {
            base.discoveryStatus = 'error';
            base.lastCheckedAt = new Date().toISOString();
            const message = redactCameraSecrets(error instanceof Error ? error.message : String(error));
            throw Object.assign(new Error(message), { capabilities: base });
        }
    }

    async getCapabilities(input: CameraConnectionInput) {
        return (await this.discover(input)).capabilities;
    }

    async testConnection(input: CameraConnectionInput): Promise<ConnectionTestResult> {
        try {
            if (!input.rtsp_url) throw new Error('No URL configured');
            const safeUrl = cameraStreamUrl(input, input.rtsp_url);
            const res = await probeMediaStream(safeUrl, 5000);
            if (!res.success) throw new Error(res.stderrSummary || 'RTSP Probe failed');
            return { success: true, status: 'online' };
        } catch (error) {
            return { success: false, status: 'error', message: error instanceof Error ? error.message : String(error) };
        }
    }

    async startPreview(_input: CameraConnectionInput) {
        return { sessionId: randomUUID() };
    }
}
