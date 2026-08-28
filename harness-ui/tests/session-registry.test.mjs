import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { CustomTaskError } from '../src/custom-task.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { WorkspaceTreeError } from '../src/workspace-tree.mjs';
import { WorkspaceFileError } from '../src/workspace-files.mjs';

// Ne' avviaSessione ne' talosLavora girano MAI qui, veri o finti a metà: si
// inietta avviaSessioneFn/preparaEsecuzioneFn interamente controllati dal
// test - questo file prova SOLO il registro (buffer, iscrizione tardiva,
// stop), non il ciclo dell'agente (gia' provato altrove).
//
// ⛔⛔⛔ 28/8 — STESSO principio per guardaWorkspaceFn (workspace-watcher.mjs,
// chokidar VERO): senza questo wrapper, OGNI test di questo file avrebbe
// avviato un watcher reale (mai chiuso, i test non lo fanno) — trovato
// perché la suite si è bloccata per davvero lanciandola, non per lettura
// del codice. Un solo punto di default per tutti i 54 call site invece di
// toccarli uno per uno: chi ha bisogno del watcher VERO lo inietta
// esplicitamente (nessun test qui ne ha bisogno, per ora).
function createSessionRegistry(opzioni) {
  return createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
}

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}

/** Una sessione "sospesa a metà": emette RunStarted subito, poi aspetta che il test la faccia concludere quando vuole. */
function sessioneControllabile() {
  let risolviAttesa;
  const attesa = new Promise((risolvi) => { risolviAttesa = risolvi; });
  let onEventoCatturato = null;
  let inputCatturato = null;
  let chiamate = 0;
  return {
    avviaSessioneFn: async (input) => {
      chiamate += 1;
      inputCatturato = input;
      onEventoCatturato = input.onEvento;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      return attesa;
    },
    // `risultato` di default {ok:true}: basta per i test che non guardano
    // messaggiFinali. I test del fork passano un `esito` vero.
    concludi(eventoFinale, risultato = { ok: true }) {
      onEventoCatturato(eventoFinale);
      risolviAttesa(risultato);
    },
    get segnaleStop() { return inputCatturato?.segnaleStop; },
    get chiamate() { return chiamate; },
    get ultimoInput() { return inputCatturato; },
  };
}

test('avvia(): RunStarted è già nel buffer al RITORNO, non dopo — provato con un iscritto immediato', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));

  assert.equal(ricevuti.length, 1);
  assert.equal(ricevuti[0].type, 'RunStarted');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia: chiude la promise pendente
  await Promise.resolve();
});

/*
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — 'mobile'
 * entra nella voce all'avvio e viaggia fino ad avviaSessioneFn/talosLavora
 * (e più sotto, a eseguiComandoDirettoFn per shell()). Zero comportamento
 * nuovo per una sessione desktop: 'mobile' assente o esplicito false è lo
 * stesso identico input di sempre.
 */
test('avvia(taskId, {mobile:true}) passa mobile:true ad avviaSessioneFn', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero', { mobile: true });

  assert.equal(finta.ultimoInput.mobile, true);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔ AL CONTRARIO: avvia(taskId) senza opzioni resta mobile:false, il comportamento di sempre', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero');

  assert.equal(finta.ultimoInput.mobile, false);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐ un iscritto DURANTE la corsa riceve prima la storia, poi i nuovi eventi dal vivo', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e.type));
  assert.deepEqual(ricevuti, ['RunStarted']);

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await Promise.resolve();

  assert.deepEqual(ricevuti, ['RunStarted', 'RunFinished']);
});

test('⭐⭐ un iscritto TARDIVO (dopo la conclusione) riceve TUTTA la storia comunque, mai un buco', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await Promise.resolve();

  const ricevuti = [];
  const disiscrivi = registro.iscriviti(sessionId, (e) => ricevuti.push(e.type));
  assert.deepEqual(ricevuti, ['RunStarted', 'RunFinished']);
  assert.doesNotThrow(() => disiscrivi(), 'disiscriversi da una sessione conclusa non deve mai lanciare');
});

test('⛔ disiscriversi ferma DAVVERO la consegna di nuovi eventi', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  const ricevuti = [];
  const disiscrivi = registro.iscriviti(sessionId, (e) => ricevuti.push(e.type));
  disiscrivi();

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await Promise.resolve();

  assert.deepEqual(ricevuti, ['RunStarted'], 'dopo la disiscrizione non deve arrivare nient\'altro');
});

test('⭐ ferma() aborta il segnaleStop passato ad avviaSessione', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  assert.equal(finta.segnaleStop.aborted, false);
  const fermata = registro.ferma(sessionId);
  assert.equal(fermata, true);
  assert.equal(finta.segnaleStop.aborted, true);

  finta.concludi({ type: 'RunError', message: 'fermato', code: 'fermato' });
  await Promise.resolve();
});

test('⛔ ferma() su un id inesistente torna false, non lancia', () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal(registro.ferma('non-esiste'), false);
});

test('esiste()', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');
  assert.equal(registro.esiste(sessionId), true);
  assert.equal(registro.esiste('mai-esistito'), false);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔⛔ ALLOWLIST: un taskId non ammesso non crea nessuna sessione, e avviaSessione non viene MAI chiamato', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const risultato = registro.avvia('task-non-ammesso');

  assert.equal(risultato.code, 'TASK_NOT_ALLOWED');
  assert.equal(finta.chiamate, 0, 'un task fuori allowlist non deve MAI raggiungere avviaSessione');
});

