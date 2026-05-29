/**
 * Geometry Explorer — interactive perimeter, area, surface area, and volume.
 */
import NumericSlider from './design-system/components/numeric-slider/numeric-slider.js';
import Dropdown from './design-system/components/dropdown/dropdown.js';

const DEFAULT_MODE = '2d';
const DEFAULT_SHAPE_2D = 'rectangle';
const DEFAULT_SHAPE_3D = 'prism';
const DEFAULT_UNITS = 'meters';
const METERS_PER_FOOT = 0.3048;
const SNAPSHOT_DEBOUNCE_MS = 250;

const VIEW3D_DEFAULT = { yaw: 0.55, pitch: 0.42 };
const VIEW3D_LIMITS = { yawMin: -1.35, yawMax: 1.35, pitchMin: 0.1, pitchMax: 1.05 };
const VIEW3D_DRAG_SENSITIVITY = 0.0065;
const GEOMETRY_GRID_LINE_WIDTH = 1.35;

const PRISM_FACE_DEFS = [
  { ids: [0, 1, 2, 3], grid: 'kMin' },
  { ids: [4, 5, 6, 7], grid: 'kMax' },
  { ids: [0, 1, 5, 4], grid: 'jMin' },
  { ids: [1, 2, 6, 5], grid: 'iMax' },
  { ids: [2, 3, 7, 6], grid: 'jMax' },
  { ids: [3, 0, 4, 7], grid: 'iMin' },
];

const PRISM_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const PRISM_EDGE_FACES = [
  [0, 2], [0, 3], [0, 4], [0, 5],
  [1, 2], [1, 3], [1, 4], [1, 5],
  [2, 4], [2, 5], [3, 4], [3, 5],
];

const UNIT_SYSTEMS = {
  abstract: {
    label: 'Abstract (u)',
    linear: 'u',
    area: 'u²',
    volume: 'u³',
  },
  meters: {
    label: 'Meters',
    linear: 'm',
    area: 'm²',
    volume: 'm³',
  },
  feet: {
    label: 'Feet',
    linear: 'ft',
    area: 'ft²',
    volume: 'ft³',
  },
};

function normalizeUnits(raw) {
  if (raw === 'feet' || raw === 'ft') return 'feet';
  if (raw === 'meters' || raw === 'meter' || raw === 'm') return 'meters';
  if (raw === 'abstract' || raw === 'u') return 'abstract';
  return DEFAULT_UNITS;
}

function getUnitLabels(units) {
  return UNIT_SYSTEMS[normalizeUnits(units)] || UNIT_SYSTEMS[DEFAULT_UNITS];
}

function getAlternateUnits(units) {
  const normalized = normalizeUnits(units);
  if (normalized === 'meters') return 'feet';
  if (normalized === 'feet') return 'meters';
  return null;
}

function getUnitPower(unitKey) {
  if (unitKey === 'area') return 2;
  if (unitKey === 'volume') return 3;
  return 1;
}

function convertBetweenUnits(value, fromUnits, toUnits, unitKey = 'linear') {
  const from = normalizeUnits(fromUnits);
  const to = normalizeUnits(toUnits);
  if (from === to || from === 'abstract' || to === 'abstract') return value;
  const power = getUnitPower(unitKey);
  const metersPerUnit =
    from === 'feet' ? METERS_PER_FOOT : from === 'meters' ? 1 : 1;
  const metersValue = value * Math.pow(metersPerUnit, power);
  const targetPerMeter =
    to === 'feet' ? 1 / METERS_PER_FOOT : to === 'meters' ? 1 : 1;
  return metersValue * Math.pow(targetPerMeter, power);
}

function convertLength(value, fromUnits, toUnits) {
  return convertBetweenUnits(value, fromUnits, toUnits, 'linear');
}

function formatMeasurement(value, unitKey, units) {
  const labels = getUnitLabels(units);
  const primary = `${formatNumber(value)} ${labels[unitKey]}`;
  const alternateUnits = getAlternateUnits(units);
  if (!alternateUnits) {
    return { primary, alternate: null };
  }
  const altValue = convertBetweenUnits(value, units, alternateUnits, unitKey);
  const altLabels = getUnitLabels(alternateUnits);
  return {
    primary,
    alternate: `≈ ${formatNumber(altValue)} ${altLabels[unitKey]}`,
  };
}

