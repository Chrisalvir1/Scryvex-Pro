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
                if (match && match[1] && match[2]) {
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
     * Enforces strict codec policies based on the SDP offer from the browser.
     * User-Agent is NOT used — only what the browser announces in SDP.
     *
     * - H.264: universally supported by all WebRTC clients. Always accepted.
     * - H.265: accepted only if the browser's SDP m=video section explicitly
     *   includes an a=rtpmap entry for H265, HEVC, or H.265.
     *   Neither User-Agent nor browser brand determine this — the SDP does.
     * - No automatic transcoding. Ever.
     */
    static evaluateWebRtcCompatibility(cameraCodec: string, sdpOffer: string): { compatible: boolean; reason?: string; errorCode?: number } {
        const normalized = cameraCodec.toUpperCase();

        if (normalized === 'H264') {
            // H.264 is the WebRTC baseline; all browsers support it.
            return { compatible: true };
        }

        if (normalized === 'H265' || normalized === 'HEVC') {
            // H.265 is only usable if the browser explicitly offered it in SDP.
            if (!this.parseSdpForCodec(sdpOffer, 'H265')) {
                return {
                    compatible: false,
                    reason: 'Este navegador no puede reproducir HEVC mediante WebRTC. La cámara entrega H.265 pero el navegador no lo anunció en su SDP.',
                    errorCode: 406,
                };
            }
            return { compatible: true };
        }

        return {
            compatible: false,
            reason: `Códec de cámara no soportado por WebRTC: ${cameraCodec}`,
            errorCode: 406,
        };
    }
}

