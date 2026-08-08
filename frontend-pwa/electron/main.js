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

// Duplicate app.whenReady removed

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const ipcSocket = {
  emit: (channel, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }
};

let captureWindow = null;

function createCaptureWindow() {
  if (captureWindow) return;
  captureWindow = new BrowserWindow({
    fullscreen: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  captureWindow.setIgnoreMouseEvents(false);
  captureWindow.loadFile(path.join(__dirname, '../electron/capture.html'));
  
  // Forward inputs from captureWindow to InputManager
  ipcMain.on('capture-mousemove', (event, { dx, dy }) => {
    if (inputManager) inputManager.handleCaptureInput({ type: 'mousemove', dx, dy });
  });
  ipcMain.on('capture-mousedown', (event, { button }) => {
    if (inputManager) inputManager.handleCaptureInput({ type: 'mousedown', button });
  });
  ipcMain.on('capture-mouseup', (event, { button }) => {
    if (inputManager) inputManager.handleCaptureInput({ type: 'mouseup', button });
  });
  ipcMain.on('capture-keydown', (event, keyData) => {
    if (inputManager) inputManager.handleCaptureInput({ type: 'keydown', ...keyData });
  });
  ipcMain.on('capture-keyup', (event, keyData) => {
    if (inputManager) inputManager.handleCaptureInput({ type: 'keyup', ...keyData });
  });
  ipcMain.on('capture-wheel', (event, { deltaY }) => {
    if (inputManager) inputManager.handleCaptureInput({ type: 'wheel', deltaY });
  });

  ipcMain.on('start-capture-window', () => {
    if (captureWindow) {
      captureWindow.show();
      captureWindow.webContents.send('start-capture');
    }
  });

  ipcMain.on('stop-capture-window', () => {
    if (captureWindow) {
      captureWindow.webContents.send('stop-capture');
      captureWindow.hide();
    }
  });

  ipcMain.on('set-pause-state', (event, isPaused) => {
    if (inputManager) {
      inputManager.setPaused(isPaused);
    }
  });

  ipcMain.on('stop-remote-control', () => {
    if (inputManager) {
      inputManager.exitRemoteMode();
    }
  });
}

let overlayWindow = null;

function createOverlayWindow() {
  if (overlayWindow) return;
  overlayWindow = new BrowserWindow({
    fullscreen: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, '../electron/overlay.html'));

  ipcMain.on('show-cursor-highlight', (event, { x, y }) => {
    if (overlayWindow) {
      overlayWindow.webContents.send('play-highlight', { x, y });
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createCaptureWindow();
  createOverlayWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createCaptureWindow();
      createOverlayWindow();
    }
  });
});

ipcMain.on('connect-to-room', (event, { roomCode, deviceName, signalingUrl, edgeMapping, role }) => {
  console.log(`Connecting to room ${roomCode} as ${deviceName} via ${signalingUrl} with role ${role}`);
  
  if (webrtcManager) webrtcManager.cleanup();
  if (inputManager) inputManager.stop();
  if (clipboardManager) clipboardManager.stop();
  
  webrtcManager = new WebRTCManager(signalingUrl, roomCode, deviceName, ipcSocket);
  // Pass role down to inputManager so it knows if it's Master or Worker
  inputManager = new InputManager(webrtcManager, edgeMapping, ipcSocket, role);
  clipboardManager = new ClipboardManager(webrtcManager, ipcSocket);
  
  webrtcManager.start();
  inputManager.startEdgeDetection();
});

ipcMain.on('update-edge-mapping', (event, edgeMapping) => {
  if (inputManager) {
    inputManager.setEdgeMapping(edgeMapping);
  }
});

ipcMain.handle('get-local-bounds', () => {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  let l = 0, r = 0, t = 0, b = 0;
  displays.forEach(d => {
    if (d.bounds.x < l) l = d.bounds.x;
    if (d.bounds.x + d.bounds.width > r) r = d.bounds.x + d.bounds.width;
    if (d.bounds.y < t) t = d.bounds.y;
    if (d.bounds.y + d.bounds.height > b) b = d.bounds.y + d.bounds.height;
  });
  return { width: r - l, height: b - t };
});
