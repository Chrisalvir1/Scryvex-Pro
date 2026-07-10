import { CameraAdapterRegistry } from '../cameras/camera-adapter-registry';
import { CameraService } from './camera-service';

export class CameraProbe {
    constructor(private readonly cameraService: CameraService, private readonly registry = new CameraAdapterRegistry()) {}
    async runProbe(cameraId: string) {
        const camera = await this.cameraService.findById(cameraId); if (!camera) throw new Error('Camera not found');
        const adapter = this.registry.get(camera.protocol); await this.cameraService.updateDiscovery(cameraId, 'discovering'); await this.cameraService.recordLog(cameraId, 'camera.discovery.started');
        try { const result = await adapter.discover(camera); await this.cameraService.updateDiscovery(cameraId, result.capabilities.discoveryStatus, result.capabilities, result.streamProfiles); await this.cameraService.recordLog(cameraId, 'camera.discovery.completed', { source: result.capabilities.source }); return result.capabilities; }
        catch (error) { const message = error instanceof Error ? error.message : String(error); const capabilities = (error as { capabilities?: any })?.capabilities; await this.cameraService.updateDiscovery(cameraId, capabilities?.discoveryStatus ?? 'error', capabilities, undefined, message); await this.cameraService.recordLog(cameraId, 'camera.discovery.failed', { message }); throw error; }
    }
    async getProbeData(cameraId: string) { return (await this.cameraService.findById(cameraId))?.capabilities ?? null; }
    async toggleHEVC(cameraId: string, enabled: boolean) { const camera = await this.cameraService.findById(cameraId); if (!camera?.capabilities.video.profiles.some(p => ['H265', 'HEVC'].includes(p.codec?.toUpperCase() ?? ''))) throw new Error('H.265 no fue detectado por la cámara'); return { ...camera.capabilities, video: { ...camera.capabilities.video, selectedProfileId: enabled ? camera.capabilities.video.profiles.find(p => ['H265', 'HEVC'].includes(p.codec?.toUpperCase() ?? ''))?.id : camera.capabilities.video.profiles.find(p => p.codec?.toUpperCase() === 'H264')?.id } }; }
}
