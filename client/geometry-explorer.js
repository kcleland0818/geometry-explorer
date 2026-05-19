/**
 * Geometry Explorer — interactive perimeter, area, surface area, and volume.
 */
import NumericSlider from './design-system/components/numeric-slider/numeric-slider.js';

const U = 'u';
const U2 = 'u²';
const U3 = 'u³';
const DEFAULT_MODE = '2d';
const DEFAULT_SHAPE_2D = 'rectangle';
const DEFAULT_SHAPE_3D = 'prism';
const SNAPSHOT_DEBOUNCE_MS = 250;

function formatNumber(n) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const decimals = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return n.toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  });
}

/** CSS-pixel size; context is scaled by devicePixelRatio so we must not use raw canvas.width. */
function getLogicalCanvasSize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  return {
    w: canvas.width / dpr,
    h: canvas.height / dpr,
    dpr,
  };
}

const SHAPES_2D = {
  rectangle: {
    label: 'Rectangle',
    keys: ['width', 'height'],
    paramLabels: ['Width', 'Height'],
    ranges: { min: 1, max: 16, step: 1 },
    defaults: { width: 8, height: 5 },
    compute(v) {
      const { width: w, height: h } = v;
      return {
        perimeter: 2 * (w + h),
        area: w * h,
      };
    },
    metricRows(m) {
      return [
        { name: 'Perimeter', value: `${formatNumber(m.perimeter)} ${U}`, hint: 'P = 2(w + h)' },
        { name: 'Area', value: `${formatNumber(m.area)} ${U2}`, hint: 'A = w × h' },
      ];
    },
  },
  circle: {
    label: 'Circle',
    keys: ['radius'],
    paramLabels: ['Radius'],
    ranges: { min: 1, max: 12, step: 1 },
    defaults: { radius: 5 },
    compute(v) {
      const r = v.radius;
      return {
        perimeter: 2 * Math.PI * r,
        area: Math.PI * r * r,
      };
    },
    metricRows(m) {
      return [
        {
          name: 'Circumference',
          value: `${formatNumber(m.perimeter)} ${U}`,
          hint: 'Same idea as perimeter for a circle: C = 2πr',
        },
        { name: 'Area', value: `${formatNumber(m.area)} ${U2}`, hint: 'A = πr²' },
      ];
    },
  },
  rightTriangle: {
    label: 'Right triangle',
    keys: ['legA', 'legB'],
    paramLabels: ['Leg a', 'Leg b'],
    ranges: { min: 1, max: 14, step: 1 },
    defaults: { legA: 6, legB: 8 },
    compute(v) {
      const { legA: a, legB: b } = v;
      const hyp = Math.sqrt(a * a + b * b);
      return {
        perimeter: a + b + hyp,
        area: (a * b) / 2,
      };
    },
    metricRows(m) {
      return [
        {
          name: 'Perimeter',
          value: `${formatNumber(m.perimeter)} ${U}`,
          hint: 'Sum of all three sides (includes hypotenuse)',
        },
        { name: 'Area', value: `${formatNumber(m.area)} ${U2}`, hint: 'A = ½ × a × b' },
      ];
    },
  },
};

