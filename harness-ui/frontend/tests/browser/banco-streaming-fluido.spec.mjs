import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { analizza, campionatoreInPagina } from './aiuto-banco-fluido.mjs';
import { CONFINE } from './aiuto-confine.mjs';
import { cadenzaAScatti, cadenzaRegolare, eventiCronologia, testoLungo, testoNormale } from './aiuto-scenari-fluido.mjs';

/*
 * ⭐⭐⭐ 22/10/2026 — IL BANCO DELLO STREAMING FLUIDO (owner: «lo streaming del testo è molto scattoso, si ferma, non è fluido …
 *   in conversazioni lunghe non deve scattare. Voglio il massimo del massimo della tecnologia»).
 *
 * ⛔ PERCHÉ UN BANCO NUOVO. Il banco del 20/09 (`banco-streaming.spec.mjs`) oggi NON misura niente, ed è stato misurato il 22/10:
 *   apre la sessione con `passaASessione` e non manda il confine della storia, quindi `deferHistoricalRendering` resta VERO e ogni
 *   delta va nel conto della rigiocata invece che a schermo — crescita per fotogramma «339 campioni, tutti zero» in tutte e tre le
 *   modalità, verde. È la forma «una misura che non può smentirti».
 * ⇒ Qui il confine arriva DAL FLUSSO (come lo manda il server, `aiuto-confine.mjs`), la storia passa dalla rigiocata vera (con la
 *   sua finestra di montaggio), e il giro vivo arriva dopo, delta per delta, con la cadenza a scatti di un fornitore vero.
 *
 * ⛔ Il banco MISURA e scrive; i cancelli stanno in `streaming-fluido.spec.mjs`. Le misure vanno in
 *   `frontend/artifacts/banco-fluido/<etichetta>-<scena>.json`; l'etichetta di serie è NEUTRA (`giro-di-controllo`): una misura
 *   «prima» o «dopo» si scrive solo chiamandola per nome (lezione del 16/09 sul banco della chat lunga).
 * ⛔ Fluidità vera: con `TALOS_BANCO_GPU=1` il banco gira in Chrome VERO, finestra visibile, GPU, senza strozzature delle
 *   finestre coperte (Chromium headless disegna in software: un p95 lì non prova niente sul desktop, lezione del 02/09).
 */

const QUI = dirname(fileURLToPath(import.meta.url));
const CARTELLA = resolve(QUI, '..', '..', 'artifacts', 'banco-fluido');
const ETICHETTA = process.env.TALOS_BANCO_FLUIDO || 'giro-di-controllo';
const GPU = process.env.TALOS_BANCO_GPU === '1';

