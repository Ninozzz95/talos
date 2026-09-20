import { expect, test } from '@playwright/test';

/*
 * ⛔⛔⛔ BLOCCO 7 (B4) — I DUE FLUSSI A SCHERMO, E IL TONO CHE NON DEVE ESSERE D'ALLARME.
 *
 *   Owner: «B4: separare». La forma è decisa dalla 5×5×5×5 del 20/09/2026: campi strutturati per chi
 *   DISEGNA, il modello continua a leggere la riga fusa.
 *
 * ⛔ E QUESTA PROVA DIFENDE LA COSA PIÙ FACILE DA SBAGLIARE: **stderr non è un errore.**
 *   Hermes, nel suo codice: «many CLIs use stderr for informational messages (npm progress, git
 *   hints), so we deliberately don't paint stderr destructively even though it's tagged». La
 *   specifica MCP: il client non deve presumere che stderr indichi un errore. ⇒ Le due sezioni
 *   devono avere **lo stesso colore**: se qualcuno tinge di rosso la diagnostica, l'avanzamento di
 *   `npm` diventa un guasto — ed è esattamente ciò che questa prova impedisce.
 *
 * ⛔ E IL VERSO CONTRARIO, che è la retrocompatibilità: un esito **senza** i due campi (cioè ogni
 *   sessione registrata prima di oggi) si disegna come prima, fuso, senza sezioni.
 */
test.use({ locale: 'it-IT' });

