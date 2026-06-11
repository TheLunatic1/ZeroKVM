const nodeDataChannel = require('node-datachannel');

const pc1 = new nodeDataChannel.PeerConnection('pc1', { iceServers: ['stun:stun.l.google.com:19302'] });
const pc2 = new nodeDataChannel.PeerConnection('pc2', { iceServers: ['stun:stun.l.google.com:19302'] });

pc1.onLocalDescription((sdp, type) => {
  console.log('pc1 local description:', type);
  pc2.setRemoteDescription(sdp, type);
});

pc1.onLocalCandidate((candidate, mid) => {
  console.log('pc1 candidate');
  pc2.addRemoteCandidate(candidate, mid);
});

pc2.onLocalDescription((sdp, type) => {
  console.log('pc2 local description:', type);
  pc1.setRemoteDescription(sdp, type);
});

pc2.onLocalCandidate((candidate, mid) => {
  console.log('pc2 candidate');
  pc1.addRemoteCandidate(candidate, mid);
});

pc1.onStateChange(state => console.log('pc1 state:', state));
pc2.onStateChange(state => console.log('pc2 state:', state));

pc2.onDataChannel(dc => {
  console.log('pc2 got datachannel', dc.getLabel());
});

const dc = pc1.createDataChannel('test');
console.log('pc1 created datachannel');
