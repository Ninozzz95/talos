import os from 'node:os';

import { test, expect } from '@playwright/test';

/*
 * ⛔ Owner 11/11/2026 (decisione delle 19:45, «prima i piccoli, subito»): nelle chat da 1000-4000 giri il compositore va a scatti mentre
 *   si scrive. Ricognizione del giudice (`RICOGNIZIONE-PRESTAZIONI-SESSIONI-LUNGHE-2026-11-11.md`, D1, D2, D6, D7): a ogni lettera
 *   l'ascoltatore `input` chiamava `syncRunComposerState`, che chiedeva il disegno di TUTTA la colonna di destra (giri montati,
 *   eventi degli attrezzi, albero degli agenti); e l'orologio dell'attività cercava ogni secondo in tutto il documento.
 * Banco comune (sezione 3 della ricognizione): server di prova su 127.0.0.1, profilo finto, modello finto; giornale sintetico da 3000
 *   giri dal vivo (un richiudibile, un comando, 45 righe di codice per giro), un giro in corso con 3 comandi accesi e 2 agenti vivi,
 *   scheda Processi aperta, CPU rallentata ×4 (`Emulation.setCPUThrottlingRate`).
 * La storia entra come all'apertura vera di una chat lunga: dal FLUSSO della sessione (`/events`, text/event-stream), poi il confine
 *   `talos.fine-rigiocata`; il giro in corso arriva dopo, dal vivo (`handleRealEvent`). Così passa dal cancello vero della rigiocata
 *   (`collegaEventiSessione` → `aggiornaFinestraReplay`): la finestra monta gli ultimi giri e tiene gli altri nel registro dei turni
 *   smontati, che la colonna di destra legge comunque (`giriPerInspector`): il disegno della colonna cresce coi 3000 giri.
 *   ⛔ Prima la storia entrava con `handleRealEvent` (tutto montato, la finestra non scattava): sulla base 3000 giri non finivano di
 *   caricarsi in 10 minuti.
 * La spia del disegno della colonna: `aggiornaInspector` (components/inspector.js) scrive `inspector.__ultimiDati` a ogni disegno, e la
 *   chiama solo `disegnaInspectorAdesso` (e il risveglio di una scheda rimasta indietro). Un setter su quel campo conta i disegni VERI
 *   (quelli che passano le guardie «non sporca» e «storia in corso»), senza un gancio nel prodotto.
 * ⛔ I CONTEGGI sono il cancello sempre. Il tetto dei 16 ms vale solo a macchina sotto il 60% (tre campioni prima della scrittura):
 *   sopra, il tempo si scrive «sotto carico» e non si giudica (regole comuni, CPU).
 * Concorrenti: Hermes scrive nello stato solo quando cambia un «bordo» del testo (`apps/desktop/src/app/chat/composer/
 *   composer-store-writer.ts:11-21`); Claude Code «reducing per-keystroke rendering work» (`CHANGELOG.md:3703`).
 */

