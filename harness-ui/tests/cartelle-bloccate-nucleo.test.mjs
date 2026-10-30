/*
 * Owner 27/10/2026 — CARTELLE BLOCCATE, tappa B (il nucleo). Contratto CONTRATTO-CARTELLE-BLOCCATE-2026-10-27, giro 2 e revisione 1.
 *
 * Una cartella revocata a un dispositivo e ancora raggiungibile da un'altra consentita è BLOCCATA: nei giri che QUEL dispositivo ha
 * mandato, gli attrezzi dei file non la toccano (il nega vince, Accesso pieno compreso, nessuna carta). Come Claude Code («Deny rules
 * apply when either the requested path or the file it resolves to matches») e Hermes (`agent/file_safety.py:280-305`, realpath e
 * prefisso col separatore). ⛔ La shell si ferma solo quando NOMINA la cartella: il limite è dichiarato, e una prova lo tiene vero.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, existsSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { bloccataDa, comandoNominaUnaBloccata } from '../src/path-policy.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { togliConfiniDati } from '../src/kernel/confine-dati.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const suWindows = process.platform === 'win32';

function banco(t) {
  const cartella = realpathSync(mkdtempSync(join(tmpdir(), 'talos-bloccate-')));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'libero.txt'), 'LIBERO_OK');
  mkdirSync(join(cartella, 'Documenti'));
  writeFileSync(join(cartella, 'Documenti', 'segreto.txt'), 'SEGRETO_TOKEN_42');
  mkdirSync(join(cartella, 'Documenti2'));
  writeFileSync(join(cartella, 'Documenti2', 'vicino.txt'), 'VICINO_TOKEN_42');
  return { cartella, bloccata: join(cartella, 'Documenti') };
}

/* Un giro vero del kernel: il modello chiama gli attrezzi dati, poi chiude. Torna gli esiti per id di chiamata. */
async function giro(cartella, chiamate, opzioni = {}) {
  const richieste = [];
  const fetch = async (url, o) => {
    richieste.push(JSON.parse(o.body));
    const risposta = richieste.length === 1
      ? { role: 'assistant', content: null, tool_calls: chiamate.map((c, i) => ({ id: `call_${i}`, type: 'function', function: { name: c.nome, arguments: JSON.stringify(c.argomenti) } })) }
      : { role: 'assistant', content: 'fatto', tool_calls: [] };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: risposta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
  };
  await talosLavora({ cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete: fetch, livelloAccesso: 'accesso-pieno', ...opzioni });
  const esiti = new Map();
  for (const m of richieste[1]?.messages ?? []) if (m.role === 'tool') esiti.set(m.tool_call_id, togliConfiniDati(String(m.content)));
  return esiti;
}

test('BLOC-B-01 la funzione: dentro e uguale sì, la cartella vicina col nome che comincia uguale no', (t) => {
  const { cartella, bloccata } = banco(t);
  const bloccati = [bloccata];
  assert.equal(bloccataDa('Documenti/segreto.txt', { cartella, bloccati })?.radice, bloccata);
  assert.equal(bloccataDa('Documenti', { cartella, bloccati })?.radice, bloccata);
  assert.equal(bloccataDa(join(bloccata, 'segreto.txt'), { cartella, bloccati })?.radice, bloccata);
  assert.equal(bloccataDa('Documenti2/vicino.txt', { cartella, bloccati }), null, '«Documenti2» non sta dentro «Documenti»');
  assert.equal(bloccataDa('libero.txt', { cartella, bloccati }), null);
  assert.equal(bloccataDa('Documenti/segreto.txt', { cartella, bloccati: [] }), null, 'senza blocchi, niente');
  assert.equal(bloccataDa('Documenti/nuovo-che-non-c-e.txt', { cartella, bloccati })?.radice, bloccata, 'un file nuovo sotto una bloccata');
});

test('BLOC-B-02 la funzione: maiuscole, barra finale e barre in avanti non la aggirano (Windows)', { skip: !suWindows && 'solo Windows' }, (t) => {
  const { cartella, bloccata } = banco(t);
  const bloccati = [`${bloccata}\\`];
  assert.ok(bloccataDa('DOCUMENTI/SEGRETO.TXT', { cartella, bloccati }), 'le maiuscole su Windows sono lo stesso file');
  assert.ok(bloccataDa(bloccata.replaceAll('\\', '/').toUpperCase(), { cartella, bloccati }));
  assert.ok(bloccataDa('Documenti\\', { cartella, bloccati: [bloccata] }));
});

