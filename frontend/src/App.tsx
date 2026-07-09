import React, { useState, useEffect } from 'react';

function App() {
  const [remuxing, setRemuxing] = useState(true);
  const [matterPin, setMatterPin] = useState('00000000');
  const [activeTab, setActiveTab] = useState('preview');
  const [show2FA, setShow2FA] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showAddWizard, setShowAddWizard] = useState(false);
  const [wizardTab, setWizardTab] = useState('local');
  const [testStatus, setTestStatus] = useState<'idle'|'testing'|'success'|'fail'>('idle');

  useEffect(() => {
    const interval = setInterval(() => {
      const seed = Math.floor(Date.now() / (1000 * 60 * 10));
      let pin = (seed * 1103515245 + 12345) % 99999999;
      setMatterPin(pin.toString().padStart(8, '0'));
    }, 1000);
    const timeout = setTimeout(() => setShow2FA(true), 25000);
    return () => { clearInterval(interval); clearTimeout(timeout); }
  }, []);

  const handleTestConnection = () => {
    setTestStatus('testing');
    setTimeout(() => { setTestStatus('success'); }, 1500);
  };

  return (
    <div className="min-h-screen p-6 md:p-10 flex flex-col items-center gap-10">
      
      {/* Header */}
      <div className="flex justify-between w-full max-w-6xl items-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
          Scryvex Pro
        </h1>
        <div className="flex gap-4">
          <button onClick={() => setShowAddWizard(true)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors shadow-[0_0_15px_rgba(37,99,235,0.4)]">
            + Agregar Cámara
          </button>
          <button onClick={() => setShowRestoreModal(true)} className="liquid-glass px-4 py-2 text-sm text-blue-300 hover:text-blue-100 transition-colors">
            🔄 Smart Restore
          </button>
          <button className="liquid-glass px-4 py-2 text-sm text-red-400 hover:bg-red-500/20 transition-colors">
            ⚡ Reinicio Global
          </button>
        </div>
      </div>
      
      {/* Main UI Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 w-full max-w-6xl">
        {/* Camera Card */}
        <div className="liquid-glass p-6 flex flex-col gap-4 xl:col-span-2">
          {/* ... Camera Card Content ... */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-white/10 pb-4">
            <div>
              <h2 className="text-2xl font-semibold flex items-center gap-3">
                Front Door Camera
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">ONLINE</span>
              </h2>
              <p className="text-xs text-gray-400 mt-1 font-mono">IP: 192.168.1.50 | MAC: 00:1A:2B:3C:4D:5E</p>
            </div>
            
            <div className="flex items-center gap-2 mt-4 md:mt-0">
              <div className="px-3 py-1 text-xs font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {remuxing ? 'H.265 | 4K' : 'H.264 | 1080p'}
              </div>
              <button className="px-3 py-1 rounded-full text-xs font-bold border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors">
                 Reinicio
              </button>
            </div>
          </div>
          
          <div className="flex gap-1 border-b border-white/10 mt-2">
             <button onClick={() => setActiveTab('preview')} className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'preview' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>Preview</button>
             <button onClick={() => setActiveTab('logs')} className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'logs' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>Logs</button>
             <button onClick={() => setActiveTab('security')} className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'security' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>Seguridad</button>
             <button onClick={() => setActiveTab('ha')} className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'ha' ? 'border-blue-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}>Automatizaciones HA</button>
          </div>

          {activeTab === 'preview' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
               <div className="aspect-video bg-black/50 rounded-lg flex flex-col relative overflow-hidden border border-white/5">
                 <div className="flex-1 flex items-center justify-center relative">
                    <span className="text-white/30 font-mono text-sm tracking-widest z-0">PREVIEW OFFLINE</span>
                    <div className="absolute top-4 left-4 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2 py-1 rounded backdrop-blur-md z-10">
                      Person Detected (YOLOv10)
                    </div>
                 </div>
                 <div className="h-12 bg-black/60 backdrop-blur-sm border-t border-white/10 flex items-center justify-between px-4 z-10">
                   <div className="flex items-center gap-3">
                     <button className="text-white hover:text-blue-400 transition-colors text-sm">▶ Play (On-Demand)</button>
                     <button className="text-white hover:text-red-400 transition-colors text-sm">■ Stop</button>
                   </div>
                 </div>
               </div>
            </div>
          )}

          {activeTab === 'logs' && (
             <div className="flex flex-col gap-2 animate-in fade-in duration-300">
               <div className="bg-black/60 rounded border border-white/5 h-64 p-3 overflow-y-auto font-mono text-xs text-green-400 flex flex-col gap-1">
                 <div>[SYSTEM] Camera initialized.</div>
                 <div>[ONVIF] Smart branch selected (use_yolo_ai: false). CPU saved.</div>
                 <div>[HAP] Mapped AccessoryInformation to Scryvex Pro (MAC: 00:1A:2B:3C:4D:5E).</div>
                 <div>[HAP] Linked MotionSensor & Lightbulb via iOS 27 Toggles.</div>
                 <div className="text-gray-500">Waiting for events...</div>
               </div>
             </div>
          )}
        </div>

        {/* Matter Network Card */}
        <div className="liquid-glass p-6 flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">Red Matter 1.6</h2>
          <div className="flex-1 flex flex-col items-center justify-center gap-6 py-8">
            <div className="w-40 h-40 bg-white p-2 rounded-xl flex items-center justify-center">
               <div className="w-full h-full border-4 border-dashed border-black flex flex-wrap gap-1 p-1">
                  {Array.from({length: 16}).map((_, i) => (
                    <div key={i} className="w-[20%] h-[20%] bg-black"></div>
                  ))}
               </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-1">Rotating Setup PIN (10 min)</p>
              <p className="text-3xl font-mono tracking-widest font-bold text-white">
                {matterPin.slice(0,4)}-{matterPin.slice(4)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Camera Wizard Modal */}
      {showAddWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-2xl p-4">
          <div className="liquid-glass border-blue-500/30 p-0 rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden animate-in zoom-in-95">
             <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
               <h2 className="text-2xl font-bold">Agregar Cámara</h2>
               <button onClick={() => setShowAddWizard(false)} className="text-gray-400 hover:text-white">✕</button>
             </div>
             
             <div className="flex border-b border-white/10 bg-black/20">
               <button onClick={() => setWizardTab('local')} className={`flex-1 py-4 font-semibold text-sm transition-colors ${wizardTab === 'local' ? 'text-blue-400 border-b-2 border-blue-500 bg-white/5' : 'text-gray-400 hover:bg-white/5'}`}>
                 Red Local (RTSP/ONVIF)
               </button>
               <button onClick={() => setWizardTab('cloud')} className={`flex-1 py-4 font-semibold text-sm transition-colors ${wizardTab === 'cloud' ? 'text-purple-400 border-b-2 border-purple-500 bg-white/5' : 'text-gray-400 hover:bg-white/5'}`}>
                 Ecosistemas Cloud
               </button>
             </div>

             <div className="p-8">
               {wizardTab === 'local' && (
                 <div className="flex flex-col gap-5 animate-in fade-in">
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs text-gray-400 block mb-1">IP Address</label>
                       <input type="text" placeholder="192.168.1.X" className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                     </div>
                     <div>
                       <label className="text-xs text-gray-400 block mb-1">Puerto (ONVIF/RTSP)</label>
                       <input type="text" placeholder="8000" className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                     </div>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div>
                       <label className="text-xs text-gray-400 block mb-1">Usuario</label>
                       <input type="text" placeholder="admin" className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                     </div>
                     <div>
                       <label className="text-xs text-gray-400 block mb-1">Contraseña</label>
                       <input type="password" placeholder="••••••••" className="w-full bg-black/50 border border-white/10 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                     </div>
                   </div>
                   
                   <div className="flex items-center justify-between mt-4">
                     <button onClick={handleTestConnection} className={`px-4 py-2 rounded text-sm font-semibold transition-all ${testStatus === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-gray-800 hover:bg-gray-700 text-white'}`}>
                       {testStatus === 'idle' ? 'Probar Conexión (On-Demand)' : testStatus === 'testing' ? 'Conectando FFmpeg...' : 'Stream Válido ✓'}
                     </button>
                     <button disabled={testStatus !== 'success'} className={`px-6 py-2 rounded-lg font-bold transition-all ${testStatus === 'success' ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-gray-800/50 text-gray-500 cursor-not-allowed'}`}>
                       Guardar Localmente
                     </button>
                   </div>
                 </div>
               )}

               {wizardTab === 'cloud' && (
                 <div className="flex flex-col gap-6 animate-in fade-in">
                   <p className="text-sm text-gray-400">Selecciona un ecosistema. Las cámaras descubiertas se desacoplarán automáticamente en PostgreSQL como entidades 100% independientes (Multi-Instancia).</p>
                   
                   <div className="grid grid-cols-4 gap-4">
                     <button className="flex flex-col items-center justify-center p-4 bg-white/5 border border-purple-500/30 rounded-xl hover:bg-purple-500/20 transition-all text-purple-300">
                       <span className="text-2xl mb-2">💍</span> Ring
                     </button>
                     <button className="flex flex-col items-center justify-center p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-gray-300">
                       <span className="text-2xl mb-2">🔋</span> Tuya
                     </button>
                     <button className="flex flex-col items-center justify-center p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all text-gray-300">
                       <span className="text-2xl mb-2">☁️</span> Arlo
                     </button>
                     <button className="flex flex-col items-center justify-center p-4 bg-blue-900/20 border border-blue-500/50 rounded-xl hover:bg-blue-500/20 transition-all text-blue-300 shadow-[0_0_15px_rgba(37,99,235,0.2)]">
                       <span className="text-2xl mb-2">🛡️</span> Nest SDM
                     </button>
                   </div>

                   <div className="bg-blue-900/20 border border-blue-500/50 p-5 rounded-xl">
                     <h3 className="font-bold text-blue-300 mb-3">Google Nest (Alta Seguridad)</h3>
                     <p className="text-xs text-blue-200/70 mb-4">Ingresa tus credenciales maestras de la Device Access Console. Scryvex Pro servirá como redirect local para OAuth 2.0 y negociará WebRTC puro.</p>
                     
                     <input type="text" placeholder="Project ID" className="w-full bg-black/50 border border-blue-500/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-3" />
                     <input type="text" placeholder="GCP Client ID" className="w-full bg-black/50 border border-blue-500/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-3" />
                     <input type="password" placeholder="GCP Client Secret" className="w-full bg-black/50 border border-blue-500/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-4" />
                     
                     <button className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded shadow-[0_0_15px_rgba(37,99,235,0.4)] transition-colors">
                       Iniciar Autorización OAuth 2.0
                     </button>
                   </div>
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      {/* 2FA Alert Modal Overlay (from Phase 8/11) */}
      {show2FA && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-red-950/80 border border-red-500/50 backdrop-blur-xl p-8 rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95">
             <div className="flex items-center gap-4 mb-4">
               <span className="text-4xl">⚠️</span>
               <h2 className="text-2xl font-bold text-red-200">2FA Requerido</h2>
             </div>
             <p className="text-red-300 text-sm mb-6">
               El LocalSecretManager detectó un error 401. <strong>Se han pausado en cascada 3 cámaras hijas</strong> (Ring). Ingresa el código 2FA para reanudar los motores AI y WebRTC.
             </p>
             <input type="text" placeholder="Código 2FA" className="w-full bg-black/50 border border-red-500/50 rounded-lg px-4 py-3 text-center text-xl tracking-[0.5em] focus:outline-none focus:border-red-400 mb-6 font-mono text-white" maxLength={6} />
             <div className="flex gap-3">
               <button onClick={() => setShow2FA(false)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white py-2 rounded-lg transition-colors">Cancelar</button>
               <button onClick={() => setShow2FA(false)} className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg transition-colors font-bold shadow-[0_0_15px_rgba(220,38,38,0.5)]">Verificar Token</button>
             </div>
          </div>
        </div>
      )}

      {/* Smart Restore Modal */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
           {/* Modal Body from Phase 8 */}
           <div className="liquid-glass border-blue-500/30 p-8 rounded-2xl shadow-2xl max-w-lg w-full animate-in fade-in">
             <h2 className="text-2xl font-bold mb-2">Restauración Inteligente</h2>
             <div className="flex justify-end gap-3 mt-6">
               <button onClick={() => setShowRestoreModal(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg">Cerrar</button>
             </div>
           </div>
        </div>
      )}

    </div>
  );
}

export default App;
