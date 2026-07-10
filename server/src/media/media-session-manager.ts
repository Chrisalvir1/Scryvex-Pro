import { MediaSourceDescriptor, CameraMediaProvider } from './media-source';
import { ResolvedMediaInput, MediaInputResolverRegistry } from './media-resolvers';

export class MediaSourceSessionManager {
    private activeSessions = new Map<string, { descriptor: MediaSourceDescriptor, expiresAt: number }>();
    private refreshPromises = new Map<string, Promise<MediaSourceDescriptor>>();

    constructor(
        private providerLookup: (pluginId: string | undefined, deviceId: string) => CameraMediaProvider,
        private registry: MediaInputResolverRegistry
    ) {}

    async getResolvedInput(
        deviceId: string, 
        sourceId: string, 
        pluginId?: string,
        signal?: AbortSignal
    ): Promise<ResolvedMediaInput> {
        let descriptor = await this.getValidDescriptor(deviceId, sourceId, pluginId, signal);
        
        try {
            return await this.registry.resolve(descriptor);
        } catch (e: any) {
            // Attempt a single refresh if 401/403 or unresolved
            if (e.message.includes('401') || e.message.includes('403')) {
                descriptor = await this.forceRefresh(deviceId, sourceId, pluginId, signal);
                return await this.registry.resolve(descriptor);
            }
            throw e;
        }
    }

    private async getValidDescriptor(
        deviceId: string, 
        sourceId: string, 
        pluginId?: string,
        signal?: AbortSignal
    ): Promise<MediaSourceDescriptor> {
        const sessionKey = `${deviceId}:${sourceId}`;
        const session = this.activeSessions.get(sessionKey);

        if (session && session.expiresAt > Date.now() + 30000) {
            return session.descriptor;
        }

        return this.forceRefresh(deviceId, sourceId, pluginId, signal);
    }

    private async forceRefresh(
        deviceId: string, 
        sourceId: string, 
        pluginId?: string,
        signal?: AbortSignal
    ): Promise<MediaSourceDescriptor> {
        const sessionKey = `${deviceId}:${sourceId}`;
        
        if (this.refreshPromises.has(sessionKey)) {
            return this.refreshPromises.get(sessionKey)!;
        }

        const promise = (async () => {
            const provider = this.providerLookup(pluginId, deviceId);
            if (!provider.refreshMediaSource) {
                // Fallback to getMediaSources
                const sources = await provider.getMediaSources(deviceId, signal);
                const source = sources.find(s => s.id === sourceId);
                if (!source) throw new Error('Source not found after refresh');
                return source;
            }
            return await provider.refreshMediaSource(deviceId, sourceId, signal);
        })();

        this.refreshPromises.set(sessionKey, promise);

        try {
            const newDescriptor = await promise;
            this.activeSessions.set(sessionKey, {
                descriptor: newDescriptor,
                expiresAt: newDescriptor.expirationMs || (Date.now() + 24 * 60 * 60 * 1000)
            });
            return newDescriptor;
        } finally {
            this.refreshPromises.delete(sessionKey);
        }
    }
}
