import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHttpApp } from '../../../src/http-app.mjs';
import { elencaNote } from '../../../src/notes-store.mjs';
import { elencaAttivita } from '../../../src/tasks-store.mjs';
import { elencaMemorie } from '../../../src/memory-store.mjs';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';
import {
  SCHEMI, SCELTA_AUTOMATICA, servizioVoci,
  valoriIniziali, validaValori, corpoCreazione, corpoModifica, paroleErroreRete,
} from '../../src/components/modulo-voce.js';

/*
 * ⭐⭐⭐ IL BANCO DEL CRUD — 12/09/2026.
 *
 * ⛔ PERCHÉ ESISTE, quando le rotte hanno già le loro dieci prove lato backend: quelle provano che
 *   il SERVER risponde bene a corpi scritti a mano nel test. Qui i corpi li costruisce il codice
 *   VERO del frontend (`corpoCreazione`, `corpoModifica`) e li spedisce la porta vera
 *   (`servizioVoci`). È la prova di PARITÀ fra le due metà: un campo rinominato da una parte sola,
 *   un `formato:'auto'` spedito per sbaglio, una PATCH vuota, un `stato` infilato dove non va —
 *   niente di tutto questo si vedrebbe provando le due metà separatamente.
 *
 * ⛔ SERVER VERO SU PORTA LIBERA, magazzini in una cartella TEMPORANEA. Mai la 4174 (l'istanza
 *   dell'owner) e mai i suoi `.notes-store/` veri: queste prove creano e cancellano davvero, e lo
 *   devono fare su roba propria. Stessa forma di `tests/http-routes-note-attivita-memoria.test.mjs`.
 *
 * ⛔ Ogni giro si chiude anche AL CONTRARIO: dopo un'eliminazione si RILEGGE, e il 404 deve
 *   arrivare. Un test fermo a «la chiamata non ha lanciato» sarebbe passato anche con un server
 *   che non scrive niente.
 */

const SESSIONE = 'sess-crud-frontend';

/**
 * La rete che la app inietta.
 * ⛔ È la stessa forma di `apiScrivi` in `src/legacy/app.js` (12/09): apre la busta `{ok,data}` e
 *   lancia un `Error` con `.code`, perché il `.code` è l'unica parte VERA che esce da un 400 — il
 *   messaggio lo sostituisce `public-problem.mjs`. Se questo test unwrappasse in un altro modo,
 *   proverebbe una rete che il prodotto non ha.
 */
function reteSu(base) {
  async function manda(metodo, pathname, corpo) {
    const risposta = await fetch(`${base}${pathname}`, {
      method: metodo,
      headers: { Accept: 'application/json', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    });
    const busta = await risposta.json();
    if (!risposta.ok || !busta?.ok) {
      const errore = new Error(busta?.error?.message || 'Richiesta locale non riuscita');
      errore.code = busta?.error?.code || 'INTERNAL_ERROR';
      errore.stato = risposta.status;
      throw errore;
    }
    return busta.data;
  }
  return {
    post: (p, c) => manda('POST', p, c),
    patch: (p, c) => manda('PATCH', p, c),
    elimina: (p) => manda('DELETE', p),
    leggi: (p) => manda('GET', p),
    elenca: (p) => manda('GET', p),
  };
}

async function banco(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-crud-fe-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const cartelle = {
    cartellaNote: join(radice, 'note'),
    cartellaAttivita: join(radice, 'attivita'),
    cartellaMemoria: join(radice, 'memoria'),
  };
  /*
   * ⛔ Le tre GET di ELENCO non stanno in `http-app.mjs`: le serve `session-registry.mjs`, che qui
   *   non c'è (vorrebbe l'intero registro delle sessioni). Il finto chiama le STESSE funzioni di
   *   magazzino del registro vero — `elencaNote`/`elencaAttivita`/`elencaMemorie`, le identiche che
   *   il modello usa dai suoi attrezzi — e NON rifà la sua proiezione: quella la guarda la prova
   *   «PROIEZIONE» qui sotto, sul sorgente, dove è scritta una volta sola.
   */
  const app = createHttpApp({
    staticHandler: async () => null,
    listaTaskDisponibili: () => [],
    elencaCartelleProgetto: () => [],
    sessionRegistry: {
      esiste: (id) => id === SESSIONE,
      elencaNote: async (id) => (id === SESSIONE ? { note: await elencaNote({ cartella: cartelle.cartellaNote }), errore: null } : { note: [], errore: 'sessione sconosciuta' }),
      elencaAttivita: async (id) => (id === SESSIONE ? { attivita: await elencaAttivita({ cartella: cartelle.cartellaAttivita }), errore: null } : { attivita: [], errore: 'sessione sconosciuta' }),
      elencaMemorie: async (id) => (id === SESSIONE ? { memorie: await elencaMemorie({ cartella: cartelle.cartellaMemoria }), errore: null } : { memorie: [], errore: 'sessione sconosciuta' }),
    },
    ...cartelle,
  });
  const server = createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, rete: reteSu(base), cartelle };
}

