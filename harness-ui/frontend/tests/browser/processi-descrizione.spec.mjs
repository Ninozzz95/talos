import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BLOCCO 4 — LA RIGA DEI PROCESSI, MISURATA SULLA PAGINA VERA.
 *
 * ⛔ PERCHÉ QUESTA PROVA ESISTE, e la ragione è una bocciatura. Le tre asserzioni unitarie di
 *   `tests/unit/inspector-processi.test.mjs` girano su un DOM finto che **non ha foglio di stile**:
 *   il revisore avversario le ha superate con mutazioni **solo CSS** (`posto-nascosto`, testo del
 *   colore del fondo) — **zero rossi su 14**, e a schermo otto righe **VUOTE** alte 109 px.
 *   ⇒ Una prova che non carica il foglio non può vedere una regressione del foglio. Questa sì: qui
 *     si misura il RETTANGOLO DISEGNATO, non una proprietà di JavaScript.
 *
 * ⛔ E si misura la cosa che l'owner ha contestato dalla foto: le righe del comando occupavano
 *   quattro-sei righe ciascuna. Si pretende che una riga con la descrizione stia in UNA riga di
 *   testo, e che il comando NON sia disegnato finché non si apre il dettaglio.
 */

test.use({ locale: 'it-IT' });

async function apriProcessi(page) {
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.locator('.talos-nav-item[data-vaia="chat"]').click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  /* tre comandi: due con la descrizione del modello, uno senza. Il primo è LUNGO (un `for` su più
     righe), che è il caso della foto dell'owner. */
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('processi-descrizione', 'workspace', 'Prove', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const generation = runtime.realSessionState.generation;
    let seq = 90000;
    const evento = (e) => runtime.handleRealEvent({ ...e, _sequenza: seq += 1 }, generation);
    const comandoLungo = 'cd tasktest2 && for f in dati/test_dati_*.js dati/test_dati_extra.js calcoli/test_calcoli.js; do echo "== $f =="; node "$f"; done; echo "DEMO: node main.js"';
    const casi = [
      ['d1', comandoLungo, 'Esegue tutti i test e la demo del registro spese'],
      ['d2', 'git status --short', 'Controllo cosa ho modificato'],
      ['d3', 'ls -la', null],
      /* ⛔ Il caso dell'ESPANSA: un comando con SEI interruzioni di riga VERE. È quello su cui il
         revisore ha misurato il falso del commit `08a046c1` — 72 px (4 righe) invece di 126 (7) —
         perché `white-space:pre-wrap` non si applicava mai. Senza questa riga l'espansa non si
         potrebbe provare: un comando su una riga sola non distingue `pre-wrap` da `normal`. */
      ['d4', 'cd spese\nnode --test\nfor f in a b c; do\n  echo "$f"\ndone\necho fine\necho "== fatto =="', 'Rifà tutta la verifica del registro spese'],
    ];
    for (const [id, comando, descrizione] of casi) {
      evento({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', ricevutoA: 1000, giro: 1 });
      evento({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify(descrizione ? { comando, descrizione } : { comando }) });
      evento({ type: 'ToolCallResult', toolCallId: id, ricevutoA: 2000, errore: false, uscita: 0 });
    }
  });
  await page.locator('[data-rail="processi"]').click();
  await page.waitForTimeout(600);
}

/*
 * ⛔⛔ PERCHÉ QUESTA MISURA PORTA ANCHE GLI STILI CALCOLATI — 20/09/2026, sera.
 *   Il revisore avversario ha **bucato questa prova con del solo CSS**: `color:transparent` sul titolo
 *   e `clip-path:inset(0 0 100% 0)` non cambiano di un pixel la SCATOLA, e i rettangoli erano tutto
 *   ciò che si misurava ⇒ **sei verdi, zero rossi**, con otto righe VUOTE a schermo.
 *   ⇒ Un rettangolo dice dove sta il testo, non se è INCHIOSTRO. Le tre cose che lo fanno sparire
 *     senza toccare il rettangolo sono: il colore (trasparente, o uguale al fondo), `clip-path`, e
 *     l'opacità del nodo o di un antenato. Si misurano tutte e tre, e si misura il fondo VERO
 *     risalendo gli antenati — «del colore del fondo» è la sparizione che nessuno vede.
 */
const MISURA = `(() => {
  const righe = [...document.querySelectorAll('.talos-process')].filter((r) => r.getClientRects().length > 0);
  const alto = (n) => (n && n.getClientRects().length ? Math.round(n.getBoundingClientRect().height) : 0);
  /* Il fondo che si vede DIETRO al nodo: il primo antenato che dichiara un colore opaco. */
  const fondoDietro = (nodo) => {
    for (let n = nodo; n; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor || '';
      const m = c.match(/^rgba?\\(([^)]+)\\)$/);
      if (!m) continue;
      const p = m[1].split(',').map((x) => parseFloat(x));
      if (p.length < 4 || p[3] > 0.5) return c.replace(/\\s+/g, '');
    }
    return String(getComputedStyle(document.body).backgroundColor).replace(/\\s+/g, '');
  };
  /*
   * ⛔⛔ E IL VESTITO SI GUARDA SU TUTTA LA CATENA, NON SUL SOLO NODO — 20/09/2026, dalla review.
   *   La prima stesura leggeva opacity, clip-path e color **del nodo e basta**, e il revisore
   *   l'ha bucata in due modi che lasciano la scena identica a una riga vuota:
   *     · opacity:0 su un ANTENATO (la classe talos-process__testo): tre verdi, zero rossi;
   *     · -webkit-text-fill-color:transparent sul nodo: quattro verdi, e **nessuno** dei cinque
   *       controlli scattava — il colore lo dipinge un'altra proprietà.
   *   ⇒ Si cammina la catena: l'opacità si MOLTIPLICA, visibility e clip-path si ereditano, e
   *     l'inchiostro è -webkit-text-fill-color quando non vale currentColor.
   *   ⛔ E niente virgolette inverse qui dentro: questa è una stringa-template e una virgoletta
   *     inversa in un commento la CHIUDE. Sesta volta in un giorno.
   */
  const stile = (nodo) => {
    if (!nodo) return null;
    const s = getComputedStyle(nodo);
    let opacita = 1, clip = 'none', visibilita = 'visible', su = nodo;
    while (su) {
      const c = getComputedStyle(su);
      /* ⛔ parseFloat(c.opacity) || 1 SEMBRA innocuo ed è il difetto: **zero è falsy**, quindi un
         antenato con opacity:0 moltiplicava per UNO — e la prova restava verde su una scena con i
         titoli invisibili. Una misura che non può fallire non sta misurando. */
      const o = Number.parseFloat(c.opacity);
      opacita *= Number.isFinite(o) ? o : 1;
      if (clip === 'none' && c.clipPath && c.clipPath !== 'none') clip = c.clipPath;
      if (c.visibility === 'hidden') visibilita = 'hidden';
      su = su.parentElement;
    }
    /* Il colore con cui il testo è DIPINTO: -webkit-text-fill-color vince su color, e vale
       currentColor quando non è dichiarato. Niente virgolette inverse: stringa-template. */
    const riempi = String(s.webkitTextFillColor || '').replace(/\\s+/g, '');
    const colore = (riempi && riempi !== 'currentcolor' ? riempi : s.color).replace(/\\s+/g, '');
    return {
      visibility: visibilita,
      color: colore,
      clipPath: clip,
      opacity: opacita,
      fontSize: parseFloat(s.fontSize),
      fondo: fondoDietro(nodo),
    };
  };
  return righe.map((r) => {
    const t = r.querySelector('.talos-process__titolo');
    const c = r.querySelector('.talos-process__cmd');
    return {
      titolo: (t?.textContent || '').trim().slice(0, 40),
      altezzaTitolo: alto(t),
      altezzaComando: alto(c),
      altezzaRiga: alto(r),
      stileTitolo: stile(t),
      stileComando: stile(c),
    };
  });
})()`;

/** Quanto è opaco un colore CSS: 1 per `rgb(…)`, l'alfa per `rgba(…)`. */
function alfa(colore) {
  const m = String(colore || '').match(/^rgba?\(([^)]+)\)$/);
  if (!m) return 1;
  const p = m[1].split(',').map((x) => parseFloat(x));
  return p.length < 4 ? 1 : p[3];
}

