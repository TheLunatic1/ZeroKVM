const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const WebRTCManager = require('./webrtcManager');
const InputManager = require('./inputManager');
const ClipboardManager = require('./clipboardManager');

let mainWindow;

let webrtcManager = null;
let inputManager = null;
let clipboardManager = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    }
  });
  
  mainWindow.setMenu(null);

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer] ${message}`);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC wrapper acting like local socket for the managers
const ipcSocket = {
  emit: (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }
};

ipcMain.on('connect-to-room', (event, { roomCode, deviceName, signalingUrl, edgeMapping }) => {
  console.log(`Connecting to room ${roomCode} as ${deviceName} via ${signalingUrl}`);
  
  if (webrtcManager) webrtcManager.cleanup();
  if (inputManager) inputManager.stop();
  if (clipboardManager) clipboardManager.stop();
  
  webrtcManager = new WebRTCManager(signalingUrl, roomCode, deviceName, ipcSocket);
  inputManager = new InputManager(webrtcManager, edgeMapping, ipcSocket);
  clipboardManager = new ClipboardManager(webrtcManager, ipcSocket);
  
  webrtcManager.start();
  inputManager.startEdgeDetection();
});

ipcMain.on('update-edge-mapping', (event, edgeMapping) => {
  if (inputManager) {
    inputManager.setEdgeMapping(edgeMapping);
  }
});
