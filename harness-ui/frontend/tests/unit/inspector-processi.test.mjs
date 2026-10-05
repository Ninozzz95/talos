/*
 * P0-E, PUNTO 9 — LA SCHEDA «PROCESSI» SI AGGIORNA PER RIGA, NON SI RIFÀ.
 *
 * ⛔ IL DIFETTO, misurato sul file del 16/09/2026 (`components/inspector.js`, `aggiornaInspector`
 *   alle righe 472-495): `processi.replaceChildren()` e poi un `for` che ricostruisce TUTTE le card
 *   a ogni sincronizzazione. E la sincronizzazione arriva da `aggiornaInspectorDaStato`, chiamata da
 *   34 punti di `legacy/app.js` via `syncRunComposerState` — a ogni `RunStarted`, `RunFinished`,
 *   `RunError`, `RunRedirect*` e a ogni battito del composer. ⇒ Un solo evento nuovo distruggeva e
 *   ricostruiva l'intera scheda: con N processi il costo è O(N) DOM per evento, la selezione e lo
 *   stato aperto/chiuso di una riga sparivano, e non c'era nessun tetto al numero di righe.
 *
 * ⛔ E il difetto non è teorico: `processiDagliEventi` legge `state.realSession.eventiAttrezzi`, che
 *   cresce per tutta la sessione e non viene mai potato (azzerato solo al cambio di sessione).
 *
 * RICERCA 16/09/2026 (regola zero), prima di scrivere:
 *  · VS Code, «Terminal Shell Integration» (code.visualstudio.com/docs/terminal/shell-integration,
 *    agg. 02/09/2026): le decorazioni di comando sono TRE — errore, successo, «default» — e nascono
 *    dal codice di uscita portato da `OSC 633 ; D [; <exitcode>] ST`. ⇒ due valori non bastano.
 *  · Sulle liste lunghe (letto il 16/09/2026): la virtualizzazione taglia i nodi ma «can break
 *    screen reader navigation since DOM elements are constantly being added and removed», mentre
 *    «Load More» è «a hybrid between pagination and infinite scrolling… giving users a feeling of
 *    control», ed è il modello raccomandato dalla guida tecnica GEL della BBC per gli elenchi che
 *    crescono. ⇒ in una COLONNA LATERALE, dove un lettore di schermo deve poter scorrere l'elenco,
 *    si sceglie il tetto + «Carica altri», non la finestra scorrevole. La scelta è misurata nel
 *    banco `tests/unit/inspector-banco-processi.mjs`, non decisa a occhio.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATI_PROCESSO,
  datiProcesso,
  disegnaProcessi,
  processiDagliEventi,
  uscitaDaTestoAttrezzo,
  TETTO_PROCESSI,
} from '../../src/components/inspector.js';

/* ──────────────────────────────────────────────────────────── DOM finto ─── */
/*
 * ⛔ Conta le MUTAZIONI, perché è quello che il difetto rompeva: un finto che sapesse solo
 *   disegnare direbbe «verde» tanto col `replaceChildren` quanto senza. Ogni `append`,
 *   `insertBefore`, `remove`, `replaceChildren` e ogni scrittura di `textContent` si registra.
 */
function documentoFinto() {
  const conto = { append: 0, rimozioni: 0, testo: 0, creati: 0, replaceChildren: 0 };
  const doc = { conto };
  const crea = (tag) => {
    const attributi = new Map();
    conto.creati += 1;
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
      type: '',
      value: '',
      tabIndex: -1,
      get children() { return nodo.figli.filter((f) => f && f.classi); },
      get className() { return [...nodo.classi].join(' '); },
      set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
      classList: {
        add: (...c) => c.forEach((x) => nodo.classi.add(x)),
        remove: (...c) => c.forEach((x) => nodo.classi.delete(x)),
        toggle: (c, forza) => { const v = forza === undefined ? !nodo.classi.has(c) : Boolean(forza); if (v) nodo.classi.add(c); else nodo.classi.delete(c); },
        contains: (c) => nodo.classi.has(c),
      },
      get textContent() { return nodo.testoProprio !== '' ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
      set textContent(v) { conto.testo += 1; nodo.testoProprio = String(v); nodo.figli = []; },
      setAttribute: (k, v) => attributi.set(k, String(v)),
      getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
      removeAttribute: (k) => attributi.delete(k),
      append: (...x) => { for (const y of x) { conto.append += 1; if (y && typeof y === 'object') y.padre = nodo; nodo.figli.push(y); } },
      appendChild: (x) => { nodo.append(x); return x; },
      insertBefore: (nuovo, riferimento) => {
        conto.append += 1;
        if (nuovo.padre) nuovo.padre.figli = nuovo.padre.figli.filter((f) => f !== nuovo);
        nuovo.padre = nodo;
        const i = riferimento ? nodo.figli.indexOf(riferimento) : -1;
        if (i < 0) nodo.figli.push(nuovo); else nodo.figli.splice(i, 0, nuovo);
        return nuovo;
      },
      contoReplace: 0, // ⛔ per NODO: quello vietato è il replaceChildren del CONTENITORE, non quello dentro una riga
      replaceChildren: (...x) => { conto.replaceChildren += 1; nodo.contoReplace += 1; for (const f of nodo.figli) if (f && typeof f === 'object') f.padre = null; nodo.figli = []; nodo.append(...x); },
      remove: () => { conto.rimozioni += 1; if (nodo.padre) nodo.padre.figli = nodo.padre.figli.filter((f) => f !== nodo); nodo.padre = null; },
      get isConnected() { return nodo.padre !== null; },
      addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
      removeEventListener: (t, m) => { const i = nodo.ascolti.findIndex((a) => a.t === t && a.m === m); if (i >= 0) nodo.ascolti.splice(i, 1); },
      lancia: (t, extra = {}) => {
        const evento = { type: t, target: nodo, defaultPrevented: false, preventDefault() { evento.defaultPrevented = true; }, stopPropagation() {}, ...extra };
        for (const a of [...nodo.ascolti].filter((x) => x.t === t)) a.m(evento);
        return evento;
      },
      focus: () => {},
      /* Solo per classe e per tag: `riempiCard` cerca `.talos-kv`, l'aggiornamento dell'icona cerca
         `use`. ⛔ Un finto che rispondesse a qualunque selettore direbbe «verde» anche su un
         selettore sbagliato: qui i selettori che non sa gestire LANCIANO. */
      querySelectorAll: (sel) => {
        /* Classe, tag, e `[data-c="X"]` (anche in elenco separato da virgole, come nel DOM vero:
           serve alla pulizia una-tantum delle righe dimostrative del mockup). */
        const parti = sel.split(',').map((x) => x.trim()).filter(Boolean);
        for (const parte of parti) {
          if (!parte.startsWith('.') && !/^[a-z]+$/u.test(parte) && !/^\[data-c="[^"]+"\]$/u.test(parte)) {
            throw new Error(`documentoFinto: selettore non gestito «${parte}»`);
          }
        }
        const corrisponde = (f) => parti.some((parte) => {
          if (parte.startsWith('.')) return f.classi.has(parte.slice(1));
          const attr = /^\[data-c="([^"]+)"\]$/u.exec(parte);
          if (attr) return f.dataset?.c === attr[1];
          return f.tag === parte;
        });
        const cerca = (n, fuori) => { for (const f of n.figli ?? []) { if (!f || !f.classi) continue; if (corrisponde(f)) fuori.push(f); cerca(f, fuori); } return fuori; };
        return cerca(nodo, []);
      },
      querySelector: (sel) => nodo.querySelectorAll(sel)[0] ?? null,
    };
    return nodo;
  };
  doc.createElement = crea;
  doc.createElementNS = (_ns, tag) => crea(tag);
  doc.createTextNode = (t) => ({ testoProprio: String(t), figli: [], get textContent() { return this.testoProprio; } });
  doc.createDocumentFragment = () => crea('#fragment');
  return doc;
}

