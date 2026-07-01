import { useState, useEffect } from 'react';
import { connectScryptedClient } from '@scrypted/client';
import type { ScryptedClientStatic } from '@scrypted/client';
import type { ScryptedDevice } from '@scrypted/types';

export function useScrypted() {
  const [client, setClient] = useState<ScryptedClientStatic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<ScryptedDevice[]>([]);

  useEffect(() => {
    async function init() {
      try {
        const scrypted = await connectScryptedClient({
          pluginId: '@scrypted/core',
          clientName: 'Scrypted Pro G&C',
          baseUrl: window.location.origin
        });
        
        setClient(scrypted);
        
        // Fetch devices
        const allIds = Object.keys(scrypted.systemManager.getSystemState());
        const devList = allIds.map(id => scrypted.systemManager.getDeviceById(id));
        setDevices(devList);
        
      } catch (err: any) {
        console.error('Failed to connect to Scrypted:', err);
        // Fallback for development without a real server
        if (import.meta.env.DEV) {
          console.warn('Using mock data for development mode');
          setDevices([
            { name: 'Mock Camera 1', id: 'mock-1', interfaces: ['Camera', 'VideoCamera'] } as any,
            { name: 'Mock Camera 2', id: 'mock-2', interfaces: ['Camera', 'VideoCamera'] } as any,
            { name: 'HomeKit', id: 'mock-3', interfaces: ['MixinProvider'], pluginId: '@scrypted/homekit' } as any
          ]);
          setClient({} as any);
        } else {
          setError(err.message || 'Connection failed');
        }
      }
    }
    init();
  }, []);

  return { client, error, devices };
}
