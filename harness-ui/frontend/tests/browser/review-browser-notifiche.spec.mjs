import { expect, test } from '@playwright/test';

import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';

/*
 * ⭐⭐⭐ 02/09 — review complessiva, ordine owner: "non togliere il mockup ma
 * agganciarlo e renderlo veramente funzionale". Review center, Browser e
 * campanella erano tre superfici con dati scritti a mano (3 file finti,
 * telefono finto, badge "2"). Ora: stato vuoto onesto all'avvio, dati reali
 * dalla sessione, azioni che fanno qualcosa. Ogni test prova anche il verso
 * contrario (vuoto → pieno → azione).
 */
/*
 * ⛔ `locale: 'it-IT'` non è un vezzo: senza, il profilo di Playwright è `en-US`, la app risolve la
 *   lingua dal browser (`lingua.js`) e le frasi scritte dal codice escono in inglese — la prova
 *   asserirebbe parole che l'owner non vede mai. Misurato qui il 17/09: «Reading 2 of 2» invece di
 *   «Lettura 2 di 2». Stessa disciplina di `terminale-p0`.
 */
test.use({ locale: 'it-IT' });

/*
 * ⛔⛔ BC-67, 17/09/2026 — questa prova AVEVA RAGIONE e nessuno l'aveva ascoltata.
 *
 *   Era rossa anche prima di BC-63 (misurato con un A/B su `e2853725`: stesse tre rosse). La
 *   diagnosi comoda sarebbe «prova vecchia, selettori morti»; la diagnosi VERA è che la Revisione
 *   senza sessione mostrava i DATI FINTI del template — tre linguette con nomi di file inventati,
 *   un diff di `guardiaDiStallo` che nessuno ha mai scritto, la pillola «Ricevuta a1f4…9c02», «giro
 *   5» e tre bottoni che promettono di accettare e scartare. Su una app appena aperta.
 *
 * ⇒ La prova si riscrive sulla superficie che la persona VEDE (`#schermoReview`, quella disegnata
 *   il 05/09), non sul vecchio pannello `[data-view="diff"]` che sopravvive nel DOM; e ciò che
 *   provava — «parte vuota e onesta, si riempie dai fatti, Commenta scrive nel composer» — si
 *   rafforza invece di allentarsi: si conta che NON ci sia nessuna linguetta, nessuna ricevuta,
 *   nessun numero di giro, e si torna a controllare il vuoto anche DOPO essere stati pieni.
 */
