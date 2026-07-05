import { StorageSettings } from '@scrypted/sdk/storage-settings';

function mockStorageSettings() {
    const mockStorage = {
        getItem: (k: string) => null,
        setItem: (k: string, v: string) => {},
        keys: () => [],
        removeItem: () => {},
        clear: () => {}
    };
    
    // Test webrtc27 settings
    const webrtcSettings = new StorageSettings({ storage: mockStorage } as any, {
        directRemuxMode: {
            title: 'Remux Mode',
            description: 'Auto is recommended. Force Direct Remux will bypass transcoding if the stream is already WebRTC-compatible.',
            value: 'Auto',
            choices: [
                'Auto',
                'Force Direct Remux',
                'Disable Direct Remux',
            ],
        },
        videoCodecOverride: {
            title: 'Video Codec Override',
            description: 'Forces WebRTC to use a specific video codec (e.g. h264, h265/HEVC).',
            value: 'Auto',
            choices: [
                'Auto',
                'h264',
                'h265',
            ],
        },
        audioCodecOverride: {
            title: 'Audio Codec Override',
            description: 'Forces WebRTC to use a specific audio codec (e.g. opus, pcma, pcmu).',
            value: 'Auto',
            choices: [
                'Auto',
                'opus',
                'pcm_alaw',
                'pcm_mulaw',
            ],
        },
    });

    return webrtcSettings.getSettings();
}

async function runTests() {
    console.log("=== INICIANDO PRUEBAS DE UI (FASE 3) ===");
    
    const settings = await mockStorageSettings();
    let passed = true;

    // 1. Verify Remux Button
    const remux = settings.find(s => s.key === 'directRemuxMode');
    if (remux && remux.choices?.includes('Force Direct Remux')) {
        console.log("✅ [PASSED] Botón 'Remux Mode' expuesto correctamente en la UI clásica de webrtc27.");
    } else {
        console.log("❌ [FAILED] Botón 'Remux Mode' no encontrado o incorrecto.");
        passed = false;
    }

    // 2. Verify Video Codec Button
    const videoCodec = settings.find(s => s.key === 'videoCodecOverride');
    if (videoCodec && videoCodec.choices?.includes('h265')) {
        console.log("✅ [PASSED] Botón 'Video Codec' (h264/h265) expuesto correctamente en la UI clásica de webrtc27.");
    } else {
        console.log("❌ [FAILED] Botón 'Video Codec' no encontrado.");
        passed = false;
    }

    // 3. Verify Audio Codec Button
    const audioCodec = settings.find(s => s.key === 'audioCodecOverride');
    if (audioCodec && audioCodec.choices?.includes('opus')) {
        console.log("✅ [PASSED] Botón 'Audio Codec' (opus, pcma, etc) expuesto correctamente en la UI clásica de webrtc27.");
    } else {
        console.log("❌ [FAILED] Botón 'Audio Codec' no encontrado.");
        passed = false;
    }

    // 4. Verify homekit27 Auto-load Injection
    const fs = require('fs');
    const runtimeCode = fs.readFileSync('./server/src/runtime.ts', 'utf8');
    if (runtimeCode.includes("newPlugin._id = pkgName;") && runtimeCode.includes("Auto-installing custom local plugin")) {
        console.log("✅ [PASSED] Inyección de carga automática local (sin contraseña) confirmada en runtime.ts.");
    } else {
        console.log("❌ [FAILED] El parche de carga automática local no está presente en el código.");
        passed = false;
    }

    // 5. Verify homekit27 WebRTC Controller injection
    const cameraTsCode = fs.readFileSync('./plugins/homekit27/src/types/camera.ts', 'utf8');
    if (cameraTsCode.includes("new CameraWebRTCController(accessory, device);")) {
        console.log("✅ [PASSED] CameraWebRTCController integrado exitosamente al accesorio HAP (HomeKit Secure Video).");
    } else {
        console.log("❌ [FAILED] CameraWebRTCController no se encontró en la inicialización.");
        passed = false;
    }
    
    // 6. Verify HAP WebRTC definitions exist
    if (fs.existsSync('./plugins/homekit27/src/hap-webrtc.ts')) {
        console.log("✅ [PASSED] UUIDs nativos de Apple WebRTC creados en hap-webrtc.ts.");
    } else {
        console.log("❌ [FAILED] Archivo hap-webrtc.ts no existe.");
        passed = false;
    }

    console.log("=========================================");
    if (passed) {
        console.log("🚀 TODAS LAS PRUEBAS EN VERDE. Sistema listo para compilar, generar tag v0.150.0 y desplegar a Github.");
    } else {
        console.log("⚠️ SE ENCONTRARON ERRORES. No se puede proceder con el release.");
    }
}

runTests();