async function scena(page, { conFlussi, colorMode = 'dark', codice = 0, stdoutVuoto = false, attrezzo = 'shell', contenuto = null }) {
  /*
   * ⛔ Il tema si scrive PRIMA di `goto`, in `addInitScript`: la preferenza salvata è letta all'avvio,
   *   e una foto in tema chiaro presa dopo il montaggio mostrerebbe la superficie sbagliata.
   */
  await page.addInitScript(({ colorMode }) => {
    try {
      window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' }, chat: {}, workspaces: {} }));
    } catch {}
  }, { colorMode });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await page.evaluate(({ conFlussi, codice, stdoutVuoto, attrezzo, contenuto }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('flussi-separati', 'workspace', 'Flussi', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    let seq = 99000;
    const evento = (e) => r.handleRealEvent({ ...e, _sequenza: seq += 1 }, g);
    evento({ type: 'RunStarted', input: { consegna: 'esegui' }, contesto: { cartella: 'C:\\progetti\\talos-prova', modello: 'glm-5.3-flash' } });
    evento({ type: 'ToolCallStart', toolCallId: 'fl1', toolCallName: attrezzo, giro: 1 });
    evento({ type: 'ToolCallArgs', toolCallId: 'fl1', delta: JSON.stringify(attrezzo === 'shell' ? { comando: 'npm run build' } : { percorso: 'note.md' }) });
    /* ⛔ Il comando fermato dal tempo massimo arriva con errore FALSO — sono le parole del contratto
       di casa: «il kernel lo annuncia come RIUSCITO: è la bugia peggiore dell'intera catena». Se qui
       mettessi `errore: true` la prova non proverebbe niente, perche' il pallino lo deciderebbe
       l'evento e non il testo dell'esito. */
    const base = { type: 'ToolCallResult', toolCallId: 'fl1', errore: codice !== 0 && codice !== 'null', ricevutoA: 2000 };
    const corpo = '> build\n> node scripts/build.mjs\n\nBuild pronta\nnpm notice Changelog';
    /*
     * ⛔ LA FORMA VERA, non una comoda. Il kernel non scrive `[sandbox: none]`: scrive l'etichetta
     *   SPIEGATA (`etichettaSandbox`), e con la forma corta questa prova era **cieca** a un difetto
     *   misurato — `dovEGirato` confrontava il livello esatto e restituiva `null` per tutte e tre le
     *   forme vere, quindi il «dove» non arrivava mai a schermo. Stessa cecità della prova del tetto:
     *   un caso che il prodotto non produce non difende niente.
     */
    const testa = `exit ${codice} [sandbox: none (cmd.exe nativo: stesso utente e stessi privilegi del processo, nessun isolamento)]`;
    const testo = contenuto !== null ? contenuto : `${testa}\n${corpo}`;
    evento(conFlussi
      ? { ...base, content: testo, stdout: stdoutVuoto ? '' : '> build\n> node scripts/build.mjs\n\nBuild pronta', stderr: 'npm notice Changelog', exitCode: typeof codice === 'number' ? codice : null }
      : { ...base, content: testo });
  }, { conFlussi, codice, stdoutVuoto, attrezzo, contenuto });
  await page.waitForTimeout(700);
  /*
   * ⛔ Il blocco nasce CHIUSO — `aria-expanded="false"` nasconde `.talos-tool-row__body` — quindi
   *   senza aprirlo non si guarda niente: la prima stesura di questa prova misurava zero sezioni su
   *   una scena che le aveva, solo perché nessuno aveva aperto la riga.
   *   L'interruttore è la RIGA (`#conversation .talos-tool-row`), non un bottone dentro di lei.
   */
  const riga = page.locator('#conversation .talos-tool-row').first();
  await expect(riga, 'la scena non si è formata: nessuna riga di attrezzo').toHaveCount(1);
  /*
   * ⛔ APERTURA PER VIA DIRETTA, E DICHIARATA. La riga nasce dentro un contenitore chiuso e il suo
   *   interruttore non è raggiungibile da qui: `click` va in timeout (provato). Questa prova NON è
   *   sull'apertura — quella ha le sue — è su COME si disegnano i due flussi quando si vedono:
   *   quindi si apre il contenitore in modo diretto, e lo si scrive qui invece di far finta che sia
   *   stato un clic.
   */
  await page.evaluate(() => {
    for (const n of document.querySelectorAll('#conversation [aria-expanded="false"]')) n.setAttribute('aria-expanded', 'true');
    for (const n of document.querySelectorAll('#conversation [hidden]')) n.hidden = false;
  });
  await page.waitForTimeout(300);
}

const MISURA = `(() => {
  const sezioni = [...document.querySelectorAll('.tool-stream')].filter((n) => n.getClientRects().length > 0);
  const pre = [...document.querySelectorAll('.tool-result-block')].filter((n) => n.getClientRects().length > 0);
  return {
    sezioni: sezioni.length,
    etichette: sezioni.map((s) => (s.querySelector('.tool-stream__etichetta')?.textContent || '').trim()),
    colori: sezioni.map((s) => getComputedStyle(s.querySelector('.tool-stream__etichetta')).color),
    blocchiFusi: pre.length,
    testo: (document.querySelector('#conversation')?.textContent || '').includes('npm notice Changelog'),
    /* ⛔ QUALI intestazioni d'esito si vedono a schermo, per esteso: con uscita 0 non deve comparirne
       nessuna, con uscita diversa da zero sì. Si leggono tutte, così l'asserzione dice anche QUALE. */
    /* ⛔ LA RIGA D'ESITO E' IL BLOCCO FIGLIO DIRETTO del corpo: le due sezioni stanno dentro
       .tool-stream, quindi i loro corpi sono NIPOTI. Cosi' si distingue senza inventare una classe
       apposta per la prova. (E si legge il testo dei BLOCCHI, non con una regex sul testo della
       conversazione: dentro un template literal l'escape della parentesi quadra si perde, e la
       regex cerca un'altra cosa — successo davvero: il blocco c'era, la misura diceva zero.) */
    righeEsito: [...document.querySelectorAll('#conversation .talos-tool-row__body > .tool-result-block')]
      .filter((n) => n.getClientRects().length > 0)
      .map((n) => (n.textContent || '').trim()),
    /* ⛔ La riga dell'attrezzo: il pallino e il suo stato. Serve al caso exit null, dove il difetto
       era un VERDE su un comando ucciso dal tempo massimo. */
    /* Le etichette DI CONTENITORE (tool-arg-key): dopo la ricerca del 20/09/2026 non ce n'e' nessuna,
       l'unico livello di etichettatura sono le due sezioni. */
    etichetteContenitore: [...document.querySelectorAll('#conversation .talos-tool-row__body > .tool-arg-key')]
      .filter((n) => n.getClientRects().length > 0)
      .map((n) => (n.textContent || '').trim()),
    statoRiga: document.querySelector('#conversation .talos-tool-row')?.dataset.toolState || null,
    pallino: document.querySelector('#conversation .talos-tool-row .talos-dot')?.className || null,
    /*
     * ⛔ IL CORPO DEL BLOCCO HA UN TETTO (index.css:643, max-height 240px con overflow auto) e scorre
     *   dentro di sé: nella foto a pagina intera la sezione «DIAGNOSTICA» resta SOTTO il bordo. Prima
     *   di chiamarlo difetto si misura se è una REGRESSIONE — cioè se il contenuto è più alto di
     *   prima — perché lo stesso tetto valeva per il blocco fuso, che portava lo stesso testo.
     */
    corpoBlocco: (() => {
      const c = [...document.querySelectorAll('#conversation .talos-tool-row__body')].filter((n) => n.getClientRects().length > 0)[0];
      /* ⛔ larghezza utile contro larghezza totale: se differiscono c'è una BARRA DI SCORRIMENTO
         verticale — ed è quello che nella foto sembra una banda al bordo destro del blocco. */
      /* ⛔ E IL TETTO si legge dalla proprieta' max-height, non dall'altezza: il revisore avversario
         ha mostrato che un confronto sull'altezza resta VERDE anche togliendo del tutto il tetto —
         perche' 230 px e' il CONTENUTO, non il tetto. Un'asserzione che resta verde col tetto
         cancellato non difende niente. */
      return c ? { cliente: c.clientHeight, contenuto: c.scrollHeight, utile: c.clientWidth, totale: c.offsetWidth, tetto: getComputedStyle(c).maxHeight } : null;
    })(),
    /* ⛔ E DOVE FINISCONO QUEGLI 86 PX: il conto dei figli del corpo, uno per uno. */
    voci: (() => {
      const c = [...document.querySelectorAll('#conversation .talos-tool-row__body')].filter((n) => n.getClientRects().length > 0)[0];
      if (!c) return [];
      return [...c.children].map((n) => ({ c: n.className || n.tagName, h: Math.round(n.getBoundingClientRect().height) }));
    })(),
  };
})()`;

/*
 * ⛔ L'INQUADRATURA SI DERIVA DALLE SEZIONI MISURATE, non da una coordinata scritta a mano.
 *   Il primo tentativo la calcolava da `locator('.tool-stream').first().boundingBox()`: `.first()` è il
 *   primo nel DOM, non la sezione VISIBILE che la misura conta, e la foto è uscita con la testata
 *   dell'app al posto del blocco — cioè una foto che non provava niente, presa per buona.
 *   Qui la scatola è l'unione delle stesse sezioni che `MISURA` filtra per `getClientRects()`, e
 *   l'altezza minima la fa FALLIRE invece di produrre in silenzio un'inquadratura sbagliata.
 */
const SCATOLA = `(() => {
  const sez = [...document.querySelectorAll('.tool-stream')].filter((n) => n.getClientRects().length > 0);
  if (sez.length === 0) return null;
  /* ⛔ L'INQUADRATURA È IL CORPO DEL BLOCCO, NON LE DUE SEZIONI. Dentro il corpo ci stanno anche
     l'etichetta «Esito:» e la riga \`exit … [sandbox: …]\` — che è esattamente la cosa che la prima
     foto ha trovato PERSA: inquadrando le sole sezioni, la riga dell'esito resterebbe fuori dall'obiettivo
     e la prossima volta che sparisce non si vedrebbe di nuovo. */
  const corpi = [...new Set(sez.map((n) => n.closest('.talos-tool-row__body') || n))];
  const r = corpi.map((n) => n.getBoundingClientRect());
  const x = Math.min(...r.map((b) => b.x)), y = Math.min(...r.map((b) => b.y));
  const x2 = Math.max(...r.map((b) => b.x + b.width)), y2 = Math.max(...r.map((b) => b.y + b.height));
  return { x: x + window.scrollX, y: y + window.scrollY, width: x2 - x, height: y2 - y };
})()`;

async function foto(page, nome) {
  /*
   * ⛔ PRIMA SI PORTA IL BLOCCO DENTRO LA FINESTRA — ed è questo, non le coordinate, il difetto che ha
   *   sciupato le prime due foto. `getClientRects().length > 0` è vero anche per una sezione scorsa
   *   **sopra** il bordo: misurate a **y = −172 e −58**, dentro lo scroller della chat. Il ritaglio
   *   partiva da lì, il `Math.max(0, …)` lo riportava a zero e la foto inquadrava la testata dell'app.
   *   La guardia sull'altezza non poteva accorgersene: l'altezza era giusta. Serviva quella qui sotto.
   */
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('.tool-stream')].filter((n) => n.getClientRects().length > 0);
    (s[0]?.closest('.talos-tool-row__body') || s[0])?.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(400);
  const b = await page.evaluate(SCATOLA);
  /* ⛔ Una prova che scrive una foto DICHIARA dove ha inquadrato: senza questo numero, una foto
     sbagliata si guarda e si butta senza sapere perché — ed è quello che è successo al primo giro. */
  console.log(`INQUADRATURA-${nome} = ${JSON.stringify(b)}`);
  expect(b, 'nessuna sezione visibile: non c\'è niente da fotografare').not.toBeNull();
  /* ⛔ E LA GUARDIA CHE AL PRIMO GIRO NON C'ERA: le sezioni devono stare DENTRO la finestra. */
  const dentro = await page.evaluate(() => {
    const sez = [...document.querySelectorAll('.tool-stream')].filter((n) => n.getClientRects().length > 0);
    const corpi = [...new Set(sez.map((n) => n.closest('.talos-tool-row__body') || n))];
    return corpi.every((n) => { const r = n.getBoundingClientRect(); return r.y >= 0 && r.y + r.height <= innerHeight; });
  });
  expect(dentro, 'le sezioni sono fuori dalla finestra: la foto inquadrerebbe un\'altra cosa').toBe(true);
  expect(b.height, 'inquadratura troppo bassa: la foto non conterrebbe le due sezioni').toBeGreaterThan(40);
  /* ⛔ DUE FOTO, e servono a due domande diverse: la PAGINA INTERA dà il contesto (ed è la forma
     chiesta dalla regola di verifica), il DETTAGLIO rende leggibile il blocco. La prima foto del
     blocco, da sola, aveva inquadrato la testata senza che niente lo dicesse. */
  await page.screenshot({ path: `../../artifacts/blocco7/${nome}.png` });
  await page.screenshot({
    path: `../../artifacts/blocco7/${nome}-blocco.png`,
    clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 34), width: b.width + 24, height: b.height + 46 },
  });
}