test.use({
  channel: 'chrome',
  viewport: { width: 1920, height: 1080 },
  ...(GPU ? {
    headless: false,
    launchOptions: { args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--window-position=0,0', '--window-size=1920,1080'] },
  } : {}),
});

/* La scena, tutta DENTRO la pagina: il cronometro e i delta stanno nel thread della pagina, non nell'IPC di Playwright.
   Due tempi: la PREPARAZIONE (storia, turni vivi) e la CORSA (lo stream misurato), così un profilo guarda solo la corsa. */
async function preparaInPagina({ sid, viviPrima, modo, appRidotto, togliRegole = [] }) {
  const rt = window.__talosHarnessUiRuntime;
  /* SOLO per le diagnosi (TALOS_BANCO_TOGLI_REGOLE): si tolgono dal CSSOM le regole che contengono questi pezzi, per misurare
     quanto costano senza ricostruire il pacchetto */
  let tolte = 0;
  if (togliRegole.length) {
    const visita = (lista) => { for (let i = lista.length - 1; i >= 0; i -= 1) { const r = lista[i]; if (r.cssRules && !r.selectorText) visita(r.cssRules); else if (r.selectorText && togliRegole.some((x) => r.selectorText.includes(x))) { r.parentStyleSheet && (r.parentRule ? r.parentRule.deleteRule(i) : r.parentStyleSheet.deleteRule(i)); tolte += 1; } } };
    for (const foglio of document.styleSheets) { try { visita(foglio.cssRules); } catch { /* foglio di un'altra origine */ } }
  }
  window.__bancoFluidoTolte = tolte;
  const radice = window.__talosHarnessHost || document.documentElement;
  const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const fotogramma = () => new Promise((ok) => requestAnimationFrame(() => ok()));
  rt.passaASessione(sid, 'workspace', 'Banco fluido', 'local:prova', { conclusa: false, modello: 'local:prova' });
  /* la storia arriva dal flusso (rotta della prova): si aspetta il confine */
  for (let i = 0; i < 600 && rt.realSessionState.inRigiocata !== false; i += 1) await attendi(50);
  for (let i = 0; i < 200 && document.querySelector('#conversation')?.classList.contains('is-restoring'); i += 1) await attendi(50);
  const g = rt.realSessionState.generation;
  let seq = 900000;
  /* i turni conclusi DAL VIVO (la conversazione cresciuta senza riaprirla): montati tutti, nessuna finestra */
  if (viviPrima > 0) {
    radice.dataset.talosStreamingAnimation = 'none';
    for (let t = 0; t < viviPrima; t += 1) {
      rt.handleRealEvent({ type: 'RunStarted', input: { consegna: `Domanda viva ${t}`, seguito: true }, _sequenza: seq += 1 }, g);
      rt.handleRealEvent({ type: 'TextMessageContent', messageId: `vivo-${t}`, delta: `Risposta viva ${t}.\n\n| a | b |\n|---|---|\n| ${t} | ${t + 1} |\n\n\`\`\`js\nconst v${t} = ${t};\n\`\`\`\n\nFine ${t} con **forza**.\n`, _sequenza: seq += 1 }, g);
      rt.handleRealEvent({ type: 'TextMessageEnd', messageId: `vivo-${t}`, _sequenza: seq += 1 }, g);
      rt.handleRealEvent({ type: 'RunFinished', outcome: { type: 'success' }, _sequenza: seq += 1 }, g);
      if (t % 20 === 19) await fotogramma();
    }
    await attendi(800);
  }
  if (appRidotto) { document.body.classList.add('reduce-motion'); radice.classList.add('reduce-motion'); }
  radice.dataset.talosStreamingAnimation = modo;
  rt.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Scrivimi la risposta lunga, per favore.', seguito: true }, _sequenza: seq += 1 }, g);
  await attendi(400);
  window.__bancoFluidoScena = { g, seq };
  return { regoleTolte: window.__bancoFluidoTolte, nodi: document.querySelectorAll('#conversation *').length, turni: document.querySelectorAll('#conversation .talos-turn').length };
}

async function corriInPagina({ mid, testo, passi }) {
  const rt = window.__talosHarnessUiRuntime;
  const radice = window.__talosHarnessHost || document.documentElement;
  const attendi = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const fotogramma = () => new Promise((ok) => requestAnimationFrame(() => ok()));
  const { g } = window.__bancoFluidoScena;
  let { seq } = window.__bancoFluidoScena;
  const contiAttributi = {};
  if (window.__bancoContaAttributi) {
    const spia = new MutationObserver((lista) => { for (const r of lista) { const t = r.target; const k = `${t.id ? `#${t.id}` : `${t.tagName}.${String(t.className).split(' ').slice(0, 2).join('.')}`}@${r.attributeName}`; contiAttributi[k] = (contiAttributi[k] || 0) + 1; } });
    spia.observe(document.documentElement, { attributes: true, subtree: true });
    window.__bancoFluido.contiAttributi = contiAttributi;
  }
  window.__bancoFluido.avvia(mid);
  performance.mark('banco-fluido-inizio');
  await fotogramma();
  /* i delta con orari precisi: si consegna tutto ciò il cui orario è passato */
  const t0 = performance.now();
  let previsto = t0;
  let dato = 0;
  for (const passo of passi) {
    previsto += passo.dopoMs;
    const manca = previsto - performance.now();
    if (manca > 1) await attendi(manca);
    const delta = testo.slice(dato, dato + passo.n);
    dato += passo.n;
    window.__bancoFluido.registraArrivo(mid, delta.length);
    rt.handleRealEvent({ type: 'TextMessageContent', messageId: mid, delta, _sequenza: seq += 1 }, g);
  }
  window.__bancoFluido.registraFine(mid);
  performance.mark('banco-fluido-fine');
  rt.handleRealEvent({ type: 'TextMessageEnd', messageId: mid, _sequenza: seq += 1 }, g);
  const scadenza = performance.now() + 20000;
  while (performance.now() < scadenza) {
    const sr = rt.realSessionState.renderIncrementale?.get(mid);
    if (sr && sr.mostrato >= testo.length) break;
    await fotogramma();
  }
  await attendi(500);
  window.__bancoFluido.ferma();
  const copia = rt.realSessionState.messageElements.get(mid)?.querySelector('.assistant-copy');
  return { ...window.__bancoFluido.scarica(), contiAttributi: Object.fromEntries(Object.entries(window.__bancoFluido.contiAttributi || {}).sort((x, y) => y[1] - x[1]).slice(0, 15)), testoReso: copia?.textContent?.length ?? 0, modoMisurato: radice.dataset.talosStreamingAnimation };
}

/** La traccia del motore, riassunta: millisecondi per voce sul thread della pagina, solo durante lo stream (fra i due segni). */
async function riassumiTraccia(cdp) {
  const fine = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
  await cdp.send('Tracing.end');
  const { stream } = await fine;
  let testo = '';
  for (;;) {
    const pezzo = await cdp.send('IO.read', { handle: stream, size: 1 << 20 });
    testo += pezzo.base64Encoded ? Buffer.from(pezzo.data, 'base64').toString('utf8') : pezzo.data;
    if (pezzo.eof) break;
  }
  await cdp.send('IO.close', { handle: stream });
  const dati = JSON.parse(testo);
  const eventi = Array.isArray(dati) ? dati : dati.traceEvents;
  const segno = (nome) => eventi.find((e) => e.name === nome && e.ph !== 'X')?.ts ?? null;
  const inizio = segno('banco-fluido-inizio');
  const termine = segno('banco-fluido-fine');
  const principale = eventi.find((e) => e.name === 'thread_name' && e.args?.name === 'CrRendererMain' && eventi.some((x) => x.pid === e.pid && x.name === 'banco-fluido-inizio'));
  const voci = {};
  for (const e of eventi) {
    if (e.ph !== 'X' || !e.dur || (principale && (e.pid !== principale.pid || e.tid !== principale.tid))) continue;
    if (inizio !== null && (e.ts < inizio || (termine !== null && e.ts > termine))) continue;
    voci[e.name] = (voci[e.name] || 0) + e.dur / 1000;
  }
  const durata = inizio !== null && termine !== null ? (termine - inizio) / 1000 : null;
  /* lo stile: quanti elementi ricalcola, e chi li invalida (con TALOS_BANCO_INVALIDAZIONI=1) */
  const dentro = (e) => inizio === null || (e.ts >= inizio && (termine === null || e.ts <= termine));
  const ricalcoli = eventi.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X' && dentro(e));
  const elementi = ricalcoli.map((e) => e.args?.elementCount ?? e.args?.beginData?.elementCount ?? 0);
  const motivi = {};
  for (const e of eventi) {
    if (!dentro(e) || !/InvalidationTracking/.test(e.name)) continue;
    const d = e.args?.data || {};
    const k = `${e.name.replace('InvalidationTracking', '')}|${d.reason || ''}|${d.selectors?.map?.((x) => x.selector || x.classes?.join?.('.') || x.attributes?.join?.(',') || x.id || '').join(' ') || d.changedClass || d.changedAttribute || d.changedPseudo || ''}|${d.nodeName || ''}`.slice(0, 160);
    motivi[k] = (motivi[k] || 0) + 1;
  }
  return { ricalcoliStile: ricalcoli.length, elementiRicalcolati: elementi.reduce((x, y) => x + y, 0), elementiPerRicalcoloMax: elementi.length ? Math.max(...elementi) : 0, motivi: Object.fromEntries(Object.entries(motivi).sort((x, y) => y[1] - x[1]).slice(0, 12)), durataMs: durata && Math.round(durata), voci: Object.fromEntries(Object.entries(voci).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, Math.round(v)])) };
}

/** Il profilo JavaScript: tempo PROPRIO per funzione (nome, file, riga), le prime 18. */
function riassumiProfiloJs(profile) {
  const perNodo = new Map(profile.nodes.map((n) => [n.id, n]));
  const genitori = new Map();
  for (const n of profile.nodes) for (const c of n.children || []) genitori.set(c, n.id);
  const conti = new Map();
  const intervalli = profile.timeDeltas || [];
  profile.samples.forEach((id, i) => {
    const n = perNodo.get(id);
    const f = n.callFrame;
    /* una funzione nativa (querySelector, getBoundingClientRect…) si attribuisce anche a chi la chiama: è lì la cura */
    const genitore = f.url ? null : genitori.get(n.id);
    const g = genitore ? perNodo.get(genitore)?.callFrame : null;
    const chiave = `${f.functionName || '(anonima)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}${g ? ` ← ${g.functionName || '(anonima)'}:${g.lineNumber + 1}` : ''}`;
    conti.set(chiave, (conti.get(chiave) || 0) + (intervalli[i] || 0) / 1000);
  });
  const chi = process.env.TALOS_BANCO_CHI;
  if (chi) {
    const catene = new Map();
    profile.samples.forEach((id, i) => {
      const n = perNodo.get(id);
      let p = n; const catena = [];
      while (p) { catena.push(`${p.callFrame.functionName || '(anonima)'}:${p.callFrame.lineNumber + 1}`); p = perNodo.get(genitori.get(p.id)); }
      if (!catena.some((c) => c.startsWith(`${chi}:`))) return;
      const k = catena.slice(0, 9).join(' < ');
      catene.set(k, (catene.get(k) || 0) + (intervalli[i] || 0) / 1000);
    });
    console.log(`CATENE ${chi}`, JSON.stringify([...catene].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [Math.round(v), k]), null, 1));
  }
  return Object.fromEntries([...conti].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v)]));
}