function formatDimensionLabel(value, units) {
  const labels = getUnitLabels(units);
  if (normalizeUnits(units) === 'abstract') {
    return String(value);
  }
  return `${formatNumber(value)} ${labels.linear}`;
}

function snapSliderValue(value, ranges) {
  return snapToStep(value, ranges.min, ranges.step);
}

function unitsNoteText(units, mode) {
  const normalized = normalizeUnits(units);
  if (normalized === 'abstract') {
    return mode === '2d'
      ? 'Units are abstract (u). Perimeter and circumference are in u; area is in u².'
      : '3D figures use surface area (u²) and volume (u³). Perimeter applies to flat shapes; for solids we use surface area.';
  }

  const labels = getUnitLabels(normalized);
  const alternate = getAlternateUnits(normalized);
  const altLabels = getUnitLabels(alternate);
  const conversionNote =
    normalized === 'meters'
      ? `1 m = ${formatNumber(1 / METERS_PER_FOOT)} ft`
      : `1 ft = ${formatNumber(METERS_PER_FOOT)} m`;

  if (mode === '2d') {
    return `Lengths in ${labels.linear}; area in ${labels.area}. ≈ ${altLabels.linear}/${altLabels.area} (${conversionNote}).`;
  }
  return `Lengths in ${labels.linear}; area in ${labels.area}; volume in ${labels.volume}. ≈ ${altLabels.linear}/${altLabels.area}/${altLabels.volume} (${conversionNote}).`;
}

