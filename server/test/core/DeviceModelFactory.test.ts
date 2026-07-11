import { DeviceModelFactory } from '../../src/core/DeviceModelFactory';
import { RawDeviceSnapshot } from '@scryvex/contracts';

describe('DeviceModelFactory', () => {
    it('generates different hashes for different configurations', () => {
        const factory = new DeviceModelFactory();

        const baseSnapshot: RawDeviceSnapshot = {
            id: 'cam1',
            pluginId: 'test-plugin',
            name: 'Camera 1',
            interfaces: ['Camera', 'VideoCamera'],
            settings: [
                { key: 'resolution', type: 'string', value: '1080p' },
                { key: 'password', type: 'password', secret: true, configured: true, value: null }
            ],
            mediaOptions: [
                { id: 'stream1', name: 'Main Stream', video: { codec: 'h264' } }
            ],
            readErrors: []
        };

        const modelBase = factory.buildFromSnapshot(baseSnapshot);

        // Change value
        const valSnapshot = { ...baseSnapshot, settings: [{ ...baseSnapshot.settings[0], value: '4K' }, baseSnapshot.settings[1]] };
        const modelVal = factory.buildFromSnapshot(valSnapshot);
        expect(modelBase.revision).not.toEqual(modelVal.revision);

        // Change codec
        const codecSnapshot = { ...baseSnapshot, mediaOptions: [{ ...baseSnapshot.mediaOptions[0], video: { codec: 'h265' } }] };
        const modelCodec = factory.buildFromSnapshot(codecSnapshot);
        expect(modelBase.revision).not.toEqual(modelCodec.revision);

        // Change name
        const nameSnapshot = { ...baseSnapshot, name: 'Camera 2' };
        const modelName = factory.buildFromSnapshot(nameSnapshot);
        expect(modelBase.revision).not.toEqual(modelName.revision);
    });

    it('propagates partial diagnostics and read errors', () => {
        const factory = new DeviceModelFactory();

        const snapshot: RawDeviceSnapshot = {
            id: 'cam1',
            pluginId: 'test',
            name: 'Cam 1',
            interfaces: [],
            settings: [],
            mediaOptions: [],
            readErrors: [
                { source: 'media', code: 'TIMEOUT', message: 'Read timeout', occurredAt: '2025' }
            ]
        };

        const model = factory.buildFromSnapshot(snapshot);
        expect(model.diagnostics.partial).toBe(true);
        expect(model.diagnostics.readErrors.length).toBe(1);
        expect(model.diagnostics.readErrors[0].code).toBe('TIMEOUT');
    });
});