test('⛔⛔ chiave API assente: stesso trattamento, zero chiamate ad avviaSessione', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm' }); // niente chiave

  const risultato = registro.avvia('task-vero');

  assert.equal(risultato.code, 'CONFIG_INVALID');
  assert.equal(finta.chiamate, 0);
});

// ⭐⭐⭐ 27/8 — avviaLibero(): stesso schema di avvia(), su una cartella
// dell'allowlist invece di un taskId. preparaEsecuzioneLiberaFn finta,
// stesso principio di preparaEsecuzioneFinta sopra.
function preparaEsecuzioneLiberaFinta(cartelleProgetto, { cartellaId, consegna }) {
  const voce = cartelleProgetto.find((c) => c.id === cartellaId);
  if (!voce) throw new CustomTaskError(`Cartella non ammessa: ${cartellaId}`);
  return { cartella: voce.percorso, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } };
}

test('⭐ avviaLibero() su una cartellaId ammessa chiama avviaSessione con la cartella VERA, e passa attraverso il modello scelto', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneLiberaFn: preparaEsecuzioneLiberaFinta,
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto-vero', nome: 'progetto-vero' }],
    modello: 'default/modello', chiave: 'k',
  });

  const risultato = registro.avviaLibero({ cartellaId: '0', consegna: 'fai qualcosa', modello: 'deepseek/deepseek-chat' });

  assert.ok(risultato.sessionId);
  assert.equal(finta.chiamate, 1);
  assert.equal(finta.ultimoInput.cartella, '/tmp/progetto-vero');
  assert.equal(finta.ultimoInput.modello, 'deepseek/deepseek-chat', 'il modello scelto vince sul default del server');
});

test('⛔⛔ ALLOWLIST: avviaLibero() su una cartellaId non ammessa non chiama MAI avviaSessione', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneLiberaFn: preparaEsecuzioneLiberaFinta,
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto-vero', nome: 'progetto-vero' }],
    modello: 'm', chiave: 'k',
  });

  const risultato = registro.avviaLibero({ cartellaId: 'non-esiste', consegna: 'fai qualcosa' });

  assert.equal(risultato.code, 'PROJECT_NOT_ALLOWED');
  assert.equal(finta.chiamate, 0);
});

test('⭐⭐ e AL CONTRARIO: senza modello esplicito, avviaLibero() eredita il default del server', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneLiberaFn: preparaEsecuzioneLiberaFinta,
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto-vero', nome: 'progetto-vero' }],
    modello: 'default/modello', chiave: 'k',
  });

  registro.avviaLibero({ cartellaId: '0', consegna: 'fai qualcosa' });

  assert.equal(finta.ultimoInput.modello, 'default/modello');
});

/*
 * ⛔⛔⛔ Riconciliazione Fase 1 (branch merge, 27/8) — trovato dal VIVO sul
 * Pad, non a unit test: un "compito libero" avviato dal tunnel mobile
 * eseguiva `!comando` sulla PC (`sandbox: none`) invece che sul telefono,
 * perché `avviaLibero()` non passava mai `mobile` ad `avviaESegui()` — la
 * funzione predata la riconciliazione, quando "libero" era raggiungibile
 * solo da desktop. Ora lo è anche dal mobile (stesso app.js, tre branch
 * divergenti dello stesso file, non tre file), quindi lo stesso segnale di
 * `avvia()` deve valere anche qui. Manca un test per il verso positivo
 * PRIMA di questo giro — è la ragione per cui il buco è passato inosservato
 * fino alla prova dal vivo, non un caso.
 */
test('⭐⭐⭐ avviaLibero({mobile:true}) porta mobile fino alla voce, come avvia() — il buco trovato dal vivo sul Pad', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneLiberaFn: preparaEsecuzioneLiberaFinta,
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto-vero', nome: 'progetto-vero' }],
    modello: 'default/modello', chiave: 'k',
  });

  registro.avviaLibero({ cartellaId: '0', consegna: 'fai qualcosa', mobile: true });

  assert.equal(finta.ultimoInput.mobile, true);
});

test('⛔ AL CONTRARIO: avviaLibero() senza mobile esplicito resta false, comportamento di sempre', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneLiberaFn: preparaEsecuzioneLiberaFinta,
    cartelleProgetto: [{ id: '0', percorso: '/tmp/progetto-vero', nome: 'progetto-vero' }],
    modello: 'default/modello', chiave: 'k',
  });

  registro.avviaLibero({ cartellaId: '0', consegna: 'fai qualcosa' });

  assert.equal(finta.ultimoInput.mobile, false);
});

test('⭐ elenca() torna vuoto finché nessuna sessione è mai partita', () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.deepEqual(registro.elenca(), []);
});

