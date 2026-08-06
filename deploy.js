const { NodeSSH } = require('node-ssh');
const fs = require('fs');
require('dotenv').config();

const ssh = new NodeSSH();

async function deploy() {
  try {
    console.log('Connecting to VPS...');
    await ssh.connect({
      host: process.env.VPS_IP,
      username: 'root',
      password: process.env.VPS_PASSWORD
    });
    console.log('Connected!');

    console.log('Creating directories and files on VPS...');
    await ssh.execCommand('mkdir -p /root/zerokvm/signal-server');
    
    console.log('Uploading docker-compose.yml...');
    await ssh.putFile('./docker-compose.yml', '/root/zerokvm/docker-compose.yml');
    
    console.log('Uploading signal server...');
    await ssh.putFile('./signaling-server/server.js', '/root/zerokvm/signal-server/server.js');
    
    console.log('Starting Docker Compose...');
    const result = await ssh.execCommand('docker compose up -d', { cwd: '/root/zerokvm' });
    console.log('STDOUT:', result.stdout);
    console.log('STDERR:', result.stderr);
    
    console.log('Deployment complete!');
    process.exit(0);
  } catch (err) {
    console.error('Deployment failed:', err);
    process.exit(1);
  }
}

deploy();
