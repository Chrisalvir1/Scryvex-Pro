import crypto from 'crypto';
import { Accessory, CameraStreamingDelegate, Characteristic, CharacteristicEventTypes, Formats, Perms, Service, SRTPCryptoSuites, StreamRequestTypes, uuid } from '../../hap';
import type { ResponseMediaStreamOptions } from '@scrypted/sdk';

// UUIDs and TLV layouts are from the Apple HomeKit Secure Video Open Source
// Compatibility Guide (Developer Preview, 2026-06-03). This is deliberately
// separate from the legacy CameraController while the preview remains unstable.
const UUID = {
    cameraCapabilitiesService: '00008010-0000-1000-8000-0026BB765291',
    multiTierRtpService: '00008031-0000-1000-8000-0026BB765291',
    cameraCapabilities: '00008011-0000-1000-8000-0026BB765291',
    supportedVideoTiers: '00008043-0000-1000-8000-0026BB765291',
    supportedAudioTiers: '00008044-0000-1000-8000-0026BB765291',
    streamingEnabled: '00008041-0000-1000-8000-0026BB765291',
    rtpStreamingControl: '00008045-0000-1000-8000-0026BB765291',
    sensorUuid: '0000805B-0000-1000-8000-0026BB765291',
};

interface Tier {
    id: number;
    codec: 'h264' | 'h265';
    width: number;
    height: number;
    fps: number;
    bitrateKbps: number;
}

interface PreparedSession {
    id: string;
    request: any;
    response: any;
}

function codec(codec?: string) {
    return codec?.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function tlv(...entries: Array<[number, Buffer | number | string]>): Buffer {
    const chunks: Buffer[] = [];
    for (const [type, value] of entries) {
        const data = Buffer.isBuffer(value) ? value : typeof value === 'number' ? Buffer.from([value]) : Buffer.from(value);
        for (let offset = 0; offset < Math.max(1, data.length); offset += 255) {
            const chunk = data.subarray(offset, offset + 255);
            chunks.push(Buffer.from([type, chunk.length]), chunk);
        }
    }
    return Buffer.concat(chunks);
}

function decodeTlv(data: Buffer): Map<number, Buffer> {
    const values = new Map<number, Buffer>();
    for (let offset = 0; offset + 2 <= data.length;) {
        const type = data[offset++];
        const length = data[offset++];
        if (offset + length > data.length)
            throw new Error('Malformed TLV8 payload.');
        const current = values.get(type) || Buffer.alloc(0);
        values.set(type, Buffer.concat([current, data.subarray(offset, offset += length)]));
    }
    return values;
}

function u16(value: number) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value: number) { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; }

function custom(name: string, id: string, format: Formats, perms: Perms[]) {
    return new Characteristic(name, id, { format, perms });
}

function videoTiers(streams: ResponseMediaStreamOptions[]): Tier[] {
    const candidates = streams
        .filter(stream => stream.video?.width && stream.video?.height)
        .map(stream => ({ stream, codec: codec(stream.video?.codec) }))
        .filter(({ codec: value }) => value === 'h264' || value === 'avc' || value === 'h265' || value === 'hevc')
        .sort((a, b) => (b.stream.video!.width! * b.stream.video!.height!) - (a.stream.video!.width! * a.stream.video!.height!));
    return candidates.slice(0, 4).map(({ stream, codec: value }, index) => ({
        id: index + 1,
        codec: value === 'h265' || value === 'hevc' ? 'h265' : 'h264',
        width: stream.video!.width!,
        height: stream.video!.height!,
        fps: stream.video!.fps || 30,
        bitrateKbps: Math.round((stream.video!.bitrate || (stream.video!.width! * stream.video!.height! >= 7_000_000 ? 4_500_000 : 2_800_000)) / 1000),
    }));
}

function encodeVideoTiers(tiers: Tier[]) {
    return Buffer.concat(tiers.map(tier => tlv(
        1, tier.codec === 'h265' ? 2 : 1,
        2, 99,
        3, tlv(1, u32(tier.id), 2, tier.id === 1 ? 2 : Math.min(4, tier.id + 1), 3, u32(tier.bitrateKbps), 4, u16(tier.width), 5, u16(tier.height), 6, tier.fps),
    ))).toString('base64');
}