function paramLabelWithUnits(label, units) {
  const normalized = normalizeUnits(units);
  if (normalized === 'abstract') return label;
  return `${label} (${getUnitLabels(normalized).linear})`;
}

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
    metricRows(m, units) {
      const perimeter = formatMeasurement(m.perimeter, 'linear', units);
      const area = formatMeasurement(m.area, 'area', units);
      return [
        { name: 'Perimeter', ...perimeter, hint: 'P = 2(w + h)' },
        { name: 'Area', ...area, hint: 'A = w × h' },
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
    metricRows(m, units) {
      const perimeter = formatMeasurement(m.perimeter, 'linear', units);
      const area = formatMeasurement(m.area, 'area', units);
      return [
        {
          name: 'Circumference',
          ...perimeter,
          hint: 'Same idea as perimeter for a circle: C = 2πr',
        },
        { name: 'Area', ...area, hint: 'A = πr²' },
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
    metricRows(m, units) {
      const perimeter = formatMeasurement(m.perimeter, 'linear', units);
      const area = formatMeasurement(m.area, 'area', units);
      return [
        {
          name: 'Perimeter',
          ...perimeter,
          hint: 'Sum of all three sides (includes hypotenuse)',
        },
        { name: 'Area', ...area, hint: 'A = ½ × a × b' },
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
    metricRows(m, units) {
      const surfaceArea = formatMeasurement(m.surfaceArea, 'area', units);
      const volume = formatMeasurement(m.volume, 'volume', units);
      return [
        {
          name: 'Surface area',
          ...surfaceArea,
          hint: 'Total area of all faces',
        },
        { name: 'Volume', ...volume, hint: 'V = l × w × h' },
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
    metricRows(m, units) {
      const surfaceArea = formatMeasurement(m.surfaceArea, 'area', units);
      const volume = formatMeasurement(m.volume, 'volume', units);
      return [
        {
          name: 'Surface area',
          ...surfaceArea,
          hint: 'SA = 2πr² + 2πrh',
        },
        { name: 'Volume', ...volume, hint: 'V = πr²h' },
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
    metricRows(m, units) {
      const surfaceArea = formatMeasurement(m.surfaceArea, 'area', units);
      const volume = formatMeasurement(m.volume, 'volume', units);
      return [
        {
          name: 'Surface area',
          ...surfaceArea,
          hint: 'SA = 4πr²',
        },
        { name: 'Volume', ...volume, hint: 'V = (4/3)πr³' },
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

function normalizeSliderRangeFragment(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  const min = Number(raw.min);
  const max = Number(raw.max);
  const step = Number(raw.step);
  if (Number.isFinite(min)) out.min = min;
  if (Number.isFinite(max)) out.max = max;
  if (Number.isFinite(step) && step > 0) out.step = step;
  return Object.keys(out).length ? out : null;
}

function pickSliderConfigForUnits(sliderConfig, units) {
  if (!sliderConfig || typeof sliderConfig !== 'object' || Array.isArray(sliderConfig)) {
    return sliderConfig;
  }
  const unitKey = normalizeUnits(units);
  const unitOverrides = sliderConfig[unitKey];
  if (
    unitOverrides &&
    typeof unitOverrides === 'object' &&
    !Array.isArray(unitOverrides) &&
    (unitOverrides.meters === undefined &&
      unitOverrides.feet === undefined &&
      unitOverrides.abstract === undefined)
  ) {
    return unitOverrides;
  }
  return sliderConfig;
}

function resolveSliderRanges(def, sliderConfig, units = DEFAULT_UNITS) {
  const scopedConfig = pickSliderConfigForUnits(sliderConfig, units);
  const base = def.ranges;
  const global = normalizeSliderRangeFragment(scopedConfig);
  const out = {};
  def.keys.forEach((key) => {
    const keyFrag = normalizeSliderRangeFragment(
      scopedConfig && typeof scopedConfig === 'object' ? scopedConfig[key] : null,
    );
    let min = keyFrag?.min ?? global?.min ?? base.min;
    let max = keyFrag?.max ?? global?.max ?? base.max;
    let step = keyFrag?.step ?? global?.step ?? base.step;
    if (!Number.isFinite(min)) min = base.min;
    if (!Number.isFinite(max)) max = base.max;
    if (!Number.isFinite(step) || step <= 0) step = base.step;
    if (min >= max) {
      min = base.min;
      max = base.max;
    }
    out[key] = { min, max, step };
  });
  return out;
}

function normalizeValues(def, inputValues = {}, rangesByKey) {
  const values = inputValues && typeof inputValues === 'object' ? inputValues : {};
  const out = {};
  def.keys.forEach((key) => {
    const ranges = rangesByKey?.[key] || def.ranges;
    const raw = values[key];
    const numeric = Number(raw);
    const fallback = def.defaults[key];
    const value = Number.isFinite(numeric) ? numeric : fallback;
    const clamped = Math.min(ranges.max, Math.max(ranges.min, value));
    out[key] = snapToStep(clamped, ranges.min, ranges.step);
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
  const units = normalizeUnits(initial.units ?? config?.units);
  const rangesByKey = resolveSliderRanges(def, config?.sliders, units);
  const displayRanges = {};
  def.keys.forEach((key) => {
    const ranges = rangesByKey[key];
    displayRanges[key] = {
      min: ranges.min,
      max: ranges.max,
      step: ranges.step,
    };
  });
  const values = normalizeValues(def, initial.values, displayRanges);

  return {
    mode: requestedMode,
    shape2d: requestedMode === '2d' ? shape : DEFAULT_SHAPE_2D,
    shape3d: requestedMode === '3d' ? shape : DEFAULT_SHAPE_3D,
    units,
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

function getGeometryGridStrokeStyle() {
  const rootStyle = getComputedStyle(document.documentElement);
  const custom = rootStyle.getPropertyValue('--geometry-grid-stroke').trim();
  if (custom) return custom;
  const strong = rootStyle.getPropertyValue('--Colors-Stroke-Stronger').trim();
  if (strong) return strong;
  return 'hsla(218, 28%, 34%, 0.82)';
}

function applyGeometryGridStroke(ctx) {
  ctx.strokeStyle = getGeometryGridStrokeStyle();
  ctx.lineWidth = GEOMETRY_GRID_LINE_WIDTH;
}

function getGeometryShapeFillStyle() {
  const fill = getComputedStyle(document.documentElement).getPropertyValue('--geometry-shape-fill').trim();
  return fill || '#dbeafe';
}

const PRISM_FACE_FILL_VARS = {
  kMin: '--geometry-prism-face-fill-bottom',
  kMax: '--geometry-prism-face-fill-top',
  jMin: '--geometry-prism-face-fill-front',
  jMax: '--geometry-prism-face-fill-back',
  iMax: '--geometry-prism-face-fill-right',
  iMin: '--geometry-prism-face-fill-left',
};

function getPrismFaceFillStyle(gridKey) {
  const varName = PRISM_FACE_FILL_VARS[gridKey];
  if (varName) {
    const fill = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (fill) return fill;
  }
  return getGeometryShapeFillStyle();
}

function prism3DPoint(L, W, H, i, j, k) {
  return {
    x: -L / 2 + i,
    y: -H / 2 + k,
    z: -W / 2 + j,
  };
}

function rotateProject3D(x, y, z, yaw, pitch) {
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const cosX = Math.cos(pitch);
  const sinX = Math.sin(pitch);
  const x1 = x * cosY + z * sinY;
  const z1 = -x * sinY + z * cosY;
  const y2 = y * cosX - z1 * sinX;
  const z2 = y * sinX + z1 * cosX;
  return { x: x1, y: y2, depth: z2 };
}

function isProjectedFaceVisible(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    area += (p1.x - p0.x) * (p1.y + p0.y);
  }
  return area < 0;
}

function buildPrismProjection(L, W, H, yaw, pitch, w, h, margin = 52) {
  const samplePoints = [];
  [0, L].forEach((i) => {
    [0, W].forEach((j) => {
      [0, H].forEach((k) => {
        const p3 = prism3DPoint(L, W, H, i, j, k);
        samplePoints.push(rotateProject3D(p3.x, p3.y, p3.z, yaw, pitch));
      });
    });
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  samplePoints.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });

  const rawW = Math.max(maxX - minX, 1e-6);
  const rawH = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((w - margin * 2) / rawW, (h - margin * 2) / rawH) * 0.9;
  const cx = w / 2 - ((minX + maxX) / 2) * scale;
  const cy = h / 2 + ((minY + maxY) / 2) * scale;

  const project = (i, j, k) => {
    const p3 = prism3DPoint(L, W, H, i, j, k);
    const rotated = rotateProject3D(p3.x, p3.y, p3.z, yaw, pitch);
    return {
      x: cx + rotated.x * scale,
      y: cy - rotated.y * scale,
      depth: rotated.depth,
    };
  };

  const verts = [
    project(0, 0, 0),
    project(L, 0, 0),
    project(L, W, 0),
    project(0, W, 0),
    project(0, 0, H),
    project(L, 0, H),
    project(L, W, H),
    project(0, W, H),
  ];

  return { project, verts };
}

function drawPrismFaceGrid(ctx, L, W, H, project, gridKey) {
  const nL = Math.min(200, Math.max(0, Math.floor(L)));
  const nW = Math.min(200, Math.max(0, Math.floor(W)));
  const nH = Math.min(200, Math.max(0, Math.floor(H)));
  if (nL === 0 || nW === 0 || nH === 0) return;

  const line = (from, to) => {
    const p0 = project(...from);
    const p1 = project(...to);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  };

  if (gridKey === 'jMin') {
    for (let i = 1; i < nL; i += 1) line([i, 0, 0], [i, 0, nH]);
    for (let k = 1; k < nH; k += 1) line([0, 0, k], [nL, 0, k]);
  } else if (gridKey === 'jMax') {
    for (let i = 1; i < nL; i += 1) line([i, nW, 0], [i, nW, nH]);
    for (let k = 1; k < nH; k += 1) line([0, nW, k], [nL, nW, k]);
  } else if (gridKey === 'iMin') {
    for (let j = 1; j < nW; j += 1) line([0, j, 0], [0, j, nH]);
    for (let k = 1; k < nH; k += 1) line([0, 0, k], [0, nW, k]);
  } else if (gridKey === 'iMax') {
    for (let j = 1; j < nW; j += 1) line([nL, j, 0], [nL, j, nH]);
    for (let k = 1; k < nH; k += 1) line([nL, 0, k], [nL, nW, k]);
  } else if (gridKey === 'kMin') {
    for (let i = 1; i < nL; i += 1) line([i, 0, 0], [i, nW, 0]);
    for (let j = 1; j < nW; j += 1) line([0, j, 0], [nL, j, 0]);
  } else if (gridKey === 'kMax') {
    for (let i = 1; i < nL; i += 1) line([i, 0, nH], [i, nW, nH]);
    for (let j = 1; j < nW; j += 1) line([0, j, nH], [nL, j, nH]);
  }
}

function drawPrism(ctx, canvas, values, units, view3d) {
  const { w, h } = getLogicalCanvasSize(canvas);
  const { length: L, width: W, height: H } = values;
  const yaw = view3d?.yaw ?? VIEW3D_DEFAULT.yaw;
  const pitch = view3d?.pitch ?? VIEW3D_DEFAULT.pitch;
  const stroke = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Primary-Default') || '#2563eb';
  const strokeMuted = getComputedStyle(document.documentElement).getPropertyValue('--Colors-Stroke-Strong') || '#64748b';
  const { project, verts } = buildPrismProjection(L, W, H, yaw, pitch, w, h);

  const faces = PRISM_FACE_DEFS.map((face) => {
    const points = face.ids.map((id) => verts[id]);
    const avgDepth = points.reduce((sum, p) => sum + p.depth, 0) / points.length;
    return {
      ...face,
      points,
      visible: isProjectedFaceVisible(points),
      avgDepth,
    };
  });

  const visibleByFaceIndex = faces.map((face) => face.visible);
  const sortedFaces = [...faces].sort((a, b) => a.avgDepth - b.avgDepth);

  sortedFaces.forEach((face) => {
    if (!face.visible) return;
    ctx.fillStyle = getPrismFaceFillStyle(face.grid);
    ctx.beginPath();
    ctx.moveTo(face.points[0].x, face.points[0].y);
    for (let i = 1; i < face.points.length; i += 1) ctx.lineTo(face.points[i].x, face.points[i].y);
    ctx.closePath();
    ctx.fill();
  });

  applyGeometryGridStroke(ctx);
  sortedFaces.forEach((face) => {
    if (!face.visible) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(face.points[0].x, face.points[0].y);
    for (let i = 1; i < face.points.length; i += 1) ctx.lineTo(face.points[i].x, face.points[i].y);
    ctx.closePath();
    ctx.clip();
    drawPrismFaceGrid(ctx, L, W, H, project, face.grid);
    ctx.restore();
  });

  ctx.lineWidth = 2.25;
  PRISM_EDGES.forEach(([a, b], edgeIndex) => {
    const [faceA, faceB] = PRISM_EDGE_FACES[edgeIndex];
    const visible = visibleByFaceIndex[faceA] || visibleByFaceIndex[faceB];
    ctx.strokeStyle = visible ? stroke : strokeMuted;
    ctx.setLineDash(visible ? [] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(verts[a].x, verts[a].y);
    ctx.lineTo(verts[b].x, verts[b].y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  const labelColor =
    getComputedStyle(document.documentElement).getPropertyValue('--Colors-Text-Body-Default') || '#334155';
  ctx.fillStyle = labelColor.trim() || '#334155';
  ctx.font = '600 12px Work Sans, sans-serif';

  const labelDefs = [
    { text: `ℓ=${formatDimensionLabel(L, units)}`, from: [0, 0, 0], to: [L, 0, 0], dx: 0, dy: 12, align: 'center', baseline: 'top' },
    { text: `w=${formatDimensionLabel(W, units)}`, from: [L, 0, 0], to: [L, W, 0], dx: 10, dy: 4, align: 'left', baseline: 'middle' },
    { text: `h=${formatDimensionLabel(H, units)}`, from: [L, 0, 0], to: [L, 0, H], dx: 12, dy: 0, align: 'left', baseline: 'middle' },
  ];
  labelDefs.forEach((label) => {
    const p0 = project(...label.from);
    const p1 = project(...label.to);
    ctx.textAlign = label.align;
    ctx.textBaseline = label.baseline;
    ctx.fillText(label.text, (p0.x + p1.x) / 2 + label.dx, (p0.y + p1.y) / 2 + label.dy);
  });
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

function buildSnapshot(state, metrics) {
  return {
    version: 1,
    mode: state.mode,
    shape: getCurrentShapeKey(state),
    units: state.units,
    values: { ...state.values },
    metrics: { ...metrics },
  };
}

function draw2D(ctx, canvas, shapeKey, values, rangesByKey = {}, units = DEFAULT_UNITS) {
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
  ctx.fillStyle = getGeometryShapeFillStyle();
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

    applyGeometryGridStroke(ctx);
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
    ctx.fillText(`w = ${formatDimensionLabel(rw, units)}`, x0 + bw / 2 - 18, y0 - 10);
    ctx.fillText(`h = ${formatDimensionLabel(rh, units)}`, x0 + bw + 8, y0 + bh / 2);
  } else if (shapeKey === 'circle') {
    const r = values.radius;
    const rMax = rangesByKey.radius?.max ?? SHAPES_2D.circle.ranges.max;
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
    ctx.fillText(`r = ${formatDimensionLabel(r, units)}`, cx + rad * 0.38, cy - rad * 0.42);
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

    applyGeometryGridStroke(ctx);
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
    ctx.fillText(`a = ${formatDimensionLabel(a, units)}`, x0 + bx / 2 - 10, y0 + 18);
    ctx.fillText(`b = ${formatDimensionLabel(b, units)}`, x0 - 28, y0 - ay / 2);
  }
}

function draw3D(ctx, canvas, shapeKey, values, rangesByKey = {}, units = DEFAULT_UNITS, view3d = VIEW3D_DEFAULT) {
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
    drawPrism(ctx, canvas, values, units, view3d);
    return;
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
    ctx.fillText(`r=${formatDimensionLabel(r, units)}`, cx + rw / 2 + 6, cy);
    ctx.fillText(`h=${formatDimensionLabel(ht, units)}`, cx - rw / 2 - 28, cy);
  } else if (shapeKey === 'sphere') {
    const r = values.radius;
    const rMax = rangesByKey.radius?.max ?? SHAPES_3D.sphere.ranges.max;
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
    ctx.fillText(`r=${formatDimensionLabel(r, units)}`, cx + rad * 0.32, cy + rad * 0.52);
  }
}

async function initGeometryExplorer() {
  const canvas = document.getElementById('geometry-canvas');
  const modeMount = document.getElementById('geometry-mode');
  const shapeMount = document.getElementById('geometry-shape');
  const unitsMount = document.getElementById('geometry-units');
  const slidersRoot = document.getElementById('geometry-sliders');
  const metricsList = document.getElementById('geometry-metrics');
  const formulaEl = document.getElementById('geometry-formula-note');
  const canvasHint = document.getElementById('geometry-canvas-hint');
  if (!canvas || !modeMount || !shapeMount || !slidersRoot || !metricsList) return;

  const runtimeConfig = await loadRuntimeConfig();
  const ctx = canvas.getContext('2d');
  let sliders = [];
  let modeDropdown = null;
  let shapeDropdown = null;
  let unitsDropdown = null;
  let snapshotTimer = null;
  let state = normalizeInitialState(runtimeConfig);
  const view3d = { ...VIEW3D_DEFAULT };
  let viewDragActive = false;
  let viewDragLast = null;

  function getShapeDef() {
    return getShapeDefForState(state);
  }

  function readValuesFromSliders() {
    const def = getShapeDef();
    const rangesByKey = getSliderRanges();
    const out = {};
    def.keys.forEach((key, i) => {
      const raw = sliders[i]?.getValue?.() ?? state.values[key] ?? def.defaults[key];
      const snapped = snapSliderValue(raw, rangesByKey[key]);
      if (sliders[i] && sliders[i].getValue() !== snapped) {
        sliders[i].setValue(snapped, null, false);
      }
      out[key] = snapped;
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

  function setDropdownDisabled(dropdown, disabled) {
    if (!dropdown || !dropdown.toggle) return;
    dropdown.toggle.disabled = disabled;
    dropdown.container.classList.toggle('geometry-dropdown--disabled', disabled);
  }

  function applyUiConfig() {
    const ui = runtimeConfig.ui || {};
    const modeField = document.getElementById('geometry-mode-field');
    const shapeField = document.getElementById('geometry-shape-field');
    const shapeHeading = document.getElementById('geometry-shape-heading');
    const lockedMode = ui.lockedMode === true;
    const lockedShape = ui.lockedShape === true;

    if (modeField) {
      modeField.hidden = lockedMode;
    }
    setDropdownDisabled(modeDropdown, lockedMode);

    if (shapeField) {
      shapeField.hidden = lockedShape;
    }
    setDropdownDisabled(shapeDropdown, lockedShape);

    if (shapeHeading) {
      shapeHeading.hidden = lockedMode && lockedShape;
    }

    setDropdownDisabled(unitsDropdown, ui.lockedUnits === true);

    if (formulaEl) {
      formulaEl.hidden = ui.showFormulaHints === false;
    }
  }

  function buildUnitsDropdown() {
    if (!unitsMount) return;
    if (unitsDropdown) unitsDropdown.destroy();
    unitsDropdown = new Dropdown(unitsMount, {
      items: Object.entries(UNIT_SYSTEMS).map(([key, system]) => ({
        value: key,
        label: system.label,
      })),
      selectedValue: state.units,
      onSelect: (value) => {
        convertStateValuesToUnits(normalizeUnits(value));
        rebuildSliders();
        syncMetrics();
      },
    });
    unitsDropdown.toggle.setAttribute('aria-label', 'Choose measurement units');
  }

  function convertStateValuesToUnits(nextUnits) {
    const currentUnits = state.units;
    if (currentUnits === nextUnits) return;
    const def = getShapeDef();
    const targetRanges = getSliderRangesForUnits(nextUnits);
    const converted = {};
    def.keys.forEach((key) => {
      const ranges = targetRanges[key];
      const convertedValue = convertLength(state.values[key], currentUnits, nextUnits);
      const clamped = Math.min(ranges.max, Math.max(ranges.min, convertedValue));
      converted[key] = snapSliderValue(clamped, ranges);
    });
    state.values = converted;
    state.units = nextUnits;
  }

  function getSliderRangesForUnits(units) {
    return resolveSliderRanges(getShapeDef(), runtimeConfig.sliders, units);
  }

  function getSliderRanges() {
    return getSliderRangesForUnits(state.units);
  }

  function isPrismRotatable() {
    return state.mode === '3d' && getCurrentShapeKey(state) === 'prism';
  }

  function updateCanvasInteraction() {
    const rotatable = isPrismRotatable();
    canvas.classList.toggle('geometry-canvas--rotatable', rotatable);
    canvas.style.touchAction = rotatable ? 'none' : '';
    if (canvasHint) {
      canvasHint.hidden = !rotatable;
    }
  }

  function syncMetrics({ publish = true, immediate = false } = {}) {
    const def = getShapeDef();
    const rangesByKey = getSliderRanges();
    state.values = readValuesFromSliders();
    const computed = def.compute(state.values);
    const rows = def.metricRows(computed, state.units);
    const showHints = runtimeConfig.ui?.showFormulaHints !== false;
    metricsList.innerHTML = rows
      .map(
        (row) => `<li class="box emphasized non-interactive geometry-metric-row">
        <div class="geometry-metric-head">
          <span class="geometry-metric-name body-xxsmall">${row.name}</span>
          <span class="geometry-metric-value">
            <span class="geometry-metric-primary">${row.primary}</span>
            ${row.alternate ? `<span class="geometry-metric-alt">${row.alternate}</span>` : ''}
          </span>
        </div>
        ${showHints ? `<p class="geometry-metric-hint">${row.hint}</p>` : ''}
      </li>`,
      )
      .join('');

    if (formulaEl) {
      formulaEl.textContent = unitsNoteText(state.units, state.mode);
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

    updateCanvasInteraction();

    if (state.mode === '2d') {
      draw2D(ctx, canvas, state.shape2d, state.values, rangesByKey, state.units);
    } else {
      draw3D(ctx, canvas, state.shape3d, state.values, rangesByKey, state.units, view3d);
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
    const rangesByKey = getSliderRanges();
    const lockedSliders = runtimeConfig.ui?.lockedSliders === true;
    slidersRoot.classList.toggle('geometry-sliders--multi', def.keys.length >= 3);

    def.keys.forEach((key, index) => {
      const wrap = document.createElement('div');
      wrap.className = 'geometry-slider-block';
      const lab = document.createElement('span');
      lab.className = 'geometry-control-label body-xsmall';
      lab.textContent = paramLabelWithUnits(def.paramLabels[index], state.units);
      const mount = document.createElement('div');
      mount.id = `geom-slider-${key}`;
      wrap.appendChild(lab);
      wrap.appendChild(mount);
      slidersRoot.appendChild(wrap);

      const ranges = rangesByKey[key];
      const initial = snapSliderValue(state.values[key] ?? def.defaults[key], ranges);
      state.values[key] = initial;
      const slider = new NumericSlider(mount, {
        min: ranges.min,
        max: ranges.max,
        step: ranges.step,
        value: initial,
        showInputs: true,
        continuousUpdates: true,
        disabled: lockedSliders,
        onChange: () => syncMetrics(),
      });
      sliders.push(slider);
    });
  }

  function buildModeDropdown() {
    if (modeDropdown) modeDropdown.destroy();
    modeDropdown = new Dropdown(modeMount, {
      items: [
        { value: '2d', label: '2D — perimeter & area' },
        { value: '3d', label: '3D — surface area & volume' },
      ],
      selectedValue: state.mode,
      onSelect: (value) => {
        state.mode = value;
        buildShapeDropdown();
        applyModeShapeDefaults();
        rebuildSliders();
        syncMetrics();
      },
    });
    modeDropdown.toggle.setAttribute('aria-label', 'Choose flat or solid figures');
  }

  function buildShapeDropdown() {
    const catalog = getCatalog(state.mode);
    let currentKey = getCurrentShapeKey(state);
    const keys = Object.keys(catalog);
    if (!keys.includes(currentKey)) {
      currentKey = keys[0];
      if (state.mode === '2d') state.shape2d = currentKey;
      else state.shape3d = currentKey;
    }
    if (shapeDropdown) shapeDropdown.destroy();
    shapeDropdown = new Dropdown(shapeMount, {
      items: keys.map((key) => ({ value: key, label: catalog[key].label })),
      selectedValue: currentKey,
      onSelect: (value) => {
        if (state.mode === '2d') {
          state.shape2d = value;
        } else {
          state.shape3d = value;
        }
        applyModeShapeDefaults();
        rebuildSliders();
        syncMetrics();
      },
    });
    shapeDropdown.toggle.setAttribute('aria-label', 'Choose figure');
  }

  function applyModeShapeDefaults() {
    const def = getShapeDef();
    state.values = normalizeValues(def, def.defaults, getSliderRanges());
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!isPrismRotatable()) return;
    viewDragActive = true;
    viewDragLast = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('geometry-canvas--dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!viewDragActive || !viewDragLast) return;
    const dx = event.clientX - viewDragLast.x;
    const dy = event.clientY - viewDragLast.y;
    view3d.yaw += dx * VIEW3D_DRAG_SENSITIVITY;
    view3d.pitch += dy * VIEW3D_DRAG_SENSITIVITY;
    view3d.yaw = Math.min(VIEW3D_LIMITS.yawMax, Math.max(VIEW3D_LIMITS.yawMin, view3d.yaw));
    view3d.pitch = Math.min(VIEW3D_LIMITS.pitchMax, Math.max(VIEW3D_LIMITS.pitchMin, view3d.pitch));
    viewDragLast = { x: event.clientX, y: event.clientY };
    syncMetrics({ publish: false });
  });

  function endViewDrag(event) {
    if (!viewDragActive) return;
    viewDragActive = false;
    viewDragLast = null;
    canvas.classList.remove('geometry-canvas--dragging');
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener('pointerup', endViewDrag);
  canvas.addEventListener('pointercancel', endViewDrag);

  const frameEl = canvas.parentElement;
  const ro = new ResizeObserver(() => {
    syncMetrics({ publish: false });
  });
  if (frameEl) {
    ro.observe(frameEl);
  }

  buildModeDropdown();
  buildUnitsDropdown();
  buildShapeDropdown();
  applyUiConfig();
  rebuildSliders();
  syncMetrics({ immediate: true });
}

export { initGeometryExplorer };

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGeometryExplorer);
} else {
  initGeometryExplorer();
}