const GIRI = Number(process.env.TALOS_PERF_GIRI || 3000);
/* TALOS_PERF_DIAG=1: chi chiama il disegno della colonna (pila) e dove va il tempo dei fotogrammi lunghi (Long Animation Frames) */
const DIAG = process.env.TALOS_PERF_DIAG === '1';
const ID = 'perf-lunga';
const MODELLO = 'local:prova';
const T0 = Date.parse('2026-11-11T08:00:00.000Z');
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const CODICE = (n) => ['```text', ...Array.from({ length: 45 }, (_, i) => `const riga${i}_${n} = (x) => x * ${i} + ${n}; // riga ${i + 1} del giro ${n}`), '```'].join('\n');
const giro = (n) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${n}`, input: { consegna: `Giro ${n}: lancia il comando e mostrami il codice`, ...(n > 1 ? { seguito: true } : {}) }, timestamp: T0 + n * 1000 },
  { type: 'ReasoningMessageStart', messageId: `p-${n}` },
  { type: 'ReasoningMessageContent', messageId: `p-${n}`, delta: `Penso al giro ${n}: prima il comando, poi il codice.` },
  { type: 'ReasoningMessageEnd', messageId: `p-${n}` },
  { type: 'ToolCallStart', toolCallId: `c-${n}`, toolCallName: 'shell', avviatoA: T0 + n * 1000 + 10 },
  { type: 'ToolCallArgs', toolCallId: `c-${n}`, delta: JSON.stringify({ comando: `echo giro ${n}`, descrizione: `Stampa il giro ${n}` }) },
  { type: 'ToolCallResult', messageId: `rc-${n}`, toolCallId: `c-${n}`, content: `exit 0\ngiro ${n}`, role: 'tool', isError: false, comando: `echo giro ${n}`, exitCode: 0 },
  { type: 'TextMessageStart', messageId: `a-${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `a-${n}`, delta: `## Giro ${n}\n\nEcco il codice del giro ${n}.\n\n${CODICE(n)}\n` },
  { type: 'TextMessageEnd', messageId: `a-${n}` },
  { type: 'RunFinished', threadId: 't', runId: `r-${n}`, outcome: { type: 'success' } },
];
const ADESSO = Date.now();
const agente = (k, extra = {}) => ({
  sessionId: `${ID}-figlia-${k}`, padreId: ID, nome: `Agente ${k}`, taskCorto: `Compito dell'agente ${k}`, task: `Compito dell'agente ${k}`,
  modello: MODELLO, permessi: 'read-only', conclusa: false, interrotta: false, esitoDelega: null,
  avviataAlle: new Date(ADESSO - 60_000).toISOString(), conclusaAlle: null, ultimaAttivitaAlle: new Date(ADESSO - 1000).toISOString(),
  attivita: { chiamate: 3, attrezzoCorrente: 'leggi', bersaglioCorrente: `src/file-${k}.js`, file: [], passi: [] }, ...extra,
});

const cpuCampioni = async () => {
  const leggi = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { tot: a.tot + t, idle: a.idle + c.times.idle }; }, { tot: 0, idle: 0 });
  const fuori = [];
  for (let i = 0; i < 3; i += 1) {
    const a = leggi(); await new Promise((r) => setTimeout(r, 700)); const b = leggi();
    fuori.push(Math.round(100 * (1 - (b.idle - a.idle) / (b.tot - a.tot))));
  }
  return fuori;
};
const p95 = (v) => { const o = [...v].sort((a, b) => a - b); return o.length ? o[Math.min(o.length - 1, Math.ceil(o.length * 0.95) - 1)] : 0; };

let contesto;
let page;

test.beforeAll(async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  const uso = testInfo.project.use;
  contesto = await browser.newContext({ baseURL: uso.baseURL, storageState: uso.storageState, locale: 'it-IT', viewport: { width: 1920, height: 1080 } });
  page = await contesto.newPage();
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  if (DIAG) {
    await page.addInitScript(() => {
      /* diagnosi: la pila di chi ha CHIESTO il fotogramma, letta dalla spia quando il disegno parte dentro la richiamata */
      const originale = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => { const pila = String(new Error('raf').stack).split('\n').slice(2, 9).join(' | '); return originale((t) => { window.__pilaRaf = pila; try { cb(t); } finally { window.__pilaRaf = null; } }); };
    });
  }
  await page.addInitScript(() => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: 'dark', uiLanguage: 'it' } }));
    /* La misura «tasto → fotogramma dipinto» è l'Event Timing API (W3C, w3c.github.io/event-timing: `duration` va dall'istante dell'input
       al disegno che segue, arrotondata a 8 ms; soglia minima 16 ms, MDN PerformanceEventTiming). Per ogni tasto (`interactionId`) vale il
       più lungo fra keydown, keypress e input. Un tasto senza voce è sotto i 16 ms: il 95° percentile è sotto 16 ms se al più 3 tasti su 60
       hanno una voce. ⛔ Una misura a mano (rAF + messaggio) dava 20 s per tasto sotto CPU ×4: i messaggi aspettavano dietro ai fotogrammi. */
    window.__perf = { tasti: 0, lenti: new Map(), misura: false, loaf: [] };
    try {
      new PerformanceObserver((l) => {
        if (!window.__perf.misura) return;
        for (const e of l.getEntries()) {
          window.__perf.loaf.push({ durata: e.duration, blocco: e.blockingDuration, stile: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
            script: (e.scripts || []).map((x) => ({ chi: x.invoker, fn: x.sourceFunctionName, durata: x.duration, forzato: x.forcedStyleAndLayoutDuration, da: x.sourceCharPosition })) });
        }
      }).observe({ type: 'long-animation-frame' });
    } catch { /* senza LoAF niente diagnosi */ }
    document.addEventListener('keydown', () => { if (window.__perf.misura) window.__perf.tasti += 1; }, true);
    try {
      new PerformanceObserver((l) => {
        if (!window.__perf.misura) return;
        for (const v of l.getEntries()) {
          if (!['keydown', 'keypress', 'input'].includes(v.name) || !v.interactionId) continue;
          window.__perf.lenti.set(v.interactionId, Math.max(window.__perf.lenti.get(v.interactionId) ?? 0, v.duration));
        }
      }).observe({ type: 'event', durationThreshold: 16 });
    } catch { /* senza Event Timing la prova lo dice: nessun tasto misurato */ }
  });
  const agenti = [agente(1), agente(2)];
  let seq = 1;
  const storia = [];
  for (let n = 1; n <= GIRI; n += 1) for (const e of giro(n)) storia.push({ ...e, _sequenza: seq++ });
  const corpo = `retry: 3600000
${[...storia, CONFINE].map((e) => `id: ${e._sequenza ?? seq}
data: ${JSON.stringify(e)}