const quantiFile = (cartella) => { try { return readdirSync(cartella).length; } catch { return 0; } };

/* ═══════════════════════════════════════════════════════════════════════ NOTE — il giro intero */

test('BANCO-NOTE: il modulo crea, modifica, rende markdown ed elimina — e il disco lo conferma', async (t) => {
  const { rete, cartelle } = await banco(t);
  const s = servizioVoci({ schema: SCHEMI.note, sessionId: SESSIONE, rete });

  /* ---- 1. CREA: i valori del modulo diventano il corpo, e il corpo diventa una nota ---- */
  const valori = { ...valoriIniziali(SCHEMI.note), titolo: 'Codice cancello', contenuto: '# Il codice\n\n4471' };
  assert.equal(validaValori(SCHEMI.note, valori).ok, true);
  const nata = (await s.crea(corpoCreazione(SCHEMI.note, valori))).nota;
  assert.equal(nata.titolo, 'Codice cancello');
  assert.equal(nata.origine, 'persona', 'la porta della persona scrive chi ha scritto');
  assert.equal(nata.formato, 'markdown', 'il cancelletto la rende markdown: è ciò che accende l’interruttore Anteprima/Testo');
  assert.equal(quantiFile(cartelle.cartellaNote), 1);

  /* ---- 2. APPARE NELL'ELENCO, che è ciò che la sezione ridisegna dopo `onCambiata` ---- */
  const elenco = await rete.elenca(`/api/v1/sessions/${SESSIONE}/notes`);
  assert.deepEqual(elenco.note.map((n) => n.id), [nata.id], 'appena creata, è già nell’elenco che la sezione ridisegna');

  /* ---- 3. LA GET DELLA VOCE porta ciò che l'elenco non ha ---- */
  const letta = (await s.leggi(nata.id)).nota;
  assert.equal(letta.formato, 'markdown');
  assert.equal(letta.origine, 'persona');

  /* ---- 4. MODIFICA: si manda SOLO il campo toccato ---- */
  const modificati = { ...valoriIniziali(SCHEMI.note, letta), titolo: 'Codice del cancello' };
  const { corpo, cambiato } = corpoModifica(SCHEMI.note, modificati, letta);
  assert.deepEqual(corpo, { titolo: 'Codice del cancello' }, 'il contenuto non riparte: non è cambiato');
  assert.equal(cambiato, true);
  const dopo = (await s.modifica(nata.id, corpo)).nota;
  assert.equal(dopo.titolo, 'Codice del cancello');
  assert.equal(dopo.contenuto, letta.contenuto, 'un campo non mandato non si svuota');

  /* ---- 5. L'ANNULLAMENTO DEL TOAST rimette esattamente com'era ---- */
  const indietro = corpoModifica(SCHEMI.note, valoriIniziali(SCHEMI.note, letta), dopo).corpo;
  assert.deepEqual(indietro, { titolo: 'Codice cancello' });
  assert.equal((await s.modifica(nata.id, indietro)).nota.titolo, 'Codice cancello');

  /* ---- 6. «Riconoscilo dal testo» disfa la dichiarazione ---- */
  const dichiarata = (await s.modifica(nata.id, corpoModifica(SCHEMI.note, { ...valoriIniziali(SCHEMI.note, letta), formato: 'testo' }, letta).corpo)).nota;
  assert.equal(dichiarata.formato, 'testo', 'il dichiarato vince sul rilevato anche su un testo pieno di cancelletti');
  const tornata = (await s.modifica(nata.id, corpoModifica(SCHEMI.note, { ...valoriIniziali(SCHEMI.note, dichiarata), formato: SCELTA_AUTOMATICA }, dichiarata).corpo)).nota;
  assert.equal(tornata.formato, 'markdown', '«auto» diventa `formato:null`, e il server torna a rilevarlo');

  /* ---- 7. ELIMINA, e AL CONTRARIO: riletta, non c'è più ---- */
  await s.elimina(nata.id);
  assert.equal(quantiFile(cartelle.cartellaNote), 0, 'il file è sparito dal disco, non solo dall’elenco');
  const caduta = await s.leggi(nata.id).then(() => null, (e) => e);
  assert.equal(caduta.code, SCHEMI.note.codiceAssente);
  assert.match(paroleErroreRete(caduta.code, SCHEMI.note), /non c’è più/);
});