test('BLOC-B-03 la funzione: una giunzione dentro la cartella che porta a quella bloccata è bloccata (percorso vero)', (t) => {
  const { cartella, bloccata } = banco(t);
  symlinkSync(bloccata, join(cartella, 'scorciatoia'), 'junction');
  assert.equal(bloccataDa('scorciatoia/segreto.txt', { cartella, bloccati: [bloccata] })?.radice, bloccata);
  /* al contrario: la giunzione verso una cartella libera passa */
  symlinkSync(join(cartella, 'Documenti2'), join(cartella, 'altra'), 'junction');
  assert.equal(bloccataDa('altra/vicino.txt', { cartella, bloccati: [bloccata] }), null);
});

test('BLOC-B-04 la funzione della shell: nomina ⇒ sì; arriva senza nominarla ⇒ no (limite dichiarato)', (t) => {
  const { cartella, bloccata } = banco(t);
  const bloccati = [bloccata];
  assert.ok(comandoNominaUnaBloccata('type Documenti\\segreto.txt', { cartella, bloccati }));
  assert.ok(comandoNominaUnaBloccata('cat ./Documenti/segreto.txt | head', { cartella, bloccati }));
  assert.ok(comandoNominaUnaBloccata('dir Documenti', { cartella, bloccati }), 'il nome nudo di una cartella che c\'è');
  assert.equal(comandoNominaUnaBloccata('dir Documenti2', { cartella, bloccati }), null);
  assert.equal(comandoNominaUnaBloccata('grep -r SEGRETO .', { cartella, bloccati }), null, 'LIMITE: dalla cartella sopra non si vede');
  assert.equal(comandoNominaUnaBloccata('echo ciao', { cartella, bloccati }), null);
});

test('BLOC-B-05 il kernel: leggi, scrivi, file_edit ed elenca dentro la bloccata si rifiutano in Accesso pieno; la vicina passa', async (t) => {
  const { cartella, bloccata } = banco(t);
  const esiti = await giro(cartella, [
    { nome: 'leggi', argomenti: { percorso: 'Documenti/segreto.txt' } },
    { nome: 'scrivi', argomenti: { percorso: 'Documenti/nuovo.txt', contenuto: 'x' } },
    { nome: 'file_edit', argomenti: { percorso: 'Documenti/segreto.txt', old_string: 'SEGRETO', new_string: 'ROTTO' } },
    { nome: 'elenca', argomenti: { percorso: 'Documenti' } },
    { nome: 'leggi', argomenti: { percorso: 'Documenti2/vicino.txt' } },
  ], { percorsiBloccatiFn: async () => [bloccata] });
  for (const id of ['call_0', 'call_1', 'call_2', 'call_3']) {
    assert.match(esiti.get(id), /^REFUSED\. Nothing was \w+: .*blocked for the device that sent this turn/u, id);
    assert.doesNotMatch(esiti.get(id), /SEGRETO_TOKEN_42/u, `${id}: il contenuto non esce`);
  }
  assert.equal(existsSync(join(bloccata, 'nuovo.txt')), false, 'niente scritto');
  assert.equal(readFileSync(join(bloccata, 'segreto.txt'), 'utf8'), 'SEGRETO_TOKEN_42', 'niente cambiato');
  assert.match(esiti.get('call_4'), /VICINO_TOKEN_42/u, 'la cartella vicina si legge');
});

test('BLOC-B-06 il kernel: elenca dalla radice nomina la bloccata ma non ci entra; cerca non la guarda e lo dice', async (t) => {
  const { cartella, bloccata } = banco(t);
  const esiti = await giro(cartella, [
    { nome: 'elenca', argomenti: { percorso: '', depth: 3 } },
    { nome: 'cerca', argomenti: { testo: 'TOKEN_42' } },
    { nome: 'cerca', argomenti: { nome: 'segreto' } },
  ], { percorsiBloccatiFn: async () => [bloccata] });
  assert.match(esiti.get('call_0'), /Documenti\/ \(blocked for this device\)/u);
  assert.doesNotMatch(esiti.get('call_0'), /segreto\.txt/u, 'i figli della bloccata non si elencano');
  assert.match(esiti.get('call_0'), /vicino\.txt/u);
  assert.doesNotMatch(esiti.get('call_1'), /segreto\.txt/u, 'cerca non apre la bloccata');
  assert.match(esiti.get('call_1'), /vicino\.txt/u);
  assert.match(esiti.get('call_1'), /1 folder blocked for the device that sent this turn was not searched/u);
  assert.doesNotMatch(esiti.get('call_2'), /segreto\.txt/u, 'nemmeno per nome');
});