const tutti = (n, fuori = []) => { fuori.push(n); for (const f of n.figli ?? []) if (f && typeof f === 'object') tutti(f, fuori); return fuori; };
const conClasse = (n, c) => tutti(n).filter((x) => x.classi?.has(c));
const carte = (n) => tutti(n).filter((x) => x.dataset?.c === 'ProcessRow');

/* ───────────────────────────────────────────────────────────── fixture ─── */

const START = (id, comando, giro = 1, a = 1_000) => ([
  { type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', ricevutoA: a, giro },
  { type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) },
]);
const FINE = (id, { uscita = 0, errore = false, a = 2_000 } = {}) => ({ type: 'ToolCallResult', toolCallId: id, ricevutoA: a, errore, uscita });

/* ═══════════════════════════════════════════════ Gli otto stati ═══ */

// ⛔ 17/09, OSS-2: NOVE — è entrato «non eseguito» (uscita 127 = command not found nella shell
//    POSIX). Dire «Non riuscito» di un comando che non è partito è un'accusa, non un esito.
// ⛔ 02/10/2026: DIECI — è entrato «Aspetta il tuo consenso» (decisione owner): un comando che aspetta la persona non è
//    «in corso», e non si ferma dalla riga perché non è ancora partito.
// ⛔ 05/10/2026, BUG-14: UNDICI — è entrato «In sfondo»: un comando mandato fuori cattura non è né «in corso» né
//    «in attesa» (tace PER COSTRUZIONE: l'output va sul file), e non ha più né Stop né Sfondo da chiamare.
test('PROC-STATI: undici stati, ognuno con etichetta E icona — mai il solo colore', () => {
  const attesi = ['in-coda', 'in-avvio', 'in-corso', 'in-attesa', 'in-consenso', 'in-sfondo', 'riuscito', 'fallito', 'annullato', 'ucciso', 'non-eseguito'];
  assert.deepEqual(Object.keys(STATI_PROCESSO), attesi);
  for (const s of attesi) {
    assert.ok(STATI_PROCESSO[s].etichetta.length > 2, `${s} ha una parola sua`);
    assert.match(STATI_PROCESSO[s].icona, /^i-[a-z-]+$/u, `${s} ha un'icona dello sprite`);
  }
  /* ⛔ Il colore da solo non basta (WCAG 1.4.1): due stati diversi non possono avere la STESSA
     etichetta, altrimenti chi non distingue verde e rosso legge due volte la stessa parola. */
  const etichette = attesi.map((s) => STATI_PROCESSO[s].etichetta);
  assert.equal(new Set(etichette).size, etichette.length);
});

/* ⛔ 05/10/2026, BUG-14 — LA RIGA DEI PROCESSI DICE «IN SFONDO». Dagli eventi (con i campi additivi
   del kernel o dal solo testo) la riga cambia stato, porta il file e chi lo ha sfondato, e NON
   invecchia in «in attesa» col silenzio: un processo sfondato tace PER COSTRUZIONE. Quando il
   processo esce DAVVERO, il suo esito vince sullo sfondo. */
