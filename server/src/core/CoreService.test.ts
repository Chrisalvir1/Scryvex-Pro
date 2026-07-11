import { PluginRepository } from './PluginRepository';
import { DeviceModelFactory } from './DeviceModelFactory';

describe('CoreService Universal Architecture', () => {
    let mockRuntime: any;
    let pluginRepo: PluginRepository;
    let factory: DeviceModelFactory;

    beforeEach(() => {
        mockRuntime = {
            plugins: { 'test-plugin': {} },
            devices: {
                'cam1': {
                    proxy: {
                        id: 'cam1',
                        pluginId: 'test-plugin',
                        name: 'Test Camera',
                        interfaces: ['VideoCamera', 'MotionSensor'],
                        info: { manufacturer: 'TestBrand', model: 'TestModel' },
                        getSettings: jest.fn().mockResolvedValue([
                            { key: 'ip', type: 'string', value: '192.168.1.100' },
                            { key: 'password', type: 'password', value: 'my-super-secret' }
                        ]),
                        getVideoStreamOptions: jest.fn().mockResolvedValue([
                            { id: 'main', name: 'Main Stream', video: { codec: 'h264' } }
                        ])
                    }
                }
            }
        };
        pluginRepo = new PluginRepository(mockRuntime);
        factory = new DeviceModelFactory(pluginRepo);
    });

    test('PluginRepository isolates runtime access', () => {
        expect(pluginRepo.getRawPlugins()).toEqual(['test-plugin']);
        expect(pluginRepo.getRawDevice('cam1')).toBeDefined();
    });

    test('DeviceModelFactory normalizes and redacts secrets', async () => {
        const proxy = pluginRepo.getRawDevice('cam1');
        const model = await factory.buildFromRaw(proxy as any);
        
        expect(model.id).toBe('cam1');
        expect(model.name).toBe('Test Camera');
        expect(model.capabilities).toContain('VideoCamera');
        expect(model.capabilities).toContain('MotionSensor');
        expect(model.capabilities).not.toContain('PTZ');
        
        // Ensure secrets are redacted
        const pwdSetting = model.settings.find(s => s.key === 'password');
        expect(pwdSetting?.value).toBeNull();
        expect(pwdSetting?.secret).toBe(true);
        expect(pwdSetting?.configured).toBe(true);

        const ipSetting = model.settings.find(s => s.key === 'ip');
        expect(ipSetting?.value).toBe('192.168.1.100');
        expect(ipSetting?.secret).toBe(false);
    });

    test('Handles missing proxy gracefully', () => {
        expect(pluginRepo.getRawDevice('does-not-exist')).toBeUndefined();
    });
});
