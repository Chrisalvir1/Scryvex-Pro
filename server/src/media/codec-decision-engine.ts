export class CodecDecisionEngine {
    /**
     * Determines if a browser user-agent supports H.265 (HEVC) natively over WebRTC.
     * Most browsers do not support HEVC via WebRTC natively, except Safari on Apple devices.
     */
    static canBrowserWebRtcRemuxH265(userAgent: string): boolean {
        // Safari natively supports HEVC WebRTC.
        // Chrome/Edge/Firefox generally do not, even if the OS supports it.
        const ua = userAgent.toLowerCase();
        const isSafari = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium');
        return isSafari;
    }

    /**
     * Determines if a browser user-agent supports H.264 natively over WebRTC.
     * Universally supported.
     */
    static canBrowserWebRtcRemuxH264(userAgent: string): boolean {
        return true; // H.264 is the baseline requirement for WebRTC
    }

    /**
     * Determines if HomeKit can handle H.264.
     */
    static canHomeKitRemuxH264(): boolean {
        return true;
    }

    /**
     * Determines if HomeKit can handle H.265.
     * Apple HomeKit Secure Video supports H.265 if the camera advertises it.
     */
    static canHomeKitRemuxH265(): boolean {
        return true;
    }

    /**
     * Parses SDP to determine if a specific codec is offered.
     */
    static parseSdpForCodec(sdp: string, targetCodec: string): boolean {
        const lines = sdp.split('\n');
        let inVideoMedia = false;
        const payloadTypes = new Set<string>();

        const normalizedTarget = targetCodec.toUpperCase();
        const searchTerms = normalizedTarget === 'H265' || normalizedTarget === 'HEVC' 
            ? ['H265', 'HEVC', 'H.265'] 
            : [normalizedTarget];

        for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('m=')) {
                inVideoMedia = cleanLine.startsWith('m=video');
            } else if (inVideoMedia && cleanLine.startsWith('a=rtpmap:')) {
                // a=rtpmap:<payload_type> <codec>/<clock_rate>
                const match = cleanLine.match(/a=rtpmap:(\d+)\s+(.+)\/\d+/i);
                if (match) {
                    const codecName = match[2].toUpperCase();
                    if (searchTerms.some(term => codecName.includes(term))) {
                        payloadTypes.add(match[1]);
                    }
                }
            } else if (inVideoMedia && cleanLine.startsWith('a=fmtp:')) {
                 // a=fmtp:<payload_type> ...
                 // If the payload type was matched above, it's valid.
            }
        }
        
        return payloadTypes.size > 0;
    }

    /**
     * Enforces strict codec policies:
     * - No automatic transcoding (e.g. H265 -> H264 is forbidden unless explicitly requested)
     * - Keeps pipelines independent.
     * - Validates SDP offer to ensure the browser explicitly requested the codec.
     */
    static evaluateWebRtcCompatibility(codec: string, userAgent: string, sdpOffer?: string): { compatible: boolean; reason?: string; errorCode?: number } {
        const normalized = codec.toUpperCase();
        if (normalized === 'H264') {
            if (!this.canBrowserWebRtcRemuxH264(userAgent)) {
                return { compatible: false, reason: 'El navegador no soporta H.264 por WebRTC.', errorCode: 406 };
            }
            return { compatible: true };
        }
        
        if (normalized === 'H265' || normalized === 'HEVC') {
            if (!this.canBrowserWebRtcRemuxH265(userAgent)) {
                return { compatible: false, reason: 'El navegador no puede reproducir este perfil HEVC mediante WebRTC.', errorCode: 406 };
            }
            if (sdpOffer && !this.parseSdpForCodec(sdpOffer, 'H265')) {
                 return { compatible: false, reason: 'Este navegador no puede reproducir HEVC mediante WebRTC.', errorCode: 406 };
            }
            return { compatible: true };
        }

        return { compatible: false, reason: `Códec no soportado por WebRTC: ${codec}`, errorCode: 406 };
    }
}
