import assert from 'node:assert/strict';
import test from 'node:test';
import { avviaSessione } from '../src/agent-service.mjs';

/* ⛔ BUG-7 (04/10/2026, owner): gli avvisi del fornitore si dicono UNA volta per sessione.
   Prima ogni avviso diventava una bolla assistente NUOVA a ogni giro — la frase «Z.AI:
   livello di ragionamento richiesto non previsto dal profilo P-D…» si ristampava a ogni
   richiesta (transcript sessione 3eb5e436). Hermes memoizza i suoi avvisi ausiliari per
   (route, model) con lo stesso scopo (agent/auxiliary_reasoning_floor.py:24-26). */

function talosLavoraFinto({ cattura = () => {} }) {
  return async (input) => {
    cattura(input);
    return { comeFinita: 'concluso', detto: 'fatto' };
  };
}

test('BUG7-AVVISO-01 — lo stesso avviso del fornitore diventa UNA bolla sola per sessione', async () => {
  const eventi = [];
  let observed;
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: talosLavoraFinto({ cattura: (input) => { observed = input; } }),
  });
  const frase = 'Z.AI: livello di ragionamento richiesto non previsto dal profilo P-D per questo modello; non inviato.';
  await observed.onAvviso(frase);
  await observed.onAvviso(frase);
  await observed.onAvviso(frase);
  assert.deepEqual(
    eventi.filter(e => e.type === 'TextMessageContent').map(e => e.delta),
    [frase],
    'tre avvisi identici = una bolla sola',
  );
});

test('BUG7-AVVISO-02 — un avviso DIVERSO passa ancora, e la sequenza resta ordinata', async () => {
  const eventi = [];
  let observed;
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: talosLavoraFinto({ cattura: (input) => { observed = input; } }),
  });
  const prima = 'Z.AI · GLM-5.3-Flash: il livello «xhigh» non è documentato per questo modello; inviato «max», il più vicino.';
  const seconda = 'Z.AI: livello di ragionamento non inviato perché il ragionamento è disattivato.';
  await observed.onAvviso(prima);
  await observed.onAvviso(prima);
  await observed.onAvviso(seconda);
  await observed.onAvviso(prima);
  assert.deepEqual(
    eventi.filter(e => e.type === 'TextMessageContent').map(e => e.delta),
    [prima, seconda],
    'ogni testo distinto una volta sola, al primo arrivo',
  );
});

/* ⛔⛔ BUG-7-cura2 (04/10/2026): il Set vive su `consensiSessione` (per SESSIONE — session-registry.mjs:2652/5950),
   NON nella closure di `avviaSessione`, che `avviaIlGiro` (session-registry.mjs:6085-6094) chiama PER GIRO.
   Prova del difetto vivo: transcript a0cc8ee0, 337 occorrenze della frase in una sessione sola. */

test('BUG7-AVVISO-03 — due GIRI della stessa sessione (stesso consensiSessione): la frase NON torna', async () => {
  const consensiSessione = {}; /* una volta per sessione: è ciò che session-registry.mjs:5950 crea */
  const frase = 'Z.AI: livello di ragionamento richiesto non previsto dal profilo P-D per questo modello; non inviato.';
  let observed;
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', consensiSessione,
    onEvento: () => {},
    talosLavoraFn: talosLavoraFinto({ cattura: (input) => { observed = input; } }) });
  await observed.onAvviso(frase);
  await observed.onAvviso(frase);
  const eventiGiro2 = [];
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', consensiSessione,
    onEvento: (e) => eventiGiro2.push(e),
    talosLavoraFn: talosLavoraFinto({ cattura: (input) => { observed = input; } }) });
  await observed.onAvviso(frase);
  assert.deepEqual(
    eventiGiro2.filter(e => e.type === 'TextMessageContent').map(e => e.delta),
    [],
    'giro 2 della STESSA sessione: la frase già detta non torna (era il difetto vivo, 337 volte)',
  );
});

