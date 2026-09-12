import test from 'node:test';
import assert from 'node:assert/strict';
import {
  puoMettereInPausa, puoRiprendere, puoRicontrollareLeFonti, paroleErroreRicerca, AZIONI_RICERCA,
  vociMenuRicerca, montaDettaglioRicerca, magazzinoRicerche, montaEsitoRiverifica, frasiRiverifica,
  statoFonteRiverifica, governoRicercheVive, ricercheInCorso, INTERVALLO_RICERCHE_VIVE, frasiSpesa,
  frasePassaggi, esportazioniRicerca, montaPannelloEsportazioni, indirizzoEsportazione, FORMATI_ESPORTAZIONE,
} from '../../src/components/ricerca-dettaglio.js';

/*
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * L5 — 12/09/2026: LA SEZIONE RICERCA SMETTE DI ESSERE DI SOLA LETTURA
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Le rotte esistono (`.claude/RAPPORTO-RICERCA-L5-2026-09-12.md` §3) e l'owner le ha approvate.
 * Qui si prova quello che la SEZIONE fa con quel contratto: quando un comando esiste, cosa dice
 * quando il server risponde di no, e come disegna un esito che per metà non si può misurare.
 *
 * ⛔ OGNI PROVA NEI DUE VERSI. Un menu «che mostra le azioni giuste» va anche chiesto di NON
 *   mostrare quelle sbagliate: un elenco che le mostra sempre supera la prima metà del test
 *   esattamente come uno corretto (lezione del cancello semantico spento da sempre, 27/8).
 * ⛔ Nessuna rete, nessun server, nessun timer vero: `avvia`/`ferma` e le letture sono iniettate.
 *   Il giro a filo intero contro il server VERO sta in `tests/integration/ricerca-vivo-frontend.test.mjs`.
 */

/* --------------------------------------------------------------- il DOM finto, come per L7 */

function nodoFinto(tag, doc) {
  const nodo = {
    tagName: String(tag).toUpperCase(),
    figli: [], dataset: {}, className: '', textContent: '', style: {},
    attributi: new Map(), ascoltatori: new Map(), ownerDocument: doc,
    append(...nuovi) { for (const n of nuovi) if (n) nodo.figli.push(n); },
    replaceChildren(...nuovi) { nodo.figli = nuovi.filter(Boolean); },
    setAttribute(k, v) { nodo.attributi.set(k, String(v)); },
    getAttribute(k) { return nodo.attributi.get(k) ?? null; },
    addEventListener(tipo, fn) { nodo.ascoltatori.set(tipo, [...(nodo.ascoltatori.get(tipo) || []), fn]); },
    focus() { doc.activeElement = nodo; },
    discendenti() { return nodo.figli.flatMap((f) => [f, ...(f.discendenti ? f.discendenti() : [])]); },
    scatta(tipo, evento = {}) { for (const fn of nodo.ascoltatori.get(tipo) || []) fn({ target: nodo, preventDefault() {}, stopPropagation() {}, ...evento }); },
  };
  return nodo;
}
function documentoFinto() {
  const doc = { activeElement: null };
  doc.createElement = (tag) => nodoFinto(tag, doc);
  doc.createElementNS = (_ns, tag) => nodoFinto(tag, doc);
  doc.createTextNode = (t) => ({ textContent: String(t), figli: [], discendenti: () => [] });
  return doc;
}
function testoDi(nodi) {
  const uno = (n) => [n.textContent || '', ...(n.discendenti ? n.discendenti().map((f) => f.textContent || '') : [])].join(' ');
  return nodi.filter(Boolean).map(uno).join(' ');
}
function pannelloDi(pezzi) { return pezzi.find((n) => n.getAttribute?.('role') === 'tabpanel'); }

/** Monta il dettaglio con una vista già scelta, e torna il testo di quel pannello. */
function testoVista(doc, schermo, voce, vista, opzioni = {}) {
  const magazzino = magazzinoRicerche(schermo);
  magazzino.viste.set(String(voce.id), vista);
  const pezzi = montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni });
  return testoDi([pannelloDi(pezzi)]);
}

/* ═════════════════════════════════════════════ 1. QUANDO un'azione può esistere ══════════ */

