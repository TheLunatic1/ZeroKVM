const { uIOhook } = require('uiohook-napi');
const { mouse, keyboard, screen, Point } = require('@nut-tree-fork/nut-js');
const keyMap = require('./keyboardMapper');
const webKeyMap = require('./webKeyMapper');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

let koffi;
let blockInputFunc = null;
try {
  koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  // BOOL BlockInput(BOOL fBlockIt)
  blockInputFunc = user32.func('BlockInput', 'int', ['int']);
} catch (e) {
  console.log('Failed to load BlockInput via koffi:', e);
}

class InputManager {
  constructor(webrtcManager, edgeMapping, localSocket, role) {
    this.webrtcManager = webrtcManager;
    this.edgeMapping = edgeMapping || {}; 
    this.localSocket = localSocket;
    this.role = role || 'master';
    
    this.isPaused = false;
    
    this.activeRemoteTarget = null; 
    this.activeEdge = null; 
    this.controlledBy = null;
    
    this.screenBounds = { left: 0, right: 1920, top: 0, bottom: 1080 };
    
    this.justLocked = false;
    this.lockPoint = { x: 0, y: 0 };
    
    // Throttling properties
    this.pendingDeltaX = 0;
    this.pendingDeltaY = 0;
    this.lastSendTime = 0;
    this.throttleInterval = 16; // ~60fps
    
    this.webrtcManager.on('message', async (sourceId, channel, message) => {
      if (channel === 'input-channel') {
        try {
          const data = JSON.parse(message);
          this.handleRemoteMessage(sourceId, data);
        } catch (err) {}
      }
    });
  }

  async getVirtualScreen() {
    try {
        const { stdout } = await execPromise('powershell.exe -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SystemInformation]::VirtualScreen"');
        const matchRight = stdout.match(/Right\s*:\s*(-?\d+)/);
        const matchLeft = stdout.match(/Left\s*:\s*(-?\d+)/);
        const matchTop = stdout.match(/Top\s*:\s*(-?\d+)/);
        const matchBottom = stdout.match(/Bottom\s*:\s*(-?\d+)/);
        
        if (matchRight && matchLeft) {
            return {
                left: parseInt(matchLeft[1], 10),
                right: parseInt(matchRight[1], 10),
                top: parseInt(matchTop[1], 10),
                bottom: parseInt(matchBottom[1], 10)
            };
        }
    } catch (e) {
        console.error("Failed to get virtual screen bounds:", e);
    }
    const w = await screen.width();
    const h = await screen.height();
    return { left: 0, right: w, top: 0, bottom: h };
  }

  setPaused(isPaused) {
    this.isPaused = isPaused;
    if (isPaused && this.activeRemoteTarget) {
      this.exitRemoteMode();
    }
  }

  async startEdgeDetection() {
    this.screenBounds = await this.getVirtualScreen();
    console.log("Detected screen bounds:", this.screenBounds);
    
    uIOhook.on('mousemove', async (e) => {
      if (this.isPaused || this.role === 'worker') return;
      // If we are currently being controlled by a remote PC, ignore all local physical mouse movements
      if (this.controlledBy) return;

      if (!this.activeRemoteTarget) {
        // Local control mode
        let crossedEdge = null;
        if (e.x >= this.screenBounds.right - 2 && this.edgeMapping.right) crossedEdge = 'right';
        if (e.x <= this.screenBounds.left + 1 && this.edgeMapping.left) crossedEdge = 'left';
        if (e.y <= this.screenBounds.top + 1 && this.edgeMapping.top) crossedEdge = 'top';
        if (e.y >= this.screenBounds.bottom - 2 && this.edgeMapping.bottom) crossedEdge = 'bottom';
        
        if (crossedEdge) {
          const targetId = this.edgeMapping[crossedEdge];
          if (this.webrtcManager.peers[targetId] && this.webrtcManager.peers[targetId].isConnected) {
            console.log(`Edge ${crossedEdge} crossed! Controlling peer ${targetId}`);
            this.activeRemoteTarget = targetId;
            this.activeEdge = crossedEdge;
            this.localSocket.emit('remote-status', { active: true, target: this.webrtcManager.peers[targetId].deviceName });
            
            // Tell remote we are taking control
            this.webrtcManager.sendInputMessage(targetId, JSON.stringify({ type: 'take-control', enterEdge: crossedEdge }));
            this.lockPoint = { x: e.x, y: e.y };
            
            // Start the invisible capture window to swallow physical inputs
            const { ipcMain } = require('electron');
            ipcMain.emit('start-capture-window');
          }
        }
      } 
      // If activeRemoteTarget is set, we ignore uIOhook mousemove because the capture window handles it
    });

    uIOhook.on('mousedown', (e) => {
      // Ignored when controlling remotely (handled by capture window)
    });

    uIOhook.on('mouseup', (e) => {
      // Ignored when controlling remotely
    });

    uIOhook.on('keydown', (e) => {
      // Ignored when controlling remotely
    });

    uIOhook.on('keyup', (e) => {
      // Ignored when controlling remotely
    });

    uIOhook.on('wheel', (e) => {
      // Ignored when controlling remotely
    });

    uIOhook.start();
  }

