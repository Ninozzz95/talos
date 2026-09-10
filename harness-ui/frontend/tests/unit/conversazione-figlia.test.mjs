import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ETICHETTA_STATO_FIGLIA,
  bersaglioAttrezzo,
  esitoDaContenuto,
  montaConversazioneFiglia,
  riduciEventiFiglia,
} from '../../src/components/conversazione-figlia.js';

/*
 * PO-08 — la conversazione di un sotto-agente dentro il pannello.
 *
 * ⛔ Ogni prova qui si gioca ANCHE AL CONTRARIO, perché i difetti di questa vista non stanno nel
 * caso felice: stanno negli eventi che arrivano storti (un `ToolCallArgs` il cui `Start` non è mai
 * arrivato), nella figlia che sta ancora girando, e nel flusso che resta aperto dopo che l'utente è
 * tornato indietro — una perdita che a schermo non si vede MAI.
 *
 * Il DOM finto è qui e non in una libreria: il frontend non ha jsdom, e i test unitari girano col
 * runner di Node. Fa solo ciò che serve a questo componente e a `conversazione.js`, e quando non sa
 * fare una cosa lancia — un finto che risponde `null` a tutto farebbe passare un componente rotto.
 */

/** Il DOM minimo: eventi, fuoco, `querySelector` per classe, e `remove()` che stacca davvero. */
function documentoFinto() {
  const doc = { activeElement: null };
  const crea = (tag) => {
    const attributi = new Map();
    const nodo = {
      tag,
      tagName: String(tag).toUpperCase(),
      classi: new Set(),
      dataset: {},
      figli: [],
      ascolti: [],
      padre: null,
      testoProprio: '',
      hidden: false,
      id: '',
      type: '',
      tabIndex: 0,
      get className() { return [...nodo.classi].join(' '); },
      set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: {
        add: (...c) => c.forEach((x) => nodo.classi.add(x)),
        remove: (...c) => c.forEach((x) => nodo.classi.delete(x)),
        contains: (c) => nodo.classi.has(c),
      },
      get textContent() { return nodo.testoProprio !== '' ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
      set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
      setAttribute: (k, v) => attributi.set(k, String(v)),
      getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
      append: (...x) => { for (const y of x) { if (y && typeof y === 'object') y.padre = nodo; nodo.figli.push(y); } },
      appendChild: (x) => { nodo.append(x); return x; },
      replaceChildren: (...x) => { for (const f of nodo.figli) if (f && typeof f === 'object') f.padre = null; nodo.figli = []; nodo.append(...x); },
      remove: () => { if (nodo.padre) nodo.padre.figli = nodo.padre.figli.filter((f) => f !== nodo); nodo.padre = null; },
      get isConnected() { return nodo.padre !== null; },
      addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
      removeEventListener: (t, m) => { const i = nodo.ascolti.findIndex((a) => a.t === t && a.m === m); if (i >= 0) nodo.ascolti.splice(i, 1); },
      lancia: (t, extra = {}) => {
        const evento = { type: t, defaultPrevented: false, preventDefault() { evento.defaultPrevented = true; }, ...extra };
        for (const a of [...nodo.ascolti].filter((x) => x.t === t)) a.m(evento);
        return evento;
      },
      focus: () => { doc.activeElement = nodo; },
      querySelector: (selettore) => {
        if (!selettore.startsWith('.')) throw new Error(`documentoFinto: selettore non gestito «${selettore}»`);
        const classe = selettore.slice(1);
        const cerca = (n) => {
          for (const f of n.figli) {
            if (!f || typeof f !== 'object' || !f.classi) continue;
            if (f.classi.has(classe)) return f;
            const dentro = cerca(f);
            if (dentro) return dentro;
          }
          return null;
        };
        return cerca(nodo);
      },
    };
    return nodo;
  };
  doc.createElement = crea;
  doc.createElementNS = (_ns, tag) => crea(tag);
  doc.createTextNode = (t) => ({ testoProprio: String(t), figli: [], get textContent() { return this.testoProprio; } });
  doc.radice = crea('div'); // qualcosa a cui attaccare il contenitore, così `isConnected` ha senso
  return doc;
}

/** Tutti i nodi dell'albero, per cercarci dentro senza un vero querySelectorAll. */
const tutti = (nodo, fuori = []) => {
  fuori.push(nodo);
  for (const f of nodo.figli ?? []) if (f && typeof f === 'object') tutti(f, fuori);
  return fuori;
};
const conClasse = (nodo, classe) => tutti(nodo).filter((n) => n.classi?.has(classe));
const unaConClasse = (nodo, classe) => conClasse(nodo, classe)[0] ?? null;
const testoIntero = (nodo) => tutti(nodo).map((n) => n.testoProprio ?? '').join(' ');

/* ---------------------------------------------------------------- fixture */

const START = (n = 1, extra = {}) => ({
  type: 'RunStarted',
  threadId: 'figlia-1',
  runId: `run-${n}`,
  input: { consegna: 'Sei un agente delegato. Preambolo lungo del kernel…\nCompito: leggi il ledger', consegnaCorta: 'leggi il ledger' },
  contesto: { modello: 'z-ai/glm-5.3-flash', progetto: 'AVM' },
  ...extra,
});
const DELTA = (id, delta) => ({ type: 'TextMessageContent', messageId: id, delta });
const TOOL_START = (id, nome) => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: nome });
const TOOL_ARGS = (id, delta) => ({ type: 'ToolCallArgs', toolCallId: id, delta });
const TOOL_RESULT = (id, content, extra = {}) => ({ type: 'ToolCallResult', toolCallId: id, content, ...extra });

