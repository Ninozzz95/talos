/**
 * TALOS Desktop — runtime dello sfondo Canvas.
 *
 * Contratto: non possiede il layout della Chat. Monta un solo canvas decorativo
 * dentro #schermoChat e una piccola anteprima nella pagina Aspetto. Le classi,
 * i dataset e i token già prodotti da legacy/app.js restano la fonte di verità.
 * ⛔ 11/09 sera: la scena si muove ANCHE con i messaggi (decisione dell'owner, vedi `stageShouldAnimate`).
 */
import { TALOS_DESKTOP_SCENES } from './desktop-scenes.js';

const SCENES = new Map(TALOS_DESKTOP_SCENES.map((scene) => [scene.id, scene]));
const DEFAULT_SCENE = 'calm';
const TARGET_FPS = 30;
const MAX_PIXELS = 2_600_000;
const MAX_DPR = 1.5;
const SLOW_FRAME_MS = 18;
const SLOW_FRAME_LIMIT = 12;
const SEED = 730913;

const stages = new Set();
let raf = 0;
let lastFrame = 0;
let mutationObserver = null;
let rootObserver = null;
let mediaQuery = null;
let destroyed = false;
let colorProbe = null;
let metrics = { frames: 0, p95: 0, errors: [], costs: [] };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const cssNumber = (style, name, fallback, multiplier = 1) => {
  const raw = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(raw) ? raw * multiplier : fallback;
};

function reducedMotion() {
  return document.documentElement.classList.contains('reduce-motion')
    || document.body?.classList.contains('reduce-motion')
    || Boolean(mediaQuery?.matches);
}

function resolveColor(raw, fallback = '#888888') {
  if (!colorProbe) {
    colorProbe = document.createElement('span');
    colorProbe.setAttribute('aria-hidden', 'true');
    colorProbe.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;';
    document.body.append(colorProbe);
  }
  colorProbe.style.color = '';
  colorProbe.style.color = raw || fallback;
  return getComputedStyle(colorProbe).color || fallback;
}

function palette() {
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = document.body ? getComputedStyle(document.body) : rootStyle;
  const read = (name, fallback) => {
    const value = rootStyle.getPropertyValue(name).trim() || bodyStyle.getPropertyValue(name).trim();
    return resolveColor(value, fallback);
  };
  return {
    accent: read('--talos-accent', '#c08b3c'),
    secondary: read('--talos-secondary', '#8e9095'),
    border_strong: read('--talos-border-strong', '#4a4b50'),
    surface_elevated: read('--talos-window-bg', '#34353a'),
    background: read('--talos-background', '#1e1f22'),
    focus: read('--talos-ring', '#d8a650'),
    info: read('--talos-info', '#7f9fc4'),
    success: read('--talos-success', '#77a884'),
    warning: read('--talos-warning', '#d8a650'),
    danger: read('--talos-danger', '#d87d72'),
  };
}

function currentConfig() {
  const root = document.documentElement;
  const host = document.body;
  const style = getComputedStyle(root);
  const theme = root.dataset.talosTheme || 'calm';
  const scene = SCENES.has(root.dataset.talosScene) ? root.dataset.talosScene : (SCENES.has(theme) ? theme : DEFAULT_SCENE);
  const mode = root.dataset.talosMotionMode || 'adaptive';
  const quality = root.dataset.talosMotionQuality || 'balanced';
  const off = mode === 'off' || host?.classList.contains('background-motion-off');
  const running = !off && host?.classList.contains('background-motion-active') && !host?.classList.contains('background-motion-paused');
  const params = {
    speed: clamp(cssNumber(style, '--talos-motion-speed', 1, 100), 10, 240),
    intensity: clamp(cssNumber(style, '--talos-motion-intensity', .2, 100), 0, 100),
    glow: clamp(cssNumber(style, '--talos-motion-glow', .1, 100), 0, 100),
    density: clamp(cssNumber(style, '--talos-motion-density', 1, 100), 25, 150),
    depth: clamp(cssNumber(style, '--talos-motion-depth', .92, 100), 0, 100),
    trails: clamp(cssNumber(style, '--talos-motion-trails', .5, 100), 0, 100),
    contrast: clamp(cssNumber(style, '--talos-motion-contrast', .8, 100), 0, 100),
    parallax: clamp(cssNumber(style, '--talos-motion-parallax', 0, 100), 0, 100),
  };
  return { scene, theme, mode, quality, off, running, parameters: params };
}

