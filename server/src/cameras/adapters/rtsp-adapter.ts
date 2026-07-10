import { CameraMediaProvider, MediaSourceDescriptor, DeviceControlProvider } from '../../media/media-source';
import { CapabilityEvidence } from '../../capabilities/capability-evidence';

export class RtspAdapter implements CameraMediaProvider, DeviceControlProvider {
    readonly protocol = 'RTSP' as const;

    // This would typically read from DB or config
    private mockDatabaseResolver(deviceId: string) {
        return {
            rtsp_url: `rtsp://camera-${deviceId}.local/stream`,
        };
    }

    async getMediaSources(deviceId: string, signal?: AbortSignal): Promise<MediaSourceDescriptor[]> {
        const config = this.mockDatabaseResolver(deviceId);
        if (!config.rtsp_url) {
            throw new Error(`RTSP camera ${deviceId} has no url configured`);
        }

        return [
            {
                id: 'primary',
                sourceType: 'rtsp',
                transport: 'tcp', // Can be discovered or configured
                deviceId,
                uriRef: config.rtsp_url,
                credentialRef: `cred_rtsp_${deviceId}`
            }
        ];
    }

    async listCapabilities(deviceId: string, signal?: AbortSignal): Promise<CapabilityEvidence[]> {
        // RTSP implies nothing but stream potential, which is handled centrally by MediaProbe.
        // It provides NO other direct controls.
        return [];
    }
}
