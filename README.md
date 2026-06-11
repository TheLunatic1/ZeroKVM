# KVM Mesh 🌐🖱️

An ultra-low latency, IP-agnostic KVM (Keyboard, Video, Mouse - *Video excluded by design*) and Clipboard sharing application. 

This software allows you to seamlessly control an unlimited number of computers across different networks (different ISPs, Wi-Fi, etc.) using a single mouse and keyboard, with zero IP configuration required.

## ✨ Key Features

- **Peer-to-Peer Mesh Network**: Connect 2, 5, or 10+ PCs together instantly. Every PC connects to every other PC in the room via a direct WebRTC tunnel.
- **Visual Monitor Mapper**: A beautiful React PWA allows you to visually map your physical desk layout. Tell the system which PC is to your Left, Right, Top, or Bottom.
- **Dual-Channel WebRTC Performance**:
  - **Channel 1 (Unreliable/Fast)**: Used strictly for mouse and keyboard coordinates to ensure zero head-of-line blocking and absolute minimum ping (perfect for fast workflows).
  - **Channel 2 (Reliable/Ordered)**: Used for secure clipboard text and heavy file transfers.
- **Global File & Clipboard Sync**: Copy text or heavy files on one computer, and the background process will chunk and broadcast the file to *all* other connected PCs. You can instantly hit "Paste" natively in your OS on any remote machine!
- **Zero Native Build Tools**: Built strictly using pre-compiled binaries (`@nut-tree-fork/nut-js`, `uiohook-napi`, `node-datachannel`). No Python or Visual Studio Build Tools required to run this project!

## 🏗️ Architecture

1. **Signaling Server** (`/signaling-server`): A lightweight Node.js/Socket.io server. It is only used for the initial 2-second handshake to exchange WebRTC SDP offers and ICE candidates via a shared "Room Code".
2. **Core Service** (`/core-service`): A Node.js background process running locally on each PC. It uses OS-level hooks to listen for your mouse hitting the edge of the screen, locks the cursor, captures inputs, and routes them over WebRTC. It also interfaces with PowerShell to intercept and spoof OS file-copy events.
3. **Frontend PWA** (`/frontend-pwa`): A modern React application served locally. It acts as a remote control dashboard to configure the background Core Service.

## 🚀 How to Run

Deploying this to a new computer is incredibly easy thanks to the automated startup script.

1. Install [Node.js (v18 or higher)](https://nodejs.org/) on all computers.
2. Clone or copy this repository folder to all computers.
3. Double-click the `start.bat` file.
   - *On first run, the script will automatically detect missing dependencies and run `npm install` for all three sub-projects!*
4. Once the services boot up, your default browser will open to `http://localhost:5173`.
5. **(Optional but Recommended)**: Click the "Install" icon in the right side of the Chrome address bar to install the UI as a standalone desktop app!

## 🎮 Usage Instructions

1. Ensure the `start.bat` terminal windows are running in the background.
2. Open the KVM Mesh UI on all computers.
3. Enter a unique **Device Name** for each computer (e.g., `Laptop`, `Main-PC`).
4. Enter the **exact same Room Code** (e.g., `studio`) on all computers and click **Join Room**.
5. Once connected, use the **Display Layout** section to map your setup. 
   - *Example: On your Main-PC, set the "Right" dropdown to "Laptop". On your Laptop, set the "Left" dropdown to "Main-PC".*
6. Drag your mouse past the edge of your screen. Your mouse will instantly appear on the remote computer! Drag it back to return.