/**
 * L'inchiostro si vede: non è nascosto, non è trasparente, non è del colore del fondo, non è
 * ritagliato via, e ha una dimensione. È il buco che il revisore ha trovato — tre mutazioni di
 * solo CSS che passavano tutta la suite.
 */
function pretendiInchiostro(stile, chi, dove) {
  expect(stile, `${dove} «${chi}»: il nodo non esiste, non c'è inchiostro da guardare`).not.toBeNull();
  expect(stile.visibility, `${dove} «${chi}»: \`visibility: hidden\` — è una riga che occupa spazio e non si vede`).not.toBe('hidden');
  expect(stile.opacity, `${dove} «${chi}»: opacità ${stile.opacity} — il testo c'è ma è spento`).toBeGreaterThan(0.5);
  expect(stile.clipPath, `${dove} «${chi}»: \`clip-path: ${stile.clipPath}\` — il rettangolo resta, l'inchiostro no`).toBe('none');
  expect(alfa(stile.color), `${dove} «${chi}»: colore ${stile.color}, cioè trasparente — una riga vuota`).toBeGreaterThan(0.5);
  expect(stile.color, `${dove} «${chi}»: il testo è del colore del fondo (${stile.color}) — si legge solo se lo si seleziona`).not.toBe(stile.fondo);
  expect(stile.fontSize, `${dove} «${chi}»: corpo ${stile.fontSize} px`).toBeGreaterThan(0);
}

