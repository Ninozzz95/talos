import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { CustomTaskError } from '../src/custom-task.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { WorkspaceTreeError } from '../src/workspace-tree.mjs';
import { WorkspaceFileError } from '../src/workspace-files.mjs';
import { HookRegistryError } from '../src/hook-registry.mjs';

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
 * ⭐ 28/8 — Terminale REALE (LEDGER-TERMINALE-REALE.md): `terminal-ws.mjs`
 * usa `cartellaDi(sessionId)` per il cwd iniziale di una PTY. Mai esporre
 * la `voce` interna intera — solo il campo che serve, e `null` onesto se
 * la sessione non esiste (il fallback a un progetto di default è
 * responsabilità del chiamante, non di questo registro).
 */
test('⭐⭐ cartellaDi(sessionId) torna la cartella VERA di una sessione esistente', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  const { sessionId } = registro.avvia('task-vero');

  assert.equal(registro.cartellaDi(sessionId), '/tmp/x');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔⛔ AL CONTRARIO — cartellaDi su un id inesistente torna null, mai un\'eccezione', () => {
  const registro = createSessionRegistry({ modello: 'm', chiave: 'k' });
  assert.equal(registro.cartellaDi('id-mai-esistito'), null);
});

/*
 * ⭐⭐⭐ 28/8 — FASE A (hook), piano `elegant-spinning-dongarra.md`, ledger
 * `LEDGER-FASE-A-HOOKS.md`. `costruisciHookFn` non è esportata (è privata
 * al modulo) — si prova attraverso ciò che PRODUCE: `avvia()` passa un
 * `hookFn` reale ad `avviaSessioneFn` (catturato dalla sessione finta),
 * e invocarlo a mano riproduce esattamente cosa succede quando
 * `talosLavora` lo chiama davvero — stesso principio già in uso per
 * `chiediApprovazioneFn` altrove in questo file.
 */
test('⭐⭐⭐ hookFn passato ad avviaSessioneFn: un hook fidato che esegue emette HookInvoked sullo stream della sessione', async () => {
  const finta = sessioneControllabile();
  const hook = { id: 'audit', eventi: ['pre_tool_call'], comando: 'echo ok', hash: 'abc' };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    caricaHooksFn: async () => ({ hooks: [hook] }),
    verificaTrustFn: async () => true,
    eseguiHookFn: async () => ({ consentito: true }),
  });

  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));

  const esito = await finta.ultimoInput.hookFn({ tipo: 'pre_tool_call', azione: 'scrivi', giro: 1 });

  assert.deepEqual(esito, { consentito: true });
  const hookInvoked = ricevuti.find((e) => e.type === 'HookInvoked');
  assert.ok(hookInvoked, 'un HookInvoked deve arrivare sullo stream della sessione');
  assert.equal(hookInvoked.hookId, 'audit');
  assert.equal(hookInvoked.tipo, 'pre_tool_call');
  assert.equal(hookInvoked.azione, 'scrivi');
  assert.deepEqual(hookInvoked.esito, { consentito: true });
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔⛔ AL CONTRARIO — nessun hook configurato: hookFn non emette MAI HookInvoked (il ramo veloce non tocca lo stream)', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    caricaHooksFn: async () => ({ hooks: [] }),
  });

  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));

  await finta.ultimoInput.hookFn({ tipo: 'pre_tool_call', azione: 'scrivi', giro: 1 });

  assert.equal(ricevuti.some((e) => e.type === 'HookInvoked'), false);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔⛔⛔ AL CONTRARIO — un hook NON fidato non esegue e non emette HookInvoked (come se non esistesse)', async () => {
  const finta = sessioneControllabile();
  const hook = { id: 'non-fidato', eventi: ['pre_tool_call'], comando: 'echo x', hash: 'zzz' };
  let eseguiChiamato = false;
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    caricaHooksFn: async () => ({ hooks: [hook] }),
    verificaTrustFn: async () => false,
    eseguiHookFn: async () => { eseguiChiamato = true; return { consentito: false, motivo: 'non dovrebbe mai girare' }; },
  });

  const { sessionId } = registro.avvia('task-vero');
  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));

  const esito = await finta.ultimoInput.hookFn({ tipo: 'pre_tool_call', azione: 'shell', giro: 1 });

  assert.deepEqual(esito, { consentito: true }, 'un hook non fidato non blocca — come se non esistesse');
  assert.equal(eseguiChiamato, false, 'un hook non fidato non deve MAI essere eseguito');
  assert.equal(ricevuti.some((e) => e.type === 'HookInvoked'), false);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

