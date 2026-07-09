import { DeviceState, MixinProvider, Readme, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface } from "@scrypted/sdk";

function typeToIcon(type: string): string {
    switch (type) {
        case 'Camera': return 'fa-video';
        case 'Doorbell': return 'fa-bell';
        case 'Fan': return 'fa-fan';
        case 'Light': return 'fa-lightbulb';
        case 'Lock': return 'fa-lock';
        case 'Sensor': return 'fa-broadcast-tower';
        case 'Thermostat': return 'fa-thermometer-half';
        case 'Switch': return 'fa-toggle-on';
        case 'Outlet': return 'fa-plug';
        default: return 'fa-question';
    }
}

export class LauncherMixin extends ScryptedDeviceBase implements MixinProvider, Readme {
    async getReadmeMarkdown(): Promise<string> {
        return 'Add Scrypted Plugins or Devices to the Scrypted launch screen for quick access.';
    }

    async canMixin(type: ScryptedDeviceType, interfaces: string[]): Promise<string[]> {
        if (interfaces.includes("@scrypted/launcher-ignore"))
            return;
        if (type === ScryptedDeviceType.Builtin || type === ScryptedDeviceType.API)
            return;
        return [
            ScryptedInterface.LauncherApplication,
        ];
    }

    async getMixin(mixinDevice: any, mixinDeviceInterfaces: ScryptedInterface[], mixinDeviceState: DeviceState): Promise<any> {
        mixinDeviceState.applicationInfo = {
            icon: 'fa ' + typeToIcon(mixinDeviceState.type),
            href: '#/device/' + mixinDeviceState.id,
        }
        return mixinDevice;
    }

    async releaseMixin(id: string, mixinDevice: any): Promise<void> {

    }
}
