import assert from 'assert';
import { CameraMediaProvider, MediaSourceDescriptor } from '../src/media/media-source';
import { MediaSourceSessionManager } from '../src/media/media-session-manager';
import { MediaInputResolverRegistry, RtspInputResolver } from '../src/media/media-resolvers';

class MockRTSPProvider implements CameraMediaProvider {
    async getMediaSources(deviceId: string, signal?: AbortSignal): Promise<MediaSourceDescriptor[]> {
        return [
            {
                id: 'stream1',
                sourceType: 'rtsp',
                transport: 'tcp',
                deviceId,
                uriRef: 'rtsp://mock-camera/stream1',
                expirationMs: Date.now() + 100
            }
        ];
    }
}

async function runTests() {
    console.log('[Test] Starting Contract tests...');

    const provider = new MockRTSPProvider();
    const registry = new MediaInputResolverRegistry();
    registry.register(new RtspInputResolver());

    const manager = new MediaSourceSessionManager((_, __) => provider, registry);

    // Test successful resolution
    const resolved = await manager.getResolvedInput('cam1', 'stream1');
    assert.strictEqual(resolved.kind, 'rtsp');
    assert.ok(resolved.ffmpegInputArguments.includes('rtsp://mock-camera/stream1'));

    console.log('[Test] Contract tests passed.');
}

runTests().catch(e => {
    console.error('Test failed', e);
    process.exit(1);
});
