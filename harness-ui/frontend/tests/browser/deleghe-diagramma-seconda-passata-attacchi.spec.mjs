/*
 * 13/10/2026 notte (bugfixer NUOVO, lotto 3, SECONDA PASSATA) — gli attacchi fatti dopo il fermo del revisore di prima, sulla testa
 * `eae1a56fc` (le cure di `d0a397649`, `e511b2dde`, `bc7a4591a` e delle due prove rosse). I file del diagramma non sono miei:
 * un difetto è una prova ROSSA qui, più una riga nel rapporto con la cura proposta.
 * `[REGGE]` = ho provato a romperlo e ha retto; `[DIFETTO]` / `[DIFETTO?]` = consegnata rossa (col punto di domanda: decide chi
 * possiede il diagramma se è un difetto o una scelta). Solo letture: ogni scrittura si ferma e si conta (banco comune).
 */
import { expect, test } from '@playwright/test';
import { apri, at, eventoAgente, figlia, finita, RADICE } from './aiuto-deleghe-diagramma.mjs';
import { apriDiagrammaDellaScena, costruisciScena, instradaScena } from './aiuto-workflow-v2.mjs';

const ora = (s) => new Date(Date.parse(at(s))).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
/* un carattere dal suo numero: quelli che cambiano il verso della scrittura non si vedono, e in un sorgente non devono stare crudi */
const car = (...codici) => String.fromCodePoint(...codici);