const SHAPES_3D = {
  prism: {
    label: 'Rectangular prism',
    keys: ['length', 'width', 'height'],
    paramLabels: ['Length', 'Width', 'Height'],
    ranges: { min: 1, max: 12, step: 1 },
    defaults: { length: 6, width: 4, height: 5 },
    compute(v) {
      const { length: l, width: w, height: h } = v;
      return {
        surfaceArea: 2 * (l * w + l * h + w * h),
        volume: l * w * h,
      };
    },
    metricRows(m) {
      return [
        {
          name: 'Surface area',
          value: `${formatNumber(m.surfaceArea)} ${U2}`,
          hint: 'Total area of all faces',
        },
        { name: 'Volume', value: `${formatNumber(m.volume)} ${U3}`, hint: 'V = l × w × h' },
      ];
    },
  },
  cylinder: {
    label: 'Cylinder',
    keys: ['radius', 'height'],
    paramLabels: ['Radius', 'Height'],
    ranges: { min: 1, max: 12, step: 1 },
    defaults: { radius: 4, height: 8 },
    compute(v) {
      const { radius: r, height: h } = v;
      const side = 2 * Math.PI * r * h;
      const caps = 2 * Math.PI * r * r;
      return {
        surfaceArea: caps + side,
        volume: Math.PI * r * r * h,
      };
    },
    metricRows(m) {
      return [
        {
          name: 'Surface area',
          value: `${formatNumber(m.surfaceArea)} ${U2}`,
          hint: 'SA = 2πr² + 2πrh',
        },
        { name: 'Volume', value: `${formatNumber(m.volume)} ${U3}`, hint: 'V = πr²h' },
      ];
    },
  },
  sphere: {
    label: 'Sphere',
    keys: ['radius'],
    paramLabels: ['Radius'],
    ranges: { min: 1, max: 12, step: 1 },
    defaults: { radius: 5 },
    compute(v) {
      const r = v.radius;
      return {
        surfaceArea: 4 * Math.PI * r * r,
        volume: (4 / 3) * Math.PI * r * r * r,
      };
    },
    metricRows(m) {
      return [
        {
          name: 'Surface area',
          value: `${formatNumber(m.surfaceArea)} ${U2}`,
          hint: 'SA = 4πr²',
        },
        { name: 'Volume', value: `${formatNumber(m.volume)} ${U3}`, hint: 'V = (4/3)πr³' },
      ];
    },
  },
};

function getCatalog(mode) {
  return mode === '3d' ? SHAPES_3D : SHAPES_2D;
}

function getCurrentShapeKey(state) {
  return state.mode === '3d' ? state.shape3d : state.shape2d;
}

function getShapeDefForState(state) {
  return getCatalog(state.mode)[getCurrentShapeKey(state)];
}

function snapToStep(value, min, step) {
  if (!Number.isFinite(step) || step <= 0) return value;
  const snapped = Math.round((value - min) / step) * step + min;
  return Number(snapped.toFixed(6));
}

function normalizeValues(def, inputValues = {}) {
  const values = inputValues && typeof inputValues === 'object' ? inputValues : {};
  const out = {};
  def.keys.forEach((key) => {
    const raw = values[key];
    const numeric = Number(raw);
    const fallback = def.defaults[key];
    const value = Number.isFinite(numeric) ? numeric : fallback;
    const clamped = Math.min(def.ranges.max, Math.max(def.ranges.min, value));
    out[key] = snapToStep(clamped, def.ranges.min, def.ranges.step);
  });
  return out;
}

function normalizeInitialState(config) {
  const initial = config?.initialState || config?.state || {};
  const requestedMode = initial.mode === '3d' ? '3d' : DEFAULT_MODE;
  const catalog = getCatalog(requestedMode);
  const fallbackShape = requestedMode === '3d' ? DEFAULT_SHAPE_3D : DEFAULT_SHAPE_2D;
  const requestedShape =
    typeof initial.shape === 'string'
      ? initial.shape
      : requestedMode === '3d'
        ? initial.shape3d
        : initial.shape2d;
  const shape = Object.prototype.hasOwnProperty.call(catalog, requestedShape)
    ? requestedShape
    : fallbackShape;
  const def = catalog[shape];
  const values = normalizeValues(def, initial.values);

  return {
    mode: requestedMode,
    shape2d: requestedMode === '2d' ? shape : DEFAULT_SHAPE_2D,
    shape3d: requestedMode === '3d' ? shape : DEFAULT_SHAPE_3D,
    values,
  };
}

async function loadRuntimeConfig() {
  try {
    const response = await fetch('/config', { cache: 'no-store' });
    if (!response.ok) {
      console.warn('Geometry Explorer config request failed:', response.status);
      return {};
    }
    const config = await response.json();
    return config && typeof config === 'object' ? config : {};
  } catch (error) {
    console.warn('Geometry Explorer config could not be loaded; using defaults.', error);
    return {};
  }
}

function buildSnapshot(state, metrics) {
  return {
    version: 1,
    mode: state.mode,
    shape: getCurrentShapeKey(state),
    values: { ...state.values },
    metrics: { ...metrics },
  };
}

