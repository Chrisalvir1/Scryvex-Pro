import React, { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../lib/ingress-url';

interface WebRTCPlayerProps {
    cameraId: string;
    onError?: (err: Error) => void;
}

export function WebRTCPlayer({ cameraId, onError }: WebRTCPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const [status, setStatus] = useState<string>('Validando cámara');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        let sessionId = '';
        let frameTimeout: NodeJS.Timeout | null = null;
        let notifiedFirstFrame = false;

        pc.ontrack = (event) => {
            if (videoRef.current) {
                videoRef.current.srcObject = event.streams[0];
            }
        };

        pc.oniceconnectionstatechange = () => {
            const state = pc.iceConnectionState;
            if (state === 'checking') setStatus('Conectando ICE');
            else if (state === 'connected') setStatus('Recibiendo RTP');
            else if (state === 'failed' || state === 'disconnected') {
                handleError('Conexión ICE fallida. Timeout.');
            }
        };

        pc.addTransceiver('video', { direction: 'recvonly' });

        const handleError = (msg: string) => {
            if (frameTimeout) clearTimeout(frameTimeout);
            setStatus('failed');
            setErrorMsg(msg);
            if (onError) onError(new Error(msg));
        };

        const start = async () => {
            try {
                setStatus('Negociando WebRTC');
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                const res = await fetch(apiUrl(`/api/cameras/${cameraId}/webrtc/offer`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sdp: offer.sdp, type: offer.type })
                });

                if (res.status === 409) {
                    throw new Error('La cámara rechazó ONVIF o no está disponible.');
                }
                if (res.status === 406) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || 'Este navegador no puede reproducir HEVC mediante WebRTC.');
                }
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                sessionId = data.sessionId;
                await pc.setRemoteDescription({ type: data.type, sdp: data.sdp });

                setStatus('Conectando ICE');

                pc.onicecandidate = (event) => {
                    if (event.candidate && sessionId) {
                        fetch(apiUrl(`/api/cameras/${cameraId}/webrtc/candidate/${sessionId}`), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                candidate: event.candidate.candidate,
                                sdpMid: event.candidate.sdpMid,
                                sdpMLineIndex: event.candidate.sdpMLineIndex
                            })
                        }).catch(console.error);
                    }
                };

                // Watchdog for first frame after negotiation
                frameTimeout = setTimeout(() => {
                    if (!notifiedFirstFrame) {
                        handleError('El navegador negoció HEVC, pero no pudo decodificar el primer frame.');
                    }
                }, 20000); // 15s ICE + RTP buffer timeout on frontend

            } catch (err: any) {
                console.error('WebRTC error', err);
                handleError(err.message);
            }
        };

        start();

        const handleVideoPlay = () => {
            if (!notifiedFirstFrame && sessionId) {
                notifiedFirstFrame = true;
                setStatus('Reproduciendo');
                if (frameTimeout) clearTimeout(frameTimeout);
                fetch(apiUrl(`/api/cameras/${cameraId}/live/webrtc/${sessionId}/first-frame`), {
                    method: 'POST'
                }).catch(console.error);
            }
        };

        if (videoRef.current) {
            videoRef.current.addEventListener('loadeddata', handleVideoPlay);
            videoRef.current.addEventListener('playing', handleVideoPlay);
        }

        return () => {
            if (frameTimeout) clearTimeout(frameTimeout);
            pc.close();
            pcRef.current = null;
        };
    }, [cameraId, onError]);

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
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center flex-col p-4 text-center">
                    {status === 'failed' ? (
                        <>
                            <div className="text-red-400 font-bold mb-2">Error de WebRTC</div>
                            <div className="text-xs text-red-200">{errorMsg}</div>
                        </>
                    ) : (
                        <div className="text-xs text-white uppercase font-bold">{status}...</div>
                    )}
                </div>
            )}
        </div>
    );
}
