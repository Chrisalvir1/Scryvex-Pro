import React, { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../lib/ingress-url';

interface WebRTCPlayerProps {
    cameraId: string;
    onError?: (err: Error) => void;
}

export function WebRTCPlayer({ cameraId, onError }: WebRTCPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const [status, setStatus] = useState<string>('connecting');

    useEffect(() => {
        const pc = new RTCPeerConnection();
        pcRef.current = pc;
        let sessionId = '';

        pc.ontrack = (event) => {
            if (videoRef.current) {
                videoRef.current.srcObject = event.streams[0];
            }
        };

        pc.oniceconnectionstatechange = () => {
            setStatus(pc.iceConnectionState);
        };

        pc.addTransceiver('video', { direction: 'recvonly' });

        const start = async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                const res = await fetch(apiUrl(`/api/cameras/${cameraId}/webrtc/offer`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sdp: offer.sdp, type: offer.type })
                });

                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                sessionId = data.sessionId;
                await pc.setRemoteDescription({ type: data.type, sdp: data.sdp });

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
            } catch (err: any) {
                console.error('WebRTC error', err);
                setStatus('error');
                if (onError) onError(err);
            }
        };

        start();

        return () => {
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
            {status !== 'connected' && status !== 'completed' && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-white uppercase font-bold">
                    WebRTC: {status}
                </div>
            )}
        </div>
    );
}