`).join('')}`;
  await page.route(`**/api/v1/sessions/${ID}/events*`, (route) => route.fulfill({ contentType: 'text/event-stream', body: corpo }));
  await page.route(`**/api/v1/sessions/${ID}/children*`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ figli: agenti }) }));
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.evaluate(({ id, modello }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Chat lunga', modello, { conclusa: false, modello });
  }, { id: ID, modello: MODELLO });
  // la storia arriva dal flusso; si aspetta il confine (rigiocata finita, tutti gli eventi visti)
  await page.waitForFunction(({ id, n }) => {
    const rs = window.__talosHarnessUiRuntime.realSessionState;
    return rs.id === id && rs.inRigiocata === false && rs.sequenzeViste.size >= n;
  }, { id: ID, n: storia.length }, { timeout: 540_000, polling: 1000 });
  // il giro in corso: 3 comandi accesi, 2 agenti vivi
  const vivi = [
    { type: 'RunStarted', threadId: 't', runId: 'r-vivo', input: { consegna: 'Il giro in corso', seguito: true }, timestamp: Date.now() },
    ...[1, 2, 3].flatMap((k) => [
      { type: 'ToolCallStart', toolCallId: `vivo-${k}`, toolCallName: 'shell', avviatoA: Date.now() - k * 1000 },
      { type: 'ToolCallArgs', toolCallId: `vivo-${k}`, delta: JSON.stringify({ comando: `npm run lavoro-${k}`, descrizione: `Lavoro lungo ${k}` }) },
    ]),
  ].map((e) => ({ ...e, _sequenza: seq++ }));
  await page.evaluate(({ vivi, agenti, id }) => {
    const r = window.__talosHarnessUiRuntime;
    for (const e of vivi) r.handleRealEvent(e, r.realSessionState.generation);
    for (const a of agenti) r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1, sessionId: id, parentId: id, childId: a.sessionId, agent: a } }, r.realSessionState.generation);
  }, { vivi, agenti, id: ID });
  await page.waitForFunction((g) => (document.querySelector('#conversation')?.textContent ?? '').includes(`Giro ${g}:`), GIRI, { timeout: 60_000 });
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="processi"]').click();
  await expect(page.locator('#railProcessi')).toContainText('Lavoro lungo 1');
  /* Il flusso finto finisce col corpo della risposta: la connessione passa da «riconnessione» a «ricollegato» (battito dopo 2 s) e a
     «collegato» (dopo 4 s, `components/connessione.js` RITMO), e ogni passo ridisegna composer e colonna (`suCambio`). È un EVENTO,
     non una lettera: si aspetta che finisca, poi si misura (diagnosi dell'11/11: l'unico disegno della colonna durante la scrittura
     senza eventi veniva da qui). */
  await page.waitForTimeout(7000);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-connessione]')].every((b) => b.dataset.connessione === 'collegato'), null, { timeout: 30_000 });
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
});

