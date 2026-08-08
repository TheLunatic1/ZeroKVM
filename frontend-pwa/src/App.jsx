import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import Draggable from 'react-draggable';
import './App.css';

const DraggablePeer = ({ peer, layout, updateLayout }) => {
  const nodeRef = React.useRef(null);
  const w = peer.bounds ? peer.bounds.width / 20 : 60;
  const h = peer.bounds ? peer.bounds.height / 20 : 40;
  
  // Local state for smooth dragging before snapping is finalized
  const [dragPos, setDragPos] = React.useState(layout[peer.id] || { x: 0, y: 0 });

  React.useEffect(() => {
    setDragPos(layout[peer.id] || { x: 0, y: 0 });
  }, [layout, peer.id]);

  const handleDrag = (e, data) => {
    // Basic drag update
    setDragPos({ x: data.x, y: data.y });
  };

  return (
    <Draggable 
      nodeRef={nodeRef}
      position={dragPos}
      onDrag={handleDrag}
      onStop={(e, data) => {
        // Send final position to be snapped by the parent
        updateLayout(peer.id, data.x, data.y, w, h);
      }}
    >
      <div className="peer-box" ref={nodeRef} style={{ position: 'absolute', cursor: 'grab', width: `${w}px`, height: `${h}px`, background: 'rgba(56,239,125,0.2)', border: '2px solid #38ef7d', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexDirection: 'column' }}>
        <strong style={{fontSize: '0.9rem'}}>{peer.deviceName}</strong>
        {peer.bounds && <small style={{fontSize: '0.7rem', opacity: 0.7}}>{peer.bounds.width}x{peer.bounds.height}</small>}
        <small style={{fontSize: '0.6rem', opacity: 0.5}}>Drag me</small>
      </div>
    </Draggable>
  );
};

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
  const [localBounds, setLocalBounds] = useState({ width: 1920, height: 1080 });
  const canvasRef = React.useRef(null);

  useEffect(() => {
    ipcRenderer.invoke('get-local-bounds').then(bounds => setLocalBounds(bounds));

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

  const updateLayout = (id, x, y, width, height) => {
    // --- Magnetic Snapping Logic ---
    let finalX = x;
    let finalY = y;
    const SNAP = 20; // 20px snap threshold

    // Collect all other boxes to snap against
    const boxes = [
      { id: 'master', x: 0, y: 0, w: localBounds.width / 20, h: localBounds.height / 20 }
    ];
    peers.forEach(p => {
      if (p.id !== id && layout[p.id]) {
        boxes.push({ id: p.id, x: layout[p.id].x, y: layout[p.id].y, w: p.bounds ? p.bounds.width / 20 : 60, h: p.bounds ? p.bounds.height / 20 : 40 });
      }
    });

    const myLeft = x;
    const myRight = x + width;
    const myTop = y;
    const myBottom = y + height;

    for (const b of boxes) {
      // Calculate other box edges based on their top-left being at the Master's center!
      // Wait, Master's visual center is 0,0, but its top-left is actually -w/2, -h/2 relative to the origin.
      // So Master's boundaries:
      let bLeft = b.x;
      let bRight = b.x + b.w;
      let bTop = b.y;
      let bBottom = b.y + b.h;

      if (b.id === 'master') {
        bLeft = -b.w / 2;
        bRight = b.w / 2;
        bTop = -b.h / 2;
        bBottom = b.h / 2;
      }

      // X Snapping
      if (Math.abs(myRight - bLeft) < SNAP) finalX = bLeft - width; // Snap my right to their left
      else if (Math.abs(myLeft - bRight) < SNAP) finalX = bRight; // Snap my left to their right
      else if (Math.abs(myLeft - bLeft) < SNAP) finalX = bLeft; // Snap left to left (corner alignment)
      else if (Math.abs(myRight - bRight) < SNAP) finalX = bRight - width; // Snap right to right

      // Y Snapping
      if (Math.abs(myBottom - bTop) < SNAP) finalY = bTop - height; // Snap my bottom to their top
      else if (Math.abs(myTop - bBottom) < SNAP) finalY = bBottom; // Snap my top to their bottom
      else if (Math.abs(myTop - bTop) < SNAP) finalY = bTop; // Snap top to top (corner alignment)
      else if (Math.abs(myBottom - bBottom) < SNAP) finalY = bBottom - height; // Snap bottom to bottom
    }

    const newLayout = { ...layout, [id]: { x: finalX, y: finalY } };
    setLayout(newLayout);
    
    // Build a graph of all nodes
    const nodes = [{ id: 'master', x: 0, y: 0 }];
    Object.keys(newLayout).forEach(peerId => {
      nodes.push({ id: peerId, x: newLayout[peerId].x, y: newLayout[peerId].y });
    });

    const newEdgeMapping = {};
    nodes.forEach(node => {
      newEdgeMapping[node.id] = { top: null, bottom: null, left: null, right: null };
      let minRight = Infinity, minLeft = Infinity, minTop = Infinity, minBottom = Infinity;
      
      nodes.forEach(other => {
        if (node.id === other.id) return;
        const dx = other.x - node.x;
        const dy = other.y - node.y;
        
        if (dx > Math.abs(dy) && dx < minRight) { minRight = dx; newEdgeMapping[node.id].right = other.id; }
        if (-dx > Math.abs(dy) && -dx < minLeft) { minLeft = -dx; newEdgeMapping[node.id].left = other.id; }
        if (dy > Math.abs(dx) && dy < minBottom) { minBottom = dy; newEdgeMapping[node.id].bottom = other.id; }
        if (-dy > Math.abs(dx) && -dy < minTop) { minTop = -dy; newEdgeMapping[node.id].top = other.id; }
      });
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
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button 
                  className={`connect-btn ${isPaused ? 'paused' : 'active-btn'}`}
                  onClick={togglePause}
                  style={{ background: isPaused ? '#ff4b2b' : '', flex: 1 }}
                >
                  {isPaused ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button 
                  className="connect-btn"
                  onClick={() => ipcRenderer.send('stop-remote-control')}
                  style={{ background: '#d32f2f', flex: 1 }}
                >
                  ⏹ Stop
                </button>
              </div>
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
                  
                  <div className="spatial-canvas" style={{ width: '100%', height: '400px', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', borderRadius: '12px', position: 'relative', overflow: 'hidden', cursor: 'grab' }}>
                    <Draggable cancel=".peer-box" nodeRef={canvasRef}>
                      <div ref={canvasRef} style={{ position: 'absolute', width: '2000px', height: '2000px', left: 'calc(50% - 1000px)', top: 'calc(50% - 1000px)' }}>
                        {/* Grid background for visual feedback while panning */}
                        <div style={{ width: '100%', height: '100%', backgroundImage: 'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)', backgroundSize: '50px 50px' }}></div>
                        
                        {/* Master Display (Center of the 2000x2000 canvas) */}
                        <div style={{ 
                          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', 
                          width: `${localBounds.width / 20}px`, height: `${localBounds.height / 20}px`,
                          background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.1))', 
                          border: '2px solid #3a7bd5', borderRadius: '8px', 
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', flexDirection: 'column'
                        }}>
                          <span style={{fontSize: '0.9rem', textAlign: 'center'}}>{deviceName} (You)</span>
                          <small style={{fontSize: '0.7rem', opacity: 0.7}}>{localBounds.width}x{localBounds.height}</small>
                        </div>
                        
                        {/* Peer Displays */}
                        <div style={{ position: 'absolute', left: '50%', top: '50%' }}>
                          {peers.map(p => (
                            <DraggablePeer key={p.id} peer={p} layout={layout} updateLayout={updateLayout} />
                          ))}
                        </div>
                      </div>
                    </Draggable>
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
