import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const timerSource=await readFile(new URL('../electron/pet-session.js',import.meta.url),'utf8');
function timerHarness(){let time=0,id=0;const jobs=new Map(),events=[],context={};vm.runInNewContext(timerSource,context);const timer=new context.PetSession.BreathingSession({now:()=>time,schedule:fn=>{jobs.set(++id,fn);return id;},cancel:id=>jobs.delete(id),onChange:value=>events.push(value)});return {timer,jobs,events,advance:ms=>{time+=ms;},tick:()=>{for(const fn of [...jobs.values()])fn();}};}

test('desktop breathing never advances before start and follows 4/6-second phases',()=>{const h=timerHarness();h.advance(600000);assert.equal(h.timer.snapshot().elapsedMs,0);assert.equal(h.jobs.size,0);h.timer.start();h.advance(4000);h.tick();assert.equal(h.timer.snapshot().phase,'exhale');assert.equal(h.timer.snapshot().phaseSeconds,6);h.advance(6000);h.tick();assert.equal(h.timer.snapshot().phase,'inhale');});
test('desktop breathing pauses without counting hidden time and resumes at the same phase',()=>{const h=timerHarness();h.timer.start();h.advance(2500);h.timer.pause();h.advance(600000);assert.equal(h.timer.snapshot().elapsedMs,2500);assert.equal(h.jobs.size,0);h.timer.resume();h.advance(1500);assert.equal(h.timer.snapshot().elapsedMs,4000);assert.equal(h.timer.snapshot().phase,'exhale');});
test('collapse/reset and dispose prevent old timer callbacks from publishing into the next exercise',()=>{const h=timerHarness();h.timer.start();const stale=[...h.jobs.values()][0];h.timer.reset();h.timer.start();let count=h.events.length;stale();assert.equal(h.events.length,count);h.timer.dispose();count=h.events.length;stale();h.tick();assert.equal(h.events.length,count);assert.equal(h.jobs.size,0);});
test('desktop breathing completes once and cancels its timer even after a delayed tick',()=>{const h=timerHarness();h.timer.start();h.advance(65000);h.tick();assert.equal(h.timer.snapshot().state,'completed');assert.equal(h.timer.snapshot().elapsedMs,60000);assert.equal(h.jobs.size,0);const count=h.events.length;h.tick();assert.equal(h.events.length,count);});

const mainSource=await readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
function desktopHarness(env={},confirmCertificate=()=>0){const windows=[],ipc=new Map(),shortcuts=new Map(),appEvents=new Map();let ready,quits=0;
 class Window{constructor(options){this.options=options;this.bounds={x:options.x,y:options.y,width:options.width,height:options.height};this.sent=[];this.events=new Map();this.webContents={send:(...args)=>this.sent.push(args),setWindowOpenHandler:()=>{},on:()=>{}};windows.push(this);}isDestroyed(){return false;}getBounds(){return {...this.bounds};}setBounds(value){this.bounds={...value};}setAlwaysOnTop(){}setIgnoreMouseEvents(value){this.ignored=value;}loadFile(value){this.file=value;}loadURL(value){this.url=value;return Promise.resolve();}on(name,fn){this.events.set(name,fn);}once(name,fn){this.events.set(name,fn);}show(){this.shown=true;}hide(){this.shown=false;}focus(){this.focused=true;}destroy(){this.destroyed=true;}close(){this.closed=true;}}
 const area={x:0,y:0,width:1280,height:720};
 const electron={app:{whenReady:()=>({then:fn=>{ready=fn;}}),on:()=>{},quit:()=>quits++},BrowserWindow:Window,ipcMain:{on:(name,fn)=>ipc.set(name,fn)},globalShortcut:{register:(name,fn)=>shortcuts.set(name,fn),unregister:()=>{}},session:{defaultSession:{setPermissionRequestHandler:()=>{}},fromPartition:()=>({setPermissionRequestHandler:()=>{}})},screen:{getPrimaryDisplay:()=>({workArea:area}),getDisplayMatching:()=>({workArea:area})}};
 electron.app.on=(name,fn)=>appEvents.set(name,fn);
 electron.dialog={showMessageBoxSync:confirmCertificate};
 vm.runInNewContext(mainSource,{require:name=>name==='electron'?electron:path,__dirname:'C:/synthetic/electron',process:{env,platform:'win32'},URL});ready();return{windows,ipc,shortcuts,appEvents,quits:()=>quits};}

