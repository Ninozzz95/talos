import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCHEMI, SCELTA_AUTOMATICA, STATI_ATTIVITA,
  valoriIniziali, validaValori, corpoCreazione, corpoModifica, paroleErroreRete,
  parolaOrigine, parolaStato, accordo, mostraConteggio, fraseConteggio,
  servizioVoci, costruisciModulo, montaTestoVoce, costruisciStatoAttivita, confermaEliminazione,
} from '../../src/components/modulo-voce.js';
import { chiudiModale } from '../../src/components/modale-td.js';

/*
 * 12/09/2026 — IL CRUD DELLA PERSONA su Note, Attività e Memoria.
 *
 * ⛔ Ogni prova si gioca DUE volte: che la cosa giusta succeda, e che quella sbagliata NON succeda.
 *   È la regola che ha scoperto il cancello semantico spento da sempre (27/8) — ogni test provava
 *   solo che una scrittura legittima passasse, e un cancello inerte supera quella prova come uno
 *   vero. Qui: un modulo valido manda il corpo giusto, e uno invalido NON manda niente; una
 *   conferma d'eliminazione cancella, e il suo «Annulla» NON cancella.
 */

/* ------------------------------------------------------------------ un DOM finto, come L7 e G */

function nodoFinto(tag, doc) {
  const nodo = {
    tagName: String(tag).toUpperCase(),
    figli: [],
    genitore: null,
    dataset: {},
    className: '',
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    tabIndex: 0,
    open: false,
    fuoco: 0,
    style: {},
    attributi: new Map(),
    ascoltatori: new Map(),
    ownerDocument: doc,
    append(...nuovi) { for (const n of nuovi) { if (!n) continue; n.genitore = nodo; nodo.figli.push(n); } },
    prepend(...nuovi) { for (const n of [...nuovi].reverse()) { if (!n) continue; n.genitore = nodo; nodo.figli.unshift(n); } },
    remove() { if (nodo.genitore) nodo.genitore.figli = nodo.genitore.figli.filter((f) => f !== nodo); nodo.genitore = null; },
    replaceChildren(...nuovi) { nodo.figli = nuovi.filter(Boolean); for (const n of nodo.figli) n.genitore = nodo; },
    setAttribute(k, v) { nodo.attributi.set(k, String(v)); },
    getAttribute(k) { return nodo.attributi.get(k) ?? null; },
    removeAttribute(k) { nodo.attributi.delete(k); },
    hasAttribute(k) { return nodo.attributi.has(k); },
    addEventListener(tipo, fn) { nodo.ascoltatori.set(tipo, [...(nodo.ascoltatori.get(tipo) || []), fn]); },
    focus() { nodo.fuoco += 1; doc.activeElement = nodo; },
    showModal() { nodo.open = true; },
    close() { nodo.open = false; nodo.scatta('close', {}); },
    scatta(tipo, evento = {}) { for (const fn of [...(nodo.ascoltatori.get(tipo) || [])]) fn({ target: nodo, currentTarget: nodo, preventDefault() {}, stopPropagation() {}, ...evento }); },
    discendenti() { return nodo.figli.flatMap((f) => [f, ...(f.discendenti ? f.discendenti() : [])]); },
    querySelector(selettore) {
      const tag0 = selettore.split(',').map((s) => s.trim().split(/[:[.]/)[0].toUpperCase());
      return nodo.discendenti().find((f) => tag0.includes(f.tagName)) || null;
    },
    querySelectorAll() { return []; },
  };
  return nodo;
}
function documentoFinto() {
  const doc = { activeElement: null };
  doc.createElement = (tag) => nodoFinto(tag, doc);
  doc.createElementNS = (_ns, tag) => nodoFinto(tag, doc);
  doc.createTextNode = (t) => ({ textContent: String(t), figli: [], discendenti: () => [] });
  doc.body = nodoFinto('body', doc);
  return doc;
}
const tutti = (radice) => [radice, ...radice.discendenti()];
const perClasse = (radice, classe) => tutti(radice).filter((n) => String(n.className).split(/\s+/).includes(classe));
const perTag = (radice, tag) => tutti(radice).filter((n) => n.tagName === tag.toUpperCase());
const testoDi = (radice) => tutti(radice).map((n) => n.textContent || '').join(' ');

/* ══════════════════════════════════════════════════════ 1. I VALORI CHE APRONO IL MODULO */

test('MV-INIZIALI: un modulo nuovo parte dai preimpostati, uno di modifica dai valori della voce', () => {
  assert.deepEqual(valoriIniziali(SCHEMI.note), { titolo: '', contenuto: '', formato: SCELTA_AUTOMATICA });
  assert.deepEqual(valoriIniziali(SCHEMI.tasks), { titolo: '', descrizione: '', priorita: 'normal' });
  assert.deepEqual(valoriIniziali(SCHEMI.memory), { titolo: '', contenuto: '', genere: 'preference' });

  assert.deepEqual(
    valoriIniziali(SCHEMI.note, { titolo: 'Cancello', contenuto: '# 4471', formato: 'markdown' }),
    { titolo: 'Cancello', contenuto: '# 4471', formato: 'markdown' },
  );
  // ⛔ AL CONTRARIO: un valore che il vocabolario non conosce NON entra nel modulo — ci arriverebbe
  //    un `<select>` senza nessuna opzione selezionata, e il primo salvataggio manderebbe un 400.
  assert.equal(valoriIniziali(SCHEMI.memory, { genere: 'inventato' }).genere, 'preference');
  assert.equal(valoriIniziali(SCHEMI.tasks, { priorita: 'urgentissima' }).priorita, 'normal');
  // Un campo che sul disco è `null` (la descrizione di un'attività) diventa stringa vuota, non «null».
  assert.equal(valoriIniziali(SCHEMI.tasks, { titolo: 'x', descrizione: null }).descrizione, '');
});

/* ══════════════════════════════════════════════════════ 2. LA VALIDAZIONE, NEI DUE VERSI */

test('MV-VALIDA: i tre schemi accettano ciò che i magazzini accettano, e rifiutano il resto', () => {
  assert.equal(validaValori(SCHEMI.note, { titolo: 'Ok', contenuto: 'testo', formato: 'markdown' }).ok, true);

  const vuoto = validaValori(SCHEMI.note, { titolo: '   ', contenuto: '', formato: SCELTA_AUTOMATICA });
  assert.equal(vuoto.ok, false);
  assert.match(vuoto.errori.titolo, /Serve un titolo/);
  assert.match(vuoto.errori.contenuto, /Serve un testo/);

  // I tetti sono quelli dei magazzini: 120/8.000 nota, 200/2.000 attività, 80/600 ricordo.
  const lungo = (n) => 'a'.repeat(n);
  assert.equal(validaValori(SCHEMI.note, { titolo: lungo(120), contenuto: 'x', formato: SCELTA_AUTOMATICA }).ok, true);
  assert.match(validaValori(SCHEMI.note, { titolo: lungo(121), contenuto: 'x', formato: SCELTA_AUTOMATICA }).errori.titolo, /121/);
  assert.equal(validaValori(SCHEMI.memory, { titolo: lungo(80), contenuto: lungo(600), genere: 'policy_note' }).ok, true);
  assert.equal(validaValori(SCHEMI.memory, { titolo: lungo(81), contenuto: lungo(600), genere: 'policy_note' }).ok, false);
  assert.equal(validaValori(SCHEMI.memory, { titolo: 'x', contenuto: lungo(601), genere: 'policy_note' }).ok, false);
  assert.equal(validaValori(SCHEMI.tasks, { titolo: lungo(200), descrizione: lungo(2_000), priorita: 'high' }).ok, true);
  assert.equal(validaValori(SCHEMI.tasks, { titolo: 'x', descrizione: lungo(2_001), priorita: 'high' }).ok, false);

  // ⛔ La descrizione di un'attività NON è obbligatoria: vuota deve passare.
  assert.equal(validaValori(SCHEMI.tasks, { titolo: 'Chiama', descrizione: '', priorita: 'normal' }).ok, true);
  // ⛔ E una scelta fuori vocabolario si ferma qui, non sul server (che direbbe solo «Query non valida»).
  assert.equal(validaValori(SCHEMI.tasks, { titolo: 'x', descrizione: '', priorita: 'boh' }).ok, false);
});

test('MV-TETTO-GREZZO: il vuoto si giudica sul ritagliato, la lunghezza sull’intero — come i magazzini', () => {
  /* `notes-store.mjs:58` fa `title.trim().length === 0 || title.length > MASSIMO`: due misure
     diverse nella stessa riga. Misurarle in un altro modo qui darebbe un modulo che dice «va bene»
     su un corpo che il server rifiuta. */
  const conSpazi = { titolo: `${'a'.repeat(120)}  `, contenuto: 'x', formato: SCELTA_AUTOMATICA };
  assert.equal(validaValori(SCHEMI.note, conSpazi).ok, false, 'i due spazi in coda contano per il tetto');
  assert.equal(validaValori(SCHEMI.note, { titolo: '  a  ', contenuto: 'x', formato: SCELTA_AUTOMATICA }).ok, true);
});

/* ══════════════════════════════════════════════════════ 3. I CORPI DI POST E PATCH */

test('MV-CREA: «riconoscilo dal testo» NON si manda (in creazione `formato:null` è un 400)', () => {
  assert.deepEqual(
    corpoCreazione(SCHEMI.note, { titolo: 'T', contenuto: 'C', formato: SCELTA_AUTOMATICA }),
    { titolo: 'T', contenuto: 'C' },
  );
  assert.deepEqual(
    corpoCreazione(SCHEMI.note, { titolo: 'T', contenuto: 'C', formato: 'markdown' }),
    { titolo: 'T', contenuto: 'C', formato: 'markdown' },
  );
  // Una descrizione vuota non si manda: il contratto vuole `{titolo, descrizione?, priorita?}`.
  assert.deepEqual(
    corpoCreazione(SCHEMI.tasks, { titolo: 'Chiama', descrizione: '   ', priorita: 'high' }),
    { titolo: 'Chiama', priorita: 'high' },
  );
  assert.deepEqual(
    corpoCreazione(SCHEMI.memory, { titolo: 'T', contenuto: 'C', genere: 'procedure' }),
    { titolo: 'T', contenuto: 'C', genere: 'procedure' },
  );
});

test('MV-PATCH: si manda SOLO ciò che cambia, e «riconoscilo dal testo» diventa `formato:null`', () => {
  const nota = { id: 'n1', titolo: 'Vecchio', contenuto: 'Testo', formato: 'markdown' };
  assert.deepEqual(
    corpoModifica(SCHEMI.note, { titolo: 'Nuovo', contenuto: 'Testo', formato: 'markdown' }, nota),
    { corpo: { titolo: 'Nuovo' }, cambiato: true },
  );
  // ⛔ AL CONTRARIO: niente toccato ⇒ NESSUN corpo. Un `PATCH {}` è un 400, e qui si sa prima.
  assert.deepEqual(
    corpoModifica(SCHEMI.note, { titolo: 'Vecchio', contenuto: 'Testo', formato: 'markdown' }, nota),
    { corpo: {}, cambiato: false },
  );
  // `null` è l'unico modo di disfare una dichiarazione di formato (contratto §4).
  assert.deepEqual(
    corpoModifica(SCHEMI.note, { titolo: 'Vecchio', contenuto: 'Testo', formato: SCELTA_AUTOMATICA }, nota).corpo,
    { formato: null },
  );
  // ⛔ E NON succede sulle altre due: lì `auto` non esiste, la scelta torna al preimpostato.
  assert.deepEqual(
    corpoModifica(SCHEMI.tasks, { titolo: 'x', descrizione: '', priorita: 'low' }, { titolo: 'x', descrizione: '', priorita: 'high' }).corpo,
    { priorita: 'low' },
  );
  // Lo STATO non entra mai in un PATCH: non è un campo dello schema, ha la sua porta.
  assert.equal('stato' in corpoModifica(SCHEMI.tasks, { titolo: 'y', descrizione: '', priorita: 'normal' }, { titolo: 'x', descrizione: '', priorita: 'normal', stato: 'done' }).corpo, false);
});

/* ══════════════════════════════════════════════════════ 4. LE PAROLE */

test('MV-ACCORDO: «il ricordo» non viene «cancellata» — il genere lo decide lo schema, non la frase', () => {
  /* ⛔ TROVATO NELLA FOTO del 12/09 (`memoria-elimina-scuro-1440.png`): la conferma diceva «il
     ricordo … viene CANCELLATA dal disco» e il dettaglio «SCRITTA da te». Un modulo solo per tre
     risorse mette in comune anche le frasi: con un participio fisso una delle tre sbaglia sempre. */
  assert.equal(accordo(SCHEMI.note, 'Salvat'), 'Salvata');
  assert.equal(accordo(SCHEMI.tasks, 'Salvat'), 'Salvata');
  assert.equal(accordo(SCHEMI.memory, 'Salvat'), 'Salvato');
  assert.equal(accordo(SCHEMI.memory, 'cancellat'), 'cancellato');
  assert.equal(parolaOrigine('persona', SCHEMI.memory), 'Scritto da te');
  assert.equal(parolaOrigine('modello', SCHEMI.memory), 'Scritto da TALOS');
  assert.equal(parolaOrigine('persona', SCHEMI.tasks), 'Scritta da te');
});

test('MV-PAROLE: nessun nome tecnico a schermo, e «non lo so ancora» non diventa una bugia', () => {
  assert.equal(parolaOrigine('persona', SCHEMI.note), 'Scritta da te');
  assert.equal(parolaOrigine('modello', SCHEMI.note), 'Scritta da TALOS');
  // ⛔ L'elenco non porta `origine`: `undefined` vuol dire «non l'ho ancora letta», e allora si tace.
  assert.equal(parolaOrigine(undefined), '');
  assert.equal(parolaOrigine(null), '');
  assert.deepEqual(STATI_ATTIVITA.map(parolaStato), ['Da fare', 'In corso', 'Fatta']);
  assert.equal(parolaStato('todo').includes('todo'), false);
  assert.equal(parolaStato('inventato'), 'Stato non registrato');
});

test('MV-CONTEGGIO: il contatore si accende sull’ultimo decimo, e il singolare non è «1 caratteri»', () => {
  assert.equal(mostraConteggio(107, 120), false);
  assert.equal(mostraConteggio(108, 120), true);
  assert.equal(mostraConteggio(131, 120), true);
  assert.equal(fraseConteggio(1, 120), '1 carattere su 120');
  /* ⛔ MISURATO, non supposto: in italiano un numero di QUATTRO cifre non prende il punto
     (ECMA-402, `useGrouping:'auto'` con raggruppamento «min2» per it-IT), e a cinque sì. Scrivere
     «8.000» qui avrebbe fatto passare un test contro una stringa che il prodotto non produce. */
  assert.equal(fraseConteggio(8_000, 8_000), '8000 caratteri su 8000');
  assert.equal(fraseConteggio(12_000, 12_000), '12.000 caratteri su 12.000');
});

test('MV-ERRORI-RETE: il codice diventa una frase, e un 400 non ripete «Query non valida»', () => {
  assert.match(paroleErroreRete('NOTE_NOT_FOUND', SCHEMI.note), /non c’è più/);
  assert.match(paroleErroreRete('NOT_FOUND', SCHEMI.note), /sessione/);
  assert.match(paroleErroreRete('NOTE_INVALID', SCHEMI.note), /campi/);
  assert.match(paroleErroreRete('QUERY_INVALID', SCHEMI.note), /campi/);
  assert.match(paroleErroreRete('PAYLOAD_LIMIT', SCHEMI.note), /troppo lungo/);
  assert.match(paroleErroreRete('BOH', SCHEMI.note, { azione: 'eliminare' }), /eliminare/);
  for (const codice of ['NOTE_NOT_FOUND', 'QUERY_INVALID', 'BOH']) {
    assert.equal(/Query non valida/.test(paroleErroreRete(codice, SCHEMI.note)), false);
  }
});

/* ══════════════════════════════════════════════════════ 5. LA PORTA DI RETE */

function reteFinta() {
  const chiamate = [];
  const rispondi = (dati) => Promise.resolve(dati);
  return {
    chiamate,
    rete: {
      post: (url, corpo) => { chiamate.push(['POST', url, corpo]); return rispondi({ nota: { id: 'n1' }, attivita: { id: 't1' }, memoria: { id: 'm1' } }); },
      patch: (url, corpo) => { chiamate.push(['PATCH', url, corpo]); return rispondi({ nota: { id: 'n1' } }); },
      elimina: (url) => { chiamate.push(['DELETE', url]); return rispondi({ eliminata: true }); },
      leggi: (url) => { chiamate.push(['GET', url]); return rispondi({ nota: { id: 'n1', origine: 'persona' } }); },
    },
  };
}

test('SV-INDIRIZZI: le cinque porte sono quelle del contratto, e nessun adattatore le riscrive', async () => {
  const { chiamate, rete } = reteFinta();
  const s = servizioVoci({ schema: SCHEMI.note, sessionId: 'sess 1', rete });
  await s.crea({ titolo: 'T', contenuto: 'C' });
  await s.leggi('n1');
  await s.modifica('n1', { titolo: 'U' });
  await s.elimina('n1');
  await s.eliminaInBlocco(['n1', 'n2']);
  assert.deepEqual(chiamate.map((c) => `${c[0]} ${c[1]}`), [
    'POST /api/v1/sessions/sess%201/notes',
    'GET /api/v1/sessions/sess%201/notes/n1',
    'PATCH /api/v1/sessions/sess%201/notes/n1',
    'DELETE /api/v1/sessions/sess%201/notes/n1',
    'POST /api/v1/sessions/sess%201/notes/batch',
  ]);
  assert.deepEqual(chiamate.at(-1)[2], { azione: 'elimina', ids: ['n1', 'n2'] });

  const t = servizioVoci({ schema: SCHEMI.tasks, sessionId: 's', rete });
  await t.cambiaStato('t1', 'done');
  assert.deepEqual(chiamate.at(-1), ['POST', '/api/v1/sessions/s/tasks/t1/stato', { stato: 'done' }]);
});

test('SV-NIENTE-PROMESSE: senza sessione o senza rete il servizio NON esiste', () => {
  const { rete } = reteFinta();
  assert.equal(servizioVoci({ schema: SCHEMI.note, sessionId: '', rete }), null);
  assert.equal(servizioVoci({ schema: SCHEMI.note, sessionId: 's', rete: null }), null);
  assert.equal(servizioVoci({ schema: SCHEMI.note, sessionId: 's', rete: { post: () => {} } }), null, 'una rete a metà non basta');
  assert.notEqual(servizioVoci({ schema: SCHEMI.note, sessionId: 's', rete }), null);
  // `leggi` è facoltativa: senza, il dettaglio resta senza origine ma tutto il resto funziona.
  const senzaLettura = servizioVoci({ schema: SCHEMI.note, sessionId: 's', rete: { ...rete, leggi: undefined } });
  assert.equal(senzaLettura.leggi, null);
});

/* ══════════════════════════════════════════════════════ 6. IL MODULO A SCHERMO */

function modulo(schema, stato) {
  const doc = documentoFinto();
  const salvataggi = [];
  const [form] = costruisciModulo(doc, { schema, stato, onSalva: () => salvataggi.push(1) });
  return { doc, form, salvataggi };
}

test('MOD-CAMPI: tre campi con la loro etichetta, e il testo digitato finisce nello stato (senza ridisegno)', () => {
  const stato = { valori: valoriIniziali(SCHEMI.note), errori: {}, erroreRete: null };
  const { form } = modulo(SCHEMI.note, stato);
  assert.deepEqual(perClasse(form, 'td-field-label').map((n) => n.textContent), ['Titolo', 'Contenuto', 'Come si legge']);
  const titolo = perClasse(form, 'td-edit-title')[0];
  titolo.value = 'Codice cancello';
  titolo.scatta('input');
  assert.equal(stato.valori.titolo, 'Codice cancello');
  // ⛔ Il nodo NON è stato ricostruito: se lo fosse, il cursore tornerebbe in fondo a ogni tasto.
  assert.equal(perClasse(form, 'td-edit-title')[0], titolo);
});

test('MOD-ERRORI: l’errore sta SOTTO il campo, è legato in ARIA, e sparisce appena si corregge', () => {
  const stato = { valori: { titolo: '', contenuto: '', formato: SCELTA_AUTOMATICA }, errori: validaValori(SCHEMI.note, { titolo: '', contenuto: '', formato: SCELTA_AUTOMATICA }).errori, erroreRete: null };
  const { form } = modulo(SCHEMI.note, stato);
  const titolo = perClasse(form, 'td-edit-title')[0];
  const messaggio = perClasse(form, 'td-field-errore').find((n) => !n.hidden);
  assert.equal(titolo.getAttribute('aria-invalid'), 'true');
  assert.equal(titolo.getAttribute('aria-errormessage'), messaggio.id);
  assert.equal(String(titolo.getAttribute('aria-describedby')).includes(messaggio.id), true);
  assert.equal(messaggio.getAttribute('role'), 'alert');
  assert.match(messaggio.textContent, /Serve un titolo/);

  titolo.value = 'Adesso ce l’ha';
  titolo.scatta('input');
  assert.equal(titolo.getAttribute('aria-invalid'), null, 'chi corregge non resta accusato');
  assert.equal(messaggio.hidden, true);
  assert.equal(stato.errori.titolo, undefined);
});

test('MOD-NIENTE-ACCUSE-ANTICIPATE: un modulo appena aperto non ha nessun campo invalido', () => {
  /* MDN «aria-invalid»: «Do not set aria-invalid="true" on empty required elements until after the
     user attempts to submit the form». Qui il modulo nasce vuoto e obbligatorio: nessuna accusa. */
  const stato = { valori: valoriIniziali(SCHEMI.memory), errori: {}, erroreRete: null };
  const { form } = modulo(SCHEMI.memory, stato);
  assert.equal(tutti(form).some((n) => n.getAttribute('aria-invalid') === 'true'), false);
  assert.equal(perClasse(form, 'td-field-errore').every((n) => n.hidden), true);
  // ma il campo obbligatorio lo DICE (`aria-required`), che è un'altra cosa
  assert.equal(perClasse(form, 'td-edit-title')[0].getAttribute('aria-required'), 'true');
});

test('MOD-CONTATORE: compare solo vicino al tetto, e si aggiorna mentre si scrive', () => {
  const stato = { valori: { titolo: 'a'.repeat(74), contenuto: 'x', genere: 'preference' }, errori: {}, erroreRete: null };
  const { form } = modulo(SCHEMI.memory, stato);
  const conta = perClasse(form, 'td-field-conta')[0];
  assert.equal(conta.hidden, false, '74 su 80 è oltre il nono decimo (72)');
  const titolo = perClasse(form, 'td-edit-title')[0];
  titolo.value = 'a'.repeat(81);
  titolo.scatta('input');
  assert.equal(conta.textContent, '81 caratteri su 80');
  // ⛔ AL CONTRARIO: un campo lontano dal tetto non mostra niente.
  const corto = { valori: { titolo: 'ab', contenuto: 'x', genere: 'preference' }, errori: {}, erroreRete: null };
  assert.equal(perClasse(modulo(SCHEMI.memory, corto).form, 'td-field-conta')[0].hidden, true);
});

test('MOD-NIENTE-TAGLIO-SILENZIOSO: nessun campo porta `maxlength` — un incollato non si accorcia da solo', () => {
  const stato = { valori: valoriIniziali(SCHEMI.note), errori: {}, erroreRete: null };
  const { form } = modulo(SCHEMI.note, stato);
  assert.equal(tutti(form).some((n) => n.hasAttribute('maxlength')), false);
});

test('MOD-SCELTE: le opzioni sono parole, mai i valori del contratto', () => {
  const stato = { valori: valoriIniziali(SCHEMI.memory), errori: {}, erroreRete: null };
  const { form } = modulo(SCHEMI.memory, stato);
  const opzioni = perTag(form, 'option');
  assert.deepEqual(opzioni.map((o) => o.textContent), ['Preferenza', 'Fatto', 'Procedura', 'Regola']);
  assert.deepEqual(opzioni.map((o) => o.value), ['preference', 'project_fact', 'procedure', 'policy_note']);
  assert.equal(/project_fact|policy_note/.test(testoDi(form)), false, 'nessun nome tecnico a schermo');
});

test('MOD-ERRORE-RETE: il rifiuto del server è un avviso annunciato, non un campo accusato', () => {
  const stato = { valori: valoriIniziali(SCHEMI.note), errori: {}, erroreRete: 'Il server ha rifiutato questi valori.' };
  const { form } = modulo(SCHEMI.note, stato);
  const avviso = perClasse(form, 'td-modulo-errore')[0];
  assert.equal(avviso.getAttribute('role'), 'alert');
  assert.match(avviso.textContent, /rifiutato/);
});

test('MOD-INVIO: premere Invio nel modulo salva una volta, e la pagina non naviga', () => {
  const stato = { valori: valoriIniziali(SCHEMI.note), errori: {}, erroreRete: null };
  const { form, salvataggi } = modulo(SCHEMI.note, stato);
  let impedito = 0;
  form.scatta('submit', { preventDefault() { impedito += 1; } });
  assert.equal(salvataggi.length, 1);
  assert.equal(impedito, 1);
});

/* ══════════════════════════════════════════════════════ 7. IL TESTO RESO */

test('TESTO-MARKDOWN: una nota markdown ha l’interruttore, e la resa passa dal motore INIETTATO', () => {
  const doc = documentoFinto();
  const usato = [];
  const rendi = (t) => { usato.push(t); const n = doc.createElement('div'); n.textContent = 'RESO'; return n; };
  const pezzi = montaTestoVoce(doc, { testo: '# Titolo\n\ntesto', formato: 'markdown', rendiMarkdown: rendi });
  const striscia = pezzi[0];
  assert.equal(striscia.getAttribute('role'), 'tablist');
  assert.deepEqual(perTag(striscia, 'button').map((b) => b.textContent), ['Anteprima', 'Testo']);
  assert.deepEqual(perTag(striscia, 'button').map((b) => b.getAttribute('aria-selected')), ['true', 'false']);
  assert.deepEqual(perTag(striscia, 'button').map((b) => b.tabIndex), [0, -1], 'un solo stop del Tab su tutta la striscia');
  assert.equal(usato.length, 1, 'nessun secondo motore markdown: si usa quello della chat');
  assert.match(testoDi(pezzi[1]), /RESO/);

  /* Si passa a «Testo». ⛔ Il clic si scatena sulla STRISCIA e non sul bottone: l'ascoltatore è
     delegato (uno solo per due schede), ed è la stessa forma della Libreria e della Ricerca. */
  striscia.scatta('click', { target: { closest: () => perTag(striscia, 'button')[1] } });
  assert.match(testoDi(pezzi[1]), /# Titolo/);
  assert.equal(perTag(pezzi[1], 'pre').length, 1);
});

test('TESTO-UN-MODO-NON-E-UN-INTERRUTTORE: testo semplice e formato ancora ignoto non mostrano la striscia', () => {
  const doc = documentoFinto();
  for (const formato of ['testo', undefined, null]) {
    const pezzi = montaTestoVoce(doc, { testo: 'due righe\ne basta', formato });
    assert.equal(pezzi.length, 1, `formato «${String(formato)}»: nessuna striscia`);
    assert.equal(pezzi[0].className, 'td-prose');
    assert.equal(pezzi[0].textContent, 'due righe\ne basta');
  }
});

/* ══════════════════════════════════════════════════════ 8. LE TRE CASELLE DELLO STATO */

test('STATO-TRE: un radiogroup con la casella giusta spuntata, e ripremere quella corrente non fa niente', () => {
  const doc = documentoFinto();
  const scelte = [];
  const gruppo = costruisciStatoAttivita(doc, { stato: 'doing', onScegli: (s) => scelte.push(s) });
  assert.equal(gruppo.getAttribute('role'), 'radiogroup');
  const bottoni = perTag(gruppo, 'button');
  assert.deepEqual(bottoni.map((b) => b.textContent), ['Da fare', 'In corso', 'Fatta']);
  assert.deepEqual(bottoni.map((b) => b.getAttribute('aria-checked')), ['false', 'true', 'false']);
  assert.deepEqual(bottoni.map((b) => b.tabIndex), [-1, 0, -1]);
  bottoni[1].scatta('click');
  assert.deepEqual(scelte, [], 'lo stato che c’è già non si riscrive: sarebbe una richiesta inutile e un toast bugiardo');
  bottoni[2].scatta('click');
  assert.deepEqual(scelte, ['done']);
});

test('STATO-DISABILITATO: mentre la richiesta è in volo le tre caselle non si premono due volte', () => {
  const doc = documentoFinto();
  const gruppo = costruisciStatoAttivita(doc, { stato: 'todo', inCorso: true, onScegli: () => {} });
  assert.equal(perTag(gruppo, 'button').every((b) => b.disabled), true);
});

/* ══════════════════════════════════════════════════════ 9. ELIMINARE — E NON ELIMINARE */

function apriConferma(doc, eliminati) {
  return confermaEliminazione({
    schema: SCHEMI.note,
    voce: { id: 'n1' },
    titolo: 'Codice cancello',
    servizio: { elimina: async (id) => { eliminati.push(id); } },
    document: doc,
  });
}

test('DEL-CONFERMA: la domanda dice CHE COSA succede, e il bottone dice quel che fa', () => {
  const doc = documentoFinto();
  const aperta = apriConferma(doc, []);
  const parole = testoDi(aperta.dialogo);
  /* ⛔ E la stessa domanda su un ricordo prende il maschile: la prova che il participio non è fisso. */
  const maschile = testoDi(confermaEliminazione({ schema: SCHEMI.memory, voce: { id: 'm1' }, titolo: 'Risposte brevi', servizio: { elimina: async () => {} }, document: documentoFinto() }).dialogo);
  assert.match(maschile, /Elimino il ricordo\?/);
  assert.match(maschile, /viene cancellato dal disco/);
  chiudiModale({ immediata: true });
  assert.match(parole, /Elimino la nota\?/);
  assert.match(parole, /«Codice cancello» viene cancellata dal disco/);
  assert.match(parole, /Non c’è un cestino/);
  assert.match(parole, /Elimina la nota/);
  assert.equal(/Sei sicuro|Confermi\?|\bOK\b/.test(parole), false, 'NN/g: mai «Sei sicuro?», mai «OK»');
  chiudiModale({ immediata: true });
});

test('⛔ DEL-ANNULLATA: chi preme «Annulla» NON fa partire nessuna DELETE — la voce resta', async () => {
  const doc = documentoFinto();
  const eliminati = [];
  const aperta = apriConferma(doc, eliminati);
  const annulla = tutti(aperta.dialogo).find((n) => n.textContent === 'Annulla');
  annulla.scatta('click');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(eliminati, [], 'la via d’uscita non cancella niente');
  chiudiModale({ immediata: true });
});

test('DEL-CONFERMATA: chi preme il bottone rosso cancella, una volta sola', async () => {
  const doc = documentoFinto();
  const eliminati = [];
  const aperta = apriConferma(doc, eliminati);
  const conferma = tutti(aperta.dialogo).find((n) => n.textContent === 'Elimina la nota');
  conferma.scatta('click');
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(eliminati, ['n1']);
  chiudiModale({ immediata: true });
});

test('DEL-FUOCO: il primo controllo della modale è la VIA D’USCITA, non il bottone rosso', () => {
  const doc = documentoFinto();
  const aperta = apriConferma(doc, []);
  assert.equal(doc.activeElement?.textContent, 'Annulla', 'un Invio di troppo non deve cancellare');
  chiudiModale({ immediata: true });
  assert.ok(aperta);
});
