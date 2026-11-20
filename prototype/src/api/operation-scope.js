export function createOperationScope() {
  let generation = 0;
  const controllers = new Set();

  const invalidate = () => {
    generation += 1;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    return generation;
  };

  return Object.freeze({
    begin() {
      invalidate();
      const controller = new AbortController();
      controllers.add(controller);
      const requestGeneration = generation;
      return Object.freeze({
        signal: controller.signal,
        isCurrent: () => requestGeneration === generation && !controller.signal.aborted,
        finish: () => controllers.delete(controller),
      });
    },
    invalidate,
  });
}
