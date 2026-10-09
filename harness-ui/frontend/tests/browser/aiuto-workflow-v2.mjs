/*
 * F3-42 (25/09/2026) — le scene v2 dei tre mockup R4 (14 / 200 / 5.000) servite dalle rotte VERE del backend, con le loro
 * forme (`read-model.mjs`: panoramica, pagina di fase ≤50, dettaglio, flusso `run-update`). I numeri sono quelli dei mockup
 * (dimostrativi, `R4-UI-MOCKUP-LIVELLI-2026-09-23.md`), NON dati di produzione: la prova dichiara la fixture.
 * ⛔ Solo letture: ogni richiesta non-GET alle API si ferma e si conta (`scritture`), così la prova può girare anche sul 4174.
 */
import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';

const MODELLO = 'z-ai/glm-5.3-flash';
const INIZIO = Date.parse('2026-09-25T10:00:00.000Z');

const fase = (id, label, role, stati, nomi = null) => ({ id, label, role, stati, nomi });
export const SCENE = Object.freeze({
  // owner 26/09/2026 («nome intero»): tre fasi da un passo — colonne larghe un passo, dove un nome di fase lungo NON entra in
  // una riga (il «Decis…» visto sul 4174). Serve a `WF-UI-PHASE-NAME-WHOLE`.
  3: [
    fase('lettura', 'Lettura', 'researcher', { succeeded: 1 }, ['Riassunto delle note']),
    fase('decisioni', 'Decisioni condivise', 'reviewer', { running: 1 }, ['Decisioni prese']),
    fase('sintesi', 'Sintesi', 'integrator', { pending: 1 }, ['Paragrafo finale di sintesi']),
  ],
  // refactor dei grafi, giro vero del 26/09/2026 sul 4174: la forma del run piccolo (3 fasi, 2+2+1 passi) che ha mostrato la
  // prima vista TAGLIATA in basso — sotto i 25 passi tutto è aperto, e lo zoom d'apertura resta sopra il 55% (vista «Adatta»)
  5: [
    fase('lettura', 'Lettura', 'researcher', { succeeded: 1, running: 1 }, ['Riassunto delle note', 'Elenco delle date']),
    fase('decisioni', 'Decisioni', 'reviewer', { running: 2 }, ['Decisioni prese', 'Decisioni rimandate']),
    fase('sintesi', 'Sintesi', 'integrator', { pending: 1 }, ['Paragrafo finale di sintesi']),
  ],
  14: [
    fase('analisi', 'Analisi', 'researcher', { succeeded: 4 }, ['Ricerca', 'Contesto', 'Dati', 'Insight']),
    fase('implementazione', 'Implementazione', 'implementer', { running: 1, succeeded: 2, pending: 2 }, ['Sviluppo', 'Integrazione', 'Verifica', 'Build', 'Refactoring']),
    fase('validazione', 'Validazione', 'tester', { pending: 5 }, ['Test', 'Sicurezza', 'Documentazione', 'Deploy', 'Monitoraggio']),
  ],
  200: [
    fase('ricerca', 'Ricerca', 'researcher', { succeeded: 32 }),
    fase('implementazione', 'Implementazione', 'implementer', { succeeded: 26, running: 8, pending: 6 }),
    fase('verifica', 'Verifica', 'reviewer', { succeeded: 15, running: 12, pending: 9 }),
    fase('integrazione', 'Integrazione', 'integrator', { succeeded: 8, running: 10, pending: 10 }),
    fase('test', 'Test', 'tester', { succeeded: 4, running: 8, pending: 22 }),
    fase('documentazione', 'Documentazione', null, { pending: 30 }),
  ],
  5000: [
    fase('ricerca', 'Ricerca', 'researcher', { succeeded: 824 }),
    fase('implementazione', 'Implementazione', 'implementer', { succeeded: 762, running: 312, pending: 46 }),
    fase('verifica', 'Verifica', 'reviewer', { succeeded: 322, running: 128, pending: 318 }),
    fase('integrazione', 'Integrazione', 'integrator', { succeeded: 171, pending: 441 }),
    fase('test', 'Test', 'tester', { succeeded: 108, pending: 800 }),
    fase('documentazione', 'Documentazione', null, { pending: 768 }),
  ],
});

