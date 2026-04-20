/**
 * Simulation entry for composer hosts: exports init(context).
 * Hosts load content.html, simulation.css, then import ./simulation.js
 * (see composer template simulation-loader.js).
 */

function escapeSelector(id) {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(id);
  }
  return id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function resolveRoot(context) {
  const simId = context.config?.id;
  if (simId) {
    const slot = document.querySelector(
      `.sim-slot[data-sim-id="${escapeSelector(simId)}"]`
    );
    const inner = slot?.querySelector('[data-bespoke-sim-root]');
    if (inner) return inner;
    if (slot) return slot;
  }
  return document.getElementById('standalone-sim-mount');
}

function bindDemo(root, emit) {
  const btn = root.querySelector('#btn-sim-demo');
  if (!btn) return;
  btn.addEventListener('click', () => {
    emit('demo:click', { source: 'template' });
  });
}

export function init(context = {}) {
  const emit =
    typeof context.emit === 'function'
      ? context.emit
      : () => {};

  const root = resolveRoot(context);
  if (!root) {
    console.warn('simulation-app: no mount root found');
    return;
  }
  bindDemo(root, emit);
}
