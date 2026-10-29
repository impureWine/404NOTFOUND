import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameLoop } from '../src/live/game-loop.js';
function harness() {
  const frames=new Map(), documentListeners=new Map(), windowListeners=new Map(); let next=0, paused=0, drawn=0;
  const documentTarget={ hidden:false,addEventListener:(name,fn)=>documentListeners.set(name,fn),removeEventListener:name=>documentListeners.delete(name) };
  const windowTarget={addEventListener:(name,fn)=>windowListeners.set(name,fn),removeEventListener:name=>windowListeners.delete(name)};
  const loop=createGameLoop({draw:()=>drawn++,onPause:()=>paused++,requestFrame:fn=>{frames.set(++next,fn);return next;},cancelFrame:id=>frames.delete(id),documentTarget,windowTarget});
  return {loop,frames,documentTarget,documentListeners,windowListeners,paused:()=>paused,drawn:()=>drawn};
}
test('switching away disposes the owned animation loop and all lifecycle listeners',()=>{
  const game=harness();game.loop.start();assert.equal(game.frames.size,1);game.loop.dispose();assert.equal(game.frames.size,0);assert.equal(game.documentListeners.size,0);assert.equal(game.windowListeners.size,0);game.loop.start();assert.equal(game.frames.size,0);
});
test('hiding the page pauses motion and never auto-resumes when visible again',()=>{
  const game=harness();game.loop.start();game.documentTarget.hidden=true;game.documentListeners.get('visibilitychange')();assert.equal(game.frames.size,0);assert.equal(game.paused(),1);game.documentTarget.hidden=false;game.documentListeners.get('visibilitychange')();assert.equal(game.frames.size,0);game.loop.start();assert.equal(game.frames.size,1);game.loop.dispose();
});
test('pagehide cancels outstanding animation callbacks before they can draw again',()=>{
  const game=harness();game.loop.start();const frame=game.frames.values().next().value;game.windowListeners.get('pagehide')();assert.equal(game.frames.size,0);frame(100);assert.equal(game.drawn(),0);assert.equal(game.frames.size,0);game.loop.dispose();
});
