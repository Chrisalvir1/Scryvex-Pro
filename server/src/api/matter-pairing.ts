import { Pool } from 'pg';

export type MatterStatus = 'unavailable' | 'available' | 'published' | 'commissioning' | 'commissioned' | 'error';

export class MatterPairingService {
    constructor(private readonly pool: Pool) {}
    async getPairingStatus(cameraId: string) {
        const result = await this.pool.query<{ capabilities: any }>(`SELECT capabilities FROM scryvex_core.cameras WHERE id=$1`, [cameraId]);
        const matter = result.rows[0]?.capabilities?.matter;
        if (!matter?.available) return { status: 'unavailable' as MatterStatus, isPaired: false, ecosystems: [], reason: matter?.reason ?? 'Matterbridge no está conectado' };
        return { status: matter.commissioned ? 'commissioned' as MatterStatus : matter.published ? 'published' as MatterStatus : 'available' as MatterStatus, isPaired: !!matter.commissioned, ecosystems: [] };
    }
    async generateCommissioningWindow(cameraId: string) { const status = await this.getPairingStatus(cameraId); if (status.status === 'unavailable') throw new Error(status.reason); throw new Error('La generación de códigos Matter requiere un Matterbridge conectado'); }
    async unpair(cameraId: string) { const status = await this.getPairingStatus(cameraId); if (status.status === 'unavailable') throw new Error(status.reason); throw new Error('Matterbridge no expone una operación de desconexión'); }
}
