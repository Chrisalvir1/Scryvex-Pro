import { CameraMatterNode } from './camera-matter-node.js';

export class MatterRuntimeHost {
    private nodes = new Map<string, CameraMatterNode>();

    constructor(private readonly matterHome: string) {}

    async initialize() {
        console.log('[MatterRuntimeHost] Inicializando...');
    }

    async handleMessage(msg: any, socket: import('node:net').Socket) {
        console.log('[MatterRuntimeHost] Recibido mensaje:', msg);
        if (msg.action === 'PING') {
            socket.write(JSON.stringify({ status: 'OK' }) + '\n');
            return;
        }

        const cameraId = msg.cameraId;
        if (!cameraId) throw new Error('Missing cameraId');

        switch (msg.action) {
            case 'START_NODE': {
                let node = this.nodes.get(cameraId);
                if (!node) {
                    node = new CameraMatterNode(cameraId, this.matterHome);
                    this.nodes.set(cameraId, node);
                    await node.start(msg.capabilities);
                }
                socket.write(JSON.stringify({ success: true, status: node.getStatus() }) + '\n');
                break;
            }
            case 'STOP_NODE': {
                const node = this.nodes.get(cameraId);
                if (node) {
                    await node.stop();
                    this.nodes.delete(cameraId);
                }
                socket.write(JSON.stringify({ success: true }) + '\n');
                break;
            }
            case 'GET_STATUS': {
                const node = this.nodes.get(cameraId);
                socket.write(JSON.stringify({ success: true, status: node ? node.getStatus() : { state: 'offline' } }) + '\n');
                break;
            }
            case 'OPEN_COMMISSIONING': {
                const node = this.nodes.get(cameraId);
                if (!node) throw new Error('Node not started');
                const result = await node.openCommissioningWindow();
                socket.write(JSON.stringify({ success: true, ...result }) + '\n');
                break;
            }
            case 'CLOSE_COMMISSIONING': {
                const node = this.nodes.get(cameraId);
                if (node) await node.closeCommissioningWindow();
                socket.write(JSON.stringify({ success: true }) + '\n');
                break;
            }
            case 'REMOVE_FABRIC': {
                const node = this.nodes.get(cameraId);
                if (!node) throw new Error('Node not started');
                await node.removeFabric(msg.fabricIndex);
                socket.write(JSON.stringify({ success: true }) + '\n');
                break;
            }
            case 'FACTORY_RESET': {
                const node = this.nodes.get(cameraId);
                if (node) {
                    await node.factoryReset();
                    this.nodes.delete(cameraId);
                }
                socket.write(JSON.stringify({ success: true }) + '\n');
                break;
            }
            default:
                throw new Error(`Unknown action: ${msg.action}`);
        }
    }

    async destroy() {
        for (const [id, node] of this.nodes.entries()) {
            console.log(`[MatterRuntimeHost] Deteniendo nodo ${id}...`);
            await node.stop();
        }
        this.nodes.clear();
    }
}