/*
 * ⭐⭐⭐ 28/8 — FASE A (hook): `elencaHooks`/`fidaHook` sono ciò che il
 * pannello Control-plane chiama — provati qui in isolamento dal ciclo
 * dell'agente, stesso principio di `cartellaDi` sopra.
 */
test('⭐⭐⭐ elencaHooks: torna ogni hook con il suo VERO stato di fiducia', async () => {
  const finta = sessioneControllabile();
  const hookA = { id: 'audit', eventi: ['pre_tool_call'], comando: 'echo a', hash: 'hash-a' };
  const hookB = { id: 'notifica', eventi: ['session_end'], comando: 'echo b', hash: 'hash-b' };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    caricaHooksFn: async () => ({ hooks: [hookA, hookB] }),
    verificaTrustFn: async ({ hookId }) => hookId === 'audit', // solo "audit" è fidato
  });
  const { sessionId } = registro.avvia('task-vero');

  const esito = await registro.elencaHooks(sessionId);

  assert.equal(esito.ok, true);
  assert.equal(esito.errore, null);
  assert.deepEqual(esito.hooks, [
    { id: 'audit', eventi: ['pre_tool_call'], fidato: true },
    { id: 'notifica', eventi: ['session_end'], fidato: false },
  ]);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔⛔ AL CONTRARIO — elencaHooks con hooks.json malformato: {hooks:null, errore}, MAI un array vuoto che si legge come "nessun hook"', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    caricaHooksFn: async () => { throw new HookRegistryError('.harness-ui-hooks.json non è un JSON valido', 'HOOK_MALFORMED'); },
  });
  const { sessionId } = registro.avvia('task-vero');

  const esito = await registro.elencaHooks(sessionId);

  assert.equal(esito.ok, true);
  assert.equal(esito.hooks, null, 'null, non [] — sono due fatti diversi');
  assert.match(esito.errore, /non è un JSON valido/);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔ AL CONTRARIO — elencaHooks su un id inesistente: NOT_FOUND', async () => {
  const registro = createSessionRegistry({ modello: 'm', chiave: 'k' });
  const esito = await registro.elencaHooks('id-mai-esistito');
  assert.deepEqual(esito, { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' });
});

