import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { CameraService, CreateCameraInput } from './camera-service';
import { CameraStreamController } from './camera-stream-controller';
import { CameraProbe } from './camera-probe';
import { MatterPairingService } from './matter-pairing';


/**
 * Mounts REST endpoints for camera CRUD under /api/cameras.
 * All routes require the user to be authenticated (handled by parent app middleware).
 */
export function createCamerasRouter(
    cameraService: CameraService, 
    pool: Pool, 
    getWsBridge: () => import('./cameras-ws').CamerasWebSocketBridge | undefined
): Router {
    const router = Router();
    const streamController = new CameraStreamController(cameraService);
    const probeService = new CameraProbe(cameraService);
    const matterService = new MatterPairingService(pool);

    // GET /api/cameras — list all cameras (no passwords returned)
    router.get('/', async (_req: Request, res: Response) => {
        try {
            const cameras = await cameraService.findAll();
            res.json({ cameras });
        } catch (err: any) {
            console.error('[cameras-router] GET /api/cameras error:', err.message);
            res.status(500).json({ error: 'Failed to fetch cameras', detail: err.message });
        }
    });

    // GET /api/cameras/:id/events — recent events for a camera
    router.get('/:id/events', async (req: Request, res: Response) => {
        try {
            const id    = String(req.params['id']);
            const raw   = req.query['limit'];
            const limit = Math.min(parseInt(Array.isArray(raw) ? String(raw[0]) : (raw as string) ?? '50'), 200);
            const events = await cameraService.getRecentEvents(id, limit);
            res.json({ events });
        } catch (err: any) {
            console.error('[cameras-router] GET events error:', err.message);
            res.status(500).json({ error: 'Failed to fetch events', detail: err.message });
        }
    });

    // POST /api/cameras — add a new camera
    router.post('/', async (req: Request, res: Response) => {
        try {
            const body = req.body as CreateCameraInput;

            // Validate required fields
            if (!body.name || !body.ip || !body.port || !body.protocol) {
                res.status(400).json({
                    error: 'Missing required fields: name, ip, port, protocol',
                });
                return;
            }

            // Validate protocol
            if (!['RTSP', 'ONVIF'].includes(body.protocol)) {
                res.status(400).json({ error: 'protocol must be RTSP or ONVIF' });
                return;
            }

            // Validate RTSP URL format if provided
            if (body.rtsp_url && !body.rtsp_url.startsWith('rtsp://')) {
                res.status(400).json({ error: 'rtsp_url must start with rtsp://' });
                return;
            }

            const camera = await cameraService.create(body);
            getWsBridge()?.broadcastCamerasUpdated('camera.created', camera.id);
            res.status(201).json({ camera });
            void probeService.runProbe(camera.id).then(() => getWsBridge()?.broadcastCamerasUpdated('camera.updated', camera.id)).catch(error => console.error('[cameras-router] async discovery failed:', error.message));
        } catch (err: any) {
            console.error('[cameras-router] POST /api/cameras error:', err.message);
            res.status(500).json({ error: 'Failed to create camera', detail: err.message });
        }
    });

    router.post('/:id/discover', async (req, res) => { try { res.json({ capabilities: await probeService.runProbe(req.params.id) }); } catch (err: any) { res.status(502).json({ error: err.message }); } });
    router.get('/:id/capabilities', async (req, res) => { const camera = await cameraService.findById(req.params.id); if (!camera) { res.status(404).json({ error: 'Camera not found' }); return; } res.json({ capabilities: camera.capabilities, discovery_status: camera.discovery_status, last_error: camera.last_error }); });
    router.post('/:id/test-connection', async (req, res) => { try { const camera = await cameraService.findById(req.params.id); if (!camera) { res.status(404).json({ error: 'Camera not found' }); return; } const adapter = new CameraProbe(cameraService); const capabilities = await adapter.runProbe(camera.id); res.json({ success: capabilities.discoveryStatus === 'online', status: capabilities.discoveryStatus }); } catch (err: any) { res.status(502).json({ success: false, status: 'error', error: err.message }); } });
    router.get('/:id/logs', async (req, res) => { res.json({ logs: await cameraService.getLogs(req.params.id) }); });
    router.delete('/:id/logs', async (req, res) => { await cameraService.clearLogs(req.params.id); res.json({ success: true }); });
    router.get('/:id/logs/download', async (req, res) => { const logs = await cameraService.getLogs(req.params.id); res.type('text/plain').send(logs.map(log => `[${log.created_at}] ${log.event} ${JSON.stringify(log.metadata)}`).join('\n')); });
    router.put('/:id/stream-profile', async (req, res) => { try { res.json({ profile: await cameraService.selectStreamProfile(String(req.params.id), String(req.body.profileId)) }); } catch (err: any) { res.status(400).json({ error: err.message }); } });
    router.put('/:id/audio-profile', async (req, res) => { try { res.json({ codec: await cameraService.selectAudioProfile(String(req.params.id), String(req.body.codec)) }); } catch (err: any) { res.status(400).json({ error: err.message }); } });
    router.post('/:id/preview/session', async (_req, res) => { res.status(501).json({ error: 'Preview WebRTC/HLS no está disponible; usa /snapshot cuando la cámara lo soporte' }); });
    router.delete('/:id/preview/session', async (_req, res) => { res.status(501).json({ error: 'No hay sesiones de preview activas' }); });

    // DELETE /api/cameras/:id — remove a camera and its events (CASCADE)
    router.delete('/:id', async (req: Request, res: Response) => {
        try {
            const id      = String(req.params['id']);
            const deleted = await cameraService.delete(id);
            if (!deleted) {
                res.status(404).json({ error: 'Camera not found' });
                return;
            }
            getWsBridge()?.broadcastCamerasUpdated('camera.deleted', id);
            // 204 or 200, let's keep the existing pattern
            res.json({ success: true, id });
        } catch (err: any) {
            console.error('[cameras-router] DELETE /api/cameras error:', err.message);
            res.status(500).json({ error: 'Failed to delete camera', detail: err.message });
        }
    });

    // ── Stream Controls ────────────────────────────────────────────────────────

    router.post('/:id/stream/start', async (req, res) => {
        try {
            await streamController.startStream(req.params.id);
            res.json({ success: true, message: 'Stream started' });
        } catch (err: any) {
            console.error('[cameras-router] Start stream error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/:id/stream/stop', (req, res) => {
        streamController.stopStream(req.params.id);
        res.json({ success: true, message: 'Stream stopped' });
    });

    // ── Codec Probe / Analytics ────────────────────────────────────────────────

    router.get('/:id/probe', async (req, res) => {
        try {
            // Probe data is always discovered from the configured adapter.
            let data = await probeService.getProbeData(req.params.id);
            if (!data) {
                data = await probeService.runProbe(req.params.id);
            }
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/:id/probe/hevc', async (req, res) => {
        try {
            const data = await probeService.toggleHEVC(req.params.id, req.body.enabled);
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:id/snapshot', async (req, res) => {
        const camera = await cameraService.findById(req.params.id); if (!camera) { res.status(404).json({ error: 'Camera not found' }); return; }
        const profile = camera.stream_profiles.find(p => p.id === camera.capabilities.video.selectedProfileId) ?? camera.stream_profiles[0];
        if (profile?.snapshotUri) { try { const response = await fetch(profile.snapshotUri); if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`); res.type('image/jpeg').send(Buffer.from(await response.arrayBuffer())); return; } catch (error) { await cameraService.recordLog(camera.id, 'camera.snapshot.failed', { error: String(error) }); } }
        res.status(404).json({ error: 'No hay snapshot disponible para esta cámara' });
    });

    // ── Matter Integration Endpoint ────────────────────────────────────────────

    router.get('/:id/matter/pairing', async (req, res) => {
        try {
            const data = await matterService.generateCommissioningWindow(req.params.id);
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.get('/:id/matter/status', async (req, res) => {
        try {
            const data = await matterService.getPairingStatus(req.params.id);
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.delete('/:id/matter/unpair', async (req, res) => {
        try {
            const data = await matterService.unpair(req.params.id);
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // GET /api/cameras/matter/devices — dedicated endpoint for Matterbridge to consume
    router.get('/matter/devices', async (req: Request, res: Response) => {
        try {
            const cameras = await cameraService.findAll();
            
            // Format cameras strictly matching the Matter object model
            const matterDevices = cameras.filter(cam => cam.capabilities?.matter?.available).map(cam => ({
                id: cam.id,
                deviceType: 'VideoCamera',
                name: cam.matter_device_name || cam.name,
                vendorId: cam.matter_vendor_id,
                productId: cam.matter_product_id,
                endpoints: {
                    video: {
                        codecs: cam.capabilities.video.profiles.map(profile => profile.codec).filter(Boolean),
                        resolutions: cam.capabilities.video.profiles,
                        rtsp_url: cam.rtsp_url
                    },
                    audio: {
                        codec: cam.capabilities.audio.codecs,
                        samplerate: cam.capabilities.audio.sampleRates
                    },
                    networking: {
                        ipv4Address: cam.ip,
                        port: cam.port,
                        forceIpv4: true // Ensures Matter handles Ethernet or Wi-Fi identically via IPv4
                    }
                },
                capabilities: cam.capabilities,
                status: cam.status
            }));

            res.json({ devices: matterDevices });
        } catch (err: any) {
            console.error('[cameras-router] GET /api/cameras/matter/devices error:', err.message);
            res.status(500).json({ error: 'Failed to fetch Matter devices' });
        }
    });

    // ── YOLOv10 Endpoint ──────────────────────────────────────────────────────

    router.put('/:id/yolo', async (req: Request, res: Response) => {
        try {
            const camera = await cameraService.findById(String(req.params.id));
            if (!camera?.capabilities.yolo.available) { res.status(409).json({ available: false, reason: camera?.capabilities.yolo.reason ?? 'Runtime YOLO no disponible en esta arquitectura' }); return; }
            res.status(501).json({ available: false, reason: 'El detector no está registrado' });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    return router;
}