test.afterAll(async () => { await contesto?.close(); });

/** Conta i disegni veri della colonna (vedi la testata). */
const armaSpiaColonna = () => page.evaluate(() => {
  const ins = document.querySelector('.talos-inspector');
  if (!ins.__spia) {
    let v = ins.__ultimiDati;
    ins.__spia = { disegni: 0 };
    ins.__spia.pile = [];
    Object.defineProperty(ins, '__ultimiDati', { configurable: true, get: () => v, set: (x) => { v = x; ins.__spia.disegni += 1; ins.__spia.pile.push(`${String(new Error('pila').stack).split('\n').slice(2, 6).join(' | ')} ⇐ ${window.__pilaRaf ?? '-'}`); } });
  }
  ins.__spia.disegni = 0;
  ins.__spia.pile = [];
});
const diagnosi = async (nome) => {
  if (!DIAG) return;
  const d = await page.evaluate(() => ({ pile: document.querySelector('.talos-inspector').__spia.pile, loaf: window.__perf.loaf }));
  console.log(`[DIAG ${nome}] pile del disegno della colonna:\n  ${d.pile.join('\n  ')}`);
  const tot = { fotogrammi: d.loaf.length, durata: 0, stile: 0, script: 0, forzato: 0 };
  const perChi = new Map();
  for (const f of d.loaf) {
    tot.durata += f.durata; tot.stile += f.stile;
    for (const x of f.script) { tot.script += x.durata; tot.forzato += x.forzato || 0; const k = `${x.chi} · ${x.fn} @${x.da}`; perChi.set(k, (perChi.get(k) ?? 0) + x.durata); }
  }
  console.log(`[DIAG ${nome}] fotogrammi lunghi ${tot.fotogrammi}, durata ${Math.round(tot.durata)} ms, stile+layout finali ${Math.round(tot.stile)} ms, script ${Math.round(tot.script)} ms (layout forzato ${Math.round(tot.forzato)} ms)`);
  for (const [k, v] of [...perChi].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${Math.round(v)} ms  ${k}`);
};
const disegniColonna = () => page.evaluate(() => document.querySelector('.talos-inspector').__spia.disegni);

async function scrivi60(cdp) {
  const testo = 'Scrivo una frase di sessanta lettere per provare il composer.'.slice(0, 60);
  expect(testo.length).toBe(60);
  await page.locator('#composerInput').fill('');
  await page.locator('#composerInput').focus();
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => { window.__perf.tasti = 0; window.__perf.lenti = new Map(); window.__perf.loaf = []; window.__perf.misura = true; });
  await page.keyboard.type(testo, { delay: 60 });
  await page.evaluate(() => new Promise((ok) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(ok)), 100)));
  await page.evaluate(() => { window.__perf.misura = false; });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const m = await page.evaluate(() => ({ tasti: window.__perf.tasti, lenti: [...window.__perf.lenti.values()] }));
  // un tasto senza voce dell'Event Timing è sotto i 16 ms: vale 0 nel percentile
  m.durate = [...m.lenti, ...Array.from({ length: Math.max(0, m.tasti - m.lenti.length) }, () => 0)];
  await expect(page.locator('#composerInput')).toHaveValue(testo);
  return m;
}

test('PERF-COMPOSER-01 — chat da 3000 giri, giro vivo con 3 comandi e 2 agenti, scheda Processi aperta, CPU ×4: 60 lettere non ridisegnano la colonna né cercano in tutto il documento; il tempo per tasto si misura', async ({}, testInfo) => {
  test.setTimeout(300_000);
  const cdp = await page.context().newCDPSession(page);
  const turni = await page.evaluate(() => document.querySelectorAll('#conversation .talos-turn').length);
  // i giri che la colonna conosce (montati + smontati dalla finestra della storia): `giriPerInspector` → `__ultimiDati.giri`
  const giriColonna = await page.evaluate(() => document.querySelector('.talos-inspector').__ultimiDati?.giri?.length ?? 0);
  const nodi = await page.evaluate(() => document.getElementsByTagName('*').length);

  // A — si scrive e basta (nessun evento): la colonna non si disegna MAI
  const cpuA = await cpuCampioni();
  let lettureRisorse = 0;
  let contaRisorse = false;
  // si contano le RISPOSTE: è all'arrivo della risposta che la lettura chiede il disegno
  page.on('response', (res) => { if (contaRisorse && new URL(res.url()).pathname.endsWith('/processes/resources')) lettureRisorse += 1; });
  await armaSpiaColonna();
  contaRisorse = true;
  /* la scorciatoia globale (`keydown` sulla radice) cercava un `dialog:modal` in tutto il documento a OGNI tasto (traccia dell'11/11:
     il lavoro di script più grosso di una lettera). Si contano le ricerche di quel selettore mentre si scrive. */
  await page.evaluate(() => {
    window.__ricercheModale = 0;
    for (const P of [Document.prototype, Element.prototype, DocumentFragment.prototype]) {
      for (const nome of ['querySelector', 'querySelectorAll']) {
        const originale = P[nome];
        if (originale.__spia) continue;
        const spia = function (selettore, ...resto) { if (String(selettore).includes('dialog:modal')) window.__ricercheModale += 1; return originale.call(this, selettore, ...resto); };
        spia.__spia = true;
        P[nome] = spia;
      }
    }
  });
  /* diagnosi: la traccia del browser durante la scrittura, sommata per tipo di lavoro (stile, layout, pittura, script) */
  const traccia = [];
  if (DIAG) {
    cdp.on('Tracing.dataCollected', (d) => traccia.push(...d.value));
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
  }
  const a = await scrivi60(cdp);
  if (DIAG) {
    const fine = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
    await cdp.send('Tracing.end');
    await fine;
    const somma = new Map();
    const dettagli = { stile: 0, elementiStile: 0, layout: 0, oggettiLayout: 0, radiciLayout: new Map() };
    for (const e of traccia) {
      if (e.ph !== 'X' || !e.dur) continue;
      somma.set(e.name, (somma.get(e.name) ?? 0) + e.dur / 1000);
      if (e.name === 'UpdateLayoutTree') { dettagli.stile += 1; dettagli.elementiStile += e.args?.elementCount ?? 0; }
      if (e.name === 'Layout') { dettagli.layout += 1; dettagli.oggettiLayout += e.args?.beginData?.dirtyObjects ?? 0; }
    }
    console.log(`[DIAG A traccia] ${[...somma].sort((x, y) => y[1] - x[1]).slice(0, 18).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · ')}`);
    console.log(`[DIAG A traccia] ricalcoli di stile ${dettagli.stile} (elementi ${dettagli.elementiStile}), layout ${dettagli.layout} (oggetti sporchi ${dettagli.oggettiLayout})`);
    const fs = await import('node:fs');
    fs.writeFileSync(process.env.TALOS_PERF_TRACCIA || 'traccia-perf.json', JSON.stringify({ traceEvents: traccia }));
  }
  const disegniA = await disegniColonna();
  contaRisorse = false;
  const risorseA = lettureRisorse;
  const ricercheModale = await page.evaluate(() => window.__ricercheModale);
  await diagnosi('A');

  // B — mentre si scrive, gli agenti e i comandi del giro EMETTONO eventi (il caso dell'owner, aggiunta 2 del giudice v1534)
  await page.locator('#composerInput').fill('');
  const cpuB = await cpuCampioni();
  await armaSpiaColonna();
  lettureRisorse = 0;
  contaRisorse = true;
  await page.evaluate(({ id, base }) => {
    const r = window.__talosHarnessUiRuntime;
    let k = 0;
    window.__emessi = { agenti: 0, comandi: 0 };
    window.__emettitore = setInterval(() => {
      k += 1;
      const g = r.realSessionState.generation;
      if (k % 2) {
        const figlia = `${id}-figlia-${1 + (k % 4 === 1 ? 0 : 1)}`;
        r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1, sessionId: id, parentId: id, childId: figlia,
          agent: { sessionId: figlia, padreId: id, nome: figlia, taskCorto: figlia, conclusa: false, interrotta: false, avviataAlle: new Date(Date.now() - 60_000).toISOString(),
            ultimaAttivitaAlle: new Date().toISOString(), attivita: { chiamate: 3 + k, attrezzoCorrente: 'leggi', bersaglioCorrente: `src/passo-${k}.js`, file: [], passi: [] } } } }, g);
        window.__emessi.agenti += 1;
      } else {
        const tc = `breve-${k}`;
        r.handleRealEvent({ type: 'ToolCallStart', toolCallId: tc, toolCallName: 'shell', avviatoA: Date.now(), _sequenza: base + 2 * k }, g);
        r.handleRealEvent({ type: 'ToolCallArgs', toolCallId: tc, delta: JSON.stringify({ comando: `echo passo ${k}`, descrizione: `Passo breve ${k}` }), _sequenza: base + 2 * k + 1 }, g);
        window.__emessi.comandi += 1;
      }
    }, 150);
  }, { id: ID, base: 10_000_000 });
  const b = await scrivi60(cdp);
  await page.evaluate(() => clearInterval(window.__emettitore));
  const disegniB = await disegniColonna();
  contaRisorse = false;
  const risorseB = lettureRisorse;
  await diagnosi('B');
  const emessi = await page.evaluate(() => window.__emessi);
  // aggiunta 1 del giudice: un evento di un agente e uno di un comando aggiornano ancora le schede Processi e Agenti
  await expect(page.locator('#railProcessi')).toContainText(`Passo breve ${2 * emessi.comandi}`);
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti')).toContainText('0 di 2 terminati');
  await page.evaluate(({ id }) => {
    const r = window.__talosHarnessUiRuntime;
    const figlia = `${id}-figlia-2`;
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1, sessionId: id, parentId: id, childId: figlia,
      agent: { sessionId: figlia, padreId: id, nome: figlia, taskCorto: figlia, conclusa: true, interrotta: false, esitoDelega: 'riuscito', ultimoEsito: 'successo',
        avviataAlle: new Date(Date.now() - 60_000).toISOString(), conclusaAlle: new Date().toISOString(), ultimaAttivitaAlle: new Date().toISOString(), attivita: { chiamate: 9, file: [], passi: [] } } } }, r.realSessionState.generation);
  }, { id: ID });
  await expect(page.locator('#railAgenti'), 'un evento di un agente aggiorna la scheda Agenti').toContainText('1 di 2 terminati');
  await page.locator('#railTabs [data-rail="processi"]').click();

  const riga = (n, m, cpu, disegni) => `${n}: p95 ${p95(m.durate) < 16 ? 'sotto 16' : p95(m.durate)} ms, max ${Math.max(0, ...m.lenti)} ms, tasti ${m.tasti}, tasti ≥16 ms ${m.lenti.length}, disegni della colonna ${disegni}, CPU ${cpu.join('/')}%${cpu.some((c) => c > 60) ? ' SOTTO CARICO' : ''}`;
  const rapporto = [`[PERF-COMPOSER-01] giri nella colonna ${giriColonna}, montati ${turni}, nodi ${nodi}`, riga(`A senza eventi (letture delle risorse dei processi ${risorseA}, ricerche di dialog:modal ${ricercheModale})`, a, cpuA, disegniA), riga(`B con ${emessi.agenti} eventi di agenti e ${emessi.comandi} comandi (letture delle risorse ${risorseB})`, b, cpuB, disegniB)].join('\n');
  console.log(rapporto);
  testInfo.annotations.push({ type: 'misura', description: rapporto });

  expect(giriColonna, 'la colonna conosce davvero tutti i giri (montati e smontati)').toBeGreaterThanOrEqual(GIRI);
  expect(a.tasti, 'ogni tasto contato').toBe(60);
  /* il cancello sempre: la scrittura da sola non disegna la colonna. L'unico altro disegno possibile in A è quello della lettura
     periodica delle risorse dei processi (`leggiRisorseProcessi`, ogni 5 s con 3 comandi accesi: diagnosi dell'11/11 con la pila
     di chi chiede il fotogramma): uno per lettura al più, mai uno per lettera (sulla base erano 61 su 60 lettere). */
  expect(disegniA, 'scrivere 60 lettere non ridisegna la colonna: solo le letture delle risorse dei processi possono').toBeLessThanOrEqual(risorseA);
  expect(ricercheModale, 'una lettera non cerca un dialog:modal in tutto il documento').toBe(0);
  /* con gli eventi la colonna si ridisegna per gli EVENTI, non per le lettere: un evento può chiederne più d'uno in fotogrammi diversi,
     e il tetto è due per evento più le letture delle risorse. Misurato con le cure: 37 disegni per 26 eventi
     a 3000 giri, 51 per 34 a 1000; sulla base 69 per 8 eventi. */
  expect(disegniB, 'la colonna si disegna per gli eventi, mai una volta per lettera').toBeLessThanOrEqual(2 * (emessi.agenti + emessi.comandi) + risorseB);
  // il tetto dei 16 ms: solo a macchina scarica (sotto il 60%)
  /* Il tetto dei 16 ms si giudica a CPU sotto il 60% e si SCRIVE (brief: «se non ci arrivi mai, scrivilo»): con le cure di questo blocco
     una lettera non disegna più la colonna, ma sotto CPU ×4 la lettera costa ancora il lavoro nativo del campo di testo in un documento
     grande (stile e layout dentro keypress/textInput, traccia dell'11/11). Il cancello resta sui conteggi qui sopra. */
  if (cpuA.some((c) => c > 60)) testInfo.annotations.push({ type: 'sotto-carico', description: `A: CPU ${cpuA.join('/')}%: il tempo non si giudica` });
  else if (p95(a.durate) >= 16) {
    testInfo.annotations.push({ type: 'tetto-16-ms-non-raggiunto', description: `A: p95 ${p95(a.durate)} ms a CPU ${cpuA.join('/')}%` });
    console.log(`[PERF-COMPOSER-01] TETTO DEI 16 ms NON RAGGIUNTO: p95 ${p95(a.durate)} ms a CPU ${cpuA.join('/')}%`);
  }
});