test('⭐⭐ elenca() torna un riepilogo per sessione, PIÙ RECENTE PRIMA, mai gli eventi interi', async () => {
  const orari = ['2026-08-24T09:00:00.000Z', '2026-08-24T11:00:00.000Z'];
  let chiamataNumero = 0;
  const primaSessione = sessioneControllabile();
  const secondaSessione = sessioneControllabile();
  const avviaSessioneFnCombinato = (input) => {
    chiamataNumero += 1;
    return chiamataNumero === 1 ? primaSessione.avviaSessioneFn(input) : secondaSessione.avviaSessioneFn(input);
  };
  let indiceOrario = 0;
  const registro = createSessionRegistry({
    avviaSessioneFn: avviaSessioneFnCombinato, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: 'm', chiave: 'k', clock: () => new Date(orari[indiceOrario]),
  });

  indiceOrario = 0;
  const { sessionId: primoId } = registro.avvia('task-vero');
  primaSessione.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));

  indiceOrario = 1;
  const { sessionId: secondoId } = registro.avvia('task-vero');
  // seconda sessione mai conclusa in questo test: elenca() la mostra lo stesso, conclusa:false.

  const elenco = registro.elenca();
  assert.equal(elenco.length, 2);
  assert.deepEqual(elenco.map((s) => s.sessionId), [secondoId, primoId], 'più recente (11:00) prima di quella più vecchia (09:00)');
  assert.equal(elenco[0].conclusa, false);
  assert.equal(elenco[1].conclusa, true);
  for (const voce of elenco) assert.ok(!('eventi' in voce), 'elenca() è un riepilogo leggero, mai gli eventi interi');

  secondaSessione.concludi({ type: 'RunFinished', threadId: 't2', runId: 'r2' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

test('⭐⭐⭐ rinomina() persiste il nome — elenca() ed esporta() lo mostrano dopo, mai sovrascritto', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  assert.equal(registro.elenca()[0].nome, null, 'prima di rinominare, nessun nome');
  const risultato = registro.rinomina(sessionId, '  Il mio nome scelto  ');
  assert.deepEqual(risultato, { ok: true });

  assert.equal(registro.elenca()[0].nome, 'Il mio nome scelto', 'rifilato, non con gli spazi intorno');
  assert.equal(registro.esporta(sessionId).nome, 'Il mio nome scelto');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia
});

test('⛔ rinomina() su un id inesistente: NOT_FOUND', () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal(registro.rinomina('mai-esistito', 'x').code, 'NOT_FOUND');
});

test('⛔ rinomina() rifiuta nomi vuoti o troppo lunghi — QUERY_INVALID, mai un nome vuoto salvato', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  for (const nomeCattivo of ['', '   ', 'x'.repeat(81), null, undefined, 42]) {
    const risultato = registro.rinomina(sessionId, nomeCattivo);
    assert.equal(risultato.code, 'QUERY_INVALID', JSON.stringify(nomeCattivo));
  }
  assert.equal(registro.elenca()[0].nome, null, 'nessuno dei tentativi cattivi deve essere rimasto salvato');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia
});

test('⭐ esporta() torna null per un id inesistente', () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal(registro.esporta('mai-esistito'), null);
});

test('⭐⭐ esporta() su una sessione ancora in corso mostra tutto ciò che è successo FIN QUI, conclusa:false', async () => {
  const finta = sessioneControllabile();
  const orologio = () => new Date('2026-08-24T18:00:00.000Z');
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta,
    modello: 'm', chiave: 'k', clock: orologio,
  });
  const { sessionId } = registro.avvia('task-vero');

  const esportato = registro.esporta(sessionId);
  assert.equal(esportato.sessionId, sessionId);
  assert.equal(esportato.taskId, 'task-vero');
  assert.equal(esportato.avviataAlle, '2026-08-24T18:00:00.000Z');
  assert.equal(esportato.conclusa, false);
  assert.deepEqual(esportato.eventi.map((e) => e.type), ['RunStarted']);

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await Promise.resolve();
});

test('⭐ esporta() dopo la conclusione porta conclusa:true e l\'evento finale', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await Promise.resolve();

  const esportato = registro.esporta(sessionId);
  assert.equal(esportato.conclusa, true);
  assert.deepEqual(esportato.eventi.map((e) => e.type), ['RunStarted', 'RunFinished']);
});

test('⛔ forka() su un id origine inesistente: NOT_FOUND, nessuna sessione creata', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const risultato = registro.forka('mai-esistito');
  assert.equal(risultato.code, 'NOT_FOUND');
  assert.equal(finta.chiamate, 0);
});

test('⛔ forka() su una sessione origine ANCORA IN CORSO: SESSION_NOT_READY, dichiarato — non un fork silenziosamente vuoto', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = registro.forka(sessionId);
  assert.equal(risultato.code, 'SESSION_NOT_READY');
  assert.match(risultato.erroreAvvio, /ancora in corso/);
  assert.equal(finta.chiamate, 1, 'solo la sessione origine, il fork non deve aver chiamato avviaSessione una seconda volta');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

test('⭐⭐⭐ forka() su una sessione CONCLUSA: nuova sessione, stessa cartella/task/comandoProva, messaggiIniziali = messaggiFinali dell\'origine', async () => {
  const storiaFinale = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];

  // Un SOLO registro: la prima chiamata ad avviaSessioneFn è l'origine, la
  // seconda (quella che forka() farà scattare) è il fork — la stessa
  // istanza di session-registry deve vedere entrambe nella sua mappa.
  const origine = sessioneControllabile();
  const delFork = sessioneControllabile();
  let chiamataNumero = 0;
  const avviaSessioneFnCombinato = (input) => {
    chiamataNumero += 1;
    return chiamataNumero === 1 ? origine.avviaSessioneFn(input) : delFork.avviaSessioneFn(input);
  };
  const registro = createSessionRegistry({ avviaSessioneFn: avviaSessioneFnCombinato, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const { sessionId: idOrigine } = registro.avvia('task-vero');
  origine.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: storiaFinale } });
  await new Promise((r) => setImmediate(r));

  const { sessionId: idFork } = registro.forka(idOrigine);
  assert.notEqual(idFork, idOrigine);

  const inputDelFork = delFork.ultimoInput;
  assert.equal(inputDelFork.cartella, '/tmp/x');
  assert.deepEqual(inputDelFork.task, { id: 'task-vero', consegna: 'c' });
  assert.equal(inputDelFork.comandoProva, 'npm test');
  assert.deepEqual(inputDelFork.messaggiIniziali, storiaFinale);

  delFork.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));

  assert.equal(registro.esporta(idFork).forkDa, idOrigine);
  assert.equal(registro.esporta(idOrigine).forkDa, null, 'l\'origine non è un fork di nessuno');
});

