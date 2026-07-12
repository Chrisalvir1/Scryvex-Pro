import { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack, RTCSessionDescription, RtpPacket } from 'werift';
import dgram from 'dgram';
import { randomUUID } from 'crypto';
import { CameraService } from '../../api/camera-service';
import { CameraProbe } from '../../api/camera-probe';
import { PreviewService } from '../preview-service';
import { MediaSourceSessionManager } from '../media-session-manager';

export type WebRTCState = 'idle' | 'validating_source' | 'offer_received' | 'answer_created' | 'ice_checking' | 'ice_connected' | 'rtp_receiving' | 'first_frame' | 'failed' | 'closed';

export class WebRTCSessionManager {
    private sessions = new Map<string, {
        pc: RTCPeerConnection;
        track: MediaStreamTrack;
        rtpSocket: dgram.Socket;
        rtcpSocket: dgram.Socket;
        ffProcess?: any;
        state: WebRTCState;
        watchdog: NodeJS.Timeout;
        cameraId: string;
        startTime: number;
    }>();

    constructor(
        private readonly cameraService: CameraService,
        private readonly previewService: PreviewService,
        private readonly sessionManager: MediaSourceSessionManager
    ) {}

    private log(sessionId: string, event: string, details?: any) {
        const session = this.sessions.get(sessionId);
        const duration = session ? Date.now() - session.startTime : 0;
        console.log(`[WebRTC] [${sessionId}] [${event}] [${duration}ms]`, details ? JSON.stringify(details) : '');
    }

    private transition(sessionId: string, newState: WebRTCState, details?: any) {
        const session = this.sessions.get(sessionId);
        if (session && session.state !== 'closed' && session.state !== 'failed') {
            session.state = newState;
            this.log(sessionId, `state_changed`, { state: newState, ...details });
        }
    }