test('B4 — con i due flussi: due sezioni etichettate, e stderr NON è un allarme', async ({ page }) => {
  await scena(page, { conFlussi: true });
  const m = await page.evaluate(MISURA);
  console.log(`MISURA-FLUSSI-SEPARATI = ${JSON.stringify(m)}`);
  expect(m.sezioni, 'le due sezioni non si sono disegnate').toBe(2);
  expect(m.etichette).toEqual(['Uscita', 'Diagnostica']);
  /* ⛔ IL PUNTO: stesso colore. Un rosso qui dipingerebbe da guasto l'avanzamento di npm. */
  expect(m.colori[0], 'la sezione della diagnostica è tinta in modo diverso dall\'uscita: stderr NON è un errore').toBe(m.colori[1]);
  /*
   * ⛔ «QUARTA STRADA» (owner 20/09/2026) — l'esito con uscita ZERO non si scrive.
   *   Le tre fonti stanno su `rigaEsitoDaMostrare` in `components/esito-comando.js`; in una riga:
   *   `exit 0` non aggiunge niente che la riga dell'attrezzo non dica già, e timbrato su ogni comando
   *   rende invisibile il caso che conta. I casi ≠ 0 e «fermato» hanno la loro prova qui sotto:
   *   insieme dicono che la regola è «si dichiara l'eccezione», non «si toglie la riga».
   */
  expect(m.righeEsito, 'con uscita 0 la riga dell\'esito non si deve scrivere').toEqual([]);
  /*
   * ⛔ E UN SOLO LIVELLO DI ETICHETTATURA (owner 20/09/2026 notte, ricerca in
   *   `.claude/RICERCA-5x5x5x5-ETICHETTA-ESITO-2026-09-20.md`): «Esito:» stava SOPRA «USCITA» — due
   *   etichette una sopra l'altra, il caso che la guida di sistema chiama difetto e che non introduce
   *   più niente da quando la testata del kernel non si scrive nel caso riuscito. Restano le due
   *   sezioni, che sono il livello che ha anche Hermes.
   */
  expect(m.etichetteContenitore, 'l\'etichetta «Esito:» non si deve più disegnare').toEqual([]);
  /* ⛔ E IL TETTO, misurato DOVE STA — non dedotto dall'altezza. Il revisore avversario ha mostrato
     che un confronto sull'altezza resta verde anche cancellando del tutto il tetto. */
  expect(m.corpoBlocco.tetto, 'il tetto per un blocco a due flussi non è più 480').toBe('480px');
  /*
   * ⛔ E NIENTE RESTA SOTTO IL BORDO. Il corpo del blocco ha un tetto e scorre dentro di sé: al primo
   *   giro con i due flussi il contenuto misurava 316 px contro un tetto di 240, e «Diagnostica» non
   *   si vedeva — cioè la separazione non si vedeva. Se il tetto torna a tagliarla, questa è rossa.
   */
  expect(m.corpoBlocco.contenuto, 'la seconda sezione resta sotto il bordo del blocco: non si vede')
    .toBeLessThanOrEqual(m.corpoBlocco.cliente);
  /* ⛔ E LA FOTO, perché il colore calcolato dice «stesso tono» ma non dice se si LEGGE. */
  await foto(page, 'due-flussi-scuro');
});

