import test from 'node:test';
import assert from 'node:assert';
import { DefaultMediaProcessRunner } from '../src/media/media-process-runner.js';
import { PassThrough } from 'stream';

test('MediaProcessRunner: backpressure and infinite stream (>8MiB) via pipe', async () => {
    const runner = new DefaultMediaProcessRunner();
    
    // Un stream simulando la respuesta http lenta
    const slowClient = new PassThrough({ highWaterMark: 1024 * 1024 }); // 1MB buffer
    
    let receivedBytes = 0;
    slowClient.on('data', (chunk) => {
        receivedBytes += chunk.length;
    });

    const ac = new AbortController();

    // Generar flujo infinito rápido (ej: dd if=/dev/zero) y volcarlo a slowClient
    // En mac/linux, yes o head -c 10M /dev/urandom es rápido
    const { process: ff, promise } = runner.spawnStreaming({
        command: 'head',
        args: ['-c', '10000000', '/dev/zero'], // Generar ~10MB de ceros
        outputStream: slowClient,
        signal: ac.signal,
    });

    await promise;

    assert.ok(receivedBytes > 8 * 1024 * 1024, 'Debe recibir más de 8MiB sin ser matado por tamaño');
});
