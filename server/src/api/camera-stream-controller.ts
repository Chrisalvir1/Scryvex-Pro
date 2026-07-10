import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'node:child_process';
import { CameraService } from './camera-service';

export class CameraStreamController extends EventEmitter {
    private streams: Map<string, ChildProcess> = new Map();

    constructor(private readonly cameraService?: CameraService) { super(); }

    private log(cameraId: string, level: string, message: string) {
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
        const camera = await this.cameraService?.findById(cameraId);
        if (!camera?.rtsp_url) throw new Error('No existe una URL RTSP válida para esta cámara');
        if (requestedCodec && !(await this.validateCodecCapabilities(cameraId, requestedCodec))) throw new Error(`Codec Validation Failed for ${requestedCodec}`);

        if (this.streams.has(cameraId)) {
            this.log(cameraId, 'STREAM', 'Stream is already running.');
            return;
        }

        this.log(cameraId, 'FFMPEG', `Starting on-demand stream for ${cameraId}`);
        const process = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'warning', '-rtsp_transport', 'tcp', '-i', camera.rtsp_url, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
        process.stderr?.on('data', data => this.log(cameraId, 'FFMPEG', data.toString().trim()));
        process.once('exit', () => { this.streams.delete(cameraId); }); this.streams.set(cameraId, process);
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
