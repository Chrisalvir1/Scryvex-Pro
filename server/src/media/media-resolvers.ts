import { MediaSourceDescriptor } from './media-source';

export interface ResolvedMediaInput {
    kind: 'rtsp' | 'http' | 'hls' | 'webrtc' | 'pipe' | 'buffer';
    ffmpegInputArguments: string[];
    probeStrategy: 'ffprobe' | 'webrtc_analyzer' | 'buffer_magic';
    redactedDescription: string;
}

export interface MediaInputResolver {
    canResolve(descriptor: MediaSourceDescriptor): boolean;
    resolve(descriptor: MediaSourceDescriptor): Promise<ResolvedMediaInput>;
}

export class MediaInputResolverRegistry {
    private resolvers: MediaInputResolver[] = [];

    register(resolver: MediaInputResolver) {
        this.resolvers.push(resolver);
    }

    async resolve(descriptor: MediaSourceDescriptor): Promise<ResolvedMediaInput> {
        for (const resolver of this.resolvers) {
            if (resolver.canResolve(descriptor)) {
                return await resolver.resolve(descriptor);
            }
        }
        throw new Error(`No resolver found for source type: ${descriptor.sourceType}`);
    }
}

// Basic RTPS resolver
export class RtspInputResolver implements MediaInputResolver {
    canResolve(descriptor: MediaSourceDescriptor): boolean {
        return descriptor.sourceType === 'rtsp' || descriptor.sourceType === 'onvif';
    }

    async resolve(descriptor: MediaSourceDescriptor): Promise<ResolvedMediaInput> {
        if (!descriptor.uriRef) {
            throw new Error('RTSP source requires uriRef');
        }
        return {
            kind: 'rtsp',
            ffmpegInputArguments: ['-rtsp_transport', descriptor.transport === 'tcp' ? 'tcp' : 'udp', '-i', descriptor.uriRef],
            probeStrategy: 'ffprobe',
            redactedDescription: descriptor.uriRef.replace(/:\/\/[^@]+@/, '://***:***@')
        };
    }
}