/*
 * ⛔ IL SECONDO TEMA, perché una superficie provata in un tema solo è provata a metà: l'etichetta è
 *   `--talos-muted`, e su fondo chiaro è il caso in cui può sparire. Stessa scena, stessa misura.
 */
test('B4 — la stessa scena in TEMA CHIARO, con la foto', async ({ page }) => {
  await scena(page, { conFlussi: true, colorMode: 'light' });
  const m = await page.evaluate(MISURA);
  console.log(`MISURA-FLUSSI-CHIARO = ${JSON.stringify(m)}`);
  expect(m.sezioni, 'le due sezioni non si sono disegnate in tema chiaro').toBe(2);
  expect(m.etichette).toEqual(['Uscita', 'Diagnostica']);
  expect(m.colori[0], 'in tema chiaro la diagnostica è tinta in modo diverso dall\'uscita').toBe(m.colori[1]);
  await foto(page, 'due-flussi-chiaro');
});

/*
 * ⛔ IL VERSO CHE CONTA — uscita ≠ 0: la riga SI SCRIVE. Senza questa prova, «togli la riga» e
 *   «mostrala solo quando serve» sarebbero indistinguibili — ed è la differenza fra la quarta strada
 *   e la seconda.
 * ⛔ E SI SCRIVE NELLE PAROLE DI CASA, non col grezzo del kernel: `exit 1` e `[sandbox: none]` sono
 *   nomi tecnici, vietati a schermo dal 04/09 — la stessa ragione per cui esiste `dovEGirato`. Il
 *   verdetto e il posto li compone `rigaDiStatoComando`, che è già quello del comando della persona.
 */
