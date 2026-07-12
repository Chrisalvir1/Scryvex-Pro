import { useState, useEffect, useCallback } from 'react';
import type { DeviceModelView } from '@scryvex/contracts';
import { apiUrl } from '../lib/ingress-url';

export function useUniversalDevices() {
    const [devices, setDevices] = useState<DeviceModelView[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDevices = useCallback(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            setLoading(true);
            const res = await fetch(apiUrl('/api/scrypted/devices'), { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setDevices(data.devices || []);
            setError(null);
        } catch (err: any) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                setError('Tiempo de espera agotado al cargar dispositivos internos.');
            } else {
                setError(err.message || 'Error al obtener dispositivos universales');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDevices();
    }, [fetchDevices]);

    return {
        devices,
        loading,
        error,
        refetch: fetchDevices
    };
}
