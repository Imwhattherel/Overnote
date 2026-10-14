const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('alarmApi', {
  onDetail: callback => ipcRenderer.on('alarm-detail', (_, detail) => callback(detail)),
  getSound: () => ipcRenderer.invoke('get-alarm-audio'),
  action: (name, minutes) => ipcRenderer.invoke('alarm-action', name, minutes)
});
