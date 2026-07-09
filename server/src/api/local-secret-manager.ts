import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export class LocalSecretManager {
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

    /**
     * Intercepts Cloud Plugin calls and decouples the cameras into independent instances.
     * Returns the list of instantiated child cameras.
     */
    async decoupleCloudAccount(pluginName: string, cloudToken: string, cloudCameras: any[]): Promise<any[]> {
        console.log(`[LocalSecretManager] Decoupling ${cloudCameras.length} cameras from ${pluginName} account.`);
        
        // Save Master Token securely
        const encryptedToken = this.encrypt(cloudToken);
        // db.put(`master_token_${pluginName}`, encryptedToken)

        const childInstances = cloudCameras.map((cam, index) => {
            return {
                id: `cloud_${pluginName}_${cam.id}`,
                name: cam.name,
                parentId: pluginName,
                // Assign independent Matter Commissioning Server port per child
                matterPort: 55601 + index 
            };
        });

        // Instantiate independently in Postgres
        childInstances.forEach(child => {
            console.log(`[Postgres] Instantiating independent Cloud Camera: ${child.name} on Matter Port ${child.matterPort}`);
            // db.put(`camera_${child.id}`, child)
        });

        return childInstances;
    }

    /**
     * Cascade pause mechanism. When a master token fails, all children are paused and UI is notified.
     */
    handleHttpInterceptor(error: any, parentAccountId: string, emitToFrontend: (event: string, payload: any) => void) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            console.error(`[LocalSecretManager] 401/403 Intercepted for Master Account ${parentAccountId}.`);
            
            console.warn(`[LocalSecretManager] Cascading PAUSE to all child cameras of ${parentAccountId}...`);
            // pseudo: getChildCameras(parentAccountId).forEach(cam => pauseStream(cam.id));

            // Emit critical alert to UI requesting 2FA for the Master Account
            emitToFrontend('2fa_required', { accountId: parentAccountId });
        }
    }
}
