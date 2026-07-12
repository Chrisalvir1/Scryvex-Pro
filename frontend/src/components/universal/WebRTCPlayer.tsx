import React, { useEffect, useRef, useState, useCallback } from 'react';
import { apiUrl } from '../../lib/ingress-url';

interface WebRTCPlayerProps {
    cameraId: string;
    onError?: (err: Error) => void;
    onClose?: () => void;
}

type PlayerStatus =
    | 'Validando cámara'
    | 'Negociando WebRTC'
    | 'Recopilando candidatos ICE'
    | 'Conectando ICE'
    | 'Recibiendo RTP'
    | 'Esperando primer frame'
    | 'Reproduciendo'
    | 'failed';

export function WebRTCPlayer({ cameraId, onError, onClose }: WebRTCPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const sessionIdRef = useRef<string>('');
    const [status, setStatus] = useState<PlayerStatus>('Validando cámara');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const frameNotifiedRef = useRef(false);

    // ── Cleanup: always DELETE the session so server frees sockets/FFmpeg ──────
    const cleanup = useCallback(async () => {
        const sid = sessionIdRef.current;
        if (sid) {
            navigator.sendBeacon(apiUrl(`/api/cameras/${cameraId}/webrtc/${sid}`), '');
            // Also try a proper DELETE (sendBeacon is POST, so complement with fetch)
            fetch(apiUrl(`/api/cameras/${cameraId}/webrtc/${sid}`), {
                method: 'DELETE',
                credentials: 'same-origin',
            }).catch(() => {});
            sessionIdRef.current = '';
        }
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
    }, [cameraId]);

    const handleError = useCallback((msg: string) => {
        setStatus('failed');
        setErrorMsg(msg);
        cleanup();
        if (onError) onError(new Error(msg));
    }, [cleanup, onError]);

    useEffect(() => {
        let cancelled = false;

        const start = async () => {
            setStatus('Negociando WebRTC');
            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            pc.addTransceiver('video', { direction: 'recvonly' });
            // Audio: not negotiated in this version. Show note only.

            // ── Register handlers BEFORE createOffer ──────────────────────────
            pc.ontrack = (event) => {
                if (videoRef.current && event.streams[0]) {
                    videoRef.current.srcObject = event.streams[0];
                }
            };

            pc.oniceconnectionstatechange = () => {
                if (cancelled) return;
                const s = pc.iceConnectionState;
                if (s === 'checking') setStatus('Conectando ICE');
                else if (s === 'connected' || s === 'completed') setStatus('Recibiendo RTP');
                else if (s === 'failed') handleError('ICE fallido: el navegador no pudo alcanzar el servidor (puertos UDP 50000-50050).');
                else if (s === 'disconnected') handleError('ICE desconectado inesperadamente.');
            };

            pc.onicegatheringstatechange = () => {
                if (pc.iceGatheringState === 'gathering') setStatus('Recopilando candidatos ICE');
            };

            // ── Register onicecandidate BEFORE createOffer ────────────────────
            pc.onicecandidate = (event) => {
                const sid = sessionIdRef.current;
                if (!sid) return;
                // Send candidate (including end-of-candidates null)
                fetch(apiUrl(`/api/cameras/${cameraId}/webrtc/candidate/${sid}`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        candidate: event.candidate?.candidate ?? '',
                        sdpMid: event.candidate?.sdpMid ?? null,
                        sdpMLineIndex: event.candidate?.sdpMLineIndex ?? null,
                    }),
                }).catch(console.error);
            };

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                const res = await fetch(apiUrl(`/api/cameras/${cameraId}/webrtc/offer`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
                });

                if (cancelled) return;

                if (res.status === 409) {
                    const d = await res.json().catch(() => ({}));
                    handleError(d.message ?? 'La cámara no tiene un stream validado. Ejecuta "Probar Conexión" primero.');
                    return;
                }
                if (res.status === 406) {
                    const d = await res.json().catch(() => ({}));
                    handleError(d.message ?? 'Este navegador no puede reproducir el codec de esta cámara por WebRTC.');
                    return;
                }
                if (res.status === 503) {
                    const d = await res.json().catch(() => ({}));
                    handleError(d.message ?? 'El servidor no tiene IP LAN alcanzable para WebRTC.');
                    return;
                }
                if (!res.ok) {
                    handleError(`Error del servidor: HTTP ${res.status}`);
                    return;
                }

                const data = await res.json();
                if (data.error) { handleError(data.error); return; }

                sessionIdRef.current = data.sessionId;

                await pc.setRemoteDescription({ type: data.type, sdp: data.sdp });
                setStatus('Conectando ICE');

                // First-frame watchdog: 30 seconds total budget
                const frameTimeout = setTimeout(() => {
                    if (!frameNotifiedRef.current) {
                        handleError('Timeout: ICE conectó pero no llegó el primer frame. Posible incompatibilidad de codec o bloqueo de RTP.');
                    }
                }, 30000);

                if (videoRef.current) {
                    const vid = videoRef.current;
                    const onFrame = () => {
                        if (frameNotifiedRef.current) return;
                        frameNotifiedRef.current = true;
                        clearTimeout(frameTimeout);
                        setStatus('Esperando primer frame');

                        const sid = sessionIdRef.current;
                        if (sid) {
                            fetch(apiUrl(`/api/cameras/${cameraId}/live/webrtc/${sid}/first-frame`), {
                                method: 'POST',
                                credentials: 'same-origin',
                            }).catch(console.error);
                        }
                        setStatus('Reproduciendo');
                    };
                    vid.addEventListener('loadeddata', onFrame, { once: true });
                    vid.addEventListener('playing', onFrame, { once: true });
                }

            } catch (err: any) {
                if (!cancelled) handleError(err.message ?? 'Error inesperado al iniciar WebRTC.');
            }
        };

        start();

        return () => {
            cancelled = true;
            cleanup();
        };
    }, [cameraId, cleanup, handleError]);

    return (
        <div className="relative w-full h-full bg-black flex items-center justify-center">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-contain"
            />
            {status !== 'Reproduciendo' && (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 p-4 text-center">
                    {status === 'failed' ? (
                        <>
                            <div className="text-red-400 font-bold text-sm">Error WebRTC</div>
                            <div className="text-red-200 text-xs max-w-xs leading-relaxed">{errorMsg}</div>
                            <button
                                onClick={() => onClose?.()}
                                className="mt-2 text-xs text-gray-400 underline hover:text-white"
                            >
                                Volver a Snapshot
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <div className="text-xs text-white/80 font-semibold uppercase tracking-wide">{status}</div>
                        </>
                    )}
                </div>
            )}
            {status === 'Reproduciendo' && (
                <div className="absolute bottom-2 left-2 text-[10px] text-yellow-300/70 bg-black/50 px-1.5 py-0.5 rounded">
                    Audio WebRTC pendiente de negociación
                </div>
            )}
        </div>
    );
}