const TERMINALI = new Set(['succeeded', 'failed', 'cancelled', 'skipped', 'superseded']);
const ATTENZIONE = new Set(['failed', 'uncertain', 'reconciling']);

export function costruisciScena(count, { sessionId, runId = `run-${count}`, workflowId = `wf-${count}` } = {}) {
  let numero = 1; // «Agente 01» è la sessione principale nel mockup: i passi partono da 02
  const righe = new Map();
  for (const f of SCENE[count]) {
    const elenco = [];
    for (const [stato, quanti] of Object.entries(f.stati)) {
      for (let i = 0; i < quanti; i++) {
        numero += 1;
        const nome = f.nomi?.[elenco.length] ?? f.label;
        const partito = stato !== 'pending';
        const minuto = numero % 60; // sempre nel passato del fotogramma, anche a 5.000 passi
        const inizio = new Date(INIZIO + minuto * 60_000).toISOString();
        const durata = stato === 'succeeded' ? (5 + (numero % 9)) * 60_000 : null;
        elenco.push({
          nodeId: `${f.id}-${String(elenco.length).padStart(4, '0')}`, phaseId: f.id, label: `Agente ${String(numero).padStart(2, '0')} - ${nome}`,
          kind: f.role ? 'agent' : 'artifact', role: f.role, state: stato, priority: 0, updatedAt: inizio, dependencyCount: 0, childCount: 0,
          attentionCount: ATTENZIONE.has(stato) ? 1 : 0,
          startedAt: partito ? inizio : null, finishedAt: durata ? new Date(INIZIO + minuto * 60_000 + durata).toISOString() : null,
          durationMs: durata, stepSessionId: partito ? `${sessionId}-passo-${numero}` : null,
          effectiveModel: partito ? { provider: 'openrouter', model: MODELLO } : null,
        });
      }
    }
    righe.set(f.id, elenco);
  }
  const gruppi = SCENE[count].map((f, order) => {
    const elenco = righe.get(f.id);
    const counts = {};
    for (const r of elenco) counts[r.state] = (counts[r.state] ?? 0) + 1;
    const terminated = elenco.filter((r) => TERMINALI.has(r.state)).length;
    return { phaseId: f.id, label: f.label, order, total: elenco.length, terminated, attention: elenco.filter((r) => ATTENZIONE.has(r.state)).length,
      counts, progress: terminated / elenco.length, roles: f.role ? { [f.role]: elenco.length } : {}, kinds: { [f.role ? 'agent' : 'artifact']: elenco.length } };
  });
  const tutte = [...righe.values()].flat();
  /* refactor dei grafi (26/09): gli ARCHI della scena — ogni passo di una fase dipende da un passo della fase prima (in
     proporzione), e dentro una fase ogni quinto passo dal precedente — e i `groupConnections` contati da quegli archi, come
     `groupConnectionsFor` del read model */
  const archi = [];
  const fasiRighe = SCENE[count].map((f) => righe.get(f.id));
  fasiRighe.forEach((ora, k) => {
    const prima = fasiRighe[k - 1];
    ora.forEach((r, i) => {
      if (prima) {
        const da = prima[Math.min(prima.length - 1, Math.floor((i * prima.length) / ora.length))];
        archi.push({ edgeId: `e-${da.nodeId}-${r.nodeId}`, fromNodeId: da.nodeId, toNodeId: r.nodeId, type: 'control' });
      }
      if (i % 5 === 4) archi.push({ edgeId: `e-${ora[i - 1].nodeId}-${r.nodeId}`, fromNodeId: ora[i - 1].nodeId, toNodeId: r.nodeId, type: 'control' });
    });
  });
  archi.sort((a, b) => a.edgeId.localeCompare(b.edgeId, 'en'));
  const faseDi = new Map(tutte.map((r) => [r.nodeId, r.phaseId]));
  const connessioni = new Map();
  for (const a of archi) {
    const da = faseDi.get(a.fromNodeId), verso = faseDi.get(a.toNodeId);
    if (da === verso) continue;
    const chiave = `${da}>${verso}`;
    if (!connessioni.has(chiave)) connessioni.set(chiave, { fromPhaseId: da, toPhaseId: verso, total: 0, types: { control: 0 } });
    connessioni.get(chiave).total += 1; connessioni.get(chiave).types.control += 1;
  }
  /* la STORIA degli stati coerente con le righe: il run parte, ogni passo è pronto o in attesa, chi è partito lavora dal suo
     inizio e chi è finito finisce alla sua fine (voci in ordine d'ora, come le scrive il riduttore in ordine di sequenza) */
  const avvio = new Date(INIZIO).toISOString();
  const voci = [{ at: avvio, scope: 'run', state: 'running' }];
  for (const r of tutte) voci.push({ at: avvio, scope: 'node', nodeId: r.nodeId, phaseId: r.phaseId, state: r.startedAt ? 'ready' : 'blocked' });
  for (const r of tutte) {
    if (r.startedAt) voci.push({ at: r.startedAt, scope: 'node', nodeId: r.nodeId, phaseId: r.phaseId, state: 'running' });
    if (r.finishedAt) voci.push({ at: r.finishedAt, scope: 'node', nodeId: r.nodeId, phaseId: r.phaseId, state: r.state });
  }
  voci.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const storia = voci.map((v, i) => ({ seq: i + 1, ...v }));
  const panoramica = {
    schema: 'talos.workflow-graph-view.v2', runId, graphVersion: 1, lastSeq: 100, revision: '1:100', status: 'running', phaseSource: 'explicit',
    total: tutte.length, terminated: tutte.filter((r) => TERMINALI.has(r.state)).length, attention: 0, groups: gruppi,
    groupConnections: [...connessioni.values()],
  };
  const revisione = { schema: 'talos.workflow-proposal-view.v2', status: 'approved', workflowId, version: 1, title: 'W1-02 registro processi',
    objective: 'Registro dei processi del workspace.', phases: gruppi.map((g) => ({ id: g.phaseId, label: g.label, total: g.total })) };
  return { count, sessionId, runId, workflowId, righe, panoramica, revisione, tutte, archi, storia };
}