test('⛔ BANCO-NOTE-AL-CONTRARIO: ciò che il modulo rifiuta, il server lo rifiuterebbe — e viceversa', async (t) => {
  const { rete } = await banco(t);
  const s = servizioVoci({ schema: SCHEMI.note, sessionId: SESSIONE, rete });

  /* Un titolo di 121 caratteri: il modulo dice no PRIMA di partire… */
  const troppo = { ...valoriIniziali(SCHEMI.note), titolo: 'a'.repeat(121), contenuto: 'x' };
  assert.equal(validaValori(SCHEMI.note, troppo).ok, false);
  /* …e se partisse lo stesso, il server direbbe no allo stesso modo. È QUESTA la parità: due
     controlli che si accordano, non uno che copre l'altro. */
  const rifiutata = await s.crea(corpoCreazione(SCHEMI.note, troppo)).then(() => null, (e) => e);
  assert.equal(rifiutata.stato, 400);
  assert.equal(rifiutata.code, 'NOTE_INVALID');

  /* ⛔ E il messaggio del server NON è mostrabile: è la ragione per cui il modulo valida da solo. */
  /*
   * ⛔ MISURATO, e SMENTISCE una riga del rapporto di backend (§4, «il message di un 400 è
   *   generico»): per i sei codici nuovi il messaggio pubblico è una frase umana — «Questa nota non
   *   è valida». Resta vero però ciò che conta per il modulo: NON dice QUALE campo né PERCHÉ, e
   *   quindi non basta a chi sta scrivendo. È per questo che la validazione sta davanti.
   */
  assert.equal(rifiutata.message, 'Questa nota non è valida');
  assert.equal(/titolo|contenuto|120|caratteri/i.test(rifiutata.message), false, 'il motivo preciso resta dietro il doctorReference');

  /* Un corpo senza chiavi (la PATCH vuota che `corpoModifica` impedisce) è un 400. */
  const creata = (await s.crea({ titolo: 'Breve', contenuto: 'ok' })).nota;
  const vuota = await s.modifica(creata.id, {}).then(() => null, (e) => e);
  assert.equal(vuota.stato, 400);
  /* …e infatti il frontend non ci arriva mai: `cambiato` è falso e la richiesta non parte. */
  assert.equal(corpoModifica(SCHEMI.note, valoriIniziali(SCHEMI.note, creata), creata).cambiato, false);

  /* In creazione «auto» non può viaggiare: `formato:null` sarebbe un 400. */
  const conNull = await s.crea({ titolo: 'x', contenuto: 'y', formato: null }).then(() => null, (e) => e);
  assert.equal(conNull.stato, 400);
  assert.equal('formato' in corpoCreazione(SCHEMI.note, { ...valoriIniziali(SCHEMI.note), titolo: 'x', contenuto: 'y' }), false);
});

/* ══════════════════════════════════════════════════════════════════ ATTIVITÀ — stato e priorità */

