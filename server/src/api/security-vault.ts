import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class SecurityVault {
    private secretKey: Buffer;
    private ivLength = 16;
    private secretPath = '/data/.scryvex_pro/.secret';

    constructor() {
        if (!fs.existsSync(this.secretPath)) {
            // Auto-generate master key on first boot
            fs.mkdirSync(path.dirname(this.secretPath), { recursive: true });
            const key = crypto.randomBytes(32);
            fs.writeFileSync(this.secretPath, key);
        }
        this.secretKey = fs.readFileSync(this.secretPath);
    }

    encrypt(text: string): string {
        const iv = crypto.randomBytes(this.ivLength);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.secretKey), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }

    decrypt(text: string): string {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift()!, 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.secretKey), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }

    handleHttpInterceptor(error: any, cameraId: string, emitToFrontend: (event: string, payload: any) => void) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            console.error(`[SecurityVault] 401/403 Intercepted for Camera ${cameraId}. Halting stream.`);
            // Pause service and request 2FA
            emitToFrontend('2fa_required', { cameraId });
        }
    }
}
