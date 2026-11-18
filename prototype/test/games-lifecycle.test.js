import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameLoop } from '../src/live/game-loop.js';
import { clearPrivateTextRuntime } from '../src/req14/private-text-runtime.js';
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
test('private text pagehide reset clears its canvas pixels and cancels pending animation',()=>{
  const calls=[], textRef={current:'synthetic private text'}, particlesRef={current:[{letter:'s'}]}, frameRef={current:7};
  const canvas={width:800,height:420,getContext:()=>({clearRect:(...args)=>calls.push(args)})};
  const result=clearPrivateTextRuntime({textRef,particlesRef,frameRef,canvas,cancelFrame:id=>calls.push(['cancel',id])});
  assert.equal(result,true);assert.equal(textRef.current,'');assert.deepEqual(particlesRef.current,[]);assert.equal(frameRef.current,0);
  assert.deepEqual(calls,[['cancel',7],[0,0,800,420]]);
});
test('private text cleanup tolerates an unavailable canvas and still drops references',()=>{
  const textRef={current:'synthetic private text'}, particlesRef={current:[{letter:'s'}]}, frameRef={current:0};
  const result=clearPrivateTextRuntime({textRef,particlesRef,frameRef,canvas:{width:0,height:0,getContext:()=>null},cancelFrame:()=>{}});
  assert.equal(result,false);assert.equal(textRef.current,'');assert.deepEqual(particlesRef.current,[]);
});
test('private text cleanup falls back to resetting canvas pixels when drawing APIs throw',()=>{
  let width=800;const textRef={current:'synthetic private text'},particlesRef={current:[{letter:'s'}]},frameRef={current:0};
  const canvas={get width(){return width;},set width(value){width=value;},getContext:()=>({clearRect:()=>{throw new Error('synthetic canvas failure');}})};
  const result=clearPrivateTextRuntime({textRef,particlesRef,frameRef,canvas,cancelFrame:()=>{}});
  assert.equal(result,false);assert.equal(width,800);assert.equal(textRef.current,'');assert.deepEqual(particlesRef.current,[]);
});
test('private text cleanup reports cancellation failure but still clears the canvas and references',()=>{
  const calls=[],textRef={current:'synthetic private text'},particlesRef={current:[{letter:'s'}]},frameRef={current:9};
  const canvas={width:800,height:420,getContext:()=>({clearRect:(...args)=>calls.push(args)})};
  const result=clearPrivateTextRuntime({textRef,particlesRef,frameRef,canvas,cancelFrame:()=>{throw new Error('synthetic cancellation failure');}});
  assert.equal(result,false);assert.equal(frameRef.current,0);assert.equal(textRef.current,'');assert.deepEqual(particlesRef.current,[]);
  assert.deepEqual(calls,[[0,0,800,420]]);
});
