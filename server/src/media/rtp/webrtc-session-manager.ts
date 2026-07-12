import { RTCPeerConnection, RTCRtpCodecParameters, MediaStreamTrack, RTCSessionDescription, RtcpPacket } from 'werift';
import dgram from 'dgram';
import { randomUUID } from 'crypto';
import { CameraService } from '../../api/camera-service';
import { CameraProbe } from '../../api/camera-probe';
import { PreviewService } from '../preview-service';
import { MediaSourceSessionManager } from '../media-session-manager';

export class WebRTCSessionManager {
    private sessions = new Map<string, {
        pc: RTCPeerConnection;
        track: MediaStreamTrack;
        rtpSocket: dgram.Socket;
        rtcpSocket: dgram.Socket;
        ffProcess?: any;
        timeout: NodeJS.Timeout;
    }>();

    constructor(
        private readonly cameraService: CameraService,
        private readonly previewService: PreviewService,
        private readonly sessionManager: MediaSourceSessionManager
    ) {}

    async createOffer(
        cameraId: string, 
        offer: { sdp: string, type: 'offer' | 'pranswer' | 'answer' | 'rollback' }, 
        cameraProbe: CameraProbe
    ) {
        const sessionId = randomUUID();
        
        // Ensure authentication / timeout / basic WebRTC logic
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

        // Bind UDP sockets
        await new Promise<void>((resolve) => rtpSocket.once('listening', resolve));
        await new Promise<void>((resolve) => rtcpSocket.once('listening', resolve));

        const rtpPort = rtpSocket.address().port;
        const rtcpPort = rtcpSocket.address().port;

        // Clean up timeout (15s if no connection)
        let timeout = setTimeout(() => {
            this.stopSession(sessionId);
        }, 15000);

        pc.connectionStateChange.subscribe((state) => {
            if (state === 'connected') {
                clearTimeout(timeout);
                // Connected, start ffmpeg
                this.startFFmpeg(cameraId, rtpPort, rtcpPort, sessionId, cameraProbe).catch(console.error);
            } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
                this.stopSession(sessionId);
            }
        });

        // Handle RTP forwarding
        rtpSocket.on('message', (msg) => {
            // Werift MediaStreamTrack accepts raw RTP buffers if payload type matches
            // We ensure ffmpeg outputs payload type 96
            if (pc.connectionState === 'connected' && msg.length >= 2) {
                // Ensure payload type is 96 in the RTP header
                msg.writeUInt8((msg.readUInt8(1) & 0x80) | 96, 1);
                track.writeRtp(msg);
            }
        });

        // Set remote and create answer
        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.sessions.set(sessionId, {
            pc, track, rtpSocket, rtcpSocket, timeout
        });

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

    private async startFFmpeg(cameraId: string, rtpPort: number, rtcpPort: number, sessionId: string, cameraProbe: CameraProbe) {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        // FFmpeg command to stream RTP to rtpSocket
        const source = await this.previewService.resolveProfile(cameraId, cameraProbe);
        const { id: sourceId } = source.descriptor;

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

    stopSession(sessionId: string) {
        const session = this.sessions.get(sessionId);
        if (session) {
            clearTimeout(session.timeout);
            session.pc.close();
            try { session.rtpSocket.close(); } catch (e) {}
            try { session.rtcpSocket.close(); } catch (e) {}
            if (session.ffProcess && !session.ffProcess.killed) {
                session.ffProcess.kill('SIGTERM');
            }
            this.sessions.delete(sessionId);
        }
    }
}