/* ——— un id POSIZIONALE che tiene memoria attraverso un cambio di struttura, DAL VIVO (non per una scelta della persona) ——— */
test('SECONDA-POSIZIONE-03 [DIFETTO] — filtro «Al lavoro», un agente scelto, e un ALTRO agente finisce (esce dal filtro, gli altri scalano di un posto): la scelta resta sull’agente scelto, o si toglie; mai su un altro', async ({ page }) => {
  /* `SECONDA-POSIZIONE-01` prova il cambio di struttura fatto dalla PERSONA (un filtro): lì `rileggiDopoUnaScelta` toglie la scelta.
     Qui il cambio lo fa il LAVORO: con «Al lavoro» acceso un agente che finisce esce dal diagramma, e chi gli stava dietro nello
     stesso lotto prende l'id di chi gli stava davanti. La scelta (`stato.selezionato`) è un id di nodo, e `carica()` non la rimappa. */
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const figli = [figlia('a', 10, { taskCorto: 'Agente A' }), figlia('b', 11, { taskCorto: 'Agente B' }), figlia('c', 12, { taskCorto: 'Agente C' }), figlia('d', 13, { taskCorto: 'Agente D' })];
  const { grafo, scritture } = await apri(page, () => figli);
  const stato = grafo.locator('[data-filtro-stato]');
  await stato.locator('> button').click();
  await stato.locator('[data-stato-id="working"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(4);
  await expect(grafo.locator('[data-mostrati]')).toContainText('Al lavoro'); // la rilettura dopo la scelta del filtro è finita
  await page.waitForTimeout(800);
  await grafo.locator('[data-sessione="c"]').click();
  const dettaglio = grafo.locator('.gv-dettaglio');
  const scelte = () => grafo.locator('[data-sessione][aria-pressed="true"]').evaluateAll((n) => n.map((x) => x.dataset.sessione));
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Agente C');
  await page.waitForTimeout(1200);
  expect(await scelte(), 'il controllo: da sola, la scelta resta su «c»').toEqual(['c']);
  await expect(dettaglio.locator('.talos-wfg__dettaglio-nome')).toHaveText('Agente C');
  const nodoDiC = await grafo.locator('[data-sessione="c"]').getAttribute('data-nodo-id');
  // «a» finisce: esce dal filtro; b, c e d scalano di un posto
  figli.splice(0, 1, finita('a', 10, 70, { taskCorto: 'Agente A' }));
  await eventoAgente(page, figli[0], 'finished');
  await expect(grafo.locator('[data-sessione]')).toHaveCount(3, { timeout: 10_000 });
  /* ⚠️ ADATTATA dal coordinatore il 13/10/2026 sera (la prova è del revisore; scena ed esiti sono intatti). Qui si affermava la
     premessa del difetto: «d» ha preso l'id di nodo che era di «c». La cura ha tolto proprio quella — gli id dei nodi seguono la
     sessione (`grafo/run-dalle-deleghe.js`, `idDelNodo`) — quindi si afferma il contrario; gli esiti (1) (2) (3) restano. */
  expect(await grafo.locator('[data-sessione="d"]').getAttribute('data-nodo-id'), 'gli id seguono la sessione: «d» NON prende l’id di nodo di «c»').not.toBe(nodoDiC);
  expect(await grafo.locator('[data-sessione="c"]').getAttribute('data-nodo-id'), '«c» tiene il suo id di nodo').toBe(nodoDiC);
  await page.waitForTimeout(2500); // il battito del dettaglio (una volta al secondo) e le riletture
  // (1) la scheda segnata come scelta: «c» (o nessuna), mai un altro agente
  const dopo = await scelte();
  expect.soft(dopo.filter((s) => s !== 'c'), `la scheda segnata come scelta dopo che «a» è uscito dal filtro: ${JSON.stringify(dopo)}`).toEqual([]);
  // (2) il dettaglio, se è aperto, è dell'agente scelto
  const aperto = await dettaglio.isVisible();
  if (aperto) await expect.soft(dettaglio.locator('.talos-wfg__dettaglio-nome'), 'il dettaglio aperto è ancora quello dell’agente scelto').toHaveText('Agente C');
  // (3) e un comando dato DAL dettaglio che dice «Agente C» agisce su «Agente C»: la pausa parte per LUI (qui ogni scrittura si
  //     ferma prima del server e si conta), e «Isola» non isola un altro agente
  if (aperto) {
    const nomeNelDettaglio = await dettaglio.locator('.talos-wfg__dettaglio-nome').textContent();
    await dettaglio.locator('[data-focus-key="dettaglio:menu"]').click();
    await page.locator('.ft-actions-menu [role="menuitem"]', { hasText: 'Metti in pausa questa delega' }).click();
    const pause = () => scritture.filter((x) => x.endsWith('/delegation/pause'));
    await expect.poll(pause, { message: 'la pausa è partita' }).toHaveLength(1);
    expect.soft(pause(), `«Metti in pausa questa delega» dal dettaglio che dice «${nomeNelDettaglio}»`).toEqual(['POST /api/v1/sessions/c/delegation/pause']);
    await dettaglio.locator('[data-azione="isola"]').click();
    await expect(grafo.locator('[data-mostrati]')).toContainText('e gli agenti che ha avviato');
    expect.soft(await grafo.locator('[data-mostrati]').innerText(), `«Isola» premuto nel dettaglio che dice «${nomeNelDettaglio}»`).toContain(`«${nomeNelDettaglio}»`);
  }
  expect(errori).toEqual([]);
});

/* ——— e511b2dde: la storia «di prima» resta attaccata agli id di adesso finché non arriva quella nuova ——— */
async function orariDiUnAltroDopoIsola(page, { ritardoRegistroMs }) {
  // «a» e «b» nello stesso lotto: isolando «b», prende l'id di nodo che aveva «a». Il registro può essere lento (una storia lunga,
  // un disco lento): niente di rotto, solo lento.
  const figli = [finita('a', 60, 420, { taskCorto: 'Correggi i prezzi' }), finita('b', 70, 200, { taskCorto: 'Leggi il CSV' }), finita('n', 100, 150, { padreId: 'b', parentId: 'b', taskCorto: 'Conta le righe' })];
  const { grafo } = await apri(page, () => figli);
  await expect(grafo.locator('.gv-rip')).toHaveAttribute('data-pronta', 'true');
  if (ritardoRegistroMs > 0) await page.route('**/agent-timeline**', async (route) => { await new Promise((r) => { setTimeout(r, ritardoRegistroMs); }); await route.fallback(); });
  const sotto = grafo.locator('.gv-dettaglio .talos-wfg__passo-modello').first();
  await grafo.locator('[data-sessione="b"]').click();
  await expect(sotto).toContainText(`${ora(70)}–${ora(200)}`);
  // che cosa c'è A SCHERMO nel dettaglio, fotogramma per fotogramma (non ogni passaggio del DOM: solo ciò che si è visto)
  await grafo.evaluate((r) => {
    const d = r.querySelector('.gv-dettaglio'); const visti = []; window.__visti = visti;
    const prendi = () => {
      const voce = { nascosto: d.hidden, nome: d.querySelector('.talos-wfg__dettaglio-nome')?.textContent ?? null, sotto: d.querySelector('.talos-wfg__passo-modello')?.textContent ?? null };
      const u = visti.at(-1);
      if (!u || u.nascosto !== voce.nascosto || u.nome !== voce.nome || u.sotto !== voce.sotto) visti.push({ t: performance.now(), ...voce });
      window.__vistiFinoA = performance.now();
      requestAnimationFrame(prendi);
    };
    requestAnimationFrame(prendi);
  });
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2);
  await page.waitForTimeout(7000);
  const { visti, finoA } = await page.evaluate(() => ({ visti: window.__visti, finoA: window.__vistiFinoA }));
  // per quanto tempo il dettaglio di «b» ha detto la FINE di «a»
  let msDiUnAltro = 0;
  visti.forEach((v, i) => { if (!v.nascosto && v.nome === 'Leggi il CSV' && v.sotto?.includes(`–${ora(420)}`)) msDiUnAltro += (visti[i + 1]?.t ?? finoA) - v.t; });
  return { msDiUnAltro: Math.round(msDiUnAltro), ultimo: visti.at(-1), visti: visti.map((v) => `${Math.round(v.t)}:${v.nascosto ? '(nascosto)' : `${v.nome}|${v.sotto}`}`) };
}
/* col registro LENTO la prova vuole zero: è la cosa da curare. Col registro veloce (`-03b`) l'attimo c'è lo stesso ma dura al più
   qualche fotogramma — misurato 0 ms da sola e 15 ms (un fotogramma) con quattro lavoratori: lì il tetto è 100 ms, e la prova dice
   solo che NON si allunga. Con la storia svuotata al cambio di struttura sarebbe zero in tutti e due i casi.
   Stato dell'arte (TanStack Query, documentazione letta il 13/10/2026 via Context7 `/tanstack/query`, `guides/paginated-queries.md`
   e `reference/functions/keepPreviousData.md`): tenere i dati della chiave di PRIMA mentre arriva la nuova è una scelta esplicita
   (`placeholderData: keepPreviousData`), e la libreria lo DICE a chi disegna (`isPlaceholderData`) — nell'esempio ufficiale il
   comando resta spento finché è vero. Qui la storia di prima resta senza nessun segno, e le viste la disegnano come di adesso. */
