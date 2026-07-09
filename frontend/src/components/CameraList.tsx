import React, { useState } from 'react';
import type { Camera, CameraEvent } from '../types/camera';

interface Props {
    cameras: Camera[];
    events: CameraEvent[];
    onDelete: (id: string) => Promise<void>;
}

const STATUS_COLORS: Record<Camera['status'], string> = {
    online:  'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
    offline: 'bg-red-500/20 text-red-400 border border-red-500/30',
    unknown: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
};

const STATUS_LABELS: Record<string, string> = {
    online: 'ONLINE',
    offline: 'OFFLINE',
    unknown: 'DESCONOCIDO',
};

type ActiveTab = 'preview' | 'logs' | 'info' | 'matter';

// Helper to determine the camera brand logo based on its name
function getBrandLogo(name: string): string {
    const n = name.toLowerCase();
    if (n.includes('ring')) return '/assets/logos/ring.png';
    if (n.includes('wyze')) return '/assets/logos/wyze.png';
    if (n.includes('tapo') || n.includes('tp-link')) return '/assets/logos/tapo.png';
    if (n.includes('tuya')) return '/assets/logos/tuya.png';
    if (n.includes('ezviz')) return '/assets/logos/ezviz.png';
    if (n.includes('hikvision')) return '/assets/logos/hikvision.png';
    if (n.includes('reolink')) return '/assets/logos/reolink.png';
    if (n.includes('dahua')) return '/assets/logos/dahua.png';
    if (n.includes('google') || n.includes('nest')) return '/assets/logos/google-nest.png';
    if (n.includes('arlo')) return '/assets/logos/arlo.png';
    if (n.includes('vimtag')) return '/assets/logos/vimtag.png';
    
    // Generic fallback icon if no brand is matched
    return '';
}

