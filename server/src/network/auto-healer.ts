import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class NetworkAutoHealer {
    
    /**
     * Intercepts a dropped stream and attempts to heal the connection by scanning ARP for the known MAC address.
     */
    async healStreamConnection(cameraId: string, knownMacAddress: string, currentIp: string): Promise<string | null> {
        console.warn(`[Auto-Healer] Stream drop detected for Camera ${cameraId} (IP: ${currentIp}). Initiating MAC healing...`);
        
        try {
            // Read OS ARP Table (works on Linux/HAOS/macOS)
            const { stdout } = await execAsync('arp -a');
            
            // Parse ARP table to find the new IP associated with the known MAC
            const lines = stdout.split('\n');
            for (const line of lines) {
                if (line.toLowerCase().includes(knownMacAddress.toLowerCase())) {
                    // Extract IP (matches pattern like (192.168.1.50) or just 192.168.1.50 depending on OS)
                    const ipMatch = line.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
                    if (ipMatch) {
                        const newIp = ipMatch[0];
                        if (newIp !== currentIp) {
                            console.log(`[Auto-Healer] HEAL SUCCESS: Camera ${cameraId} found at new IP: ${newIp}`);
                            this.updateDatabase(cameraId, newIp);
                            return newIp;
                        } else {
                            console.log(`[Auto-Healer] IP hasn't changed. Camera might be physically offline.`);
                            return currentIp;
                        }
                    }
                }
            }
            
            console.error(`[Auto-Healer] MAC ${knownMacAddress} not found in ARP table. Host unreachable.`);
            return null;
        } catch (error) {
            console.error(`[Auto-Healer] Failed to read ARP table:`, error);
            return null;
        }
    }

    private updateDatabase(cameraId: string, newIp: string) {
        // Pseudo: Update PostgreSQL scryvex_core with new IP
        console.log(`[Postgres] Updating Camera ${cameraId} IP to ${newIp} in scryvex_core database.`);
    }
}