test('L5-STATI: un’azione esiste solo dove può riuscire — e «Riprendi» vale anche su una INTERROTTA', () => {
  assert.equal(puoMettereInPausa({ stato: 'running' }), true);
  for (const stato of ['paused', 'done', 'failed', 'cancelled', 'senza-rapporto', 'giri-esauriti', undefined]) {
    assert.equal(puoMettereInPausa({ stato }), false, `in pausa non si mette una ${stato}`);
  }
  /*
   * ⛔⛔ `failed` È lo stato di una ricerca uccisa a metà da un riavvio: `statoVivo`
   *   (`research-orchestrator.mjs:393-397`) dice «se la sessione non c'è più o è interrotta ⇒
   *   failed», e nel contratto lo stato `interrupted` non esiste. Offrire «Riprendi» solo su
   *   `paused` toglierebbe il comando proprio al caso per cui il giornale di L4 e la cura di
   *   L5 §7 sono stati scritti. Questa riga è quella che impedisce di «semplificare» la guardia.
   */
  assert.equal(puoRiprendere({ stato: 'paused' }), true);
  assert.equal(puoRiprendere({ stato: 'failed' }), true, 'una interrotta da un riavvio si presenta come failed');
  for (const stato of ['running', 'done', 'cancelled', 'senza-rapporto', undefined]) {
    assert.equal(puoRiprendere({ stato }), false, `non si riprende una ${stato}`);
  }
  assert.equal(puoRicontrollareLeFonti({ stato: 'done', reportLibraryId: 'lib-1' }), true);
  assert.equal(puoRicontrollareLeFonti({ stato: 'done', reportLibraryId: null }), false);
  assert.equal(puoRicontrollareLeFonti({ stato: 'senza-rapporto', reportLibraryId: 'lib-1' }), false,
    'un file respinto dal cancello di consegna non è un rapporto da ricontrollare');
});

test('L5-MENU: le quattro azioni compaiono con lo stato giusto, e MAI senza la loro porta di rete', () => {
  const iniezioni = { onPausa: () => {}, onRiprendi: () => {}, onRiverifica: () => {}, onElimina: () => {} };
  assert.deepEqual(vociMenuRicerca({ id: 'r1', domanda: 'D', stato: 'running' }, iniezioni).map((v) => v.chiave), ['pausa', 'elimina']);
  assert.deepEqual(vociMenuRicerca({ id: 'r2', domanda: 'D', stato: 'paused' }, iniezioni).map((v) => v.chiave), ['ripresa', 'elimina']);
  const conclusa = vociMenuRicerca({ id: 'r3', domanda: 'D', stato: 'done', reportLibraryId: 'lib-1' }, iniezioni);
  assert.deepEqual(conclusa.map((v) => v.chiave), ['riverifica', 'elimina']);

  // ⛔ Pausa e ripresa non compaiono MAI insieme: sono l'una l'inverso dell'altra sullo stesso oggetto.
  for (const stato of ['running', 'paused', 'failed', 'done', 'cancelled', 'senza-rapporto']) {
    const voci = vociMenuRicerca({ id: 'r', domanda: 'D', stato }, iniezioni).map((v) => v.chiave);
    assert.ok(!(voci.includes('pausa') && voci.includes('ripresa')), `su ${stato} compaiono tutte e due`);
  }
  // ⛔ IL VERSO CONTRARIO: senza iniezioni non si disegna un comando che non può funzionare.
  assert.deepEqual(vociMenuRicerca({ id: 'r1', domanda: 'D', stato: 'running' }, {}).map((v) => v.chiave), []);
  // ⛔ E una sola iniezione accende una sola voce: non è un interruttore unico per tutte e quattro.
  assert.deepEqual(vociMenuRicerca({ id: 'r1', domanda: 'D', stato: 'running' }, { onElimina: () => {} }).map((v) => v.chiave), ['elimina']);

  const elimina = conclusa.at(-1);
  assert.equal(elimina.chiave, 'elimina');
  assert.equal(elimina.pericolo, true, 'l’eliminazione si vede che è distruttiva');
  assert.equal(elimina.separaPrima, true, 'una riga la stacca da ciò che si può premere senza conseguenze');
  assert.equal(elimina.etichetta, 'Elimina la ricerca');
  // Le etichette sono verbi in italiano, e nessuna nomina una rotta o un campo.
  for (const voce of conclusa) assert.ok(!/[_:/]/.test(voce.etichetta), `«${voce.etichetta}» sa di tecnico`);
});

test('L5-MENU: l’azione premuta riceve la VOCE, non un id — e il menu non la chiama da solo', () => {
  const premute = [];
  const voce = { id: 'r-viva', domanda: 'D', stato: 'running' };
  const voci = vociMenuRicerca(voce, { onPausa: (v) => premute.push(['pausa', v]), onElimina: (v) => premute.push(['elimina', v]) });
  assert.deepEqual(premute, [], 'costruire il menu non esegue niente');
  voci.find((v) => v.chiave === 'pausa').aziona();
  assert.deepEqual(premute, [['pausa', voce]]);
});

/* ═══════════════════════════════════════════ 2. il «no» del server, detto a una persona ══ */

