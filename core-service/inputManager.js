const { uIOhook } = require('uiohook-napi');
const { mouse, keyboard, screen, Point } = require('@nut-tree-fork/nut-js');

class InputManager {
  constructor(webrtcManager, edgeMapping, localSocket) {
    this.webrtcManager = webrtcManager;
    // edgeMapping: { left: peerId, right: peerId, top: peerId, bottom: peerId }
    this.edgeMapping = edgeMapping || {}; 
    this.localSocket = localSocket;
    
    this.activeRemoteTarget = null; // Stores the peerId we are currently controlling
    this.activeEdge = null; // The edge we crossed
    
    this.screenWidth = 1920; 
    this.screenHeight = 1080;
    
    this.webrtcManager.on('message', async (sourceId, channel, message) => {
      if (channel === 'input-channel') {
        try {
          const data = JSON.parse(message);
          this.injectInput(data);
        } catch (err) {}
      }
    });
  }

  async startEdgeDetection() {
    this.screenWidth = await screen.width();
    this.screenHeight = await screen.height();
    
    uIOhook.on('mousemove', async (e) => {
      if (!this.activeRemoteTarget) {
        // Local control. Check if we cross an edge that is mapped to a peer
        let crossedEdge = null;
        if (e.x >= this.screenWidth - 2 && this.edgeMapping.right) crossedEdge = 'right';
        if (e.x <= 1 && this.edgeMapping.left) crossedEdge = 'left';
        if (e.y <= 1 && this.edgeMapping.top) crossedEdge = 'top';
        if (e.y >= this.screenHeight - 2 && this.edgeMapping.bottom) crossedEdge = 'bottom';
        
        if (crossedEdge) {
          const targetId = this.edgeMapping[crossedEdge];
          if (this.webrtcManager.peers[targetId] && this.webrtcManager.peers[targetId].isConnected) {
            console.log(`Edge ${crossedEdge} crossed! Controlling peer ${targetId}`);
            this.activeRemoteTarget = targetId;
            this.activeEdge = crossedEdge;
            this.localSocket.emit('remote-status', { active: true, target: this.webrtcManager.peers[targetId].deviceName });
          }
        }
      } else {
        // Remote control mode
        let lockX = this.activeEdge === 'right' ? this.screenWidth - 2 : (this.activeEdge === 'left' ? 1 : e.x);
        let lockY = this.activeEdge === 'bottom' ? this.screenHeight - 2 : (this.activeEdge === 'top' ? 1 : e.y);
        
        const deltaX = e.x - lockX;
        const deltaY = e.y - lockY;

        if (deltaX !== 0 || deltaY !== 0) {
          const msg = JSON.stringify({ type: 'mousemove', dx: deltaX, dy: deltaY });
          this.webrtcManager.sendInputMessage(this.activeRemoteTarget, msg);
          
          await mouse.setPosition(new Point(lockX, lockY));
        }

        // Check if moving back into local screen
        if (this.activeEdge === 'right' && deltaX < -50) this.exitRemoteMode();
        if (this.activeEdge === 'left' && deltaX > 50) this.exitRemoteMode();
        if (this.activeEdge === 'top' && deltaY > 50) this.exitRemoteMode();
        if (this.activeEdge === 'bottom' && deltaY < -50) this.exitRemoteMode();
      }
    });

    uIOhook.on('mousedown', (e) => {
      if (this.activeRemoteTarget) {
        this.webrtcManager.sendInputMessage(this.activeRemoteTarget, JSON.stringify({ type: 'mousedown', button: e.button }));
      }
    });

    uIOhook.on('mouseup', (e) => {
      if (this.activeRemoteTarget) {
        this.webrtcManager.sendInputMessage(this.activeRemoteTarget, JSON.stringify({ type: 'mouseup', button: e.button }));
      }
    });

    uIOhook.on('keydown', (e) => {
      if (this.activeRemoteTarget) {
        this.webrtcManager.sendInputMessage(this.activeRemoteTarget, JSON.stringify({ type: 'keydown', keycode: e.keycode }));
      }
    });

    uIOhook.on('keyup', (e) => {
      if (this.activeRemoteTarget) {
        this.webrtcManager.sendInputMessage(this.activeRemoteTarget, JSON.stringify({ type: 'keyup', keycode: e.keycode }));
      }
    });

    uIOhook.start();
  }

  async injectInput(data) {
    if (data.type === 'mousemove') {
      const currentPos = await mouse.getPosition();
      const targetX = Math.max(0, Math.min(this.screenWidth, currentPos.x + data.dx));
      const targetY = Math.max(0, Math.min(this.screenHeight, currentPos.y + data.dy));
      await mouse.setPosition(new Point(targetX, targetY));
    }
    else if (data.type === 'mousedown') {
      await mouse.pressButton(data.button === 1 ? 0 : data.button === 2 ? 2 : 1);
    }
    else if (data.type === 'mouseup') {
      await mouse.releaseButton(data.button === 1 ? 0 : data.button === 2 ? 2 : 1);
    }
  }

  exitRemoteMode() {
    console.log('Exiting remote control mode.');
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
