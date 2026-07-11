import * as crypto from 'crypto';
import type { 
    RawDeviceSnapshot, 
    DeviceModelView, 
    NormalizedSetting,
    RawSettingSnapshot,
    RawMediaOptionSnapshot,
    NormalizedMediaOption
} from '@scryvex/contracts';

export class DeviceModelFactory {
    public buildFromSnapshot(snapshot: RawDeviceSnapshot): DeviceModelView {
        const settings = this.normalizeSettings(snapshot.id, snapshot.pluginId, snapshot.settings);
        const mediaOptions = this.normalizeMedia(snapshot.id, snapshot.mediaOptions);
        
        // Calculate stable hash
        const contentHash = this.calculateHash(snapshot, settings, mediaOptions);
        
        const interfaces = [...snapshot.interfaces];
        const capabilities = this.normalizeCapabilities(interfaces);

        return {
            id: snapshot.id,
            revision: contentHash,
            generatedAt: new Date().toISOString(),
            plugin: snapshot.pluginId || 'unknown',
            name: snapshot.name || snapshot.model || 'Unknown Device',
            manufacturer: snapshot.manufacturer || 'Unknown',
            model: snapshot.model || 'Unknown',
            interfaces,
            capabilities,
            media: {
                options: mediaOptions
            },
            settings,
            diagnostics: { 
                status: 'not_evaluated',
                partial: snapshot.readErrors.length > 0,
                readErrors: snapshot.readErrors.map(error => ({
                    ...error,
                    message: this.sanitizeDiagnosticMessage(error.message),
                }))
            }
        };
    }

    private sanitizeDiagnosticMessage(message: string): string {
        if (!message) return 'Unknown error';
        return message.replace(/(https?:\/\/)([^@]+)@/gi, '$1***:***@');
    }

    private stableStringify(obj: any): string {
        if (obj === null || obj === undefined) return 'null';
        if (typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) {
            return '[' + obj.map(item => this.stableStringify(item)).join(',') + ']';
        }
        
        const keys = Object.keys(obj).sort();
        const parts = keys.map(key => {
            return JSON.stringify(key) + ':' + this.stableStringify(obj[key]);
        });
        return '{' + parts.join(',') + '}';
    }

    private calculateHash(snapshot: RawDeviceSnapshot, settings: NormalizedSetting[], mediaOptions: NormalizedMediaOption[]): string {
        const stableContent = {
            id: snapshot.id,
            pluginId: snapshot.pluginId,
            name: snapshot.name,
            type: snapshot.type,
            manufacturer: snapshot.manufacturer,
            model: snapshot.model,
            interfaces: [...snapshot.interfaces].sort(),
            settings: settings,
            mediaOptions: mediaOptions,
            readErrors: snapshot.readErrors
        };
        
        const json = this.stableStringify(stableContent);
        return crypto.createHash('sha256').update(json).digest('hex').substring(0, 12);
    }

    private normalizeCapabilities(interfaces: string[]): string[] {
        const capabilities = new Set<string>();
        if (interfaces.includes('Camera')) capabilities.add('Camera');
        if (interfaces.includes('VideoCamera')) capabilities.add('VideoCamera');
        if (interfaces.includes('MotionSensor')) capabilities.add('MotionSensor');
        if (interfaces.includes('ObjectDetector')) capabilities.add('ObjectDetector');
        if (interfaces.includes('TwoWayAudio')) capabilities.add('Intercom');
        if (interfaces.includes('AudioSensor')) capabilities.add('AudioSensor');
        if (interfaces.includes('PanTiltZoom')) capabilities.add('PTZ');
        if (interfaces.includes('OnOff')) capabilities.add('OnOff');
        return Array.from(capabilities);
    }

    private normalizeMedia(deviceId: string, rawMedia: readonly RawMediaOptionSnapshot[]): NormalizedMediaOption[] {
        return rawMedia.map(m => ({
            id: m.id,
            name: m.name,
            container: m.container,
            videoCodec: m.video?.codec,
            audioCodec: m.audio?.codec,
            width: m.width,
            height: m.height,
            fps: m.fps,
            bitrate: m.bitrate,
            source: m.source,
            purpose: m.purpose
        }));
    }

    private normalizeSettings(deviceId: string, pluginId: string = 'unknown', rawSettings: readonly RawSettingSnapshot[]): NormalizedSetting[] {
        if (!rawSettings) return [];
        return rawSettings.map(raw => {
            const mappedType = this.mapType(raw.type);
            const isSecret = raw.secret ?? (mappedType === 'password');
            
            return {
                pluginId,
                deviceId,
                key: raw.key,
                title: raw.title || raw.key,
                description: raw.description,
                type: mappedType,
                originalType: mappedType === 'unknown' ? raw.type : undefined,
                value: raw.value as string | number | boolean | null,
                secret: isSecret,
                configured: raw.configured,
                choices: raw.choices ? [...raw.choices] : undefined,
                group: raw.group || 'General',
                subgroup: raw.subgroup,
                advanced: !!raw.advanced,
                hidden: !!raw.hidden,
                readOnly: !!raw.readonly,
                restartRequired: !!raw.restartRequired,
                placeholder: raw.placeholder,
                range: raw.range ? [...raw.range] as [number, number] : undefined,
                multiple: raw.multiple,
                combobox: raw.combobox,
                deviceFilter: raw.deviceFilter,
                source: 'scrypted',
                classification: 'original'
            };
        });
    }

    private mapType(type: string): NormalizedSetting['type'] {
        const lowerType = String(type || '').toLowerCase();
        switch (lowerType) {
            case 'boolean':
            case 'number':
            case 'string':
            case 'password':
            case 'button':
                return lowerType;
            default:
                if (lowerType.includes('device')) return 'device';
                if (lowerType.includes('interface')) return 'interface';
                if (lowerType.includes('select')) return 'select';
                return 'unknown';
        }
    }
}
