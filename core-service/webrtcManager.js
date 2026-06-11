const io = require('socket.io-client');
const nodeDataChannel = require('node-datachannel');
const EventEmitter = require('events');

class WebRTCManager extends EventEmitter {
  constructor(signalingUrl, roomCode, deviceName, localSocket) {
    super();
    this.signalingUrl = signalingUrl;
    this.roomCode = roomCode;
    this.deviceName = deviceName;
    this.localSocket = localSocket;
    
    this.socket = null;
    
    // Map of targetSocketId -> { pc, inputChannel, fileChannel, deviceName, isConnected }
    this.peers = {};
  }

  start() {
    this.socket = io(this.signalingUrl);

    this.socket.on('connect', () => {
      console.log('Connected to Signaling Server');
      this.socket.emit('join-room', this.roomCode, this.deviceName);
    });

    this.socket.on('room-peers', (existingPeers) => {
      // Initiate connection to all existing peers
      for (const peer of existingPeers) {
        this.createPeerConnection(peer.id, peer.deviceName, true);
      }
      this.updatePeersList();
    });

    this.socket.on('user-joined', (peer) => {
      console.log(`New user joined: ${peer.deviceName}`);
      // The new user will initiate the offer to us, so we act as the receiver (isInitiator = false).
      this.createPeerConnection(peer.id, peer.deviceName, false);
      this.updatePeersList();
    });

    this.socket.on('user-left', (id) => {
      this.removePeer(id);
    });

    this.socket.on('offer', (id, offer) => {
      if (!this.peers[id]) {
        this.createPeerConnection(id, 'Unknown', false);
      }
      this.peers[id].pc.setRemoteDescription(offer, 'offer');
    });

    this.socket.on('answer', (id, answer) => {
      if (this.peers[id]) {
        this.peers[id].pc.setRemoteDescription(answer, 'answer');
      }
    });

    this.socket.on('ice-candidate', (id, candidate) => {
      if (this.peers[id]) {
        this.peers[id].pc.addRemoteCandidate(candidate.candidate, candidate.mid);
      }
    });
  }

  createPeerConnection(targetId, deviceName, isInitiator) {
    console.log(`Creating peer connection with ${deviceName} (Initiator: ${isInitiator})`);
    const pc = new nodeDataChannel.PeerConnection(`pc-${targetId}`, {
      iceServers: ['stun:stun.l.google.com:19302']
    });

    this.peers[targetId] = {
      pc,
      deviceName,
      inputChannel: null,
      fileChannel: null,
      isConnected: false
    };

    pc.onLocalDescription((sdp, type) => {
      this.socket.emit(type, targetId, sdp);
    });

    pc.onLocalCandidate((candidate, mid) => {
      this.socket.emit('ice-candidate', targetId, { candidate, mid });
    });

    pc.onStateChange((state) => {
      console.log(`Peer ${deviceName} state:`, state);
      if (state === 'connected') {
        this.peers[targetId].isConnected = true;
        this.updatePeersList();
      } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.removePeer(targetId);
      }
    });

    pc.onDataChannel((dc) => {
      this.setupDataChannel(targetId, dc);
    });

    if (isInitiator) {
      const inputDc = pc.createDataChannel('input-channel', {
        reliability: { unordered: true, maxRetransmits: 0 }
      });
      this.setupDataChannel(targetId, inputDc);

      const fileDc = pc.createDataChannel('file-channel', {
        reliability: { unordered: false }
      });
      this.setupDataChannel(targetId, fileDc);
    }
  }

  setupDataChannel(targetId, dc) {
    const label = dc.getLabel();
    const peer = this.peers[targetId];
    if (!peer) return;

    if (label === 'input-channel') {
      peer.inputChannel = dc;
    } else if (label === 'file-channel') {
      peer.fileChannel = dc;
    }

    dc.onOpen(() => {
      console.log(`DataChannel ${label} opened with ${peer.deviceName}`);
    });

    dc.onMessage((msg) => {
      this.emit('message', targetId, label, msg);
    });
  }

  removePeer(targetId) {
    const peer = this.peers[targetId];
    if (peer) {
      if (peer.inputChannel) peer.inputChannel.close();
      if (peer.fileChannel) peer.fileChannel.close();
      if (peer.pc) peer.pc.close();
      delete this.peers[targetId];
      this.updatePeersList();
    }
  }

  updatePeersList() {
    const peersList = Object.keys(this.peers).map(id => ({
      id,
      deviceName: this.peers[id].deviceName,
      isConnected: this.peers[id].isConnected
    }));
    this.localSocket.emit('peers-updated', peersList);
  }

  broadcastFileMessage(msg) {
    for (const id in this.peers) {
      const peer = this.peers[id];
      if (peer.isConnected && peer.fileChannel && peer.fileChannel.isOpen()) {
        peer.fileChannel.sendMessage(msg);
      }
    }
  }

  sendInputMessage(targetId, msg) {
    const peer = this.peers[targetId];
    if (peer && peer.isConnected && peer.inputChannel && peer.inputChannel.isOpen()) {
      peer.inputChannel.sendMessage(msg);
    }
  }

  cleanup() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    for (const id in this.peers) {
      this.removePeer(id);
    }
  }
}

module.exports = WebRTCManager;
