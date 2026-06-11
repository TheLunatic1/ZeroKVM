import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const coreSocket = io('http://localhost:4000');

function App() {
  const [roomCode, setRoomCode] = useState('');
  const [deviceName, setDeviceName] = useState('PC-' + Math.floor(Math.random() * 1000));
  const [isConnected, setIsConnected] = useState(false);
  const [isRemoteControl, setIsRemoteControl] = useState(false);
  const [remoteTarget, setRemoteTarget] = useState(null);
  
  const [peers, setPeers] = useState([]); // [{id, deviceName, isConnected}]
  const [transfer, setTransfer] = useState(null); 

  const [edgeMapping, setEdgeMapping] = useState({
    left: '',
    right: '',
    top: '',
    bottom: ''
  });

  useEffect(() => {
    coreSocket.on('connect', () => {
      console.log('Connected to local Core Service');
    });

    coreSocket.on('peers-updated', (updatedPeers) => {
      setPeers(updatedPeers);
      const connectedCount = updatedPeers.filter(p => p.isConnected).length;
      if (connectedCount > 0) {
        setIsConnected(true);
      } else {
        setIsConnected(false); // Only connected if at least 1 peer is connected
      }
    });

    coreSocket.on('remote-status', ({ active, target }) => {
      setIsRemoteControl(active);
      setRemoteTarget(target);
    });

    coreSocket.on('transfer-status', (status) => {
      setTransfer(status);
      if (status.progress >= 100) {
        setTimeout(() => setTransfer(null), 3000);
      }
    });

    return () => {
      coreSocket.off('connect');
      coreSocket.off('peers-updated');
      coreSocket.off('remote-status');
      coreSocket.off('transfer-status');
    };
  }, []);

  const handleConnect = () => {
    if (!roomCode || !deviceName) return;
    const signalingUrl = 'http://localhost:3001'; 
    coreSocket.emit('connect-to-room', { roomCode, deviceName, signalingUrl, edgeMapping });
  };

  const handleEdgeChange = (edge, targetId) => {
    const newMapping = { ...edgeMapping, [edge]: targetId };
    setEdgeMapping(newMapping);
    coreSocket.emit('update-edge-mapping', newMapping);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>ZeroKVM</h1>
        <p className="subtitle">Connect unlimited PCs seamlessly</p>
      </header>

      <div className="card">
        <h2>Connection</h2>
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

        <div className="status-bar">
          <span className={`status-indicator ${isConnected ? 'connected' : ''}`}></span>
          <span>Peers connected: {peers.filter(p => p.isConnected).length}</span>
        </div>
      </div>

      {peers.length > 0 && (
        <div className="card">
          <h2>Display Layout</h2>
          <p className="subtitle">Select which PC is on each side of this screen.</p>
          
          <div className="layout-grid">
            <div className="edge-select top">
              <label>Top</label>
              <select value={edgeMapping.top} onChange={e => handleEdgeChange('top', e.target.value)}>
                <option value="">None</option>
                {peers.map(p => <option key={p.id} value={p.id}>{p.deviceName}</option>)}
              </select>
            </div>
            
            <div className="layout-middle">
              <div className="edge-select left">
                <label>Left</label>
                <select value={edgeMapping.left} onChange={e => handleEdgeChange('left', e.target.value)}>
                  <option value="">None</option>
                  {peers.map(p => <option key={p.id} value={p.id}>{p.deviceName}</option>)}
                </select>
              </div>
              
              <div className="center-monitor">
                {deviceName}
              </div>
              
              <div className="edge-select right">
                <label>Right</label>
                <select value={edgeMapping.right} onChange={e => handleEdgeChange('right', e.target.value)}>
                  <option value="">None</option>
                  {peers.map(p => <option key={p.id} value={p.id}>{p.deviceName}</option>)}
                </select>
              </div>
            </div>
            
            <div className="edge-select bottom">
              <label>Bottom</label>
              <select value={edgeMapping.bottom} onChange={e => handleEdgeChange('bottom', e.target.value)}>
                <option value="">None</option>
                {peers.map(p => <option key={p.id} value={p.id}>{p.deviceName}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className={`card remote-control-card ${isRemoteControl ? 'active' : ''}`}>
        <h2>Remote Control Mode</h2>
        {isRemoteControl ? (
          <p className="active-text">ACTIVE: Controlling {remoteTarget}</p>
        ) : (
          <p>Move mouse off the screen edges to take control.</p>
        )}
      </div>

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
  );
}

export default App;