/* ═══════════════════════════════════════════ La riduzione (pura) ═══ */

test('FIGLIA-RIDUCI: un giro intero diventa turni, e il testo a PEZZI resta UN messaggio', () => {
  const r = riduciEventiFiglia([
    START(),
    DELTA('m1', 'Ho '), DELTA('m1', 'letto '), DELTA('m1', 'il ledger.'),
    TOOL_START('t1', 'leggi'), TOOL_ARGS('t1', '{"percorso":"'), TOOL_ARGS('t1', 'docs/ledger.md"}'), TOOL_RESULT('t1', '42 righe'),
    DELTA('m2', 'Fatto.'),
    { type: 'RunFinished', outcome: 'fine-lavoro' },
  ]);

  assert.equal(r.stato, 'conclusa');
  assert.equal(r.giri, 1);
  assert.equal(r.attrezzi, 1);
  assert.equal(r.scartati, 0);
  assert.equal(r.modello, 'z-ai/glm-5.3-flash');
  assert.equal(r.turni.length, 1, 'un RunStarted = un turno; i delta NON aprono turni');

  const [turno] = r.turni;
  assert.equal(turno.consegna, 'leggi il ledger', 'consegnaCorta prima di consegna: il preambolo del kernel non è il compito');
  assert.deepEqual(turno.blocchi.map((b) => b.tipo), ['testo', 'attrezzo', 'testo']);
  assert.equal(turno.blocchi[0].testo, 'Ho letto il ledger.', 'tre delta = una frase sola, non tre');
  assert.deepEqual(
    { attrezzo: turno.blocchi[1].attrezzo, argomenti: turno.blocchi[1].argomenti, esito: turno.blocchi[1].esito },
    { attrezzo: 'leggi', argomenti: '{"percorso":"docs/ledger.md"}', esito: 'success' },
  );
  assert.equal(turno.blocchi[2].testo, 'Fatto.');
});

test('FIGLIA-RIDUCI-SPARSI ⛔ AL CONTRARIO: eventi in ordine sparso non crashano, e si scartano con onestà', () => {
  const r = riduciEventiFiglia([
    TOOL_ARGS('mai-nato', '{"a":1}'),        // il suo Start non è mai arrivato
    TOOL_RESULT('mai-nato', 'ok'),           // idem
    null,                                     // un buco nel flusso
    'stringa',                                // roba che non è un evento
    START(),
    { type: 'TextMessageStart', messageId: 'm1' }, // conosciuto e non usato: NON è uno scarto
    { type: 'StateDelta', delta: [] },             // idem
    TOOL_START('t1', 'cerca'),
    TOOL_START('t1', 'cerca'),               // lo stesso id due volte: il secondo è rumore
  ]);

  assert.equal(r.scartati, 5, 'due orfani + null + stringa + il doppione');
  assert.equal(r.attrezzi, 1, 'una riga sola, non una riga fantasma per l’orfano');
  assert.equal(r.turni.length, 1);
  assert.deepEqual(r.turni[0].blocchi.map((b) => b.id), ['t1']);
  assert.equal(r.stato, 'in-corso');
});