test('PERF-OROLOGIO-01 — con 3000 giri, il battito dell orologio dell attività non cerca nel documento intero e i secondi scorrono', async () => {
  test.setTimeout(120_000);
  const prima = await page.evaluate(() => document.querySelector('[data-attivita-da]')?.textContent ?? null);
  expect(prima, 'c è un orologio vivo (il giro in corso)').not.toBeNull();
  const conti = await page.evaluate(() => new Promise((ok) => {
    const conto = { documento: 0, sottoalberi: 0, lavoro: [] };
    const orig = Document.prototype.querySelectorAll;
    const origEl = Element.prototype.querySelectorAll;
    const radici = new Set([document.documentElement, document.body]);
    Document.prototype.querySelectorAll = function (s) { if (String(s).includes('attivita-da')) conto.documento += 1; return orig.call(this, s); };
    Element.prototype.querySelectorAll = function (s) {
      if (String(s).includes('attivita-da')) { if (radici.has(this) || this.id === 'conversation' || this.matches?.('.talos-shell, #schermoChat')) conto.documento += 1; else conto.sottoalberi += 1; }
      return origEl.call(this, s);
    };
    setTimeout(() => { Document.prototype.querySelectorAll = orig; Element.prototype.querySelectorAll = origEl; ok(conto); }, 3500);
  }));
  const dopo = await page.evaluate(() => document.querySelector('[data-attivita-da]')?.textContent ?? null);
  console.log(`[PERF-OROLOGIO-01] ricerche sul documento ${conti.documento}, ricerche nei sottoalberi ${conti.sottoalberi}, orologio ${prima} → ${dopo}`);
  expect(conti.documento, 'il battito non cerca in tutto il documento').toBe(0);
  expect(dopo, 'i secondi scorrono').not.toBe(prima);
});
