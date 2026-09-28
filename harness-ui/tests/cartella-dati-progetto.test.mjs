/*
 * ⭐⭐⭐ PO-26 (owner 16/09/2026 «PO-26 si», 24/09/2026 «PO-26 intera, adesso») — Libreria e Ricerca di un progetto
 *   vivono nella cartella dati dell'app, non nel progetto; ciò che le versioni precedenti avevano lasciato nel progetto si
 *   sposta da solo. Nato dalla sessione `f2424a97…`, che ha lasciato `.harness-ui-library` e `.harness-ui-research` sul
 *   Desktop dell'owner.
 * Fonti: anthropics/claude-code #35162 (la codifica del percorso collide: `spec-rl` e `spec/rl`), #40946 (percorsi non
 *   ASCII); OpenCode `packages/opencode/src/project/project.ts` (identificativo stabile per progetto); Node `fs.rename`
 *   (EXDEV fra dischi) e `fs.cp` — letti il 24/09/2026.
 * Ogni prova che conta ha il suo verso contrario: la migrazione NON sovrascrive, NON segue una giunzione, NON toglie
 *   l'originale se la copia non coincide.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  CARTELLA_PROGETTI, creaCartellaDatiProgetto, migraDatiGenerati, nomeCartellaProgetto, NOMI_DATI_GENERATI,
} from '../src/cartella-dati-progetto.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { CARTELLA_LIBRERIA } from '../src/library-store.mjs';
import { CARTELLA_RICERCA, creaRicerca, percorsoRapporto } from '../src/research-store.mjs';
import { creaResearchOrchestrator } from '../src/research-orchestrator.mjs';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';

/* ─────────────────────────── il nome della cartella ─────────────────────────── */

test('PO26-NAME-READABLE: il nome è lo slug del percorso più un\'impronta di 10 caratteri', () => {
  const nome = nomeCartellaProgetto('C:\\Users\\Persona\\Desktop', { piattaforma: 'win32' });
  assert.match(nome, /^C--Users-Persona-Desktop-[0-9a-f]{10}$/u);
});

test('PO26-NAME-NO-COLLISION: al contrario di Claude Code (#35162), `spec-rl` e `spec/rl` NON diventano lo stesso progetto', () => {
  const a = nomeCartellaProgetto('/home/u/progetto/spec-rl', { piattaforma: 'linux' });
  const b = nomeCartellaProgetto('/home/u/progetto/spec/rl', { piattaforma: 'linux' });
  assert.equal(a.replace(/-[0-9a-f]{10}$/u, ''), b.replace(/-[0-9a-f]{10}$/u, ''), 'lo slug da solo collide, come in Claude Code');
  assert.notEqual(a, b, 'l\'impronta li separa');
});

test('PO26-NAME-CASE: su Windows due grafie dello stesso percorso sono lo stesso progetto; su Linux no', () => {
  const impronta = (n) => n.slice(-10);
  assert.equal(impronta(nomeCartellaProgetto('C:\\Users\\X\\Desktop', { piattaforma: 'win32' })), impronta(nomeCartellaProgetto('c:\\users\\x\\desktop', { piattaforma: 'win32' })));
  assert.notEqual(nomeCartellaProgetto('/home/X', { piattaforma: 'linux' }), nomeCartellaProgetto('/home/x', { piattaforma: 'linux' }));
  assert.equal(nomeCartellaProgetto('C:\\Users\\X\\', { piattaforma: 'win32' }), nomeCartellaProgetto('C:\\Users\\X', { piattaforma: 'win32' }), 'il separatore in coda non fa un altro progetto');
});

test('PO26-NAME-LONG: un percorso lungo tiene la CODA (le cartelle vicine al progetto) e resta corto', () => {
  const lungo = `C:\\${'cartella-molto-lunga\\'.repeat(12)}il-mio-progetto`;
  const nome = nomeCartellaProgetto(lungo, { piattaforma: 'win32' });
  assert.ok(nome.length <= 48 + 11, `nome di ${nome.length} caratteri`);
  assert.match(nome, /il-mio-progetto-[0-9a-f]{10}$/u);
  assert.match(nomeCartellaProgetto('C:\\', { piattaforma: 'win32' }), /^C-[0-9a-f]{10}$/u, 'la radice del disco ha un nome, non una stringa vuota');
});

