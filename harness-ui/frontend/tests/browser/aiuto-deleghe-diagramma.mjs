/*
 * Il banco comune delle prove del diagramma delle deleghe (13/10/2026): la scena con le figlie nella forma vera di
 * `GET …/children`, la rotta della cronologia del registro, le richieste della persona dalla porta vera (`RunStarted`).
 * Solo letture: ogni scrittura si ferma e si conta.
 *
 * Dal 13/10/2026 è l'UNICO banco: anche `deleghe-sul-diagramma.spec.mjs`, che ne teneva una copia in testa, importa da qui.
 * Opzioni di `apri`: `lingua`, `richieste`, `cartella`, `altre`, `cronologia` (`record`, `rotta`, `coverage`), `tema`, `finestra`;
 * `figli` può essere una funzione (la scena viva: una rilettura dopo un evento risponde coi fatti nuovi).
 */
import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';

export const RADICE = 'dsd-radice';
export const T0 = Date.parse('2026-10-12T14:00:00.000Z');
export const at = (s) => new Date(T0 + s * 1000).toISOString();
export const figlia = (id, nascita, extra = {}) => ({ sessionId: id, parentId: RADICE, padreId: RADICE, task: `Compito di ${id}`, taskCorto: `Compito ${id}`, modello: 'z-ai/glm-5.3-flash',
  conclusa: false, interrotta: false, avviataAlle: at(nascita), attivita: { file: [], chiamate: 1, passi: [] }, ...extra });
export const finita = (id, nascita, fine, extra = {}) => figlia(id, nascita, { conclusa: true, conclusaAlle: at(fine), esitoDelega: 'concluso', ...extra });

/* `principale`: campi in più della riga della conversazione (es. `interrotta: true`), dati sia all'elenco delle sessioni sia
   all'apertura, come fa il prodotto con la riga vera. */