test('L5-ERRORI: il 409 diventa la frase di CHI HA PREMUTO, mai un codice', () => {
  assert.match(paroleErroreRicerca('RESEARCH_CONFLICT', 'pausa'), /^Non sta girando/);
  assert.match(paroleErroreRicerca('RESEARCH_CONFLICT', 'ripresa'), /niente da riprendere/);
  assert.match(paroleErroreRicerca('RESEARCH_RECHECK_UNAVAILABLE', 'riverifica'), /passaggi citati/);
  assert.match(paroleErroreRicerca('RESEARCH_NOT_FOUND', 'elimina'), /non c’è più/);
  assert.match(paroleErroreRicerca('NOT_FOUND', 'pausa'), /sessione non è più aperta/);
  // ⛔ Due azioni diverse sullo stesso codice NON danno la stessa frase: è tutto il punto.
  assert.notEqual(paroleErroreRicerca('RESEARCH_CONFLICT', 'pausa'), paroleErroreRicerca('RESEARCH_CONFLICT', 'ripresa'));
  // ⛔ Un codice sconosciuto nomina comunque l'azione: «non è riuscito» da solo non dice cosa.
  assert.equal(paroleErroreRicerca('INTERNAL_ERROR', 'riverifica'), 'Non sono riuscito a ricontrollare le fonti: riprova fra un momento.');
  assert.equal(paroleErroreRicerca(undefined, 'boh'), 'Non sono riuscito a fare questo: riprova fra un momento.');
  // ⛔ Nessuna frase nomina il codice, la cartella o un nome tecnico: sono per una persona.
  for (const codice of ['RESEARCH_CONFLICT', 'RESEARCH_NOT_FOUND', 'RESEARCH_INVALID', 'RESEARCH_RECHECK_UNAVAILABLE', 'INTERNAL_ERROR', 'NOT_FOUND']) {
    for (const azione of [...AZIONI_RICERCA.keys()]) {
      const frase = paroleErroreRicerca(codice, azione);
      assert.ok(!/[A-Z]{4,}_/.test(frase), `${codice}/${azione} nomina un codice: «${frase}»`);
      assert.ok(!frase.includes('.harness-ui'), `${codice}/${azione} nomina una cartella: «${frase}»`);
      assert.ok(frase.endsWith('.'), `${codice}/${azione} non è una frase intera: «${frase}»`);
    }
  }
});

/* ═══════════════════════════════ 3. la ri-verifica: l'esito che non si può falsificare ═══ */

/*
 * ⛔ Questo è l'esito VERO che la rotta produce oggi sui dati veri (contratto L5 §4.3): `misurabile:
 *   false`, ogni fonte `non-misurabile` o `irraggiungibile`, `sopravvissuto: null`. `intatta` e
 *   `cambiata` non escono MAI finché il collettore non tiene il testo con il suo url (§3.4). Un
 *   banco costruito su un esito «tutto intatto» proverebbe una vista che nessuno vedrà.
 */
const RIVERIFICA = {
  id: 'r', fattaAlle: '2026-09-12T10:00:00.000Z', misurabile: false,
  avvertenza: 'Il testo delle pagine non era stato tenuto per questa ricerca: «intatta» o «cambiata» non si possono dire.',
  fonti: [
    { url: 'https://esempio.it/uno', titolo: 'Uno', stato: 'non-misurabile', sopravvissuto: null, motivoLettura: null, passaggiRitrovati: 1, passaggiPersi: 0 },
    { url: 'https://esempio.it/due', titolo: 'Due', stato: 'irraggiungibile', sopravvissuto: null, motivoLettura: 'unreadable', passaggiRitrovati: 0, passaggiPersi: 0 },
    { url: 'https://esempio.it/tre', titolo: 'Tre', stato: 'non-misurabile', sopravvissuto: null, motivoLettura: null, passaggiRitrovati: 0, passaggiPersi: 2 },
  ],
  bilancio: { fonti: 3, intatte: 0, cambiate: 0, irraggiungibili: 1, nonMisurabili: 2, passaggiCitati: 3, passaggiRitrovati: 1, passaggiPersi: 2 },
  troncata: false, fontiTotali: 3, testiTenuti: 0,
};