test('⛔ B4 — uscita diversa da zero: la riga dell\'esito si scrive, in italiano', async ({ page }) => {
  await scena(page, { conFlussi: true, codice: 1 });
  const m = await page.evaluate(MISURA);
  console.log(`MISURA-FLUSSI-ERRORE = ${JSON.stringify(m)}`);
  expect(m.sezioni, 'le due sezioni non si sono disegnate').toBe(2);
  expect(m.righeEsito, 'con uscita diversa da zero la riga dell\'esito ci deve essere')
    .toEqual(['Non riuscito · codice 1 · su Windows, senza isolamento']);
});

/*
 * ⛔ E IL CASO PEGGIORE, quello che il revisore avversario ha MISURATO sulla strada vera: `exit null`
 *   esce quando un comando supera il tempo massimo (120 s) — e il kernel lo annuncia come RIUSCITO.
 *   La regex che avevo scritto (`/^exit\s+(\d+)\b/`) non riconosceva né `null` né un codice negativo:
 *   la riga spariva e il pallino restava **verde** su un comando ucciso a metà.
 *   ⇒ Qui si difendono TUTTE E DUE le cose: la riga c'è, e la riga dell'attrezzo NON è verde.
 */
test('⛔ B4 — fermato dal tempo massimo (exit null): la riga c\'è, e il pallino NON è verde', async ({ page }) => {
  await scena(page, { conFlussi: true, codice: 'null' });
  const m = await page.evaluate(MISURA);
  console.log(`MISURA-FLUSSI-FERMATO = ${JSON.stringify(m)}`);
  /* ⛔ E LA CAUSA NON SI INVENTA: `exit null` dalla strada Windows NON può essere il tempo massimo —
     il kernel normalizza (`fermatoDalTempo ? 124 : codice`), quindi un codice nullo lì è un processo
     ucciso da un segnale. La riga dice il fatto che sappiamo, non una causa che da qui non si vede. */
  expect(m.righeEsito, 'un comando senza codice d\'uscita deve DICHIARARLO, senza inventare la causa')
    .toEqual(['Fermato: il comando non ha restituito un codice d\'uscita · su Windows, senza isolamento']);
  expect(m.righeEsito[0], 'il «tempo massimo» non si nomina: da questa strada non è verificabile')
    .not.toContain('tempo massimo');
  expect(m.statoRiga, 'un comando ucciso dal tempo massimo non è un successo').toBe('error');
  expect(m.pallino, 'il pallino non deve essere quello del successo').toContain('talos-dot--danger');
});