for (const tema of ['dark', 'light']) {
  test(`PROCESSI-DESCRIZIONE (${tema}) — la riga chiusa è una riga: la descrizione sì, il comando no`, async ({ page }) => {
    await page.addInitScript(({ colorMode }) => {
      if (window.top !== window) return;
      try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); }
      catch { /* finestra privata */ }
    }, { colorMode: tema });
    await apriProcessi(page);
    const m = await page.evaluate(MISURA);
    console.log(`MISURA-PROCESSI-DESCRIZIONE ${tema} = ${JSON.stringify(m)}`);
    /* ⛔ LA PREMESSA: tre righe, o la scena non si è formata. */
    expect(m.length, 'la scena non si è formata: la scheda Processi non ha righe').toBeGreaterThanOrEqual(3);

    const conDescrizione = m.filter((r) => r.titolo.length > 0);
    const senzaDescrizione = m.filter((r) => r.titolo.length === 0);

    /* 1. CON la descrizione: il titolo si DISEGNA (altezza > 0) e il comando NO. */
    expect(conDescrizione.length, 'nessuna riga con la descrizione: la scena non si è formata').toBeGreaterThanOrEqual(2);
    for (const r of conDescrizione) {
      expect(r.altezzaTitolo, `«${r.titolo}»: il titolo non si disegna (altezza 0) — è una riga vuota`).toBeGreaterThan(0);
      expect(r.altezzaComando, `«${r.titolo}»: il comando è disegnato in riga (${r.altezzaComando} px) mentre la descrizione c'è`).toBe(0);
      /* ⛔ E LA SCATOLA NON BASTA: l'inchiostro dentro la scatola. */
      pretendiInchiostro(r.stileTitolo, r.titolo, 'riga con la descrizione, titolo');
    }
    /*
     * ⛔ E LA RIGA NON DEVE CRESCERE COL COMANDO. Questa è la forma giusta dell'asserzione, e ci
     *   sono arrivato sbagliando: avevo messo una soglia assoluta («meno di 90 px») e la prova è
     *   diventata rossa su una riga **sana** — 109 px è l'altezza legittima di una riga con la sua
     *   riga di stato e i margini della card, non il comando. Il revisore misura la stessa cosa:
     *   **113 px dopo la cura contro 245 prima**, su otto righe.
     * ⇒ La proprietà vera non è «bassa», è **indipendente dalla lunghezza del comando**: qui c'è una
     *   riga con un `for` su cinque-sei righe e una con `git status --short`, e devono venire UGUALI.
     *   Se il comando contribuisse, la prima sarebbe cinque volte l'altra.
     */
    const altezze = conDescrizione.map((r) => r.altezzaRiga);
    const scarto = Math.max(...altezze) - Math.min(...altezze);
    expect(scarto, `le righe con la descrizione hanno altezze diverse — ${JSON.stringify(altezze)}: il comando (o il titolo) fa crescere la riga`).toBeLessThanOrEqual(12);

    /* 2. SENZA descrizione: il comando si disegna, o la riga sarebbe vuota. */
    expect(senzaDescrizione.length, 'nessuna riga senza descrizione: non si sta provando il secondo verso').toBeGreaterThanOrEqual(1);
    for (const r of senzaDescrizione) {
      expect(r.altezzaTitolo, 'senza descrizione il titolo non deve disegnarsi').toBe(0);
      expect(r.altezzaComando, 'senza descrizione il comando È la riga: deve vedersi').toBeGreaterThan(0);
      /* Il verso opposto: qui è il COMANDO a dover essere inchiostro. */
      pretendiInchiostro(r.stileComando, r.titolo || '(senza descrizione)', 'riga senza descrizione, comando');
    }
  });
}