test('⭐⭐⭐ fidaHook: rilegge hooks.json e fida con l\'hash VERO letto da disco, mai uno passato dal chiamante', async () => {
  const finta = sessioneControllabile();
  const hook = { id: 'audit', eventi: ['pre_tool_call'], comando: 'echo a', hash: 'hash-vero-dal-disco' };
  const chiamate = [];
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    caricaHooksFn: async () => ({ hooks: [hook] }),
    fidaHookFn: async (args) => { chiamate.push(args); },
  });
  const { sessionId } = registro.avvia('task-vero');

  const esito = await registro.fidaHook(sessionId, 'audit');

  assert.deepEqual(esito, { ok: true });
  assert.equal(chiamate.length, 1);
  assert.equal(chiamate[0].hookId, 'audit');
  assert.equal(chiamate[0].hash, 'hash-vero-dal-disco');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔⛔ AL CONTRARIO — fidaHook su un hookId che non esiste in hooks.json: NOT_FOUND, fidaHookFn MAI chiamata', async () => {
  const finta = sessioneControllabile();
  let chiamata = false;
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k',
    caricaHooksFn: async () => ({ hooks: [{ id: 'altro', eventi: ['pre_tool_call'], comando: 'x', hash: 'h' }] }),
    fidaHookFn: async () => { chiamata = true; },
  });
  const { sessionId } = registro.avvia('task-vero');

  const esito = await registro.fidaHook(sessionId, 'audit-mai-dichiarato');

  assert.equal(esito.code, 'NOT_FOUND');
  assert.equal(chiamata, false);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔ AL CONTRARIO — fidaHook su un id sessione inesistente: NOT_FOUND', async () => {
  const registro = createSessionRegistry({ modello: 'm', chiave: 'k' });
  const esito = await registro.fidaHook('id-mai-esistito', 'audit');
  assert.deepEqual(esito, { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' });
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
function preparaEsecuzioneLiberaFinta(cartelleProgetto, { cartellaId, cartellaLibera, consegna }) {
  // ⭐ 28/8 — cartellaLibera (permesso "Full access"): la VALIDAZIONE vera
  // (esiste? è una cartella? leggibile/scrivibile?) è già provata per
  // intero in custom-task.test.mjs — qui basta che il registro la
  // inoltri, stesso principio minimalista del resto di questo fake.
  if (cartellaLibera) return { cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } };
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
 * ⭐⭐⭐ 28/8 — LA PILLOLA PERMESSI (piano elegant-spinning-dongarra.md,
 * owner: "read only/workspace write/on request/full access"). Ricerca
 * fatta prima di scrivere (REGOLA ZERO, e HERMES AGENT — vedi memoria
 * [[harness-da-battere-uno-a-uno]] — è il primo competitor: la sua
 * assenza di un'approvazione interattiva è esattamente il gap che
 * "On request" qui sotto colma).
 */
test('⭐ default: senza permessi espliciti, la voce è "Workspace write" — nessun livelloAccesso, nessun chiediApprovazioneFn', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero');

  assert.equal(finta.ultimoInput.livelloAccesso, undefined);
  assert.equal(finta.ultimoInput.chiediApprovazioneFn, undefined);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐⭐ "Read only" diventa livelloAccesso:\'lettura\' per il kernel, MAI chiediApprovazioneFn', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero', { permessiScelto: 'Read only' });

  assert.equal(finta.ultimoInput.livelloAccesso, 'lettura');
  assert.equal(finta.ultimoInput.chiediApprovazioneFn, undefined);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐⭐ "On request" passa una chiediApprovazioneFn vera, MAI livelloAccesso', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero', { permessiScelto: 'On request' });

  assert.equal(finta.ultimoInput.livelloAccesso, undefined);
  assert.equal(typeof finta.ultimoInput.chiediApprovazioneFn, 'function');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐ "Workspace write"/"Full access" restano entrambi senza livelloAccesso/chiediApprovazioneFn — "Full access" cambia la CARTELLA, non il kernel', () => {
  for (const permessiScelto of ['Workspace write', 'Full access']) {
    const finta = sessioneControllabile();
    const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
    registro.avvia('task-vero', { permessiScelto });
    assert.equal(finta.ultimoInput.livelloAccesso, undefined, permessiScelto);
    assert.equal(finta.ultimoInput.chiediApprovazioneFn, undefined, permessiScelto);
    finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  }
});

test('⛔⛔⛔ AL CONTRARIO — avviaLibero() con cartellaLibera ma SENZA permesso "Full access" è rifiutato, avviaSessione MAI chiamato', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneLiberaFn: preparaEsecuzioneLiberaFinta,
    cartelleProgetto: [], modello: 'm', chiave: 'k',
  });

  const risultato = registro.avviaLibero({ cartellaLibera: '/tmp/qualunque', consegna: 'fai qualcosa', permessi: 'Workspace write' });

  assert.equal(risultato.code, 'QUERY_INVALID');
  assert.equal(finta.chiamate, 0, 'un client HTTP diretto non deve MAI aggirare il cancello del permesso passando dal frontend');
});

