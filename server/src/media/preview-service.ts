import { ResolvedMediaInput } from './media-resolvers';
import { MediaSourceSessionManager } from './media-session-manager';
import { MediaSourceSelector } from './media-selector';
import { spawn } from 'child_process';

export class PreviewService {
    constructor(
        private sessionManager: MediaSourceSessionManager,
        private selector: MediaSourceSelector
    ) {}

    async getFrame(deviceId: string, sourceId: string, pluginId?: string): Promise<Buffer> {
        const input = await this.sessionManager.getResolvedInput(deviceId, sourceId, pluginId);
        
        return new Promise((resolve, reject) => {
            const args = [
                '-hide_banner', '-loglevel', 'error',
                ...input.ffmpegInputArguments,
                '-frames:v', '1',
                '-f', 'image2',
                '-vcodec', 'mjpeg',
                'pipe:1'
            ];

            const ff = spawn('ffmpeg', args);
            const chunks: Buffer[] = [];
            
            ff.stdout.on('data', chunk => chunks.push(chunk));
            ff.stderr.on('data', chunk => console.error(`FFMPEG Error: ${chunk}`));
            
            ff.on('close', code => {
                if (code === 0) resolve(Buffer.concat(chunks));
                else reject(new Error(`FFmpeg exited with code ${code}`));
            });
            ff.on('error', err => reject(err));
        });
    }

    async startMjpeg(deviceId: string, sourceId: string, res: import('express').Response, pluginId?: string): Promise<void> {
        const input = await this.sessionManager.getResolvedInput(deviceId, sourceId, pluginId);
        
        res.writeHead(200, {
            'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
            'Cache-Control': 'no-cache',
            'Connection': 'close',
            'Pragma': 'no-cache'
        });

        const args = [
            '-hide_banner', '-loglevel', 'error',
            ...input.ffmpegInputArguments,
            '-f', 'mpjpeg',
            '-vcodec', 'mjpeg',
            'pipe:1'
        ];

        const ff = spawn('ffmpeg', args);
        ff.stdout.pipe(res);

        res.on('close', () => ff.kill('SIGKILL'));
        ff.on('error', (err) => console.error('FFmpeg MJPEG error:', err));
    }
}