test('PROC-SFONDO: il comando sfondato è «in-sfondo» col file e chi, non invecchia in attesa, e l esito vero vince quando esce', () => {
  const lista = processiDagliEventi([
    ...START('s1', 'npm run dev', 1, 1_000),
    { type: 'ToolCallResult', toolCallId: 's1', ricevutoA: 2_000, inSfondo: true, fileSfondo: '/s/.talos/processi-sfondo/s1.log', sfondoDa: 'persona' },
  ], { adesso: 999_000 });
  const p = lista.find((x) => x.id === 's1');
  assert.equal(p.stato, 'in-sfondo', 'né «in corso» né «in attesa»: il silenzio è per costruzione, e sono passati 16 minuti');
  assert.equal(p.fileSfondo, '/s/.talos/processi-sfondo/s1.log');
  assert.equal(p.sfondoDa, 'persona');

  /* Il fallback dal TESTO («IN BACKGROUND» in testa) vive nel normalizzatore di app.js: qui arrivo
     già normalizzato, senza i campi del dettaglio — e la riga non se li inventa. */
  const senzaDettagli = processiDagliEventi([
    ...START('s1b', 'npm run dev', 1, 1_000),
    { type: 'ToolCallResult', toolCallId: 's1b', ricevutoA: 2_000, inSfondo: true },
  ]);
  const s1b = senzaDettagli.find((x) => x.id === 's1b');
  assert.equal(s1b.stato, 'in-sfondo');
  assert.equal(s1b.fileSfondo ?? null, null);
  assert.equal(s1b.sfondoDa ?? null, null);

  const lista2 = processiDagliEventi([
    ...START('s2', 'npm run dev', 1, 1_000),
    { type: 'ToolCallResult', toolCallId: 's2', ricevutoA: 2_000, inSfondo: true },
    { type: 'ToolCallResult', toolCallId: 's2', ricevutoA: 3_000, uscita: 0 },
  ]);
  const q = lista2.find((x) => x.id === 's2');
  assert.equal(q.stato, 'riuscito', 'quando il processo esce davvero, l esito vero vince sullo sfondo');
});

test('PROC-USCITA: il codice di uscita si legge dal testo del risultato (formato del kernel)', () => {
  /* ⛔ `talosHarness.mjs:7812` compone `exit ${p.codice} [sandbox: …]\n${p.testo}`: è l'UNICO posto
     in cui il codice di uscita esiste negli eventi AG-UI. */
  assert.equal(uscitaDaTestoAttrezzo('exit 0\nfatto'), 0);
  assert.equal(uscitaDaTestoAttrezzo('exit 1\nboom'), 1);
  assert.equal(uscitaDaTestoAttrezzo('exit 130 [sandbox: adb-shell-on-device]\nfermato'), 130);
  /* AL CONTRARIO: niente `exit` davanti = niente numero inventato. */
  assert.equal(uscitaDaTestoAttrezzo('REFUSED. Il permesso manca.'), null);
  assert.equal(uscitaDaTestoAttrezzo('il log dice exit 3 da qualche parte'), null, 'solo a inizio riga');
  assert.equal(uscitaDaTestoAttrezzo(''), null);
  assert.equal(uscitaDaTestoAttrezzo(null), null);
});

test('PROC-EVENTI: dagli eventi agli otto stati, senza inventare quello che il kernel non dice', () => {
  const base = [
    ...START('a', 'npm run build', 3, 1_000), FINE('a', { uscita: 0, a: 4_000 }),
    ...START('b', 'npm test', 3, 5_000), FINE('b', { uscita: 1, errore: true, a: 6_000 }),
    ...START('c', 'sleep 600', 4, 7_000), FINE('c', { uscita: 130, a: 8_000 }),
    ...START('d', 'gradlew assembleDebug', 4, 9_000), FINE('d', { uscita: 124, a: 10_000 }),
    { type: 'ToolCallStart', toolCallId: 'e', toolCallName: 'shell', ricevutoA: 11_000, giro: 5 }, // argomenti non ancora arrivati
    ...START('f', 'node server.mjs', 5, 12_000),
  ];
  const p = processiDagliEventi(base, { adesso: 200_000 });
  const per = Object.fromEntries(p.map((x) => [x.id, x]));
  assert.equal(per.a.stato, 'riuscito');
  assert.equal(per.b.stato, 'fallito');
  assert.equal(per.c.stato, 'annullato', 'exit 130 = 128+SIGINT: l’ha fermato qualcuno, non è un guasto');
  assert.equal(per.d.stato, 'ucciso', 'exit 124 = tempo scaduto: terminato a forza');
  assert.equal(per.e.stato, 'in-avvio', 'lo Start è arrivato, gli argomenti no: il comando non c’è ancora');
  assert.equal(per.f.stato, 'in-attesa', 'vivo da oltre la soglia: sta aspettando, e lo dice');
  assert.equal(per.e.comando, '', 'nessun comando inventato prima che gli argomenti arrivino');
});

test('PROC-RIGA: ogni riga porta i campi che ci sono, e «—» — mai un valore inventato — per quelli che mancano', () => {
  const [p] = processiDagliEventi([...START('a', 'git status --short', 3, 1_000), FINE('a', { uscita: 0, a: 1_300 })], { adesso: 2_000 });
  const d = datiProcesso(p);
  assert.equal(d.comando, 'git status --short');
  assert.equal(d.famiglia, 'git');
  assert.equal(d.stato, 'riuscito');
  assert.equal(d.etichetta, 'Riuscito');
  assert.equal(d.misura, '0,3 s · uscita 0');
  assert.equal(d.chi, 'agente · giro 3');
  /* ⛔ I campi che gli eventi AG-UI NON portano si DICHIARANO assenti, non si indovinano. */
  assert.equal(d.cartella, '—');
  assert.equal(d.pid, '—');
  assert.deepEqual(d.dettaglio.find((r) => r[0] === 'Cartella'), ['Cartella', '—']);
  assert.deepEqual(d.dettaglio.find((r) => r[0] === 'PID'), ['PID', '—']);
  assert.deepEqual(d.dettaglio.find((r) => r[0] === 'Uscita'), ['Uscita', '0']);
  /* ⛔ L'ORA di partenza, in riga: due comandi identici a mezz'ora di distanza devono restare
     distinguibili senza aprire il dettaglio. `—` quando l'istante non c'è, mai un'ora inventata. */
  assert.match(d.quando, /^\d{2}:\d{2}:\d{2}$/u);
  assert.equal(datiProcesso({ comando: 'ls', stato: 'riuscito' }).quando, '\u2014');

  const dd = documentoFinto(); const rr = dd.createElement('div');
  disegnaProcessi(dd, rr, [p]);
  const ora = conClasse(carte(rr)[0], 'talos-process__ora')[0];
  assert.ok(ora, 'la riga porta la sua ora');
  assert.equal(ora.textContent, d.quando);
  /* ⛔ AL CONTRARIO: senza istante la casella resta VUOTA, non scrive «—» accanto a «giro 3»
     (un trattino solo, in mezzo alla riga, si legge come un dato mancante invece che assente). */
  const dd2 = documentoFinto(); const rr2 = dd2.createElement('div');
  disegnaProcessi(dd2, rr2, [datiProcesso({ id: 'z', comando: 'ls', stato: 'riuscito', giro: 1 })]);
  assert.equal(conClasse(carte(rr2)[0], 'talos-process__ora')[0].textContent, '');
});

