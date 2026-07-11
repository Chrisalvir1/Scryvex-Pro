import { Pool } from 'pg';
import net from 'node:net';

export type MatterStatus = 'unavailable' | 'available' | 'published' | 'commissioning' | 'commissioned' | 'error';

export class MatterPairingService {
    constructor(private readonly pool: Pool) {}

    private async sendIpcMessage(msg: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const client = net.createConnection('/run/scryvex-matter.sock', () => {
                client.write(JSON.stringify(msg) + '\n');
            });
            let data = '';
            client.on('data', chunk => {
                data += chunk.toString();
                if (data.endsWith('\n')) {
                    client.end();
                }
            });
            client.on('end', () => {
                try {
                    const response = JSON.parse(data.trim());
                    if (response.error) reject(new Error(response.error));
                    else resolve(response);
                } catch (e) {
                    reject(new Error('Invalid IPC response: ' + data));
                }
            });
            client.on('error', reject);
        });
    }

    async getPairingStatus(cameraId: string) {
        const result = await this.pool.query<{ capabilities: any }>(`SELECT capabilities FROM scryvex_core.cameras WHERE id=$1`, [cameraId]);
        const capabilities = result.rows[0]?.capabilities;
        const matter = capabilities?.matter;
        
        if (!matter?.available) return { status: 'unavailable' as MatterStatus, isPaired: false, ecosystems: [], reason: matter?.reason ?? 'La cámara aún no ha sido descubierta' };

        try {
            // Check status via IPC
            const ipcRes = await this.sendIpcMessage({ action: 'GET_STATUS', cameraId });
            const matterStatus = ipcRes.status; // { state, commissioned, fabrics }

            if (matterStatus.state === 'offline') {
                // Not running in matter host
                return { status: 'available' as MatterStatus, isPaired: false, ecosystems: [] };
            }

            return { 
                status: matterStatus.commissioned ? 'commissioned' as MatterStatus : 'published' as MatterStatus, 
                isPaired: !!matterStatus.commissioned, 
                ecosystems: matterStatus.fabrics || [] 
            };
        } catch (e) {
            console.warn('[MatterPairingService] Error en IPC GET_STATUS:', e);
            return { status: 'error' as MatterStatus, isPaired: false, ecosystems: [], reason: 'Error comunicando con servicio Matter' };
        }
    }

    async generateCommissioningWindow(cameraId: string) {
        const result = await this.pool.query<{ id: string; capabilities: any; name: string; matter_vendor_id: number | null; matter_product_id: number | null }>(
            `SELECT id, name, capabilities, matter_vendor_id, matter_product_id FROM scryvex_core.cameras WHERE id=$1`, [cameraId]
        );
        const row = result.rows[0];
        if (!row) throw new Error('Cámara no encontrada');
        if (!row.capabilities?.matter?.available) throw new Error('La cámara aún no ha sido descubierta. Espera el descubrimiento y vuelve a intentarlo.');

        // 1. Asegurar que el nodo está iniciado
        await this.sendIpcMessage({ 
            action: 'START_NODE', 
            cameraId, 
            capabilities: {
                name: row.name,
                vendorId: row.matter_vendor_id,
                productId: row.matter_product_id
            } 
        });

        // 2. Solicitar apertura de ventana
        const window = await this.sendIpcMessage({ action: 'OPEN_COMMISSIONING', cameraId });
        return window;
    }

    async unpair(cameraId: string) {
        // Factory reset Matter node completely
        await this.sendIpcMessage({ action: 'FACTORY_RESET', cameraId });
        
        await this.pool.query(
            `UPDATE scryvex_core.cameras SET capabilities = jsonb_set(capabilities, '{matter,commissioned}', 'false'), updated_at=NOW() WHERE id=$1`,
            [cameraId]
        );
        return { success: true };
    }

    async removeFabric(cameraId: string, fabricIndex: number) {
        await this.sendIpcMessage({ action: 'REMOVE_FABRIC', cameraId, fabricIndex });
        return { success: true };
    }
}
