import { CameraService, Camera } from '../api/camera-service';
import { exec } from 'child_process';
import { promisify } from 'util';
// @ts-ignore
const onvif = require('onvif');

const execAsync = promisify(exec);

export class CameraIdentityTracker {
    constructor(private readonly cameraService: CameraService) {}

    /**
     * Extracts MAC from the system ARP table for a given IP
     */
    async getMacFromArp(ip: string): Promise<string | undefined> {
        try {
            const { stdout } = await execAsync(`arp -n ${ip}`);
            const macMatch = stdout.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/);
            if (macMatch) {
                return macMatch[0].toLowerCase().replace(/-/g, ':');
            }
        } catch (e) {
            console.error(`[IdentityTracker] Failed to get ARP for ${ip}:`, e);
        }
        return undefined;
    }

    /**
     * Discovers ONVIF devices on the network
     */
    async discoverOnvifDevices(): Promise<any[]> {
        return new Promise((resolve) => {
            onvif.Discovery.probe({ timeout: 3000 }, (err: any, devices: any[]) => {
                if (err || !devices) {
                    resolve([]);
                } else {
                    resolve(devices);
                }
            });
        });
    }

    /**
     * Resolves the identity of a camera that went offline.
     */
    async resolveOfflineIdentity(camera: Camera): Promise<void> {
        if (!camera.mac_address && !camera.onvif_uuid) {
            console.log(`[IdentityTracker] Camera ${camera.id} went offline, but has no verifiable identity (no MAC or UUID).`);
            await this.cameraService.update(camera.id, { identity_status: 'unknown' });
            return;
        }

        console.log(`[IdentityTracker] Camera ${camera.id} (${camera.ip}) is offline. Attempting identity resolution...`);
        await this.cameraService.update(camera.id, { identity_status: 'searching_new_ip' });

        const devices = await this.discoverOnvifDevices();
        const matches: any[] = [];

        for (const device of devices) {
            const probeMatch = device.probeMatch || {};
            const urn = probeMatch.endpointReference?.address?.[0]; // e.g. urn:uuid:1234...
            const xaddrs: string = probeMatch.XAddrs?.[0] || '';
            const ipMatch = xaddrs.match(/http:\/\/([0-9\.]+)/);
            const discoveredIp = ipMatch ? ipMatch[1] : undefined;
            
            let mac: string | undefined = undefined;
            if (discoveredIp) {
                mac = await this.getMacFromArp(discoveredIp);
            }

            const isMacMatch = mac && camera.mac_address && mac === camera.mac_address;
            const isUuidMatch = urn && camera.onvif_uuid && urn === camera.onvif_uuid;

            if (isMacMatch || isUuidMatch) {
                matches.push({ ip: discoveredIp, mac, urn });
            }
        }

        if (matches.length === 0) {
            console.log(`[IdentityTracker] No match found for camera ${camera.id}`);
            await this.cameraService.update(camera.id, { identity_status: 'offline' });
        } else if (matches.length === 1) {
            const match = matches[0];
            if (match.ip && match.ip !== camera.ip) {
                console.log(`[IdentityTracker] Camera ${camera.id} found at new IP ${match.ip}. Updating...`);
                await this.cameraService.update(camera.id, { 
                    ip: match.ip, 
                    last_known_ip: camera.ip, 
                    identity_status: 'ip_changed' 
                });
                // TODO: trigger probe again
            } else {
                console.log(`[IdentityTracker] Camera ${camera.id} matched at current IP. Marking reconnecting...`);
                await this.cameraService.update(camera.id, { identity_status: 'reconnecting' });
            }
        } else {
            console.log(`[IdentityTracker] Multiple matches found for camera ${camera.id}. Ambiguous match.`);
            await this.cameraService.update(camera.id, { identity_status: 'ambiguous_match' });
        }
    }
}
