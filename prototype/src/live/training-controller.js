import catalogue from '../../../shared/training-definitions.json' with { type: 'json' };
export const trainingDefinitions = Object.freeze(Object.fromEntries(catalogue.definitions.map(definition => [definition.id, definition])));

export function breathingPhase(elapsedMs, rhythm) {
  const phases = [['inhale', '吸气', rhythm.inhale], ['hold', '停留', rhythm.hold], ['exhale', '呼气', rhythm.exhale]].filter(([, , seconds]) => seconds > 0);
  const cycleMs = phases.reduce((sum, [, , seconds]) => sum + seconds * 1000, 0);
  let position = elapsedMs % cycleMs;
  for (const [id, title, seconds] of phases) {
    const durationMs = seconds * 1000;
    if (position < durationMs) return { id, title, remainingMs: durationMs - position, progress: position / durationMs, cycles: Math.floor(elapsedMs / cycleMs) };
    position -= durationMs;
  }
}

export class TrainingController {
  constructor(definitionId, { now = () => performance.now(), schedule = fn => setInterval(fn, 100), cancel = id => clearInterval(id) } = {}) {
    if (!trainingDefinitions[definitionId]) throw new Error('训练内容不可用，请返回选择其他练习。');
    this.definition = trainingDefinitions[definitionId];
    this.now = now; this.schedule = schedule; this.cancel = cancel;
    this.listeners = new Set(); this.timer = null; this.generation = 0; this.disposed = false;
    this.state = 'ready'; this.stepIndex = 0; this.elapsedMs = 0; this.activeSince = null;
    this.durationMs = 60000; this.rhythm = { inhale: 4, hold: 0, exhale: 6 };
  }
  elapsed() { return this.elapsedMs + (this.state === 'running' ? Math.max(0, this.now() - this.activeSince) : 0); }
  snapshot() {
    const elapsedMs = this.definition.type === 'breathing' ? Math.min(this.elapsed(), this.durationMs) : this.elapsed();
    return { state: this.state, stepIndex: this.stepIndex, elapsedMs, durationMs: this.durationMs,
      phase: this.definition.type === 'breathing' ? breathingPhase(elapsedMs, this.rhythm) : null };
  }
  subscribe(listener) { if (this.disposed) return () => {}; this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener); }
  emit() { if (!this.disposed) for (const listener of this.listeners) listener(this.snapshot()); return this.snapshot(); }
  clearTimer() { this.generation += 1; if (this.timer !== null) this.cancel(this.timer); this.timer = null; }
  settle() { this.elapsedMs = this.elapsed(); this.activeSince = null; }
  activate() {
    this.activeSince = this.now(); this.clearTimer();
    const generation = this.generation;
    this.timer = this.schedule(() => {
      if (this.disposed || generation !== this.generation || this.state !== 'running') return;
      if (this.definition.type === 'breathing' && this.elapsed() >= this.durationMs) {
        this.elapsedMs = this.durationMs; this.activeSince = null; this.state = 'completed'; this.clearTimer();
      }
      this.emit();
    });
  }
  start(options = {}) {
    if (this.disposed || this.state !== 'ready') throw new Error('请先重置，再开始新的练习。');
    if (this.definition.type === 'breathing') {
      const seconds = Number(options.durationSeconds ?? 60), rhythm = options.rhythm ?? this.definition.defaultRhythm;
      if (!Number.isInteger(seconds) || seconds < 10 || seconds > 600) throw new Error('练习时长需为 10～600 秒。');
      if (!['inhale','hold','exhale'].every(key => Number.isInteger(rhythm[key]) && rhythm[key] >= (key === 'hold' ? 0 : 1) && rhythm[key] <= 8)) throw new Error('吸气和呼气需为 1～8 秒，停留可为 0～8 秒。');
      this.durationMs = seconds * 1000; this.rhythm = { ...rhythm };
    }
    this.state = 'running'; this.activate(); return this.emit();
  }
  pause() { if (this.disposed || this.state !== 'running') return this.snapshot(); this.settle(); this.state = this.definition.type === 'breathing' && this.elapsedMs >= this.durationMs ? 'completed' : 'paused'; if (this.state === 'completed') this.elapsedMs = this.durationMs; this.clearTimer(); return this.emit(); }
  resume() { if (this.disposed || this.state !== 'paused') return this.snapshot(); this.state = 'running'; this.activate(); return this.emit(); }
  next() {
    if (this.disposed || this.state !== 'running' || this.definition.type !== 'guided') return this.snapshot();
    if (this.stepIndex === this.definition.steps.length - 1) return this.complete();
    this.stepIndex += 1; return this.emit();
  }
  previous() { if (!this.disposed && this.state === 'running' && this.definition.type === 'guided') this.stepIndex = Math.max(0, this.stepIndex - 1); return this.emit(); }
  complete() {
    if (this.disposed || this.state !== 'running' || this.definition.type === 'breathing') return this.snapshot();
    this.settle(); this.state = 'completed'; this.clearTimer(); return this.emit();
  }
  edit() { if (!this.disposed && this.state === 'completed' && this.definition.type !== 'breathing') { this.state = 'paused'; this.stepIndex = 0; } return this.emit(); }
  stop() { if (this.disposed) return this.snapshot(); if (this.state === 'running') this.settle(); this.state = 'exited'; this.clearTimer(); return this.emit(); }
  reset() { if (this.disposed) return this.snapshot(); this.clearTimer(); this.state = 'ready'; this.stepIndex = 0; this.elapsedMs = 0; this.activeSince = null; return this.emit(); }
  dispose() { if (this.disposed) return; this.clearTimer(); this.state = 'exited'; this.activeSince = null; this.listeners.clear(); this.disposed = true; }
}

// The controller owns its clock; the view owns these browser listeners.
export function bindTrainingLifecycle(controller, { documentTarget = document, windowTarget = window, onPause = () => {}, onStop = () => {} } = {}) {
  const visibility = () => {
    if (documentTarget.hidden && controller.snapshot().state === 'running') { controller.pause(); onPause(); }
  };
  const leave = () => { controller.stop(); onStop(); };
  documentTarget.addEventListener('visibilitychange', visibility);
  windowTarget.addEventListener('pagehide', leave);
  return () => {
    documentTarget.removeEventListener('visibilitychange', visibility);
    windowTarget.removeEventListener('pagehide', leave);
    controller.dispose();
  };
}