test('FIGLIA-RIDUCI-SENZA-AVVIO: testo che arriva prima di ogni RunStarted non si butta', () => {
  const r = riduciEventiFiglia([DELTA('m1', 'a metà')]);
  assert.equal(r.turni.length, 1);
  assert.equal(r.turni[0].giro, 0, 'giro 0 = turno implicito, dichiarato tale');
  assert.equal(r.turni[0].consegna, '');
  assert.equal(r.giri, 0, '⛔ nessun RunStarted = zero giri: non si conta un giro che non c’è stato');
});

test('FIGLIA-RIDUCI-STATI: i quattro stati vengono dagli eventi, e «fermato» non è un guasto', () => {
  assert.equal(riduciEventiFiglia([]).stato, 'in-corso');
  assert.deepEqual(riduciEventiFiglia([]).turni, []);
  assert.equal(riduciEventiFiglia([START()]).stato, 'in-corso', 'senza RunFinished la figlia sta ancora girando');
  assert.equal(riduciEventiFiglia([START(), { type: 'RunFinished', outcome: 'fine-lavoro' }]).stato, 'conclusa');
  assert.equal(riduciEventiFiglia([START(), { type: 'RunFinished', outcome: 'errore' }]).stato, 'fallita');
  assert.equal(riduciEventiFiglia([START(), { type: 'RunFinished', outcome: 'fermato' }]).stato, 'interrotta');
  assert.equal(riduciEventiFiglia([START(), { type: 'RunError', message: 'x', code: 'fermato' }]).stato, 'interrotta');

  const fallita = riduciEventiFiglia([START(), { type: 'RunError', message: '24 su 24 giri usati senza chiudere il task', code: 'giri-esauriti' }]);
  assert.equal(fallita.stato, 'fallita');
  assert.equal(fallita.motivo, '24 su 24 giri usati senza chiudere il task', 'il motivo è la frase del server, non una nostra');
  assert.deepEqual(fallita.turni[0].blocchi.at(-1), { tipo: 'errore', id: 'errore-0', codice: 'giri-esauriti', messaggio: '24 su 24 giri usati senza chiudere il task' });

  const muto = riduciEventiFiglia([START(), { type: 'RunError' }]);
  assert.equal(muto.motivo, 'Il server non ha detto perché.', '⛔ un buco si dichiara, non si riempie');

  const ripartita = riduciEventiFiglia([START(1), { type: 'RunError', message: 'ops' }, START(2)]);
  assert.equal(ripartita.stato, 'in-corso', 'un giro nuovo non eredita il rosso di quello prima');
  assert.equal(ripartita.motivo, '');
  assert.equal(ripartita.giri, 2);
});

test('FIGLIA-ESITO: i criteri sono quelli della chat (app.js:9221), nei due versi', () => {
  assert.equal(esitoDaContenuto('prova', 'ℹ fail 2'), 'error');
  assert.equal(esitoDaContenuto('prova', 'ℹ fail 0'), 'success', 'zero fallimenti NON è un fallimento');
  assert.equal(esitoDaContenuto('shell', 'ciao\nexit 1'), 'error');
  assert.equal(esitoDaContenuto('shell', 'ciao\nexit 0'), 'success');
  assert.equal(esitoDaContenuto('leggi', 'ERRORE: file assente'), 'error');
  assert.equal(esitoDaContenuto('leggi', 'REFUSED. fuori dal workspace'), 'error');
  assert.equal(esitoDaContenuto('leggi', 'il file parla di un ERRORE noto'), 'success', '⛔ la parola in mezzo al testo non è un verdetto');
  assert.equal(esitoDaContenuto('leggi', ''), 'success');

  const conFlag = riduciEventiFiglia([START(), TOOL_START('t1', 'leggi'), TOOL_RESULT('t1', 'tutto bene', { errore: true })]);
  assert.equal(conFlag.turni[0].blocchi[0].esito, 'error', 'un fatto dichiarato batte l’indizio nel testo');
});