test('⭐⭐⭐ avviaLibero() con cartellaLibera E permesso "Full access" avvia DAVVERO, sulla cartella scelta', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneLiberaFn: preparaEsecuzioneLiberaFinta,
    cartelleProgetto: [], modello: 'm', chiave: 'k',
  });

  const risultato = registro.avviaLibero({ cartellaLibera: '/tmp/percorso-a-piacere', consegna: 'fai qualcosa', permessi: 'Full access' });

  assert.ok(risultato.sessionId);
  assert.equal(finta.ultimoInput.cartella, '/tmp/percorso-a-piacere');
  assert.equal(finta.ultimoInput.livelloAccesso, undefined, '"Full access" non tocca il kernel: solo la cartella cambia');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐⭐ fork() eredita il permesso della sessione origine — mai perso a metà conversazione', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'Read only' });
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: [{ role: 'user', content: 'x' }] } });
  await new Promise((r) => setImmediate(r));

  // ⛔ STESSO `finta`/`registro`: forka() richiama avviaSessioneFn una
  // seconda volta sullo stesso closure — `finta.ultimoInput` passa
  // dalla sessione origine a quella forkata, non serve un secondo fake.
  const risultatoFork = registro.forka(sessionId);

  assert.ok(risultatoFork.sessionId);
  assert.equal(finta.ultimoInput.livelloAccesso, 'lettura', 'il fork eredita "Read only" dalla sessione origine');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); // pulizia della sessione forkata
});

test('⭐⭐⭐ resume() eredita il permesso della sessione origine', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'On request' });
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: [{ role: 'user', content: 'x' }] } });
  await new Promise((r) => setImmediate(r));

  const risultatoResume = registro.resume(sessionId);

  // ⛔ mai assumere: se resume() avesse fallito in silenzio (senza
  // richiamare avviaSessioneFn), finta.ultimoInput sarebbe rimasto
  // quello della PRIMA chiamata — che ha PURE "On request" — e questa
  // prova avrebbe superato l'asserzione sotto per il motivo sbagliato.
  assert.ok(risultatoResume.sessionId, 'resume deve riuscire, non fallire in silenzio');
  assert.equal(finta.chiamate, 2, 'avviaSessioneFn deve essere stato richiamato una SECONDA volta, non riusato dal primo giro');
  assert.equal(typeof finta.ultimoInput.chiediApprovazioneFn, 'function', 'il resume ha ri-chiamato avviaSessione con lo STESSO permesso "On request" ereditato');
});

/*
 * ⭐⭐⭐ FASE B (28/8) — permesso PER-ATTREZZO, un override più specifico
 * di `permessiScelto`. Stesso stile/stessi fake della pillola permessi
 * appena sopra.
 */
test('⭐ default: senza permessiPerAttrezzoScelto, la voce non porta alcun override — null verso il kernel (optional chaining lo tratta come assente)', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero');

  assert.equal(finta.ultimoInput.permessiPerAttrezzo, null);
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐⭐ permessiPerAttrezzoScelto arriva DAVVERO ad avviaSessioneFn, invariato', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero', { permessiPerAttrezzoScelto: { shell: 'nega' } });

  assert.deepEqual(finta.ultimoInput.permessiPerAttrezzo, { shell: 'nega' });
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐⭐ fork() eredita permessiPerAttrezzo della sessione origine — stesso principio già in uso per permessi', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero', { permessiPerAttrezzoScelto: { scrivi: 'sempre' } });
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: [{ role: 'user', content: 'x' }] } });
  await new Promise((r) => setImmediate(r));

  const risultatoFork = registro.forka(sessionId);

  assert.ok(risultatoFork.sessionId);
  assert.deepEqual(finta.ultimoInput.permessiPerAttrezzo, { scrivi: 'sempre' }, 'il fork crea una voce NUOVA: senza passarlo esplicitamente si perderebbe, stessa lezione già imparata per permessi');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐⭐ resume() eredita permessiPerAttrezzo della sessione origine (STESSA voce, nessun passaggio esplicito necessario)', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero', { permessiPerAttrezzoScelto: { document_create: 'chiedi' } });
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' }, { esito: { messaggiFinali: [{ role: 'user', content: 'x' }] } });
  await new Promise((r) => setImmediate(r));

  registro.resume(sessionId);

  assert.deepEqual(finta.ultimoInput.permessiPerAttrezzo, { document_create: 'chiedi' });
});