test('L5-RIVERIFICA: «non confrontabile» non diventa MAI «a posto», e l’avvertenza si stampa', () => {
  const doc = documentoFinto();
  const blocco = montaEsitoRiverifica(doc, { stato: 'pronto', esito: RIVERIFICA });
  const testo = testoDi([blocco]);
  assert.equal(blocco.getAttribute('role'), 'status', 'WCAG 2.2 SC 4.1.3: l’esito si annuncia senza rubare il fuoco');
  assert.ok(testo.includes('non confrontabile'));
  assert.ok(testo.includes(RIVERIFICA.avvertenza), 'l’avvertenza del server si stampa per intero, e in alto');
  /*
   * ⛔⛔ IL VERSO CONTRARIO, ed è il motivo per cui tutta questa vista esiste: su un esito che non
   *   si è potuto misurare non deve comparire NESSUNA parola di rassicurazione. Il modulo che
   *   misura, chiamato senza la mappa dei testi tenuti, direbbe `intact` su tutto.
   * ⛔ Si guardano le RIGHE e il bilancio, non tutto il riquadro: l'avvertenza del server la
   *   parola «intatta» ce l'ha per NEGARLA («"intatta" o "cambiata" non si possono dire»), e una
   *   ricerca di sottostringa sull'intero blocco boccerebbe proprio la frase più onesta che c'è.
   *   Trovato facendo girare il test, non ragionandoci: la prima stesura falliva qui.
   */
  const verdetti = [...blocco.discendenti().filter((n) => n.className === 'td-riverifica-fonte').map((n) => testoDi([n])), frasiRiverifica(RIVERIFICA)].join(' ').toLowerCase();
  for (const bugia of ['intatta', 'intatte', 'tutto a posto', 'ancora valida', 'confermata']) {
    assert.ok(!verdetti.includes(bugia), `«${bugia}» non deve comparire su un esito non misurabile`);
  }
  // ⛔ E il bilancio mette PRIMA ciò che si è perso: è l'unica cosa su cui una persona agisce.
  assert.match(frasiRiverifica(RIVERIFICA), /^3 fonti rilette: 2 passaggi non si ritrovano più/);
  assert.equal(frasiRiverifica({ bilancio: { fonti: 0 } }), 'Nessuna fonte da ricontrollare in questo rapporto.');
});

test('L5-RIVERIFICA: su una pagina che non si apre, «0 passaggi persi» NON è una buona notizia', () => {
  const doc = documentoFinto();
  const blocco = montaEsitoRiverifica(doc, { stato: 'pronto', esito: RIVERIFICA });
  const righe = blocco.discendenti().filter((n) => n.className === 'td-riverifica-fonte');
  assert.equal(righe.length, 3);
  const irraggiungibile = testoDi([righe[1]]);
  assert.ok(irraggiungibile.includes('non si apre'));
  assert.ok(irraggiungibile.includes('non vuol dire che sia cambiata'), 'si dice che non lo sappiamo');
  assert.ok(!irraggiungibile.includes('ancora in questa pagina'), 'una pagina non letta non certifica niente');
  // ⛔ Verso contrario: dove i passaggi SONO stati guardati, la riga li conta, in tutti e due i sensi.
  assert.ok(testoDi([righe[0]]).includes('Il passaggio citato è ancora in questa pagina'));
  assert.ok(testoDi([righe[2]]).includes('Nessuno dei 2 passaggi citati si ritrova più'));
  /*
   * ⛔ L'ITALIANO SI PROVA, o torna «Tutti i 1 passaggi» — la frase che la foto del 12/09 ha
   *   trovato. Sono quattro casi, e ognuno ha una frase sua: tutti salvi, tutti persi, alcuni
   *   persi, e il singolare di ciascuno.
   */
  assert.equal(frasePassaggi(1, 0), 'Il passaggio citato è ancora in questa pagina.');
  assert.equal(frasePassaggi(3, 0), 'Tutti i 3 passaggi citati sono ancora in questa pagina.');
  assert.equal(frasePassaggi(0, 1), 'Il passaggio citato non si ritrova più in questa pagina.');
  assert.equal(frasePassaggi(0, 4), 'Nessuno dei 4 passaggi citati si ritrova più in questa pagina.');
  assert.equal(frasePassaggi(3, 1), '1 dei 4 passaggi citati non si ritrova più in questa pagina.');
  assert.equal(frasePassaggi(1, 2), '2 dei 3 passaggi citati non si ritrovano più in questa pagina.');
  assert.equal(frasePassaggi(0, 0), null, 'nessun passaggio citato: nessuna riga, non uno zero');
  // Uno stato che il server non conosce non diventa un verdetto.
  assert.equal(statoFonteRiverifica('boh').tono, '');
  assert.equal(statoFonteRiverifica('non-misurabile').tono, '', 'nessun colore su «non lo sappiamo»');
  assert.equal(statoFonteRiverifica('intatta').tono, 'success');
});

test('L5-RIVERIFICA: l’attesa si dichiara, un guasto è un ALERT, e senza esito non c’è riquadro', () => {
  const doc = documentoFinto();
  const attesa = montaEsitoRiverifica(doc, { stato: 'in-corso' });
  assert.equal(attesa.getAttribute('role'), 'status');
  assert.ok(testoDi([attesa]).includes('rileggendo'), 'una richiesta che esce in rete si dichiara prima');
  const guasto = montaEsitoRiverifica(doc, { stato: 'errore', errore: 'Non si può ancora ricontrollare.' });
  assert.equal(guasto.getAttribute('role'), 'alert', 'SC 4.1.3: un guasto è un alert, un esito è uno status');
  assert.equal(montaEsitoRiverifica(doc, null), null);
  assert.equal(montaEsitoRiverifica(doc, { stato: 'pronto', esito: null }), null);
});

