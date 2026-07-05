import { Characteristic, Formats, Perms, Service } from './hap';

// Custom UUIDs from Apple's HomeKit Secure Video Developer Preview (WebRTC)

export class CameraWebRTCStreamManagement extends Service {
    static UUID = '00008033-0000-1000-8000-0026BB765291';
    constructor(displayName: string, subtype?: string) {
        super(displayName, CameraWebRTCStreamManagement.UUID, subtype);
    }
}

export class WebRTCSolicitOffer extends Characteristic {
    static UUID = '00008053-0000-1000-8000-0026BB765291';
    constructor() {
        super('WebRTC Solicit Offer', WebRTCSolicitOffer.UUID, {
            format: Formats.TLV8,
            perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.WRITE_RESPONSE],
        });
        this.value = this.getDefaultValue();
    }
}

export class WebRTCProvideAnswer extends Characteristic {
    static UUID = '00008054-0000-1000-8000-0026BB765291';
    constructor() {
        super('WebRTC Provide Answer', WebRTCProvideAnswer.UUID, {
            format: Formats.TLV8,
            perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.WRITE_RESPONSE],
        });
        this.value = this.getDefaultValue();
    }
}

export class WebRTCStreamingControl extends Characteristic {
    static UUID = '00008056-0000-1000-8000-0026BB765291';
    constructor() {
        super('WebRTC Streaming Control', WebRTCStreamingControl.UUID, {
            format: Formats.TLV8,
            perms: [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.WRITE_RESPONSE],
        });
        this.value = this.getDefaultValue();
    }
}

export class WebRTCNumberOfActiveSessions extends Characteristic {
    static UUID = '00008057-0000-1000-8000-0026BB765291';
    constructor() {
        super('WebRTC Number of Active Sessions', WebRTCNumberOfActiveSessions.UUID, {
            format: Formats.UINT8,
            perms: [Perms.PAIRED_READ, Perms.NOTIFY],
            minValue: 0,
            maxValue: 255,
        });
        this.value = this.getDefaultValue();
    }
}

export class WebRTCSupportedVideoStreamTiers extends Characteristic {
    static UUID = '00008059-0000-1000-8000-0026BB765291';
    constructor() {
        super('WebRTC Supported Video Stream Tiers', WebRTCSupportedVideoStreamTiers.UUID, {
            format: Formats.TLV8,
            perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
    }
}

export class WebRTCSupportedAudioStreamTiers extends Characteristic {
    static UUID = '0000805A-0000-1000-8000-0026BB765291';
    constructor() {
        super('WebRTC Supported Audio Stream Tiers', WebRTCSupportedAudioStreamTiers.UUID, {
            format: Formats.TLV8,
            perms: [Perms.PAIRED_READ, Perms.NOTIFY],
        });
        this.value = this.getDefaultValue();
    }
}
