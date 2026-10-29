const { contextBridge, ipcRenderer } = require('electron');
const routes=new Set(['home','companion','things','calendar','deposit','notes','emotion','rehearsal','search','games','settings']);
function subscribe(channel,callback){if(typeof callback!=='function')return()=>{};const listener=(_event,value)=>callback(Boolean(value));ipcRenderer.on(channel,listener);return()=>ipcRenderer.removeListener(channel,listener);}
contextBridge.exposeInMainWorld('desktopPet', Object.freeze({
  setClickThrough(enabled){ipcRenderer.send('pet:set-click-through',Boolean(enabled));},
  setExpanded(enabled){ipcRenderer.send('pet:set-expanded',Boolean(enabled));},
  ready(){ipcRenderer.send('pet:ready');},
  openPressure(){ipcRenderer.send('pet:open-pressure');},
  openWorkspace(route='home'){if(routes.has(route))ipcRenderer.send('pet:open-workspace',route);},
  hide(){ipcRenderer.send('pet:hide');},close(){ipcRenderer.send('pet:close');},
  onClickThroughChanged(callback){return subscribe('pet:click-through-changed',callback);},
  onExpandedChanged(callback){return subscribe('pet:expanded-changed',callback);},
}));
