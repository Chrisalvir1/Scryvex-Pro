import { ScryptedDevice } from '@scrypted/types';
import type { RawDeviceSnapshot, DeviceReadError, RawSettingSnapshot, RawMediaOptionSnapshot } from '@scryvex/contracts';

import { RuntimeBoundary, isRuntimeDevice, RuntimeDeviceBoundary } from './RuntimeBoundary';

/**
 * El PluginRepository es el ÚNICO componente autorizado en toda
 * la arquitectura para tocar o referenciar el Runtime de Scrypted.
 */
export class PluginRepository {
    constructor(private readonly runtime: RuntimeBoundary) {}

    getRawPlugins(): string[] {
        return Object.keys(this.runtime.plugins || {});
    }

    getDeviceIds(): string[] {
        return Object.keys(this.runtime.devices || {});
    }

    async getRawSnapshot(id: string): Promise<RawDeviceSnapshot | undefined> {
        const pair = this.runtime.devices?.[id];
        if (!pair || !pair.proxy) return undefined;

        const proxy = pair.proxy;
        if (!isRuntimeDevice(proxy)) return undefined;

        const readErrors: DeviceReadError[] = [];
        
        const withTimeout = async <T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> => {
            let timeoutHandle: NodeJS.Timeout;
            const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutHandle = setTimeout(() => reject(new Error(errorMsg)), ms);
            });
            return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
        };

        let settings: RawSettingSnapshot[] = [];
        if (typeof proxy.getSettings === 'function') {
            try {
                const raw = await withTimeout(proxy.getSettings(), 5000, 'SETTINGS_READ_TIMEOUT');
                if (Array.isArray(raw)) {
                    settings = raw.map((r: any) => ({
                        key: String(r?.key || ''),
                        title: r?.title,
                        description: r?.description,
                        type: String(r?.type || 'unknown'),
                        value: r?.value,
                        choices: Array.isArray(r?.choices) ? r.choices.map(String) : undefined,
                        group: r?.group,
                        subgroup: r?.subgroup,
                        advanced: Boolean(r?.advanced),
                        hidden: Boolean(r?.hidden),
                        readonly: Boolean(r?.readonly),
                        restartRequired: Boolean(r?.restartRequired),
                        placeholder: r?.placeholder,
                        range: Array.isArray(r?.range) ? [Number(r.range[0]), Number(r.range[1])] as [number, number] : undefined,
                        multiple: Boolean(r?.multiple),
                        combobox: Boolean(r?.combobox),
                        deviceFilter: r?.deviceFilter
                    }));
                }
            } catch (e: unknown) {
                const err = e as { code?: string; message?: string };
                readErrors.push({
                    source: 'settings',
                    code: err?.code || 'READ_ERROR',
                    message: this.sanitizeUrlAndStrings(err?.message || String(e)),
                    occurredAt: new Date().toISOString()
                });
            }
        }

        let mediaOptions: RawMediaOptionSnapshot[] = [];
        if (typeof proxy.getVideoStreamOptions === 'function') {
            try {
                const raw = await withTimeout(proxy.getVideoStreamOptions(), 5000, 'MEDIA_READ_TIMEOUT');
                if (Array.isArray(raw)) {
                    mediaOptions = raw.map((r: any) => ({
                        id: String(r?.id || ''),
                        name: r?.name ? String(r.name) : undefined,
                        video: r?.video ? { codec: String(r.video.codec || '') } : undefined,
                        audio: r?.audio ? { codec: String(r.audio.codec || '') } : undefined,
                        container: r?.container ? String(r.container) : undefined,
                        width: r?.width ? Number(r.width) : undefined,
                        height: r?.height ? Number(r.height) : undefined,
                        fps: r?.fps ? Number(r.fps) : undefined,
                        bitrate: r?.bitrate ? Number(r.bitrate) : undefined,
                        source: r?.source ? String(r.source) : undefined,
                        purpose: r?.purpose ? String(r.purpose) : undefined
                    }));
                }
            } catch (e: unknown) {
                const err = e as { code?: string; message?: string };
                readErrors.push({
                    source: 'media',
                    code: err?.code || 'READ_ERROR',
                    message: this.sanitizeUrlAndStrings(err?.message || String(e)),
                    occurredAt: new Date().toISOString()
                });
            }
        }

        // Sanitización segura y primaria de secretos
        settings = this.safeSanitize(settings) as RawSettingSnapshot[];
        mediaOptions = this.safeSanitize(mediaOptions) as RawMediaOptionSnapshot[];
        
        const sanitizedSettings = this.redactSecrets(settings);

        return {
            id: proxy.id,
            pluginId: proxy.pluginId || 'unknown',
            name: proxy.name || proxy.info?.model || 'Unknown',
            type: proxy.type,
            manufacturer: proxy.info?.manufacturer,
            model: proxy.info?.model,
            interfaces: proxy.interfaces || [],
            settings: sanitizedSettings,
            mediaOptions,
            readErrors
        };
    }

    private redactSecrets(settings: RawSettingSnapshot[]): RawSettingSnapshot[] {
        return settings.map(s => {
            const lowerKey = (s.key || '').toLowerCase();
            const lowerType = (s.type || '').toLowerCase();
            const isSecret = 
                lowerType === 'password' || 
                lowerType === 'secret' ||
                lowerKey.includes('password') ||
                lowerKey.includes('token') ||
                lowerKey.includes('secret') ||
                lowerKey.includes('apikey') ||
                lowerKey.includes('authorization') ||
                lowerKey.includes('cookie') ||
                lowerKey.includes('privatekey') ||
                lowerKey.includes('pin') ||
                lowerKey.includes('pairingcode');
                
            let configured = undefined;
            if (isSecret) {
                configured = s.value !== null && s.value !== undefined && s.value !== '';
                return { ...s, secret: true, configured, value: null }; // Value redacted
            }

            return { ...s, secret: false, configured: s.value !== null && s.value !== undefined ? true : false };
        });
    }

    private sanitizeUrlAndStrings(str: string): string {
        if (!str) return str;
        // Strip out user:pass@ in URLs or text
        return str.replace(/([a-zA-Z0-9]+:\/\/)([^@/]+)@/gi, '$1***:***@');
    }

    private safeSanitize(value: unknown, depth: number = 0, seen = new WeakSet()): unknown {
        if (depth > 8) return '[Max Depth Exceeded]';
        
        if (value === null || value === undefined) return null;
        
        const type = typeof value;
        if (type === 'string') {
            const str = value as string;
            return this.sanitizeUrlAndStrings(str.length > 2048 ? str.substring(0, 2048) + '...' : str);
        }
        if (type === 'number' || type === 'boolean') return value;
        if (type === 'bigint') return value.toString();
        if (type === 'function' || type === 'symbol') return undefined;
        
        if (type === 'object') {
            if (seen.has(value)) return '[Circular]';
            seen.add(value);
            
            if (Array.isArray(value)) {
                const arr = value.slice(0, 500);
                return arr.map(item => this.safeSanitize(item, depth + 1, seen)).filter(i => i !== undefined);
            }
            
            const sanitizedObj: Record<string, any> = {};
            const descriptors = Object.getOwnPropertyDescriptors(value);
            let keyCount = 0;
            
            for (const key of Object.keys(descriptors)) {
                if (keyCount >= 200) break;
                const desc = descriptors[key];
                // Ignore getters to prevent executing side effects
                if (desc && desc.get) continue;
                
                const sanitizedVal = this.safeSanitize(desc ? desc.value : undefined, depth + 1, seen);
                if (sanitizedVal !== undefined) {
                    sanitizedObj[key] = sanitizedVal;
                    keyCount++;
                }
            }
            
            seen.delete(value);
            return sanitizedObj;
        }
        
        return undefined;
    }
}
