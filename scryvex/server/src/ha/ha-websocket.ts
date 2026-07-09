import WebSocket from 'ws';
import axios from 'axios';

export class HomeAssistantIntegration {
    private ws!: WebSocket;
    private token: string;
    private url: string;
    private msgId = 1;
    private areaRegistry: any[] = [];

    constructor(haUrl: string, token: string) {
        this.url = haUrl;
        this.token = token;
    }

    async connect() {
        const wsUrl = this.url.replace(/^http/, 'ws') + '/api/websocket';
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            console.log('Connected to Home Assistant WebSocket API');
        });

        this.ws.on('message', async (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.type === 'auth_required') {
                this.ws.send(JSON.stringify({ type: 'auth', access_token: this.token }));
            } else if (msg.type === 'auth_ok') {
                console.log('Authenticated with Home Assistant');
                await this.fetchAreaRegistry();
            }
        });
    }

    private sendCommand(command: any): Promise<any> {
        return new Promise((resolve) => {
            const id = this.msgId++;
            const payload = { id, ...command };
            
            const listener = (data: any) => {
                const msg = JSON.parse(data.toString());
                if (msg.id === id) {
                    this.ws.off('message', listener);
                    resolve(msg.result);
                }
            };
            this.ws.on('message', listener);
            this.ws.send(JSON.stringify(payload));
        });
    }

    private async fetchAreaRegistry() {
        this.areaRegistry = await this.sendCommand({ type: 'config/area_registry/list' });
    }

    async fetchCameraAutomations(cameraId: string): Promise<any[]> {
        // Fetch all automations from HA
        const automations = await this.sendCommand({ type: 'config/automation/config' }) as any[];
        
        // Filter automations where the triggers contain our camera's entities
        // Example entity IDs: binary_sensor.front_door_person_detection
        return automations.filter(auto => {
            const triggers = JSON.stringify(auto.trigger || {});
            return triggers.includes(cameraId);
        });
    }

    async registerCameraDevice(deviceId: string, name: string, areaId?: string) {
        // Grouping entities under single Device ID natively
        await axios.post(`${this.url}/api/states/camera.${deviceId}`, {
            state: 'idle',
            attributes: { friendly_name: name, device_class: 'camera' }
        }, { headers: { Authorization: `Bearer ${this.token}` } });
    }

    async updateDetectionSensor(deviceId: string, objectClass: string, isDetected: boolean) {
        const sensorId = `binary_sensor.${deviceId}_${objectClass}_detection`;
        await axios.post(`${this.url}/api/states/${sensorId}`, {
            state: isDetected ? 'on' : 'off',
            attributes: { device_class: 'occupancy', friendly_name: `${objectClass} Detection` }
        }, { headers: { Authorization: `Bearer ${this.token}` } });
    }
}