    private setWatchdog(sessionId: string, ms: number, failureReason: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            clearTimeout(session.watchdog);
            session.watchdog = setTimeout(() => {
                this.failSession(sessionId, failureReason);
            }, ms);
        }
    }

    async createOffer(
        cameraId: string, 
        offer: { sdp: string, type: 'offer' | 'pranswer' | 'answer' | 'rollback' }, 
        cameraProbe: CameraProbe
    ) {
        const sessionId = randomUUID();
        const startTime = Date.now();
        
        this.log(sessionId, 'webrtc.offer.received', { cameraId });

        // 1. Validating source (synchronous check before accepting WebRTC)
        let source;
        try {
            source = await this.previewService.resolveProfile(cameraId, cameraProbe);
        } catch (err: any) {
            this.log(sessionId, 'webrtc.failed', { reason: 'CAMERA_SOURCE_UNAVAILABLE', details: err.message });
            const error: any = new Error(err.message);
            error.code = 'CAMERA_SOURCE_UNAVAILABLE';
            throw error;
        }

        this.log(sessionId, 'webrtc.source.validated', { profileId: source.descriptor.id });

        const pc = new RTCPeerConnection();
        const track = new MediaStreamTrack({ kind: 'video', codec: new RTCRtpCodecParameters({
            mimeType: 'video/H264',
            clockRate: 90000,
            payloadType: 96,
            rtcpFeedback: [{ type: 'nack' }, { type: 'nack', parameter: 'pli' }]
        }) });

        pc.addTrack(track);

        const rtpSocket = dgram.createSocket('udp4');
        const rtcpSocket = dgram.createSocket('udp4');

        rtpSocket.bind(0);
        rtcpSocket.bind(0);

        await new Promise<void>((resolve) => rtpSocket.once('listening', resolve));
        await new Promise<void>((resolve) => rtcpSocket.once('listening', resolve));

        this.sessions.set(sessionId, {
            pc, track, rtpSocket, rtcpSocket,
            state: 'offer_received',
            watchdog: setTimeout(() => {}, 0),
            cameraId,
            startTime
        });

        // ICE Watchdog: 15 seconds
        this.setWatchdog(sessionId, 15000, 'ICE connection timeout');

        pc.connectionStateChange.subscribe((state) => {
            if (state === 'connecting') {
                this.transition(sessionId, 'ice_checking');
                this.log(sessionId, 'webrtc.ice.checking');
            } else if (state === 'connected') {
                this.transition(sessionId, 'ice_connected');
                this.log(sessionId, 'webrtc.ice.connected');
                
                // Switch to RTP watchdog: 10 seconds
                this.setWatchdog(sessionId, 10000, 'RTP receive timeout');
                
                const rtpPort = rtpSocket.address().port;
                const rtcpPort = rtcpSocket.address().port;
                this.startFFmpeg(cameraId, rtpPort, rtcpPort, sessionId, source.descriptor.id).catch(err => {
                    this.failSession(sessionId, 'FFmpeg start failed: ' + err.message);
                });
            } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                this.failSession(sessionId, `ICE state: ${state}`);
            }
        });

        let firstPacketReceived = false;

        rtpSocket.on('message', (msg) => {
            if (pc.connectionState === 'connected' && msg.length >= 12) {
                try {
                    const packet = RtpPacket.deSerialize(msg);
                    // Force payload type to match Werift Track
                    packet.header.payloadType = 96;
                    
                    if (!firstPacketReceived) {
                        firstPacketReceived = true;
                        this.transition(sessionId, 'rtp_receiving');
                        this.log(sessionId, 'webrtc.rtp.first_packet');
                        
                        // Switch to First Frame watchdog: 10 seconds
                        this.setWatchdog(sessionId, 10000, 'First frame timeout');
                    }

                    track.writeRtp(packet.serialize());
                } catch (e) {
                    // Ignore bad packet
                }
            }
        });

        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.transition(sessionId, 'answer_created');
        this.log(sessionId, 'webrtc.answer.created');

        return {
            sessionId,
            sdp: pc.localDescription?.sdp || '',
            type: pc.localDescription?.type || 'answer',
            codec: 'H264'
        };
    }

    async addIceCandidate(sessionId: string, candidate: any) {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');
        await session.pc.addIceCandidate(candidate);
    }

    async confirmFirstFrame(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            clearTimeout(session.watchdog);
            this.transition(sessionId, 'first_frame');
            this.log(sessionId, 'webrtc.first_frame.browser');
        }
    }

    private async startFFmpeg(cameraId: string, rtpPort: number, rtcpPort: number, sessionId: string, sourceId: string) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        await this.sessionManager.executeWithSourceRetry(cameraId, sourceId, async (input, sig) => {
            const args = [
                '-hide_banner', '-loglevel', 'error',
                ...input.ffmpegInputArguments,
                '-map', '0:v:0',
                '-c:v', 'copy',
                '-payload_type', '96',
                '-f', 'rtp',
                `rtp://127.0.0.1:${rtpPort}?rtcpport=${rtcpPort}`
            ];

            const { process: ff, promise } = this.previewService.runner.spawnStreaming({
                command: 'ffmpeg',
                args,
                signal: sig,
                inputStream: input.inputStream,
                inputBuffer: input.inputBuffer
            });

            session.ffProcess = ff;
            
            promise.then(() => this.stopSession(sessionId)).catch(() => this.stopSession(sessionId));
        });
    }

    private failSession(sessionId: string, reason: string) {
        const session = this.sessions.get(sessionId);
        if (session && session.state !== 'failed' && session.state !== 'closed') {
            session.state = 'failed';
            this.log(sessionId, 'webrtc.failed', { reason });
            this.stopSession(sessionId);
        }
    }

    stopSession(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            clearTimeout(session.watchdog);
            if (session.state !== 'failed') {
                session.state = 'closed';
                this.log(sessionId, 'webrtc.closed');
            }
            try { session.pc.close(); } catch (e) {}
            try { session.rtpSocket.close(); } catch (e) {}
            try { session.rtcpSocket.close(); } catch (e) {}
            if (session.ffProcess && !session.ffProcess.killed) {
                session.ffProcess.kill('SIGTERM');
            }
            this.sessions.delete(sessionId);
        }
    }
}
