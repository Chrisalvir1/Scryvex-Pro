import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'node:child_process';
import { CameraService } from './camera-service';
import { cameraStreamUrl, redactCameraSecrets } from '../cameras/camera-adapter';

export class CameraStreamController extends EventEmitter {
    private streams: Map<string, ChildProcess> = new Map();

    constructor(private readonly cameraService?: CameraService) { super(); }

    private log(cameraId: string, level: string, message: string) {
        message = redactCameraSecrets(message);
        const logEntry = `[${level}] ${message}`;
        console.log(`[Camera ${cameraId}] ${logEntry}`);
        void this.cameraService?.recordLog(cameraId, level.toLowerCase(), { message });
    }

    async validateCodecCapabilities(cameraId: string, requestedCodec: string): Promise<boolean> {
        this.log(cameraId, 'VALIDATION', `Verifying camera capabilities for codec ${requestedCodec}`);
        
        const camera = await this.cameraService?.findById(cameraId);
        const supportedCodecs = [...(camera?.capabilities.video.profiles.map(profile => profile.codec).filter(Boolean) ?? []), ...(camera?.capabilities.audio.codecs ?? [])];
        
        if (!supportedCodecs.includes(requestedCodec)) {
            const errorMsg = `Esta cámara no soporta el codec ${requestedCodec}. Por esta razón, no puedes iniciar el stream de preview y Apple HomeKit no podrá reconocerla.`;
            this.log(cameraId, 'ERROR', errorMsg);
            this.emit('codec_error', { cameraId, message: errorMsg });
            return false;
        }

        this.log(cameraId, 'VALIDATION', `Codec ${requestedCodec} is supported.`);
        return true;
    }

    async startStream(cameraId: string, requestedCodec?: string) {
        const streamUrl = await this.getStreamUrl(cameraId);
        const camera = await this.cameraService?.findById(cameraId);
        if (!camera) throw new Error('Cámara no encontrada');
        if (requestedCodec && !(await this.validateCodecCapabilities(cameraId, requestedCodec))) throw new Error(`Codec Validation Failed for ${requestedCodec}`);

        if (this.streams.has(cameraId)) {
            this.log(cameraId, 'STREAM', 'Stream is already running.');
            return;
        }

        this.log(cameraId, 'FFMPEG', `Starting on-demand stream for ${cameraId}`);
        const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-rtsp_transport', 'tcp', '-i', streamUrl, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
        process.stderr?.on('data', data => this.log(cameraId, 'FFMPEG', data.toString().trim()));
        process.once('error', error => this.log(cameraId, 'camera.stream.failed', error.message));
        process.once('spawn', () => this.log(cameraId, 'camera.stream.opened', 'ffmpeg abrió el stream'));
        process.once('exit', code => { this.streams.delete(cameraId); if (code && code !== 0) this.log(cameraId, 'camera.stream.failed', `ffmpeg terminó con código ${code}`); }); this.streams.set(cameraId, process);
    }

    async getStreamUrl(cameraId: string): Promise<string> {
        const camera = await this.cameraService?.findById(cameraId);
        const connection = await this.cameraService?.getConnectionInput(cameraId);
        const profile = camera?.stream_profiles.find(item => item.id === camera.capabilities.video.selectedProfileId) ?? camera?.stream_profiles[0];
        const rawUrl = connection?.rtsp_url ?? profile?.streamUri;
        if (!camera || !connection || !rawUrl) throw new Error('No existe una URL RTSP detectada para esta cámara');
        return cameraStreamUrl(connection, rawUrl);
    }

    stopStream(cameraId: string) {
        const stream = this.streams.get(cameraId);
        if (stream) {
            stream.kill('SIGTERM');
            this.streams.delete(cameraId);
        } else {
            this.log(cameraId, 'STREAM', 'No active stream found to stop.');
        }
    }
}
