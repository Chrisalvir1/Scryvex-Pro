export interface RuntimeDeviceBoundary {
    id: string;
    pluginId?: string;
    name?: string;
    type?: string;
    info?: {
        manufacturer?: string;
        model?: string;
    };
    interfaces?: string[];
    getSettings?: () => Promise<unknown>;
    getVideoStreamOptions?: () => Promise<unknown>;
}

export interface RuntimeBoundary {
    plugins?: Record<string, unknown>;
    devices?: Record<string, { proxy?: unknown }>;
}

export function isRuntimeDevice(proxy: unknown): proxy is RuntimeDeviceBoundary {
    return typeof proxy === 'object' && proxy !== null && 'id' in proxy;
}