test('FIGLIA-BERSAGLIO: JSON a metà non è un errore, ed è meglio niente che un pezzo di JSON a schermo', () => {
  assert.equal(bersaglioAttrezzo('{"percorso":"src/a.js"}'), 'src/a.js');
  assert.equal(bersaglioAttrezzo('{"query":"cancello semantico"}'), 'cancello semantico');
  assert.equal(bersaglioAttrezzo('{"percorso":"'), '', 'delta incompleto: nessun dettaglio, nessun crash');
  assert.equal(bersaglioAttrezzo('{"boh":1}'), '', 'nessuna chiave nota: silenzio, non `{"boh":1}`');
  assert.equal(bersaglioAttrezzo(''), '');
  assert.equal(bersaglioAttrezzo(`{"percorso":"${'x'.repeat(200)}"}`).length, 72, 'un percorso lungo si tronca, non sfonda la colonna');
});

/* ═════════════════════════════════════════════════ La vista ═══ */

/** Monta con un flusso finto; ritorna la maniglia, il documento e la spia sul flusso. */
function monta({ eventiIniziali = [], onIndietro = () => {} } = {}) {
  const doc = documentoFinto();
  const contenitore = doc.createElement('div');
  doc.radice.append(contenitore);
  const chiamante = doc.createElement('button');
  contenitore.append(chiamante);
  chiamante.focus(); // è la riga della scheda «Agenti» che è stata premuta

  const spia = { aperture: 0, chiusure: 0, manda: null };
  const apriFlusso = (id, onEvento) => {
    spia.aperture += 1;
    spia.sessionId = id;
    spia.manda = onEvento;
    for (const e of eventiIniziali) onEvento(e); // il replay arriva SUBITO, come `iscriviti()`
    return () => { spia.chiusure += 1; };
  };
  const vista = montaConversazioneFiglia(contenitore, { sessionId: 's-figlia-9', nome: 'leggi il ledger', apriFlusso, onIndietro, document: doc });
  return { doc, contenitore, chiamante, spia, vista };
}

test('FIGLIA-VISTA: la testata porta il COMPITO e il MODELLO — e l’id di sessione NON è a schermo', () => {
  const { doc, vista, spia } = monta({ eventiIniziali: [START(), DELTA('m1', 'Ho letto il ledger.'), TOOL_START('t1', 'leggi'), TOOL_ARGS('t1', '{"percorso":"docs/ledger.md"}'), TOOL_RESULT('t1', 'ok')] });

  assert.equal(spia.aperture, 1);
  assert.equal(spia.sessionId, 's-figlia-9');
  assert.equal(unaConClasse(vista.elemento, 'talos-figlia__titolo').textContent, 'leggi il ledger');
  assert.equal(unaConClasse(vista.elemento, 'talos-badge').textContent, ETICHETTA_STATO_FIGLIA['in-corso']);
  assert.equal(vista.elemento.dataset.stato, 'in-corso');

  const valori = conClasse(vista.elemento, 'talos-kv__v').map((n) => n.textContent);
  assert.deepEqual(valori, ['z-ai/glm-5.3-flash', '1 giro · 1 chiamata']);

  /* ⛔ Codex #23594: la loro vista dei sotto-agenti mostra l'id invece del task. Qui l'id vive nel
     dataset, e non deve comparire in NESSUN testo della vista. */
  assert.equal(vista.elemento.dataset.sessioneFiglia, 's-figlia-9');
  assert.ok(!testoIntero(vista.elemento).includes('s-figlia-9'), 'l’id di sessione non si legge a schermo');

  /* ⛔ Regola owner 04/09: niente nomi tecnici. «leggi» diventa «lettura di un file». Si guarda la
     RIGA, non tutta la vista: il compito della figlia contiene la parola «leggi» ed è testo della
     persona — cercarla ovunque farebbe fallire questa prova per il motivo sbagliato (visto girando). */
  const riga = unaConClasse(vista.elemento, 'talos-tool-row');
  assert.equal(unaConClasse(riga, 'talos-tool-row__name').textContent, 'lettura di un file');
  assert.ok(!/leggi/.test(testoIntero(riga)), 'il nome tecnico dell’attrezzo non arriva a schermo');
  const testo = testoIntero(vista.elemento);
  assert.ok(testo.includes('docs/ledger.md'), 'il bersaglio sì: è quello che dice cosa sta facendo');
  assert.ok(testo.includes('Ho letto il ledger.'));
  assert.equal(unaConClasse(vista.elemento, 'talos-tool-row').querySelector('.talos-dot').className, 'talos-dot talos-dot--success');

  assert.equal(unaConClasse(vista.elemento, 'talos-figlia__vuoto').hidden, true, 'con dei turni lo stato vuoto sparisce');
  assert.equal(doc.activeElement, vista.elemento, 'il fuoco entra nella vista appena aperta');
});

