const { app, BrowserWindow, globalShortcut, ipcMain, session, screen } = require('electron');
const path = require('node:path');
let petWindow=null,workspaceWindow=null,pressureWindow=null,clickThrough=false,expanded=false;
const routes=new Set(['home','companion','things','calendar','deposit','notes','emotion','rehearsal','search','games','settings']);
const isPetSender=event=>Boolean(petWindow&&!petWindow.isDestroyed()&&event.sender===petWindow.webContents);
function applicationUrl(route='home') {
  if(!routes.has(route))throw new Error('不支持的桌面入口');
  const target=new URL(process.env.DESKTOP_APP_URL||'http://127.0.0.1:5174');
  if(!['http:','https:'].includes(target.protocol)||target.username||target.password||target.pathname!=='/'||target.search||target.hash)throw new Error('DESKTOP_APP_URL 必须为受信任的应用根地址');
  if(target.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(target.hostname))throw new Error('非本机地址必须使用 HTTPS');
  target.hash=route==='home'?'':route;return target;
}
function setClickThrough(enabled){clickThrough=Boolean(enabled);if(petWindow&&!petWindow.isDestroyed()){petWindow.setIgnoreMouseEvents(clickThrough,{forward:true});petWindow.webContents.send('pet:click-through-changed',clickThrough);}}
function setExpanded(enabled){
  expanded=Boolean(enabled);
  if(!petWindow||petWindow.isDestroyed())return;
  const previous=petWindow.getBounds(),area=screen.getDisplayMatching(previous).workArea;
  const width=Math.min(expanded?420:192,area.width),height=Math.min(expanded?704:184,area.height);
  const x=Math.max(area.x,Math.min(previous.x+previous.width-width,area.x+area.width-width));
  const y=Math.max(area.y,Math.min(previous.y+previous.height-height,area.y+area.height-height));
  petWindow.setBounds({x,y,width,height});petWindow.webContents.send('pet:expanded-changed',expanded);
}
function protectWindow(window,target){
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{try{if(new URL(url).origin!==target.origin)event.preventDefault();}catch{event.preventDefault();}});
}
function openWorkspace(route='home'){
  const target=applicationUrl(route);
  if(!workspaceWindow||workspaceWindow.isDestroyed()){
    workspaceWindow=new BrowserWindow({width:1180,height:850,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:404-desktop'}});
    protectWindow(workspaceWindow,target);workspaceWindow.on('closed',()=>{workspaceWindow=null;});
  }
  const current=workspaceWindow;
  current.loadURL(target.href).catch(()=>{if(!current.isDestroyed())current.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<h1>工作台尚未连接</h1><p>请先启动前后端服务，再从桌宠重新打开工作台。</p>'));});
  current.show();current.focus();
}
function openPressure(){
  if(pressureWindow&&!pressureWindow.isDestroyed()){pressureWindow.show();return;}
  const target=applicationUrl();target.search='?overlay=pressure';target.hash='pressure';
  pressureWindow=new BrowserWindow({transparent:true,frame:false,fullscreen:true,alwaysOnTop:true,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,partition:'persist:404-desktop'}});
  protectWindow(pressureWindow,target);
  pressureWindow.webContents.on('before-input-event',(_event,input)=>{if(input.key==='Escape'&&pressureWindow&&!pressureWindow.isDestroyed())pressureWindow.close();});
  pressureWindow.on('closed',()=>{pressureWindow=null;});
  pressureWindow.loadURL(target.href).catch(()=>{if(pressureWindow&&!pressureWindow.isDestroyed())pressureWindow.close();});
}
function createPetWindow(){
  const area=screen.getPrimaryDisplay().workArea;
  petWindow=new BrowserWindow({x:area.x+area.width-208,y:area.y+area.height-200,width:192,height:184,frame:false,transparent:true,resizable:false,alwaysOnTop:true,skipTaskbar:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,preload:path.join(__dirname,'preload.cjs')}});
  petWindow.setAlwaysOnTop(true,'floating');petWindow.loadFile(path.join(__dirname,'renderer.html'));
  petWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));petWindow.webContents.on('will-navigate',event=>event.preventDefault());
  petWindow.once('ready-to-show',()=>petWindow?.show());
  petWindow.webContents.on('render-process-gone',()=>{if(petWindow&&!petWindow.isDestroyed())petWindow.destroy();petWindow=null;clickThrough=false;expanded=false;});
  petWindow.on('closed',()=>{petWindow=null;clickThrough=false;expanded=false;});
}
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  session.fromPartition('persist:404-desktop').setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
  ipcMain.on('pet:ready',event=>{if(isPetSender(event)){event.sender.send('pet:expanded-changed',expanded);event.sender.send('pet:click-through-changed',clickThrough);}});
  ipcMain.on('pet:set-expanded',(event,value)=>{if(isPetSender(event)&&typeof value==='boolean')setExpanded(value);});
  ipcMain.on('pet:open-workspace',(event,route='home')=>{if(isPetSender(event)&&routes.has(route))openWorkspace(route);});
  ipcMain.on('pet:open-pressure',event=>{if(isPetSender(event))openPressure();});
  ipcMain.on('pet:set-click-through',(event,value)=>{if(isPetSender(event)&&typeof value==='boolean')setClickThrough(value);});
  ipcMain.on('pet:hide',event=>{if(isPetSender(event)){setExpanded(false);petWindow.hide();}});
  ipcMain.on('pet:close',event=>{if(isPetSender(event))app.quit();});
  globalShortcut.register('Alt+Shift+P',()=>{if(petWindow&&!petWindow.isDestroyed()){setClickThrough(false);petWindow.show();petWindow.focus();}});
  createPetWindow();
});
app.on('before-quit',()=>{globalShortcut.unregister('Alt+Shift+P');if(petWindow&&!petWindow.isDestroyed()){setClickThrough(false);petWindow.destroy();}petWindow=null;});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