test('BLOC-B-07 il kernel: attraverso una giunzione dentro la cartella della sessione si rifiuta lo stesso', async (t) => {
  const { cartella, bloccata } = banco(t);
  symlinkSync(bloccata, join(cartella, 'scorciatoia'), 'junction');
  const esiti = await giro(cartella, [
    { nome: 'leggi', argomenti: { percorso: 'scorciatoia/segreto.txt' } },
    { nome: 'cerca', argomenti: { testo: 'TOKEN_42' } },
  ], { percorsiBloccatiFn: async () => [bloccata] });
  assert.match(esiti.get('call_0'), /^REFUSED\./u);
  assert.doesNotMatch(esiti.get('call_0'), /SEGRETO_TOKEN_42/u);
  assert.doesNotMatch(esiti.get('call_1'), /scorciatoia\/segreto\.txt/u, 'la ricerca non passa dalla giunzione');
});

test('BLOC-B-08 il kernel: la shell che nomina la bloccata non parte; una che non la nomina gira (limite dichiarato nella frase)', async (t) => {
  const { cartella, bloccata } = banco(t);
  const leggiComando = suWindows ? 'type Documenti\\segreto.txt' : 'cat Documenti/segreto.txt';
  const esiti = await giro(cartella, [
    { nome: 'shell', argomenti: { comando: leggiComando } },
    { nome: 'shell', argomenti: { comando: 'echo CIAO_LIBERO' } },
  ], { percorsiBloccatiFn: async () => [bloccata] });
  assert.match(esiti.get('call_0'), /blocked for the device that sent this turn/u);
  assert.match(esiti.get('call_0'), /a command that reaches the folder without naming it is not stopped/u, 'il limite è detto al modello');
  assert.doesNotMatch(esiti.get('call_0'), /SEGRETO_TOKEN_42/u);
  assert.match(esiti.get('call_1'), /CIAO_LIBERO/u);
});

test('BLOC-B-09 il kernel: blocchi illeggibili ⇒ nessun file si tocca (chiuso a guasto)', async (t) => {
  const { cartella } = banco(t);
  const esiti = await giro(cartella, [
    { nome: 'leggi', argomenti: { percorso: 'libero.txt' } },
  ], { percorsiBloccatiFn: async () => { throw Object.assign(new Error('x'), { code: 'REMOTE_CONSENTS_UNREADABLE' }); } });
  assert.match(esiti.get('call_0'), /REMOTE_CONSENTS_UNREADABLE/u);
  assert.doesNotMatch(esiti.get('call_0'), /LIBERO_OK/u);
});

test('BLOC-B-10 al contrario: senza la funzione (la persona al PC) tutto come prima, anche dentro «Documenti»', async (t) => {
  const { cartella } = banco(t);
  const esiti = await giro(cartella, [
    { nome: 'leggi', argomenti: { percorso: 'Documenti/segreto.txt' } },
    { nome: 'elenca', argomenti: { percorso: '', depth: 3 } },
  ]);
  assert.match(esiti.get('call_0'), /SEGRETO_TOKEN_42/u);
  assert.match(esiti.get('call_1'), /segreto\.txt/u);
  assert.doesNotMatch(esiti.get('call_1'), /blocked/u);
});

