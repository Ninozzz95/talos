/** Browser-only controlled transport. Production never imports this fixture. */
export function fixtureRows(size = 5) {
  const now = Date.now();
  return Array.from({ length: size }, (_, i) => ({
    sessionId: `sidebar-${i}`, nome: ['Analisi autenticazione', 'Verifica dipendenze', 'Aggiorna documentazione', 'Test di regressione', 'Revisione interfaccia'][i % 5] + (i >= 5 ? ` ${i}` : ''),
    taskId: `test-${i}`, modello: 'test/model', avviataAlle: new Date(now - i * 60_000).toISOString(),
    conclusa: i % 5 >= 2, interrotta: false,
    inAttesaApprovazione: i % 5 === 1,
    ultimoEsito: i % 5 === 3 ? 'errore' : i % 5 >= 2 ? 'successo' : null,
    usageSessione: { giri: i + 1 },
    attivitaSidebar: { fase: i % 5 === 0 ? 'ragionamento' : i % 5 === 1 ? 'approvazione' : null,
      iniziataAlle: new Date(now - 222_000).toISOString(), terminataAlle: i % 5 >= 2 ? new Date(now - 30_000).toISOString() : null,
      ultimoEventoAlle: new Date(now - 4_000).toISOString(), risposte: 2, chiamate: 3, fileModificati: 1,
      strumentiAttivi: 0, comandiAttivi: 0, coda: 0, errori: i % 5 === 3 ? 1 : 0 },
  }));
}
export async function installSidebarFixture(page, { rows = fixtureRows(), live = true, mode = 'dark', theme = 'calm', prefs = null } = {}) {
  await page.addInitScript(({ rows, live, mode, theme, prefs }) => {
    // Setup belongs to the app window, never its sandboxed preview frames.
    if (window !== window.top) return;
    localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' }));
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode: mode, themePreset: theme, themePresetVersione: 2, backgroundMotion: false } }));
    if (prefs !== null) localStorage.setItem('talos-desktop-sidebar-v1', JSON.stringify(prefs));
    const Native = window.EventSource;
    const data = { rows, revision: 0, streams: [], live };
    const envelope = (kind, items = [], removed = []) => ({ schema: 'talos.sidebar.v1', epoch: 'fixture-1', revision: data.revision, kind, items, removed });
    class ControlledEventSource {
      constructor(url, options) {
        if (!String(url).endsWith('/api/v1/sidebar/events')) return new Native(url, options);
        this.url = String(url); this.readyState = 0; this.closed = false; data.streams.push(this);
        setTimeout(() => {
          if (this.closed) return;
          this.readyState = 1; this.onopen?.();
          if (data.live) this.onmessage?.({ data: JSON.stringify(envelope('snapshot', data.rows)) });
        }, 0);
      }
      close() { this.closed = true; this.readyState = 2; }
    }
    Object.assign(ControlledEventSource, { CONNECTING: 0, OPEN: 1, CLOSED: 2 });
    window.EventSource = ControlledEventSource;
    window.__sidebarTest = {
      data,
      delta(items, removed = [], resources = false) {
        const map = new Map(data.rows.map(row => [row.sessionId, row]));
        for (const item of items) map.set(item.sessionId, item);
        for (const id of removed) map.delete(id);
        data.rows = [...map.values()]; data.revision++;
        for (const stream of data.streams) if (!stream.closed) stream.onmessage?.({ data: JSON.stringify({ ...envelope('delta', items, removed), resources }) });
      },
      snapshot(items) { data.rows = items; data.revision++; for (const stream of data.streams) if (!stream.closed) stream.onmessage?.({ data: JSON.stringify(envelope('snapshot', items)) }); },
      fail() { const stream = data.streams.at(-1); stream.readyState = 0; stream.onerror?.(); },
    };
  }, { rows, live, mode, theme, prefs });
}
export async function prepareSidebar(page, { rows = fixtureRows(), live = true, restError = false, mode = 'dark', theme = 'calm', prefs = null } = {}) {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await installSidebarFixture(page, { rows, live, mode, theme, prefs });
  await page.route(/\/api\/v1\/sessions(?:\?.*)?$/, route => restError
    ? route.fulfill({ status: 503, json: { ok: false, error: { code: 'TEST_OFFLINE', message: 'Offline fixture' } } })
    : route.fulfill({ json: { ok: true, data: { items: [] }, meta: {} } }));
  await page.route(/\/api\/v1\/sessions\/[^/]+\/events$/, route => route.fulfill({ contentType: 'text/event-stream', body: 'retry: 3600000\n\ndata: {"type":"CUSTOM","name":"talos.fine-rigiocata","value":{}}\n\n' }));
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 12_000 });
  if (live) await page.locator('[data-sidebar-connection="live"]').waitFor();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return { rows, errors, async delta(items, removed = [], resources = false) { await page.evaluate(({ items, removed, resources }) => window.__sidebarTest.delta(items, removed, resources), { items, removed, resources }); } };
}