for (const [nome, ritardoRegistroMs, etichetta, tettoMs, promessa] of [
  ['SECONDA-STORIA-03', 1500, '[DIFETTO?]', 0, 'il dettaglio di «b» non dice MAI gli orari di «a» (o i suoi, o nessuno), nemmeno «per un attimo»'],
  ['SECONDA-STORIA-03b', 0, '[REGGE]', 100, 'AL CONTRARIO, col registro veloce gli orari di «a» sul dettaglio di «b» durano al più qualche fotogramma'],
]) {
  test(`${nome} ${etichetta} — registro che risponde in ${ritardoRegistroMs} ms, la persona isola «b»: ${promessa}`, async ({ page }) => {
    /* `fonte.js`, `azzeraStruttura`: «Fino ad allora resta quella di prima (un attimo), mai un diagramma senza storia». L'attimo dura
       quanto la rilettura (più il ridisegno del dettaglio, una volta al secondo): con un registro lento sono SECONDI in cui «b»
       porta gli orari di «a» — la foto che `e511b2dde` cura. E una rilettura già in volo quando la struttura cambia lo allunga
       (`SECONDA-STORIA-01`, unit). Il dettaglio sa già dire inizio e fine dai FATTI quando la storia non ha tentativi (`daiFatti`):
       svuotando la storia al cambio di struttura non resterebbe vuoto. */
    test.slow();
    const { msDiUnAltro, ultimo, visti } = await orariDiUnAltroDopoIsola(page, { ritardoRegistroMs });
    expect(ultimo?.sotto ?? '', 'il controllo positivo: alla fine gli orari di «b» arrivano').toContain(`–${ora(200)}`);
    expect(msDiUnAltro, `il dettaglio di «b» ha detto gli orari di «a» (…–${ora(420)}) per ${msDiUnAltro} ms. A schermo: ${JSON.stringify(visti)}`).toBeLessThanOrEqual(tettoMs);
  });
}

