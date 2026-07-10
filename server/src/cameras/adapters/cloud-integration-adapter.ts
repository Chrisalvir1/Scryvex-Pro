import type { CameraAdapter, CameraConnectionInput, CameraDiscoveryResult, CameraCapabilities, ConnectionTestResult } from '../camera-adapter';
import { emptyCapabilities } from '../camera-adapter';

export class CloudIntegrationAdapter implements CameraAdapter {
    readonly protocol = 'OTHER' as const;
    async discover(_input: CameraConnectionInput): Promise<CameraDiscoveryResult> { const capabilities = emptyCapabilities('integration'); capabilities.discoveryStatus = 'unsupported'; capabilities.matter.reason = 'La integración no proporciona Matter'; return { capabilities }; }
    async getCapabilities(input: CameraConnectionInput): Promise<CameraCapabilities> { return (await this.discover(input)).capabilities; }
    async testConnection(_input: CameraConnectionInput): Promise<ConnectionTestResult> { return { success: false, status: 'unsupported', message: 'No hay un adaptador de integración instalado' }; }
    async executeAction(_input: CameraConnectionInput, action: 'light' | 'siren', _state: boolean): Promise<void> {
        throw new Error(`La acción ${action} no está implementada en el plugin de nube base. Instala el plugin específico (ej. Ring) para controlar este dispositivo.`);
    }
}