test('desktop starts as one compact pet without opening a workspace window',()=>{const h=desktopHarness();assert.equal(h.windows.length,1);assert.equal(h.windows[0].bounds.width,192);assert.equal(h.windows[0].options.webPreferences.sandbox,true);assert.equal(h.windows[0].options.webPreferences.nodeIntegration,false);});
test('expansion preserves the bottom-right anchor and clamps to the display work area',()=>{const h=desktopHarness(),pet=h.windows[0],before=pet.getBounds();h.ipc.get('pet:set-expanded')({sender:pet.webContents},true);assert.equal(pet.bounds.width,420);assert.equal(pet.bounds.x+pet.bounds.width,before.x+before.width);assert.equal(pet.bounds.y+pet.bounds.height,before.y+before.height);assert.ok(pet.bounds.y>=0);h.ipc.get('pet:set-expanded')({sender:pet.webContents},false);assert.equal(pet.bounds.width,192);assert.equal(pet.bounds.x,before.x);});
test('only the actual pet may open allowlisted routes in the hosted Electron workspace',async()=>{
 const h=desktopHarness(),pet=h.windows[0],open=h.ipc.get('pet:open-workspace');
 open({sender:{}},'calendar');
 open({sender:pet.webContents},'https://elsewhere.example');
 assert.equal(h.windows.length,1);
 const markup=await readFile(new URL('../electron/renderer.html',import.meta.url),'utf8');
 for(const [,route] of markup.matchAll(/data-route="([^"]+)"/g)){
  open({sender:pet.webContents},route);
  assert.equal(h.windows[1].url,`https://8.139.6.60/#${route}`);
 }
 assert.equal(h.windows.length,2);
 h.ipc.get('pet:open-pressure')({sender:pet.webContents});
 assert.equal(h.windows[2].url,'https://8.139.6.60/?overlay=pressure#pressure');
});
test('the explicit local development workspace override still works',()=>{
 const h=desktopHarness({DESKTOP_APP_URL:'http://127.0.0.1:5173'});
 h.ipc.get('pet:open-workspace')({sender:h.windows[0].webContents},'notes');
 assert.equal(h.windows[1].url,'http://127.0.0.1:5173/#notes');
});
test('certificate approval is scoped to the hosted site, workspace and confirmed fingerprint',()=>{
 let prompts=0,choice=0;
 const h=desktopHarness({},()=>{prompts++;return choice;});
 h.ipc.get('pet:open-workspace')({sender:h.windows[0].webContents},'calendar');
 const workspace=h.windows[1].webContents;
 const current=Date.now()/1000;
 const certificate={subjectName:'8.139.6.60',fingerprint:'first',validStart:current-10,validExpiry:current+10};
 function check({url='https://8.139.6.60/#calendar',error='net::ERR_CERT_AUTHORITY_INVALID',data=certificate,contents=workspace}={}){
  let allowed;
  h.appEvents.get('certificate-error')({preventDefault(){}},contents,url,error,data,value=>{allowed=value;});
  return allowed;
 }
 assert.equal(check(),false);
 choice=1;
 assert.equal(check(),true);
 assert.equal(check(),true);
 assert.equal(check({error:'net::ERR_CERT_DATE_INVALID'}),false);
 assert.equal(check({url:'https://elsewhere.example/'}),false);
 assert.equal(check({contents:h.windows[0].webContents}),false);
 choice=0;
 assert.equal(check({data:{...certificate,fingerprint:'changed'}}),false);
 assert.equal(prompts,3);
});
test('recovery shortcut restores a hidden pet and disables click-through',()=>{const h=desktopHarness(),pet=h.windows[0];h.ipc.get('pet:set-click-through')({sender:pet.webContents},true);h.ipc.get('pet:hide')({sender:pet.webContents});assert.equal(pet.shown,false);h.shortcuts.get('Alt+Shift+P')();assert.equal(pet.shown,true);assert.equal(pet.ignored,false);});

test('preload exposes only fixed routes and event subscriptions can be removed',async()=>{const source=await readFile(new URL('../electron/preload.cjs',import.meta.url),'utf8'),sent=[],listeners=new Map();let bridge;vm.runInNewContext(source,{require:()=>({contextBridge:{exposeInMainWorld:(_name,value)=>{bridge=value;}},ipcRenderer:{send:(...args)=>sent.push(args),on:(name,fn)=>listeners.set(name,fn),removeListener:name=>listeners.delete(name)}})});bridge.openWorkspace('file:///private');assert.equal(sent.length,0);bridge.openWorkspace('calendar');assert.equal(sent[0][0],'pet:open-workspace');assert.equal(sent[0][1],'calendar');const unsubscribe=bridge.onExpandedChanged(()=>{});assert.equal(listeners.size,1);unsubscribe();assert.equal(listeners.size,0);assert.equal(bridge.send,undefined);});