test('BANCO-ATTIVITA: crea, cambia priorità, percorre i tre stati, torna indietro, elimina', async (t) => {
  const { rete, cartelle } = await banco(t);
  const s = servizioVoci({ schema: SCHEMI.tasks, sessionId: SESSIONE, rete });

  const valori = { ...valoriIniziali(SCHEMI.tasks), titolo: 'Chiama idraulico', descrizione: 'rubinetto cucina', priorita: 'high' };
  const nata = (await s.crea(corpoCreazione(SCHEMI.tasks, valori))).attivita;
  assert.equal(nata.stato, 'todo');
  assert.equal(nata.fatta, false);
  assert.equal(nata.priorita, 'high');

  /* La modifica NON tocca lo stato: non è un campo dello schema, ha la sua porta. */
  const abbassata = (await s.modifica(nata.id, corpoModifica(SCHEMI.tasks, { ...valoriIniziali(SCHEMI.tasks, nata), priorita: 'low' }, nata).corpo)).attivita;
  assert.equal(abbassata.priorita, 'low');
  assert.equal(abbassata.stato, 'todo');

  /* Le tre caselle del dettaglio, una per una. */
  assert.equal((await s.cambiaStato(nata.id, 'doing')).attivita.stato, 'doing');
  const fatta = (await s.cambiaStato(nata.id, 'done')).attivita;
  assert.equal(fatta.stato, 'done');
  assert.equal(fatta.fatta, true, 'la casella della scheda si spunta su `fatta`, che il server calcola');
  /* ⛔ L'ANNULLA del toast: si rimette lo stato di prima, ed è davvero quello di prima. */
  assert.equal((await s.cambiaStato(nata.id, 'doing')).attivita.stato, 'doing');

  /* ⛔ AL CONTRARIO: uno stato inventato è un 400, e `PATCH {stato}` pure — la porta è una sola. */
  const inventato = await s.cambiaStato(nata.id, 'quasi').then(() => null, (e) => e);
  assert.equal(inventato.stato, 400);
  const patchStato = await rete.patch(`/api/v1/sessions/${SESSIONE}/tasks/${nata.id}`, { stato: 'done' }).then(() => null, (e) => e);
  assert.equal(patchStato.stato, 400, 'marcare fatta non è modificare: lo dice il server, non solo noi');

  await s.elimina(nata.id);
  assert.equal(quantiFile(cartelle.cartellaAttivita), 0);
  const sparita = await s.cambiaStato(nata.id, 'done').then(() => null, (e) => e);
  assert.equal(sparita.code, SCHEMI.tasks.codiceAssente);
});

/* ════════════════════════════════════════════════════════════════════ MEMORIA — il duplicato */

test('BANCO-MEMORIA: crea, e un titolo già esistente NON crea niente — lo dice, e si apre quella vecchia', async (t) => {
  const { rete, cartelle } = await banco(t);
  const s = servizioVoci({ schema: SCHEMI.memory, sessionId: SESSIONE, rete });

  const valori = { ...valoriIniziali(SCHEMI.memory), titolo: 'Risposte brevi', contenuto: 'Preferisco risposte brevi', genere: 'preference' };
  const primo = await s.crea(corpoCreazione(SCHEMI.memory, valori));
  assert.equal(primo.duplicato, false);
  assert.equal(primo.memoria.origine, 'persona');

  /* Stesso titolo con altre maiuscole e spazi: il server risponde 200 con la voce VECCHIA. */
  const secondo = await s.crea(corpoCreazione(SCHEMI.memory, { ...valori, titolo: '  risposte BREVI ', contenuto: 'Testo diverso' }));
  assert.equal(secondo.duplicato, true, 'è il campo su cui il pannello dice «esiste già, l’ho aperta»');
  assert.equal(secondo.memoria.id, primo.memoria.id);
  assert.equal(secondo.memoria.contenuto, 'Preferisco risposte brevi', 'il testo nuovo NON sovrascrive il vecchio');
  assert.equal(quantiFile(cartelle.cartellaMemoria), 1, 'sul disco c’è UNA voce, non due');

  /* ⛔ AL CONTRARIO: un titolo davvero diverso crea davvero, e `duplicato` è falso. */
  const terzo = await s.crea(corpoCreazione(SCHEMI.memory, { ...valori, titolo: 'Risposte lunghe' }));
  assert.equal(terzo.duplicato, false);
  assert.equal(quantiFile(cartelle.cartellaMemoria), 2);

  /* Modifica e eliminazione, come per le altre due. */
  const cambiata = (await s.modifica(primo.memoria.id, corpoModifica(SCHEMI.memory, { ...valoriIniziali(SCHEMI.memory, primo.memoria), genere: 'policy_note' }, primo.memoria).corpo)).memoria;
  assert.equal(cambiata.genere, 'policy_note');
  await s.elimina(primo.memoria.id);
  assert.equal(quantiFile(cartelle.cartellaMemoria), 1);

  /* Note e attività NON hanno `duplicato`: due note con lo stesso titolo sono due note. */
  const note = servizioVoci({ schema: SCHEMI.note, sessionId: SESSIONE, rete });
  const a = await note.crea({ titolo: 'Stesso titolo', contenuto: 'uno' });
  const b = await note.crea({ titolo: 'Stesso titolo', contenuto: 'due' });
  assert.equal('duplicato' in a, false);
  assert.notEqual(a.nota.id, b.nota.id);
});

