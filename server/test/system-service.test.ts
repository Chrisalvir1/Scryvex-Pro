import assert from 'assert';
import { SystemService } from '../src/api/system-service';
import { Pool } from 'pg';

async function runTests() {
    console.log('[Test] Starting SystemService tests...');
    
    // We pass a dummy pool, we won't execute db queries in unit test
    const service = new SystemService({} as Pool);

    console.log('[Test] Sanitize URL credentials...');
    const url = 'rtsp://admin:secret123@192.168.1.50:554/stream1';
    const sanitizedUrl = service.sanitizeMediaDiagnosticMessage(url);
    assert.strictEqual(sanitizedUrl, 'rtsp://***:***@192.168.1.50:554/stream1');

    console.log('[Test] Sanitize Object keys...');
    const obj = {
        host: '192.168.1.50',
        puerto: 554,
        url: 'rtsp://admin:secret123@192.168.1.50:554/stream1',
        exitCode: 1,
        details: 'Failed to connect to rtsp://admin:secret123@192.168.1.50:554/stream1'
    };
    
    const sanitizedObj = service.sanitizeMediaDiagnosticMessage(obj);
    assert.strictEqual(sanitizedObj.host, '192.168.1.50'); // Preserved safe key
    assert.strictEqual(sanitizedObj.puerto, 554); // Preserved safe key
    assert.strictEqual(sanitizedObj.exitCode, 1); // Preserved safe key
    assert.strictEqual(sanitizedObj.url, 'rtsp://***:***@192.168.1.50:554/stream1'); // Sanitized
    assert.strictEqual(sanitizedObj.details, 'Failed to connect to rtsp://***:***@192.168.1.50:554/stream1'); // Sanitized
    
    console.log('[Test] All SystemService unit tests passed.');
}

runTests().catch(e => {
    console.error('Test failed', e);
    process.exit(1);
});