  handleCaptureInput(data) {
    if (!this.activeRemoteTarget || this.isPaused) return;

    if (data.type === 'mousemove') {
      this.pendingDeltaX += data.dx;
      this.pendingDeltaY += data.dy;
      
      const now = Date.now();
      if (now - this.lastSendTime >= this.throttleInterval) {
        const msg = JSON.stringify({ type: 'mousemove', dx: this.pendingDeltaX, dy: this.pendingDeltaY });
        this.webrtcManager.sendInputMessage(this.activeRemoteTarget, msg);
        this.pendingDeltaX = 0;
        this.pendingDeltaY = 0;
        this.lastSendTime = now;
      }
    } 
    else if (data.type === 'mousedown' || data.type === 'mouseup') {
      // Nut.js mouse buttons: 0=Left, 1=Middle, 2=Right
      // Web mouse buttons: 0=Left, 1=Middle, 2=Right
      let mappedButton = data.button === 0 ? 1 : data.button === 2 ? 2 : 1; 
      // Wait, earlier we used data.button === 1 ? 0 : data.button === 2 ? 2 : 1. Let's send exactly what Nut.js needs.
      this.webrtcManager.sendInputMessage(this.activeRemoteTarget, JSON.stringify({ type: data.type, button: data.button }));
    }
    else if (data.type === 'keydown' || data.type === 'keyup') {
      // Send the code (e.g., 'KeyA') to the remote
      this.webrtcManager.sendInputMessage(this.activeRemoteTarget, JSON.stringify({ type: data.type, code: data.code }));
    }
    else if (data.type === 'wheel') {
      this.webrtcManager.sendInputMessage(this.activeRemoteTarget, JSON.stringify({ type: 'wheel', amount: Math.abs(data.deltaY) > 0 ? 1 : 0, rotation: data.deltaY > 0 ? 1 : -1 }));
    }
  }

  async handleRemoteMessage(sourceId, data) {
    if (this.isPaused) return;
    
    if (data.type === 'take-control') {
      console.log(`Being controlled by ${sourceId}`);
      this.controlledBy = sourceId;
      
      if (blockInputFunc) {
        blockInputFunc(1);
      }
      
      // Position our mouse at the entry edge
      if (!this.screenBounds) this.screenBounds = await this.getVirtualScreen();
      let startX = (this.screenBounds.left + this.screenBounds.right) / 2;
      let startY = (this.screenBounds.top + this.screenBounds.bottom) / 2;
      
      if (data.enterEdge === 'right') startX = this.screenBounds.left + 2;
      if (data.enterEdge === 'left') startX = this.screenBounds.right - 2;
      if (data.enterEdge === 'bottom') startY = this.screenBounds.top + 2;
      if (data.enterEdge === 'top') startY = this.screenBounds.bottom - 2;
      
      await mouse.setPosition(new Point(startX, startY));
    }
    else if (data.type === 'drop-control') {
      console.log(`Control dropped by ${sourceId}`);
      if (this.controlledBy === sourceId) {
        this.controlledBy = null;
        if (blockInputFunc) {
          blockInputFunc(0);
        }
      }
    }
    else if (data.type === 'edge-hit') {
       console.log(`Remote mouse hit edge: ${data.edge}`);
       // If the remote mouse hit the edge that connects back to us, we exit!
       if (this.activeEdge === 'right' && data.edge === 'left') this.exitRemoteMode();
       if (this.activeEdge === 'left' && data.edge === 'right') this.exitRemoteMode();
       if (this.activeEdge === 'top' && data.edge === 'bottom') this.exitRemoteMode();
       if (this.activeEdge === 'bottom' && data.edge === 'top') this.exitRemoteMode();
    }
    else if (this.controlledBy === sourceId) {
       this.injectInput(data);
    }
  }

