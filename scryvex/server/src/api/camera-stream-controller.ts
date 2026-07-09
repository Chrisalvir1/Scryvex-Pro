import { EventEmitter } from 'events';

export class CameraStreamController extends EventEmitter {
    private streams: Map<string, any> = new Map();
    private cameraLogs: Map<string, string[]> = new Map();

    constructor() {
        super();
    }

    private log(cameraId: string, level: string, message: string) {
        if (!this.cameraLogs.has(cameraId)) {
            this.cameraLogs.set(cameraId, []);
        }
        const logEntry = `[${level}] ${message}`;
        this.cameraLogs.get(cameraId)!.push(logEntry);
        console.log(`[Camera ${cameraId}] ${logEntry}`);
        
        // Trim logs to prevent memory leak
        if (this.cameraLogs.get(cameraId)!.length > 1000) {
            this.cameraLogs.get(cameraId)!.shift();
        }
    }

    getLogs(cameraId: string): string[] {
        return this.cameraLogs.get(cameraId) || [];
    }

    async validateCodecCapabilities(cameraId: string, requestedCodec: string): Promise<boolean> {
        this.log(cameraId, 'VALIDATION', `Verifying camera capabilities for codec ${requestedCodec}`);
        
        // Mocking capability check via SDP/ONVIF parsing
        const supportedCodecs = ['H.264', 'Opus', 'AAC']; // Example: H.265 not supported
        
        if (!supportedCodecs.includes(requestedCodec)) {
            const errorMsg = `Esta cámara no soporta el codec ${requestedCodec}. Por esta razón, no puedes iniciar el stream de preview y Apple HomeKit no podrá reconocerla.`;
            this.log(cameraId, 'ERROR', errorMsg);
            this.emit('codec_error', { cameraId, message: errorMsg });
            return false;
        }

        this.log(cameraId, 'VALIDATION', `Codec ${requestedCodec} is supported.`);
        return true;
    }

    async startStream(cameraId: string, requestedCodec: string = 'H.265') {
        const isValid = await this.validateCodecCapabilities(cameraId, requestedCodec);
        if (!isValid) {
            throw new Error(`Codec Validation Failed for ${requestedCodec}`);
        }

        if (this.streams.has(cameraId)) {
            this.log(cameraId, 'STREAM', 'Stream is already running.');
            return;
        }

        this.log(cameraId, 'FFMPEG', `Starting on-demand stream for ${cameraId}`);
        // Mock FFmpeg process startup
        const mockStreamProcess = {
            kill: () => {
                this.log(cameraId, 'FFMPEG', `Stopped on-demand stream for ${cameraId}`);
            }
        };
        this.streams.set(cameraId, mockStreamProcess);
    }

    stopStream(cameraId: string) {
        const stream = this.streams.get(cameraId);
        if (stream) {
            stream.kill();
            this.streams.delete(cameraId);
        } else {
            this.log(cameraId, 'STREAM', 'No active stream found to stop.');
        }
    }
}