function draw2D(ctx, canvas, shapeKey, values) {
  const { w, h } = getLogicalCanvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Backgrounds-Main-Default') || '#fff';
  ctx.fillRect(0, 0, w, h);

  const pad = 48;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const cx = w / 2;
  const cy = h / 2;

  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Primary-Default') || '#2563eb';
  ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
  ctx.lineWidth = 2;

  if (shapeKey === 'rectangle') {
    const rw = values.width;
    const rh = values.height;
    const scale = Math.min(innerW / rw, innerH / rh) * 0.85;
    const bw = rw * scale;
    const bh = rh * scale;
    const x0 = cx - bw / 2;
    const y0 = cy - bh / 2;
    ctx.beginPath();
    ctx.rect(x0, y0, bw, bh);
    ctx.fill();
    ctx.stroke();

    const gridStroke =
      getComputedStyle(document.documentElement).getPropertyValue('--Colors-Stroke-Medium') ||
      'hsla(215, 16%, 47%, 0.35)';
    ctx.strokeStyle = gridStroke.trim();
    ctx.lineWidth = 1;
    const cols = Math.min(200, Math.max(0, Math.floor(rw)));
    const rows = Math.min(200, Math.max(0, Math.floor(rh)));
    for (let i = 1; i < cols; i += 1) {
      const x = x0 + i * scale;
      if (x < x0 + bw) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y0 + bh);
        ctx.stroke();
      }
    }
    for (let j = 1; j < rows; j += 1) {
      const y = y0 + j * scale;
      if (y < y0 + bh) {
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + bw, y);
        ctx.stroke();
      }
    }

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Text-Body-Default') || '#334155';
    ctx.font = '600 14px Work Sans, sans-serif';
    ctx.fillText(`w = ${rw}`, x0 + bw / 2 - 18, y0 - 10);
    ctx.fillText(`h = ${rh}`, x0 + bw + 8, y0 + bh / 2);
  } else if (shapeKey === 'circle') {
    const r = values.radius;
    const rMax = SHAPES_2D.circle.ranges.max;
    const maxPixelR = Math.min(innerW, innerH) / 2 * 0.88;
    const rad = (r / rMax) * maxPixelR;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + rad, cy);
    ctx.stroke();
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Text-Body-Default') || '#334155';
    ctx.font = '600 13px Work Sans, sans-serif';
    ctx.fillText(`r = ${r}`, cx + rad * 0.38, cy - rad * 0.42);
  } else if (shapeKey === 'rightTriangle') {
    const a = values.legA;
    const b = values.legB;
    const scale = Math.min(innerW / b, innerH / a) * 0.85;
    const bx = b * scale;
    const ay = a * scale;
    const x0 = cx - bx / 2;
    const y0 = cy + ay / 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + bx, y0);
    ctx.lineTo(x0, y0 - ay);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + bx, y0);
    ctx.lineTo(x0, y0 - ay);
    ctx.closePath();
    ctx.clip();

    const gridStroke =
      getComputedStyle(document.documentElement).getPropertyValue('--Colors-Stroke-Medium') ||
      'hsla(215, 16%, 47%, 0.35)';
    ctx.strokeStyle = gridStroke.trim();
    ctx.lineWidth = 1;
    const colsT = Math.min(200, Math.max(0, Math.floor(b)));
    const rowsT = Math.min(200, Math.max(0, Math.floor(a)));
    for (let i = 1; i < colsT; i += 1) {
      const x = x0 + i * scale;
      if (x < x0 + bx) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y0 - ay);
        ctx.stroke();
      }
    }
    for (let j = 1; j < rowsT; j += 1) {
      const y = y0 - j * scale;
      if (y > y0 - ay) {
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 + bx, y);
        ctx.stroke();
      }
    }
    ctx.restore();

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Text-Body-Default') || '#334155';
    ctx.font = '600 14px Work Sans, sans-serif';
    ctx.fillText(`a = ${a}`, x0 + bx / 2 - 10, y0 + 18);
    ctx.fillText(`b = ${b}`, x0 - 28, y0 - ay / 2);
  }
}