/*
 * ⛔⛔⛔ FASE B (28/8) — RIPIEGO TEMPORANEO, non la cura finale. Bug reale
 * trovato DAL VIVO (screenshot, non solo a unit test): un primo tentativo
 * costruiva `chiediApprovazioneFn` ogni volta che ALMENO UN attrezzo
 * voleva 'chiedi' — ma questo fa TRAPELARE l'approvazione anche su
 * `scrivi` (nessun override), perché il kernel usa "chiediApprovazioneFn
 * presente" come segnale di "la sessione chiede SEMPRE" per un attrezzo
 * senza override. La cura vera (un valore esplicito `livelloAccesso`,
 * tipo `'su-richiesta'`, indipendente dalla presenza del canale) tocca
 * `talosHarness.mjs` — bloccata da coordinamento: un'altra sessione ha
 * 111 righe non committate sullo STESSO file proprio mentre questo bug
 * veniva trovato (vedi il commento nel sorgente). Qui si prova il
 * ripiego SICURO: 'chiedi' per-attrezzo sotto una policy diversa da "On
 * request" fallisce chiuso (REFUSED), mai una card che trapela altrove.
 */
test('⛔⛔⛔ "Workspace write" con permessiPerAttrezzo:{shell:\'chiedi\'} NON costruisce chiediApprovazioneFn (ripiego sicuro, non la cura finale)', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero', { permessiScelto: 'Workspace write', permessiPerAttrezzoScelto: { shell: 'chiedi' } });

  assert.equal(finta.ultimoInput.livelloAccesso, undefined, '"Workspace write" non diventa mai lettura da solo');
  assert.equal(finta.ultimoInput.chiediApprovazioneFn, undefined, 'ripiego sicuro: solo "On request" costruisce il canale — shell:\'chiedi\' qui fallirà chiuso nel kernel, mai un\'approvazione che trapela su scrivi');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐ AL CONTRARIO — "Workspace write" con permessiPerAttrezzo SENZA alcun \'chiedi\' (solo sempre/nega) NON costruisce chiediApprovazioneFn', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  registro.avvia('task-vero', { permessiScelto: 'Workspace write', permessiPerAttrezzoScelto: { scrivi: 'sempre', shell: 'nega' } });

  assert.equal(finta.ultimoInput.chiediApprovazioneFn, undefined, 'sempre/nega non hanno bisogno di un canale interattivo: li decide il gate da solo');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

/*
 * ⭐⭐⭐ 28/8 — rispondiApprovazione(): il lato server del ciclo "On
 * request". Un fake avviaSessioneFn che CHIAMA DAVVERO
 * chiediApprovazioneFn (a differenza di sessioneControllabile sopra,
 * che non tocca mai i permessi) — questo prova il giro completo:
 * richiesta → evento ApprovalRequested sul buffer → risposta →
 * la Promise che il kernel starebbe aspettando si sblocca.
 */
function sessioneConApprovazione() {
  let chiediApprovazioneCatturato;
  let onEventoCatturato;
  return {
    avviaSessioneFn: async (input) => {
      onEventoCatturato = input.onEvento;
      chiediApprovazioneCatturato = input.chiediApprovazioneFn;
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      return new Promise(() => {}); // resta sospesa: il test conclude a mano se serve
    },
    get chiediApprovazioneFn() { return chiediApprovazioneCatturato; },
    get onEvento() { return onEventoCatturato; },
  };
}

test('⭐⭐⭐ richiediApprovazione: emette ApprovalRequested con l\'azione VERA, e rispondiApprovazione(true) sblocca la Promise in attesa', async () => {
  const finta = sessioneConApprovazione();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'On request' });

  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));

  const azione = { tipo: 'scrivi', percorso: 'nuovo.txt' };
  const promessaApprovazione = finta.chiediApprovazioneFn(azione);
  await Promise.resolve(); // lascia scorrere il microtask della new Promise dentro richiediApprovazione

  const richiesta = ricevuti.find((e) => e.type === 'ApprovalRequested');
  assert.ok(richiesta, 'deve comparire un ApprovalRequested sul buffer della sessione');
  assert.deepEqual(richiesta.azione, azione);
  assert.equal(typeof richiesta.requestId, 'string');

  const risposta = registro.rispondiApprovazione(sessionId, richiesta.requestId, true);
  assert.deepEqual(risposta, { ok: true });
  assert.equal(await promessaApprovazione, true, 'la Promise che il kernel aspettava si è risolta con la risposta vera');

  const risolta = ricevuti.find((e) => e.type === 'ApprovalResolved');
  assert.ok(risolta, 'un secondo evento chiude il ciclo per un eventuale secondo client in ascolto');
  assert.equal(risolta.requestId, richiesta.requestId);
  assert.equal(risolta.approvato, true);
});