test('L5-RIVERIFICA: una lista TRONCATA lo dice, invece di far credere che siano tutte', () => {
  const doc = documentoFinto();
  const testo = testoDi([montaEsitoRiverifica(doc, { stato: 'pronto', esito: { ...RIVERIFICA, troncata: true, fontiTotali: 41 } })]);
  assert.ok(testo.includes('Rilette le prime 3 fonti su 41'));
  assert.ok(testo.includes('le altre non sono state guardate'));
});

test('L5-RIVERIFICA: l’esito compare nella vista FONTI anche su un rapporto senza record', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = { id: 'r-riv', domanda: 'D', stato: 'done', reportLibraryId: 'lib-riv' };
  magazzinoRicerche(schermo).riverifiche.set('r-riv', { stato: 'pronto', esito: RIVERIFICA });
  assert.ok(testoVista(doc, schermo, voce, 'fonti').includes('Le fonti, rilette adesso'));
  // ⛔ Verso contrario: senza ri-verifica quella vista resta esattamente quella di ieri.
  magazzinoRicerche(schermo).riverifiche.delete('r-riv');
  assert.ok(!testoVista(doc, schermo, voce, 'fonti').includes('rilette adesso'));
});

/* ════════════════════════ 4. l'orologio: la card che restava «In corso» per sempre ═══════ */

test('L5-OROLOGIO: si accende solo se qualcosa può cambiare da solo, e si spegne quando non c’è più', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const armati = [];
  const spenti = [];
  const avvia = (fn, ms) => { armati.push({ fn, ms }); return armati.length; };
  const ferma = (id) => spenti.push(id);

  const conViva = governoRicercheVive(schermo, { elenco: [{ stato: 'done' }, { stato: 'running' }], aggiorna: () => {}, avvia, ferma });
  assert.deepEqual(conViva, { vive: 1, acceso: true });
  assert.equal(armati[0].ms, INTERVALLO_RICERCHE_VIVE);

  // ⛔ IL VERSO CONTRARIO, ed è metà del valore: senza ricerche in corso non si bussa al server.
  const senzaVive = governoRicercheVive(schermo, { elenco: [{ stato: 'done' }, { stato: 'paused' }], aggiorna: () => {}, avvia, ferma });
  assert.deepEqual(senzaVive, { vive: 0, acceso: false });
  assert.deepEqual(spenti, [1], 'il timer del giro prima è stato spento, non lasciato in giro');
  assert.equal(armati.length, 1, 'e non ne è nato un secondo');

  // ⛔ Una `paused` o una `failed` non tengono acceso niente: aspettano una persona.
  assert.equal(ricercheInCorso([{ stato: 'paused' }, { stato: 'failed' }, { stato: 'done' }]).length, 0);
  assert.equal(ricercheInCorso([{ stato: 'running' }, { stato: 'running' }]).length, 2);
  assert.equal(ricercheInCorso(null).length, 0);

  // ⛔ Pagina non guardata: niente orologio. E senza nessuno che ricarichi, nemmeno.
  const nascosta = nodoFinto('section', doc);
  nascosta.hidden = true;
  assert.equal(governoRicercheVive(nascosta, { elenco: [{ stato: 'running' }], aggiorna: () => {}, avvia, ferma }).acceso, false);
  assert.equal(governoRicercheVive(schermo, { elenco: [{ stato: 'running' }], aggiorna: null, avvia, ferma }).acceso, false);
});

test('L5-OROLOGIO: allo scadere ricarica UNA volta, e non resta segnato come armato', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  let scatti = 0;
  let salvata = null;
  governoRicercheVive(schermo, {
    elenco: [{ stato: 'running' }], aggiorna: () => { scatti += 1; },
    avvia: (fn) => { salvata = fn; return 7; }, ferma: () => {},
  });
  assert.equal(magazzinoRicerche(schermo).orologio, 7);
  salvata();
  assert.equal(scatti, 1);
  assert.equal(magazzinoRicerche(schermo).orologio, null, 'scattato una volta, non resta armato');
});

/* ═══════════════════ 5. il PIANO e il COME È ANDATA, dalla rotta del dettaglio ═══════════ */

