import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const BASE_URL = process.env.TALOS_LAG_URL || 'http://127.0.0.1:4174/';
const ARTIFACTS = resolve(process.cwd(), 'artifacts', 'lag-interaction-2026-09-02');
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'blink.user_timing',
  'cc',
  'renderer.scheduler',
].join(',');

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * ratio))];
};

const metricMap = (payload) => Object.fromEntries(payload.metrics.map(({ name, value }) => [name, value]));

const metricDelta = (before, after) => Object.fromEntries([
  'TaskDuration',
  'ScriptDuration',
  'LayoutDuration',
  'RecalcStyleDuration',
  'JSHeapUsedSize',
  'Nodes',
  'JSEventListeners',
].map((name) => [name, (after[name] || 0) - (before[name] || 0)]));

async function readTrace(cdp, stream) {
  let data = '';
  for (;;) {
    const chunk = await cdp.send('IO.read', { handle: stream, size: 1_048_576 });
    data += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  return JSON.parse(data).traceEvents || [];
}

function summarizeTrace(events) {
  const totals = new Map();
  for (const event of events) {
    if (event.ph !== 'X' || !Number.isFinite(event.dur) || event.dur <= 0) continue;
    const current = totals.get(event.name) || { count: 0, totalMs: 0, maxMs: 0 };
    const durationMs = event.dur / 1000;
    current.count += 1;
    current.totalMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    totals.set(event.name, current);
  }
  return [...totals.entries()]
    .map(([name, values]) => ({ name, ...values, totalMs: Number(values.totalMs.toFixed(3)), maxMs: Number(values.maxMs.toFixed(3)) }))
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 35);
}

async function installProbe(page) {
  await page.addInitScript(() => {
    window.__talosLagProbe = {
      frames: [],
      longTasks: [],
      loafs: [],
      events: [],
      mutations: 0,
      running: false,
      observers: [],
      mutationObserver: null,
    };
    for (const [type, options] of [
      ['longtask', { type: 'longtask', buffered: false }],
      ['long-animation-frame', { type: 'long-animation-frame', buffered: false }],
      ['event', { type: 'event', buffered: false, durationThreshold: 16 }],
    ]) {
      try {
        const observer = new PerformanceObserver((list) => {
          const target = type === 'longtask' ? 'longTasks' : type === 'long-animation-frame' ? 'loafs' : 'events';
          for (const entry of list.getEntries()) {
            window.__talosLagProbe[target].push({
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
              blockingDuration: entry.blockingDuration || 0,
              scripts: Array.from(entry.scripts || []).map((script) => ({
                sourceURL: script.sourceURL || '',
                sourceFunctionName: script.sourceFunctionName || '',
                duration: script.duration || 0,
                forcedStyleAndLayoutDuration: script.forcedStyleAndLayoutDuration || 0,
                pauseDuration: script.pauseDuration || 0,
              })),
            });
          }
        });
        observer.observe(options);
        window.__talosLagProbe.observers.push(observer);
      } catch {}
    }
  });
}

async function startFrameProbe(page) {
  await page.evaluate(() => {
    const probe = window.__talosLagProbe;
    probe.frames = [];
    probe.longTasks = [];
    probe.loafs = [];
    probe.events = [];
    probe.mutations = 0;
    probe.running = true;
    probe.mutationObserver?.disconnect();
    probe.mutationObserver = new MutationObserver((records) => { probe.mutations += records.length; });
    probe.mutationObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    let previous = performance.now();
    const tick = (now) => {
      if (!probe.running) return;
      probe.frames.push(now - previous);
      previous = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopFrameProbe(page) {
  return page.evaluate(() => {
    const probe = window.__talosLagProbe;
    probe.running = false;
    probe.mutationObserver?.disconnect();
    return {
      frames: [...probe.frames],
      longTasks: [...probe.longTasks],
      loafs: [...probe.loafs],
      events: [...probe.events],
      mutations: probe.mutations,
      dom: {
        nodes: document.getElementsByTagName('*').length,
        sessionsCollapsed: document.querySelector('#app')?.classList.contains('sessions-collapsed') || false,
        inspectorCollapsed: document.querySelector('#app')?.classList.contains('inspector-collapsed') || false,
        dialog: document.querySelector('dialog[open]')?.id || null,
      },
    };
  });
}

async function scrollWithWheel(page, selector, { cycles = 18, distance = 260 } = {}) {
  const locator = page.locator(selector).first();
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Nessun box visibile per ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height - 8, box.height / 2));
  await locator.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  for (let index = 0; index < cycles; index += 1) {
    await page.mouse.wheel(0, -distance);
    await page.waitForTimeout(18);
  }
  for (let index = 0; index < cycles; index += 1) {
    await page.mouse.wheel(0, distance);
    await page.waitForTimeout(18);
  }
  return locator.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
  }));
}

