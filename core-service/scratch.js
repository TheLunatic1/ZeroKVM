const { uIOhook, UiohookKey } = require('uiohook-napi');
uIOhook.on('mousemove', (e) => {
  console.log('Mouse moved to', e.x, e.y);
  if (e.x > 500) {
    uIOhook.stop();
  }
});
uIOhook.start();