/* ——— (c) la vista Tempo dopo «Isola» e dopo «Mostra tutti» ——— */
test('SECONDA-TEMPO-01 [REGGE] — la vista Tempo dopo «Isola» e dopo «Mostra tutti»: ogni barra porta gli orari del SUO agente', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [finita('a', 60, 420, { taskCorto: 'Correggi i prezzi' }), finita('b', 130, 250, { taskCorto: 'Leggi il CSV' }), finita('n', 190, 240, { padreId: 'b', parentId: 'b', taskCorto: 'Conta le righe' })]);
  await expect(grafo.locator('.gv-rip')).toHaveAttribute('data-pronta', 'true');
  const barre = () => grafo.locator('.gv-tempo-barra[data-nodo-id]').evaluateAll((n) => n.map((b) => b.getAttribute('aria-label')).sort());
  const attesa = (nome, da, a) => expect.stringMatching(new RegExp(`^${nome} · .* · ${ora(da)} → ${ora(a)} · `, 'u'));
  await grafo.getByRole('radio', { name: 'Tempo' }).click();
  await expect.poll(barre).toEqual([attesa('Conta le righe', 190, 240), attesa('Correggi i prezzi', 60, 420), attesa('Leggi il CSV', 130, 250)]);
  // isola «b» (dalla vista Tempo: la barra lo sceglie, il dettaglio lo isola)
  await grafo.locator('.gv-tempo-nome[data-nodo-id]', { hasText: 'Leggi il CSV' }).click();
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  await expect.poll(barre).toEqual([attesa('Conta le righe', 190, 240), attesa('Leggi il CSV', 130, 250)]);
  await page.waitForTimeout(1200);
  expect(await barre(), 'anche dopo le riletture').toEqual([attesa('Conta le righe', 190, 240), attesa('Leggi il CSV', 130, 250)]);
  // «Mostra tutti»: ognuno coi suoi
  await grafo.locator('[data-mostrati] [data-azione="mostra-tutti"]').click();
  await expect.poll(barre).toEqual([attesa('Conta le righe', 190, 240), attesa('Correggi i prezzi', 60, 420), attesa('Leggi il CSV', 130, 250)]);
  expect(errori).toEqual([]);
});

