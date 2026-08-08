import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import Draggable from 'react-draggable';
import './App.css';
function App() {
  const [roomCode, setRoomCode] = useState('');
  const [deviceName, setDeviceName] = useState('PC-' + Math.floor(Math.random() * 1000));
  const [signalingUrl, setSignalingUrl] = useState('http://72.244.153.23:3001');
  const [isConnected, setIsConnected] = useState(false);
  const [isRemoteControl, setIsRemoteControl] = useState(false);
  const [remoteTarget, setRemoteTarget] = useState(null);
  
  const [role, setRole] = useState('master');
  const [isPaused, setIsPaused] = useState(false);
  const [peers, setPeers] = useState([]); // [{id, deviceName, isConnected, bounds}]
  const [transfer, setTransfer] = useState(null); 

  // Master's 2D layout map
  const [layout, setLayout] = useState({});

  useEffect(() => {
    const handlePeersUpdated = (event, updatedPeers) => {
      setPeers(updatedPeers);
      const connectedCount = updatedPeers.filter(p => p.isConnected).length;
      if (connectedCount > 0) {
        setIsConnected(true);
      } else {
        setIsConnected(false); // Only connected if at least 1 peer is connected
      }
    };

    const handleRemoteStatus = (event, { active, target }) => {
      setIsRemoteControl(active);
      setRemoteTarget(target);
    };

    const handleTransferStatus = (event, status) => {
      setTransfer(status);
      if (status.progress >= 100) {
        setTimeout(() => setTransfer(null), 3000);
      }
    };

    ipcRenderer.on('peers-updated', handlePeersUpdated);
    ipcRenderer.on('remote-status', handleRemoteStatus);
    ipcRenderer.on('transfer-status', handleTransferStatus);

    return () => {
      ipcRenderer.removeListener('peers-updated', handlePeersUpdated);
      ipcRenderer.removeListener('remote-status', handleRemoteStatus);
      ipcRenderer.removeListener('transfer-status', handleTransferStatus);
    };
  }, []);

  const handleConnect = () => {
    if (!roomCode || !deviceName || !signalingUrl) return;
    const bounds = { width: window.screen.width, height: window.screen.height };
    ipcRenderer.send('connect-to-room', { roomCode, deviceName, signalingUrl, edgeMapping: {}, layout, role, bounds });
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
    ipcRenderer.send('set-pause-state', !isPaused);
  };

  const updateLayout = (id, x, y) => {
    const newLayout = { ...layout, [id]: { x, y } };
    setLayout(newLayout);
    ipcRenderer.send('update-layout', newLayout);
    
    // Convert 2D coordinates into 4-way edge mapping
    const newEdgeMapping = { left: '', right: '', top: '', bottom: '' };
    Object.entries(newLayout).forEach(([peerId, pos]) => {
      // Basic quadrant detection relative to center (0,0)
      if (Math.abs(pos.x) > Math.abs(pos.y)) {
        if (pos.x < -40) newEdgeMapping.left = peerId;
        else if (pos.x > 40) newEdgeMapping.right = peerId;
      } else {
        if (pos.y < -30) newEdgeMapping.top = peerId;
        else if (pos.y > 30) newEdgeMapping.bottom = peerId;
      }
    });
    ipcRenderer.send('update-edge-mapping', newEdgeMapping);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>ZeroKVM</h1>
        <p className="subtitle">Connect unlimited PCs seamlessly</p>
      </header>

      <div className="main-content">
        <div className="left-column">
          <div className="card">
            <h2>Connection Settings</h2>
            
            <div className="input-group">
              <label>Role</label>
              <select value={role} onChange={e => setRole(e.target.value)} disabled={isConnected}>
                <option value="master">Master (Controller)</option>
                <option value="worker">Worker (Controlled)</option>
              </select>
            </div>

            <div className="input-group">
              <label>Your Device Name</label>
              <input 
                type="text" 
                value={deviceName} 
                onChange={e => setDeviceName(e.target.value)} 
                disabled={isConnected}
              />
            </div>
            <div className="input-group">
              <label>Signaling Server URL</label>
              <input 
                type="text" 
                value={signalingUrl} 
                onChange={e => setSignalingUrl(e.target.value)} 
                disabled={isConnected}
              />
            </div>
            <div className="input-group">
              <label>Room Code</label>
              <input 
                type="text" 
                value={roomCode} 
                onChange={e => setRoomCode(e.target.value)} 
                placeholder="e.g., studio" 
                disabled={isConnected}
              />
            </div>

            <button 
              className={`connect-btn ${isConnected ? 'connected' : ''}`} 
              onClick={handleConnect}
              disabled={isConnected || !roomCode || !deviceName}
            >
              {isConnected ? 'Joined Room' : 'Join Room'}
            </button>

            {role === 'master' && (
              <button 
                className={`connect-btn ${isPaused ? 'paused' : 'active-btn'}`}
                onClick={togglePause}
                style={{ marginTop: '10px', background: isPaused ? '#ff4b2b' : '' }}
              >
                {isPaused ? '▶ Resume Control' : '⏸ Pause Control'}
              </button>
            )}

            <div className="status-bar">
              <span className={`status-indicator ${isConnected ? 'connected' : ''}`}></span>
              <span>Peers connected: {peers.filter(p => p.isConnected).length}</span>
            </div>
          </div>
        </div>

        <div className="right-column">
          {role === 'master' ? (
            <>
              <div className={`card remote-control-card ${isRemoteControl ? 'active' : ''}`}>
                <h2>Remote Control Mode</h2>
                {isRemoteControl ? (
                  <p className="active-text">ACTIVE: Controlling {remoteTarget}</p>
                ) : (
                  <p>{isPaused ? 'Control paused.' : 'Move mouse off the screen edges to take control.'}</p>
                )}
              </div>

              {peers.length > 0 && (
                <div className="card layout-card">
                  <h2>Spatial Layout</h2>
                  <p className="subtitle">Drag the connected PCs to arrange them relative to your screen.</p>
                  
                  <div className="spatial-canvas" style={{ width: '100%', height: '300px', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '120px', height: '80px', background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))', border: '2px solid #3a7bd5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>
                      {deviceName} (You)
                    </div>
                    
                    {peers.map(p => (
                      <Draggable 
                        key={p.id}
                        bounds="parent"
                        defaultPosition={layout[p.id] || { x: 0, y: 0 }}
                        onStop={(e, data) => updateLayout(p.id, data.x, data.y)}
                      >
                        <div style={{ position: 'absolute', cursor: 'grab', width: '120px', height: '80px', background: 'rgba(56,239,125,0.2)', border: '2px solid #38ef7d', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexDirection: 'column' }}>
                          <strong>{p.deviceName}</strong>
                          <small style={{fontSize: '0.7rem', opacity: 0.7}}>Drag me</small>
                        </div>
                      </Draggable>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card">
              <h2>Worker Mode</h2>
              <p>This PC is acting as a Worker. The Master PC will automatically handle layout and screen configuration.</p>
              <p>Your physical mouse and keyboard will be temporarily disabled while the Master is controlling this PC.</p>
            </div>
          )}

          {transfer && (
            <div className="card transfer-card">
              <h2>File Transfer</h2>
              <p>{transfer.type === 'sending' ? 'Broadcasting' : 'Receiving'}: {transfer.filename}</p>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${transfer.progress}%` }}></div>
              </div>
              <p>{transfer.progress}%</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
