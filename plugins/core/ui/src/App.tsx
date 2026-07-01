import { useState } from 'react';
import { useScrypted } from './useScrypted';
import './index.css';

function App() {
  const { client, error, devices } = useScrypted();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'cameras' | 'plugins'>('dashboard');

  if (error) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <h2 style={{ color: '#ff4444' }}>Connection Error</h2>
          <p>{error}</p>
          <button className="glass-button" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <h2 className="text-gradient">Scrypted Pro G&C</h2>
          <p>Connecting to server...</p>
        </div>
      </div>
    );
  }

  const cameras = devices.filter(d => d.interfaces?.includes('Camera'));
  const plugins = devices.filter(d => d.id === d.pluginId || d.interfaces?.includes('MixinProvider'));

  return (
    <div className="app-container">
      <div className="sidebar">
        <h2 className="text-gradient" style={{ marginBottom: '32px' }}>Scrypted Pro G&C</h2>
        
        <div 
          className={`glass-card ${activeTab === 'dashboard' ? 'active' : ''}`}
          style={{ padding: '12px 16px', cursor: 'pointer', borderLeft: activeTab === 'dashboard' ? '4px solid var(--accent-cyan)' : '' }}
          onClick={() => setActiveTab('dashboard')}
        >
          Dashboard
        </div>
        <div 
          className={`glass-card ${activeTab === 'cameras' ? 'active' : ''}`}
          style={{ padding: '12px 16px', cursor: 'pointer', borderLeft: activeTab === 'cameras' ? '4px solid var(--accent-cyan)' : '' }}
          onClick={() => setActiveTab('cameras')}
        >
          Cameras
        </div>
        <div 
          className={`glass-card ${activeTab === 'plugins' ? 'active' : ''}`}
          style={{ padding: '12px 16px', cursor: 'pointer', borderLeft: activeTab === 'plugins' ? '4px solid var(--accent-cyan)' : '' }}
          onClick={() => setActiveTab('plugins')}
        >
          Plugins
        </div>
      </div>

      <div className="main-content">
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</h3>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ padding: '6px 12px', background: 'rgba(0, 240, 255, 0.1)', borderRadius: '20px', fontSize: '14px', color: 'var(--accent-cyan)' }}>
              Connected
            </span>
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h4 style={{ color: 'var(--text-secondary)' }}>Total Devices</h4>
              <h1 style={{ fontSize: '48px', margin: '16px 0' }}>{devices.length}</h1>
            </div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h4 style={{ color: 'var(--text-secondary)' }}>Cameras Active</h4>
              <h1 style={{ fontSize: '48px', margin: '16px 0', color: 'var(--accent-cyan)' }}>{cameras.length}</h1>
            </div>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h4 style={{ color: 'var(--text-secondary)' }}>Plugins Loaded</h4>
              <h1 style={{ fontSize: '48px', margin: '16px 0', color: 'var(--accent-petrol)' }}>{plugins.length}</h1>
            </div>
          </div>
        )}

        {activeTab === 'cameras' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {cameras.map(cam => (
              <div key={cam.id} className="glass-card" style={{ overflow: 'hidden' }}>
                <div style={{ height: '180px', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                  {/* We just show a static placeholder or snapshot url to avoid reproducing video as requested */}
                  <span style={{ color: 'var(--text-secondary)' }}>Snapshot Preview</span>
                  {/* Ideally: <img src={`/endpoint/@scrypted/core/public/picture/${cam.id}`} width="100%" height="100%" style={{objectFit: 'cover'}} /> */}
                </div>
                <div style={{ padding: '16px' }}>
                  <h4>{cam.name}</h4>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Type: {cam.type || 'Camera'}
                  </p>
                  <button className="glass-button" style={{ marginTop: '16px', width: '100%' }}>View Snapshot</button>
                </div>
              </div>
            ))}
            {cameras.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No cameras found.</p>}
          </div>
        )}

        {activeTab === 'plugins' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {plugins.map(plugin => (
              <div key={plugin.id} className="glass-card" style={{ padding: '20px' }}>
                <h4 style={{ color: 'var(--accent-cyan)' }}>{plugin.name || plugin.pluginId || plugin.id}</h4>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                  {plugin.pluginId === '@scrypted/homekit' ? 'HomeKit Export: Active' : (plugin.pluginId || 'System Plugin')}
                </p>
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <button className="glass-button" style={{ padding: '6px 12px', fontSize: '14px', background: 'rgba(255,255,255,0.1)' }}>Settings</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