/* ——— d0a397649: «inizio e fine dai fatti» solo quando la storia ha un buco ——— */
test('SECONDA-DETTAGLIO-02 [REGGE] — un agente RIPRESO (due tentativi nella storia del registro): il dettaglio dice l’ULTIMO tentativo, non l’inizio dei fatti; e in riproduzione, all’inizio, «non ancora partito»', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const registrato = (seq, secondi, node, event = 'updated') => ({ tipo: 'grafo-agenti', schema: 'talos.agent-timeline.v1', rootId: RADICE, seq, at: at(secondi), coverage: 'complete', event, node });
  // «a»: parte alle 16:01, fallisce alle 16:02, RIPARTE alle 16:05 (ripresa), conclude alle 16:07
  const record = [registrato(1, 0, { sessionId: RADICE, padreId: null, conclusa: false, avviataAlle: at(0), taskCorto: 'Sistema i listini' }, 'created'),
    registrato(2, 60, figlia('a', 60), 'created'), registrato(3, 120, finita('a', 60, 120, { esitoDelega: 'fallito' })),
    registrato(4, 300, figlia('a', 60)), registrato(5, 420, finita('a', 60, 420))];
  const { grafo } = await apri(page, [finita('a', 60, 420, { taskCorto: 'Correggi i prezzi' })], { cronologia: { record } });
  const rip = grafo.locator('.gv-rip');
  await expect(rip).toHaveAttribute('data-storia', 'registro');
  await expect(rip).toHaveAttribute('data-pronta', 'true');
  await grafo.locator('[data-sessione="a"]').click();
  const sotto = grafo.locator('.gv-dettaglio .talos-wfg__passo-modello').first();
  await expect(sotto, 'l’ultimo tentativo: dalla ripresa alla fine').toContainText(`${ora(300)}–${ora(420)}`);
  // in riproduzione, all'inizio della storia: «a» non era partito
  const cursore = grafo.getByRole('slider', { name: 'Istante della riproduzione' });
  await cursore.focus();
  await page.keyboard.press('Home');
  await expect(rip).toHaveAttribute('data-attiva', 'true');
  await expect(sotto).toContainText('non ancora partito');
  await expect(grafo.locator('.gv-dettaglio')).not.toContainText('Concluso');
  // e alla fine torna l'ultimo tentativo
  await page.keyboard.press('End');
  await expect(sotto).toContainText(`${ora(300)}–${ora(420)}`);
  expect(errori).toEqual([]);
});

/* ——— d0a397649: il nome breve ——— */
test('SECONDA-NOME-03 [DIFETTO?] — una consegna con un carattere di inversione della scrittura (U+202E): il nome a schermo non lo porta (scheda, suggerimento, frase sopra la tela)', async ({ page }) => {
  /* La regola dei percorsi (`attivita-figlia.mjs`, `percorsoDaMostrare`): con caratteri che cambiano il verso della scrittura «non
     si mostra (a schermo «gpj.exe» diventa «exe.jpg»)». Il NOME dell'agente è la consegna scritta dal modello, e passa com'è:
     l'inversione non si chiude alla fine del nome, e nella frase sopra la tela capovolge anche le parole del prodotto che seguono. */
  const INVERTE = new RegExp(`[${car(0x202A)}-${car(0x202E)}${car(0x2066)}-${car(0x2069)}${car(0x200E)}${car(0x200F)}${car(0x061C)}]`, 'u');
  const { grafo } = await apri(page, [figlia('a', 10, { taskCorto: `Leggi foto${car(0x202E)}gpj.exe e riassumi` }), figlia('n', 40, { padreId: 'a', parentId: 'a', taskCorto: 'Conta le righe' })]);
  await grafo.locator('[data-sessione="a"]').click();
  await grafo.locator('.gv-dettaglio [data-azione="isola"]').click();
  const riga = grafo.locator('[data-mostrati]');
  await expect(riga).toContainText('e gli agenti che ha avviato');
  const scheda = grafo.locator('[data-sessione="a"]');
  const visti = { frase: await riga.innerText(), scheda: await scheda.innerText(), suggerimento: await scheda.getAttribute('title'), nomeLetto: await scheda.getAttribute('aria-label') };
  const conInversione = Object.entries(visti).filter(([, v]) => typeof v === 'string' && INVERTE.test(v)).map(([k]) => k);
  expect(conInversione, `il carattere di inversione arriva a schermo in: ${conInversione.join(', ')}`).toEqual([]);
});

