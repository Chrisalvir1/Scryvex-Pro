import { CameraMediaProvider, MediaSourceDescriptor, DeviceControlProvider } from '../../media/media-source';
import { CapabilityEvidence } from '../../capabilities/capability-evidence';
import { ResolvedMediaInput, MediaInputResolver } from '../../media/media-resolvers';

// This is a dummy interface representing the legacy Scrypted plugin model
interface LegacyPluginHost {
    getDevice(id: string): any;
}

export class LegacyPluginMediaProviderAdapter implements CameraMediaProvider, DeviceControlProvider {
    constructor(private host: LegacyPluginHost, private pluginId: string) {}

    async getMediaSources(deviceId: string, signal?: AbortSignal): Promise<MediaSourceDescriptor[]> {
        const device = this.host.getDevice(deviceId);
        
        // Infer capabilities from standard interfaces
        const sources: MediaSourceDescriptor[] = [];
        
        if (device.getVideoStream) {
            sources.push({
                id: 'video',
                sourceType: 'plugin_buffer', // Represented as a plugin internally
                transport: 'buffer',
                deviceId,
                pluginId: this.pluginId,
                expirationMs: Date.now() + 60000 
            });
        }
        
        return sources;
    }

    async listCapabilities(deviceId: string, signal?: AbortSignal): Promise<CapabilityEvidence[]> {
        const device = this.host.getDevice(deviceId);
        const evidence: CapabilityEvidence[] = [];

        if (device.turnOn) {
            evidence.push({
                entity: 'light',
                detected: true,
                verified: true,
                readable: true,
                controllable: true,
                source: 'plugin',
                confidence: 'verified',
                operation: 'turnOn'
            });
        }

        return evidence;
    }
}

export class PluginMediaObjectResolver implements MediaInputResolver {
    constructor(private host: LegacyPluginHost) {}

    canResolve(descriptor: MediaSourceDescriptor): boolean {
        return descriptor.sourceType === 'plugin_buffer' || descriptor.sourceType === 'plugin_pipe';
    }

    async resolve(descriptor: MediaSourceDescriptor): Promise<ResolvedMediaInput> {
        const device = this.host.getDevice(descriptor.deviceId);
        
        // This simulates requesting the actual media object from the legacy plugin
        const media = await device.getVideoStream();
        
        // E.g. ffmpeg -f mjpeg -i pipe:0
        return {
            kind: 'pipe',
            ffmpegInputArguments: ['-f', 'mjpeg', '-i', 'pipe:0'], 
            probeStrategy: 'buffer_magic',
            redactedDescription: `PluginMedia[${descriptor.pluginId}]`
        };
    }
}