/* ─────────────────────────── la migrazione, su disco vero ─────────────────────────── */

function progettoConDati() {
  const progetto = cartellaDiProva('talos-po26-progetto-');
  mkdirSync(join(progetto, CARTELLA_LIBRERIA, 'lib-1'), { recursive: true });
  writeFileSync(join(progetto, CARTELLA_LIBRERIA, 'lib-1', 'contenuto'), 'il file della libreria');
  writeFileSync(join(progetto, CARTELLA_LIBRERIA, 'politica.json'), '{"mode":"ask"}');
  mkdirSync(join(progetto, CARTELLA_RICERCA, 'ric-1', 'fonti'), { recursive: true });
  writeFileSync(join(progetto, CARTELLA_RICERCA, 'ric-1', 'rapporto.md'), '# rapporto');
  writeFileSync(join(progetto, CARTELLA_RICERCA, 'ric-1', 'fonti', 'a.txt'), 'una fonte');
  writeFileSync(join(progetto, 'codice.js'), 'il progetto della persona');
  return progetto;
}

test('PO26-MIGRATE-MOVES: le due cartelle lasciano il progetto e arrivano identiche; il resto del progetto non si tocca', async () => {
  const progetto = progettoConDati();
  const destinazione = join(cartellaDiProva('talos-po26-dati-'), 'progetto-x');
  const r = await migraDatiGenerati({ progetto, destinazione });
  assert.deepEqual(r.spostate, [CARTELLA_LIBRERIA, CARTELLA_RICERCA]);
  assert.deepEqual(r.errori, []);
  assert.deepEqual(readdirSync(progetto), ['codice.js'], 'nella radice del progetto non resta nessuna cartella nostra');
  assert.equal(readFileSync(join(destinazione, CARTELLA_LIBRERIA, 'lib-1', 'contenuto'), 'utf8'), 'il file della libreria');
  assert.equal(readFileSync(join(destinazione, CARTELLA_RICERCA, 'ric-1', 'fonti', 'a.txt'), 'utf8'), 'una fonte');
  const seconda = await migraDatiGenerati({ progetto, destinazione });
  assert.deepEqual([seconda.spostate, seconda.unite, seconda.errori], [[], [], []], 'la seconda volta non c\'è niente da fare');
});

test('PO26-MIGRATE-MERGE-NEVER-OVERWRITES: con la destinazione già piena si fonde voce per voce; un conflitto resta nel progetto', async () => {
  const progetto = progettoConDati();
  mkdirSync(join(progetto, CARTELLA_LIBRERIA, 'lib-2'), { recursive: true });
  writeFileSync(join(progetto, CARTELLA_LIBRERIA, 'lib-2', 'contenuto'), 'versione del progetto');
  const destinazione = cartellaDiProva('talos-po26-dati-');
  mkdirSync(join(destinazione, CARTELLA_LIBRERIA, 'lib-2'), { recursive: true });
  writeFileSync(join(destinazione, CARTELLA_LIBRERIA, 'lib-2', 'contenuto'), 'versione già nei dati');
  writeFileSync(join(destinazione, CARTELLA_LIBRERIA, 'politica.json'), '{"mode":"ask"}');
  const r = await migraDatiGenerati({ progetto, destinazione });
  assert.deepEqual(r.unite, [`${CARTELLA_LIBRERIA}/lib-1`]);
  assert.deepEqual(r.doppioni, [`${CARTELLA_LIBRERIA}/politica.json`], 'identico byte per byte: la copia nel progetto era un doppione');
  assert.deepEqual(r.conflitti, [`${CARTELLA_LIBRERIA}/lib-2`]);
  assert.equal(readFileSync(join(destinazione, CARTELLA_LIBRERIA, 'lib-2', 'contenuto'), 'utf8'), 'versione già nei dati', 'MAI sovrascritto');
  assert.equal(readFileSync(join(progetto, CARTELLA_LIBRERIA, 'lib-2', 'contenuto'), 'utf8'), 'versione del progetto', 'il conflitto resta dov\'era');
  assert.deepEqual(readdirSync(join(progetto, CARTELLA_LIBRERIA)), ['lib-2']);
  assert.deepEqual(r.spostate, [CARTELLA_RICERCA], 'la Ricerca non c\'era nei dati: si sposta intera');
});