test('FIGLIA-VIVA: un evento che arriva DOPO il montaggio compare senza rimontare quello che c’era', () => {
  const { vista, spia } = monta({ eventiIniziali: [START(), DELTA('m1', 'Sto')] });

  const turnoPrima = unaConClasse(vista.elemento, 'talos-figlia__turno');
  const paragrafoPrima = unaConClasse(vista.elemento, 'assistant-copy');
  const rigaPrima = conClasse(vista.elemento, 'talos-tool-row').length;
  assert.equal(paragrafoPrima.textContent, 'Sto');
  assert.equal(rigaPrima, 0);

  spia.manda(DELTA('m1', ' leggendo…'));
  spia.manda(TOOL_START('t1', 'cerca'));
  spia.manda(TOOL_START('t2', 'leggi'));

  assert.equal(unaConClasse(vista.elemento, 'talos-figlia__turno'), turnoPrima, '⛔ il turno NON è stato ricostruito');
  assert.equal(unaConClasse(vista.elemento, 'assistant-copy'), paragrafoPrima, '⛔ e nemmeno il paragrafo: è lo STESSO nodo');
  assert.equal(paragrafoPrima.textContent, 'Sto leggendo…');
  assert.equal(conClasse(vista.elemento, 'talos-tool-row').length, 2);
  assert.equal(conClasse(vista.elemento, 'talos-activity').length, 1, 'due chiamate consecutive stanno in UN gruppo solo');
  assert.equal(unaConClasse(vista.elemento, 'tool-note-summary-text').textContent, '2 attrezzi usati');

  /* La riga in corso è viva, non verde: l'esito non si inventa prima del risultato. */
  assert.equal(conClasse(vista.elemento, 'talos-tool-row')[0].querySelector('.talos-dot').className, 'talos-dot talos-dot--live');
  spia.manda(TOOL_RESULT('t1', 'ERRORE: niente'));
  assert.equal(conClasse(vista.elemento, 'talos-tool-row')[0].querySelector('.talos-dot').className, 'talos-dot talos-dot--danger');

  spia.manda({ type: 'RunFinished', outcome: 'fine-lavoro' });
  assert.equal(unaConClasse(vista.elemento, 'talos-badge').textContent, 'Conclusa');
});

test('FIGLIA-VUOTA: zero eventi non è un pannello bianco', () => {
  const { vista } = monta({ eventiIniziali: [] });
  const vuoto = unaConClasse(vista.elemento, 'talos-figlia__vuoto');
  assert.equal(vuoto.hidden, false);
  assert.ok(vuoto.textContent.includes('Nessun evento ancora'), vuoto.textContent);
  assert.deepEqual(conClasse(vista.elemento, 'talos-kv__v').map((n) => n.textContent), ['—', '0 giri · 0 chiamate'], '⛔ «—» e non un modello di ripiego: non lo sappiamo ancora');
});

test('FIGLIA-ERRORE: un RunError si legge, col motivo del server', () => {
  const { vista } = monta({ eventiIniziali: [START(), { type: 'RunError', message: '24 su 24 giri usati senza chiudere il task', code: 'giri-esauriti' }] });
  assert.equal(unaConClasse(vista.elemento, 'talos-badge').textContent, 'Non riuscita');
  assert.equal(vista.elemento.dataset.stato, 'fallita');
  assert.equal(unaConClasse(vista.elemento, 'talos-figlia__nota').textContent, '24 su 24 giri usati senza chiudere il task');
  assert.equal(unaConClasse(vista.elemento, 'talos-figlia__errore').textContent, '24 su 24 giri usati senza chiudere il task');
});

test('FIGLIA-SCARTI: quando qualcosa non si è potuto collegare, la vista lo dice — e l’accordo si flette', () => {
  const uno = monta({ eventiIniziali: [START(), TOOL_ARGS('mai-nato', '{}')] });
  assert.equal(unaConClasse(uno.vista.elemento, 'talos-figlia__nota').hidden, false);
  assert.equal(unaConClasse(uno.vista.elemento, 'talos-figlia__nota').textContent, '1 evento che non si è potuto collegare a niente: scartato.');

  const due = monta({ eventiIniziali: [START(), TOOL_ARGS('mai-nato', '{}'), TOOL_RESULT('mai-nato', 'ok')] });
  assert.equal(unaConClasse(due.vista.elemento, 'talos-figlia__nota').textContent, '2 eventi che non si sono potuti collegare a niente: scartati.');

  const zero = monta({ eventiIniziali: [START()] });
  assert.equal(unaConClasse(zero.vista.elemento, 'talos-figlia__nota').hidden, true, 'zero scarti = nessuna nota, non «0 eventi scartati»');
});