/**
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — un fork
 * di una sessione mobile resta mobile: la voce del fork è NUOVA (a
 * differenza di resume, che riusa la stessa), quindi senza questo la
 * "mobilità" andrebbe persa in silenzio ad ogni fork.
 */
test('⭐⭐⭐ forka() eredita mobile:true dalla sessione origine', async () => {
  const origine = sessioneControllabile();
  const delFork = sessioneControllabile();
  let chiamataNumero = 0;
  const avviaSessioneFnCombinato = (input) => {
    chiamataNumero += 1;
    return chiamataNumero === 1 ? origine.avviaSessioneFn(input) : delFork.avviaSessioneFn(input);
  };
  const registro = createSessionRegistry({ avviaSessioneFn: avviaSessioneFnCombinato, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const { sessionId: idOrigine } = registro.avvia('task-vero', { mobile: true });
  origine.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: [{ role: 'user', content: 'c' }] } });
  await new Promise((r) => setImmediate(r));

  registro.forka(idOrigine);

  assert.equal(delFork.ultimoInput.mobile, true);
  delFork.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⛔ resume() su un id inesistente: NOT_FOUND', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal(registro.resume('mai-esistito').code, 'NOT_FOUND');
});

test('⛔ resume() su una sessione ANCORA IN CORSO: SESSION_NOT_READY', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  assert.equal(registro.resume(sessionId).code, 'SESSION_NOT_READY');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⭐⭐⭐ resume() su una sessione CONCLUSA: STESSO sessionId, un giro in più appeso allo STESSO buffer, mai un gap', async () => {
  const storiaDelPrimoGiro = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'primo giro fatto' }];

  // Un SOLO registro: la prima chiamata ad avviaSessioneFn è il giro
  // originale, la seconda (che resume() fa scattare) è il giro ripreso.
  const primoGiro = sessioneControllabile();
  const secondoGiro = sessioneControllabile();
  let chiamataNumero = 0;
  const avviaSessioneFnCombinato = (input) => {
    chiamataNumero += 1;
    return chiamataNumero === 1 ? primoGiro.avviaSessioneFn(input) : secondoGiro.avviaSessioneFn(input);
  };
  const registro = createSessionRegistry({ avviaSessioneFn: avviaSessioneFnCombinato, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const { sessionId } = registro.avvia('task-vero');
  primoGiro.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: storiaDelPrimoGiro } });
  await new Promise((r) => setImmediate(r));

  const ripreso = registro.resume(sessionId);
  assert.equal(ripreso.sessionId, sessionId, 'resume torna LO STESSO id, non uno nuovo come forka()');

  const inputDelSecondoGiro = secondoGiro.ultimoInput;
  assert.equal(inputDelSecondoGiro.cartella, '/tmp/x');
  assert.deepEqual(inputDelSecondoGiro.messaggiIniziali, storiaDelPrimoGiro);

  // Un iscritto ORA (dopo resume, mentre il secondo giro è ancora sospeso)
  // deve vedere l'intera storia — primo giro E il RunStarted del secondo —
  // senza nessun buco fra i due.
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e.type));
  assert.deepEqual(ricevuti, ['RunStarted', 'RunFinished', 'RunStarted'],
    'il buffer è UNO SOLO: primo giro completo, poi il RunStarted del secondo, mai ricominciato da zero');

  secondoGiro.concludi({ type: 'RunFinished', threadId: 't2', runId: 'r2' });
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(registro.esporta(sessionId).eventi.map((e) => e.type),
    ['RunStarted', 'RunFinished', 'RunStarted', 'RunFinished'],
    'export mostra ENTRAMBI i giri, in ordine, mai solo l\'ultimo');
});

/**
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — a
 * differenza di forka() (voce NUOVA), resume() riusa la STESSA voce
 * (`voceEsistente`): `avviaESegui` non deve MAI sovrascriverne `mobile`
 * col default `false` del suo parametro.
 */
test('⭐⭐⭐ resume() preserva mobile:true della sessione, senza sovrascriverlo', async () => {
  const primoGiro = sessioneControllabile();
  const secondoGiro = sessioneControllabile();
  let chiamataNumero = 0;
  const avviaSessioneFnCombinato = (input) => {
    chiamataNumero += 1;
    return chiamataNumero === 1 ? primoGiro.avviaSessioneFn(input) : secondoGiro.avviaSessioneFn(input);
  };
  const registro = createSessionRegistry({ avviaSessioneFn: avviaSessioneFnCombinato, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const { sessionId } = registro.avvia('task-vero', { mobile: true });
  primoGiro.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: [{ role: 'user', content: 'c' }] } });
  await new Promise((r) => setImmediate(r));

  registro.resume(sessionId);

  assert.equal(secondoGiro.ultimoInput.mobile, true);
  secondoGiro.concludi({ type: 'RunFinished', threadId: 't2', runId: 'r2' });
  await new Promise((r) => setImmediate(r));
});