/*
 * ⛔⛔ L'ESPANSA — i due debiti del BLOCCO 4 che NESSUNA prova guardava (20/09/2026, sera).
 *
 *  1. L'etichetta «Comando» era TAGLIATA: `clientWidth 13 / scrollWidth 57` («Descrizione» 58/67),
 *     perché `.talos-kv__k` porta `min-width:0; overflow:hidden; text-overflow:ellipsis` mentre il
 *     valore prende tutto lo spazio che avanza. A schermo si leggeva **«C..»**.
 *  2. Il valore del comando NON conservava le interruzioni di riga: `white-space:pre-wrap` stava in
 *     una regola che ne perdeva un'altra a pari specificità, più in basso nel foglio ⇒ non si
 *     applicava mai. Un comando con sei interruzioni rendeva **72 px (4 righe) invece di 126 (7)**,
 *     e la frase «conserva le interruzioni di riga» nel commit `08a046c1` era **falsa**.
 *
 * ⇒ Questa prova è ciò che impedisce a quelle due frasi di tornare a essere false: la prima misura
 *   la LARGHEZZA mostrata contro quella richiesta, la seconda le RIGHE RESE contro l'altezza di riga
 *   **calcolata** (il corpo del testo è una preferenza dell'utente: un numero scritto a mano
 *   invecchierebbe al primo cambio di dimensione).
 */
