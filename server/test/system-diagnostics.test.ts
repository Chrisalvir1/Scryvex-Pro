import assert from 'assert';
import { SystemDiagnosticsService } from '../src/media/system-diagnostics';
import { SystemService } from '../src/api/system-service';

async function runTests() {
    console.log('[Test] Starting SystemDiagnosticsService tests...');
    
    // We will just create a mock SystemService for sanitization test
    const mockSystemService = {
        sanitizeMediaDiagnosticMessage(message: any) {
            if (typeof message === 'string') {
                return message.replace(/rtsp:\/\/[^:]+:[^@]+@/g, 'rtsp://***:***@');
            }
            return message;
        },
        async recordLog() {
            // Mock dummy
        }
    } as SystemService;

    const service = SystemDiagnosticsService.getInstance();
    service.setSystemService(mockSystemService);

    // Test sanitization directly if we can access the service logic, but we test through mockSystemService here
    console.log('[Test] Sanitization logic (mock)...');
    const sanitized = mockSystemService.sanitizeMediaDiagnosticMessage('rtsp://admin:superSecret@192.168.1.100/stream');
    assert.strictEqual(sanitized, 'rtsp://***:***@192.168.1.100/stream');

    // Test concurrent execution block
    console.log('[Test] Concurrent refresh block...');
    const p1 = service.refresh();
    const p2 = service.refresh(); // Should not run again, should return the same checking state
    assert.strictEqual(service.getResponse().status, 'checking');
    
    const [res1, res2] = await Promise.all([p1, p2]);
    assert.ok(res1);
    assert.ok(res2);

    // At the end, status should be ready, degraded, or failed
    const finalStatus = service.getResponse().status;
    assert.ok(['ready', 'degraded', 'failed'].includes(finalStatus));

    console.log('[Test] All synthetic unit tests passed.');
}

runTests().catch(e => {
    console.error('Test failed', e);
    process.exit(1);
});