test('REVIEW-REAL-41 — la Review parte vuota e onesta, si riempie dallo StateDelta reale e torna vuota', async ({ page }) => {
  // ⛔ 08/10/2026: il flusso finto porta il confine fra storia e presente (aiuto-confine.mjs: senza, la Revisione restava da disegnare)
  await page.route('**/api/v1/sessions/review-real/events*', flussoConConfine);
  await page.route('**/api/v1/sessions/review-vuota/events*', flussoConConfine);
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);

  /** Che cosa mostra DAVVERO la Revisione, guardata come la guarda una persona. */
  const revisione = () => page.evaluate(() => {
    const s = document.querySelector('#schermoReview');
    const visibile = (n) => Boolean(n && !n.hidden && n.getClientRects().length > 0);
    const diff = s.querySelector('.talos-review__diff');
    return {
      vuotoVisibile: visibile(s.querySelector('#vuotoReview')),
      testoVuoto: s.querySelector('#vuotoReview')?.innerText || '',
      diffVisibile: visibile(diff),
      linguette: [...s.querySelectorAll('.talos-review__schede [role="tab"]')].map((b) => b.innerText.replace(/\s+/g, ' ').trim()),
      testo: s.innerText,
      riassunto: s.querySelector('.talos-topbar__path')?.textContent || '',
      /* ⛔ `#copyAllDiffs` è DUPLICATO nel DOM (misurato il 17/09: due nodi con lo stesso id, uno nel
         vecchio pannello `[data-view="diff"]` e uno nella testata della Revisione). Qui si guarda
         quello della superficie in prova, non «il primo che capita» — che è ciò che fa `$()` nel
         prodotto, e infatti l'altro non viene mai aggiornato. Il duplicato è registrato a parte. */
      copiaDisabilitato: [...document.querySelectorAll('#schermoReview #copyAllDiffs')].map((b) => b.disabled),
      quantiCopyAllDiffs: document.querySelectorAll('#copyAllDiffs').length,
      aggiunte: s.querySelectorAll('.talos-diff__line--add').length,
      rimozioni: s.querySelectorAll('.talos-diff__line--del').length,
      percorsoNelDiff: diff?.querySelector('.talos-truncate')?.textContent || '',
      azioniFase3Visibili: [...s.querySelectorAll('[data-richiede="fase3"]')].filter(visibile).length,
    };
  });

  await page.evaluate(() => window.__talosHarnessUiRuntime.executeCommand('review'));
  const vuoto = await revisione();
  expect(vuoto.linguette, 'nessuna linguetta finta su una app appena aperta').toEqual([]);
  expect(vuoto.vuotoVisibile, 'si vede lo stato vuoto, quello vero').toBe(true);
  expect(vuoto.diffVisibile, 'e non un diff di file che nessuno ha scritto').toBe(false);
  /* ⛔ Lo dice lo STATO VUOTO, non la testata: misurato il 17/09 — `renderRealReviewList` scrive
     «Nessuna modifica in questa sessione» in `.talos-topbar__path`, e `aggiornaSommarioReviewReale`
     subito dopo la riscrive con il riassunto della sessione, che a zero file è vuoto; in più quel
     nodo è `display:none` sotto i 900 px di contenitore (`index.css:534`). Asserire lì sarebbe
     asserire un testo che la persona spesso non vede. Qui si guarda la scheda che legge davvero. */
  expect(vuoto.testoVuoto, 'lo stato vuoto lo dice con parole sue').toContain('Nessun file scritto finora');
  expect(vuoto.testo, 'nessuna ricevuta inventata').not.toContain('Ricevuta');
  expect(vuoto.testo, 'nessun numero di giro inventato').not.toContain('giro 5');
  expect(vuoto.testo, 'nessun file inventato').not.toContain('session-registry');
  expect(vuoto.azioniFase3Visibili, 'niente Accetta/Scarta: non hanno una rotta dietro').toBe(0);
  expect(vuoto.copiaDisabilitato.every(Boolean), '«Copia i diff» è spento: non c’è niente da copiare').toBe(true);

  // si riempie dai FATTI, non dal markup
  await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('review-real', 'workspace', 'Review reale', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
  });
  await attendiFineStoria(page);
  await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    const generation = runtime.realSessionState.generation; // la scrittura arriva DAL VIVO, dopo il confine
    runtime.handleRealEvent({ type: 'StateDelta', delta: [{ op: 'replace', path: '/file/src/conto.js', value: 'const a = 2;\nconst b = 3;\n', prima: 'const a = 1;\nconst b = 3;\n' }], _sequenza: 41001 }, generation);
    runtime.executeCommand('review');
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  const pieno = await revisione();
  expect(pieno.linguette.length, 'un file scritto, una linguetta').toBe(1);
  expect(pieno.linguette[0], 'col nome del file e i suoi contatori').toContain('conto.js');
  expect(pieno.vuotoVisibile, 'lo stato vuoto si toglie di mezzo').toBe(false);
  expect(pieno.diffVisibile, 'e compare il diff').toBe(true);
  expect(pieno.percorsoNelDiff, 'il percorso intero sta nella testa del diff').toBe('src/conto.js');
  expect(pieno.aggiunte, 'una riga aggiunta, contata dai fatti').toBe(1);
  expect(pieno.rimozioni, 'una riga tolta').toBe(1);
  expect(pieno.riassunto).toContain('1 file modificato');
  expect(pieno.copiaDisabilitato.every((d) => d === false), 'ora «Copia i diff» si può premere').toBe(true);

  // AL CONTRARIO: una sessione senza scritture riporta lo stato vuoto, non lascia i file di prima
  await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('review-vuota', 'workspace', 'Senza scritture', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
  });
  await attendiFineStoria(page); // il vuoto si guarda a storia FINITA: sotto il velo «vuoto» non diceva niente
  await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.executeCommand('review');
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  const diNuovoVuoto = await revisione();
  expect(diNuovoVuoto.linguette, 'i file della sessione di prima non restano appesi').toEqual([]);
  expect(diNuovoVuoto.vuotoVisibile).toBe(true);
  expect(diNuovoVuoto.diffVisibile).toBe(false);
  expect(diNuovoVuoto.testo).not.toContain('conto.js');
});