test('L5-PIANO: coi passi veri si legge in parole; senza, lo stato vuoto resta ONESTO', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = { id: 'r-piano', domanda: 'D', stato: 'running' };
  magazzinoRicerche(schermo).dettagli.set('r-piano', { stato: 'pronto', ricerca: {
    piano: [{ id: 'b1', question: 'Chi lo dice?', estimate: { tokens: 2000, searches: 1, pages: 2 } }],
    passi: [
      { id: 's1', branchId: 'b1', kind: 'search', state: 'done', attempts: 1, spend: { tokens: 900, searches: 1, pages: 0 } },
      { id: 's2', branchId: 'b1', kind: 'read', state: 'interrupted', attempts: 3, spend: { tokens: 0, searches: 0, pages: 0 } },
    ],
    spesa: { tokens: 2400, searches: 1, pages: 2 }, giornale: { eventi: 9, righeSaltate: 0, stato: 'collecting' },
  } });
  const testo = testoVista(doc, schermo, voce, 'piano');
  assert.ok(testo.includes('Chi lo dice?'));
  assert.ok(testo.includes('previsti 2,0k token'), 'la stima si chiama stima: «previsti», mai accanto allo speso senza etichetta');
  assert.ok(testo.includes('Ricerca sul web') && testo.includes('Lettura di una pagina'));
  assert.ok(testo.includes('interrotto a metà'), '«interrotto» non è «non riuscito»: il secondo accusa la ricerca');
  assert.ok(testo.includes('3 tentativi'));
  // ⛔ NIENTE NOMI TECNICI A SCHERMO (owner 04/09): i `kind` e gli `state` del contratto non escono.
  for (const sigla of ['search', 'synthesise', 'branchId', 'pending', 'interrupted', 'tokens']) {
    assert.ok(!testo.includes(sigla), `la sigla «${sigla}» non deve comparire a schermo`);
  }
  /*
   * ⛔ IL VERSO CONTRARIO, in due gradi: col dettaglio LETTO e le due liste vuote si dice che un
   *   piano non è stato dichiarato; SENZA il dettaglio non si promette che non esista. Sono due
   *   frasi diverse perché sono due fatti diversi.
   */
  magazzinoRicerche(schermo).dettagli.set('r-piano', { stato: 'pronto', ricerca: { piano: [], passi: [], spesa: null, giornale: null } });
  assert.ok(testoVista(doc, schermo, voce, 'piano').includes('non ha dichiarato nessuna linea di indagine'));
  magazzinoRicerche(schermo).dettagli.delete('r-piano');
  assert.ok(testoVista(doc, schermo, voce, 'piano').includes('Il piano arriva con il motore nuovo'));
});

test('L5-ANDATA: lo speso e il giornale compaiono, e «senza giornale» dice la conseguenza', () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = { id: 'r-andata', domanda: 'D', stato: 'paused' };
  magazzinoRicerche(schermo).dettagli.set('r-andata', { stato: 'pronto', ricerca: { piano: [], passi: [], spesa: { tokens: 12400, searches: 3, pages: 7 }, giornale: { eventi: 14, righeSaltate: 2, stato: 'paused' } } });
  const testo = testoVista(doc, schermo, voce, 'andata');
  assert.ok(testo.includes('12,4k token · 3 ricerche sul web · 7 pagine aperte'));
  assert.ok(testo.includes('14 passaggi registrati'));
  assert.ok(testo.includes('2 righe del giornale non si rileggono'), 'una lettura parziale si DICE');
  // ⛔ Verso contrario: senza giornale la riga cambia frase e spiega che non si può riprendere.
  magazzinoRicerche(schermo).dettagli.set('r-andata', { stato: 'pronto', ricerca: { piano: [], passi: [], spesa: null, giornale: null } });
  const vecchia = testoVista(doc, schermo, voce, 'andata');
  assert.ok(vecchia.includes('non ne ha uno') && vecchia.includes('non si può riprendere'));
  assert.ok(vecchia.includes('niente di misurato'), '«non misurato» non è «zero»');
  assert.ok(!vecchia.includes('righe del giornale non si rileggono'), 'zero righe saltate è rumore, non una notizia');
  // La spesa in parole: solo le voci contate davvero, e mai un numero vuoto.
  assert.equal(frasiSpesa({ tokens: 0, searches: 0, pages: 0 }), null);
  assert.equal(frasiSpesa({ tokens: 420, searches: 0, pages: 1 }), '420 token · 1 pagina aperta');
  assert.equal(frasiSpesa(null), null);
});