/* ═══════════════════════════════════════ L'aggiornamento PER RIGA ═══ */

test('PROC-UNA-RIGA: un evento nuovo tocca UNA riga sola — il resto della scheda non si muove', () => {
  const d = documentoFinto();
  const rail = d.createElement('div');
  const lista = ['a', 'b', 'c', 'd', 'e'].map((id, i) => datiProcesso({ id, comando: `npm run t${i}`, stato: 'riuscito', giro: 1, durataMs: 1_000, uscita: 0 }));

  disegnaProcessi(d, rail, lista);
  assert.equal(carte(rail).length, 5);
  const primaCarta = carte(rail)[0];

  /* Un processo nuovo in testa (l'elenco arriva dal più recente) e uno che cambia stato. */
  const conto0 = { ...d.conto };
  const lista2 = [
    datiProcesso({ id: 'nuovo', comando: 'git push', stato: 'in-corso', giro: 2 }),
    ...lista.slice(0, 4),
    datiProcesso({ id: 'e', comando: 'npm run t4', stato: 'fallito', giro: 1, durataMs: 1_000, uscita: 1 }),
  ];
  disegnaProcessi(d, rail, lista2);

  /* ⛔ Il `replaceChildren` che era la radice del difetto è quello sul CONTENITORE e sulla zona
     delle righe: quello che resta (dentro una riga, per ridisegnare il suo comando) è scoped a
     quella riga e non tocca le altre. */
  assert.equal(rail.contoReplace, 0, '⛔ il contenitore non si svuota più');
  assert.equal(conClasse(rail, 'talos-process-lista')[0].contoReplace, 0, '⛔ né la zona delle righe');
  assert.equal(carte(rail).length, 6);
  assert.equal(carte(rail)[0].dataset.processo, 'nuovo', 'la riga nuova entra in testa');
  assert.equal(carte(rail)[1], primaCarta, '⛔ la riga che c’era è LA STESSA identica, non una copia');
  assert.equal(carte(rail).at(-1).dataset.stato, 'fallito', 'la riga che cambia stato si aggiorna in loco');
  /* ⛔ Il conto che morde: una riga nuova + una che cambia = pochi nodi, non sei card rifatte.
     Con `replaceChildren` la seconda passata ne creava più di sessanta. */
  assert.ok(d.conto.creati - conto0.creati < 30, `nodi creati alla seconda passata: ${d.conto.creati - conto0.creati}`);
});

test('PROC-STATO-VIVO ⛔ AL CONTRARIO: la riga aperta resta aperta, la selezione resta, quando arriva un processo nuovo', () => {
  const d = documentoFinto();
  const rail = d.createElement('div');
  const lista = ['a', 'b'].map((id) => datiProcesso({ id, comando: `npm run ${id}`, stato: 'riuscito', giro: 1, durataMs: 500, uscita: 0 }));
  disegnaProcessi(d, rail, lista);

  const cartaA = carte(rail).find((c) => c.dataset.processo === 'a');
  const apri = conClasse(cartaA, 'talos-process__apri')[0];
  assert.ok(apri, 'ogni riga ha il suo comando per aprire il dettaglio');
  apri.lancia('click');
  assert.equal(apri.getAttribute('aria-expanded'), 'true');
  cartaA.lancia('click');
  assert.equal(cartaA.dataset.selezionato, 'si');

  disegnaProcessi(d, rail, [datiProcesso({ id: 'nuovo', comando: 'git push', stato: 'in-corso', giro: 2 }), ...lista]);

  const dopo = carte(rail).find((c) => c.dataset.processo === 'a');
  assert.equal(dopo, cartaA, 'la stessa card');
  assert.equal(conClasse(dopo, 'talos-process__apri')[0].getAttribute('aria-expanded'), 'true', '⛔ il dettaglio aperto resta aperto');
  assert.equal(dopo.dataset.selezionato, 'si', '⛔ la selezione resta');
});

test('PROC-TETTO: oltre il tetto si mostra «Carica altri», e il tetto è un numero MISURATO', () => {
  const d = documentoFinto();
  const rail = d.createElement('div');
  const molti = Array.from({ length: 300 }, (_, i) => datiProcesso({ id: `p${i}`, comando: `node script-${i}.mjs`, stato: 'riuscito', giro: 1, durataMs: 100, uscita: 0 }));

  const esito = disegnaProcessi(d, rail, molti);
  assert.equal(esito.totale, 300);
  assert.equal(esito.mostrati, TETTO_PROCESSI);
  assert.equal(carte(rail).length, TETTO_PROCESSI, '⛔ il tetto è sul DOM, non solo sul conto');
  const altri = conClasse(rail, 'talos-process-altri')[0];
  assert.ok(altri, 'c’è il comando per vederne di più');
  assert.match(altri.textContent, /Carica altri/u);
  assert.match(altri.textContent, /300/u, 'dice quanti ce ne sono in tutto: un «altri» muto non è azionabile');

  altri.lancia('click');
  assert.equal(carte(rail).length, Math.min(300, TETTO_PROCESSI * 2));
  /* ⛔ AL CONTRARIO: sotto il tetto il comando non compare — un pulsante che non porta da nessuna
     parte è il difetto peggiore, perché non fa rumore. */
  const d2 = documentoFinto(); const rail2 = d2.createElement('div');
  disegnaProcessi(d2, rail2, molti.slice(0, 3));
  assert.equal(conClasse(rail2, 'talos-process-altri').length, 0);
});

