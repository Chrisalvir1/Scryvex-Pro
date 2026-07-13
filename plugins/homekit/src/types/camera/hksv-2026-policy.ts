import type { MediaStreamOptions, ResponseMediaStreamOptions } from '@scrypted/sdk';

export type Hksv2026Tier = '4k' | '2k' | '1080p' | 'unsupported';

export interface Hksv2026RemuxPlan {
    eligible: boolean;
    codec?: 'h264' | 'h265';
    tier: Hksv2026Tier;
    streamId?: string;
    reason: string;
}

export interface Hksv2026AudioPlan {
    eligible: boolean;
    codec?: 'opus';
    sampleRate?: number;
    reason: string;
}

export interface Hksv2026NativeRemuxPlan {
    eligible: boolean;
    video: Hksv2026RemuxPlan;
    audio: Hksv2026AudioPlan;
    reason: string;
}

function normalizeCodec(codec?: string) {
    return codec?.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The stream description does not expose the microphone capture rate separately
 * from the transport rate. 48 kHz Opus is therefore transport-compatible, but
 * must not be presented as proof of the 16/24 kHz capture requirement in the
 * Apple developer preview.
 */
export function selectHksv2026OpusAudio(streams: ResponseMediaStreamOptions[]): Hksv2026AudioPlan {
    const candidates = streams
        .filter(stream => normalizeCodec(stream.audio?.codec) === 'opus')
        .sort((a, b) => (b.audio?.sampleRate || 0) - (a.audio?.sampleRate || 0));
    const selected = candidates[0];
    if (!selected)
        return { eligible: false, reason: 'La cámara no anunció audio Opus nativo; no se convertirá AAC, PCM ni G.711.' };

    const sampleRate = selected.audio?.sampleRate;
    if (![16000, 24000, 48000].includes(sampleRate || 0))
        return { eligible: false, reason: `Opus fue anunciado a ${sampleRate || 'una frecuencia desconocida'} Hz; se requiere 16, 24 o 48 kHz para remux.` };

    const captureEvidence = sampleRate === 16000 || sampleRate === 24000
        ? 'La frecuencia anunciada coincide con el requisito de captura 16/24 kHz.'
        : 'Opus 48 kHz es válido para transporte; confirme en la cámara que la captura es 16/24 kHz.';
    return {
        eligible: true,
        codec: 'opus',
        sampleRate,
        reason: `Opus nativo ${sampleRate / 1000} kHz detectado. ${captureEvidence} Solo remux/repacketización RTP.`,
    };
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

/** Selects the strict profile used by the standard HAP controller: H.264 + Opus only. */
export function selectHksv2026NativeRemuxPlan(streams: ResponseMediaStreamOptions[]): Hksv2026NativeRemuxPlan {
    // Audio and video must be available from one source. Combining independent
    // stream entries could otherwise make a camera appear remux-capable when no
    // single RTSP source actually carries both tracks.
    const combined = streams.filter(stream => {
        const videoCodec = normalizeCodec(stream.video?.codec);
        return (videoCodec === 'h264' || videoCodec === 'avc')
            && normalizeCodec(stream.audio?.codec) === 'opus';
    });
    const video = selectHksv2026RemuxProfile(combined, 'h264');
    const audio = selectHksv2026OpusAudio(combined);
    return {
        eligible: video.eligible && audio.eligible,
        video,
        audio,
        reason: video.eligible && audio.eligible
            ? 'H.264 y Opus nativos disponibles para el modo estricto; no se permite transcodificación.'
            : 'El modo estricto no se habilita: un único stream debe aportar H.264 y Opus nativos.',
    };
}

/**
 * Checks the stream that the runtime actually delivered, rather than trusting
 * the capability list. A strict session must fail closed if a resize, codec
 * substitution, or non-RTSP container would require a conversion stage.
 */
export function assertHksv2026StrictRemuxStream(stream: MediaStreamOptions, requested: {
    width: number;
    height: number;
}): void {
    const videoCodec = normalizeCodec(stream.video?.codec);
    const audioCodec = normalizeCodec(stream.audio?.codec);
    if (videoCodec !== 'h264' && videoCodec !== 'avc')
        throw new Error(`Native Remux requires camera-native H.264; runtime delivered ${stream.video?.codec || 'an unknown codec'}.`);
    if (audioCodec !== 'opus')
        throw new Error(`Native Remux requires camera-native Opus; runtime delivered ${stream.audio?.codec || 'no audio'}.`);
    if (stream.container !== 'rtsp')
        throw new Error(`Native Remux requires an RTSP packet source; runtime delivered ${stream.container || 'an unknown container'}.`);
    if (stream.video?.width !== requested.width || stream.video?.height !== requested.height)
        throw new Error(`Native Remux refuses resizing: HomeKit requested ${requested.width}x${requested.height}, runtime delivered ${stream.video?.width || '?'}x${stream.video?.height || '?'}.`);
}