function encodeOpusTier() {
    return tlv(1, 3, 2, 110, 3, tlv(1, u32(1), 2, u32(64000), 3, 4, 4, 2, 5, 20, 6, 1)).toString('base64');
}

/**
 * Accessory-side implementation of the Developer Preview Multi-Tier RTP
 * service. It reuses Scrypted's existing streaming delegate for socket/SRTP
 * allocation and forwards explicit tier choices to it.
 */
export class Hksv2026MultiTierRtpController {
    private readonly sessions = new Map<string, PreparedSession>();
    private readonly tiers: Tier[];

    static attach(accessory: Accessory, delegate: CameraStreamingDelegate, streams: ResponseMediaStreamOptions[]) {
        return new Hksv2026MultiTierRtpController(accessory, delegate, streams);
    }

    private constructor(accessory: Accessory, private readonly delegate: CameraStreamingDelegate, streams: ResponseMediaStreamOptions[]) {
        this.tiers = videoTiers(streams);
        if (!this.tiers.length)
            return;

        const sensor = crypto.createHash('sha256').update(accessory.UUID).digest().subarray(0, 16);
        const capabilities = accessory.addService(new Service('Camera Capabilities', UUID.cameraCapabilitiesService));
        capabilities.addCharacteristic(Characteristic.Version).updateValue('17.99');
        capabilities.addCharacteristic(custom('Camera Capabilities', UUID.cameraCapabilities, Formats.TLV8, [Perms.PAIRED_READ]))
            .updateValue(tlv(1, 1, 2, tlv(1, tlv(1, tlv(1, u16(this.tiers[0].width), 2, u16(this.tiers[0].height)), 2, sensor, 3, 1, 4, 1))).toString('base64'));

        const service = accessory.addService(new Service('Camera Multi-Tier RTP Stream Management', UUID.multiTierRtpService));
        const streamingEnabled = custom('Streaming Enabled', UUID.streamingEnabled, Formats.BOOL, [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.NOTIFY]);
        const video = custom('Supported Video Stream Tiers', UUID.supportedVideoTiers, Formats.TLV8, [Perms.PAIRED_READ, Perms.NOTIFY]);
        const audio = custom('Supported Audio Stream Tiers', UUID.supportedAudioTiers, Formats.TLV8, [Perms.PAIRED_READ, Perms.NOTIFY]);
        const control = custom('RTP Streaming Control', UUID.rtpStreamingControl, Formats.TLV8, [Perms.PAIRED_READ, Perms.PAIRED_WRITE, Perms.WRITE_RESPONSE]);
        const sensorUuid = custom('Sensor UUID', UUID.sensorUuid, Formats.DATA, [Perms.PAIRED_READ]);
        service.addCharacteristic(streamingEnabled).updateValue(true);
        service.addCharacteristic(Characteristic.StatusActive).updateValue(true);
        service.addCharacteristic(video).updateValue(encodeVideoTiers(this.tiers));
        service.addCharacteristic(audio).updateValue(encodeOpusTier());
        service.addCharacteristic(Characteristic.SupportedRTPConfiguration).updateValue(tlv(2, 0).toString('base64'));
        service.addCharacteristic(Characteristic.SetupEndpoints).updateValue(tlv(2, 2).toString('base64'));
        service.addCharacteristic(control).updateValue('');
        service.addCharacteristic(sensorUuid).updateValue(sensor.toString('base64'));

        streamingEnabled.on(CharacteristicEventTypes.SET, (value, callback) => {
            service.updateCharacteristic(Characteristic.StatusActive, !!value);
            callback();
        });
        service.getCharacteristic(Characteristic.SetupEndpoints).on(CharacteristicEventTypes.SET,
            (value, callback, _context, connection) => this.setupEndpoints(service, value as string, callback, connection));
        control.on(CharacteristicEventTypes.SET, (value, callback) => this.control(value as string, callback));
    }