/* ——— bc7a4591a: «esecuzione» al posto di «run» (italiano) ——— */
const parolaRun = /(^|[^\p{L}\p{N}_-])runs?(?![\p{L}\p{N}_-])/iu; // «run» parola: non «run-14» (un id) né «rundll»
const testiDi = (radice) => radice.evaluate((r) => {
  const out = [];
  for (const n of [r, ...r.querySelectorAll('*')]) {
    if (!n.checkVisibility?.({ visibilityProperty: true })) continue; // dentro un contenitore nascosto non si vede e non si sente
    for (const a of ['aria-label', 'title', 'placeholder', 'aria-description']) { const v = n.getAttribute?.(a); if (v) out.push(`${a}=${v}`); }
  }
  out.push(...String(r.innerText || '').split('\n').map((x) => x.trim()).filter(Boolean));
  return out;
});
const tagliati = (radice, parola) => radice.evaluate((r, p) => {
  const out = [];
  for (const n of r.querySelectorAll('*')) {
    const suo = [...n.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent).join('').trim();
    if (!suo || !suo.toLocaleLowerCase('it-IT').includes(p)) continue;
    const s = getComputedStyle(n); const box = n.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue; // non a schermo
    if (n.scrollWidth > n.clientWidth + 1 && s.overflowX !== 'visible') out.push(`${suo} (${n.scrollWidth} > ${n.clientWidth})`);
  }
  return out;
}, parola);
for (const larghezza of [1920, 1024]) {
  test(`SECONDA-ESECUZIONE-01 (${larghezza}) [REGGE] — il diagramma del Workflow in italiano: nessun «run» a schermo, nei nomi letti, nei suggerimenti; menu e conferma dell’annullo concordano al femminile e non sono tagliati`, async ({ page }) => {
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    const scena = costruisciScena(14, { sessionId: `sp-esecuzione-${larghezza}` });
    await instradaScena(page, scena, { comandi: true });
    const grafo = await apriDiagrammaDellaScena(page, scena);
    await page.setViewportSize({ width: larghezza, height: larghezza === 1920 ? 1080 : 800 });
    await page.waitForTimeout(400);
    expect((await testiDi(grafo)).filter((t) => parolaRun.test(t)), 'testi del diagramma con la parola «run»').toEqual([]);
    expect(await tagliati(grafo, 'esecuzion'), 'frasi con «esecuzione» tagliate').toEqual([]);
    // il menu dei comandi e la conferma dell'annullo
    const run = grafo.locator('.talos-wfg__run');
    await run.getByRole('button', { name: 'Altri comandi dell’esecuzione' }).click();
    const menu = run.getByRole('menu', { name: 'Comandi dell’esecuzione' });
    await expect(menu).toBeVisible();
    expect((await testiDi(menu)).filter((t) => parolaRun.test(t))).toEqual([]);
    expect(await tagliati(menu, 'esecuzion'), 'voci del menu tagliate').toEqual([]);
    await menu.getByRole('menuitem', { name: 'Annulla l’esecuzione' }).click();
    const conferma = page.locator('dialog.talos-wfg-conferma');
    await expect(conferma.getByRole('heading')).toHaveText('Annullo l’esecuzione?');
    const dettiDallaConferma = await testiDi(conferma);
    expect(dettiDallaConferma.filter((t) => parolaRun.test(t)), `la conferma: ${JSON.stringify(dettiDallaConferma)}`).toEqual([]);
    expect(dettiDallaConferma.join(' '), 'la conseguenza concorda al femminile').toContain('Un’esecuzione annullata non si riprende.');
    expect(await tagliati(conferma, 'esecuzion'), 'frasi della conferma tagliate').toEqual([]);
    // la conferma sta tutta nella finestra
    const box = await conferma.boundingBox();
    expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= larghezza && box.y + box.height <= (larghezza === 1920 ? 1080 : 800), `la conferma esce dalla finestra: ${JSON.stringify(box)}`).toBe(true);
    // la riproduzione: nome letto del gruppo, del pulsante e del cursore
    await conferma.getByRole('button', { name: 'Non ora' }).click();
    await expect(grafo.getByRole('slider', { name: 'Istante dell’esecuzione' })).toHaveCount(1);
    await expect(grafo.getByRole('group', { name: 'Riproduzione dell’esecuzione' })).toHaveCount(1);
    // e la nota «storia incompleta» delle deleghe (D9) qui non c'è
    await expect(grafo.locator('.gv-rip')).not.toContainText('incompleta');
    expect(errori).toEqual([]);
  });
}
test('SECONDA-ESECUZIONE-02 [REGGE] — AL CONTRARIO, nel diagramma delle DELEGHE «esecuzione» non entra (solo lo stato «In esecuzione»), e «run» nemmeno', async ({ page }) => {
  const { grafo } = await apri(page, [figlia('a', 10, { taskCorto: 'Agente A' }), finita('b', 12, 90, { taskCorto: 'Agente B' })]);
  await grafo.locator('[data-sessione="a"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__dettaglio-nome')).toHaveText('Agente A');
  const testi = await testiDi(grafo);
  expect(testi.filter((t) => parolaRun.test(t)), 'la parola «run»').toEqual([]);
  expect(testi.filter((t) => /esecuzion/iu.test(t) && !/^(title=|aria-label=)?[^=]*\bIn esecuzione\b/u.test(t)), '«esecuzione» fuori dallo stato «In esecuzione»').toEqual([]);
});

