import { PluginRepository } from '../../src/core/PluginRepository';
import { RuntimeBoundary } from '../../src/core/RuntimeBoundary';

describe('PluginRepository', () => {
    it('safely sanitizes cyclic objects, limits depth, and removes getters', async () => {
        const cyclicObj: any = { a: 1 };
        cyclicObj.self = cyclicObj;

        const deepObj: any = { level1: { level2: { level3: { level4: { level5: { level6: { level7: { level8: { level9: { level10: 'deep' } } } } } } } } } };

        const objWithGetter = {
            a: 'normal',
            get b() { throw new Error('Should not be called'); }
        };

        const mockRuntime: RuntimeBoundary = {
            devices: {
                'cam1': {
                    proxy: {
                        id: 'cam1',
                        getSettings: async () => [
                            { key: 'cyclic', value: cyclicObj },
                            { key: 'deep', value: deepObj },
                            { key: 'getter', value: objWithGetter },
                            { key: 'creds', value: 'http://user:password123@192.168.1.100/video' }
                        ]
                    }
                }
            }
        };

        const repo = new PluginRepository(mockRuntime);
        const snapshot = await repo.getRawSnapshot('cam1');
        
        expect(snapshot).toBeDefined();
        if (!snapshot) return;

        const cyclicSetting = snapshot.settings.find(s => s.key === 'cyclic');
        expect(cyclicSetting?.value).toEqual({ a: 1, self: '[Circular]' });

        const deepSetting = snapshot.settings.find(s => s.key === 'deep');
        expect(JSON.stringify(deepSetting?.value)).toContain('[Max Depth Exceeded]');

        const getterSetting = snapshot.settings.find(s => s.key === 'getter');
        expect(getterSetting?.value).toEqual({ a: 'normal' }); // b should be omitted

        const credsSetting = snapshot.settings.find(s => s.key === 'creds');
        expect(credsSetting?.value).toEqual('http://***:***@192.168.1.100/video');
    });

    it('redacts secrets correctly and sets configured flag', async () => {
        const mockRuntime: RuntimeBoundary = {
            devices: {
                'cam1': {
                    proxy: {
                        id: 'cam1',
                        getSettings: async () => [
                            { key: 'adminPassword', value: 'secret123', type: 'string' },
                            { key: 'someToken', value: null, type: 'string' },
                            { key: 'normalKey', value: 'hello', type: 'string' }
                        ]
                    }
                }
            }
        };

        const repo = new PluginRepository(mockRuntime);
        const snapshot = await repo.getRawSnapshot('cam1');
        
        expect(snapshot).toBeDefined();
        if (!snapshot) return;

        const passSetting = snapshot.settings.find(s => s.key === 'adminPassword');
        expect(passSetting?.value).toBeNull();
        expect(passSetting?.secret).toBe(true);
        expect(passSetting?.configured).toBe(true);

        const tokenSetting = snapshot.settings.find(s => s.key === 'someToken');
        expect(tokenSetting?.value).toBeNull();
        expect(tokenSetting?.secret).toBe(true);
        expect(tokenSetting?.configured).toBe(false);

        const normalSetting = snapshot.settings.find(s => s.key === 'normalKey');
        expect(normalSetting?.value).toBe('hello');
        expect(normalSetting?.secret).toBe(false);
        expect(normalSetting?.configured).toBe(true);
    });
});
