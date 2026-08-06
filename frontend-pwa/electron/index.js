const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Import Managers
const WebRTCManager = require('./webrtcManager');
const InputManager = require('./inputManager');
const ClipboardManager = require('./clipboardManager');

const app = express();
app.use(cors());

const server = http.createServer(app);
const localIo = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let webrtcManager = null;
let inputManager = null;
let clipboardManager = null;

localIo.on('connection', (socket) => {
  console.log('Local UI connected to Core Service');

  // Request to connect to a room
  socket.on('connect-to-room', async ({ roomCode, deviceName, signalingUrl, edgeMapping }) => {
    console.log(`Connecting to room ${roomCode} as ${deviceName} via ${signalingUrl}`);
    
    if (webrtcManager) {
      webrtcManager.cleanup();
    }
    if (inputManager) {
      inputManager.stop();
    }
    if (clipboardManager) {
      clipboardManager.stop();
    }
    
    webrtcManager = new WebRTCManager(signalingUrl, roomCode, deviceName, socket);
    inputManager = new InputManager(webrtcManager, edgeMapping, socket);
    clipboardManager = new ClipboardManager(webrtcManager, socket);
    
    webrtcManager.start();
    inputManager.startEdgeDetection();
  });

  socket.on('update-edge-mapping', (edgeMapping) => {
    if (inputManager) {
      inputManager.setEdgeMapping(edgeMapping);
      console.log(`Edge mapping updated`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Local UI disconnected');
  });
});

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`Core Service running on localhost:${PORT}. Open the React PWA to configure.`);
});