/* le tre letture nuove del refactor dei grafi, con le forme delle rotte vere (`read-model.mjs`) */
function archiDellaScena(scena, url) {
  const fasi = url.searchParams.getAll('phaseId');
  const faseDi = new Map(scena.tutte.map((r) => [r.nodeId, r.phaseId]));
  return fasi.length ? scena.archi.filter((a) => fasi.includes(faseDi.get(a.fromNodeId)) && fasi.includes(faseDi.get(a.toNodeId))) : scena.archi;
}
function discendenzaDellaScena(scena, nodeId, direzione) {
  const vicini = new Map();
  for (const a of scena.archi) {
    const [da, verso] = direzione === 'upstream' ? [a.toNodeId, a.fromNodeId] : [a.fromNodeId, a.toNodeId];
    if (!vicini.has(da)) vicini.set(da, []);
    vicini.get(da).push(verso);
  }
  const visti = new Set([nodeId]);
  const coda = [nodeId];
  while (coda.length) for (const x of vicini.get(coda.pop()) ?? []) if (!visti.has(x)) { visti.add(x); coda.push(x); }
  visti.delete(nodeId);
  return scena.tutte.map((r) => r.nodeId).filter((id) => visti.has(id));
}

const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json',
  body: JSON.stringify(status < 300 ? { ok: true, data, meta: { schema: 'talos.api.v1', generatedAt: '2026-09-25T10:24:00.000Z' } } : { ok: false, error: { code: 'NOT_FOUND' } }) });

/**
 * Instrada la scena. `frame` (facoltativo): un fotogramma `run-update` da servire sul flusso del run, una volta.
 * `vuota`: la sessione non ha né run né proposte (D30: si deve vedere il grafo delle deleghe classiche).
 * `comandi` (F3-52): i comandi del run (pause/resume/cancel/retry) rispondono 202 come il server, si registrano in `comandi`
 *   col loro corpo, e cambiano la scena come i fatti che scrivono; `retry-preview` risponde coi passi falliti. Ogni ALTRA
 *   scrittura resta fermata e contata in `scritture`.
 * `frameAMano` (F3-52): il fotogramma parte solo dopo `rilasciaFrame()`. Serve perché il flusso del run è CONDIVISO: il rail
 *   si iscrive per primo, e un fotogramma servito subito arriva prima che il diagramma esista (misurato: a 1,7 s il rail l'ha
 *   già, e il diagramma nasce dalla panoramica già aggiornata — una prova sul diagramma non vedrebbe niente).
 * `ritardaRiletturaDopoFrame`: la panoramica riletta DOPO il fotogramma arriva con questo ritardo.
 */