test('PO26-MIGRATE-EXDEV: fra dischi diversi si copia, si verifica e solo dopo si toglie l\'originale', async () => {
  const progetto = progettoConDati();
  const destinazione = cartellaDiProva('talos-po26-dati-');
  const renameFn = async () => { throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' }); };
  const r = await migraDatiGenerati({ progetto, destinazione }, { renameFn });
  assert.deepEqual(r.spostate, NOMI_DATI_GENERATI);
  assert.deepEqual(r.errori, []);
  assert.deepEqual(readdirSync(progetto), ['codice.js']);
  assert.equal(readFileSync(join(destinazione, CARTELLA_RICERCA, 'ric-1', 'rapporto.md'), 'utf8'), '# rapporto');
});

test('PO26-MIGRATE-BAD-COPY: al contrario, una copia che non coincide si butta e l\'originale resta intatto', async () => {
  const progetto = progettoConDati();
  const destinazione = cartellaDiProva('talos-po26-dati-');
  const renameFn = async () => { throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }); };
  const cpFn = async (_da, a) => { mkdirSync(a, { recursive: true }); writeFileSync(join(a, 'mezza-copia'), 'x'); };
  const r = await migraDatiGenerati({ progetto, destinazione }, { renameFn, cpFn });
  assert.deepEqual(r.spostate, []);
  assert.equal(r.errori.length, 2);
  assert.ok(r.errori.every((e) => e.codice === 'PO26_COPIA_DIVERSA'));
  assert.equal(readFileSync(join(progetto, CARTELLA_LIBRERIA, 'lib-1', 'contenuto'), 'utf8'), 'il file della libreria', 'l\'originale è intatto');
  assert.equal(existsSync(join(destinazione, CARTELLA_LIBRERIA)), false, 'la copia sbagliata non resta nei dati');
});

test('PO26-MIGRATE-NO-JUNCTION: una giunzione (o un collegamento) non si segue mai: si salta e si dice', async () => {
  const progetto = cartellaDiProva('talos-po26-progetto-');
  const altrove = cartellaDiProva('talos-po26-altrove-');
  writeFileSync(join(altrove, 'non-nostro.txt'), 'di qualcun altro');
  symlinkSync(altrove, join(progetto, CARTELLA_LIBRERIA), 'junction');
  const destinazione = cartellaDiProva('talos-po26-dati-');
  const r = await migraDatiGenerati({ progetto, destinazione });
  assert.deepEqual(r.spostate, []);
  assert.deepEqual(r.saltate.map((s) => s.motivo), ['collegamento']);
  assert.equal(readFileSync(join(altrove, 'non-nostro.txt'), 'utf8'), 'di qualcun altro');
  assert.equal(existsSync(join(destinazione, CARTELLA_LIBRERIA)), false);
});

test('PO26-MIGRATE-SAME-PLACE: se la cartella dati È il progetto (il default dei test) non si muove niente', async () => {
  const progetto = progettoConDati();
  const r = await migraDatiGenerati({ progetto, destinazione: progetto });
  assert.deepEqual([r.spostate, r.unite, r.errori], [[], [], []]);
  assert.ok(existsSync(join(progetto, CARTELLA_LIBRERIA, 'lib-1', 'contenuto')));
});

/* ─────────────────────────── la funzione del server ─────────────────────────── */