/*
 * ⛔ 17/09 — questa prova era rossa perché cercava `.browser-url`, `.browser-real-output` e
 *   `[data-browser-action="back"]`: il pannello del 02/09. Il Browser di oggi (K-I, 06/09, e P0/B
 *   del 16/09) è `#schermoBrowser` con una STRISCIA di letture al posto dei tasti avanti/indietro.
 *   ⛔ Misurato prima di riscrivere, non dedotto: ciò che la prova provava è ancora VERO — nessun
 *   telefono finto all'avvio, le letture di `naviga` compaiono, e si scorre fra loro. Quindi la
 *   prova si porta ai selettori veri tenendo le stesse domande; se la risposta fosse cambiata,
 *   andava segnalata come difetto invece che riscritta (vedi NOTIFICHE-REALI-43 qui sotto).
 */
test('BROWSER-REAL-42 — il Browser parte senza telefono finto, mostra le pagine lette da naviga e si scorre fra le letture', async ({ page }) => {
  await page.route('**/api/v1/sessions/browser-real/events*', async (route) => route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);

  const vuoto = await page.evaluate(() => {
    window.__talosHarnessUiRuntime.executeCommand('browser');
    const s = document.querySelector('#schermoBrowser');
    const visibile = (n) => Boolean(n && !n.hidden && n.getClientRects().length > 0);
    return {
      telefoni: s.querySelectorAll('.phone-frame').length,
      letture: s.querySelectorAll('[data-browser-tab]').length,
      indirizzo: document.querySelector('#urlBrowser')?.value ?? null,
      vuotoVisibile: visibile(document.querySelector('#browserVuoto')),
      testo: s.innerText,
    };
  });
  expect(vuoto.telefoni, 'nessun telefono finto').toBe(0);
  expect(vuoto.letture, 'nessuna lettura inventata su una app appena aperta').toBe(0);
  expect(vuoto.indirizzo, 'e nessun indirizzo scritto nel campo').toBe('');
  expect(vuoto.vuotoVisibile, 'si vede lo stato vuoto, che dice cosa aspettarsi').toBe(true);
  expect(vuoto.testo, 'niente modelli inventati nel pannello').not.toContain('gpt-5.6-sol');

  const letto = await page.evaluate(async () => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('browser-real', 'workspace', 'Browser reale', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    let seq = 42000;
    const leggi = (id, url, testo) => {
      runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'naviga', _sequenza: seq += 1 }, generation);
      runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ url }), _sequenza: seq += 1 }, generation);
      runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: testo, _sequenza: seq += 1 }, generation);
    };
    leggi('n1', 'https://esempio.test/uno', 'Testo della prima pagina');
    leggi('n2', 'https://esempio.test/due', 'Testo della seconda pagina');
    runtime.executeCommand('browser');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const leggiStato = () => ({
      indirizzo: document.querySelector('#urlBrowser')?.value,
      posizione: document.querySelector('#browserPosizione')?.textContent?.trim(),
      provenienza: document.querySelector('#browserProvenienza')?.textContent?.trim(),
      letture: [...document.querySelectorAll('#schermoBrowser [data-browser-tab]')].map((n) => n.getAttribute('aria-selected')),
    });
    const dopoDue = leggiStato();
    document.querySelectorAll('#schermoBrowser [data-browser-tab]')[0].click();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return { dopoDue, dopoIndietro: leggiStato() };
  });
  expect(letto.dopoDue.indirizzo, 'l’ultima lettura è quella mostrata').toBe('https://esempio.test/due');
  expect(letto.dopoDue.posizione, 'e la striscia dice a che punto sei').toBe('Lettura 2 di 2');
  expect(letto.dopoDue.provenienza, 'dichiarando CHI ha letto quella pagina').toContain('Agente');
  expect(letto.dopoDue.letture, 'due letture, l’ultima scelta').toEqual(['false', 'true']);
  expect(letto.dopoIndietro.indirizzo, 'si torna indietro scegliendo la prima lettura').toBe('https://esempio.test/uno');
  expect(letto.dopoIndietro.posizione).toBe('Lettura 1 di 2');
  expect(letto.dopoIndietro.letture, 'la scelta si sposta, non si somma').toEqual(['true', 'false']);
});

/*
 * 31/10/2026: NOTIFICHE-REALI-43, NOTIFICHE-ETA-44 e NOTIFICHE-SALTATA-45 provavano la campanella ricalcolata dall'elenco delle sessioni
 * e dalla posta «Da guardare». Ora le voci vengono dal registro del server (consegna della Frontend, FE-002/042/043): le stesse
 * garanzie (il numero conta solo ciò che aspetta te, nessuna data illeggibile, niente «60 min» né «24 h», un giro saltato ha la sua
 * parola) sono riscritte sul contratto nuovo in `notifiche-pc.spec.mjs`.
 */
