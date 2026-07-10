import { CameraAdapterRegistry } from '../cameras/camera-adapter-registry';
import { CameraService } from './camera-service';
import { evaluateHomeKitCompatibility } from '../hksv/compatibility';
import { CapabilityEvidence } from '../cameras/camera-adapter';

export class CameraProbe {
    constructor(
        private readonly cameraService: CameraService, 
        private readonly registry = new CameraAdapterRegistry()
    ) {}

    async runProbe(cameraId: string) {
        const camera = await this.cameraService.findById(cameraId);
        const connection = await this.cameraService.getConnectionInput(cameraId);
        
        if (!camera || !connection) {
            throw new Error('Camera not found');
        }

        const adapter = this.registry.get(camera.protocol);
        
        await this.cameraService.updateDiscovery(cameraId, 'pending');
        await this.cameraService.recordLog(cameraId, 'camera.discovery.started', { protocol: camera.protocol || 'RTSP' });
        await this.cameraService.recordLog(cameraId, 'camera.media.probe.started', { protocol: camera.protocol || 'RTSP' });

        try {
            const result = await adapter.discover(connection);
            
            // Generate HomeKit Compatibility Matrix based on discovered profiles
            const hkMatrix = evaluateHomeKitCompatibility(cameraId, result.streamProfiles || []);
            
            // Save everything
            await this.cameraService.updateDiscovery(
                cameraId, 
                result.capabilities.discoveryStatus, 
                result.capabilities, 
                result.streamProfiles,
                undefined,
                result.capabilities.capabilityEvidence
            );
            
            await this.cameraService.updateHomeKitCompatibility(cameraId, hkMatrix as unknown as Record<string, unknown>);
            
            await this.cameraService.recordLog(cameraId, 'camera.media.probe.completed', {
                profilesFound: result.streamProfiles?.length ?? 0 
            });
            await this.cameraService.recordLog(cameraId, 'camera.homekit.compatibility.evaluated', {
                isCompatible: hkMatrix.meetsNewAppleRequirements,
                tier: Object.keys(hkMatrix.videoTiers)[0] || 'No asignado'
            });
            await this.cameraService.recordLog(cameraId, 'camera.discovery.completed', { 
                source: result.capabilities.source, 
                profiles: result.streamProfiles?.length ?? 0 
            });
            
            return result.capabilities;

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const capabilities = (error as { capabilities?: any })?.capabilities;
            
            await this.cameraService.updateDiscovery(
                cameraId, 
                capabilities?.discoveryStatus ?? 'error', 
                capabilities, 
                undefined, 
                message
            );
            
            await this.cameraService.recordLog(cameraId, 'camera.discovery.failed', { message });
            throw error;
        }
    }

    async getProbeData(cameraId: string) {
        return (await this.cameraService.findById(cameraId))?.capabilities ?? null;
    }

    async toggleHEVC(cameraId: string, enabled: boolean) {
        const camera = await this.cameraService.findById(cameraId);
        if (!camera?.capabilities.video.profiles.some(p => ['H265', 'HEVC'].includes(p.codec?.toUpperCase() ?? ''))) {
            throw new Error('H.265 no fue detectado por la cámara');
        }
        
        const selectedId = enabled 
            ? camera.capabilities.video.profiles.find(p => ['H265', 'HEVC'].includes(p.codec?.toUpperCase() ?? ''))?.id
            : camera.capabilities.video.profiles.find(p => p.codec?.toUpperCase() === 'H264')?.id;
            
        return {
            ...camera.capabilities,
            video: {
                ...camera.capabilities.video,
                selectedProfileId: selectedId
            }
        };
    }
}