async function prepareChat(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.waitForTimeout(1200);
  const firstSession = page.locator('.session-item[data-real-session-id]').first();
  if (await firstSession.count()) {
    await firstSession.click();
    await page.waitForFunction(() => {
      const conversation = document.querySelector('#conversation');
      return conversation && conversation.scrollHeight > conversation.clientHeight;
    }, null, { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(350);
  }
}

async function disableBackdropFilters(page) {
  await page.evaluate(() => {
    const visit = (rules) => {
      for (const rule of Array.from(rules || [])) {
        if (rule.cssRules) visit(rule.cssRules);
        if (!rule.style) continue;
        if (rule.style.backdropFilter) rule.style.setProperty('backdrop-filter', 'none', 'important');
        if (rule.style.willChange.includes('backdrop-filter')) rule.style.setProperty('will-change', 'auto', 'important');
      }
    };
    for (const sheet of Array.from(document.styleSheets)) visit(sheet.cssRules);
  });
}

async function disableBackgroundMotion(page) {
  await page.evaluate(() => {
    document.documentElement.classList.remove('background-motion-active');
    document.documentElement.classList.add('background-motion-off');
  });
}

async function disableOrbFilter(page) {
  await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (rule.selectorText === '.scene-orb') rule.style.setProperty('filter', 'none', 'important');
      }
    }
  });
}

async function collectScenario(browser, definition) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await installProbe(page);
  await prepareChat(page);
  await definition.prepare?.(page);
  await page.waitForTimeout(350);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const before = metricMap(await cdp.send('Performance.getMetrics'));
  let traceComplete;
  const completed = new Promise((resolveComplete) => { traceComplete = resolveComplete; });
  cdp.once('Tracing.tracingComplete', traceComplete);
  await cdp.send('Tracing.start', { categories: TRACE_CATEGORIES, transferMode: 'ReturnAsStream' });
  await startFrameProbe(page);
  const startedAt = Date.now();
  const action = await definition.action(page);
  await page.waitForTimeout(350);
  const elapsedMs = Date.now() - startedAt;
  const probe = await stopFrameProbe(page);
  await cdp.send('Tracing.end');
  const { stream } = await completed;
  const traceEvents = await readTrace(cdp, stream);
  const after = metricMap(await cdp.send('Performance.getMetrics'));
  const frameValues = probe.frames.filter((value) => value > 0 && value < 2000);
  const result = {
    scenario: definition.name,
    elapsedMs,
    action,
    dom: probe.dom,
    mutations: probe.mutations,
    frames: {
      count: frameValues.length,
      medianMs: Number(percentile(frameValues, 0.5).toFixed(3)),
      p95Ms: Number(percentile(frameValues, 0.95).toFixed(3)),
      p99Ms: Number(percentile(frameValues, 0.99).toFixed(3)),
      maxMs: Number(Math.max(0, ...frameValues).toFixed(3)),
      over16: frameValues.filter((value) => value > 16.7).length,
      over33: frameValues.filter((value) => value > 33.4).length,
      over50: frameValues.filter((value) => value > 50).length,
    },
    longTasks: probe.longTasks,
    loafs: probe.loafs,
    events: probe.events,
    performance: metricDelta(before, after),
    traceTop: summarizeTrace(traceEvents),
  };
  await page.screenshot({ path: resolve(ARTIFACTS, `${definition.name}.png`), fullPage: false });
  await context.close();
  return result;
}

