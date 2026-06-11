const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const execPromise = util.promisify(exec);

class ClipboardManager {
  constructor(webrtcManager, localSocket) {
    this.webrtcManager = webrtcManager;
    this.localSocket = localSocket;
    
    this.lastClipboardText = '';
    this.lastClipboardFile = '';
    
    this.pollInterval = null;
    this.receivingFiles = {};
    
    this.startPolling();
    
    this.webrtcManager.on('message', (sourceId, channel, message) => {
      if (channel === 'file-channel') {
        this.handleIncomingMessage(message, sourceId);
      }
    });
  }

  startPolling() {
    this.pollInterval = setInterval(async () => {
      try {
        const { stdout: textStdout } = await execPromise('powershell.exe -command "Get-Clipboard"');
        const text = textStdout.trim();
        if (text && text !== this.lastClipboardText) {
          this.lastClipboardText = text;
          this.sendText(text);
        }
      } catch (err) {}

      try {
        const { stdout: fileStdout } = await execPromise('powershell.exe -command "(Get-Clipboard -Format FileDropList).FullName"');
        const filePaths = fileStdout.trim().split('\r\n').filter(Boolean);
        
        if (filePaths.length > 0) {
          const firstFile = filePaths[0]; 
          if (firstFile !== this.lastClipboardFile && fs.existsSync(firstFile)) {
            this.lastClipboardFile = firstFile;
            this.sendFile(firstFile);
          }
        }
      } catch (err) {}
    }, 2000); 
  }

  sendText(text) {
    console.log('Broadcasting clipboard text to all peers...');
    const msg = JSON.stringify({ type: 'clipboard-text', text });
    this.webrtcManager.broadcastFileMessage(msg);
  }

  async sendFile(filePath) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) return; 

      const filename = path.basename(filePath);
      const totalSize = stats.size;
      
      console.log(`Broadcasting file: ${filename} (${totalSize} bytes)`);
      this.localSocket.emit('transfer-status', { type: 'sending', filename, progress: 0 });

      const metaMsg = JSON.stringify({ type: 'file-meta', filename, totalSize });
      this.webrtcManager.broadcastFileMessage(metaMsg);

      const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }); 
      let bytesSent = 0;

      readStream.on('data', (chunk) => {
        const base64Chunk = chunk.toString('base64');
        const chunkMsg = JSON.stringify({ type: 'file-chunk', filename, data: base64Chunk });
        this.webrtcManager.broadcastFileMessage(chunkMsg);
        
        bytesSent += chunk.length;
        const progress = Math.round((bytesSent / totalSize) * 100);
        this.localSocket.emit('transfer-status', { type: 'sending', filename, progress });
      });

      readStream.on('end', () => {
        const endMsg = JSON.stringify({ type: 'file-end', filename });
        this.webrtcManager.broadcastFileMessage(endMsg);
        console.log(`Finished broadcasting ${filename}`);
      });

    } catch (err) {
      console.error("Error sending file:", err);
    }
  }

  async handleIncomingMessage(message, sourceId) {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'clipboard-text') {
        this.lastClipboardText = data.text;
        await execPromise(`powershell.exe -command "Set-Clipboard -Value '${data.text.replace(/'/g, "''")}'"`);
        console.log('Received and set clipboard text');
      }
      else if (data.type === 'file-meta') {
        const destPath = path.join(os.tmpdir(), data.filename);
        this.receivingFiles[data.filename] = {
          stream: fs.createWriteStream(destPath),
          destPath,
          totalSize: data.totalSize,
          bytesReceived: 0
        };
        console.log(`Receiving file metadata: ${data.filename} from ${sourceId}`);
      }
      else if (data.type === 'file-chunk') {
        const fileInfo = this.receivingFiles[data.filename];
        if (fileInfo) {
          const buffer = Buffer.from(data.data, 'base64');
          fileInfo.stream.write(buffer);
          fileInfo.bytesReceived += buffer.length;
          
          const progress = Math.round((fileInfo.bytesReceived / fileInfo.totalSize) * 100);
          this.localSocket.emit('transfer-status', { type: 'receiving', filename: data.filename, progress });
        }
      }
      else if (data.type === 'file-end') {
        const fileInfo = this.receivingFiles[data.filename];
        if (fileInfo) {
          fileInfo.stream.end();
          console.log(`Finished receiving file: ${data.filename}`);
          
          this.lastClipboardFile = fileInfo.destPath;
          await execPromise(`powershell.exe -command "Set-Clipboard -Path '${fileInfo.destPath}'"`);
          console.log(`File path injected to OS clipboard: ${fileInfo.destPath}`);
          
          delete this.receivingFiles[data.filename];
        }
      }
    } catch (err) {
      console.error("Error handling file message", err);
    }
  }

  stop() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }
}

module.exports = ClipboardManager;
