import type { CameraProtocol } from '../types/camera';

export type { CameraProtocol };

export type DiscoveryStatus = 'pending' | 'discovering' | 'online' | 'offline' | 'authentication_failed' | 'unsupported' | 'error';

export interface CameraConnectionInput {
    id?: string;
    ip: string;
    port: number;
    onvif_port?: number;
    rtsp_url?: string;
    username?: string;
    password?: string;
    config?: Record<string, unknown>;
}

export interface StreamProfile {
    id: string;
    name?: string;
    codec?: string;
    width?: number;
    height?: number;
    fps?: number;
    bitrate?: number;
    streamUri?: string;
    snapshotUri?: string;
}

export interface CameraCapabilities {
    discoveryStatus: DiscoveryStatus;
    source: 'onvif' | 'rtsp' | 'integration' | 'manual';
    lastCheckedAt?: string;
    manufacturer?: string;
    model?: string;
    firmware?: string;
    serialNumber?: string;
    /** Entity names explicitly advertised by the camera/integration. */
    detectedEntities?: string[];
    video: { profiles: StreamProfile[]; selectedProfileId?: string; supportsH264: boolean; supportsH265: boolean; supportsTranscoding: boolean };
    audio: { available: boolean; input: boolean; output: boolean; codecs: string[]; selectedCodec?: string; sampleRates: number[] };
    controls: { ptz: boolean; light: boolean; lightControl: boolean; microphone: boolean; speaker: boolean; twoWayAudio: boolean; siren: boolean; sirenControl: boolean; motionEvents: boolean };
    preview: { snapshot: boolean; rtsp: boolean; mjpeg: boolean; webrtc: boolean; hls: boolean };
    yolo: { available: boolean; reason?: string };
    matter: { available: boolean; published: boolean; commissioned: boolean; supportsMatterRemux: boolean; reason?: string };
}

export interface CameraDiscoveryResult {
    capabilities: CameraCapabilities;
    streamProfiles?: StreamProfile[];
}

export interface ConnectionTestResult { success: boolean; status: DiscoveryStatus; message?: string; }
export interface PreviewSession { sessionId: string; url?: string; expiresAt?: string; }

export interface CameraAdapter {
    readonly protocol: CameraProtocol;
    discover(input: CameraConnectionInput): Promise<CameraDiscoveryResult>;
    getCapabilities(input: CameraConnectionInput): Promise<CameraCapabilities>;
    getSnapshot?(input: CameraConnectionInput): Promise<Buffer>;
    executeAction?(input: CameraConnectionInput, action: 'light' | 'siren', state: boolean): Promise<void>;
    getStreamProfiles?(input: CameraConnectionInput): Promise<StreamProfile[]>;
    testConnection(input: CameraConnectionInput): Promise<ConnectionTestResult>;
    startPreview?(input: CameraConnectionInput): Promise<PreviewSession>;
    stopPreview?(sessionId: string): Promise<void>;
}

export function cameraStreamUrl(input: CameraConnectionInput, rawUrl: string): string {
    const url = new URL(rawUrl);
    // Only inject credentials if the URL has absolutely no authentication.
    // ONVIF cameras frequently embed session tokens in the path; injecting
    // credentials on top of those breaks the URL and causes FFmpeg to fail
    // with "Invalid data found when processing input".
    const hasAuth = url.username || url.password;
    if (!hasAuth) {
        if (input.username) url.username = encodeURIComponent(input.username);
        if (input.password) url.password = encodeURIComponent(input.password);
    }
    return url.toString();
}

export function redactCameraSecrets(message: string): string {
    return message.replace(/(rtsps?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1***@');
}

export function emptyCapabilities(source: CameraCapabilities['source']): CameraCapabilities {
    return {
        discoveryStatus: 'pending', source,
        video: { profiles: [], supportsH264: false, supportsH265: false, supportsTranscoding: false },
        audio: { available: false, input: false, output: false, codecs: [], sampleRates: [] },
        controls: { ptz: false, light: false, lightControl: false, microphone: false, speaker: false, twoWayAudio: false, siren: false, sirenControl: false, motionEvents: false },
        preview: { snapshot: false, rtsp: false, mjpeg: false, webrtc: false, hls: false },
        yolo: { available: false, reason: 'No hay un runtime YOLO configurado' },
        matter: { available: false, published: false, commissioned: false, supportsMatterRemux: false, reason: 'Matterbridge no está conectado' },
    };
}
