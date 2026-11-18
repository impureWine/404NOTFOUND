export function clearPrivateTextRuntime({ textRef, particlesRef, frameRef, canvas, cancelFrame }) {
  textRef.current = '';
  particlesRef.current = [];
  let cleanupSucceeded = true;
  try {
    if (frameRef.current) cancelFrame(frameRef.current);
  } catch {
    cleanupSucceeded = false;
  }
  frameRef.current = 0;

  try {
    const context = canvas?.getContext?.('2d');
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return cleanupSucceeded;
    }
    if (canvas) {
      try { canvas.width = canvas.width; } catch { cleanupSucceeded = false; }
    }
    return false;
  } catch {
    if (canvas) {
      try { canvas.width = canvas.width; } catch { cleanupSucceeded = false; }
    }
    return false;
  }
}