test('PROC-FILTRO: il filtro sopravvive a un processo nuovo, e filtra su comando ED eseguibile', () => {
  const d = documentoFinto();
  const rail = d.createElement('div');
  const lista = [
    datiProcesso({ id: 'a', comando: 'git status --short', stato: 'riuscito', giro: 1, durataMs: 100, uscita: 0 }),
    datiProcesso({ id: 'b', comando: 'npm run build', stato: 'riuscito', giro: 1, durataMs: 100, uscita: 0 }),
  ];
  disegnaProcessi(d, rail, lista);
  const campo = conClasse(rail, 'talos-process-filtro__campo')[0];
  assert.ok(campo, 'la scheda ha un filtro');
  campo.value = 'git';
  campo.lancia('input');
  assert.deepEqual(carte(rail).map((c) => c.dataset.processo), ['a']);

  disegnaProcessi(d, rail, [datiProcesso({ id: 'c', comando: 'git push', stato: 'in-corso', giro: 2 }), ...lista]);
  assert.equal(campo.value, 'git', '⛔ il filtro non si azzera da solo');
  assert.deepEqual(carte(rail).map((c) => c.dataset.processo), ['c', 'a'], 'il nuovo entra già filtrato');
});

test('PROC-VUOTO: nessun processo = una frase onesta, e il ritorno da pieno a vuoto non lascia righe morte', () => {
  const d = documentoFinto();
  const rail = d.createElement('div');
  disegnaProcessi(d, rail, []);
  assert.equal(carte(rail).length, 0);
  assert.match(rail.textContent, /Nessun comando eseguito/u);

  disegnaProcessi(d, rail, [datiProcesso({ id: 'a', comando: 'ls', stato: 'riuscito', giro: 1, durataMs: 10, uscita: 0 })]);
  assert.equal(carte(rail).length, 1);
  assert.ok(!/Nessun comando eseguito/u.test(rail.textContent), 'lo stato vuoto sparisce quando c’è una riga');

  disegnaProcessi(d, rail, []);
  assert.equal(carte(rail).length, 0, '⛔ AL CONTRARIO: tornare a vuoto non lascia card orfane');
  assert.match(rail.textContent, /Nessun comando eseguito/u);
});

test('PROC-COMANDO: la riga mostra il comando a SEGMENTI e l’icona della famiglia', () => {
  const d = documentoFinto();
  const rail = d.createElement('div');
  disegnaProcessi(d, rail, [datiProcesso({ id: 'a', comando: 'git commit -m "ciao mondo"', stato: 'riuscito', giro: 1, durataMs: 10, uscita: 0 })]);
  const carta = carte(rail)[0];
  assert.equal(carta.dataset.famiglia, 'git');
  assert.equal(conClasse(carta, 'talos-cmd__eseguibile')[0].textContent, 'git');
  assert.equal(conClasse(carta, 'talos-cmd__sottocomando')[0].textContent, 'commit');
  assert.equal(conClasse(carta, 'talos-cmd__flag')[0].textContent, '-m');
  /* ⛔ Lo stato si legge, non solo si colora. */
  assert.match(carta.textContent, /Riuscito/u);

  /*
   * ⛔⛔ QUESTA PARTE È NATA DA UNA FOTO, non da un ragionamento. Nello screenshot del 16/09
   *   (`artifacts/p0-E/processi-dark.png`) ogni riga mostrava lo STESSO simbolo — quello dello
   *   stato — e le dodici famiglie del parser non arrivavano mai a schermo. Il difetto era una
   *   riga sola in `aggiornaRiga` (l'icona della famiglia sovrascritta con quella dello stato), e
   *   nessuna prova lo vedeva perché guardavano `dataset.famiglia`, che era giusto.
   *   ⇒ Si guarda il SIMBOLO disegnato, cioè l'`href` dello `use`.
   */
  const href = (c) => tutti(c).filter((n) => n.tag === 'use').map((n) => n.getAttribute('href'));
  assert.ok(href(carta).includes('#i-git'), `la riga git disegna l'icona di git, non quella dello stato: ${href(carta).join(', ')}`);

  const d2 = documentoFinto(); const rail2 = d2.createElement('div');
  disegnaProcessi(d2, rail2, [
    datiProcesso({ id: 'x', comando: 'docker compose up -d', stato: 'in-corso', giro: 1 }),
    datiProcesso({ id: 'y', comando: 'curl -sS https://example.org', stato: 'riuscito', giro: 1, durataMs: 10, uscita: 0 }),
  ]);
  const simboli = carte(rail2).map((c) => href(c));
  assert.ok(simboli[0].includes('#i-grid'), `docker: ${simboli[0].join(', ')}`);
  assert.ok(simboli[1].includes('#i-globe'), `curl: ${simboli[1].join(', ')}`);
  /* ⛔ AL CONTRARIO: due righe di famiglie DIVERSE non possono avere lo stesso simbolo di famiglia. */
  assert.notDeepEqual(simboli[0], simboli[1]);
});

/** Come `el` di `inspector.js`, per costruire le righe finte del mockup nella prova qui sotto. */
function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }

test('PROC-MOCKUP: le righe DIMOSTRATIVE del template spariscono alla prima passata, e una volta sola', () => {
  /*
   * ⛔⛔ TROVATO DAL CANCELLO DI PARITÀ, non da una prova mia. `index.template.html` porta dentro
   *   `#railProcessi` quattro `ProcessRow` di esempio. Finché `aggiornaInspector` faceva
   *   `replaceChildren()` sparivano da sole; togliendolo per curare le prestazioni sarebbero
   *   rimaste accanto ai processi VERI — cioè il difetto che B2 aveva chiuso il 06/09, rimesso da
   *   una cura di prestazioni. Nella app vera non si vedeva (qualcun altro le ripulisce all'avvio:
   *   misurato, zero righe dopo il velo); nel laboratorio sì. Un difetto che si vede in UNA delle
   *   due superfici è un difetto.
   */
  const d = documentoFinto();
  const rail = d.createElement('div');
  for (let i = 0; i < 4; i += 1) {
    const finta = d.createElement('div');
    finta.className = 'talos-card talos-process';
    finta.dataset.c = 'ProcessRow';
    finta.appendChild(el(d, 'div', 'talos-process__cmd', `comando dimostrativo ${i}`));
    rail.appendChild(finta);
  }
  assert.equal(carte(rail).length, 4);

  disegnaProcessi(d, rail, [datiProcesso({ id: 'vero', comando: 'git status --short', stato: 'riuscito', giro: 1, durataMs: 300, uscita: 0 })]);
  assert.equal(carte(rail).length, 1, '⛔ restano solo i processi VERI');
  assert.ok(!rail.textContent.includes('comando dimostrativo'), 'e il testo del mockup non arriva a schermo');

  /* ⛔ UNA VOLTA SOLA: la pulizia non deve ripetersi a ogni passata, o toglierebbe le righe che ha
     appena disegnato lei. Qui la seconda passata trova la riga di prima e la tiene. */
  const carta = carte(rail)[0];
  disegnaProcessi(d, rail, [datiProcesso({ id: 'vero', comando: 'git status --short', stato: 'riuscito', giro: 1, durataMs: 300, uscita: 0 })]);
  assert.equal(carte(rail).length, 1);
  assert.equal(carte(rail)[0], carta, 'la riga vera è lo stesso nodo, non ricreato');
});

/* ═══════════════════ BLOCCO 4 — LA DESCRIZIONE DEL MODELLO IN RIGA ═══ */

/*
 * ⭐⭐⭐ 20/09/2026 — owner: «i comandi nella sidebar di destra non hanno una descrizione, sono
 * comandi puri, dobbiamo al tool dei comandi che chiama il modello fare in modo CHE ESSO gli dia una
 * descrizione personalizzata».
 *
 * ⛔ IL DATO ESISTEVA GIÀ E NON SI VEDEVA: il modello emette `descrizione` con ogni comando, in chat
 *   è già l'etichetta primaria, e nella riga dei Processi restava sepolta nel dettaglio. Un comando
 *   grezzo dice cosa è stato eseguito; non dice PERCHÉ, che è la sola cosa che si vuole sapere
 *   guardando una lista di processi.
 */
test('PROC-DESCRIZIONE: la descrizione del modello è il titolo, e il comando le sta sotto', () => {
  const d = documentoFinto(); const rr = d.createElement('div');
  disegnaProcessi(d, rr, [datiProcesso({ id: 'a', comando: 'git status --short', stato: 'riuscito', descrizione: 'Controllo cosa ho modificato' })]);
  const card = carte(rr)[0];
  const titolo = conClasse(card, 'talos-process__titolo')[0];
  assert.ok(titolo, 'la riga porta il nodo del titolo');
  assert.equal(titolo.textContent, 'Controllo cosa ho modificato', 'il titolo è la descrizione del modello');
  assert.equal(titolo.hidden, false, 'con la descrizione il titolo si vede');
  /* ⛔⛔ E IL COMANDO NON SI DISEGNA, su ordine dell'owner dalla foto del 20/09/2026: «i comandi
     occupano uno spazio enorme … mantieni solo la descrizione … nella riga espansa si vede già il
     comando». Un comando con un for dentro sta su quattro-sei righe, e sono quelle a decidere
     quante voci si vedono in lista. Il comando vive nel dettaglio, che si apre col chevron. */
  const cmd = conClasse(card, 'talos-process__cmd')[0];
  assert.ok(cmd, 'il nodo del comando esiste ancora — non si perde una funzione, si smette di disegnarla');
  assert.equal(cmd.hidden, true, 'con la descrizione il comando è NASCOSTO, non attenuato');
});

test('PROC-DESCRIZIONE-ASSENTE: senza descrizione il comando resta il titolo, e non si inventa niente', () => {
  const d = documentoFinto(); const rr = d.createElement('div');
  disegnaProcessi(d, rr, [datiProcesso({ id: 'b', comando: 'ls -la', stato: 'riuscito' })]);
  const card = carte(rr)[0];
  const titolo = conClasse(card, 'talos-process__titolo')[0];
  assert.ok(titolo, 'il nodo del titolo esiste comunque');
  assert.equal(titolo.hidden, true, 'senza descrizione il titolo è nascosto');
  assert.equal(titolo.textContent, '', 'non si inventa niente al posto della descrizione');
  const cmdB = conClasse(card, 'talos-process__cmd')[0];
  assert.equal(cmdB.hidden, false, 'senza descrizione il comando È la riga: si vede');
  assert.match(cmdB.textContent || '', /ls/, 'e si legge');
});

test('PROC-DESCRIZIONE-VUOTA: una descrizione di soli spazi si tratta come assente', () => {
  const d = documentoFinto(); const rr = d.createElement('div');
  disegnaProcessi(d, rr, [datiProcesso({ id: 'c', comando: 'pwd', stato: 'riuscito', descrizione: '   ' })]);
  const card = carte(rr)[0];
  assert.equal(conClasse(card, 'talos-process__titolo')[0].hidden, true, 'spazi non sono una descrizione');
});