function tierFor(config, stage) {
  if (stage.forcedLow || config.mode === 'simple' || config.quality === 'low') return 'low';
  if (config.quality === 'high') return 'high';
  return 'balanced';
}

function makeInput(stage, config) {
  const p = palette();
  return {
    viewport: { width: stage.width, height: stage.height },
    palette: { dark: p, light: p },
    colorMode: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
    parameters: config.parameters,
    effectiveQuality: {
      tier: tierFor(config, stage),
      densityScale: tierFor(config, stage) === 'low' ? .8 : 1,
    },
  };
}

function chatHasMessages() {
  const column = document.querySelector('#schermoChat .talos-conversation__column');
  if (!column) return false;
  return Boolean(column.querySelector('.talos-turn, [data-c="Turn"], .message, [data-message-id]'));
}

function stageVisible(stage) {
  if (document.hidden || !stage.canvas.isConnected) return false;
  const rect = stage.canvas.getBoundingClientRect();
  return rect.width > 1 && rect.height > 1 && !stage.canvas.closest('[hidden]');
}

function stageShouldAnimate(stage, config) {
  if (!stageVisible(stage) || config.off || reducedMotion() || stage.manualPaused || stage.budgetStatic) return false;
  if (stage.preview) return config.mode !== 'off' && config.mode !== 'static';
  /*
   * ⛔ 11/09/2026, sera — QUI C'ERA `if (chatHasMessages()) return false;`: il pacchetto fermava la
   *   scena appena la conversazione aveva un messaggio (README: «thread visibile: la scena
   *   principale diventa statica»). Misurato sul 4174 prima di toccare: `sceneStatus` = `static`
   *   con 4 messaggi, GPU accesa o spenta. L'owner, in plan mode, ha deciso l'opposto: «si muove
   *   sempre, anche dietro i messaggi» — ha riattivato l'accelerazione hardware nel suo Chrome, e il
   *   costo che giustificava la regola non c'è più. Il budget automatico (`SLOW_FRAME_LIMIT`, sotto)
   *   resta: se i frame diventano lenti la scena si ferma da sola, e quello è una protezione, non
   *   una scelta estetica. `chatHasMessages` resta definita per chi vorrà rimettere la regola come
   *   opzione: qui non decide più niente.
   */
  return config.running && config.mode !== 'static';
}

function recordCost(cost) {
  metrics.costs.push(cost);
  if (metrics.costs.length > 120) metrics.costs.shift();
  const sorted = [...metrics.costs].sort((a, b) => a - b);
  metrics.p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] : 0;
}

function draw(stage, dt, config) {
  if (config.off) {
    stage.context.clearRect(0, 0, stage.width, stage.height);
    stage.canvas.dataset.sceneStatus = 'off';
    return;
  }
  const start = performance.now();
  try {
    if (dt > 0) stage.definition.update({ state: stage.state, input: stage.input, stepMs: dt });
    stage.context.setTransform(stage.dpr, 0, 0, stage.dpr, 0, 0);
    stage.definition.draw({ context: stage.context, state: stage.state, geometry: stage.geometry });
    stage.draws += 1;
    stage.canvas.dataset.scene = stage.scene;
    stage.canvas.dataset.sceneStatus = stage.budgetStatic ? 'budget-static' : reducedMotion() ? 'reduced' : stageShouldAnimate(stage, config) ? 'animating' : 'static';
  } catch (error) {
    const message = String(error?.message || error);
    if (!metrics.errors.includes(message)) metrics.errors.push(message);
    stage.budgetStatic = true;
    stage.canvas.dataset.sceneStatus = 'error';
    stage.context.clearRect(0, 0, stage.width, stage.height);
    return;
  }
  const cost = performance.now() - start;
  stage.lastCost = cost;
  if (dt > 0) {
    metrics.frames += 1;
    recordCost(cost);
    stage.slowCount = cost > SLOW_FRAME_MS ? stage.slowCount + 1 : Math.max(0, stage.slowCount - 1);
    if (stage.slowCount >= SLOW_FRAME_LIMIT) {
      if (!stage.forcedLow) {
        stage.forcedLow = true;
        stage.slowCount = 0;
        prepare(stage, true);
      } else {
        stage.budgetStatic = true;
        stage.canvas.dataset.sceneStatus = 'budget-static';
      }
    }
  }
}