function draw3D(ctx, canvas, shapeKey, values) {
  const { w, h } = getLogicalCanvasSize(canvas);
  ctx.clearRect(0, 0, w, h);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Backgrounds-Main-Default') || '#fff';
  ctx.fillStyle = bg.trim() || '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const stroke = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Primary-Default') || '#2563eb';
  const strokeMuted = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Stroke-Strong') || '#64748b';
  ctx.lineWidth = 2;

  const cx = w / 2;
  const cy = h / 2;

  if (shapeKey === 'prism') {
    const { length: L, width: W, height: H } = values;
    const maxDim = Math.max(L, W, H);
    const margin = 52;
    const s = (Math.min(w, h) * 0.3) / maxDim;
    const dx = L * s * 0.65;
    const dy = -H * s;
    const wx = W * s * 0.55;
    const wy = W * s * 0.28;

    const base = [
      { x: cx - dx / 2, y: cy + dy / 2 },
      { x: cx + dx / 2, y: cy + dy / 2 },
      { x: cx + dx / 2 + wx, y: cy + dy / 2 + wy },
      { x: cx - dx / 2 + wx, y: cy + dy / 2 + wy },
    ];
    const top = base.map((p) => ({ x: p.x, y: p.y + dy }));

    const all = [...base, ...top];
    let minPx = Infinity;
    let maxPx = -Infinity;
    let minPy = Infinity;
    let maxPy = -Infinity;
    all.forEach((p) => {
      minPx = Math.min(minPx, p.x);
      maxPx = Math.max(maxPx, p.x);
      minPy = Math.min(minPy, p.y);
      maxPy = Math.max(maxPy, p.y);
    });

    let tx = (w - minPx - maxPx) / 2;

    const bboxH = maxPy - minPy;
    const availV = h - 2 * margin;
    const tyCenter = margin + (availV - bboxH) / 2 - minPy;
    const tyBottom = (h - margin) - maxPy;
    const towardCenter = 0.52;
    let ty = tyCenter * towardCenter + tyBottom * (1 - towardCenter);

    if (minPy + ty < margin) {
      ty = margin - minPy;
    }
    if (maxPy + ty > h - margin) {
      ty = h - margin - maxPy;
    }
    if (minPy + ty < margin) {
      ty = margin - minPy;
    }

    const shift = (p) => ({ x: p.x + tx, y: p.y + ty });
    const baseT = base.map(shift);
    const topT = top.map(shift);

    ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
    ctx.beginPath();
    ctx.moveTo(baseT[0].x, baseT[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(baseT[i].x, baseT[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();

    ctx.fillStyle = 'rgba(37, 99, 235, 0.14)';
    ctx.beginPath();
    ctx.moveTo(topT[0].x, topT[0].y);
    ctx.lineTo(topT[1].x, topT[1].y);
    ctx.lineTo(baseT[1].x, baseT[1].y);
    ctx.lineTo(baseT[0].x, baseT[0].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(37, 99, 235, 0.2)';
    ctx.beginPath();
    ctx.moveTo(topT[1].x, topT[1].y);
    ctx.lineTo(topT[2].x, topT[2].y);
    ctx.lineTo(baseT[2].x, baseT[2].y);
    ctx.lineTo(baseT[1].x, baseT[1].y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = strokeMuted;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(baseT[2].x, baseT[2].y);
    ctx.lineTo(baseT[3].x, baseT[3].y);
    ctx.lineTo(baseT[0].x, baseT[0].y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = stroke;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.moveTo(baseT[i].x, baseT[i].y);
      ctx.lineTo(topT[i].x, topT[i].y);
    }
    ctx.stroke();

    const midLen = {
      x: (baseT[0].x + baseT[1].x) / 2,
      y: (baseT[0].y + baseT[1].y) / 2,
    };
    const midWid = {
      x: (baseT[1].x + baseT[2].x) / 2,
      y: (baseT[1].y + baseT[2].y) / 2,
    };
    const midHt = {
      x: (baseT[1].x + topT[1].x) / 2,
      y: (baseT[1].y + topT[1].y) / 2,
    };

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Text-Body-Default') || '#334155';
    ctx.font = '600 12px Work Sans, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`ℓ=${L}`, midLen.x, midLen.y + 10);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`w=${W}`, midWid.x + 10, midWid.y + 4);
    ctx.textAlign = 'left';
    ctx.fillText(`h=${H}`, midHt.x + 12, midHt.y);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  } else if (shapeKey === 'cylinder') {
    const { radius: r, height: ht } = values;
    const maxDim = Math.max(r * 2, ht);
    const s = (Math.min(w, h) * 0.35) / maxDim;
    const rw = r * s * 2;
    const hh = ht * s;
    const topY = cy - hh / 2;
    const botY = cy + hh / 2;

    ctx.strokeStyle = stroke;
    ctx.fillStyle = 'rgba(37, 99, 235, 0.1)';
    ctx.beginPath();
    ctx.ellipse(cx, topY, rw / 2, rw * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(37, 99, 235, 0.06)';
    ctx.beginPath();
    ctx.moveTo(cx - rw / 2, topY);
    ctx.lineTo(cx - rw / 2, botY);
    ctx.lineTo(cx + rw / 2, botY);
    ctx.lineTo(cx + rw / 2, topY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(cx, botY, rw / 2, rw * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
    ctx.fill();

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Text-Body-Default') || '#334155';
    ctx.font = '12px Work Sans, sans-serif';
    ctx.fillText(`r=${r}`, cx + rw / 2 + 6, cy);
    ctx.fillText(`h=${ht}`, cx - rw / 2 - 28, cy);
  } else if (shapeKey === 'sphere') {
    const r = values.radius;
    const rMax = SHAPES_3D.sphere.ranges.max;
    const maxRad = Math.min(w, h) * 0.38;
    const rad = (r / rMax) * maxRad;

    const hx = cx - rad * 0.42;
    const hy = cy - rad * 0.45;
    const grd = ctx.createRadialGradient(hx, hy, Math.max(4, rad * 0.06), cx, cy * 1.02, rad * 1.05);
    grd.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
    grd.addColorStop(0.12, 'rgba(186, 210, 255, 0.65)');
    grd.addColorStop(0.35, 'rgba(96, 145, 235, 0.55)');
    grd.addColorStop(0.65, 'rgba(37, 99, 235, 0.5)');
    grd.addColorStop(0.9, 'rgba(23, 58, 140, 0.72)');
    grd.addColorStop(1, 'rgba(12, 28, 72, 0.88)');

    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx - rad * 0.15, cy - rad * 0.2, rad * 0.85, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    ctx.strokeStyle = strokeMuted;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.ellipse(cx, cy + rad * 0.08, rad * 0.9, rad * 0.26, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Text-Body-Default') || '#334155';
    ctx.font = '600 12px Work Sans, sans-serif';
    ctx.fillText(`r=${r}`, cx + rad * 0.32, cy + rad * 0.52);
  }
}

async function initGeometryExplorer() {
  const canvas = document.getElementById('geometry-canvas');
  const modeSelect = document.getElementById('geometry-mode');
  const shapeSelect = document.getElementById('geometry-shape');
  const slidersRoot = document.getElementById('geometry-sliders');
  const metricsList = document.getElementById('geometry-metrics');
  const formulaEl = document.getElementById('geometry-formula-note');
  if (!canvas || !modeSelect || !shapeSelect || !slidersRoot || !metricsList) return;

  const runtimeConfig = await loadRuntimeConfig();
  const ctx = canvas.getContext('2d');
  let sliders = [];
  let snapshotTimer = null;
  let state = normalizeInitialState(runtimeConfig);

  function getShapeDef() {
    return getShapeDefForState(state);
  }

  function readValuesFromSliders() {
    const def = getShapeDef();
    const out = {};
    def.keys.forEach((key, i) => {
      out[key] = sliders[i]?.getValue?.() ?? def.defaults[key];
    });
    return out;
  }

  async function postSnapshot(snapshot) {
    try {
      await fetch('/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
    } catch (error) {
      console.warn('Geometry Explorer snapshot could not be saved.', error);
    }
  }

  function publishSnapshot(metrics, immediate = false) {
    const snapshot = buildSnapshot(state, metrics);
    if (snapshotTimer) {
      clearTimeout(snapshotTimer);
      snapshotTimer = null;
    }

    if (immediate) {
      postSnapshot(snapshot);
      return;
    }

    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      postSnapshot(snapshot);
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  function applyUiConfig() {
    const ui = runtimeConfig.ui || {};
    modeSelect.disabled = ui.lockedMode === true;
    shapeSelect.disabled = ui.lockedShape === true;
    if (formulaEl) {
      formulaEl.hidden = ui.showFormulaHints === false;
    }
  }

  function syncMetrics({ publish = true, immediate = false } = {}) {
    const def = getShapeDef();
    state.values = readValuesFromSliders();
    const computed = def.compute(state.values);
    const rows = def.metricRows(computed);
    metricsList.innerHTML = rows
      .map(
        (row) => `<li class="geometry-metric-row">
        <div class="geometry-metric-head">
          <span class="geometry-metric-name">${row.name}</span>
          <span class="geometry-metric-value">${row.value}</span>
        </div>
        <p class="geometry-metric-hint">${row.hint}</p>
      </li>`,
      )
      .join('');

    if (formulaEl) {
      if (state.mode === '2d') {
        formulaEl.textContent =
          'Units are abstract (u). Perimeter and circumference are in u; area is in u².';
      } else {
        formulaEl.textContent =
          '3D figures use surface area (u²) and volume (u³). Perimeter applies to flat shapes; for solids we use surface area.';
      }
    }

    const dpr = window.devicePixelRatio || 1;
    const frame = canvas.parentElement;
    let cssW = 640;
    let cssH = 480;
    if (frame) {
      const rect = frame.getBoundingClientRect();
      cssW = Math.max(280, Math.floor(rect.width));
      cssH = Math.max(260, Math.floor(rect.height));
      if (rect.height < 40) {
        cssH = Math.max(300, Math.floor(cssW * 0.62));
      }
    }
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.style.maxWidth = '100%';
    canvas.style.maxHeight = '100%';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (state.mode === '2d') {
      draw2D(ctx, canvas, state.shape2d, state.values);
    } else {
      draw3D(ctx, canvas, state.shape3d, state.values);
    }

    if (publish) {
      publishSnapshot(computed, immediate);
    }
  }

  function rebuildSliders() {
    sliders.forEach((s) => {
      try {
        s.destroy();
      } catch (e) {
        console.warn('Slider destroy', e);
      }
    });
    sliders = [];
    slidersRoot.innerHTML = '';

    const def = getShapeDef();
    const ranges = def.ranges;

    def.keys.forEach((key, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'geometry-slider-block';
      const lab = document.createElement('span');
      lab.className = 'geometry-control-label';
      lab.textContent = def.paramLabels[index];
      const mount = document.createElement('div');
      mount.id = `geom-slider-${key}`;
      wrap.appendChild(lab);
      wrap.appendChild(mount);
      slidersRoot.appendChild(wrap);

      const initial = state.values[key] ?? def.defaults[key];
      const slider = new NumericSlider(mount, {
        min: ranges.min,
        max: ranges.max,
        step: ranges.step,
        value: initial,
        showInputs: true,
        continuousUpdates: true,
        onChange: () => syncMetrics(),
      });
      sliders.push(slider);
    });
  }

  function populateShapeOptions() {
    const catalog = getCatalog(state.mode);
    let currentKey = getCurrentShapeKey(state);
    const keys = Object.keys(catalog);
    if (!keys.includes(currentKey)) {
      currentKey = keys[0];
      if (state.mode === '2d') state.shape2d = currentKey;
      else state.shape3d = currentKey;
    }
    shapeSelect.innerHTML = '';
    keys.forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = catalog[key].label;
      shapeSelect.appendChild(opt);
    });
    shapeSelect.value = currentKey;
  }

  function applyModeShapeDefaults() {
    const def = getShapeDef();
    state.values = { ...def.defaults };
  }

  modeSelect.addEventListener('change', () => {
    state.mode = modeSelect.value;
    populateShapeOptions();
    applyModeShapeDefaults();
    rebuildSliders();
    syncMetrics();
  });

  shapeSelect.addEventListener('change', () => {
    if (state.mode === '2d') {
      state.shape2d = shapeSelect.value;
    } else {
      state.shape3d = shapeSelect.value;
    }
    applyModeShapeDefaults();
    rebuildSliders();
    syncMetrics();
  });

  const frameEl = canvas.parentElement;
  const ro = new ResizeObserver(() => {
    syncMetrics({ publish: false });
  });
  if (frameEl) {
    ro.observe(frameEl);
  }

  applyUiConfig();
  modeSelect.value = state.mode;
  populateShapeOptions();
  rebuildSliders();
  syncMetrics({ immediate: true });
}

export { initGeometryExplorer };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGeometryExplorer);
} else {
  initGeometryExplorer();
}