test('PO26-ONCE-PER-PROJECT: chiamate concorrenti sullo stesso progetto aspettano UNA migrazione, e tutte la stessa radice', async () => {
  const progetto = progettoConDati();
  const radiceDati = join(cartellaDiProva('talos-po26-app-'), CARTELLA_PROGETTI);
  let migrazioni = 0;
  const rapporti = [];
  const cartellaDati = creaCartellaDatiProgetto({ radiceDati, onMigrazione: (r) => rapporti.push(r) }, {
    migraFn: async (arg) => { migrazioni += 1; return migraDatiGenerati(arg); },
  });
  const radici = await Promise.all([cartellaDati(progetto), cartellaDati(progetto), cartellaDati(`${progetto}/`)]);
  assert.equal(migrazioni, 1);
  assert.equal(new Set(radici).size, 1);
  assert.ok(radici[0].startsWith(radiceDati));
  assert.ok(existsSync(join(radici[0], CARTELLA_LIBRERIA, 'lib-1', 'contenuto')), 'i dati sono arrivati prima che la promessa si risolvesse');
  assert.equal(rapporti.length, 1, 'il rapporto va nel terminale del server una volta');
  assert.deepEqual(readdirSync(progetto), ['codice.js']);
});

/* ─────────────────────────── il registro ─────────────────────────── */

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/progetti/talos', comandoProva: 'npm test', task: { id: taskId, consegna: 'fai' } };
}
function registroCon(opzioni) {
  const giri = [];
  const registro = createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: preparaEsecuzioneFinta,
    avviaSessioneFn(input) {
      giri.push(input);
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
      return new Promise(() => {});
    },
    ...opzioni,
  });
  return { registro, giri };
}

test('PO26-REGISTRY-LIBRARY: la Libreria di una sessione si legge dalla cartella dati del progetto', async () => {
  const chieste = [];
  const lette = [];
  const { registro } = registroCon({
    cartellaDatiProgettoFn: async (c) => { chieste.push(c); return '/dati/.workspaces/talos-0123456789'; },
    elencaVociRegistroFn: async ({ cartella }) => { lette.push(cartella); return []; },
  });
  const { sessionId } = registro.avvia('task-vero');
  const esito = await registro.elencaLibreria(sessionId);
  assert.equal(esito.ok, true);
  assert.deepEqual(lette, ['/dati/.workspaces/talos-0123456789']);
  assert.deepEqual(chieste, ['/progetti/talos']);
});

/*
 * ⛔ Niente prova «Full access allarga la cartella»: da W0-08 `avvia` e `avviaLibero` passano `cartellaGiaScelta:true`
 *   e la cartella effettiva resta quella scelta. L'allargamento sopravvive solo nelle sessioni vecchie ripristinate;
 *   per quelle `datiDi` legge `cartellaBase`, che è la stessa chiave usata da PO26-REGISTRY-LIBRARY qui sopra.
 */
test('PO26-REGISTRY-GIRO: il giro riceve la cartella dati come FUNZIONE, e parte senza aspettarla', async () => {
  let risolvi;
  const { registro, giri } = registroCon({ cartellaDatiProgettoFn: () => new Promise((r) => { risolvi = r; }) });
  registro.avvia('task-vero');
  assert.equal(giri.length, 1, 'il giro è partito anche se la cartella dati non è ancora nota');
  assert.equal(typeof giri[0].cartellaDatiProgettoFn, 'function');
  const promessa = giri[0].cartellaDatiProgettoFn();
  await new Promise((r) => setImmediate(r));
  risolvi('/dati/y');
  assert.equal(await promessa, '/dati/y');
});

test('PO26-REGISTRY-STARTUP: all\'avvio si prepara la cartella dati di ogni progetto noto, una volta per progetto', async () => {
  const chieste = [];
  const { registro } = registroCon({ cartellaDatiProgettoFn: async (c) => { chieste.push(c); return '/dati/z'; } });
  registro.avvia('task-vero');
  registro.avvia('task-vero');
  assert.equal(await registro.preparaCartelleDati(), 1);
  assert.deepEqual(chieste, ['/progetti/talos']);
});

/* ─────────────────────────── il kernel: il deposito del rapporto ─────────────────────────── */

function reteDiRisposte(...risposte) {
  const chiamate = [];
  return {
    chiamate,
    fetch: async (_url, opzioni) => {
      const scelta = risposte[Math.min(chiamate.length, risposte.length - 1)];
      chiamate.push({ corpo: JSON.parse(opzioni.body) });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
    },
  };
}
const chiamataDeposito = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'research_deposit', arguments: JSON.stringify({ testo: '# Rapporto\n\nUna frase.' }) } }] };
const CONCLUSO = { role: 'assistant', content: 'fatto', tool_calls: [] };

