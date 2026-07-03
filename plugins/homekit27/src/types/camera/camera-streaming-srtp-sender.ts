import { RtcpSenderInfo, RtcpSrPacket } from '@koush/werift-src/packages/rtp/src/rtcp/sr';
import { RtpPacket } from '@koush/werift-src/packages/rtp/src/rtp/rtp';
import type { Config } from '@koush/werift-src/packages/rtp/src/srtp/session';
import { SrtcpSession } from '@koush/werift-src/packages/rtp/src/srtp/srtcp';
import { SrtpSession } from '@koush/werift-src/packages/rtp/src/srtp/srtp';
import { getNaluTypesInNalu, H264_NAL_TYPE_IDR } from '@scrypted/common/src/rtsp-server';
import dgram from 'dgram';
import { AudioStreamingSamplerate } from '../../hap';
import { ntpTime } from './camera-utils';
import { OpusRepacketizer } from './opus-repacketizer';
import { H264Repacketizer } from './h264-packetizer';
import { H265Repacketizer } from './h265-packetizer';
import { getNaluTypesInH265Nalu, H265_NAL_TYPE_IDR_N_LP, H265_NAL_TYPE_IDR_W_RADL, H265_NAL_TYPE_CRA_NUT } from '@scrypted/common/src/rtsp-server';
import throttle from 'lodash/throttle';

export function createCameraStreamSender(console: Console, config: Config, sender: dgram.Socket, ssrc: number, payloadType: number, port: number, targetAddress: string, rtcpInterval: number,
    videoOptions?: {
        maxPacketSize: number,
        sps: Buffer,
        pps: Buffer,
        vps?: Buffer,
        codec?: string,
    },
    audioOptions?: {
        audioPacketTime: number,
        audioSampleRate: AudioStreamingSamplerate,
        framesPerPacket: number,
    }) {
    const srtpSession = new SrtpSession(config);
    const srtcpSession = new SrtcpSession(config);

    let firstTimestamp = 0;
    let lastTimestamp = 0;
    let packetCount = 0;
    let octetCount = 0;
    let lastRtcp = 0;
    let firstSequenceNumber: number;
    let opusPacketizer: OpusRepacketizer;
    let h264Packetizer: H264Repacketizer;
    let h265Packetizer: H265Repacketizer;
    let analyzeVideo = true;

    const loggedNaluTypes = new Set<number>();
    const printNaluTypes = () => {
        if (!loggedNaluTypes.size)
            return;
        console.log('scanning for idr start found:', ...[...loggedNaluTypes]);
        loggedNaluTypes.clear();
    };
    const logIdrCheck = throttle(() => {
        printNaluTypes();
    }, 1000);

    let audioIntervalScale = 1;
    if (audioOptions) {
        switch (audioOptions.audioSampleRate) {
            case AudioStreamingSamplerate.KHZ_24:
                audioIntervalScale = 3;
                break;
            case AudioStreamingSamplerate.KHZ_16:
                audioIntervalScale = 2;
                break;
        }
        audioIntervalScale = audioIntervalScale * audioOptions.audioPacketTime / 20;
        opusPacketizer = new OpusRepacketizer(audioOptions.framesPerPacket);
    }
    else {
        if (videoOptions.maxPacketSize) {
            // adjust packet size for the rtp packet header (12).
            const adjustedMtu = videoOptions.maxPacketSize - 12;
            if (videoOptions.codec === 'h265' || videoOptions.vps) {
                h265Packetizer = new H265Repacketizer(console, adjustedMtu, videoOptions);
            } else {
                h264Packetizer = new H264Repacketizer(console, adjustedMtu, videoOptions);
            }
        }
        sender.setSendBufferSize(1024 * 1024);
    }

    function sendRtcpInternal(now: number) {
        lastRtcp = now;
        const sr = new RtcpSrPacket({
            ssrc,
            senderInfo: new RtcpSenderInfo({
                ntpTimestamp: ntpTime(),
                rtpTimestamp: lastTimestamp,
                packetCount,
                octetCount,
            }),
        });

        const packet = srtcpSession.encrypt(sr.serialize());
        sender.send(packet, port, targetAddress);
    }

    function sendRtcp() {
        const now = Date.now();
        return sendRtcpInternal(now);
    }

    function sendPacket(rtp: RtpPacket) {
        const now = Date.now();

        // packet count may be less than zero if rollover counting fails due to heavy packet loss or other
        // unforseen edge cases.
        if (now > lastRtcp + rtcpInterval * 1000) {
            sendRtcpInternal(now);
        }
        lastTimestamp = rtp.header.timestamp;

        packetCount++;
        octetCount += rtp.payload.length;

        rtp.header.padding = false;
        rtp.header.ssrc = ssrc;
        rtp.header.payloadType = payloadType;


        const srtp = srtpSession.encrypt(rtp.payload, rtp.header);
        sender.send(srtp, port, targetAddress);
    }

    function sendRtp(rtp: RtpPacket) {
        if (firstSequenceNumber === undefined) {
            console.log(`received first ${audioOptions ? 'audio' : 'video'} packet`);
            firstSequenceNumber = rtp.header.sequenceNumber;
        }

        if (!firstTimestamp)
            firstTimestamp = rtp.header.timestamp;

        if (audioOptions) {
            const packets = opusPacketizer.repacketize(rtp);
            if (!packets)
                return;

            for (const rtp of packets) {
                rtp.header.timestamp = (firstTimestamp + packetCount * 160 * audioIntervalScale) % 0xFFFFFFFF;
                sendPacket(rtp);
            }
            return;
        }

        if (!h264Packetizer && !h265Packetizer) {
            sendPacket(rtp);
            return;
        }

        if (h265Packetizer) {
            const packets = h265Packetizer.repacketize(rtp);
            if (!packets?.length)
                return;
            for (const packet of packets) {
                if (analyzeVideo) {
                    const naluTypes = getNaluTypesInH265Nalu(packet.payload, true);
                    analyzeVideo = !naluTypes.has(H265_NAL_TYPE_IDR_W_RADL) && !naluTypes.has(H265_NAL_TYPE_IDR_N_LP) && !naluTypes.has(H265_NAL_TYPE_CRA_NUT);
                    if (analyzeVideo) {
                        naluTypes.forEach(loggedNaluTypes.add, loggedNaluTypes);
                        logIdrCheck();
                    }
                    else {
                        printNaluTypes();
                        console.log('idr start found:', ...[...naluTypes]);
                    }
                }
                sendPacket(packet);
            }
        }
        else {
            const packets = h264Packetizer.repacketize(rtp);
            if (!packets?.length)
                return;
            for (const packet of packets) {
                if (analyzeVideo) {
                    const naluTypes = getNaluTypesInNalu(packet.payload, true);
                    analyzeVideo = !naluTypes.has(H264_NAL_TYPE_IDR);
                    if (analyzeVideo) {
                        naluTypes.forEach(loggedNaluTypes.add, loggedNaluTypes);
                        logIdrCheck();
                    }
                    else {
                        printNaluTypes();
                        console.log('idr start found:', ...[...naluTypes]);
                    }
                }
                sendPacket(packet);
            }
        }
    }

    return {
        sendRtp,
        sendRtcp,
    };
}

