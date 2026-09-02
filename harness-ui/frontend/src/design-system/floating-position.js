import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

export function createFloatingPositioner({ reference, floating, placement = 'bottom-start', offsetPx = 8 }) {
  if (!reference?.getBoundingClientRect || !floating?.style) throw new TypeError('riferimento floating non valido');
  let cleanup = null;
  let destroyed = false;
  let generation = 0;
  async function update() {
    const current = ++generation;
    const result = await computePosition(reference, floating, {
      placement,
      strategy: 'fixed',
      middleware: [offset(offsetPx), flip(), shift({ padding: 8 })],
    });
    if (destroyed || current !== generation) return false;
    Object.assign(floating.style, { position: result.strategy, left: `${result.x}px`, top: `${result.y}px` });
    return true;
  }
  function start() {
    if (destroyed) throw new Error('positioner distrutto');
    if (cleanup) return false;
    cleanup = autoUpdate(reference, floating, () => { void update(); });
    return true;
  }
  function stop() {
    if (!cleanup) return false;
    cleanup();
    cleanup = null;
    generation += 1;
    return true;
  }
  return Object.freeze({
    start, stop, update,
    destroy() { if (destroyed) return false; destroyed = true; stop(); return true; },
  });
}

