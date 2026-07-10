import type { CameraAdapter, CameraProtocol } from './camera-adapter';
import { CloudIntegrationAdapter } from './adapters/cloud-integration-adapter';
import { OnvifAdapter } from './adapters/onvif-adapter';
import { RtspAdapter } from './adapters/rtsp-adapter';

export class CameraAdapterRegistry {
    private readonly adapters = new Map<CameraProtocol, CameraAdapter>();
    constructor() { this.register(new OnvifAdapter()); this.register(new RtspAdapter()); this.register(new CloudIntegrationAdapter()); }
    register(adapter: CameraAdapter) { this.adapters.set(adapter.protocol, adapter); }
    get(protocol: CameraProtocol) { const adapter = this.adapters.get(protocol); if (!adapter) throw new Error(`No hay adaptador registrado para ${protocol}`); return adapter; }
}