  async injectInput(data) {
    if (data.type === 'mousemove') {
      const currentPos = await mouse.getPosition();
      
      let targetX = currentPos.x + data.dx;
      let targetY = currentPos.y + data.dy;
      
      let hitEdge = null;
      if (targetX <= this.screenBounds.left) { targetX = this.screenBounds.left; hitEdge = 'left'; }
      if (targetX >= this.screenBounds.right - 2) { targetX = this.screenBounds.right - 2; hitEdge = 'right'; }
      if (targetY <= this.screenBounds.top) { targetY = this.screenBounds.top; hitEdge = 'top'; }
      if (targetY >= this.screenBounds.bottom - 2) { targetY = this.screenBounds.bottom - 2; hitEdge = 'bottom'; }
      
      await mouse.setPosition(new Point(targetX, targetY));
      
      // Shake detection
      const now = Date.now();
      const dt = now - (this.lastMoveTime || now);
      const distance = Math.sqrt(data.dx * data.dx + data.dy * data.dy);
      
      if (dt > 0 && dt < 100) {
        const velocity = distance / dt;
        if (velocity > 10) { // arbitrary threshold for fast movement
          this.shakeCount = (this.shakeCount || 0) + 1;
        } else {
          this.shakeCount = Math.max(0, (this.shakeCount || 0) - 1);
        }
        
        if (this.shakeCount > 10) {
           const { ipcMain } = require('electron');
           ipcMain.emit('show-cursor-highlight', { x: targetX, y: targetY });
           this.shakeCount = 0; // reset
        }
      }
      this.lastMoveTime = now;
      
      if (hitEdge) {
        // We hit the boundary of our virtual screen. Let the controller know.
        const msg = JSON.stringify({ type: 'edge-hit', edge: hitEdge });
        this.webrtcManager.sendInputMessage(this.controlledBy, msg);
      }
    }
    else if (data.type === 'mousedown') {
      // web button 0 = left -> nut 0
      // web button 1 = middle -> nut 1
      // web button 2 = right -> nut 2
      let nutBtn = data.button === 0 ? 0 : data.button === 2 ? 2 : 1;
      await mouse.pressButton(nutBtn);
    }
    else if (data.type === 'mouseup') {
      let nutBtn = data.button === 0 ? 0 : data.button === 2 ? 2 : 1;
      await mouse.releaseButton(nutBtn);
    }
    else if (data.type === 'keydown') {
      // It might be a web 'code' or a legacy uiohook 'keycode'
      let nutKey = data.code ? webKeyMap[data.code] : keyMap[data.keycode];
      if (nutKey !== undefined) {
          await keyboard.pressKey(nutKey);
      }
    }
    else if (data.type === 'keyup') {
      let nutKey = data.code ? webKeyMap[data.code] : keyMap[data.keycode];
      if (nutKey !== undefined) {
          await keyboard.releaseKey(nutKey);
      }
    }
    else if (data.type === 'wheel') {
      if (data.rotation > 0) {
          await mouse.scrollDown(data.amount * 10);
      } else {
          await mouse.scrollUp(data.amount * 10);
      }
    }
  }

  exitRemoteMode() {
    console.log('Exiting remote control mode.');
    if (this.activeRemoteTarget) {
       this.webrtcManager.sendInputMessage(this.activeRemoteTarget, JSON.stringify({ type: 'drop-control' }));
    }
    
    const { ipcMain } = require('electron');
    ipcMain.emit('stop-capture-window');
    
    // Nudge the local mouse slightly away from the edge so it doesn't immediately re-trigger
    let escapeX = this.lockPoint.x;
    let escapeY = this.lockPoint.y;
    if (this.activeEdge === 'right') escapeX -= 100;
    if (this.activeEdge === 'left') escapeX += 100;
    if (this.activeEdge === 'top') escapeY += 100;
    if (this.activeEdge === 'bottom') escapeY -= 100;
    
    mouse.setPosition(new Point(escapeX, escapeY)).catch(()=>{});
    
    this.activeRemoteTarget = null;
    this.activeEdge = null;
    this.localSocket.emit('remote-status', { active: false, target: null });
  }

  setEdgeMapping(mapping) {
    this.edgeMapping = mapping || {};
  }

  stop() {
    uIOhook.stop();
  }
}

module.exports = InputManager;