/* ═══════════════════════════════════ Stop per riga (owner 02/10/2026) ═══ */
/*
 * Decisioni owner del 02/10/2026: «icona in riga, solo mentre gira», senza conferma; l'agente continua; se l'uccisione non
 * riesce la riga resta «in corso» e lo dice (come Hermes, `apps/desktop/src/store/composer-status.ts:458-462`).
 */
const fermaDi = (card) => conClasse(card, 'talos-process__ferma')[0];
const avvisoDi = (card) => conClasse(card, 'talos-process__avviso-ferma')[0];
const aspetta = () => new Promise((fatto) => setImmediate(fatto));

test('PROC-STOP-01: lo Stop compare solo sulle righe in corso o in attesa, e solo se chi disegna sa fermare', () => {
  const d = documentoFinto(); const rr = d.createElement('div');
  const azioni = { ferma: async () => ({ ok: true }) };
  const lista = [
    datiProcesso({ id: 'a', comando: 'npm test', stato: 'in-corso' }), datiProcesso({ id: 'b', comando: 'sleep 9', stato: 'in-attesa' }),
    datiProcesso({ id: 'c', comando: 'ls', stato: 'in-avvio' }), datiProcesso({ id: 'e', comando: 'pwd', stato: 'riuscito' }),
  ];
  disegnaProcessi(d, rr, lista, { azioni });
  const per = Object.fromEntries(carte(rr).map((c) => [c.dataset.processo, fermaDi(c)]));
  assert.equal(per.a.hidden, false); assert.equal(per.b.hidden, false);
  assert.equal(per.c.hidden, true, '«in avvio»: il comando non esiste ancora');
  assert.equal(per.e.hidden, true, 'una riga finita non si ferma');
  assert.equal(per.a.getAttribute('aria-label'), 'Ferma questo comando');
  const uso = tutti(per.a).find((n) => n.tag === 'use');
  assert.equal(uso.getAttribute('href'), '#i-stop', 'la stessa icona dello Stop del compositore');
  const d2 = documentoFinto(); const r2 = d2.createElement('div');
  disegnaProcessi(d2, r2, [datiProcesso({ id: 'a', comando: 'npm test', stato: 'in-corso' })]);
  assert.equal(fermaDi(carte(r2)[0]).hidden, true, 'senza azioni nessun pulsante che non può mantenere');
});

test('PROC-STOP-02: il clic ferma QUEL comando, la riga lo dice, e l esito vero chiude la riga', async () => {
  const d = documentoFinto(); const rr = d.createElement('div');
  const chiesti = [];
  const azioni = { ferma: async (id) => { chiesti.push(id); return { ok: true } } };
  disegnaProcessi(d, rr, [datiProcesso({ id: 'a', comando: 'npm test', stato: 'in-corso' }), datiProcesso({ id: 'b', comando: 'sleep 9', stato: 'in-corso' })], { azioni });
  const card = carte(rr).find((c) => c.dataset.processo === 'b');
  const evento = fermaDi(card).lancia('click');
  assert.equal(evento.defaultPrevented, true);
  assert.equal(fermaDi(card).disabled, true, 'un secondo clic non riparte');
  assert.equal(avvisoDi(card).hidden, false);
  assert.equal(avvisoDi(card).textContent, 'Fermo il comando…');
  await aspetta();
  assert.deepEqual(chiesti, ['b'], 'solo la riga cliccata');
  // l'esito vero arriva dal server: la riga diventa «Annullato» e l'avviso se ne va
  disegnaProcessi(d, rr, [datiProcesso({ id: 'a', comando: 'npm test', stato: 'in-corso' }), datiProcesso({ id: 'b', comando: 'sleep 9', stato: 'annullato' })]);
  assert.equal(fermaDi(card).hidden, true);
  assert.equal(avvisoDi(card).hidden, true);
  assert.equal(fermaDi(card).disabled, false);
});

test('PROC-STOP-03: se la richiesta non parte la riga lo dice con le parole del server, e il pulsante torna', async () => {
  const d = documentoFinto(); const rr = d.createElement('div');
  const azioni = { ferma: async () => ({ ok: false, messaggio: 'Questo comando non è più in corso' }) };
  disegnaProcessi(d, rr, [datiProcesso({ id: 'a', comando: 'npm test', stato: 'in-corso' })], { azioni });
  const card = carte(rr)[0];
  fermaDi(card).lancia('click');
  await aspetta();
  assert.equal(avvisoDi(card).textContent, 'Non fermato: Questo comando non è più in corso');
  assert.equal(fermaDi(card).disabled, false, 'si può riprovare');
  assert.equal(fermaDi(card).hidden, false, 'la riga è ancora in corso: lo Stop resta');
});

test('PROC-STOP-04: se dopo 8 s la riga è ancora in corso, dice che non si è fermato e il pulsante torna', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const d = documentoFinto(); const rr = d.createElement('div');
  disegnaProcessi(d, rr, [datiProcesso({ id: 'a', comando: 'npm test', stato: 'in-corso' })], { azioni: { ferma: async () => ({ ok: true }) } });
  const card = carte(rr)[0];
  fermaDi(card).lancia('click');
  await aspetta();
  t.mock.timers.tick(7_999);
  assert.equal(avvisoDi(card).textContent, 'Fermo il comando…');
  t.mock.timers.tick(1);
  assert.equal(avvisoDi(card).textContent, 'Non si è fermato: riprova lo Stop.');
  assert.equal(fermaDi(card).disabled, false);
});

/* ═════════════════════════════════ Il consenso (owner 02/10/2026) ═══ */
/*
 * Prova dal vivo sul 4174: un comando dell'agente che aspettava il consenso stava «In corso» con lo Stop, e lo Stop
 * rispondeva «non è più in corso». Decisione owner: la riga dice «Aspetta il tuo consenso» e non ha lo Stop.
 */