export function CameraList({ cameras, events, onDelete }: Props) {
    const [selectedId, setSelectedId]     = useState<string | null>(cameras[0]?.id ?? null);
    const [activeTab, setActiveTab]       = useState<ActiveTab>('preview');
    const [deletingId, setDeletingId]     = useState<string | null>(null);
    const [deleteError, setDeleteError]   = useState<string | null>(null);

    const selected = cameras.find(c => c.id === selectedId) ?? null;
    const cameraEvents = events.filter(e => e.camera_id === selectedId);

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta cámara y todo su historial? Esta acción no se puede deshacer.')) return;
        setDeletingId(id);
        setDeleteError(null);
        try {
            await onDelete(id);
            if (selectedId === id) setSelectedId(cameras.find(c => c.id !== id)?.id ?? null);
        } catch (err: unknown) {
            setDeleteError(err instanceof Error ? err.message : String(err));
        } finally {
            setDeletingId(null);
        }
    };

    // ── Empty state ────────────────────────────────────────────────────────────
    if (cameras.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center text-center py-20 px-8
                            border border-dashed border-white/10 rounded-2xl">
                <div className="w-16 h-16 mb-4 rounded-full bg-white/5 flex items-center justify-center text-3xl">
                    📷
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Sin cámaras configuradas</h3>
                <p className="text-sm text-gray-500 max-w-xs">
                    Agrega tu primera cámara usando el botón de arriba. Soportamos RTSP, ONVIF y Google Nest SDM.
                </p>
            </div>
        );
    }

    return (
        <div className="flex gap-4 w-full">
            {/* ── Camera sidebar ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-2 w-52 shrink-0">
                {cameras.map(cam => (
                    <button
                        key={cam.id}
                        onClick={() => { setSelectedId(cam.id); setActiveTab('preview'); }}
                        className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all ${
                            selectedId === cam.id
                                ? 'border-blue-500/50 bg-blue-500/10'
                                : 'border-white/5 bg-white/[0.02] hover:bg-white/5'
                        }`}
                    >
                        <div className="flex items-center gap-2 w-full mb-1">
                            {getBrandLogo(cam.name) ? (
                                <img src={getBrandLogo(cam.name)} alt="brand" className="w-5 h-5 object-contain opacity-90" />
                            ) : (
                                <span className="text-sm opacity-50">📷</span>
                            )}
                            <span className="text-sm font-semibold text-white truncate flex-1">{cam.name}</span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">{cam.ip}</span>
                        <span className={`mt-1.5 px-1.5 py-0.5 text-[9px] font-bold rounded-full ${STATUS_COLORS[cam.status]}`}>
                            {STATUS_LABELS[cam.status]}
                        </span>
                    </button>
                ))}
            </div>

            {/* ── Camera detail panel ────────────────────────────────────── */}
            {selected && (
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                    {/* Camera header */}
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-bold flex items-center gap-3">
                                {getBrandLogo(selected.name) ? (
                                    <img src={getBrandLogo(selected.name)} alt="brand" className="w-8 h-8 object-contain drop-shadow-md" />
                                ) : (
                                    <span>📷</span>
                                )}
                                {selected.name}
                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${STATUS_COLORS[selected.status]}`}>
                                    {STATUS_LABELS[selected.status]}
                                </span>
                            </h2>
                            <p className="text-xs text-gray-500 font-mono mt-1">
                                {selected.protocol} · {selected.ip}:{selected.port}
                                {selected.codec && ` · ${selected.codec}`}
                            </p>
                        </div>
                        <button
                            onClick={() => handleDelete(selected.id)}
                            disabled={deletingId === selected.id}
                            className="px-3 py-1.5 text-xs font-bold text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
                        >
                            {deletingId === selected.id ? 'Eliminando…' : '🗑 Eliminar'}
                        </button>
                    </div>

                    {deleteError && (
                        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                            {deleteError}
                        </p>
                    )}

                    {/* Tabs */}
                    <div className="flex gap-1 border-b border-white/10">
                        {(['preview', 'logs', 'info', 'matter'] as ActiveTab[]).map(t => (
                            <button
                                key={t}
                                onClick={() => setActiveTab(t)}
                                className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
                                    activeTab === t
                                        ? 'border-blue-500 text-white'
                                        : 'border-transparent text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                {t === 'preview' ? 'Preview' : t === 'logs' ? 'Logs' : t === 'info' ? 'Info' : 'Matter'}
                            </button>
                        ))}
                    </div>

                    {/* Preview tab */}
                    {activeTab === 'preview' && (
                        <div className="aspect-video bg-black/60 rounded-xl border border-white/5 flex items-center justify-center relative overflow-hidden">
                            {selected.status === 'offline' ? (
                                <div className="flex flex-col items-center gap-2 text-gray-600">
                                    <span className="text-4xl">📵</span>
                                    <p className="text-sm">Cámara desconectada</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-gray-600">
                                    <span className="text-4xl animate-pulse">🎥</span>
                                    <p className="text-sm">Stream bajo demanda</p>
                                    <p className="text-xs text-gray-700">(Implementación FFmpeg pendiente)</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Logs tab */}
                    {activeTab === 'logs' && (
                        <div className="bg-black/60 rounded-xl border border-white/5 h-64 p-3 overflow-y-auto font-mono text-xs flex flex-col gap-1">
                            {cameraEvents.length === 0 ? (
                                <p className="text-gray-600 italic">Sin eventos recientes para esta cámara.</p>
                            ) : (
                                cameraEvents.map(ev => (
                                    <div key={ev.id} className="flex gap-2 items-start">
                                        <span className="text-gray-600 shrink-0">
                                            {new Date(ev.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className={
                                            ev.event_type === 'error' ? 'text-red-400' :
                                            ev.event_type === 'offline' ? 'text-yellow-400' :
                                            ev.event_type === 'person' || ev.event_type === 'motion' ? 'text-emerald-400' :
                                            'text-blue-300'
                                        }>
                                            [{ev.event_type.toUpperCase()}]
                                        </span>
                                        <span className="text-gray-400">
                                            {JSON.stringify(ev.metadata)}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Info tab */}
                    {activeTab === 'info' && (
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                ['ID', selected.id.split('-')[0] + '…'],
                                ['Protocolo', selected.protocol],
                                ['IP', selected.ip],
                                ['Puerto', String(selected.port)],
                                ['Puerto ONVIF', selected.onvif_port ? String(selected.onvif_port) : '—'],
                                ['Codec', selected.codec ?? '—'],
                                ['Usuario', selected.username ?? '—'],
                                ['URL RTSP', selected.rtsp_url ?? '—'],
                                ['Agregada', new Date(selected.created_at).toLocaleDateString()],
                            ].map(([k, v]) => (
                                <div key={k} className="bg-white/[0.03] border border-white/5 rounded-lg px-3 py-2">
                                    <p className="text-[10px] text-gray-600 uppercase tracking-wider">{k}</p>
                                    <p className="text-sm text-white font-mono truncate mt-0.5">{v}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Matter tab */}
                    {activeTab === 'matter' && (
                        <div className="flex flex-col py-6 px-4 border border-white/5 bg-black/40 rounded-xl">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-500/20 rounded-lg border border-blue-500/30">
                                    <span className="text-xl">🌐</span>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white">Configuración Matter</h3>
                                    <p className="text-xs text-gray-400">
                                        Expuesta dinámicamente al Fabric a través de Matterbridge.
                                    </p>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                <div className="bg-white/[0.03] border border-white/5 rounded-lg px-4 py-3">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Vendor ID (VID)</p>
                                    <p className="text-lg font-mono text-blue-400 font-bold">
                                        0x{Number(selected.matter_vendor_id ?? 4939).toString(16).toUpperCase()}
                                    </p>
                                </div>
                                <div className="bg-white/[0.03] border border-white/5 rounded-lg px-4 py-3">
                                    <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Product ID (PID)</p>
                                    <p className="text-lg font-mono text-emerald-400 font-bold">
                                        0x{Number(selected.matter_product_id ?? 2049).toString(16).toUpperCase()}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 bg-white/[0.03] border border-white/5 rounded-lg px-4 py-3">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Nombre en el Fabric</p>
                                <p className="text-sm font-medium text-white">
                                    {selected.matter_device_name || selected.name}
                                </p>
                            </div>
                            
                            <p className="mt-6 text-[10px] text-gray-600 text-center italic">
                                El emparejamiento maestro de la red Matter se gestiona desde el panel principal de Matterbridge.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