export async function instradaScena(page, scena, { frame = null, vuota = false, comandi: conComandi = false, ritardaRiletturaDopoFrame = 0, frameAMano = false } = {}) {
  const scritture = [];
  const comandi = [];
  const S = scena.sessionId;
  // `frameAMano`: la richiesta del flusso resta APERTA finché la prova non rilascia il fotogramma (come un server che non ha
  // ancora niente da dire). Un 204 nel frattempo chiuderebbe il flusso condiviso per tutti, e il fotogramma non arriverebbe più.
  let rilascia = () => {};
  const rilasciato = frameAMano ? new Promise((fatto) => { rilascia = fatto; }) : Promise.resolve();
  let frameServito = false;
  const ricontaGruppi = () => {
    for (const g of scena.panoramica.groups) {
      const elenco = scena.righe.get(g.phaseId);
      g.counts = {};
      for (const r of elenco) g.counts[r.state] = (g.counts[r.state] ?? 0) + 1;
      g.terminated = elenco.filter((r) => TERMINALI.has(r.state)).length;
      g.progress = g.terminated / g.total;
    }
  };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const controllo = conComandi && req.method() === 'POST'
      && new RegExp(`^/api/v1/sessions/${S}/workflows/${scena.runId}/(pause|resume|cancel|retry)$`, 'u').exec(p);
    if (controllo) {
      const azione = controllo[1];
      comandi.push({ azione, corpo: JSON.parse(req.postData() ?? 'null') });
      const pan = scena.panoramica;
      if (azione === 'pause') pan.pauseRequested = true;
      if (azione === 'resume') { pan.status = 'running'; pan.pauseRequested = false; }
      if (azione === 'cancel') pan.cancelRequested = true;
      if (azione === 'retry') {
        for (const elenco of [...scena.righe.values(), scena.tutte]) for (const [i, r] of elenco.entries()) if (r.state === 'failed') elenco[i] = { ...r, state: 'ready' };
        ricontaGruppi();
      }
      return json(route, { runId: scena.runId, action: azione, status: pan.status, deduplicated: false }, 202);
    }
    if (!['GET', 'HEAD'].includes(req.method())) { scritture.push(`${req.method()} ${req.url()}`); return route.abort(); }
    if (conComandi && p === `/api/v1/sessions/${S}/workflows/${scena.runId}/retry-preview`) {
      const nodeIds = scena.tutte.filter((r) => r.state === 'failed').map((r) => r.nodeId);
      return json(route, { schema: 'talos.workflow-retry-preview.v1', runId: scena.runId, nodeIds,
        ceilingRaise: { promptTokens: 12_000 * nodeIds.length, completionTokens: 0, wallMs: 20 * 60_000 * nodeIds.length, agentSeconds: 0, toolCalls: 30 * nodeIds.length, modelRequests: 8 * nodeIds.length, knownCostUsd: 0 } });
    }
    const PESO = { failed: 0, uncertain: 0, waiting_human: 1, reconciling: 1, leased: 2, running: 2, pending: 3, blocked: 3, ready: 3, retry_wait: 3, succeeded: 5 };
    const pagina = (tutte) => {
      const offset = Number(url.searchParams.get('offset') ?? 0), limit = Number(url.searchParams.get('limit') ?? 50);
      // `sort=stato` come il server (read-model F3-42): prima chi chiede attenzione o lavora, a parità l'ordine del grafo
      const elenco = url.searchParams.get('sort') === 'stato'
        ? tutte.map((r, i) => ({ r, i })).sort((a, b) => (PESO[a.r.state] ?? 4) - (PESO[b.r.state] ?? 4) || a.i - b.i).map((v) => v.r) : tutte;
      return { offset, limit, total: elenco.length, nextOffset: offset + limit < elenco.length ? offset + limit : null, items: elenco.slice(offset, offset + limit) };
    };
    if (p === `/api/v1/sessions/${S}/workflows`) return json(route, { items: vuota ? [] : [{ runId: scena.runId, createdAt: '2026-09-25T10:00:00.000Z', workflowId: scena.workflowId, version: 1, status: 'running' }] });
    if (p === `/api/v1/sessions/${S}/workflow-proposals`) return json(route, { items: vuota ? [] : [{ workflowId: scena.workflowId, version: 1, createdAt: '2026-09-25T09:59:00.000Z', status: 'approved', title: scena.revisione.title }] });
    const base = `/api/v1/sessions/${S}/workflows/${scena.runId}`;
    if (p === `${base}/graph`) {
      /* F3-52: `ritardaRiletturaDopoFrame` fa arrivare TARDI la panoramica riletta dopo il fotogramma, così una testata di fase
         che si muove subito può averla mossa solo il fotogramma (`spostaConteggi`), non la rilettura. */
      if (frameServito && ritardaRiletturaDopoFrame > 0) await new Promise((fine) => setTimeout(fine, ritardaRiletturaDopoFrame));
      return json(route, scena.panoramica);
    }
    if (p.startsWith(`${base}/groups/`)) {
      const phaseId = decodeURIComponent(p.slice(`${base}/groups/`.length));
      return json(route, { ...scena.panoramica, phaseId, ...pagina(scena.righe.get(phaseId) ?? []) });
    }
    // refactor dei grafi: archi filtrati per fase, storia degli stati, discendenza — anche per la versione pianificata
    const versioneBase = `/api/v1/workflows/${scena.workflowId}/versions/1`;
    for (const radice of [base, versioneBase]) {
      if (p === `${radice}/edges`) return json(route, { ...scena.panoramica, ...(url.searchParams.getAll('phaseId').length ? { phaseIds: url.searchParams.getAll('phaseId') } : {}), ...pagina(archiDellaScena(scena, url)) });
      const lignaggio = new RegExp(`^${radice.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}/nodes/([^/]+)/lineage$`, 'u').exec(p);
      if (lignaggio) {
        const nodeId = decodeURIComponent(lignaggio[1]);
        return json(route, { ...scena.panoramica, nodeId, direction: url.searchParams.get('direction'), ...pagina(discendenzaDellaScena(scena, nodeId, url.searchParams.get('direction'))) });
      }
    }
    if (p === `${base}/history`) return json(route, { ...scena.panoramica, initialState: 'pending', ...pagina(scena.storia) });
    if (p.startsWith(`${base}/nodes/`)) {
      const riga = scena.tutte.find((r) => r.nodeId === decodeURIComponent(p.slice(`${base}/nodes/`.length)));
      return riga ? json(route, { ...riga, attempt: 1, resultRefIds: [] }) : json(route, null, 404);
    }
    if (p === `${base}/events`) {
      if (frame && !frameServito) await rilasciato;
      if (!frame || frameServito) return route.fulfill({ status: 204, body: '' });
      frameServito = true;
      // il server, dopo quel fotogramma, dice la stessa cosa anche a chi rilegge (panoramica e pagine)
      for (const nuova of frame.nodes ?? []) {
        const elenco = scena.righe.get(nuova.phaseId);
        const i = elenco.findIndex((r) => r.nodeId === nuova.nodeId);
        if (i >= 0) elenco[i] = { ...elenco[i], ...nuova };
        const j = scena.tutte.findIndex((r) => r.nodeId === nuova.nodeId);
        if (j >= 0) scena.tutte[j] = { ...scena.tutte[j], ...nuova };
        const gruppo = scena.panoramica.groups.find((g) => g.phaseId === nuova.phaseId);
        if (gruppo) { gruppo.counts = {}; for (const r of elenco) gruppo.counts[r.state] = (gruppo.counts[r.state] ?? 0) + 1; }
      }
      // F3-52: anche terminati e avanzamento, come il server (prima restavano quelli d'apertura e la percentuale mentiva)
      ricontaGruppi();
      scena.panoramica.lastSeq = frame.lastSeq ?? scena.panoramica.lastSeq;
      return route.fulfill({ status: 200, contentType: 'text/event-stream',
        body: `retry: 600000\nid: ${frame.lastSeq}\nevent: run-update\ndata: ${JSON.stringify(frame)}\n\n` });
    }
    const versione = `/api/v1/workflows/${scena.workflowId}/versions/1`;
    if (p === versione) return json(route, scena.revisione);
    if (p.startsWith(`${versione}/groups/`)) {
      const phaseId = decodeURIComponent(p.slice(`${versione}/groups/`.length));
      const elenco = (scena.righe.get(phaseId) ?? []).map((r) => ({ nodeId: r.nodeId, phaseId, label: r.label, kind: r.kind, role: r.role, state: 'planned',
        model: null, taskPreview: `Compito di ${r.label.replace(/^Agente \d+ - /u, '').toLowerCase()} per il registro processi` }));
      return json(route, { ...pagina(elenco), phaseId });
    }
    if (p.startsWith(`${versione}/nodes/`)) {
      const riga = scena.tutte.find((r) => r.nodeId === decodeURIComponent(p.slice(`${versione}/nodes/`.length)));
      return riga ? json(route, { nodeId: riga.nodeId, label: riga.label, instructions: `Implementa il passo ${riga.label}.\nAggiunge il supporto per il retry e la gestione degli errori di rete.`, model: null,
        taskPreview: `Compito di ${riga.label.replace(/^Agente \d+ - /u, '').toLowerCase()} per il registro processi` })
        : json(route, null, 404);
    }
    if (p.startsWith(`/api/v1/sessions/${S}-passo-`) && p.endsWith('/events')) {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: [
        { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'leggi' }, { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"percorso":"src/pipeline.py"}' },
        { type: 'ToolCallResult', toolCallId: 'c1', content: 'ok' },
        { type: 'ToolCallStart', toolCallId: 'c2', toolCallName: 'file_edit' }, { type: 'ToolCallArgs', toolCallId: 'c2', delta: '{"percorso":"src/agents/processor.py"}' },
      ].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + 'retry: 600000\n\n' });
    }
    // ⛔ 09/10/2026: il flusso finto porta il confine fra storia e presente (aiuto-confine.mjs): senza, la chat e il rail restavano velati
    if (p === `/api/v1/sessions/${S}/events`) return flussoConConfine(route);
    if (p === `/api/v1/sessions/${S}/children`) return json(route, { figli: [] });
    if (p.startsWith(`/api/v1/sessions/${S}/tree`)) return json(route, { voci: [] });
    return route.fallback();
  });
  return { scritture, comandi, rilasciaFrame: () => rilascia() };
}

