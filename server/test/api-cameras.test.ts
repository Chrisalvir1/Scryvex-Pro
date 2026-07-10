import test from 'node:test';
import assert from 'node:assert';

test('API Cameras Tests', async (t) => {
    let registeredHandler: any;
    let registeredPreviewHandler: any;

    const mockRouter: any = {
        post: (path: string, handler: any) => {
            if (path === '/test-onvif-port') {
                registeredHandler = handler;
            }
        },
        get: (path: string, handler: any) => {
            if (path === '/:id/preview.mjpeg') {
                registeredPreviewHandler = handler;
            }
        },
        put: () => {},
        delete: () => {},
        patch: () => {},
        use: () => {},
    };

    const mockOnvifAdapter = {
        testConnection: async (host: string, ports: number[], user?: string, pass?: string) => {
            if (host === '192.168.1.100') {
                return { success: true, host, port: ports[0], onvif_port: ports[0] };
            }
            throw new Error('Connection failed');
        }
    };

    const { createCamerasRouter } = require('../src/api/cameras-router.js');
    
    const express = require('express');
    const originalRouter = express.Router;
    express.Router = () => mockRouter;

    createCamerasRouter(
        { recordLog: async () => {} } as any, // cameraService
        {} as any, // pgPool
        () => undefined, // getWsBridge
        {
            probeService: {} as any,
            previewService: {
                startMjpeg: async () => { throw new Error('Fail after headers'); }
            } as any,
            onvifAdapter: mockOnvifAdapter,
            providerRegistry: {} as any,
            resolverRegistry: {} as any,
            secretStore: {} as any,
            mediaProbe: {} as any,
            sessionManager: {} as any,
        }
    );
    express.Router = originalRouter;

    await t.test('POST /api/cameras/test-onvif-port - payload exacto frontend', async () => {
        let status = 200;
        let jsonBody: any;
        const req = {
            body: {
                ip: '192.168.1.100',
                onvif_port: 8080,
                username: 'admin',
                password: 'password123'
            }
        };
        const res = {
            status: (s: number) => { status = s; return res; },
            json: (b: any) => { jsonBody = b; }
        };
        await registeredHandler(req, res);
        assert.equal(status, 200);
        assert.deepEqual(jsonBody, { success: true, host: '192.168.1.100', port: 8080, onvif_port: 8080 });
    });

    await t.test('POST /api/cameras/test-onvif-port - fallback a 502 en error', async () => {
        let status = 200;
        let jsonBody: any;
        const req = {
            body: {
                host: '10.0.0.1',
                port: 80,
            }
        };
        const res = {
            status: (s: number) => { status = s; return res; },
            json: (b: any) => { jsonBody = b; }
        };
        await registeredHandler(req, res);
        assert.equal(status, 502);
        assert.equal(jsonBody.success, false);
        assert.equal(jsonBody.message, 'Connection failed');
    });

    await t.test('GET /api/cameras/1/preview.mjpeg - proteger 502 post-headers', async () => {
        let status = 200;
        let jsonBody: any;
        let headersSent = true;
        const req = {
            params: { id: '1' }
        };
        const res = {
            get headersSent() { return headersSent; },
            status: (s: number) => { status = s; return res; },
            json: (b: any) => { jsonBody = b; }
        };
        await registeredPreviewHandler(req, res);
        assert.equal(status, 200);
        assert.equal(jsonBody, undefined);
    });
});