function prepare(stage, reset = false) {
  if (!stage.canvas.isConnected) return;
  const rect = stage.parent.getBoundingClientRect();
  stage.width = Math.max(1, rect.width);
  stage.height = Math.max(1, rect.height);
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR, Math.sqrt(MAX_PIXELS / Math.max(1, stage.width * stage.height)));
  dpr = Math.max(.5, dpr);
  const pixelWidth = Math.max(1, Math.round(stage.width * dpr));
  const pixelHeight = Math.max(1, Math.round(stage.height * dpr));
  if (stage.canvas.width !== pixelWidth) stage.canvas.width = pixelWidth;
  if (stage.canvas.height !== pixelHeight) stage.canvas.height = pixelHeight;
  stage.dpr = dpr;
  const config = currentConfig();
  const definition = SCENES.get(config.scene) || SCENES.get(DEFAULT_SCENE);
  const changed = stage.definition !== definition || stage.scene !== definition.id;
  stage.definition = definition;
  stage.scene = definition.id;
  if (reset || changed || !stage.state) {
    stage.state = definition.createState(SEED);
    stage.slowCount = 0;
    stage.budgetStatic = false;
  }
  stage.input = makeInput(stage, config);
  stage.geometry = definition.prepare({ state: stage.state, input: stage.input }).geometry;
  stage.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw(stage, 0, config);
}

function frame(now) {
  raf = 0;
  if (destroyed) return;
  const config = currentConfig();
  const active = [...stages].filter((stage) => stageShouldAnimate(stage, config));
  if (!active.length) { lastFrame = 0; return; }
  const elapsed = lastFrame ? now - lastFrame : 1000 / TARGET_FPS;
  if (elapsed >= 1000 / TARGET_FPS - 1) {
    lastFrame = now;
    for (const stage of active) draw(stage, Math.min(50, elapsed), config);
  }
  raf = requestAnimationFrame(frame);
}

function schedule() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  lastFrame = 0;
  if (!destroyed && [...stages].some((stage) => stageShouldAnimate(stage, currentConfig()))) raf = requestAnimationFrame(frame);
}

function refreshAll({ reset = false } = {}) {
  for (const stage of stages) prepare(stage, reset);
  schedule();
}

function mountStage(parent, { preview = false } = {}) {
  if (!parent || parent.querySelector(':scope > canvas.talos-motion-canvas')) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'talos-motion-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.tabIndex = -1;
  parent.prepend(canvas);
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
  if (!context) { canvas.remove(); return null; }
  const stage = { parent, canvas, context, preview, state: null, definition: null, scene: '', width: 1, height: 1, dpr: 1, draws: 0, lastCost: 0, slowCount: 0, forcedLow: false, budgetStatic: false, manualPaused: false };
  stages.add(stage);
  const resize = new ResizeObserver(() => requestAnimationFrame(() => { if (stages.has(stage)) prepare(stage, false); }));
  resize.observe(parent);
  stage.dispose = () => { resize.disconnect(); stages.delete(stage); canvas.remove(); schedule(); };
  prepare(stage, true);
  return stage;
}

function installPreview() {
  const appearance = document.querySelector('#setting-panel-appearance [data-settings-group="design"]');
  if (!appearance || appearance.querySelector('[data-talos-motion-preview]')) return;
  const panel = document.createElement('section');
  panel.className = 'talos-motion-preview';
  panel.dataset.talosMotionPreview = 'true';
  panel.innerHTML = '<div class="talos-motion-preview__copy"><span class="talos-eyebrow">Scena del tema</span><strong data-motion-preview-name></strong><small>Anteprima dal renderer Canvas del pacchetto. Si muove anche dietro i messaggi, finché è accesa.</small></div><div class="talos-motion-preview__stage" aria-hidden="true"></div><span class="talos-motion-preview__status" data-motion-preview-status></span>';
  const themeRow = appearance.querySelector('[data-setting-row="sceneOverrideSelect"]') || appearance.querySelector('[data-setting-row="themePresetSelect"]');
  if (themeRow) themeRow.insertAdjacentElement('afterend', panel); else appearance.prepend(panel);
  const stage = mountStage(panel.querySelector('.talos-motion-preview__stage'), { preview: true });
  const updateLabel = () => {
    const config = currentConfig();
    panel.querySelector('[data-motion-preview-name]').textContent = config.scene[0].toUpperCase() + config.scene.slice(1);
    panel.querySelector('[data-motion-preview-status]').textContent = stage?.canvas.dataset.sceneStatus || 'non disponibile';
  };
  updateLabel();
  const interval = window.setInterval(updateLabel, 650);
  panel._talosDispose = () => window.clearInterval(interval);
}