test('FIGLIA-DISTRUGGI ⛔ chiude DAVVERO il flusso, e il fuoco torna a chi ha aperto', () => {
  const { doc, chiamante, vista, spia } = monta({ eventiIniziali: [START()] });
  assert.equal(spia.chiusure, 0);

  vista.distruggi();
  assert.equal(spia.chiusure, 1, '⛔ una figlia viva che resta collegata è una perdita che nessuno vede');
  assert.equal(vista.elemento.isConnected, false, 'la vista esce dal pannello');
  assert.equal(doc.activeElement, chiamante, 'W3C APG: il fuoco torna all’elemento che ha aperto');

  vista.distruggi();
  assert.equal(spia.chiusure, 1, 'distruggere due volte non chiude due volte');

  /* Un evento in ritardo (la rete non è istantanea) non deve ridisegnare una vista smontata. */
  const prima = vista.elemento.figli.length;
  spia.manda(DELTA('m9', 'in ritardo'));
  assert.equal(vista.elemento.figli.length, prima);
  vista.aggiorna([START(), DELTA('m9', 'nemmeno così')]);
  assert.ok(!testoIntero(vista.elemento).includes('nemmeno così'));
});

test('FIGLIA-INDIETRO: il pulsante e Esc fanno la STESSA cosa', () => {
  const usciteBottone = [];
  const primo = monta({ onIndietro: () => usciteBottone.push('bottone') });
  unaConClasse(primo.vista.elemento, 'talos-figlia__indietro').lancia('click');
  assert.deepEqual(usciteBottone, ['bottone']);

  const usciteEsc = [];
  const secondo = monta({ onIndietro: () => usciteEsc.push('esc') });
  const evento = secondo.vista.elemento.lancia('keydown', { key: 'Escape' });
  assert.deepEqual(usciteEsc, ['esc']);
  assert.equal(evento.defaultPrevented, true, 'Esc qui è consumato: non deve chiudere anche altro');

  secondo.vista.elemento.lancia('keydown', { key: 'a' });
  assert.deepEqual(usciteEsc, ['esc'], 'un tasto qualunque non torna indietro');
});

test('FIGLIA-FLUSSO-ROTTO ⛔ AL CONTRARIO: se il collegamento non si apre, si dice — non si finge', () => {
  const doc = documentoFinto();
  const contenitore = doc.createElement('div');
  doc.radice.append(contenitore);
  const vista = montaConversazioneFiglia(contenitore, {
    sessionId: 's-1',
    nome: 'una delega',
    apriFlusso: () => { throw new Error('EventSource non disponibile'); },
    document: doc,
  });
  assert.equal(unaConClasse(vista.elemento, 'talos-figlia__nota').hidden, false);
  assert.ok(unaConClasse(vista.elemento, 'talos-figlia__nota').textContent.includes('EventSource non disponibile'));
  assert.ok(unaConClasse(vista.elemento, 'talos-figlia__vuoto').textContent.includes('non si è aperto'));
  vista.distruggi(); // e non deve lanciare, pur senza un flusso da chiudere
});

test('FIGLIA-AGGIORNA: una storia più corta si rifà, invece di mescolarsi con quella di prima', () => {
  const { vista } = monta({ eventiIniziali: [START(1), DELTA('m1', 'primo'), START(2), DELTA('m2', 'secondo')] });
  assert.equal(conClasse(vista.elemento, 'talos-figlia__turno').length, 2);

  vista.aggiorna([START(1), DELTA('m9', 'un’altra figlia')]);
  assert.equal(conClasse(vista.elemento, 'talos-figlia__turno').length, 1);
  const testo = testoIntero(vista.elemento);
  assert.ok(testo.includes('un’altra figlia'));
  assert.ok(!testo.includes('secondo'), '⛔ il turno della storia precedente non resta appeso');
});