const eventiConConsenso = (extra = []) => [
  { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', ricevutoA: 1_000 },
  { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"comando":"ping -c 60 127.0.0.1"}' },
  { type: 'ApprovalRequested', requestId: 'r1', toolCallId: 'c1' },
  ...extra,
];

test('PROC-CONSENSO-01: un comando che aspetta il consenso dice «Aspetta il tuo consenso» e non ha lo Stop', () => {
  const [p] = processiDagliEventi(eventiConConsenso(), { adesso: 1_000 + 10 * 60_000 });
  assert.equal(p.stato, 'in-consenso', 'e non «in attesa» anche dopo dieci minuti: aspettare TE non è un processo fermo');
  assert.equal(STATI_PROCESSO['in-consenso'].etichetta, 'Aspetta il tuo consenso');
  assert.equal(STATI_PROCESSO['in-consenso'].vivo, true, 'conta fra i vivi: la riga non è chiusa');
  const d = documentoFinto(); const rr = d.createElement('div');
  disegnaProcessi(d, rr, [p], { azioni: { ferma: async () => ({ ok: true }) } });
  const card = carte(rr)[0];
  assert.equal(fermaDi(card).hidden, true, 'niente Stop: il comando non è ancora partito');
  assert.ok(tutti(card).some((n) => n.textContent === 'Aspetta il tuo consenso'), 'la parola si legge in riga');
});

test('PROC-CONSENSO-02: dato il consenso il comando parte, torna «In corso» e lo Stop ricompare; il silenzio si conta da lì', () => {
  const eventi = eventiConConsenso([{ type: 'ApprovalResolved', requestId: 'r1', ricevutoA: 1_000 + 5 * 60_000 }]);
  const [p] = processiDagliEventi(eventi, { adesso: 1_000 + 5 * 60_000 + 1_000 });
  assert.equal(p.stato, 'in-corso', 'un consenso dato dopo cinque minuti non fa dire «In attesa» a un comando appena partito');
  const d = documentoFinto(); const rr = d.createElement('div');
  disegnaProcessi(d, rr, [p], { azioni: { ferma: async () => ({ ok: true }) } });
  assert.equal(fermaDi(carte(rr)[0]).hidden, false);
});

test('PROC-CONSENSO-03 al contrario: consenso negato → «Non eseguito»; un consenso di un altro comando non tocca la riga', () => {
  const negato = processiDagliEventi(eventiConConsenso([
    { type: 'ApprovalResolved', requestId: 'r1', ricevutoA: 2_000 },
    { type: 'ToolCallResult', toolCallId: 'c1', ricevutoA: 2_001, errore: true, uscita: null, rifiutato: true },
  ]), { adesso: 3_000 })[0];
  assert.equal(negato.stato, 'non-eseguito');
  const altro = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell', ricevutoA: 1_000 },
    { type: 'ToolCallArgs', toolCallId: 'c1', delta: '{"comando":"ls"}' },
    { type: 'ApprovalRequested', requestId: 'r9', toolCallId: 'scrivi-7' },
  ], { adesso: 1_500 })[0];
  assert.equal(altro.stato, 'in-corso', 'il consenso chiesto per un altro attrezzo non è di questa riga');
});

test('PROC-CHI-TU — 02/10/2026: il comando `!` della persona dice «tu · terminale», non «agente · giro N»', () => {
  const [mio, suo] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 'a', toolCallName: 'shell', ricevutoA: 1_000, giro: 1, chi: 'agente' },
    { type: 'ToolCallArgs', toolCallId: 'a', delta: '{"comando":"ls"}' },
    { type: 'ToolCallStart', toolCallId: 'p', toolCallName: 'shell', ricevutoA: 2_000, giro: 1, chi: 'tu' },
    { type: 'ToolCallArgs', toolCallId: 'p', delta: '{"comando":"ping -n 45 127.0.0.1"}' },
  ], { adesso: 2_100 });
  assert.equal(mio.chi, 'tu');
  assert.equal(datiProcesso(mio).chi, 'tu · terminale');
  assert.equal(suo.chi, 'agente', 'senza il campo resta «agente», come prima');
  assert.match(datiProcesso(suo).chi, /^agente · giro 1$/u);
});

test('PROC-USCITA-CAMPO — 02/10/2026: il codice si legge da `exitCode`; col testo nuovo un comando FERMATO resta «Annullato»', async () => {
  const { uscitaDelRisultato } = await import('../../src/components/inspector.js');
  // il contenuto VERO della prova dal vivo sul 4174 (sessione 26d2c9e3…, comando fermato dalla sua riga)
  const content = '[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]\nexit 130 [sandbox: wsl2]\n⛔ Fermato su richiesta: il comando e stato interrotto mentre girava.';
  assert.equal(uscitaDaTestoAttrezzo(content), null, 'la lettura a inizio testo non lo trova più: è il difetto');
  assert.equal(uscitaDelRisultato({ exitCode: 130, content }), 130);
  assert.equal(uscitaDelRisultato({ content: 'exit 3 [sandbox: wsl2]\nboom' }), 3, 'una sessione salvata prima del campo si legge ancora dal testo');
  assert.equal(uscitaDelRisultato({ exitCode: 1.5, content: 'exit 2' }), 2, 'un campo storto non diventa un numero a schermo');
  const [p] = processiDagliEventi([
    { type: 'ToolCallStart', toolCallId: 'c', toolCallName: 'shell', ricevutoA: 1_000 },
    { type: 'ToolCallArgs', toolCallId: 'c', delta: '{"comando":"ping -c 60 127.0.0.1"}' },
    { type: 'ToolCallResult', toolCallId: 'c', ricevutoA: 1_700, errore: true, uscita: uscitaDelRisultato({ exitCode: 130, content }) },
  ], { adesso: 2_000 });
  assert.equal(p.stato, 'annullato', 'fermato apposta: «Annullato», mai «Non riuscito»');
});