/*
 * ⛔ UN CAMPO VUOTO NON È UN FLUSSO. Il kernel non manda stringhe vuote, ma la UI non deve dipendere
 *   da quella promessa: con `stdout: ''` si disegnava un riquadro etichettato e VUOTO, e con tutti e
 *   due vuoti il contenuto spariva del tutto. Il commento lo prometteva; il codice no.
 */
test('⛔ B4 — un flusso vuoto non si disegna: niente riquadro bianco', async ({ page }) => {
  await scena(page, { conFlussi: true, stdoutVuoto: true });
  const m = await page.evaluate(MISURA);
  console.log(`MISURA-FLUSSI-VUOTO = ${JSON.stringify(m)}`);
  expect(m.sezioni, 'una sezione vuota non si disegna').toBe(1);
  expect(m.etichette).toEqual(['Diagnostica']);
});

/*
 * ⛔ L'ESITO DICE **DOVE** È GIRATO — ed è la promessa centrale di PO-06: «quel comando NON è girato
 *   su Windows, è girato dentro Linux. Chi scrive un comando crede di parlare alla propria macchina:
 *   se non è così, si dice». Era **inerte** da quando esiste `etichettaSandbox`: `dovEGirato`
 *   confrontava il livello esatto contro un'etichetta spiegata, e restituiva `null` per tutte e tre le
 *   forme vere. La prova qui sopra, che ora inietta la forma vera, diventa rossa se qualcuno lo rompe.
 */

/*
 * ⛔ E LA RIGA SI DISEGNA **PER ENTRAMBI I RAMI**: viveva solo dentro quello a due flussi, e poiché la
 *   testata si toglie a ogni attrezzo, un esito senza i due campi (una `prova`, o una sessione
 *   registrata prima di oggi) perdeva `exit 127` **senza rimpiazzo** — informazione tolta e non
 *   ridata, che è peggio di un'etichetta di troppo.
 */