test('L5-DETTAGLIO: la scheda si chiede UNA volta sola, e un guasto non diventa un’attesa senza fine', async () => {
  const doc = documentoFinto();
  const schermo = nodoFinto('section', doc);
  const voce = { id: 'r-una', domanda: 'D', stato: 'running' };
  const magazzino = magazzinoRicerche(schermo);
  magazzino.viste.set('r-una', 'piano');
  let chiamate = 0;
  const opzioni = { leggiDettaglio: async () => { chiamate += 1; throw new Error('rete giù'); } };
  const monta = () => montaDettaglioRicerca(voce, { doc, magazzino, ridisegna: () => {}, apriMenu: () => {}, opzioni });
  monta();
  await new Promise((fatto) => setTimeout(fatto, 0));
  assert.equal(chiamate, 1);
  monta();
  await new Promise((fatto) => setTimeout(fatto, 0));
  assert.equal(chiamate, 1, 'la scheda non si richiede a ogni ridisegno');
  assert.equal(magazzino.dettagli.get('r-una').stato, 'errore');
  // ⛔ Col dettaglio in errore le viste cadono sullo stato onesto di prima di L5, mai su un vuoto.
  assert.ok(testoDi([pannelloDi(monta())]).includes('Il piano arriva con il motore nuovo'));
});

/* ═══════════════════ 6. LA SUITE DI ESPORTAZIONI — owner 12/09, «completa» ═══════════════ */

const RECORD_MINIMO = {
  version: 1, question: 'D', summary: 'S', judge: null,
  claims: [{ text: 'a', sourceIndex: 1, passage: 'p', checks: { claimSupported: 'yes' } }],
  sources: [{ url: 'https://esempio.it/uno', title: 'Uno', publishedAt: '2026-01-02', obtained: 'page' }],
};
const CONCLUSA = { id: 'r-exp', domanda: 'Una domanda', stato: 'done', reportLibraryId: 'lib-1' };
const chiavi = (elenco) => elenco.map((u) => u.chiave);
const spente = (elenco) => elenco.filter((u) => !u.disponibile).map((u) => u.chiave);

test('L5-ESPORTA: undici uscite, sempre tutte — quelle che non si possono fare restano, col MOTIVO', () => {
  const lettura = { stato: 'pronto', prosa: 'testo', testo: 'testo', record: RECORD_MINIMO };
  const tutte = esportazioniRicerca(CONCLUSA, lettura);
  assert.deepEqual(chiavi(tutte), ['md', 'pdf-report', 'pdf-brief', 'pdf-dossier', 'docx', 'html', 'json', 'bib', 'ris', 'fonti', 'copia']);
  assert.deepEqual(spente(tutte), [], 'col rapporto e col record si puo fare tutto');
  assert.deepEqual(tutte.filter((u) => u.avvertenza).map((u) => u.chiave), []);

  /* ⛔ SENZA IL RECORD: i quattro di dati muoiono, i documenti escono «senza verifiche». E' la
     stessa riga di taglio della rotta (409 per json/bib/ris/fonti, md/html/pdf comunque). */
  const senzaRecord = esportazioniRicerca(CONCLUSA, { stato: 'pronto', prosa: 'testo', testo: 'testo', record: null });
  assert.deepEqual(spente(senzaRecord), ['json', 'bib', 'ris', 'fonti']);
  assert.deepEqual(senzaRecord.filter((u) => u.avvertenza).map((u) => u.chiave), ['md', 'pdf-report', 'pdf-brief', 'pdf-dossier', 'docx', 'html']);
  for (const u of senzaRecord.filter((x) => !x.disponibile)) assert.ok(u.motivo.includes('riepilogo delle verifiche'));

  /* ⛔ SENZA RAPPORTO: niente si esporta, e il motivo e' UNO SOLO, quello vero. */
  const senzaRapporto = esportazioniRicerca({ id: 'r', stato: 'senza-rapporto', reportLibraryId: 'lib-1' }, { stato: 'pronto', prosa: 'x', record: null });
  assert.deepEqual(spente(senzaRapporto), ['md', 'pdf-report', 'pdf-brief', 'pdf-dossier', 'docx', 'html', 'json', 'bib', 'ris', 'fonti']);
  assert.equal(senzaRapporto.at(-1).disponibile, true, 'il testo depositato si copia comunque: esiste');

  /* ⛔ RECORD IGNOTO (rapporto non ancora letto) non e' record ASSENTE: non si spegne niente. */
  const nonLetto = esportazioniRicerca(CONCLUSA, null);
  assert.deepEqual(spente(nonLetto), ['copia'], 'solo la copia, perche il testo davvero non ce l’abbiamo');
  assert.equal(nonLetto.find((u) => u.chiave === 'json').disponibile, true, 'decide il server, non un’ipotesi');
});

