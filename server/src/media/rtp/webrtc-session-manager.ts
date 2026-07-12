import { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack, RtpPacket } from 'werift';
import dgram from 'dgram';
import { randomUUID } from 'crypto';
import os from 'os';
import { CameraProbe } from '../../api/camera-probe';
import { PreviewService } from '../preview-service';
import { MediaSourceSessionManager } from '../media-session-manager';
import { CameraService } from '../../api/camera-service';
import { CodecDecisionEngine } from '../codec-decision-engine';

export type WebRTCState =
    | 'idle'
    | 'validating_source'
    | 'codec_check'
    | 'offer_received'
    | 'answer_created'
    | 'ice_candidate_gathering'
    | 'ice_checking'
    | 'ice_connected'
    | 'rtp_receiving'
    | 'first_frame'
    | 'failed'
    | 'closed';

// Ports 50000-50050 are used by Werift for ICE/DTLS (LAN-reachable, host_network:true).
// Ports 51000-51100 are used for FFmpeg→Werift RTP/RTCP local loopback only.
const ICE_PORT_MIN = 50000;
const ICE_PORT_MAX = 50050;
const RTP_PORT_MIN = 51000;
const RTP_PORT_MAX = 51100;

interface Session {
    pc: RTCPeerConnection;
    track: MediaStreamTrack;
    rtpSocket: dgram.Socket;
    rtcpSocket: dgram.Socket;
    rtpPort: number;
    rtcpPort: number;
    ffProcess?: any;
    state: WebRTCState;
    watchdog: NodeJS.Timeout;
    cameraId: string;
    startTime: number;
    codec: string;
}

export class WebRTCSessionManager {
    private sessions = new Map<string, Session>();

    constructor(
        private readonly cameraService: CameraService,
        private readonly previewService: PreviewService,
        private readonly sessionManager: MediaSourceSessionManager
    ) {}

    // ── Logging ──────────────────────────────────────────────────────────────

    private log(sessionId: string, cameraId: string, event: string, details?: Record<string, unknown>) {
        const session = this.sessions.get(sessionId);
        const duration = session ? Date.now() - session.startTime : 0;
        // Sanitize: never log full URLs, passwords, or full IP paths.
        console.log(`[WebRTC][${sessionId.slice(0, 8)}][${event}][${duration}ms]`,
            details ? JSON.stringify(details) : '');
        // Persist to camera_logs (fire-and-forget; errors are non-fatal).
        this.cameraService.recordLog(cameraId, `webrtc.${event}`, {
            sessionId: sessionId.slice(0, 8),
            durationMs: duration,
            ...details,
        }).catch(() => {});
    }

    private transition(sessionId: string, cameraId: string, newState: WebRTCState, details?: Record<string, unknown>) {
        const session = this.sessions.get(sessionId);
        if (session && session.state !== 'closed' && session.state !== 'failed') {
            session.state = newState;
            this.log(sessionId, cameraId, 'state_changed', { state: newState, ...details });
        }
    }

