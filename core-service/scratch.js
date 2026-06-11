const { exec } = require('child_process');

exec('powershell.exe -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SystemInformation]::VirtualScreen"', (err, stdout) => {
  console.log('VirtualScreen:', stdout);
});
