import assert from 'node:assert/strict';
import test from 'node:test';
import { TrainingController, breathingPhase, bindTrainingLifecycle } from '../src/live/training-controller.js';

function harness(id = 'BREATHING') {
  let clock = 0, sequence = 0;
  const timers = new Map(), events = [];
  const controller = new TrainingController(id, {
    now: () => clock,
    schedule: fn => { timers.set(++sequence, fn); return sequence; },
    cancel: id => timers.delete(id),
  });
  controller.subscribe(value => events.push(value));
  return { controller, timers, events, advance: ms => { clock += ms; }, tick: () => { for (const fn of [...timers.values()]) fn(); } };
}

test('ready training never starts a timer or advances before explicit start', () => {
  const h = harness(); h.advance(600000); h.tick();
  assert.deepEqual([h.controller.snapshot().state, h.controller.snapshot().elapsedMs, h.timers.size, h.events.length], ['ready', 0, 0, 1]);
  h.controller.next(); assert.equal(h.controller.snapshot().stepIndex, 0);
});

test('breathing follows phase boundaries, skips zero hold and supports an optional hold', () => {
  const rhythm = { inhale: 4, hold: 0, exhale: 6 };
  assert.equal(breathingPhase(3999, rhythm).id, 'inhale');
  assert.equal(breathingPhase(4000, rhythm).id, 'exhale');
  assert.equal(breathingPhase(10000, rhythm).cycles, 1);
  assert.equal(breathingPhase(10000, rhythm).id, 'inhale');
  assert.equal(breathingPhase(4000, { ...rhythm, hold: 2 }).id, 'hold');
  assert.equal(breathingPhase(6000, { ...rhythm, hold: 2 }).id, 'exhale');
});

test('pause freezes phase, progress and elapsed time; resume only adds active time', () => {
  const h = harness(); h.controller.start(); h.advance(2500); h.controller.pause();
  const paused = h.controller.snapshot(); h.advance(120000); h.tick();
  assert.deepEqual(h.controller.snapshot(), paused); assert.equal(h.timers.size, 0);
  h.controller.resume(); h.advance(1500); h.tick();
  assert.equal(h.controller.snapshot().elapsedMs, 4000); assert.equal(h.controller.snapshot().phase.id, 'exhale');
});

test('completion clamps the clock and cancels timers, including delayed background callbacks', () => {
  const h = harness(); h.controller.start({ durationSeconds: 60 }); h.advance(65000); h.tick();
  assert.equal(h.controller.snapshot().state, 'completed'); assert.equal(h.controller.snapshot().elapsedMs, 60000); assert.equal(h.timers.size, 0);
  const count = h.events.length; h.advance(20000); h.tick(); assert.equal(h.events.length, count);
  const delayed = harness(); delayed.controller.start(); delayed.advance(61000); delayed.controller.pause();
  assert.equal(delayed.controller.snapshot().state, 'completed'); assert.equal(delayed.controller.snapshot().elapsedMs, 60000);
});

test('stale callbacks cannot publish events after pause, reset/restart, exit or dispose', () => {
  const h = harness(); h.controller.start(); const stale = [...h.timers.values()][0];
  h.controller.pause(); let count = h.events.length; stale(); assert.equal(h.events.length, count);
  h.controller.reset(); h.controller.start(); count = h.events.length; stale(); assert.equal(h.events.length, count);
  h.controller.stop(); count = h.events.length; h.advance(5000); stale(); h.tick();
  assert.equal(h.events.length, count); assert.equal(h.timers.size, 0);
  h.controller.reset(); assert.equal(h.controller.snapshot().elapsedMs, 0); assert.equal(h.controller.snapshot().state, 'ready');
  h.controller.start(); const finalTick = [...h.timers.values()][0]; h.controller.dispose(); count = h.events.length; finalTick();
  assert.equal(h.events.length, count); assert.equal(h.timers.size, 0);
});

test('guided steps only move on explicit actions, preserve pause and allow revisiting before completion', () => {
  const h = harness('FIVE_SENSES'); h.controller.start(); h.advance(60000); h.tick();
  assert.equal(h.controller.snapshot().stepIndex, 0);
  h.controller.next(); h.controller.pause(); h.controller.next(); h.controller.previous();
  assert.equal(h.controller.snapshot().stepIndex, 1);
  h.controller.resume(); h.controller.previous(); assert.equal(h.controller.snapshot().stepIndex, 0);
  for (let i = 0; i < 5; i++) h.controller.next();
  assert.equal(h.controller.snapshot().state, 'completed'); assert.equal(h.timers.size, 0);
  h.controller.edit(); assert.equal(h.controller.snapshot().state, 'paused'); assert.equal(h.controller.snapshot().stepIndex, 0);
});

test('pause-organize and worksheet complete only explicitly, not when timers elapse', () => {
  for (const id of ['PAUSE_ORGANIZE', 'TASK_SPLIT']) {
    const h = harness(id); h.controller.start(); h.advance(600000); h.tick(); assert.equal(h.controller.snapshot().state, 'running');
    if (id === 'TASK_SPLIT') { h.controller.next(); assert.equal(h.controller.snapshot().stepIndex, 0); h.controller.complete(); }
    else { h.controller.next(); h.controller.next(); h.controller.next(); }
    assert.equal(h.controller.snapshot().state, 'completed'); assert.equal(h.timers.size, 0);
  }
});

test('invalid content and breathing settings fail before allocating a timer', () => {
  assert.throws(() => new TrainingController('UNKNOWN'), /不可用/);
  for (const options of [{ durationSeconds: 0 }, { durationSeconds: 60, rhythm: { inhale: 0, hold: 0, exhale: 6 } }, { rhythm: { inhale: 4, hold: -1, exhale: 6 } }]) {
    const h = harness(); assert.throws(() => h.controller.start(options)); assert.equal(h.timers.size, 0); assert.equal(h.controller.snapshot().state, 'ready');
  }
});

test('page hide pauses without auto-resume; page exit and unmount cancel all owned work', () => {
  const h = harness('PAUSE_ORGANIZE'), documentListeners = new Map(), windowListeners = new Map(); let paused = 0, cleared = 0;
  const documentTarget = { hidden: false, addEventListener: (name, fn) => documentListeners.set(name, fn), removeEventListener: name => documentListeners.delete(name) };
  const windowTarget = { addEventListener: (name, fn) => windowListeners.set(name, fn), removeEventListener: name => windowListeners.delete(name) };
  const unbind = bindTrainingLifecycle(h.controller, { documentTarget, windowTarget, onPause: () => paused++, onStop: () => cleared++ });
  h.controller.start(); h.advance(1500); documentTarget.hidden = true; documentListeners.get('visibilitychange')();
  assert.equal(h.controller.snapshot().state, 'paused'); assert.equal(h.timers.size, 0); assert.equal(paused, 1);
  documentTarget.hidden = false; documentListeners.get('visibilitychange')(); assert.equal(h.controller.snapshot().state, 'paused');
  h.controller.resume(); const stale = [...h.timers.values()][0]; windowListeners.get('pagehide')();
  assert.equal(cleared, 1); assert.equal(h.timers.size, 0); assert.equal(h.controller.snapshot().state, 'exited');
  unbind(); const count = h.events.length; stale(); assert.equal(h.events.length, count);
  assert.equal(documentListeners.size, 0); assert.equal(windowListeners.size, 0);
});
