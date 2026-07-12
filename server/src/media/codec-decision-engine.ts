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
     * Enforces strict codec policies:
     * - No automatic transcoding (e.g. H265 -> H264 is forbidden unless explicitly requested)
     * - Keeps pipelines independent.
     */
    static evaluateWebRtcCompatibility(codec: string, userAgent: string): { compatible: boolean; reason?: string } {
        const normalized = codec.toUpperCase();
        if (normalized === 'H264') {
            if (!this.canBrowserWebRtcRemuxH264(userAgent)) {
                return { compatible: false, reason: 'El navegador no soporta H.264 por WebRTC.' };
            }
            return { compatible: true };
        }
        
        if (normalized === 'H265' || normalized === 'HEVC') {
            if (!this.canBrowserWebRtcRemuxH265(userAgent)) {
                return { compatible: false, reason: 'El navegador no puede reproducir este perfil HEVC mediante WebRTC.' };
            }
            return { compatible: true };
        }

        return { compatible: false, reason: `Códec no soportado por WebRTC: ${codec}` };
    }
}
