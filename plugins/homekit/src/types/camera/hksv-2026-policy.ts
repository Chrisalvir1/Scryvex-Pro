import type { ResponseMediaStreamOptions } from '@scrypted/sdk';

export type Hksv2026Tier = '4k' | '2k' | '1080p' | 'unsupported';

export interface Hksv2026RemuxPlan {
    eligible: boolean;
    codec?: 'h264' | 'h265';
    tier: Hksv2026Tier;
    streamId?: string;
    reason: string;
}

function normalizeCodec(codec?: string) {
    return codec?.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Selects only a camera-native H.264/HEVC profile. This deliberately never
 * requests an alternate codec, resize, or audio/video transcode.
 */
export function selectHksv2026RemuxProfile(
    streams: ResponseMediaStreamOptions[],
    codecPreference: 'auto' | 'h264' | 'h265' = 'auto',
): Hksv2026RemuxPlan {
    const candidates = streams
        .filter(stream => stream.video?.width && stream.video?.height)
        .map(stream => ({ stream, codec: normalizeCodec(stream.video?.codec) }))
        .filter(({ codec }) => codec === 'h264' || codec === 'avc' || codec === 'h265' || codec === 'hevc')
        .filter(({ codec }) => codecPreference === 'auto'
            || (codecPreference === 'h264' && (codec === 'h264' || codec === 'avc'))
            || (codecPreference === 'h265' && (codec === 'h265' || codec === 'hevc')))
        .sort((a, b) => (b.stream.video!.width! * b.stream.video!.height!) - (a.stream.video!.width! * a.stream.video!.height!));

    const selected = candidates[0];
    if (!selected)
        return { eligible: false, tier: 'unsupported', reason: `La cámara no anunció un perfil ${codecPreference === 'auto' ? 'H.264 o H.265' : codecPreference.toUpperCase()} nativo.` };

    const { width, height } = selected.stream.video!;
    const pixels = width! * height!;
    const tier: Hksv2026Tier = pixels >= 7_000_000 ? '4k' : pixels >= 3_000_000 ? '2k' : pixels >= 1_000_000 ? '1080p' : 'unsupported';
    if (tier === 'unsupported')
        return { eligible: false, tier, reason: 'El perfil nativo es inferior a 1080p; no se anuncia como tier HKSV 2026.' };

    const codec = selected.codec === 'h265' || selected.codec === 'hevc' ? 'h265' : 'h264';
    return {
        eligible: true,
        codec,
        tier,
        streamId: selected.stream.id,
        reason: `${codec.toUpperCase()} ${tier.toUpperCase()} nativo detectado. Elegible solo para remux; no se transcodifica.`,
    };
}
