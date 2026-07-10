import { CameraMediaProvider, MediaSourceDescriptor, DeviceControlProvider } from '../../media/media-source';
import { CapabilityEvidence } from '../../capabilities/capability-evidence';

function call<T>(run: (callback: (error: Error | null, value: T) => void) => void): Promise<T> {
    return new Promise((resolve, reject) => run((error, value) => error ? reject(error) : resolve(value)));
}

export class OnvifAdapter implements CameraMediaProvider, DeviceControlProvider {
    readonly protocol = 'ONVIF' as const;

    // This would typically read from DB or config
    private mockDatabaseResolver(deviceId: string) {
        return {
            ip: `192.168.1.100`, // mock
            port: 80,
            username: 'admin',
            password: 'password',
        };
    }

    async getMediaSources(deviceId: string, signal?: AbortSignal): Promise<MediaSourceDescriptor[]> {
        const input = this.mockDatabaseResolver(deviceId);
        
        try {
            const onvif = await import('onvif');
            
            const cam = await new Promise<any>((resolve, reject) => {
                let instance: any;
                instance = new (onvif as any).Cam({
                    hostname: input.ip,
                    port: input.port,
                    username: input.username,
                    password: input.password,
                }, (error: Error) => error ? reject(error) : resolve(instance));
            });

            const profiles = await call<any[]>(cb => cam.getProfiles(cb));
            
            const sources: MediaSourceDescriptor[] = [];
            
            for (const profile of profiles) {
                const token = profile?.$?.token;
                if (!token) continue;

                let streamUri: string | undefined;
                try {
                    const uriResult = await call<any>(cb => cam.getStreamUri({ Protocol: 'RTSP', ProfileToken: token }, cb));
                    streamUri = uriResult?.uri || uriResult?.Uri;
                } catch {
                    // ignore
                }

                if (streamUri) {
                    sources.push({
                        id: token,
                        sourceType: 'onvif',
                        transport: 'tcp',
                        deviceId,
                        profile: profile.Name || token,
                        uriRef: streamUri,
                        credentialRef: `cred_onvif_${deviceId}` // Ref to be resolved by SessionManager
                    });
                }
            }

            return sources;

        } catch (error) {
            throw new Error(`ONVIF Discovery Failed: ${(error as Error).message}`);
        }
    }

    async listCapabilities(deviceId: string, signal?: AbortSignal): Promise<CapabilityEvidence[]> {
        const input = this.mockDatabaseResolver(deviceId);
        const evidence: CapabilityEvidence[] = [];
        
        try {
            const onvif = await import('onvif');
            const cam = await new Promise<any>((resolve, reject) => {
                let instance: any;
                instance = new (onvif as any).Cam({
                    hostname: input.ip,
                    port: input.port,
                    username: input.username,
                    password: input.password,
                }, (error: Error) => error ? reject(error) : resolve(instance));
            });

            const ptz = cam.ptz || cam.capabilities?.PTZ;
            if (ptz) {
                evidence.push({
                    entity: 'ptz',
                    detected: true,
                    verified: true,
                    readable: true,
                    controllable: true,
                    source: 'onvif-device',
                    confidence: 'verified',
                    operation: 'ptzMove'
                });
            }

            const events = cam.events || cam.capabilities?.Events;
            if (events) {
                evidence.push({
                    entity: 'motion',
                    detected: true,
                    verified: true,
                    readable: true,
                    controllable: false,
                    source: 'onvif-events',
                    confidence: 'verified',
                });
            }

        } catch (e) {
            // ignore
        }

        return evidence;
    }
}