/* ——— bc7a4591a: il nome corto del modello sulla scheda ——— */
test('SECONDA-MODELLO-01 [REGGE] — il modello sulla scheda: nome corto per `fornitore/…`, `chatgpt:…`, due barre, un modello locale e uno sconosciuto; quello intero resta nel suggerimento e nel dettaglio; mai vuoto', async ({ page }) => {
  const casi = [
    ['a', 'z-ai/glm-5.3-flash', 'glm-5.3-flash'],
    ['b', 'chatgpt:gpt-5.2-codex', 'gpt-5.2-codex'],
    ['c', 'openrouter/meta-llama/llama-4-maverick:free', 'llama-4-maverick:free'],
    ['d', 'modello-mai-visto', 'modello-mai-visto'],
    ['e', 'fornitore/', 'fornitore/'], // senza un nome dopo la barra: resta l'id (mai una scheda col modello vuoto)
  ];
  const { grafo } = await apri(page, casi.map(([id, modello], i) => figlia(id, 10 + i, { taskCorto: `Agente ${id.toUpperCase()}`, modello })));
  for (const [id, intero, corto] of casi) {
    const scheda = grafo.locator(`[data-sessione="${id}"]`);
    await expect(scheda.locator('.gv-passo-piede .gv-passo-modello'), `${intero} sulla scheda`).toHaveText(corto);
    expect(await scheda.getAttribute('title'), `${intero}: il nome intero nel suggerimento`).toContain(intero);
  }
});
test('SECONDA-MODELLO-02 [REGGE] — un modello LOCALE sulla scheda: il nome leggibile, non la targa del file; l’id intero resta nel suggerimento', async ({ page }) => {
  const locale = 'local:bartowski-nvidia_Nemotron-Cascade-2-30B-A3B-GGUF-931b595fc71b-nvidia-Nemotron-Cascade-2-30B-A3B-Q4-0-gguf';
  const { grafo } = await apri(page, [figlia('l', 10, { taskCorto: 'Agente locale', modello: locale })]);
  const scheda = grafo.locator('[data-sessione="l"]');
  const sulPiede = await scheda.locator('.gv-passo-piede .gv-passo-modello').innerText();
  expect(sulPiede, 'il modello locale sulla scheda non è la targa del file').not.toContain('931b595fc71b');
  expect(sulPiede.trim().length).toBeGreaterThan(0);
  expect(await scheda.getAttribute('title')).toContain(locale);
});
test('SECONDA-MODELLO-03 [DIFETTO?] — in italiano, accanto a «In esecuzione», il nome corto del modello si legge INTERO: non «glm-5.3-…»', async ({ page }) => {
  /* Coordinatore, 14/10/2026: CURATA con la decisione dell'owner («Quelle delle deleghe»): nel diagramma delle deleghe un agente
     al lavoro dice «In corso», non più «In esecuzione», e il nome corto del modello entra. La scena e le misure sono quelle
     del revisore; il titolo dice ancora «In esecuzione» perché è la parola che c'era quando la prova è nata. */
  /* `bc7a4591a`: «In italiano "In esecuzione" lasciava solo "z-ai/glm-…"». Col nome corto resta «glm-5.3-…» (foto del 13/10/2026,
     `bugfixer/lotto3/seconda/seconda-deleghe-*-it-1920x1080.png`): la prova che c'è guarda il testo, non se entra. */
  const { grafo } = await apri(page, [figlia('a', 10, { taskCorto: 'Agente A' }), finita('b', 12, 90, { taskCorto: 'Agente B' })]);
  const misura = (id) => grafo.locator(`[data-sessione="${id}"] .gv-passo-piede .gv-passo-modello`).evaluate((n) => ({ testo: n.textContent, serve: n.scrollWidth, ha: n.clientWidth }));
  const finito = await misura('b');
  expect(finito.serve, `il controllo: accanto a «Concluso» «${finito.testo}» entra (${finito.serve} px su ${finito.ha})`).toBeLessThanOrEqual(finito.ha);
  const alLavoro = await misura('a');
  expect(alLavoro.testo).toBe('glm-5.3-flash');
  expect(alLavoro.serve, `accanto a «In esecuzione» «${alLavoro.testo}» vuole ${alLavoro.serve} px e ne ha ${alLavoro.ha}: a schermo esce tagliato coi puntini`).toBeLessThanOrEqual(alLavoro.ha);
});