test('BLOC-B-11 una revoca a metà giro conta dall\'attrezzo dopo (la funzione si rilegge a ogni attrezzo)', async (t) => {
  const { cartella, bloccata } = banco(t);
  const elenco = [];
  const richieste = [];
  const fetch = async (url, o) => {
    richieste.push(JSON.parse(o.body));
    const n = richieste.length;
    if (n === 2) elenco.push(bloccata); // la persona revoca fra il primo e il secondo attrezzo
    const risposta = n <= 2
      ? { role: 'assistant', content: null, tool_calls: [{ id: `call_${n}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: 'Documenti/segreto.txt' }) } }] }
      : { role: 'assistant', content: 'fatto', tool_calls: [] };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: risposta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
  };
  await talosLavora({ cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete: fetch, livelloAccesso: 'accesso-pieno', percorsiBloccatiFn: async () => elenco });
  const esito = (n) => togliConfiniDati(String(richieste.at(-1).messages.find((m) => m.role === 'tool' && m.tool_call_id === `call_${n}`)?.content));
  assert.match(esito(1), /SEGRETO_TOKEN_42/u, 'prima della revoca si legge');
  assert.match(esito(2), /^REFUSED\./u, 'dopo, no');
});

test('BLOC-B-12 senza ripgrep (la camminata JS, forzata con TALOS_RG_PATH come in T-13-08) la bloccata non si legge, nemmeno da una giunzione', async (t) => {
  const { cartella, bloccata } = banco(t);
  symlinkSync(bloccata, join(cartella, 'scorciatoia'), 'junction');
  const prima = process.env.TALOS_RG_PATH;
  process.env.TALOS_RG_PATH = join(tmpdir(), 'rg-inesistente-per-bloccate.exe');
  t.after(() => { if (prima === undefined) delete process.env.TALOS_RG_PATH; else process.env.TALOS_RG_PATH = prima; });
  const esiti = await giro(cartella, [
    { nome: 'cerca', argomenti: { testo: 'TOKEN_42' } },
  ], { percorsiBloccatiFn: async () => [bloccata] });
  assert.doesNotMatch(esiti.get('call_0'), /segreto\.txt/u, 'né diretta né attraverso la giunzione');
  assert.match(esiti.get('call_0'), /vicino\.txt/u);
});

/*
 * K1 e K2 (CLI, 27/10/2026, prova dal vivo col Pad): il rifiuto anticipato della cartella bloccata tornava solo testo — nessuna ricevuta
 * e nessun `isError`: la CLI diceva «● edited 1 file» e la carta del telefono nessun rifiuto. E la frase nominava i menu del desktop.
 */
test('BLOC-K1-01 scrivi e file_edit dentro la bloccata: ricevuta «denied» via «cartella-bloccata», e l\'attrezzo è un errore; la frase non nomina menu', async (t) => {
  const { cartella, bloccata } = banco(t);
  const eventi = [];
  const esiti = await giro(cartella, [
    { nome: 'scrivi', argomenti: { percorso: 'Documenti/nuovo.txt', contenuto: 'NO' } },
    { nome: 'file_edit', argomenti: { percorso: 'Documenti/segreto.txt', old_string: 'SEGRETO', new_string: 'X' } },
    { nome: 'leggi', argomenti: { percorso: 'Documenti/segreto.txt' } },
    { nome: 'scrivi', argomenti: { percorso: 'libero-nuovo.txt', contenuto: 'SI' } },
  ], { percorsiBloccatiFn: async () => [bloccata], onGiro: (e) => eventi.push(e) });
  const ricevute = new Map(eventi.filter((e) => e.tipo === 'ricevuta').map((e) => [e.ricevuta.toolCallId, e.ricevuta]));
  const esitiTool = new Map(eventi.filter((e) => e.tipo === 'tool-esito').map((e) => [e.toolCallId, e]));
  for (const id of ['call_0', 'call_1']) {
    const r = ricevute.get(id);
    assert.ok(r, `${id}: una ricevuta c'è`);
    assert.equal(r.status, 'denied', `${id}: rifiutata, non riuscita`);
    assert.equal(r.consentito, false);
    assert.equal(r.via, 'cartella-bloccata');
    assert.match(String(r.motivo), /blocked for the device/u);
    assert.equal(esitiTool.get(id)?.isError, true, `${id}: l'attrezzo è un errore`);
  }
  assert.equal(esitiTool.get('call_2')?.isError, true, 'la lettura rifiutata è un errore anche senza ricevuta');
  assert.equal(existsSync(join(bloccata, 'nuovo.txt')), false, 'niente sul disco');
  assert.equal(readFileSync(join(bloccata, 'segreto.txt'), 'utf8'), 'SEGRETO_TOKEN_42');
  /* AL CONTRARIO: fuori dalla bloccata la scrittura riesce con la sua ricevuta di successo */
  assert.equal(ricevute.get('call_3')?.status, 'succeeded');
  assert.notEqual(esitiTool.get('call_3')?.isError, true);
  /* K2: la frase è dell'ospite qualunque, non del desktop */
  assert.match(esiti.get('call_0'), /in that device's remote folders/u);
  assert.doesNotMatch(esiti.get('call_0'), /⋯|Remote devices →/u);
});
