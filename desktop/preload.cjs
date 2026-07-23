// Toshi preload — the panel's only bridge to the window (contextIsolation stays ON). GPL-3.0.
// Exposes 4 verbs: collapse (mini head, still floating), expand, hide (window gone, brain alive),
// show (bring it back + focus). The panel drives them from the ─ button and from `toshi show/hide`.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('toshiDesktop', {
  collapse: () => ipcRenderer.send('toshi:win', 'collapse'),
  expand: () => ipcRenderer.send('toshi:win', 'expand'),
  hide: () => ipcRenderer.send('toshi:win', 'hide'),
  show: () => ipcRenderer.send('toshi:win', 'show'),
  resize: (w, h) => ipcRenderer.send('toshi:resize', w, h),
  // mini speech-bubble: grow the window so the bubble sits BESIDE the pod, then shrink back.
  miniSpeak: () => ipcRenderer.send('toshi:mini-speak'),
  miniQuiet: () => ipcRenderer.send('toshi:mini-quiet'),
  onMiniLayout: (cb) => ipcRenderer.on('toshi:mini-layout', (_e, data) => cb(data)),
});