test("PROCESSI-ESPANSA — l'etichetta non è tagliata e il comando conserva le sue righe", async ({ page }) => {
  await apriProcessi(page);
  const riga = page.locator('.talos-process', { hasText: 'Rifà tutta la verifica del registro spese' });
  await expect(riga, 'la riga del comando su più righe non c\'è: la scena non si è formata').toHaveCount(1);
  await riga.locator('.talos-process__apri').click();
  await expect(riga.locator('.talos-process__dettaglio')).toBeVisible();

  const m = await riga.evaluate((r) => {
    const kv = [...r.querySelectorAll('.talos-kv')].find((n) => (n.querySelector('.talos-kv__k')?.textContent || '').trim() === 'Comando');
    const et = kv?.querySelector('.talos-kv__k');
    const v = kv?.querySelector('.talos-kv__v');
    const sv = v ? getComputedStyle(v) : null;
    return {
      etichetta: { testo: et?.textContent?.trim() || '', clientWidth: et?.clientWidth ?? 0, scrollWidth: et?.scrollWidth ?? 0 },
      /* ⛔ TUTTE le etichette del dettaglio, non solo «Comando»: il taglio era stato misurato anche
         su «Descrizione», e una prova che guarda una riga sola non sa niente delle altre otto. */
      etichette: [...r.querySelectorAll('.talos-kv')].map((n) => {
        const e = n.querySelector('.talos-kv__k');
        return { testo: (e?.textContent || '').trim(), mostrato: e?.clientWidth ?? 0, richiesto: e?.scrollWidth ?? 0 };
      }),
      valore: v ? {
        classi: v.className,
        whiteSpace: sv.whiteSpace,
        textAlign: sv.textAlign,
        lineHeight: parseFloat(sv.lineHeight) || (parseFloat(sv.fontSize) || 12) * 1.4,
        altezza: Math.round(v.getBoundingClientRect().height),
        interruzioni: (v.textContent || '').split('\n').length - 1,
      } : null,
    };
  });
  console.log(`MISURA-PROCESSI-ESPANSA = ${JSON.stringify(m)}`);

  expect(m.etichetta.testo, 'la riga «Comando» non c\'è nel dettaglio: la scena non si è formata').toBe('Comando');
  expect(m.etichette.length, 'il dettaglio non ha righe: la scena non si è formata').toBeGreaterThanOrEqual(6);
  /* ⛔ OGNI etichetta si legge per intero. La tolleranza di 1 px è dell'arrotondamento del layout. */
  for (const e of m.etichette) {
    expect(
      e.mostrato,
      `l'etichetta «${e.testo}» è TAGLIATA: ${e.mostrato} px mostrati su ${e.richiesto} richiesti`,
    ).toBeGreaterThanOrEqual(e.richiesto - 1);
  }

  expect(m.valore, 'il valore del comando non c\'è').not.toBeNull();
  expect(m.valore.classi, 'il valore lungo non porta la sua classe: il vestito non è cablato in `inspector.js`').toContain('talos-kv__v--lungo');
  expect(m.valore.whiteSpace, 'il comando non conserva le interruzioni di riga').toBe('pre-wrap');
  expect(m.valore.textAlign, 'un comando su più righe allineato a destra è un blocco frastagliato').toBe('left');
  expect(m.valore.interruzioni, 'la scena non porta un comando su più righe: la prova non proverebbe niente').toBeGreaterThanOrEqual(5);
  /*
   * ⛔ E IL NUMERO ATTESO SI **DERIVA DALLA SCENA**, non si scrive a mano.
   *   La prima stesura di questa prova diceva «sei interruzioni ⇒ almeno sette righe» e il comando ne
   *   portava **cinque**: sei righe su sei, e la prova è diventata rossa su una cura che funzionava —
   *   una soglia scritta a mano non è una misura, è un ricordo. Le righe attese sono
   *   `interruzioni + 1`, e il verso che deve fallire resta: con `white-space:normal` i ritorni si
   *   perdono, il testo si riavvolge e le righe scendono a ~4 (il numero misurato dal revisore).
   */
  const righeAttese = m.valore.interruzioni + 1;
  const righe = m.valore.altezza / m.valore.lineHeight;
  expect(
    righe,
    `il comando ha ${m.valore.interruzioni} interruzioni (${righeAttese} righe attese) ma ne rende ${righe.toFixed(1)}: ${m.valore.altezza} px a ${m.valore.lineHeight.toFixed(1)} px per riga — le sue righe si sono perse`,
  ).toBeGreaterThanOrEqual(righeAttese * 0.9);

  /*
   * ⛔⛔ E IL VESTITO DEVE SOPRAVVIVERE A UN CAMBIO **A DETTAGLIO APERTO** — questa parte mancava,
   *   e l'ha trovata il revisore avversario: il dettaglio si riempie da **DUE** punti (l'apertura e
   *   il ramo «aperto e cambiato» dentro `aggiornaRiga`), lui ha tolto `classiValore` **solo dal
   *   secondo** e la suite è rimasta **verde**. Cioè: la cura era giusta e la prova non la copriva.
   *   ⇒ Qui il dettaglio CAMBIA mentre è aperto, e si pretende che la classe sia ancora lì.
   */
  /*
   * ⛔⛔ UN PROCESSO CHE CAMBIA **MENTRE IL SUO DETTAGLIO È APERTO** — è la sola sequenza che accende
   *   il secondo punto di riempimento, e a trovarla ci sono voluti due tentativi sbagliati:
   *   mandare un secondo `ToolCallResult` su `d4` NON cambia niente (nella scena lo ha già ricevuto
   *   quando nasce) ⇒ `chiaveDettaglio` resta uguale, il ramo non si accende, e la prova resta verde
   *   misurando il nulla.
   *   ⇒ Si crea un processo NUOVO, si apre il suo dettaglio, e POI lo si fa finire.
   *   ⛔ E la sequenza sta sopra quella della scena (`90000+`): con numeri più bassi il registro li
   *     tratta come fuori ordine e li butta — verde su un aggiornamento mai avvenuto.
   */
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    const g = r.realSessionState.generation;
    const evento = (e) => r.handleRealEvent({ ...e, _sequenza: (window.__sD5 = (window.__sD5 || 95000) + 1) }, g);
    evento({ type: 'ToolCallStart', toolCallId: 'd5', toolCallName: 'shell', ricevutoA: 4000, giro: 2 });
    evento({ type: 'ToolCallArgs', toolCallId: 'd5', delta: JSON.stringify({ comando: 'cd spese\nnode --test\nfor f in a b; do\n  echo "$f"\ndone\necho fine', descrizione: 'Rilancia la verifica dopo la correzione' }) });
  });
  const rigaViva = page.locator('.talos-process', { hasText: 'Rilancia la verifica dopo la correzione' });
  await expect(rigaViva, 'il processo nuovo non è comparso nella lista').toHaveCount(1);
  await rigaViva.locator('.talos-process__apri').click();
  await expect(rigaViva.locator('.talos-process__dettaglio')).toBeVisible();
  /* Prima dell'aggiornamento: il vestito c'è (lo mette il ramo dell'APERTURA). */
  await expect(rigaViva.locator('.talos-kv__v--lungo'), 'all\'apertura il valore lungo non porta la sua classe').toHaveCount(2);

  /* ⛔ Ora il dettaglio CAMBIA mentre è aperto: è il ramo che il revisore ha trovato scoperto. */
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'd5', ricevutoA: 5000, errore: false, durataMs: 2400, _sequenza: (window.__sD5 = (window.__sD5 || 95000) + 1) }, g);
  });
  /*
   * ⛔⛔ QUI NON C'È NESSUN «NUDGE», E NON PER CASO: QUESTA RIGA È ANCHE LA PROVA DI UNA CURA.
   *
   *   Il 20/09/2026, costruendo questa prova, ho trovato che **la riga di un processo non si
   *   aggiornava quando il comando finiva**: dopo il `ToolCallResult` la card restava `in-corso` —
   *   `dataset.stato` compreso — per tutti e cinque i secondi di un `expect`, mentre il registro
   *   degli eventi aveva già il risultato in coda. Con un `RunFinished` la riga diventava
   *   `riuscito` ⇒ il **dato** era giusto e mancava il **ridisegno**.
   *   ⛔ La causa, misurata col grep: i rami `ToolCallStart`/`ToolCallArgs`/`ToolCallResult` non
   *     chiamavano NESSUNO dei tre aggiornatori; la colonna si aggiornava di rimbalzo, dal refresh
   *     periodico — che gira solo mentre un giro è attivo. In questa scena un giro non c'è, quindi
   *     non si aggiornava mai.
   *   ⇒ Curato con una riga (`aggiornaInspectorDaStato()` in fondo al ramo `ToolCallResult`), e qui
   *     **il nudge è stato tolto di proposito**: se tornasse il difetto, questa prova diventa rossa
   *     sulla premessa qui sotto invece di mascherare il problema con un secondo evento.
   */
  await page.waitForTimeout(400);
  await expect(rigaViva.locator('.talos-kv__v--lungo'), 'dopo un aggiornamento a dettaglio APERTO il valore lungo ha perso la sua classe: il secondo punto di riempimento non passa il vestito').toHaveCount(2);
  const dopo = await rigaViva.evaluate((r) => {
    const kv = [...r.querySelectorAll('.talos-kv')].find((n) => (n.querySelector('.talos-kv__k')?.textContent || '').trim() === 'Comando');
    const v = kv?.querySelector('.talos-kv__v');
    const stato = [...r.querySelectorAll('.talos-kv')].find((n) => (n.querySelector('.talos-kv__k')?.textContent || '').trim() === 'Stato');
    const s = r.ownerDocument.defaultView.__talosHarnessUiRuntime?.realSessionState;
    const eventiD5 = (s?.eventiAttrezzi || []).filter((e) => e.toolCallId === 'd5').map((e) => `${e.type}:${e.uscita ?? ''}`);
    return {
      classi: v?.className || '', whiteSpace: v ? getComputedStyle(v).whiteSpace : '',
      stato: (stato?.querySelector('.talos-kv__v')?.textContent || '').trim(), eventiD5,
      /* ⛔ E il DATASET della card, che scrive `aggiornaRiga`: se dice `riuscito` la riga è stata
         ridisegnata e il problema è solo nel dettaglio; se dice `in-corso`, la riga non è passata. */
      datasetStato: r.dataset.stato || '', badge: (r.querySelector('.talos-process__stato-testo')?.textContent || '').trim(),
      registro: (s?.eventiAttrezzi || []).map((e) => `${e.type.replace('ToolCall', '')}:${e.toolCallId}:${e.toolCallName || '-'}:${e.uscita ?? '-'}`).join(' '),
      card: `${r.dataset.c}:${r.dataset.processo}:${r.dataset.stato}`,
    };
  });
  console.log(`D5 = ${JSON.stringify(dopo)}`);
  /* ⛔ LA PREMESSA: senza questa, la prova direbbe «tutto a posto» anche se il dettaglio non si fosse
     aggiornato affatto — cioè se il ramo non fosse stato esercitato. */
  expect(dopo.stato, 'il dettaglio NON si è aggiornato: il ramo «aperto e cambiato» non è stato esercitato e la prova non proverebbe niente').toBe('Riuscito');
  expect(dopo.classi, 'la riga «Comando» non porta più la classe del valore lungo dopo l\'aggiornamento').toContain('talos-kv__v--lungo');
  expect(dopo.whiteSpace, 'il valore lungo ha perso pre-wrap dopo l\'aggiornamento').toBe('pre-wrap');
});