test('⛔ B4 — uscita diversa da zero SENZA i due campi: la riga si disegna anche nel fuso', async ({ page }) => {
  await scena(page, { conFlussi: false, codice: 1 });
  const m = await page.evaluate(MISURA);
  console.log(`MISURA-FLUSSI-FUSO-ERRORE = ${JSON.stringify(m)}`);
  expect(m.sezioni, 'senza i campi non deve comparire nessuna sezione').toBe(0);
  expect(m.righeEsito[0], 'la riga dell\'esito deve esserci anche nel ramo fuso, o l\'informazione è tolta e non ridata')
    .toBe('Non riuscito · codice 1 · su Windows, senza isolamento');
  expect(m.righeEsito[1] || '', 'e il testo del comando resta sotto, senza la testata grezza')
    .toContain('Build pronta');
});

/*
 * ⛔⛔ LA CURA PARLA DI COMANDI SOLO QUANDO È UN COMANDO — terzo referto avversario, 20/09/2026.
 *   L'esito di un `leggi` **è il contenuto grezzo del file** (`kernelPerIlBanco.js:39`), la testata
 *   del kernel è riconosciuta in qualunque testo, e il gruppo `[sandbox: …]` è opzionale: bastava un
 *   file che comincia con `exit 0` per perdere **la prima riga**, e uno con `exit 1` per farsi
 *   dichiarare addosso **un verdetto di comando** — mentre il pallino della riga restava verde, cioè
 *   due affermazioni contraddittorie nello stesso blocco.
 */
test('⛔ B4 — un `leggi` non è un comando: il contenuto del file resta INTATTO', async ({ page }) => {
  const file = 'exit 1\nvalore due\nvalore tre';
  await scena(page, { conFlussi: false, attrezzo: 'leggi', contenuto: file });
  const m = await page.evaluate(MISURA);
  console.log(`MISURA-FLUSSI-LEGGI = ${JSON.stringify(m)}`);
  expect(m.righeEsito.length, 'su una lettura non si disegna nessuna riga d\'esito').toBe(1);
  expect(m.righeEsito[0].startsWith('exit 1'), 'la prima riga del FILE è stata mangiata: non è una testata, è contenuto').toBe(true);
  expect(m.righeEsito[0], 'il file deve esserci tutto').toContain('valore tre');
  expect(m.righeEsito.join(' '), 'la chat non deve dichiarare un esito di comando su una LETTURA')
    .not.toContain('Non riuscito · codice');
});

test('⛔ B4, AL CONTRARIO — senza i due campi si disegna il fuso, come per le sessioni vecchie', async ({ page }) => {
  await scena(page, { conFlussi: false });
  const m = await page.evaluate(MISURA);
  console.log(`MISURA-FLUSSI-FUSI = ${JSON.stringify(m)}`);
  expect(m.sezioni, 'senza i campi non deve comparire nessuna sezione').toBe(0);
  expect(m.blocchiFusi, 'il blocco fuso deve restare: è la lettura delle sessioni registrate prima di oggi').toBeGreaterThan(0);
  expect(m.testo, 'il testo del comando deve esserci tutto').toBe(true);
  /* ⛔ E LA «QUARTA STRADA» VALE ANCHE QUI: la regola è una sola, non una per ramo — altrimenti lo
     stesso identico comando mostrerebbe la riga o no a seconda che il backend abbia mandato i due
     campi, che è esattamente il genere di incoerenza che non si deve poter vedere.
     Nel fuso il figlio diretto è il blocco stesso: si guarda che NON cominci con la testata grezza. */
  expect(m.righeEsito.every((t) => !t.startsWith('exit ')), 'nel blocco fuso la testata grezza del kernel non si deve scrivere').toBe(true);
  expect(m.righeEsito.some((t) => t.includes('Build pronta')), 'l\'output deve esserci tutto').toBe(true);
  /* ⛔ E IL TETTO DEL FUSO NON SI È MOSSO, misurato DOVE STA: la cura del 10/09 contro l'output che
     allaga la chat vale per il blocco fuso come prima. Se qualcuno alza il tetto a tutti invece che
     ai soli due flussi, questa è rossa — e se qualcuno LO CANCELLA, pure. */
  expect(m.corpoBlocco.tetto, 'il tetto del blocco fuso è cambiato: non doveva').toBe('240px');
  expect(m.corpoBlocco.cliente, 'il blocco fuso non deve superare il suo tetto').toBeLessThanOrEqual(240);
});