test('⭐⭐ rispondiApprovazione(false) sblocca la Promise con false — un rifiuto vero, non un\'eccezione', async () => {
  const finta = sessioneConApprovazione();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'On request' });

  const ricevuti = [];
  registro.iscriviti(sessionId, (e) => ricevuti.push(e));
  const promessaApprovazione = finta.chiediApprovazioneFn({ tipo: 'shell', comando: 'rm -rf /' });
  await Promise.resolve();

  const richiesta = ricevuti.find((e) => e.type === 'ApprovalRequested');
  registro.rispondiApprovazione(sessionId, richiesta.requestId, false);

  assert.equal(await promessaApprovazione, false);
});

test('⛔⛔⛔ AL CONTRARIO — rispondiApprovazione con un requestId SBAGLIATO/vecchio non risolve NULLA: QUERY_INVALID, la Promise resta sospesa', async () => {
  const finta = sessioneConApprovazione();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto: 'On request' });
  finta.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'x.txt' });
  await Promise.resolve();

  const risultato = registro.rispondiApprovazione(sessionId, 'un-id-che-non-esiste', true);

  assert.equal(risultato.code, 'QUERY_INVALID');
});

test('⛔ AL CONTRARIO — rispondiApprovazione senza NESSUNA richiesta pendente: QUERY_INVALID, non un crash', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = registro.rispondiApprovazione(sessionId, 'qualunque-id', true);

  assert.equal(risultato.code, 'QUERY_INVALID');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⛔ AL CONTRARIO — rispondiApprovazione su un sessionId inesistente: NOT_FOUND', () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const risultato = registro.rispondiApprovazione('mai-esistito', 'qualunque-id', true);
  assert.equal(risultato.code, 'NOT_FOUND');
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

// ⭐⭐⭐ 28/8, owner: "nella lista files devo poter draggare i file... non
// esiste il comando copia... e comandi crud in generale" — stesso schema
// di prova delle quattro azioni sopra.
test('⛔ spostaFile/copiaFile/creaVoceWorkspace su un id inesistente: NOT_FOUND per tutti e tre', async () => {
  const registro = createSessionRegistry({ preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  assert.equal((await registro.spostaFile('mai-esistito', 'a.txt', 'sub')).code, 'NOT_FOUND');
  assert.equal((await registro.copiaFile('mai-esistito', 'a.txt')).code, 'NOT_FOUND');
  assert.equal((await registro.creaVoceWorkspace('mai-esistito', '', 'x.txt', 'file')).code, 'NOT_FOUND');
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

test('⭐⭐ spostaFile passa cartella/percorso/cartellaDestinazione VERI a spostaFileFn e torna il nuovo percorso', async () => {
  const finta = sessioneControllabile();
  let catturato = null;
  const spostaFileFn = async (input) => { catturato = input; return { nuovoPercorso: 'sub/a.txt' }; };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, spostaFileFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = await registro.spostaFile(sessionId, 'a.txt', 'sub');

  assert.deepEqual(catturato, { cartella: '/tmp/x', percorso: 'a.txt', cartellaDestinazione: 'sub' });
  assert.deepEqual(risultato, { ok: true, nuovoPercorso: 'sub/a.txt' });

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⛔ copiaFile: un WorkspaceFileError VERO diventa {erroreAvvio, code}, mai un throw fino all\'HTTP', async () => {
  const finta = sessioneControllabile();
  const copiaFileFn = async () => { throw new WorkspaceFileError('File non trovato', 'FILE_NOT_FOUND'); };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, copiaFileFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = await registro.copiaFile(sessionId, 'mai-esistito.txt');
  assert.deepEqual(risultato, { erroreAvvio: 'File non trovato', code: 'FILE_NOT_FOUND' });

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⭐⭐ creaVoceWorkspace passa cartella/percorsoBase/nome/tipo VERI a creaVoceWorkspaceFn e torna il percorso', async () => {
  const finta = sessioneControllabile();
  let catturato = null;
  const creaVoceWorkspaceFn = async (input) => { catturato = input; return { percorso: 'sub/nuova-cartella' }; };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, creaVoceWorkspaceFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  const risultato = await registro.creaVoceWorkspace(sessionId, 'sub', 'nuova-cartella', 'cartella');

  assert.deepEqual(catturato, { cartella: '/tmp/x', percorsoBase: 'sub', nome: 'nuova-cartella', tipo: 'cartella' });
  assert.deepEqual(risultato, { ok: true, percorso: 'sub/nuova-cartella' });

  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
  await new Promise((r) => setImmediate(r));
});

test('⛔⛔ creaVoceWorkspace: AL CONTRARIO, un errore IMPREVISTO si PROPAGA, mai inghiottito', async () => {
  const finta = sessioneControllabile();
  const creaVoceWorkspaceFn = async () => { throw new Error('bug vero, non un WorkspaceFileError'); };
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, creaVoceWorkspaceFn, modello: 'm', chiave: 'k',
  });
  const { sessionId } = registro.avvia('task-vero');

  await assert.rejects(() => registro.creaVoceWorkspace(sessionId, '', 'x.txt', 'file'), /bug vero, non un WorkspaceFileError/);

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

/*
 * ⭐⭐⭐ FASE C (28/8) — sub-agenti, piano elegant-spinning-dongarra.md.
 * Verifica il FILO INTERO (session-registry → subagent-orchestrator →
 * avviaESegui una SECONDA volta per il figlio → onConclusioneFn
 * sblocca la delega) — la logica pura del solo orchestratore è già
 * provata isolata in subagent-orchestrator.test.mjs; qui si prova che
 * session-registry.mjs lo colleghi per davvero, non che lo dimentichi
 * come successe a `hookFn` prima di FASE A.
 */
test('⭐⭐⭐ onDelega è SEMPRE costruito su avvia() — una funzione vera, anche per una sessione che non delega mai nulla', () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  registro.avvia('task-vero');
  assert.equal(typeof finta.ultimoInput.onDelega, 'function');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐⭐⭐ delega FILO INTERO: onDelega del padre avvia DAVVERO una seconda sessione isolata, e la Promise si sblocca quando la figlia conclude', async () => {
  const finta = sessioneControllabile(); // STESSO fake per padre e figlio: avviaSessioneFn è iniettato una volta sola sul registro, la seconda avviaESegui() (per la delega) lo richiama identico
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  const { sessionId: padreId } = registro.avvia('task-vero');
  const onDelegaDelPadre = finta.ultimoInput.onDelega;

  const promessaDelega = onDelegaDelPadre('scrivi un modulo di test', '/tmp/figlio-isolato');
  // ⛔ dopo questa chiamata, finta.ultimoInput punta al FIGLIO (la seconda chiamata ad avviaSessioneFn) — è la prova che avviaESegui è stato richiamato per davvero, non solo che l'orchestratore ha fatto finta.
  assert.equal(finta.chiamate, 2, 'la delega deve aver richiamato avviaSessioneFn una SECONDA volta, per il figlio');
  assert.equal(finta.ultimoInput.cartella, '/tmp/figlio-isolato', 'la figlia lavora nella SUA cartella, mai in quella del padre');
  assert.notEqual(finta.ultimoInput.cartella, '/tmp/x', 'per chiarezza: /tmp/x è la cartella del padre in questo test');

  finta.concludi({ type: 'RunFinished', threadId: 't2', runId: 'r2' }, { ok: true, esito: { detto: 'Modulo scritto e testato.', comeFinita: 'concluso', messaggiFinali: [] } });
  const esitoDelega = await promessaDelega;
  assert.deepEqual(esitoDelega, { riassunto: 'Modulo scritto e testato.', esito: 'concluso' });

  const figliDelPadre = registro.elencaFigli(padreId);
  assert.equal(figliDelPadre.figli.length, 1, 'il registro riconosce la figlia come figlia DI QUESTO padre, non una sessione slegata');
});

test('⛔⛔⛔ AL CONTRARIO — la cartella della delega deve essere DIVERSA da quella del padre, verificato con la cartella VERA della sessione padre', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });
  registro.avvia('task-vero'); // preparaEsecuzioneFinta: cartella '/tmp/x'
  const onDelegaDelPadre = finta.ultimoInput.onDelega;

  const chiamatePrimaDellaDelega = finta.chiamate;
  const esito = await onDelegaDelPadre('fai qualcosa', '/tmp/x'); // STESSA cartella del padre
  assert.equal(esito.esito, 'rifiutato');
  assert.match(esito.motivo, /diversa da quella del padre/);
  assert.equal(finta.chiamate, chiamatePrimaDellaDelega, 'nessuna seconda sessione avviata per una delega rifiutata');
  finta.concludi({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
});

test('⭐⭐⭐ elencaFigli(): NOT_FOUND su una sessione inesistente, zero figli per una sessione senza deleghe, i figli VERI dopo una delega conclusa', async () => {
  const finta = sessioneControllabile();
  const registro = createSessionRegistry({ avviaSessioneFn: finta.avviaSessioneFn, preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k' });

  assert.deepEqual(registro.elencaFigli('fantasma'), { erroreAvvio: 'Sessione non trovata', code: 'NOT_FOUND' });

  const { sessionId: padreId } = registro.avvia('task-vero');
  assert.deepEqual(registro.elencaFigli(padreId), { ok: true, figli: [] }, 'nessuna delega ancora avvenuta: elenco vero, vuoto — non un errore');

  const onDelegaDelPadre = finta.ultimoInput.onDelega;
  const promessaDelega = onDelegaDelPadre('fai qualcosa di isolato', '/tmp/figlio-isolato');
  const figlioId = [...registro.elenca()].map((s) => s.sessionId).find((id) => id !== padreId);
  finta.concludi({ type: 'RunFinished', threadId: 't2', runId: 'r2' }, { ok: true, esito: { detto: 'fatto', comeFinita: 'concluso', messaggiFinali: [] } });
  await promessaDelega;

  const conFigli = registro.elencaFigli(padreId);
  assert.equal(conFigli.ok, true);
  assert.equal(conFigli.figli.length, 1);
  assert.equal(conFigli.figli[0].sessionId, figlioId);
  assert.equal(conFigli.figli[0].task, 'fai qualcosa di isolato');
  assert.equal(conFigli.figli[0].conclusa, true);
  assert.equal(conFigli.figli[0].esitoDelega, 'concluso');
});