/* ——— eae1a56fc: «una regola sola» per il percorso che si mostra. La terza porta: l'elenco dei file del dettaglio ——— */
test('SECONDA-FILE-01 [DIFETTO?] — il percorso che bersaglio e passi rifiutano (inversione della scrittura) sta nell’elenco dei FILE del dettaglio com’è: a schermo «gpj.exe» si legge «exe.jpg», e la riga apre il file', async ({ page }) => {
  /* `attivita-figlia.mjs`: `percorsoDaMostrare` vale per il bersaglio in volo e per il passo finito. `tocca` (l'elenco dei file
     toccati) rifiuta solo il NUL e i percorsi oltre 1.024: lo stesso percorso arriva a schermo nella colonna «File» del dettaglio,
     nel suo suggerimento («Apri …») e — è un fatto vero, un file toccato — non può semplicemente sparire. Qui la figlia ha la forma
     di `GET …/children` con quel file già dentro: la prova guarda la porta dello schermo. */
  const INVERTE = new RegExp(`[${car(0x202A)}-${car(0x202E)}${car(0x2066)}-${car(0x2069)}${car(0x200E)}${car(0x200F)}${car(0x061C)}]`, 'u');
  const { grafo } = await apri(page, [finita('a', 10, 70, { taskCorto: 'Correggi i prezzi', attivita: { file: [{ percorso: 'src/prezzi.js', letto: true }, { percorso: `immagini/foto${car(0x202E)}gpj.exe`, letto: true }], chiamate: 2, passi: [] } })]);
  await grafo.locator('[data-sessione="a"]').click();
  const righe = grafo.locator('.gv-dettaglio .talos-wfg__file');
  await expect(righe).toHaveCount(2);
  const visti = await righe.evaluateAll((n) => n.map((x) => ({ testo: x.innerText, suggerimento: x.getAttribute('title') ?? '' })));
  expect(visti.some((v) => v.testo.includes('src/prezzi.js')), 'il controllo positivo: un file normale c’è').toBe(true);
  expect(visti.length, 'il file dal nome ingannevole resta nell’elenco: è un fatto').toBe(2);
  const conInversione = visti.filter((v) => INVERTE.test(v.testo) || INVERTE.test(v.suggerimento));
  expect(conInversione.length, `righe dei file che portano a schermo il carattere di inversione: ${JSON.stringify(conInversione.map((v) => [...v.testo].map((c) => (INVERTE.test(c) ? `<U+${c.codePointAt(0).toString(16).toUpperCase()}>` : c)).join('')))}`).toBe(0);
});
