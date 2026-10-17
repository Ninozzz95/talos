/*
 * TERZA PASSATA DEL REVISORE (14/10/2026) — attacchi ai DATI FERMI (`d540de080`), alla SPINTA IN DIRETTA (`7d3f78421`) e ai
 * FILE DISTINTI in testata (`7d3f78421`), nel browser. Punti 4, 5 e 7 del brief.
 * «[REGGE]» = attaccato, ha retto. Senza etichetta = ROSSA: un difetto, con la cura proposta nel rapporto
 * (`handoff …/bugfixer/RAPPORTO-TERZA-PASSATA-2026-10-14.md`). Solo letture: ogni scrittura si ferma e si conta.
 */
import { expect, test } from '@playwright/test';
import { apri, at, figlia, finita, RADICE } from './aiuto-deleghe-diagramma.mjs';

const avvisoDi = (grafo) => grafo.locator('.talos-wfg__avviso');
const oraDi = (grafo) => grafo.locator('.talos-wfg__aggiornato-ora');
const guasto = (message) => ({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { message } }) });
/* i caratteri che a schermo ingannano, dai loro NUMERI (mai scritti crudi in un sorgente): inversione e isolamento della scrittura,
   segni di direzione, controlli C0 e C1 */
const INGANNA = (cp) => (cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0x200E || cp === 0x200F || cp === 0x061C || cp < 0x20 || (cp >= 0x7F && cp <= 0x9F);
const RLO = String.fromCodePoint(0x202E);
const stato = (page) => page.evaluate(() => window.__talosHarnessUiRuntime.statoDiagrammaWorkflow());

test('TERZA-FERMI-01 — il motivo della lettura fallita arriva dal server: a schermo NON porta i caratteri che ingannano (un’inversione della scrittura capovolge anche «Riprovo da solo.», le parole del prodotto che lo seguono)', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 11)]);
  await expect(avvisoDi(grafo)).toBeHidden();
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => r.fulfill(guasto(`Sessione ${RLO}gpj.exe non leggibile`)));
  await expect(avvisoDi(grafo)).toHaveAttribute('data-motivo', 'dati-fermi', { timeout: 9000 });
  const testo = await avvisoDi(grafo).evaluate((n) => n.textContent);
  expect(testo, 'la premessa: è l’avviso dei dati fermi, col suo motivo').toContain('Dati non aggiornati');
  const ingannevoli = [...testo].map((c) => c.codePointAt(0)).filter(INGANNA).map((cp) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`);
  expect(ingannevoli, `caratteri che ingannano nell’avviso: ${ingannevoli.join(' ')}`).toEqual([]);
});

test('TERZA-FERMI-02 — un motivo lunghissimo (una pagina d’errore intera, uno stack) non si mangia la tela: l’avviso resta di poche righe e il diagramma si vede ancora', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10), figlia('b', 11)]);
  const prima = await grafo.evaluate((g) => Math.round(g.querySelector('.gv-tela').getBoundingClientRect().height));
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => r.fulfill(guasto(`Errore interno: ${'at Oggetto.metodo (file:///C:/talos/harness-ui/src/session-registry.mjs:12030:17) '.repeat(120)}`)));
  await expect(avvisoDi(grafo)).toHaveAttribute('data-motivo', 'dati-fermi', { timeout: 9000 });
  const m = await grafo.evaluate((g) => {
    const a = g.querySelector('.talos-wfg__avviso'); const t = g.querySelector('.gv-tela'); const r = a.getBoundingClientRect();
    return { avvisoAlto: Math.round(r.height), righe: Math.round(r.height / parseFloat(getComputedStyle(a).lineHeight || '18')), telaAlta: Math.round(t.getBoundingClientRect().height),
      caratteri: a.textContent.length, schede: g.querySelectorAll('[data-sessione]').length, fuori: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  expect(m.fuori, JSON.stringify(m)).toBe(false);
  expect(m.avvisoAlto, `l’avviso non è più alto di poche righe (tela prima ${prima} px): ${JSON.stringify(m)}`).toBeLessThanOrEqual(80);
  expect(m.telaAlta, `la tela resta leggibile (prima ${prima} px): ${JSON.stringify(m)}`).toBeGreaterThan(Math.min(300, prima - 80));
});

test('TERZA-FERMI-03 [REGGE] — l’avviso dei dati fermi in RIPRODUZIONE: resta mentre si guarda il passato, la testata dice l’istante rigiocato, e tornando al vivo l’ora è ancora quella dell’ultima lettura riuscita; un motivo che sembra un segnaposto resta testo', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo, scritture } = await apri(page, [finita('a', 10, 70), figlia('b', 11)]);
  await expect(oraDi(grafo)).toHaveAttribute('data-alle', /^\d{4}-\d\d-\d\dT/u);
  await page.route(`**/api/v1/sessions/${RADICE}/children`, (r) => r.fulfill(guasto('{errore} {n} $& $1 %s')));
  await expect(avvisoDi(grafo)).toHaveAttribute('data-motivo', 'dati-fermi', { timeout: 9000 });
  await expect(avvisoDi(grafo)).toHaveText('Dati non aggiornati: {errore} {n} $& $1 %s. Riprovo da solo.');
  const ferma = await oraDi(grafo).getAttribute('data-alle');
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  await rip.locator('.gv-rip-binario').focus();
  await page.keyboard.press('Home');
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(avvisoDi(grafo)).toBeVisible();
  await expect(oraDi(grafo)).toContainText(/\d\d:\d\d/u);
  await expect(oraDi(grafo)).toHaveAttribute('data-alle', ''); // in riproduzione l'ora a schermo è l'istante rigiocato, non una lettura
  await page.waitForTimeout(5600); // un battito col server giù, guardando il passato
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(avvisoDi(grafo)).toBeVisible();
  await rip.locator('.gv-rip-vivo').click();
  await expect(rip).toHaveAttribute('data-attiva', 'false');
  expect(await oraDi(grafo).getAttribute('data-alle'), 'tornati al vivo, l’ora è quella dell’ultima lettura riuscita').toBe(ferma);
  expect(scritture).toEqual([]);
  expect(errori).toEqual([]);
});

/* ——— la spinta in diretta: la scheda in cima segue gli attrezzi della conversazione (`app.js`, `spintaDiagrammaDeleghe && […]`) ——— */
const DUECENTO = () => Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? figlia(`g${i}`, 10 + (i % 15), { taskCorto: `Agente ${i + 1}` }) : finita(`g${i}`, 10 + (i % 15), 60 + (i % 20), { taskCorto: `Agente ${i + 1}` })));

for (const [quanti, figli] of [[4, () => [figlia('a', 10), finita('b', 11, 70), figlia('c', 12), finita('d', 13, 80)]], [200, DUECENTO]]) {
  test(`TERZA-SPINTA-01 [REGGE] — ${quanti} agenti, 300 eventi di attrezzo della conversazione in 3 secondi: il diagramma rilegge al più una volta al secondo (non una per evento), la cronologia si chiede al più una volta al secondo, e alla fine la scheda in cima dice il vero`, async ({ page }) => {
    test.setTimeout(90_000);
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    const cronologia = { record: [] };
    const { grafo, scritture } = await apri(page, figli(), { cronologia });
    const cima = grafo.locator('.gv-sessione');
    await expect(grafo.locator('.talos-wfg__cima')).toContainText(`${quanti} agenti`);
    await page.evaluate(() => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent({ type: 'RunStarted', _sequenza: 80000, input: { consegna: 'Sistema i listini' } }, r.realSessionState.generation); });
    // con agenti al lavoro la conversazione che non fa niente di suo «aspetta N agenti»; senza, è «tra due operazioni»
    await expect(cima).toContainText(/Aspetta \d+ agent|Tra due operazioni/u, { timeout: 4000 });
    // da qui il battito non c'entra: la lettura dei figli resta appesa, e si contano le letture della cronologia
    let figliChiesti = 0;
    await page.route(`**/api/v1/sessions/${RADICE}/children`, () => { figliChiesti += 1; /* appesa */ });
    await page.waitForTimeout(1300); // l'ultima rilettura è lontana
    const prima = await stato(page); const cronologiaPrima = cronologia.chiamate ?? 0;
    const misura = await page.evaluate(async () => {
      const r = window.__talosHarnessUiRuntime; const g = r.realSessionState.generation;
      let lunghi = 0; let piuLungo = 0;
      const oss = new PerformanceObserver((l) => { for (const v of l.getEntries()) { lunghi += 1; piuLungo = Math.max(piuLungo, v.duration); } });
      try { oss.observe({ entryTypes: ['longtask'] }); } catch { /* non disponibile */ }
      const t0 = performance.now(); let n = 0;
      await new Promise((fine) => {
        const giro = () => {
          const passato = performance.now() - t0;
          // 100 eventi al secondo: avvio e fine di 150 attrezzi
          while (n < 300 && n < passato / 10) {
            const k = Math.floor(n / 2);
            r.handleRealEvent(n % 2 === 0 ? { type: 'ToolCallStart', toolCallId: `spinta-${k}`, toolCallName: 'leggi', _sequenza: 80001 + n, avviatoA: Date.now() }
              : { type: 'ToolCallResult', toolCallId: `spinta-${k}`, content: 'ok', _sequenza: 80001 + n }, g);
            n += 1;
          }
          if (n >= 300) fine(); else setTimeout(giro, 5);
        };
        giro();
      });
      const durata = performance.now() - t0;
      await new Promise((f) => setTimeout(f, 1500)); // l'ultima rilettura programmata è partita
      oss.disconnect();
      return { durata: Math.round(durata), lunghi, piuLungo: Math.round(piuLungo) };
    });
    const dopo = await stato(page);
    const riletture = dopo.generazione - prima.generazione; const spinte = dopo.fotogrammi - prima.fotogrammi; const cronologie = (cronologia.chiamate ?? 0) - cronologiaPrima;
    const secondi = (misura.durata + 1500) / 1000;
    const visto = { quanti, riletture, spinte, cronologie, figliChiesti, secondi: Number(secondi.toFixed(1)), ...misura };
    console.log(`TERZA-SPINTA-01 ${JSON.stringify(visto)}`);
    expect(spinte, `la premessa: le spinte sono arrivate al diagramma: ${JSON.stringify(visto)}`).toBeGreaterThan(20);
    expect(riletture, `al più una rilettura al secondo (più quella in coda): ${JSON.stringify(visto)}`).toBeLessThanOrEqual(Math.ceil(secondi) + 1);
    expect(riletture, `e almeno una al secondo, mentre gli eventi arrivano: ${JSON.stringify(visto)}`).toBeGreaterThanOrEqual(2);
    expect(cronologie, `la cronologia non si chiede più spesso delle riletture: ${JSON.stringify(visto)}`).toBeLessThanOrEqual(riletture + 1);
    // l'ultimo attrezzo è finito: la scheda in cima non dice più l'attrezzo, senza aspettare il server
    await expect(cima).toContainText(/Aspetta \d+ agent|Tra due operazioni/u, { timeout: 2500 });
    await expect(cima).not.toContainText(/Lettura|Legge/u);
    expect(scritture).toEqual([]);
    expect(errori).toEqual([]);
  });
}

/* ——— i file toccati in testata: quelli DISTINTI (`grafo/attivita.js`, `totaliDelleRighe`) ——— */
const conFile = (id, nascita, file, extra = {}) => figlia(id, nascita, { attivita: { file, fileTagliati: 0, chiamate: file.length, passi: [] }, ...extra });
const f = (percorso, come = {}) => ({ percorso, letto: true, scritto: false, creato: false, ...come });

test('TERZA-FILE-01 [REGGE] — in testata «N file toccati» sono i percorsi DISTINTI: lo stesso file toccato da tre agenti conta uno; un agente con l’elenco tagliato o col solo numero rende il totale «almeno»; chi non dichiara niente pure', async ({ page }) => {
  const descrizione = (grafo) => grafo.locator('.talos-wfg__descrizione');
  // tre agenti sullo stesso file, più un file a testa: 1 + 3 = 4 (la somma dei conti di ognuno darebbe 6)
  let aperto = await apri(page, [conFile('a', 10, [f('src/prezzi.js'), f('src/a.js')]), conFile('b', 11, [f('src/prezzi.js', { scritto: true }), f('src/b.js')]), conFile('c', 12, [f('src/prezzi.js'), f('src/c.js')])]);
  await expect(descrizione(aperto.grafo)).toContainText('4 file toccati');
  await expect(descrizione(aperto.grafo)).not.toContainText('almeno 4 file');
  // un elenco TAGLIATO dal server (`fileTagliati`): il totale è un minimo, e lo dice
  aperto = await apri(page, [conFile('a', 10, [f('src/prezzi.js'), f('src/a.js')]), figlia('b', 11, { attivita: { file: [f('src/prezzi.js')], fileTagliati: 7, chiamate: 9, passi: [] } })]);
  await expect(descrizione(aperto.grafo)).toContainText('almeno 2 file toccati');
  // un agente che dichiara solo QUANTI (record compatto) e uno che non dichiara niente
  aperto = await apri(page, [conFile('a', 10, [f('src/prezzi.js'), f('src/a.js')]), figlia('b', 11, { attivita: { compatta: true, numeroFile: 5, chiamate: 9, passi: [] } })]);
  await expect(descrizione(aperto.grafo)).toContainText('almeno 5 file toccati');
  aperto = await apri(page, [conFile('a', 10, [f('src/prezzi.js')]), { sessionId: 'z', padreId: RADICE, taskCorto: 'Senza attività', conclusa: false, avviataAlle: at(11) }]);
  await expect(descrizione(aperto.grafo)).toContainText('almeno 1 file toccato');
});

/* ——— la storia del registro con l'orologio tornato indietro (era RIPRESA-REPLAY-CLOCK della vista classica, cancellata) ——— */
test('TERZA-STORIA-03 — il registro porta un record con l’ora tornata indietro (l’orologio del sistema è stato corretto fra l’avvio e la fine di un agente): a schermo nessuna fine prima dell’inizio e nessun «null» nel suggerimento della barra', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const radice = { sessionId: RADICE, nome: 'Sistema i listini', conclusa: false, avviataAlle: at(0) };
  const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: RADICE, seq, at: at(secondi), coverage: 'complete', event, node });
  const a = figlia('a', 120, { taskCorto: 'Agente A' });
  // «a» comincia alle 16:02; l'orologio viene corretto di un minuto e mezzo all'indietro; «a» finisce: il record porta le 16:01:30
  const cronologia = { record: [registrato(1, 0, radice, 'created'), registrato(2, 120, a, 'created'), registrato(3, 90, finita('a', 120, 90, { taskCorto: 'Agente A' })), registrato(4, 600, figlia('b', 600, { taskCorto: 'Agente B' }), 'created')] };
  const { grafo } = await apri(page, [finita('a', 120, 90, { taskCorto: 'Agente A' }), figlia('b', 600, { taskCorto: 'Agente B' })], { cronologia });
  await expect(grafo.locator('.gv-rip')).toHaveAttribute('data-storia', 'registro');
  await grafo.locator('[data-sessione="a"]').click();
  const quando = (await grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-testi .talos-wfg__passo-modello').first().innerText()).trim();
  await grafo.locator('[data-vista="tempo"]').click();
  await expect(grafo.locator('button.gv-tempo-barra').first()).toBeAttached();
  const barra = await grafo.evaluate((g) => { const b = [...g.querySelectorAll('button.gv-tempo-barra')].find((x) => (x.title || '').startsWith('Agente A')); return b ? { titolo: b.title, testo: b.textContent } : null; });
  const visto = { quando, barra };
  expect(barra, JSON.stringify(visto)).not.toBeNull();
  expect(barra.titolo, `il suggerimento della barra: ${JSON.stringify(visto)}`).not.toMatch(/null|undefined|NaN/u);
  const ore = [...quando.matchAll(/(\d\d):(\d\d)/gu)].map((m) => Number(m[1]) * 60 + Number(m[2]));
  expect(ore.length < 2 || ore[1] >= ore[0], `nel dettaglio la fine non precede l’inizio: ${JSON.stringify(visto)}`).toBe(true);
  expect(errori).toEqual([]);
});