test('⭐ ferma() dopo un resume aborta il controller del giro NUOVO, non quello vecchio già concluso', async () => {
  const primoGiro = sessioneControllabile();
  const secondoGiro = sessioneControllabile();
  let chiamataNumero = 0;
  const avviaSessioneFnCombinato = (input) => {
    chiamataNumero += 1;
    return chiamataNumero === 1 ? primoGiro.avviaSessioneFn(input) : secondoGiro.avviaSessioneFn(input);
  };
  const registro = createSessionRegistry({ avviaSessioneFn: avviaSessioneFnCombinato, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const { sessionId } = registro.avvia('task-vero');
  primoGiro.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: [{ role: 'user', content: 'x' }] } });
  await new Promise((r) => setImmediate(r));
  registro.resume(sessionId);

  assert.equal(secondoGiro.segnaleStop.aborted, false);
  registro.ferma(sessionId);
  assert.equal(secondoGiro.segnaleStop.aborted, true);

  secondoGiro.concludi({ type: 'RunError', message: 'fermato', code: 'fermato' });
  await new Promise((r) => setImmediate(r));
});

test('⛔ compatta() su un id inesistente: NOT_FOUND', async () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal((await registro.compatta('mai-esistito')).code, 'NOT_FOUND');
});

test('⛔ compatta() su una sessione ANCORA IN CORSO: SESSION_NOT_READY, compattaSessioneFn mai chiamato', async () => {
  const finta = sessioneControllabile();
  let chiamate = 0;
  const compattaSessioneFn = async () => { chiamate += 1; return { compattato: true, messaggi: [] }; };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, compattaSessioneFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = await registro.compatta(sessionId);
  assert.equal(risultato.code, 'SESSION_NOT_READY');
  assert.match(risultato.erroreAvvio, /ancora in corso/);
  assert.equal(chiamate, 0, 'una sessione dal vivo non deve mai raggiungere compattaSessioneFn');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

test('⛔ compatta() su una sessione conclusa MA SENZA messaggiFinali (talosLavora non li ha prodotti): SESSION_NOT_READY', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // risultato di default {ok:true}, senza esito.messaggiFinali
  await new Promise((r) => setImmediate(r));

  const risultato = await registro.compatta(sessionId);
  assert.equal(risultato.code, 'SESSION_NOT_READY');
  assert.match(risultato.erroreAvvio, /non ha una conversazione/);
});

test('⭐⭐⭐ compatta(): chiama compattaSessioneFn con messaggiFinali/modello/chiave, e un resume SUCCESSIVO riparte dal riassunto', async () => {
  const primoGiro = sessioneControllabile();
  const secondoGiro = sessioneControllabile();
  const storiaFinale = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
  const storiaCompattata = [storiaFinale[0], storiaFinale[1], { role: 'user', content: '[riassunto]' }];
  let inputCatturato = null;
  const compattaSessioneFn = async (input) => { inputCatturato = input; return { compattato: true, messaggi: storiaCompattata, usage: null }; };
  let numeroChiamata = 0;
  const avviaSessioneFnCombinato = (input) => {
    numeroChiamata += 1;
    return numeroChiamata === 1 ? primoGiro.avviaSessioneFn(input) : secondoGiro.avviaSessioneFn(input);
  };
  const registro = createSessionRegistry({
    avviaSessioneFn: avviaSessioneFnCombinato, preparaEsecuzioneFn: preparaEsecuzioneFinta, compattaSessioneFn,
    modello: 'z-ai/glm-4.7-flash', chiave: 'segreta',
  });
  const { sessionId } = registro.avvia('task-vero');
  primoGiro.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: storiaFinale } });
  await new Promise((r) => setImmediate(r));

  const risultato = await registro.compatta(sessionId);
  assert.deepEqual(inputCatturato, { messaggiFinali: storiaFinale, modello: 'z-ai/glm-4.7-flash', chiave: 'segreta' });
  assert.deepEqual(risultato, { ok: true, compattato: true });

  // ⭐ La prova che conta: compatta() ha mutato messaggiFinali sul posto —
  // il PROSSIMO giro (qui un resume, sulla STESSA voce) eredita il
  // riassunto, non la storia intera.
  registro.resume(sessionId);
  assert.deepEqual(secondoGiro.ultimoInput.messaggiIniziali, storiaCompattata, 'il resume riparte dal riassunto, non dalla storia intera');

  secondoGiro.concludi({ type: 'RunFinished', threadId: 't2', runId: 'r2' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

test('⛔ verso contrario: se compattaSessioneFn torna compattato:false, un resume successivo eredita ANCORA la storia intera', async () => {
  const primoGiro = sessioneControllabile();
  const secondoGiro = sessioneControllabile();
  const storiaFinale = [{ role: 'system', content: 's' }, { role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];
  const compattaSessioneFn = async () => ({ compattato: false, messaggi: [{ role: 'user', content: 'MAI dovrebbe finire qui' }], usage: null });
  let numeroChiamata = 0;
  const avviaSessioneFnCombinato = (input) => {
    numeroChiamata += 1;
    return numeroChiamata === 1 ? primoGiro.avviaSessioneFn(input) : secondoGiro.avviaSessioneFn(input);
  };
  const registro = createSessionRegistry({
    avviaSessioneFn: avviaSessioneFnCombinato, preparaEsecuzioneFn: preparaEsecuzioneFinta, compattaSessioneFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');
  primoGiro.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: storiaFinale } });
  await new Promise((r) => setImmediate(r));

  const risultato = await registro.compatta(sessionId);
  assert.deepEqual(risultato, { ok: true, compattato: false });

  registro.resume(sessionId);
  assert.deepEqual(secondoGiro.ultimoInput.messaggiIniziali, storiaFinale, 'compattato:false non deve toccare messaggiFinali');

  secondoGiro.concludi({ type: 'RunFinished', threadId: 't2', runId: 'r2' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

test('⛔ albero() su un id inesistente: NOT_FOUND', async () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal((await registro.albero('mai-esistito')).code, 'NOT_FOUND');
});

test('⭐⭐ albero() passa cartella/percorso VERI a leggiAlberoWorkspaceFn — nessun guard su conclusa, funziona anche a sessione IN CORSO', async () => {
  const finta = sessioneControllabile();
  let catturato = null;
  const leggiAlberoWorkspaceFn = async (input) => { catturato = input; return [{ nome: 'a.ts', cartella: false }]; };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, leggiAlberoWorkspaceFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero'); // MAI concluso in questo test

  const risultato = await registro.albero(sessionId, 'src');

  assert.deepEqual(catturato, { cartella: '/tmp/x', percorso: 'src' });
  assert.deepEqual(risultato, { ok: true, voci: [{ nome: 'a.ts', cartella: false }] });

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

test('⛔ albero(): un WorkspaceTreeError VERO diventa {erroreAvvio, code}, mai un throw fino all\'HTTP', async () => {
  const finta = sessioneControllabile();
  const leggiAlberoWorkspaceFn = async () => { throw new WorkspaceTreeError('Percorso non valido'); };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, leggiAlberoWorkspaceFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = await registro.albero(sessionId, 'x');
  assert.deepEqual(risultato, { erroreAvvio: 'Percorso non valido', code: 'QUERY_INVALID' });

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

test('⛔⛔ verso contrario: un errore IMPREVISTO (non WorkspaceTreeError — un bug) si PROPAGA, mai inghiottito come risposta pulita', async () => {
  const finta = sessioneControllabile();
  const leggiAlberoWorkspaceFn = async () => { throw new Error('disco pieno, bug vero'); };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, leggiAlberoWorkspaceFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  await assert.rejects(() => registro.albero(sessionId, 'x'), /disco pieno, bug vero/);

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

/*
 * ⭐⭐⭐ 27/8, owner: rinomina/apri/rivela-in-Explorer/elimina — stesso
 * schema di albero() sopra, stessa profondità di prova: qui si prova
 * SOLO il collegamento (sessionId->cartella, WorkspaceFileError->{erroreAvvio,code}),
 * non la validazione del percorso — quella ha già 16 prove dedicate in
 * workspace-files.test.mjs, ripeterle qui sarebbe la stessa prova due volte.
 */
test('⛔ apriFile/rinominaFile/eliminaFile/rivelaFile su un id inesistente: NOT_FOUND per tutti e quattro', async () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal((await registro.apriFile('mai-esistito', 'a.txt')).code, 'NOT_FOUND');
  assert.equal((await registro.rinominaFile('mai-esistito', 'a.txt', 'b.txt')).code, 'NOT_FOUND');
  assert.equal((await registro.eliminaFile('mai-esistito', 'a.txt')).code, 'NOT_FOUND');
  assert.equal((await registro.rivelaFile('mai-esistito', 'a.txt')).code, 'NOT_FOUND');
});

test('⭐⭐ apriFile passa cartella/percorso VERI a leggiContenutoFileFn e torna il contenuto', async () => {
  const finta = sessioneControllabile();
  let catturato = null;
  const leggiContenutoFileFn = async (input) => { catturato = input; return { contenuto: 'ciao', dimensione: 4 }; };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, leggiContenutoFileFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = await registro.apriFile(sessionId, 'a.txt');

  assert.deepEqual(catturato, { cartella: '/tmp/x', percorso: 'a.txt' });
  assert.deepEqual(risultato, { ok: true, contenuto: 'ciao', dimensione: 4 });

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⭐⭐ rinominaFile passa cartella/percorso/nuovoNome VERI a rinominaFileFn e torna il nuovo percorso', async () => {
  const finta = sessioneControllabile();
  let catturato = null;
  const rinominaFileFn = async (input) => { catturato = input; return { nuovoPercorso: 'b.txt' }; };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, rinominaFileFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = await registro.rinominaFile(sessionId, 'a.txt', 'b.txt');

  assert.deepEqual(catturato, { cartella: '/tmp/x', percorso: 'a.txt', nuovoNome: 'b.txt' });
  assert.deepEqual(risultato, { ok: true, nuovoPercorso: 'b.txt' });

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⛔ eliminaFile: un WorkspaceFileError VERO (es. FILE_NOT_FOUND) diventa {erroreAvvio, code}, mai un throw fino all\'HTTP', async () => {
  const finta = sessioneControllabile();
  const eliminaFileFn = async () => { throw new WorkspaceFileError('File non trovato', 'FILE_NOT_FOUND'); };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, eliminaFileFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = await registro.eliminaFile(sessionId, 'mai-esistito.txt');
  assert.deepEqual(risultato, { erroreAvvio: 'File non trovato', code: 'FILE_NOT_FOUND' });

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⛔⛔ rivelaFile: AL CONTRARIO, un errore IMPREVISTO (non WorkspaceFileError) si PROPAGA, mai inghiottito', async () => {
  const finta = sessioneControllabile();
  const rivelaInEsploraFileFn = async () => { throw new Error('bug vero, non un WorkspaceFileError'); };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, rivelaInEsploraFileFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  await assert.rejects(() => registro.rivelaFile(sessionId, 'a.txt'), /bug vero, non un WorkspaceFileError/);

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⛔⛔⛔ se avviaSessione (contro il suo stesso contratto) RIGETTA invece di risolvere, il registro chiude comunque con RunError — mai una sessione appesa', async () => {
  const avviaSessioneCheRigetta = async () => { throw new Error('bug futuro, ipotetico'); };
  const registro = createSessionRegistry({ avviaSessioneFn: avviaSessioneCheRigetta, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const { sessionId } = registro.avvia('task-vero');
  await new Promise((r) => setImmediate(r)); // lascia girare il .catch() del registro

  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  assert.equal(ricevuti.length, 1);
  assert.equal(ricevuti[0].type, 'RunError');
  assert.equal(ricevuti[0].code, 'internal-error');
});

// shell() — il comando diretto (`!comando`, piano §1.3-BIS.T seconda metà).

test('⛔ shell() su un id inesistente: NOT_FOUND', () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal(registro.shell('mai-esistito', 'echo x').code, 'NOT_FOUND');
});

test('⛔ shell() su una sessione ANCORA IN CORSO: SESSION_NOT_READY, eseguiComandoDirettoFn mai chiamato', async () => {
  const finta = sessioneControllabile();
  let chiamate = 0;
  const eseguiComandoDirettoFn = async () => { chiamate += 1; return { ok: true }; };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, eseguiComandoDirettoFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = registro.shell(sessionId, 'echo x');
  assert.equal(risultato.code, 'SESSION_NOT_READY');
  assert.equal(chiamate, 0, 'una sessione dal vivo non deve mai raggiungere eseguiComandoDirettoFn — correrebbe contro lo stesso talosLavora sulla stessa cartella');

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia
  await new Promise((r) => setImmediate(r));
});

test('shell() su una sessione conclusa: chiama eseguiComandoDirettoFn con la cartella giusta, torna {ok:true} SENZA aspettare l\'esecuzione', async () => {
  const finta = sessioneControllabile();
  let risolviComando;
  const attesaComando = new Promise((r) => { risolviComando = r; });
  let inputCatturato = null;
  const eseguiComandoDirettoFn = async (input) => {
    inputCatturato = input;
    input.onEvento({ type: 'RunStarted', threadId: 't2', runId: 'r2' });
    await attesaComando; // resta appeso finché il test non lo risolve
    input.onEvento({ type: 'RunFinished', threadId: 't2', runId: 'r2', outcome: { type: 'success' } });
    return { ok: true, codice: 0, enforcement: 'wsl2' };
  };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, eseguiComandoDirettoFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));

  const risultato = registro.shell(sessionId, 'echo x');

  assert.equal(risultato.ok, true, 'torna subito — non aspetta eseguiComandoDirettoFn, stesso principio di avviaESegui');
  assert.equal(inputCatturato.cartella, '/tmp/x');
  assert.equal(inputCatturato.comando, 'echo x');
  // ⛔ AL CONTRARIO: una sessione desktop (nessun mobile passato ad avvia())
  // non deve MAI far scattare adb-shell-on-device sul lato talosHarness.
  assert.equal(inputCatturato.mobile, false);
  risolviComando();
  await new Promise((r) => setImmediate(r));
});

/**
 * ⭐⭐⭐ Piano procedi-col-generare-un-snoopy-neumann.md, Fase 3 — shell()
 * legge voce.mobile (impostato all'avvio) e lo passa a
 * eseguiComandoDirettoFn: il comando diretto (`!comando`) di una sessione
 * mobile deve raggiungere il TELEFONO, non il PC, esattamente come
 * l'attrezzo `shell` dentro il ciclo dello stesso task.
 */
test('shell() su una sessione mobile passa mobile:true a eseguiComandoDirettoFn', async () => {
  const finta = sessioneControllabile();
  let inputCatturato = null;
  const eseguiComandoDirettoFn = async (input) => {
    inputCatturato = input;
    input.onEvento({ type: 'RunStarted', threadId: 't2', runId: 'r2' });
    input.onEvento({ type: 'RunFinished', threadId: 't2', runId: 'r2', outcome: { type: 'success' } });
    return { ok: true, codice: 0, enforcement: 'adb-shell-on-device' };
  };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, eseguiComandoDirettoFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero', { mobile: true });
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));

  registro.shell(sessionId, 'pm list packages');

  assert.equal(inputCatturato.mobile, true);
});

test('⭐⭐⭐ shell() apre una finestra "dal vivo": chi si iscrive DOPO averla chiamata (come farà app.js — POST poi una connessione FRESCA, stesso schema di startRealSession) vede gli eventi mentre accadono', async () => {
  const finta = sessioneControllabile();
  let emettiEventoShell;
  const eseguiComandoDirettoFn = async (input) => {
    emettiEventoShell = input.onEvento;
    // come la vera eseguiComandoDiretto (agent-service.mjs): emette RunStarted
    // SINCRONO, prima di qualunque await — run-to-first-await di JS, stesso
    // principio già documentato sopra avviaESegui.
    input.onEvento({ type: 'RunStarted', threadId: 't2', runId: 'r2' });
    return new Promise(() => {}); // resta appeso: il test decide il resto
  };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, eseguiComandoDirettoFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));

  registro.shell(sessionId, 'echo x'); // RunStarted del comando diretto già nel buffer al ritorno

  // il client si iscrive DOPO, come farà app.js: POST /shell, POI apre l'EventSource —
  // mai il contrario, e mai riusando una connessione vecchia attraverso il confine.
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e.type));
  assert.deepEqual(ricevuti, ['RunStarted', 'RunFinished', 'RunStarted'],
    'il replay del primo giro, PIÙ il RunStarted del comando diretto — senza voce.conclusa=false dentro shell(), quest\'ultimo non ci sarebbe MAI, nemmeno nel replay');

  emettiEventoShell({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell' });
  assert.deepEqual(ricevuti, ['RunStarted', 'RunFinished', 'RunStarted', 'ToolCallStart'],
    'e questo arriva DAL VIVO, non da un replay: la sottoscrizione è avvenuta mentre voce.conclusa era ancora false');
});

/*
 * ⛔⛔⛔ 28/8 — RISCRITTO: il titolo originale di questo test descriveva
 * un "limite noto" (una connessione già aperta su una sessione conclusa
 * non riceveva mai eventi dal vivo) che era vero PER COSTRUZIONE, non
 * per scelta — `iscriviti()` non registrava l'ascoltatore se
 * `voce.conclusa` era già true. Bug reale, trovato dal vivo (client
 * Node.js grezzo, non Chrome/EventSource): da quando WorkspaceChanged
 * può arrivare ben dopo la fine di un giro, questo limite nascondeva
 * silenziosamente OGNI evento futuro a un client onestamente ancora
 * connesso. Ora si iscrive sempre — vedi la doc di iscriviti().
 */
test('⭐⭐⭐ AL CONTRARIO — una connessione GIÀ APERTA su una sessione conclusa riceve comunque gli eventi dal vivo che arrivano dopo (bug reale corretto il 28/8)', async () => {
  const finta = sessioneControllabile();
  let emettiEventoShell;
  const eseguiComandoDirettoFn = async (input) => {
    emettiEventoShell = input.onEvento;
    return new Promise(() => {});
  };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, eseguiComandoDirettoFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));

  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e.type)); // già concluso — ma resta iscritto, non solo un replay

  registro.shell(sessionId, 'echo x');
  emettiEventoShell({ type: 'ToolCallStart', toolCallId: 'c1', toolCallName: 'shell' });

  assert.deepEqual(ricevuti, ['RunStarted', 'RunFinished', 'ToolCallStart'],
    'una connessione aperta PRIMA di shell() ora vede comunque i suoi eventi dal vivo — non serve più aprirne una nuova per forza');
});

/*
 * ⭐⭐⭐ 28/8 — workspace-watcher.mjs, owner 27/8: "se muovo i file il work
 * tree non si aggiorna automaticamente". Qui si prova SOLO il collegamento
 * (guardaWorkspaceFn chiamato con la cartella giusta, il suo callback
 * diventa un evento WorkspaceChanged) — il watcher VERO ha i suoi test
 * dedicati in workspace-watcher.test.mjs (chokidar reale, disco reale).
 */
test('⭐⭐⭐ avvia() chiama guardaWorkspaceFn con la cartella VERA della sessione, e il suo callback diventa un evento WorkspaceChanged', async () => {
  const finta = sessioneControllabile();
  let cartellaCatturata = null;
  let notificaEsterna = null;
  const guardaWorkspaceFn = (cartella, onCambiamento) => {
    cartellaCatturata = cartella;
    notificaEsterna = onCambiamento;
    return () => {};
  };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, guardaWorkspaceFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  assert.equal(cartellaCatturata, '/tmp/x', 'la STESSA cartella della sessione, non un percorso a caso');
  assert.equal(typeof notificaEsterna, 'function');

  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  notificaEsterna(['nuovo.txt', 'sub/altro.txt']); // simula il watcher vero che segnala un cambiamento

  const evento = ricevuti.find((e) => e.type === 'WorkspaceChanged');
  assert.ok(evento, 'un evento WorkspaceChanged deve arrivare agli iscritti');
  assert.deepEqual(evento.percorsi, ['nuovo.txt', 'sub/altro.txt']);
});

test('⛔ AL CONTRARIO — un resume sulla STESSA sessione non chiama guardaWorkspaceFn una seconda volta', async () => {
  const finta = sessioneControllabile();
  let chiamate = 0;
  const guardaWorkspaceFn = () => { chiamate += 1; return () => {}; };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, guardaWorkspaceFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));

  assert.equal(chiamate, 1, 'un solo watcher acceso al primo avvio');
  registro.resume(sessionId, 'un altro messaggio');
  assert.equal(chiamate, 1, 'il resume riusa la STESSA voce — nessun secondo watcher sulla stessa cartella');
});