export async function apri(page, figli, { lingua = 'it', richieste = [], cartella = null, altre = [], cronologia = null, tema = 'dark', finestra = { width: 1920, height: 1080 }, principale = {} } = {}) {
  const scritture = [];
  await page.setViewportSize(finestra);
  await page.routeWebSocket(/.*/u, (ws) => ws.close());
  await page.addInitScript(([l, t]) => { try {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: t, uiLanguage: l } }));
  } catch { /* */ } }, [lingua, tema]);
  const json = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data }) });
  await page.route('**/api/v1/**', (route) => {
    const req = route.request(); const p = new URL(req.url()).pathname;
    if (!['GET', 'HEAD'].includes(req.method())) { scritture.push(`${req.method()} ${p}`); return route.abort(); }
    if (p === '/api/v1/sessions') return route.fulfill(json({ items: [{ sessionId: RADICE, taskId: 'workspace', nome: 'Sistema i listini', modello: 'z-ai/glm-5.3-flash', conclusa: false, avviataAlle: at(0), ...(cartella ? { cartella } : {}), ...principale }, ...altre] }));
    if (p === `/api/v1/sessions/${RADICE}/children`) return route.fulfill(json({ figli: typeof figli === 'function' ? figli() : figli }));
    // il flusso della conversazione porta il confine fra storia e presente: senza, il pannello Agenti resta «in caricamento», vuoto
    if (p === `/api/v1/sessions/${RADICE}/events`) return flussoConConfine(route);
    if (/\/events/u.test(p)) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'retry: 600000\n\n' });
    if (/\/(workflows|workflow-proposals)$/u.test(p)) return route.fulfill(json({ items: [] }));
    /* la cronologia osservata del registro (`talos.agent-timeline.v1`): `cronologia = { record, rotta }` la serve a pagine di 2
       (e `rotta: true` la fa fallire); senza, il registro dice «non disponibile» e il diagramma rigioca dai fatti */
    if (p === `/api/v1/sessions/${RADICE}/agent-timeline`) {
      if (!cronologia) return route.fulfill(json({ schema: 'talos.agent-timeline.v1', rootId: RADICE, coverage: 'unavailable', persisted: false, through: 0, next: null, items: [] }));
      cronologia.chiamate = (cronologia.chiamate ?? 0) + 1;
      if (cronologia.rotta) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message: 'Cronologia temporaneamente non disponibile' } }) });
      const q = new URL(req.url()).searchParams; const after = Number(q.get('after') || 0); const through = Number(q.get('through') || cronologia.record.length);
      const items = cronologia.record.filter((x) => x.seq > after && x.seq <= through).slice(0, 2);
      // `cronologia.coverage`: ciò che il registro dichiara della sua storia ('complete' di serie, 'partial' se ha dei buchi)
      return route.fulfill(json({ schema: 'talos.agent-timeline.v1', rootId: RADICE, coverage: cronologia.coverage ?? 'complete', persisted: true, through, next: items.at(-1)?.seq < through ? items.at(-1).seq : null, items }));
    }
    if (/\/tree/u.test(p)) return route.fulfill(json({ voci: [] }));
    return route.fallback();
  });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([id, extra]) => { window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Sistema i listini', 'z-ai/glm-5.3-flash', { conclusa: false, ...extra }); }, [RADICE, principale]);
  await attendiFineStoria(page);
  // le richieste della persona arrivano dalla porta vera: il `RunStarted` della conversazione (senza `input.origine`)
  if (richieste.length) await page.evaluate((lista) => {
    const r = window.__talosHarnessUiRuntime; const g = r.realSessionState.generation;
    lista.forEach((x, i) => {
      // senza `at` si prova la RIGIOCATA: fuori da lei una richiesta prende l'ora dell'orologio, e la prova non misurerebbe niente
      const rigiocata = !x.at && Boolean(x.avviatoA); const prima = r.realSessionState.inRigiocata;
      if (rigiocata) r.realSessionState.inRigiocata = true;
      r.handleRealEvent({ type: 'RunStarted', _sequenza: 50001 + i * 2, ...(x.at ? { at: x.at } : {}), input: { consegna: x.testo, ...(x.origine ? { origine: x.origine } : {}) }, contesto: { modello: 'z-ai/glm-5.3-flash' } }, g);
      // come in una conversazione RIAPERTA: il giro non porta l'ora, la porta l'avvio del suo primo attrezzo (`avviatoA`)
      if (x.avviatoA) r.handleRealEvent({ type: 'ToolCallStart', _sequenza: 50002 + i * 2, toolCallId: `richiesta-attrezzo-${i}`, toolCallName: 'delega', avviatoA: x.avviatoA }, g);
      if (rigiocata) r.realSessionState.inRigiocata = prima;
    });
  }, richieste);
  if (!(await page.locator('#railTabs [data-rail="agenti"]').isVisible())) await page.locator('#schermoChat [data-azione="dettagli"]').click();
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await page.locator('#railAgenti').getByRole('button', { name: /diagram/iu }).first().click();
  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await grafo.waitFor();
  return { grafo, scritture };
}

/** Un evento della conversazione in diretta: lo stato nuovo di un agente (`talos.agenti`), dalla porta vera del runtime. */
export const eventoAgente = (page, agente, reason = 'updated') => page.evaluate(({ agente: a, reason: r, radice }) => {
  const rt = window.__talosHarnessUiRuntime;
  rt.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1, sessionId: radice, parentId: a.padreId ?? radice, childId: a.sessionId, reason: r, agent: a } }, rt.realSessionState.generation);
}, { agente, reason, radice: RADICE });

/** La persona RICARICA la pagina, nella stessa scheda (la memoria della scheda resta): rotte e impostazioni sono quelle di `apri`.
 *  Non clicca niente: se il diagramma era aperto, lo riapre il prodotto. `principale`: come in `apri`. */
export async function ricarica(page, { principale = {} } = {}) {
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(([id, extra]) => { window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Sistema i listini', 'z-ai/glm-5.3-flash', { conclusa: false, ...extra }); }, [RADICE, principale]);
  await attendiFineStoria(page);
  return page.locator('#schermoChat > [data-c="GrafoAgenti"]');
}