const SCENE = [
  { nome: 'A-lungo', storia: 0, vivi: 0, testo: () => testoLungo(), cadenza: (n) => cadenzaAScatti(n) },
  { nome: 'A-lungo-regolare-veloce', storia: 0, vivi: 0, testo: () => testoLungo(), cadenza: (n) => cadenzaRegolare(n, 40, 16) },
  { nome: 'B1-300-turni-riaperti', storia: 300, vivi: 0, testo: () => testoNormale(), cadenza: (n) => cadenzaAScatti(n, { seme: 9 }) },
  { nome: 'B2-300-turni-vivi', storia: 0, vivi: 300, testo: () => testoNormale(), cadenza: (n) => cadenzaAScatti(n, { seme: 9 }) },
  { nome: 'B0-nessun-turno', storia: 0, vivi: 0, testo: () => testoNormale(), cadenza: (n) => cadenzaAScatti(n, { seme: 9 }) },
];
const MODI = (process.env.TALOS_BANCO_MODI || 'fade').split(',');
const RIDOTTO = process.env.TALOS_BANCO_RIDOTTO || 'no'; // no | sistema | app

for (const scena of SCENE) {
  for (const modo of MODI) {
    test(`BANCO-FLUIDO ${scena.nome} (${modo}, movimento ridotto: ${RIDOTTO})`, async ({ page }) => {
      test.setTimeout(240_000);
      const destinazione = resolve(CARTELLA, `${ETICHETTA}-${scena.nome}-${modo}-${RIDOTTO}.json`);
      test.skip(ETICHETTA !== 'giro-di-controllo' && existsSync(destinazione) && process.env.TALOS_BANCO_SOVRASCRIVI !== '1', `${destinazione} esiste già`);
      if (RIDOTTO === 'sistema') await page.emulateMedia({ reducedMotion: 'reduce' });
      const sid = `banco-fluido-${scena.nome}`;
      const storia = eventiCronologia(scena.storia).lista;
      await page.route((url) => url.pathname === `/api/v1/sessions/${sid}/events`, (route) => route.fulfill({
        status: 200, contentType: 'text/event-stream',
        body: `retry: 3600000\n${[...storia, CONFINE].map((e) => `${e._sequenza ? `id: ${e._sequenza}\n` : ''}data: ${JSON.stringify(e)}\n\n`).join('')}`,
      }));
      await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })); } catch { /* niente storage */ } });
      await page.addInitScript(campionatoreInPagina);
      if (process.env.TALOS_BANCO_ATTRIBUTI === '1') await page.addInitScript(() => { window.__bancoContaAttributi = true; });
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
      const testo = scena.testo();
      const passi = scena.cadenza(testo.length);
      const mid = `fluido-${scena.nome}`;
      /* ⛔ Con `TALOS_BANCO_PROFILO=1` si registra una traccia del motore di Chrome durante lo stream e si attribuisce il tempo del
         thread della pagina per voce (stile, layout, pittura, script): il «lavoro del fotogramma» dice QUANTO, la traccia dice CHI. */
      const profilo = process.env.TALOS_BANCO_PROFILO === '1' ? await page.context().newCDPSession(page) : null;
      const preparata = await page.evaluate(preparaInPagina, { sid, viviPrima: scena.vivi, modo, appRidotto: RIDOTTO === 'app', togliRegole: (process.env.TALOS_BANCO_TOGLI_REGOLE || '').split('||').filter(Boolean) });
      if (profilo) { await profilo.send('Profiler.enable'); await profilo.send('Profiler.setSamplingInterval', { interval: 200 }); await profilo.send('Profiler.start'); }
      if (profilo) await profilo.send('Tracing.start', { transferMode: 'ReturnAsStream', traceConfig: { includedCategories: ['devtools.timeline', 'blink.user_timing', 'disabled-by-default-devtools.timeline', ...(process.env.TALOS_BANCO_INVALIDAZIONI === '1' ? ['disabled-by-default-devtools.timeline.invalidationTracking'] : [])] } });
      const grezzo = { ...preparata, ...(await page.evaluate(corriInPagina, { mid, testo, passi })) };
      const esito = analizza(grezzo, mid);
      if (profilo) {
        const { profile } = await profilo.send('Profiler.stop');
        esito.profilo = await riassumiTraccia(profilo);
        esito.profiloJs = riassumiProfiloJs(profile);
      }
      const gpu = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'sconosciuto';
      });
      const misura = { ...(grezzo.contiAttributi && Object.keys(grezzo.contiAttributi).length ? { contiAttributi: grezzo.contiAttributi } : {}), quando: new Date().toISOString(), etichetta: ETICHETTA, scena: scena.nome, modo, ridotto: RIDOTTO, gpu, regoleTolte: grezzo.regoleTolte, nodiPrima: grezzo.nodi, turniMontati: grezzo.turni, modoMisurato: grezzo.modoMisurato, testoReso: grezzo.testoReso, ...esito };
      console.log(`BANCO-FLUIDO ${JSON.stringify(misura)}`);
      if (ETICHETTA !== 'giro-di-controllo') {
        mkdirSync(CARTELLA, { recursive: true });
        writeFileSync(destinazione, `${JSON.stringify(misura, null, 1)}\n`, 'utf8');
      }
      /* le premesse: se la scena non si è formata, i numeri non dicono niente */
      expect(esito.caratteri, 'la scena non si è formata').toBe(testo.length);
      expect(grezzo.modoMisurato, 'la modalità misurata non è quella chiesta').toBe(modo);
      expect(esito.fotogrammiVivi, 'nessun fotogramma con testo a schermo: lo stream non è stato reso').toBeGreaterThan(10);
      if (scena.storia > 0) expect(grezzo.turni, 'la storia non è arrivata dalla rigiocata').toBeGreaterThan(1);
      if (scena.vivi > 0) expect(grezzo.turni, 'i turni vivi non sono montati').toBeGreaterThan(scena.vivi);
    });
  }
}
