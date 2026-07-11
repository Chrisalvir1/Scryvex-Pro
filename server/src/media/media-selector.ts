import { StreamProfile } from '../cameras/camera-adapter';
import { ProbedMediaSource } from './media-source';

/**
 * Codec priority for preview selection.
 * Lower number = higher priority.
 */
function codecPreviewPriority(profile: StreamProfile): number {
    const nc = profile.normalizedCodec?.toUpperCase() ?? '';
    if (nc === 'H264') return 0;
    if (nc === 'H265') return 1;
    if (nc === 'MJPEG') return 2;
    return 99;
}

/**
 * Score a profile for preview use. Lower score = better choice.
 * Preference: H264 ≤720p > H264 ≤1080p > HEVC ≤720p > HEVC ≤1080p > anything else
 */
function previewScore(p: StreamProfile): number {
    const res = (p.width ?? 0) * (p.height ?? 0);
    const is720p = (p.width ?? 0) <= 1280 && (p.height ?? 0) <= 720;
    const is1080p = (p.width ?? 0) <= 1920 && (p.height ?? 0) <= 1080;
    const codecPrio = codecPreviewPriority(p);

    // Tier 0: H264 ≤720p — best for preview, minimal decode cost
    if (codecPrio === 0 && is720p) return 0 + res;
    // Tier 1: H264 ≤1080p
    if (codecPrio === 0 && is1080p) return 1_000_000 + res;
    // Tier 2: H264 any resolution
    if (codecPrio === 0) return 2_000_000 + res;
    // Tier 3: HEVC ≤720p
    if (codecPrio === 1 && is720p) return 3_000_000 + res;
    // Tier 4: HEVC ≤1080p
    if (codecPrio === 1 && is1080p) return 4_000_000 + res;
    // Tier 5: HEVC any
    if (codecPrio === 1) return 5_000_000 + res;
    // Tier 6: MJPEG and other
    return 6_000_000 + codecPrio * 1_000_000 + res;
}

export class MediaSourceSelector {

    private getValidProfiles(probedSources: ProbedMediaSource[]): ProbedMediaSource[] {
        return probedSources.filter(ps => ps.profile.validationStatus === 'valid');
    }

    /**
     * Select best substream for preview.
     * Priority: H264 ≤720p > H264 ≤1080p > H264 any > HEVC ≤720p > HEVC ≤1080p > HEVC any
     * Never selects by profile token name.
     */
    selectForPreview(probedSources: ProbedMediaSource[]): StreamProfile | undefined {
        const valid = this.getValidProfiles(probedSources);
        if (valid.length === 0) return undefined;

        const sorted = [...valid].sort((a, b) => previewScore(a.profile) - previewScore(b.profile));
        return sorted[0]!.profile;
    }

    /**
     * Select best source for a single snapshot frame.
     * Same priority as preview — prefer substream to avoid hammering the main stream.
     */
    selectForSnapshot(probedSources: ProbedMediaSource[]): StreamProfile | undefined {
        return this.selectForPreview(probedSources);
    }

    selectForRecording(probedSources: ProbedMediaSource[]): StreamProfile | undefined {
        // Recording prefers the highest-quality validated profile
        const valid = this.getValidProfiles(probedSources);
        if (valid.length === 0) return undefined;
        return [...valid].sort((a, b) => {
            const resA = (a.profile.width ?? 0) * (a.profile.height ?? 0);
            const resB = (b.profile.width ?? 0) * (b.profile.height ?? 0);
            return resB - resA;
        })[0]!.profile;
    }

    selectForAnalytics(probedSources: ProbedMediaSource[]): StreamProfile | undefined {
        // Analytics same as preview (low-res, low-cost)
        return this.selectForPreview(probedSources);
    }

    selectForHomeKitH264(probedSources: ProbedMediaSource[]): StreamProfile | undefined {
        const valid = this.getValidProfiles(probedSources);
        return valid.find(ps => ps.profile.canRemuxVideo && ps.profile.normalizedCodec === 'H264')?.profile;
    }

    selectForHomeKitH265(probedSources: ProbedMediaSource[]): StreamProfile | undefined {
        const valid = this.getValidProfiles(probedSources);
        return valid.find(ps => ps.profile.canRemuxVideo && ps.profile.normalizedCodec === 'H265')?.profile;
    }
}