await mkdir(ARTIFACTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
const scenarios = [
  {
    name: 'CHAT-SIDEBARS-OPEN',
    prepare: async (page) => {
      const shell = page.locator('#app');
      if (await shell.evaluate((element) => element.classList.contains('sessions-collapsed'))) await page.locator('#sessionsCollapseBtn').click();
      if (await shell.evaluate((element) => element.classList.contains('inspector-collapsed'))) await page.locator('.desktop-context-toggle').click();
    },
    action: (page) => scrollWithWheel(page, '#conversation'),
  },
  {
    name: 'CHAT-SIDEBARS-COLLAPSED',
    prepare: async (page) => {
      const shell = page.locator('#app');
      if (!await shell.evaluate((element) => element.classList.contains('sessions-collapsed'))) await page.locator('#sessionsCollapseBtn').click();
      if (!await shell.evaluate((element) => element.classList.contains('inspector-collapsed'))) await page.locator('.desktop-context-toggle').click();
      await page.waitForTimeout(250);
    },
    action: (page) => scrollWithWheel(page, '#conversation'),
  },
  {
    name: 'NEW-SESSION-SCROLL',
    prepare: async (page) => {
      await page.locator('#newSessionBtn').click();
      await page.locator('#sheetDialog[open]').waitFor({ state: 'visible' });
      await page.locator('.workspace-chooser-settings').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
    },
    action: (page) => scrollWithWheel(page, '.workspace-chooser-settings', { cycles: 20, distance: 220 }),
  },
  {
    name: 'NEW-SESSION-NO-BLUR',
    prepare: async (page) => {
      await disableBackdropFilters(page);
      await page.locator('#newSessionBtn').click();
      await page.locator('#sheetDialog[open]').waitFor({ state: 'visible' });
      await page.locator('.workspace-chooser-settings').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
    },
    action: (page) => scrollWithWheel(page, '.workspace-chooser-settings', { cycles: 20, distance: 220 }),
  },
  {
    name: 'NEW-SESSION-NO-MOTION',
    prepare: async (page) => {
      await disableBackgroundMotion(page);
      await page.locator('#newSessionBtn').click();
      await page.locator('#sheetDialog[open]').waitFor({ state: 'visible' });
      await page.locator('.workspace-chooser-settings').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
    },
    action: (page) => scrollWithWheel(page, '.workspace-chooser-settings', { cycles: 20, distance: 220 }),
  },
  {
    name: 'NEW-SESSION-NO-ORB-FILTER',
    prepare: async (page) => {
      await disableOrbFilter(page);
      await page.locator('#newSessionBtn').click();
      await page.locator('#sheetDialog[open]').waitFor({ state: 'visible' });
      await page.locator('.workspace-chooser-settings').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
    },
    action: (page) => scrollWithWheel(page, '.workspace-chooser-settings', { cycles: 20, distance: 220 }),
  },
  {
    name: 'NEW-SESSION-NO-BLUR-NO-ORB-FILTER',
    prepare: async (page) => {
      await disableBackdropFilters(page);
      await disableOrbFilter(page);
      await page.locator('#newSessionBtn').click();
      await page.locator('#sheetDialog[open]').waitFor({ state: 'visible' });
      await page.locator('.workspace-chooser-settings').waitFor({ state: 'visible' });
      await page.waitForTimeout(250);
    },
    action: (page) => scrollWithWheel(page, '.workspace-chooser-settings', { cycles: 20, distance: 220 }),
  },
  {
    name: 'CHAT-SIDEBARS-OPEN-NO-BLUR',
    prepare: async (page) => {
      await disableBackdropFilters(page);
      const shell = page.locator('#app');
      if (await shell.evaluate((element) => element.classList.contains('sessions-collapsed'))) await page.locator('#sessionsCollapseBtn').click();
      if (await shell.evaluate((element) => element.classList.contains('inspector-collapsed'))) await page.locator('.desktop-context-toggle').click();
    },
    action: (page) => scrollWithWheel(page, '#conversation'),
  },
  {
    name: 'CHAT-SIDEBARS-OPEN-NO-MOTION',
    prepare: async (page) => {
      await disableBackgroundMotion(page);
      const shell = page.locator('#app');
      if (await shell.evaluate((element) => element.classList.contains('sessions-collapsed'))) await page.locator('#sessionsCollapseBtn').click();
      if (await shell.evaluate((element) => element.classList.contains('inspector-collapsed'))) await page.locator('.desktop-context-toggle').click();
    },
    action: (page) => scrollWithWheel(page, '#conversation'),
  },
  {
    name: 'COMMAND-PALETTE-SCROLL',
    prepare: async (page) => {
      await page.locator('#commandPaletteBtn').click();
      await page.locator('#commandDialog[open]').waitFor({ state: 'visible' });
      await page.locator('#commandSearch').fill('');
      await page.waitForTimeout(250);
    },
    action: async (page) => {
      const typingStarted = Date.now();
      await page.locator('#commandSearch').pressSequentially('sessione', { delay: 22 });
      const typingMs = Date.now() - typingStarted;
      await page.locator('#commandSearch').fill('');
      const scroll = await scrollWithWheel(page, '#commandResults', { cycles: 14, distance: 180 });
      return { typingMs, ...scroll };
    },
  },
  {
    name: 'COMMAND-PALETTE-NO-MOTION',
    prepare: async (page) => {
      await disableBackgroundMotion(page);
      await page.locator('#commandPaletteBtn').click();
      await page.locator('#commandDialog[open]').waitFor({ state: 'visible' });
      await page.locator('#commandSearch').fill('');
      await page.waitForTimeout(250);
    },
    action: async (page) => {
      const typingStarted = Date.now();
      await page.locator('#commandSearch').pressSequentially('sessione', { delay: 22 });
      const typingMs = Date.now() - typingStarted;
      await page.locator('#commandSearch').fill('');
      const scroll = await scrollWithWheel(page, '#commandResults', { cycles: 14, distance: 180 });
      return { typingMs, ...scroll };
    },
  },
];

const results = [];
try {
  const requested = new Set((process.env.TALOS_LAG_SCENARIOS || '').split(',').filter(Boolean));
  for (const scenario of scenarios) {
    if (!requested.size || requested.has(scenario.name)) results.push(await collectScenario(browser, scenario));
  }
} finally {
  await browser.close();
}

const reportPath = resolve(ARTIFACTS, 'interaction-lag-report.json');
await writeFile(reportPath, `${JSON.stringify({ capturedAt: new Date().toISOString(), baseUrl: BASE_URL, results }, null, 2)}\n`, 'utf8');
for (const result of results) {
  process.stdout.write(`${result.scenario}: p95=${result.frames.p95Ms}ms max=${result.frames.maxMs}ms task=${result.performance.TaskDuration.toFixed(4)}s paint=${result.traceTop.find((entry) => entry.name === 'Paint')?.totalMs || 0}ms\n`);
}
process.stdout.write(`${reportPath}\n`);