/** Porta la app sulla sessione della scena e apre la scheda Agenti della colonna di destra. */
export async function apriRailDellaScena(page, scena) {
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'W1-02 registro processi', 'z-ai/glm-5.3-flash', { conclusa: false });
  }, scena.sessionId);
  await attendiFineStoria(page);
  if (!(await page.locator('#railTabs [data-rail="agenti"]').isVisible())) await page.locator('#schermoChat [data-azione="dettagli"]').click();
  await page.locator('#railTabs [data-rail="agenti"]').click();
  return page.locator('#railAgenti');
}

/**
 * Apre il diagramma dalla sua porta vera nel rail Agenti: con un workflow è il rail v2 («Apri diagramma», F3-50, decisione
 * owner 19), senza è il rail classico («Apri visuale diagramma»).
 */
export async function apriDiagrammaDellaScena(page, scena, { vuota = false } = {}) {
  const rail = await apriRailDellaScena(page, scena);
  if (vuota) await rail.getByRole('button', { name: 'Apri visuale diagramma' }).click();
  else await rail.locator('[data-c="WorkflowRail"]').getByRole('button', { name: 'Apri diagramma', exact: true }).click();
  const grafo = page.locator('#schermoChat > [data-c="GrafoAgenti"]');
  await grafo.waitFor();
  return grafo;
}

/** Cambia lo stato di alcuni passi della scena e ricalcola i conteggi della panoramica, come farebbe il server. */
export function cambiaStati(scena, cambi) {
  for (const [nodeId, state] of cambi) {
    for (const elenco of [...scena.righe.values(), scena.tutte]) {
      const i = elenco.findIndex((r) => r.nodeId === nodeId);
      if (i >= 0) elenco[i] = { ...elenco[i], state };
    }
  }
  for (const g of scena.panoramica.groups) {
    const elenco = scena.righe.get(g.phaseId);
    g.counts = {};
    for (const r of elenco) g.counts[r.state] = (g.counts[r.state] ?? 0) + 1;
    g.terminated = elenco.filter((r) => TERMINALI.has(r.state)).length;
    g.progress = g.terminated / g.total;
  }
  return scena;
}