test('L5-ESPORTA: l’indirizzo della rotta lo scrive UNA funzione, e il tono viaggia solo dove serve', () => {
  assert.equal(indirizzoEsportazione('s1', 'r1', 'md'), '/api/v1/sessions/s1/research/r1/esporta?formato=md');
  assert.equal(indirizzoEsportazione('s1', 'r1', 'pdf', 'dossier'), '/api/v1/sessions/s1/research/r1/esporta?formato=pdf&tono=dossier');
  // ⛔ Un id con una barra o uno spazio non deve poter uscire dal suo segmento.
  assert.equal(indirizzoEsportazione('a/b', 'c d', 'json'), '/api/v1/sessions/a%2Fb/research/c%20d/esporta?formato=json');
  // ⛔ Verso contrario: i tre toni del PDF sono DAVVERO tre indirizzi diversi.
  const toni = FORMATI_ESPORTAZIONE.filter((u) => u.formato === 'pdf').map((u) => indirizzoEsportazione('s', 'r', u.formato, u.tono));
  assert.equal(new Set(toni).size, 3);
});

test('L5-ESPORTA: il pannello disegna i tre gruppi, e una voce spenta NON esegue niente', () => {
  const doc = documentoFinto();
  const scelte = [];
  const elenco = esportazioniRicerca(CONCLUSA, { stato: 'pronto', prosa: 'testo', testo: 'testo', record: null });
  const pezzi = montaPannelloEsportazioni(doc, elenco, { onScegli: (u) => scelte.push(u.chiave) });
  const righe = pezzi.filter((n) => n.className === 'td-esporta-voce');
  assert.equal(righe.length, 11);
  assert.deepEqual(pezzi.filter((n) => n.className === 'td-esporta-gruppo').map((n) => n.textContent), ['Da leggere', 'Dati e citazioni', 'Senza file']);

  const json = righe.find((n) => n.dataset.uscita === 'json');
  assert.equal(json.getAttribute('aria-disabled'), 'true', 'APG/MDN: spenta e ancora raggiungibile col Tab');
  json.scatta('click');
  assert.deepEqual(scelte, [], 'una voce spenta non esegue: il clic e soppresso a mano, come chiede MDN');
  /* ⛔ IL MOTIVO C'E', E UNA VOLTA SOLA — il difetto che la foto ha trovato: ripetuto su quattro
     righe di fila era un muro. Sta sotto il titolo del gruppo; la riga tiene la sua descrizione,
     cosi si impara lo stesso che cosa si sta perdendo. */
  const motivi = pezzi.filter((n) => n.className === 'td-esporta-motivo');
  assert.equal(motivi.length, 2, 'due note: l’avvertenza dei documenti e il motivo dei dati, una per gruppo');
  assert.ok(motivi[0].textContent.includes('escono senza'), 'i documenti dichiarano una volta che escono senza verifiche');
  assert.ok(motivi[1].textContent.includes('riepilogo delle verifiche'));
  assert.ok(testoDi([json]).includes('per un altro programma'), 'la riga spenta dice ancora che cosa sarebbe');
  assert.ok(!testoDi([json]).includes('riepilogo delle verifiche'), 'e non ripete il motivo');

  const md = righe.find((n) => n.dataset.uscita === 'md');
  assert.equal(md.getAttribute('aria-disabled'), null);
  // ⛔ Il timbro sulla riga sparisce quando la nota lo dice per tutto il gruppo: uno dei due, mai due.
  assert.ok(!testoDi([md]).includes('esce senza le verifiche'), 'detto una volta per il gruppo, non sei');
  md.scatta('click');
  assert.deepEqual(scelte, ['md']);
});

test('L5-ESPORTA: nel menu «⋯» le tre uscite del browser lasciano il posto a UNA voce sola', () => {
  const lettura = { stato: 'pronto', prosa: 'testo', testo: 'testo', record: RECORD_MINIMO };
  const conSuite = vociMenuRicerca(CONCLUSA, { lettura, onEsportazioni: () => {} });
  assert.deepEqual(chiavi(conSuite), ['copia', 'esporta-suite']);
  assert.equal(conSuite.at(-1).etichetta, 'Esporta…');
  /*
   * ⛔ IL VERSO CONTRARIO, ed e la garanzia che nessun chiamante perda quello che aveva: senza
   *   l’iniezione il menu e ESATTAMENTE quello di ieri, comprese BibTeX e RIS scritte nel browser.
   */
  const senzaSuite = vociMenuRicerca(CONCLUSA, { lettura });
  assert.deepEqual(chiavi(senzaSuite), ['copia', 'esporta', 'bibtex', 'ris']);
  // ⛔ E su una ricerca SENZA rapporto la suite non compare nemmeno con l’iniezione: la rotta non ha niente da dare.
  const respinta = { id: 'r', domanda: 'D', stato: 'senza-rapporto', reportLibraryId: 'lib-scusa' };
  const voci = chiavi(vociMenuRicerca(respinta, { lettura, onEsportazioni: () => {} }));
  assert.ok(!voci.includes('esporta-suite'), 'la rotta non ha niente da dare su una consegna respinta');
  assert.ok(voci.includes('esporta'), 'e resta l’unica via per tirare fuori il testo depositato');
});
