import type { IncomingMessage } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { CameraService } from './camera-service';

export const CAMERAS_WS_PATH = '/api/ws/cameras';

export type NodeHttpServer = HttpServer | HttpsServer;

type UpgradeListener = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
) => void;

export interface WsEvent {
    type: string;
    payload?: unknown;
}

/**
 * WebSocket bridge for real-time camera events.
 * Clients connect to ws://host/api/ws/cameras
 *
 * The dispatcher REPLACES the existing upgrade listeners on the HTTP/HTTPS
 * server and re-dispatches non-Scryvex upgrades to the original Scrypted
 * listeners.  This prevents Express/finalhandler from receiving a Duplex
 * socket as if it were a ServerResponse (the crash seen in 2.1.33).
 */
export class CamerasWebSocketBridge {
    private readonly wss: WebSocketServer;
    private readonly attachedServers = new WeakSet<NodeHttpServer>();

    constructor(
        private readonly cameraService: CameraService,
    ) {
        this.wss = new WebSocketServer({ noServer: true });

        this.wss.on('connection', (socket: WebSocket) => {
            console.info(
                `[CamerasWS] Client connected (${this.wss.clients.size} total)`,
            );

            socket.send(JSON.stringify({
                type: 'connection.status',
                payload: { status: 'connected', transport: 'websocket' },
            }));

            socket.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw.toString());
                    if (msg.type === 'ping') {
                        socket.send(JSON.stringify({ type: 'pong', payload: null }));
                    }
                } catch {
                    // ignore parse errors from client
                }
            });

            socket.on('close', () => {
                console.info(
                    `[CamerasWS] Client disconnected (${this.wss.clients.size} remaining)`,
                );
            });

            socket.on('error', (error) => {
                console.error('[CamerasWS] Client error:', error.message);
            });
        });

        this.wss.on('error', (error) => {
            console.error('[CamerasWS] Server error:', error);
        });
    }

    /**
     * Attaches the WebSocket dispatcher to an HTTP or HTTPS server.
     *
     * Strategy:
     *   1. Snapshot the upgrade listeners already registered by Scrypted.
     *   2. Remove them all.
     *   3. Install a SINGLE new dispatcher that:
     *        a) Intercepts /api/ws/cameras — handled exclusively by Scryvex.
     *        b) Delegates everything else to the original Scrypted listeners.
     *
     * This guarantees the Duplex socket is NEVER passed to Express/finalhandler.
     */
    attachServer(server: NodeHttpServer): void {
        if (this.attachedServers.has(server)) {
            console.warn('[CamerasWS] attachServer ignored: server already attached');
            return;
        }

        // Snapshot existing listeners BEFORE we remove them
        const existingListeners = server.listeners('upgrade') as UpgradeListener[];
        server.removeAllListeners('upgrade');

        const dispatcher: UpgradeListener = (request, socket, head) => {
            const rawUrl = request.url ?? '/';

            let pathname: string;
            try {
                pathname = new URL(rawUrl, 'http://localhost').pathname;
            } catch {
                console.warn('[CamerasWS] Invalid upgrade URL:', rawUrl);
                if (!socket.destroyed) socket.destroy();
                return;
            }

            console.info('[CamerasWS] Upgrade request:', rawUrl);

            if (pathname === CAMERAS_WS_PATH) {
                // Exclusively ours — do NOT call Scrypted listeners after this
                this.wss.handleUpgrade(request, socket, head, (webSocket) => {
                    this.wss.emit('connection', webSocket, request);
                });
                return;
            }

            // Delegate all other upgrade paths to Scrypted's original listeners
            if (existingListeners.length > 0) {
                for (const listener of existingListeners) {
                    try {
                        listener.call(server, request, socket, head);
                    } catch (err) {
                        console.error('[CamerasWS] Delegated upgrade listener failed:', err);
                        if (!socket.destroyed) socket.destroy();
                        return;
                    }
                }
                return;
            }

            // No handler at all — close cleanly with 404
            console.warn('[CamerasWS] No handler for upgrade path:', pathname);
            if (!socket.destroyed) {
                socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
                socket.destroy();
            }
        };

        server.on('upgrade', dispatcher);
        this.attachedServers.add(server);

        console.info(
            `[CamerasWS] Bridge attached; preserved ${existingListeners.length} previous upgrade listener(s)`,
        );
    }

    broadcast(event: WsEvent): void {
        const serialized = JSON.stringify(event);

        for (const client of this.wss.clients) {
            if (client.readyState !== WebSocket.OPEN) continue;
            try {
                client.send(serialized);
            } catch (err) {
                console.error('[CamerasWS] Broadcast failed:', err);
            }
        }
    }

    broadcastCamerasUpdated(reason: string, cameraId: string): void {
        this.broadcast({
            type: 'cameras.updated',
            payload: { reason, cameraId },
        });
    }

    /** Backward-compat alias used by camera-router */
    broadcastListUpdate(): void {
        this.broadcast({ type: 'camera_list_updated', payload: null });
    }

    get connectedClients(): number {
        return this.wss.clients.size;
    }
}