/* ═════════════════════════════════════════════════════════════════ LA SESSIONE CHE NON C'È */

test('BANCO-SESSIONE: senza una sessione viva nessuna scrittura arriva al disco, e la frase lo dice', async (t) => {
  const { rete, cartelle } = await banco(t);
  const fantasma = servizioVoci({ schema: SCHEMI.note, sessionId: 'mai-esistita', rete });
  const caduta = await fantasma.crea({ titolo: 'x', contenuto: 'y' }).then(() => null, (e) => e);
  assert.equal(caduta.stato, 404);
  assert.equal(caduta.code, 'NOT_FOUND');
  assert.match(paroleErroreRete(caduta.code, SCHEMI.note), /sessione/);
  assert.equal(quantiFile(cartelle.cartellaNote), 0);
});

/* ═════════════════════════════════════════════ LA PROIEZIONE DELL'ELENCO, letta alla fonte */

test('BANCO-PROIEZIONE: l’elenco NON porta formato, origine e data di nascita — per questo il dettaglio li chiede', () => {
  /*
   * ⛔ Questa prova guarda il SORGENTE e non una risposta HTTP, perché è l'unico posto in cui il
   *   fatto è scritto: `session-registry.mjs` proietta tre campi scelti a mano. Su quel fatto
   *   poggia una decisione di disegno — il dettaglio fa una `GET` sua per sapere il formato di una
   *   nota e chi l'ha scritta. Il giorno in cui qualcuno allarga la proiezione, questa riga diventa
   *   rossa e quella `GET` si può togliere: è il promemoria che sta DOVE si guarda per ultimo.
   */
  const sorgente = readFileSync(fileURLToPath(new URL('../../../src/session-registry.mjs', import.meta.url)), 'utf8');
  const righe = {
    note: /note:\s*note\.map\(\(n\) => \(\{([^}]*)\}\)\)/.exec(sorgente),
    attivita: /attivita:\s*attivita\.map\(\(a\) => \(\{([^}]*)\}\)\)/.exec(sorgente),
    memorie: /memorie:\s*memorie\.map\(\(m\) => \(\{([^}]*)\}\)\)/.exec(sorgente),
  };
  for (const [quale, trovata] of Object.entries(righe)) {
    assert.ok(trovata, `la proiezione di ${quale} non si trova più: il registro è cambiato, rileggi questa prova`);
    const campi = trovata[1].split(',').map((p) => p.split(':')[0].trim()).filter(Boolean);
    assert.equal(campi.includes('formato'), false, `${quale}: se l'elenco portasse il formato, la GET del dettaglio sarebbe di troppo`);
    assert.equal(campi.includes('origine'), false, `${quale}: se l'elenco portasse l'origine, il badge non avrebbe bisogno della GET`);
    assert.equal(campi.includes('creataAlle'), false);
    assert.equal(campi.includes('titolo'), true, 'il titolo c’è: è quello che la scheda scrive in grande');
  }
});
