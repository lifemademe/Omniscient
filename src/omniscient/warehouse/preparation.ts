/** Yield through a paint without imposing a minimum loading duration. */
export async function warehousePreparationYield(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = (): void => { cancelAnimationFrame(frame); clearTimeout(task); reject(signal.reason); };
    let task: ReturnType<typeof setTimeout>;
    const frame = requestAnimationFrame(() => {
      task = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 0);
    });
    signal.addEventListener('abort', abort, { once: true });
  });
  signal.throwIfAborted();
}

export type WarehousePreparationStage = 'facility' | 'personnel' | 'cameras';

/** Cancel this consumer without poisoning the engine's shared loading/cache work. */
export function awaitWarehousePreparation<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
  });
}