test('PO26-KERNEL-DEPOSIT: con `cartellaRicerche` il rapporto va nella cartella dati, e nel progetto non nasce niente', async () => {
  const progetto = cartellaDiProva('talos-po26-kernel-');
  const dati = cartellaDiProva('talos-po26-kernel-dati-');
  const rete = reteDiRisposte(chiamataDeposito, CONCLUSO);
  await talosLavora({
    cartella: progetto, task: { consegna: 'ricerca', ricercaId: 'ric-1' }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'], cartellaRicerche: async () => dati,
  });
  const risposta = rete.chiamate[1].corpo.messages.find((m) => m.role === 'tool').content;
  assert.match(risposta, /^deposited:/u);
  assert.equal(readFileSync(percorsoRapporto(dati, 'ric-1'), 'utf8'), '# Rapporto\n\nUna frase.');
  assert.deepEqual(readdirSync(progetto), [], 'la radice del progetto resta vuota');
});

test('PO26-KERNEL-DEPOSIT-DEFAULT: al contrario, senza `cartellaRicerche` il rapporto va nel progetto come prima (banco, mobile)', async () => {
  const progetto = cartellaDiProva('talos-po26-kernel-');
  const rete = reteDiRisposte(chiamataDeposito, CONCLUSO);
  await talosLavora({
    cartella: progetto, task: { consegna: 'ricerca', ricercaId: 'ric-1' }, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
    livelloAccesso: 'ricerca', strumentiEstesi: ['research_deposit'],
  });
  assert.equal(readFileSync(percorsoRapporto(progetto, 'ric-1'), 'utf8'), '# Rapporto\n\nUna frase.');
});

/* ─────────────────────────── l'orchestratore della ricerca ─────────────────────────── */

test('PO26-RESEARCH-START: la sessione della ricerca lavora nel PROGETTO, i suoi file nascono nella cartella dati', async () => {
  const dati = cartellaDiProva('talos-po26-ric-dati-');
  const avviate = [];
  const sessioni = new Map();
  const orchestratore = creaResearchOrchestrator({
    sessioni,
    avviaESeguiFn: (arg) => { avviate.push(arg); sessioni.set(arg.sessionId, { cartella: arg.cartella, conclusa: false, controller: new AbortController() }); return { sessionId: arg.sessionId }; },
    creaRicercaFn: creaRicerca,
    randomUUIDFn: () => '11111111-2222-3333-4444-555555555555',
  });
  const esito = await orchestratore.avvia({ cartella: dati, cartellaLavoro: '/progetti/talos', question: 'Quanti abitanti ha Vienna?', depth: 'quick' });
  assert.equal(esito.ok, true);
  assert.equal(avviate[0].cartella, '/progetti/talos');
  assert.ok(existsSync(join(dati, CARTELLA_RICERCA, '11111111-2222-3333-4444-555555555555')), 'metadata, giornale e piano nella cartella dati');
});

test('PO26-RESEARCH-PAUSE: la pausa scrive il giornale nella cartella dati che il registro indica, non in quella di lavoro', async () => {
  const chieste = [];
  const scritte = [];
  const voce = { cartella: '/progetti/talos', conclusa: false, controller: new AbortController() };
  const orchestratore = creaResearchOrchestrator({
    sessioni: new Map([['ric-1', voce]]),
    avviaESeguiFn: () => ({}),
    cartellaDatiDiVoceFn: async (v) => { chieste.push(v); return '/dati/talos'; },
    accodaEventoFn: async ({ cartella, evento }) => { scritte.push([cartella, evento.kind]); },
  });
  assert.equal(orchestratore.mettiInPausa({ id: 'ric-1' }).ok, true, 'resta sincrona per contratto col kernel');
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(chieste, [voce]);
  assert.deepEqual(scritte, [['/dati/talos', 'run_pause_requested']]);
});