test('BUG7-AVVISO-04 — senza consensiSessione (TALOS-BANCO, CLI, prove): comportamento di prima invariato', async () => {
  const frase = 'Z.AI: livello di ragionamento richiesto non previsto dal profilo P-D per questo modello; non inviato.';
  let observed;
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: () => {},
    talosLavoraFn: talosLavoraFinto({ cattura: (input) => { observed = input; } }) });
  await observed.onAvviso(frase);
  const eventiB = [];
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => eventiB.push(e),
    talosLavoraFn: talosLavoraFinto({ cattura: (input) => { observed = input; } }) });
  await observed.onAvviso(frase);
  assert.deepEqual(
    eventiB.filter(e => e.type === 'TextMessageContent').map(e => e.delta),
    [frase],
    'chi non ha canale di sessione mantiene la dedup per-chiamata: nessuna novità per TALOS-BANCO e CLI',
  );
});

/* ⛔ BUG-7-cura2b: la dedup per SESSIONE sarebbe troppo larga per gli avvisi che DEVONO ripetersi —
   «chiave rifiutata» (runtime-owner-adapter.mjs:1155) è operativo, due chiavi diverse rifiutate sono
   due notizie. Il chiamante lo dichiara: `onAvviso(testo, { ripetibile: true })`. */

/* ⛔ BUG-18 (05/10/2026, owner): `{ nota: true }` = telemetria di normalizzazione del fornitore
   (livelli adattati, campi non inviati): journal CUSTOM `avviso-fornitore`, MAI bolla in chat.
   La dedup BUG-7 resta per gli avvisi residui (es. temperatura gestita dal modello). */

test('BUG18-NOTA-01 — una nota non fa NESSUNA bolla in chat e arriva nel journal come CUSTOM', async () => {
  const eventi = [];
  let observed;
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k',
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: talosLavoraFinto({ cattura: (input) => { observed = input; } }),
  });
  /* Frase di clamp VERO (medium→low): dopo l'alias silenzioso (gen. 2) è questa la nota che
     può davvero occorrere più volte in una sessione — il meccanismo testato non cambia. */
  const frase = 'Z.AI · GLM-5.3-Flash: il livello «medium» non è documentato per questo modello; inviato «low», il più vicino.';
  await observed.onAvviso(frase, { nota: true });
  await observed.onAvviso(frase, { nota: true });
  assert.deepEqual(
    eventi.filter(e => e.type === 'TextMessageContent'),
    [],
    'la nota non produce NESSUNA bolla in chat (owner: «non voglio più vedere queste frasi»)',
  );
  const customs = eventi.filter(e => e.type === 'CUSTOM' && e.name === 'avviso-fornitore');
  assert.equal(customs.length, 2, 'ogni nota arriva nel journal: onesto e rileggibile (telemetria, non narrazione)');
  assert.equal(customs[0].value.messaggio, frase);
});


test('BUG7-AVVISO-05 — un avviso RIPETIBILE passa ogni volta, quello normale resta una bolla sola', async () => {
  const consensiSessione = {};
  const chiave = 'Una chiave di OpenRouter è stata rifiutata: controlla Fornitori e accessi.';
  const livello = 'Z.AI: livello di ragionamento richiesto non previsto dal profilo P-D per questo modello; non inviato.';
  let observed;
  const eventi = [];
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'prova' }, modello: 'm', chiave: 'k', consensiSessione,
    onEvento: (e) => eventi.push(e),
    talosLavoraFn: talosLavoraFinto({ cattura: (input) => { observed = input; } }) });
  await observed.onAvviso(chiave, { ripetibile: true });
  await observed.onAvviso(chiave, { ripetibile: true });
  await observed.onAvviso(livello);
  await observed.onAvviso(livello);
  assert.deepEqual(
    eventi.filter(e => e.type === 'TextMessageContent').map(e => e.delta),
    [chiave, chiave, livello],
    'la chiave rifiutata arriva DUE volte (due chiavi, due notizie), il livello una sola',
  );
});
