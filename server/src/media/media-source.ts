import { CapabilityEvidence } from '../capabilities/capability-evidence';

export type MediaTransport = 'tcp' | 'udp' | 'http' | 'https' | 'hls' | 'webrtc' | 'pipe' | 'buffer';
export type MediaSourceType = 'rtsp' | 'onvif' | 'hls' | 'http' | 'webrtc' | 'plugin_buffer' | 'plugin_pipe';

export interface MediaSourceDescriptor {
    id: string; // Stable internal ID
    sourceType: MediaSourceType;
    transport: MediaTransport;
    profile?: string;
    pluginId?: string;
    deviceId: string;
    
    // Auth references (No raw secrets)
    credentialRef?: string;
    authorizationRef?: string;
    providerSessionRef?: string;

    // Base or ephemeral URI reference
    uriRef?: string; 
    
    // Expiration timestamp in milliseconds (Date.now() + duration)
    expirationMs?: number;
}

export interface CameraMediaProvider {
    getMediaSources(deviceId: string, signal?: AbortSignal): Promise<MediaSourceDescriptor[]>;
    refreshMediaSource?(deviceId: string, sourceId: string, signal?: AbortSignal): Promise<MediaSourceDescriptor>;
}

export interface DeviceControlProvider {
    listCapabilities(deviceId: string, signal?: AbortSignal): Promise<CapabilityEvidence[]>;
    readCapability?(deviceId: string, capabilityId: string, signal?: AbortSignal): Promise<any>;
    executeCapability?(deviceId: string, capabilityId: string, payload: any, signal?: AbortSignal): Promise<void>;
}
