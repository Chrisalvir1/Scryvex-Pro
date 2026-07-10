import { StreamProfile } from '../cameras/camera-adapter';

export class MediaSourceSelector {
    selectForPreview(profiles: StreamProfile[]): StreamProfile | undefined {
        // Find highest resolution sub-stream, or a robust medium resolution stream
        const sorted = [...profiles].sort((a, b) => {
            const resA = (a.width || 0) * (a.height || 0);
            const resB = (b.width || 0) * (b.height || 0);
            return resA - resB; 
        });
        
        // Return a profile that is <= 1080p if possible, else the smallest
        const target = sorted.find(p => (p.width || 0) <= 1920 && (p.height || 0) <= 1080);
        return target || sorted[0];
    }

    selectForHomeKitH264(profiles: StreamProfile[]): StreamProfile | undefined {
        return profiles.find(p => p.canRemuxVideo && p.codec === 'h264');
    }

    selectForHomeKitH265(profiles: StreamProfile[]): StreamProfile | undefined {
        return profiles.find(p => p.canRemuxVideo && p.codec === 'h265');
    }
}