    private setWatchdog(sessionId: string, cameraId: string, ms: number, failureEvent: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            clearTimeout(session.watchdog);
            session.watchdog = setTimeout(() => {
                this.failSession(sessionId, cameraId, failureEvent);
            }, ms);
        }
    }

    // ── Network helpers ───────────────────────────────────────────────────────

    private getLanIpAddresses(): string[] {
        const result: string[] = [];
        for (const nets of Object.values(os.networkInterfaces())) {
            for (const net of nets ?? []) {
                if (net.family === 'IPv4' && !net.internal
                    && !net.address.startsWith('172.30.')
                    && !net.address.startsWith('127.')) {
                    result.push(net.address);
                }
            }
        }
        return result;
    }

    /**
     * Allocates one RTP/RTCP port pair on 127.0.0.1 within [RTP_PORT_MIN, RTP_PORT_MAX].
     * These ports are for FFmpeg→Werift local loopback only, never exposed to ICE.
     */
    private async allocateRtpPair(): Promise<{ rtpSocket: dgram.Socket; rtcpSocket: dgram.Socket; rtpPort: number; rtcpPort: number }> {
        for (let port = RTP_PORT_MIN; port < RTP_PORT_MAX; port += 2) {
            const rtpSocket = dgram.createSocket('udp4');
            const rtcpSocket = dgram.createSocket('udp4');
            try {
                await new Promise<void>((res, rej) => {
                    rtpSocket.once('error', rej);
                    rtpSocket.bind(port, '127.0.0.1', () => { rtpSocket.removeAllListeners('error'); res(); });
                });
                await new Promise<void>((res, rej) => {
                    rtcpSocket.once('error', (e) => { rtpSocket.close(); rej(e); });
                    rtcpSocket.bind(port + 1, '127.0.0.1', () => { rtcpSocket.removeAllListeners('error'); res(); });
                });
                return { rtpSocket, rtcpSocket, rtpPort: port, rtcpPort: port + 1 };
            } catch {
                try { rtpSocket.close(); } catch {}
                try { rtcpSocket.close(); } catch {}
            }
        }
        throw new Error(`No free RTP/RTCP pair in range ${RTP_PORT_MIN}-${RTP_PORT_MAX}`);
    }

    // ── Codec helpers ─────────────────────────────────────────────────────────

    /**
     * Builds the correct RTCRtpCodecParameters for the camera's validated codec.
     * H.264 uses payload type 96; H.265 payload type 100.
     * Never mislabels one as the other, never transcodes.
     */
    private buildCodecParams(normalizedCodec: string): RTCRtpCodecParameters | null {
        if (normalizedCodec === 'H264') {
            return new RTCRtpCodecParameters({
                mimeType: 'video/H264',
                clockRate: 90000,
                payloadType: 96,
                rtcpFeedback: [{ type: 'nack' }, { type: 'nack', parameter: 'pli' }],
            });
        }
        if (normalizedCodec === 'H265') {
            return new RTCRtpCodecParameters({
                mimeType: 'video/H265',
                clockRate: 90000,
                payloadType: 100,
                rtcpFeedback: [{ type: 'nack' }, { type: 'nack', parameter: 'pli' }],
            });
        }
        return null;
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    async createOffer(
        cameraId: string,
        offer: { sdp: string; type: 'offer' | 'pranswer' | 'answer' | 'rollback' },
        cameraProbe: CameraProbe
    ) {
        const sessionId = randomUUID();
        const startTime = Date.now();
        this.log(sessionId, cameraId, 'offer.received', { cameraId });

        // ── Step 1: Validate LAN reachability before any resource allocation ──
        const lanIps = this.getLanIpAddresses();
        if (lanIps.length === 0) {
            this.log(sessionId, cameraId, 'failed', { reason: 'server_candidate_missing' });
            const e: any = new Error('No se encontró IP LAN alcanzable en el host. WebRTC no puede iniciar.');
            e.code = 'ICE_CANDIDATE_UNREACHABLE';
            throw e;
        }

        // ── Step 2: Resolve source profile (validates camera is reachable) ────
        let source;
        try {
            source = await this.previewService.resolveProfile(cameraId, cameraProbe);
        } catch (err: any) {
            this.log(sessionId, cameraId, 'failed', { reason: 'CAMERA_SOURCE_UNAVAILABLE' });
            const e: any = new Error(err.message);
            e.code = 'CAMERA_SOURCE_UNAVAILABLE';
            throw e;
        }

        // ── Step 3: Codec decision BEFORE any socket/PC creation ─────────────
        // Read the normalizedCodec from the camera's validated video profile.
        const camera = await this.cameraService.findById(cameraId);
        const selectedProfileId = camera?.capabilities?.video?.selectedProfileId;
        const selectedProfile = camera?.capabilities?.video?.profiles?.find(
            (p: any) => p.id === selectedProfileId
        );
        const cameraCodec = (selectedProfile?.normalizedCodec ?? 'H264').toUpperCase();
        const codecCheck = CodecDecisionEngine.evaluateWebRtcCompatibility(cameraCodec, offer.sdp);
        if (!codecCheck.compatible) {
            this.log(sessionId, cameraId, 'failed', { reason: 'codec_rejected', codec: cameraCodec, detail: codecCheck.reason });
            const e: any = new Error(codecCheck.reason);
            e.code = codecCheck.errorCode ?? 406;
            throw e;
        }
        this.log(sessionId, cameraId, 'codec_check', { codec: cameraCodec, compatible: true });

        const codecParams = this.buildCodecParams(cameraCodec);
        if (!codecParams) {
            this.log(sessionId, cameraId, 'failed', { reason: 'codec_rejected', codec: cameraCodec });
            const e: any = new Error(`Werift no soporta el codec ${cameraCodec} para WebRTC.`);
            e.code = 'CODEC_UNSUPPORTED';
            throw e;
        }

        // ── Step 4: Allocate RTP/RTCP pair (loopback, 51000-51100) ────────────
        let sockets;
        try {
            sockets = await this.allocateRtpPair();
        } catch (err: any) {
            this.log(sessionId, cameraId, 'failed', { reason: 'PORT_EXHAUSTED' });
            const e: any = new Error(err.message);
            e.code = 'ICE_CANDIDATE_UNREACHABLE';
            throw e;
        }
        const { rtpSocket, rtcpSocket, rtpPort, rtcpPort } = sockets;

        // ── Step 5: Create RTCPeerConnection ──────────────────────────────────
        // ICE uses ports 50000-50050, bound to host network (host_network:true).
        // iceAdditionalHostAddresses ensures Werift announces the real LAN IP.
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            icePortRange: [ICE_PORT_MIN, ICE_PORT_MAX] as [number, number],
            iceAdditionalHostAddresses: lanIps,
        });

        const track = new MediaStreamTrack({ kind: 'video', codec: codecParams });
        pc.addTrack(track);

        const session: Session = {
            pc, track, rtpSocket, rtcpSocket, rtpPort, rtcpPort,
            state: 'offer_received',
            watchdog: setTimeout(() => {}, 0),
            cameraId,
            startTime,
            codec: cameraCodec,
        };
        this.sessions.set(sessionId, session);

        // Offer/Answer watchdog: 5 seconds
        this.setWatchdog(sessionId, cameraId, 5000, 'ice_timeout');

        // ── Step 6: ICE state subscriptions ──────────────────────────────────
        pc.iceGatheringStateChange.subscribe((state) => {
            if (state === 'gathering') {
                this.transition(sessionId, cameraId, 'ice_candidate_gathering');
            }
        });

        pc.connectionStateChange.subscribe((state) => {
            if (state === 'connecting') {
                this.transition(sessionId, cameraId, 'ice_checking');
                this.log(sessionId, cameraId, 'ice.checking');
            } else if (state === 'connected') {
                this.transition(sessionId, cameraId, 'ice_connected');
                this.log(sessionId, cameraId, 'ice.connected');
                // Switch to RTP watchdog: 10 seconds
                this.setWatchdog(sessionId, cameraId, 10000, 'rtp_timeout');
                this.startFFmpeg(cameraId, rtpPort, rtcpPort, sessionId, source.descriptor.id, cameraCodec)
                    .catch(err => this.failSession(sessionId, cameraId, 'ffmpeg_exit'));
            } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                this.failSession(sessionId, cameraId, 'ice_timeout');
            }
        });

        // ── Step 7: RTP forward (FFmpeg loopback → Werift track → SRTP → browser) ──
        let firstPacketReceived = false;
        const expectedPayloadType = cameraCodec === 'H265' ? 100 : 96;
        rtpSocket.on('message', (msg) => {
            if (pc.connectionState !== 'connected' || msg.length < 12) return;
            try {
                const packet = RtpPacket.deSerialize(msg);
                if (packet.header.payloadType !== expectedPayloadType) {
                    this.log(sessionId, cameraId, 'rtp_payload_type_mismatch', {
                        expected: expectedPayloadType,
                        got: packet.header.payloadType,
                    });
                    return;
                }
                if (!firstPacketReceived) {
                    firstPacketReceived = true;
                    this.transition(sessionId, cameraId, 'rtp_receiving');
                    this.log(sessionId, cameraId, 'rtp.first_packet', { rtpPort });
                    // First-frame watchdog: 10 seconds
                    this.setWatchdog(sessionId, cameraId, 10000, 'first_frame_timeout');
                }
                track.writeRtp(packet.serialize());
            } catch {
                // Discard malformed packets silently.
            }
        });

        // ── Step 8: SDP negotiation ───────────────────────────────────────────
        // Wait for ICE gathering to complete so the SDP answer already contains
        // valid server-side LAN candidates. No trickle-ICE from server needed.
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Wait for ICE gathering to complete (max 5s) so answer has candidates
        await new Promise<void>((resolve) => {
            if (pc.iceGatheringState === 'complete') { resolve(); return; }
            const cancel = setTimeout(resolve, 5000);
            pc.iceGatheringStateChange.subscribe((state) => {
                if (state === 'complete') { clearTimeout(cancel); resolve(); }
            });
        });

        this.transition(sessionId, cameraId, 'answer_created');
        this.log(sessionId, cameraId, 'answer.created');

        // Switch to ICE watchdog: 15 seconds to reach connected
        this.setWatchdog(sessionId, cameraId, 15000, 'ice_timeout');

        return {
            sessionId,
            sdp: pc.localDescription?.sdp ?? '',
            type: pc.localDescription?.type ?? 'answer',
            codec: cameraCodec,
            audioNote: 'Audio WebRTC pendiente de negociación',
        };
    }

    // ── Public session operations ─────────────────────────────────────────────

    async addIceCandidate(sessionId: string, cameraId: string, candidate: any) {
        const session = this.sessions.get(sessionId);
        // Validate session ownership
        if (!session) throw new Error('Session not found or expired');
        if (session.cameraId !== cameraId) throw new Error('Session/camera mismatch');
        // end-of-candidates (empty candidate string) — do NOT close the session
        if (!candidate?.candidate) return;
        await session.pc.addIceCandidate(candidate);
    }

    async confirmFirstFrame(sessionId: string, cameraId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found or expired');
        if (session.cameraId !== cameraId) throw new Error('Session/camera mismatch');
        if (session.state !== 'failed' && session.state !== 'closed') {
            clearTimeout(session.watchdog);
            this.transition(sessionId, cameraId, 'first_frame');
            this.log(sessionId, cameraId, 'first_frame.browser');
        }
    }

    closeSession(sessionId: string, cameraId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        if (session.cameraId !== cameraId) return; // silently reject mismatched
        this.stopSession(sessionId, cameraId);
    }

    // ── FFmpeg ────────────────────────────────────────────────────────────────

    private async startFFmpeg(
        cameraId: string, rtpPort: number, rtcpPort: number,
        sessionId: string, sourceId: string, codec: string
    ) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        const payloadType = codec === 'H265' ? 100 : 96;

        await this.sessionManager.executeWithSourceRetry(cameraId, sourceId, async (input, sig) => {
            const args = [
                '-hide_banner', '-loglevel', 'error',
                ...input.ffmpegInputArguments,
                '-map', '0:v:0',
                '-c:v', 'copy',
                '-payload_type', String(payloadType),
                '-f', 'rtp',
                `rtp://127.0.0.1:${rtpPort}?rtcpport=${rtcpPort}`,
            ];
            const { process: ff, promise } = this.previewService.runner.spawnStreaming({
                command: 'ffmpeg', args, signal: sig,
                inputStream: input.inputStream, inputBuffer: input.inputBuffer,
            });
            session.ffProcess = ff;
            promise
                .then(() => this.stopSession(sessionId, cameraId))
                .catch(() => { this.log(sessionId, cameraId, 'ffmpeg_exit'); this.stopSession(sessionId, cameraId); });
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    private failSession(sessionId: string, cameraId: string, reason: string) {
        const session = this.sessions.get(sessionId);
        if (session && session.state !== 'failed' && session.state !== 'closed') {
            session.state = 'failed';
            this.log(sessionId, cameraId, 'failed', { reason });
            this.stopSession(sessionId, cameraId);
        }
    }

    stopSession(sessionId: string, cameraId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;
        clearTimeout(session.watchdog);
        if (session.state !== 'failed') {
            session.state = 'closed';
            this.log(sessionId, cameraId, 'closed');
        }
        try { session.pc.close(); } catch {}
        try { session.rtpSocket.close(); } catch {}
        try { session.rtcpSocket.close(); } catch {}
        if (session.ffProcess && !session.ffProcess.killed) {
            session.ffProcess.kill('SIGTERM');
        }
        this.sessions.delete(sessionId);
    }
}
