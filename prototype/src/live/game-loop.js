// One owned animation loop per mounted game. Backgrounding never auto-resumes it.
export function createGameLoop({ draw, onPause = () => {}, requestFrame = globalThis.requestAnimationFrame, cancelFrame = globalThis.cancelAnimationFrame, documentTarget = globalThis.document, windowTarget = globalThis.window }) {
  let active = false, disposed = false, frame = null;
  const tick = time => { frame = null; if (!active || disposed) return; draw(time); if (active && !disposed) frame = requestFrame(tick); };
  const pause = () => { active = false; if (frame !== null) cancelFrame(frame); frame = null; onPause(); };
  const visibility = () => { if (documentTarget.hidden) pause(); };
  documentTarget.addEventListener('visibilitychange', visibility);
  windowTarget.addEventListener('pagehide', pause);
  return {
    start() { if (active || disposed) return; active = true; frame = requestFrame(tick); },
    pause,
    dispose() { pause(); disposed = true; documentTarget.removeEventListener('visibilitychange', visibility); windowTarget.removeEventListener('pagehide', pause); },
  };
}