    private setupEndpoints(service: Service, value: string, callback: (error?: Error | number) => void, connection: any) {
        try {
            const request = decodeTlv(Buffer.from(value, 'base64'));
            const id = uuid.unparse(request.get(1)!);
            const address = decodeTlv(request.get(3)!);
            const video = decodeTlv(request.get(4)!);
            const audio = decodeTlv(request.get(5)!);
            const addressVersion = address.get(1)![0] === 1 ? 'ipv6' : 'ipv4';
            const prepare: any = {
                sessionID: id,
                sourceAddress: connection?.localAddress || '0.0.0.0',
                targetAddress: address.get(2)!.toString(),
                addressVersion,
                video: { port: address.get(3)!.readUInt16LE(), srtpCryptoSuite: video.get(1)![0], srtp_key: video.get(2)!, srtp_salt: video.get(3)! },
                audio: { port: address.get(4)!.readUInt16LE(), srtpCryptoSuite: audio.get(1)![0], srtp_key: audio.get(2)!, srtp_salt: audio.get(3)! },
            };
            this.delegate.prepareStream(prepare, (error?: Error, response?: any) => {
                if (error || !response) {
                    service.updateCharacteristic(Characteristic.SetupEndpoints, tlv(1, uuid.write(id), 2, 2).toString('base64'));
                    callback(error || new Error('Unable to prepare RTP endpoints.'));
                    return;
                }
                const sourceAddress = response.addressOverride || connection?.getLocalAddress?.(addressVersion) || prepare.sourceAddress;
                const endpoint = tlv(1, addressVersion === 'ipv6' ? 1 : 0, 2, sourceAddress, 3, u16(response.video.port), 4, u16(response.audio?.port || response.video.port));
                const videoResponse = tlv(1, prepare.video.srtpCryptoSuite, 2, response.video.srtp_key || prepare.video.srtp_key, 3, response.video.srtp_salt || prepare.video.srtp_salt);
                const audioResponse = tlv(1, prepare.audio.srtpCryptoSuite, 2, response.audio?.srtp_key || prepare.audio.srtp_key, 3, response.audio?.srtp_salt || prepare.audio.srtp_salt);
                service.updateCharacteristic(Characteristic.SetupEndpoints, tlv(1, uuid.write(id), 2, 0, 3, endpoint, 4, videoResponse, 5, audioResponse, 6, u32(response.video.ssrc), 7, u32(response.audio?.ssrc || response.video.ssrc)).toString('base64'));
                this.sessions.set(id, { id, request: prepare, response });
                callback();
            });
        }
        catch (error) {
            callback(error as Error);
        }
    }

    private control(value: string, callback: (error?: Error | number) => void) {
        try {
            const request = decodeTlv(Buffer.from(value, 'base64'));
            const id = uuid.unparse(request.get(1)!);
            const command = request.get(2)![0]; // 1 = End, 2 = Start in the Developer Preview.
            const session = this.sessions.get(id);
            if (!session)
                throw new Error('Unknown Multi-Tier RTP session.');
            if (command === 1) {
                this.delegate.handleStreamRequest({ type: StreamRequestTypes.STOP, sessionID: id } as any, callback as any);
                this.sessions.delete(id);
                return;
            }
            if (command !== 2)
                throw new Error('Unsupported Multi-Tier RTP command.');
            const tier = this.tiers.find(candidate => candidate.id === request.get(3)!.readUInt32LE());
            if (!tier)
                throw new Error('Requested video tier is not advertised.');
            this.delegate.handleStreamRequest({
                type: StreamRequestTypes.START,
                sessionID: id,
                video: { codec: tier.codec, width: tier.width, height: tier.height, fps: tier.fps, max_bit_rate: tier.bitrateKbps, pt: 99, ssrc: request.get(4)!.readUInt32LE(), mtu: 1200, rtcp_interval: .5 },
                audio: { codec: 'OPUS', sample_rate: 48, max_bit_rate: 64, packet_time: 20, channel: 1, pt: 110, ssrc: request.get(6)!.readUInt32LE(), rtcp_interval: .5 },
            } as any, callback as any);
        }
        catch (error) {
            callback(error as Error);
        }
    }
}
