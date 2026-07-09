import net from 'net';

export class MatterNetworkScanner {
    private currentPort = 55600;

    async findFreePort(): Promise<number> {
        return new Promise((resolve) => {
            const server = net.createServer();
            
            server.on('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    this.currentPort++;
                    resolve(this.findFreePort());
                }
            });

            server.listen(this.currentPort, '0.0.0.0', () => {
                const port = (server.address() as net.AddressInfo).port;
                server.close(() => {
                    this.currentPort = port + 1; // Increment for the next call
                    resolve(port);
                });
            });
        });
    }

    generateRotatingPin(): string {
        // Rotating 10-minute PIN for Matter Setup
        const seed = Math.floor(Date.now() / (1000 * 60 * 10)); // 10 minute windows
        let pin = (seed * 1103515245 + 12345) % 99999999;
        return pin.toString().padStart(8, '0');
    }
}
