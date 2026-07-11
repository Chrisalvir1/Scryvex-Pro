import https from 'node:https';
import http from 'node:http';
import { ProbedMediaSource } from './media-source.js';
import { MediaSourceSelector } from './media-selector.js';
import { classifyMediaError } from '../cameras/camera-adapter.js';
import { MediaOperationError } from './media-source.js';

/** TTL per codec in ms */
const CODEC_TTL: Record<string, number> = {
    ONVIF_SNAPSHOT: 750,
    H264:           1000,
    H265:           1500,
    DEFAULT:        1200,
};

interface CacheEntry {
    jpeg: Buffer;
    expiresAt: number;
    profileId: string;
    codec: string;
    width?: number;
    height?: number;
}

interface InflightEntry {
    promise: Promise<Buffer>;
}

/**
 * Single-flight snapshot cache per device.
 * Only one FFmpeg process runs per camera at a time.
 * Entries expire per their codec TTL and are served from cache within TTL.
 */
export class SnapshotFrameCache {
    private cache = new Map<string, CacheEntry>();
    private inflight = new Map<string, InflightEntry>();

    constructor(
        private readonly selector: MediaSourceSelector,
        private readonly ffmpegRunner: import('./media-process-runner.js').IMediaProcessRunner,
        private readonly sessionManager: import('./media-session-manager.js').MediaSourceSessionManager,
    ) {}

    /**
     * Returns a JPEG buffer for the given device.
     * Uses ONVIF snapshotUri if available; otherwise uses FFmpeg.
     * Only one request per device runs at a time (single-flight).
     */
    async getFrame(
        deviceId: string,
        probedSources: ProbedMediaSource[],
        signal?: AbortSignal,
    ): Promise<{ jpeg: Buffer; profileId: string; codec: string; ttlMs: number; source: 'onvif_snapshot' | 'ffmpeg' }> {
        const cacheKey = deviceId;
        const now = Date.now();

        // Serve from cache if still valid
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            const ttlMs = this.getTtl(cached.codec);
            return { jpeg: cached.jpeg, profileId: cached.profileId, codec: cached.codec, ttlMs, source: 'ffmpeg' };
        }

        // Single-flight: if already in progress, wait for it
        const existing = this.inflight.get(cacheKey);
        if (existing) {
            const jpeg = await existing.promise;
            const entry = this.cache.get(cacheKey);
            const ttlMs = entry ? this.getTtl(entry.codec) : (CODEC_TTL['DEFAULT'] ?? 1200);
            return { jpeg, profileId: entry?.profileId ?? '', codec: entry?.codec ?? '', ttlMs, source: 'ffmpeg' };
        }

        // Select profile
        const bestProfile = this.selector.selectForPreview(probedSources);
        if (!bestProfile) {
            throw new Error('No hay perfiles validados disponibles para snapshot');
        }

        const sourcePs = probedSources.find(ps => ps.profile.id === bestProfile.id);
        if (!sourcePs) throw new Error('Perfil seleccionado no tiene descriptor');

        // Check for ONVIF snapshotUri first
        const snapshotUri = (sourcePs.descriptor as any).snapshotUri as string | undefined;

        const promise = snapshotUri
            ? this.fetchOnvifSnapshot(snapshotUri, signal)
            : this.fetchFfmpegFrame(deviceId, sourcePs, signal);

        this.inflight.set(cacheKey, { promise });

        try {
            const jpeg = await promise;
            this.validateJpeg(jpeg);

            const codec = snapshotUri ? 'ONVIF_SNAPSHOT' : (bestProfile.normalizedCodec ?? 'DEFAULT');
            const ttlMs = this.getTtl(codec);

            this.cache.set(cacheKey, {
                jpeg,
                expiresAt: now + ttlMs,
                profileId: bestProfile.id,
                codec,
                width: bestProfile.width,
                height: bestProfile.height,
            });

            return {
                jpeg,
                profileId: bestProfile.id,
                codec,
                ttlMs,
                source: snapshotUri ? 'onvif_snapshot' : 'ffmpeg',
            };
        } finally {
            this.inflight.delete(cacheKey);
        }
    }

    private getTtl(codec: string): number {
        return CODEC_TTL[codec] ?? (CODEC_TTL['DEFAULT'] ?? 1200);
    }

    private validateJpeg(buf: Buffer): void {
        const soiValid = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
        const eoiValid = buf.length > 3 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
        if (!soiValid || !eoiValid) {
            throw new Error(`Buffer no es un JPEG válido (len=${buf.length}, soi=${soiValid}, eoi=${eoiValid})`);
        }
    }

    private fetchOnvifSnapshot(uri: string, signal?: AbortSignal): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const mod = uri.startsWith('https') ? https : http;
            const req = mod.get(uri, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`ONVIF snapshot HTTP ${res.statusCode}`));
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            });
            req.on('error', reject);
            signal?.addEventListener('abort', () => {
                req.destroy();
                reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
            }, { once: true });
        });
    }

    private async fetchFfmpegFrame(
        deviceId: string,
        sourcePs: ProbedMediaSource,
        signal?: AbortSignal,
    ): Promise<Buffer> {
        const { id: sourceId, pluginId } = sourcePs.descriptor;

        return this.sessionManager.executeWithSourceRetry(deviceId, sourceId, async (input, sig) => {
            // For HEVC, scale to 1280; for H264, keep native up to 1280px wide
            const isHevc = (sourcePs.profile.normalizedCodec ?? '').toUpperCase() === 'H265';
            const scaleFilter = isHevc ? 'scale=1280:-2' : 'scale=min(1280\\,iw):-2';

            const args = [
                '-hide_banner', '-loglevel', 'error',
                ...input.ffmpegInputArguments,
                '-map', '0:v:0',
                '-an',
                '-frames:v', '1',
                '-vf', scaleFilter,
                '-c:v', 'mjpeg',
                '-q:v', '5',
                '-f', 'image2',
                'pipe:1',
            ];

            const result = await this.ffmpegRunner.run({
                command: 'ffmpeg',
                args,
                signal: sig,
                timeoutMs: 15_000,
                inputStream: input.inputStream,
                inputBuffer: input.inputBuffer,
            });

            if (result.exitCode !== 0 || result.stdoutBytes === 0) {
                const category = classifyMediaError(result.stderr, result.exitCode);
                throw new MediaOperationError(
                    `FFmpeg falló (exit ${result.exitCode}): ${result.stderr.slice(0, 256)}`,
                    category,
                );
            }

            return result.stdout;
        }, pluginId, signal);
    }

    /** Invalidate cache for a specific device (e.g. after re-probe) */
    invalidate(deviceId: string): void {
        this.cache.delete(deviceId);
        // Note: inflight cannot be cancelled, it will complete naturally
    }
}