function reviewFrame(id, width = 640, height = 360, atSeconds = 0, overrides = {}) {
  const definition = SCENES.get(id);
  if (!definition) throw new Error(`Scena sconosciuta: ${id}`);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  const config = currentConfig();
  const stage = { width, height, forcedLow: true };
  const input = makeInput(stage, { ...config, scene: id, parameters: { ...config.parameters, ...overrides } });
  const state = definition.createState(SEED);
  const geometry = definition.prepare({ state, input }).geometry;
  for (let i = 0; i < Math.round(atSeconds * 20); i += 1) definition.update({ state, input, stepMs: 50 });
  definition.draw({ context, state, geometry });
  const pixels = context.getImageData(0, 0, width, height).data;
  let nonzero = 0; let hash = 2166136261;
  for (let p = 0; p < pixels.length; p += 4) {
    if (pixels[p + 3]) nonzero += 1;
    hash = Math.imul(hash ^ pixels[p], 16777619);
    hash = Math.imul(hash ^ pixels[p + 1], 16777619);
    hash = Math.imul(hash ^ pixels[p + 2], 16777619);
    hash = Math.imul(hash ^ pixels[p + 3], 16777619);
  }
  return { id, nonzero, hash: hash >>> 0 };
}

export function initTalosDesktopBackground() {
  if (window.__talosDesktopMotion?.initialized) return window.__talosDesktopMotion;
  const chat = document.getElementById('schermoChat');
  if (!chat) return null;
  chat.dataset.talosCanvasMotion = 'true';
  document.documentElement.classList.add('talos-final-ui');
  const mainStage = mountStage(chat, { preview: false });
  /* ⛔ 12/09, owner: la riga «Scena del tema» delle Impostazioni (installPreview) NON si monta più.
     Da BC-33 lo studio «Temi e atmosfere» mostra la stessa scena DAL VIVO, con i cursori accanto: due
     anteprime dello stesso sfondo in due posti erano una doppia risposta, e questa restava vuota con
     lo sfondo spento. La funzione resta (il laboratorio e i test la conoscono), ma nessuno la chiama. */

  const watchTarget = document.documentElement;
  rootObserver = new MutationObserver((records) => {
    const relevant = records.some((record) => record.type === 'attributes' || record.type === 'childList');
    if (!relevant) return;
    refreshAll({ reset: records.some((record) => record.attributeName?.startsWith('data-talos') || record.attributeName === 'data-theme') });
  });
  rootObserver.observe(watchTarget, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-talos-theme', 'data-talos-scene', 'data-talos-motion-mode', 'data-talos-motion-quality', 'style'] });
  if (document.body) rootObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  const conversation = chat.querySelector('.talos-conversation__column');
  if (conversation) {
    mutationObserver = new MutationObserver(() => refreshAll({ reset: false }));
    mutationObserver.observe(conversation, { childList: true, subtree: false });
  }
  mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const mediaHandler = () => refreshAll({ reset: false });
  mediaQuery.addEventListener?.('change', mediaHandler);
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pageshow', schedule);
  window.addEventListener('pagehide', () => { if (raf) cancelAnimationFrame(raf); raf = 0; });

  const api = Object.freeze({
    initialized: true,
    ids: [...SCENES.keys()],
    refresh: () => refreshAll({ reset: true }),
    reviewFrame,
    status: () => ({
      scene: currentConfig().scene,
      running: Boolean(raf),
      reduced: reducedMotion(),
      chatHasMessages: chatHasMessages(),
      stages: [...stages].map((stage) => ({ preview: stage.preview, scene: stage.scene, status: stage.canvas.dataset.sceneStatus, draws: stage.draws, cost: Math.round(stage.lastCost * 100) / 100, tier: tierFor(currentConfig(), stage) })),
      frames: metrics.frames,
      p95: Math.round(metrics.p95 * 100) / 100,
      errors: [...metrics.errors],
    }),
    destroy: () => {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      rootObserver?.disconnect(); mutationObserver?.disconnect();
      for (const stage of [...stages]) stage.dispose?.();
      document.querySelector('[data-talos-motion-preview]')?._talosDispose?.();
      document.querySelector('[data-talos-motion-preview]')?.remove();
      chat.removeAttribute('data-talos-canvas-motion');
    },
  });
  window.__talosDesktopMotion = api;
  schedule();
  return api;
}
