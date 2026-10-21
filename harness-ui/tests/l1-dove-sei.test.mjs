/*
 * L1 motore locale (owner 20/10/2026 sera, «Percorso vero a tutti» e «dire dove girano») — la nota «dove sei», gli alias del
 * percorso e i nomi vicini di `elenca`. Il difetto è quello della sessione `e00ae242`: LFM2.5 non sapeva dove fosse e ha provato
 * `/`, `/Desktop` e `/workspace`. Le prove guardano ANCHE il verso contrario: spento di serie (CLI, banco), un percorso che
 * esiste davvero non si riscrive, e un alias decide esattamente come il percorso relativo che produce (CLI, Voce 213).
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import test from 'node:test';

import { SEGNO_NOTA_DOVE, aliasDelPercorso, argomentiConAlias, notaDoveSei, ultimaNotaDove } from '../src/kernel/dove-sei.mjs';
import { ALIAS_PERCORSO, talosLavora } from '../src/kernel/talosHarness.mjs';
import { correggiMessaggiDesktop, correggiEsitoToolDesktop, nomiViciniNellaCartella } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const chiamata = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } });
const rispostaDi = (message) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message }] }), text: async () => '' });
const nessuno = () => false;

function cartellaConSotto(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'dove-sei-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  mkdirSync(join(cartella, 'sub'));
  writeFileSync(join(cartella, 'sub', 'f.txt'), 'alpha');
  return cartella;
}

/* Un giro vero: la prima risposta chiama gli attrezzi dati, la seconda chiude. */
async function giro(t, cartella, chiamate, extra = {}) {
  const richieste = [];
  let conta = 0;
  const risultato = await talosLavora({
    cartella, task: { consegna: 'guarda la cartella' }, modello: 'x', chiave: 'y',
    fetchDiRete: async (_url, opzioni) => {
      richieste.push(JSON.parse(opzioni.body));
      return rispostaDi(conta++ ? { role: 'assistant', content: 'fatto' } : { role: 'assistant', content: null, tool_calls: chiamate });
    },
    ...extra,
  });
  const esiti = Object.fromEntries(risultato.messaggiFinali.filter((m) => m.role === 'tool').map((m) => [m.tool_call_id, String(m.content)]));
  return { risultato, richieste, esiti };
}

test('DOVE-01 la nota dice dove girano davvero: casa Linux, Windows con la shell in WSL o in cmd, altre piattaforme', () => {
  const linux = notaDoveSei({ percorso: '/mnt/c/Users/u/Desktop', casa: 'linux' });
  assert.ok(linux.startsWith(`${SEGNO_NOTA_DOVE}/mnt/c/Users/u/Desktop\n`));
  assert.match(linux, /Platform: Linux \(WSL2\)\. The shell and the file tools .* use Linux paths\./u);
  assert.match(linux, /`\/` is the Linux root, not the working folder\./u);
  const winAuto = notaDoveSei({ percorso: 'C:\\Users\\u\\Desktop', casa: 'windows', shell: null, percorsoLinux: '/mnt/c/Users/u/Desktop' });
  assert.match(winAuto, /Platform: Windows\. The file tools use Windows paths\./u);
  assert.match(winAuto, /may run a command in Windows or in Linux \(WSL2\); in Linux the working folder is \/mnt\/c\/Users\/u\/Desktop\./u);
  assert.match(notaDoveSei({ percorso: 'C:\\x', casa: 'windows', shell: 'wsl2', percorsoLinux: '/mnt/c/x' }), /The shell runs in Linux \(WSL2\), where the working folder is \/mnt\/c\/x\./u);
  const cmd = notaDoveSei({ percorso: 'C:\\x', casa: 'windows', shell: 'windows', percorsoLinux: null });
  assert.match(cmd, /The shell is cmd\.exe on Windows\./u);
  assert.doesNotMatch(cmd, /WSL/u, 'con «Windows» non si nomina WSL');
  assert.doesNotMatch(notaDoveSei({ percorso: 'C:\\x', casa: 'windows' }), /shell/u, 'senza scelta dell\'ambiente nessuna frase sulla shell');
  assert.match(notaDoveSei({ percorso: '/home/u/p', casa: 'altro', piattaforma: 'darwin' }), /Platform: macOS\./u);
  assert.equal(ultimaNotaDove([{ role: 'system', content: 'altro' }, { role: 'system', content: winAuto }, { role: 'user', content: 'x' }]), winAuto);
  assert.equal(ultimaNotaDove([{ role: 'user', content: winAuto }]), null, 'solo un messaggio di sistema è la nota');
});

test('DOVE-02 alias: «/<cartella>/…» e «<cartella>/…» diventano relativi SOLO se il primo pezzo letterale non esiste', () => {
  const o = { nomeCartella: 'Desktop', esiste: nessuno };
  assert.equal(aliasDelPercorso('/Desktop/projects', o).percorso, 'projects');
  assert.equal(aliasDelPercorso('/Desktop', o).percorso, '.');
  assert.equal(aliasDelPercorso('/Desktop/', o).percorso, '.');
  assert.equal(aliasDelPercorso('Desktop/a/b.txt', o).percorso, 'a/b.txt');
  assert.equal(aliasDelPercorso('\\Desktop\\a', o).percorso, 'a', 'anche con le barre di Windows');
  assert.match(aliasDelPercorso('/Desktop/x', o).nota, /^Note: "\/Desktop\/x" was read as "x": "Desktop" is the working folder itself/u);
  // al contrario: esiste davvero ⇒ resta com'è; non è la cartella ⇒ resta; `/` da solo e il nome nudo non sono alias
  const chiesti = [];
  assert.equal(aliasDelPercorso('/Desktop/x', { nomeCartella: 'Desktop', esiste: (p) => { chiesti.push(p); return true; } }), null);
  assert.deepEqual(chiesti, ['/Desktop'], 'si controlla il PRIMO pezzo letterale, assoluto');
  assert.equal(aliasDelPercorso('Desktop/x', { nomeCartella: 'Desktop', esiste: (p) => p === 'Desktop' }), null, 'una figlia vera di nome «Desktop» vince');
  assert.equal(aliasDelPercorso('/Documents/x', o), null);
  assert.equal(aliasDelPercorso('/', o), null);
  assert.equal(aliasDelPercorso('Desktop', o), null);
  assert.equal(aliasDelPercorso('//Desktop/x', o), null, 'un percorso di rete non si tocca');
  assert.equal(aliasDelPercorso('/desktop/x', o), null, 'le maiuscole contano se non è detto il contrario');
  assert.equal(aliasDelPercorso('/desktop/x', { ...o, maiuscoleIndifferenti: true }).percorso, 'x');
});

test('DOVE-03 alias: un «..» resta «..» (CLI, Voce 213) e «~» si espande solo con la casa data', () => {
  const o = { nomeCartella: 'Desktop', esiste: nessuno };
  assert.equal(aliasDelPercorso('/Desktop/../.ssh/id_rsa', o).percorso, '../.ssh/id_rsa');
  assert.equal(aliasDelPercorso('/Desktop/.env', o).percorso, '.env');
  assert.equal(aliasDelPercorso('~/x', o), null, 'senza casa `~` non si indovina (casa Linux)');
  const conCasa = { ...o, casaUtente: 'C:\\Users\\u', separatoreCasa: '\\' };
  assert.equal(aliasDelPercorso('~/Desktop/a', conCasa).percorso, 'C:\\Users\\u\\Desktop\\a');
  assert.equal(aliasDelPercorso('~', conCasa).percorso, 'C:\\Users\\u');
  assert.equal(aliasDelPercorso('~/x', { ...conCasa, esiste: (p) => p === '~' }), null, 'una cartella vera di nome «~» vince');
  assert.equal(aliasDelPercorso('~x', conCasa), null);
});

test('DOVE-04 gli argomenti: lo stesso campo di `campoConAlias`, e `elenca` sulla cartella stessa toglie TUTTI i nomi del percorso', () => {
  const alias = (p) => aliasDelPercorso(p, { nomeCartella: 'Desktop', esiste: nessuno });
  assert.deepEqual(argomentiConAlias('leggi', { path: '/Desktop/a.txt', offset: 3 }, alias, ALIAS_PERCORSO).argomenti, { path: 'a.txt', offset: 3 });
  assert.deepEqual(argomentiConAlias('elenca', { percorso: '/Desktop', path: 'altro' }, alias, ALIAS_PERCORSO).argomenti, {});
  assert.deepEqual(argomentiConAlias('scrivi', { percorso: '', path: '/Desktop/n.txt', contenuto: 'z' }, alias, ALIAS_PERCORSO).argomenti,
    { percorso: '', path: 'n.txt', contenuto: 'z' }, 'il primo campo NON vuoto, come campoConAlias');
  assert.equal(argomentiConAlias('leggi', { percorso: 7, path: '/Desktop/a' }, alias, ALIAS_PERCORSO), null, 'il campo scelto non è una stringa: niente');
  assert.equal(argomentiConAlias('shell', { percorso: '/Desktop/a' }, alias, ALIAS_PERCORSO), null);
  assert.equal(argomentiConAlias('cerca', { percorso: '/Desktop/a' }, alias, ALIAS_PERCORSO), null);
});

test('DOVE-05 nel giro vero: la nota sta dopo le istruzioni e prima della consegna, una volta sola; «/<cartella>/sub» elenca sub con la nota', async (t) => {
  const cartella = cartellaConSotto(t);
  const nome = basename(cartella);
  const { richieste, esiti } = await giro(t, cartella, [chiamata('c1', 'elenca', { percorso: `/${nome}/sub` })], { doveNelPrompt: true });
  const prima = richieste[0].messages;
  const indice = prima.findIndex((m) => m.role === 'system' && String(m.content).startsWith(SEGNO_NOTA_DOVE));
  assert.ok(indice > 0, 'c\'è la nota');
  assert.ok(indice < prima.findIndex((m) => m.role === 'user'), 'prima della consegna');
  assert.ok(prima[indice].content.startsWith(`${SEGNO_NOTA_DOVE}${resolve(cartella)}\n`), 'il percorso VERO della cartella');
  for (const r of richieste) {
    assert.equal(r.messages.filter((m) => m.role === 'system' && String(m.content).startsWith(SEGNO_NOTA_DOVE)).length, 1, 'non si ripete a ogni giro');
  }
  assert.match(esiti.c1, new RegExp(`^Note: "/${nome}/sub" was read as "sub"`, 'u'));
  assert.match(esiti.c1, /sub\/f\.txt/u, 'ha elencato la cartella giusta');
});

test('DOVE-06 al contrario: spento di serie (CLI, banco) niente nota e niente alias — il prompt resta quello di prima', async (t) => {
  const cartella = cartellaConSotto(t);
  const nome = basename(cartella);
  const { richieste, esiti } = await giro(t, cartella, [chiamata('c1', 'elenca', { percorso: `/${nome}/sub` })]);
  for (const r of richieste) assert.ok(!r.messages.some((m) => String(m.content ?? '').includes(SEGNO_NOTA_DOVE)));
  assert.doesNotMatch(esiti.c1, /was read as/u);
  assert.doesNotMatch(esiti.c1, /sub\/f\.txt/u, 'senza alias il percorso letterale non porta a sub');
  // con la nota accesa ma una sessione MOBILE: niente
  const mobile = await giro(t, cartella, [chiamata('c1', 'elenca', {})], { doveNelPrompt: true, mobile: true }).catch(() => null);
  if (mobile) for (const r of mobile.richieste) assert.ok(!r.messages.some((m) => String(m.content ?? '').includes(SEGNO_NOTA_DOVE)));
});

test('DOVE-07 l\'alias decide ESATTAMENTE come il percorso relativo che produce (CLI, Voce 213): fuori dalla cartella e segreti', async (t) => {
  const cartella = cartellaConSotto(t);
  const nome = basename(cartella);
  writeFileSync(join(cartella, '.env'), 'SEGRETO=1');
  const chiamate = [
    chiamata('a1', 'leggi', { percorso: `/${nome}/../fuori.txt` }), chiamata('r1', 'leggi', { percorso: '../fuori.txt' }),
    chiamata('a2', 'leggi', { percorso: `/${nome}/.env` }), chiamata('r2', 'leggi', { percorso: '.env' }),
    chiamata('a3', 'leggi', { percorso: `/${nome}/sub/f.txt` }), chiamata('r3', 'leggi', { percorso: 'sub/f.txt' }),
  ];
  const { esiti } = await giro(t, cartella, chiamate, { doveNelPrompt: true });
  const senzaNota = (testo) => testo.replace(/^Note: "[^"\n]*" was read as "[^"\n]*":[^\n]*\n\n/u, '').replace(/id=[0-9a-f]+/gu, 'id=X');
  for (const [a, r] of [['a1', 'r1'], ['a2', 'r2'], ['a3', 'r3']]) {
    assert.match(esiti[a], /^Note: /u, `${a} porta la nota`);
    assert.equal(senzaNota(esiti[a]), senzaNota(esiti[r]), `${a} decide come ${r}`);
  }
  assert.match(esiti.r3, /alpha/u, 'la lettura dentro la cartella riesce');
  assert.doesNotMatch(esiti.r1, /alpha|SEGRETO/u);
});

test('DOVE-08 una ripresa senza la nota (sessione di prima) la riceve al primo giro; con la nota uguale non si aggiunge niente', async (t) => {
  const cartella = cartellaConSotto(t);
  const storia = [{ role: 'system', content: 'istruzioni' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'ciao' }, { role: 'user', content: 'ancora' }];
  const vecchia = await giro(t, cartella, [chiamata('c1', 'elenca', {})], { doveNelPrompt: true, messaggiIniziali: storia });
  const note = vecchia.richieste[0].messages.filter((m) => m.role === 'system' && String(m.content).startsWith(SEGNO_NOTA_DOVE));
  assert.equal(note.length, 1);
  const conNota = [...storia.slice(0, 1), note[0], ...storia.slice(1)];
  const nuova = await giro(t, cartella, [chiamata('c1', 'elenca', {})], { doveNelPrompt: true, messaggiIniziali: conNota });
  assert.equal(nuova.richieste[0].messages.filter((m) => String(m.content ?? '').startsWith(SEGNO_NOTA_DOVE)).length, 1, 'la stessa nota non si ripete');
  assert.ok(homedir()); // la casa dell'utente esiste nell'ambiente di prova
});

test('DOVE-09 `elenca` di un nome che non c\'è: i nomi veri più vicini, le cartelle prima, al massimo tre (Hermes `_suggest_similar_files`)', (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'dove-vicini-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const d of ['projects', 'Projects-old', 'progetti']) mkdirSync(join(cartella, d));
  writeFileSync(join(cartella, 'project.txt'), 'x');
  writeFileSync(join(cartella, 'zzz.txt'), 'x');
  const vicini = nomiViciniNellaCartella(cartella, 'project');
  assert.equal(vicini.length, 3);
  assert.ok(vicini.includes('projects/'));
  assert.ok(!vicini.includes('zzz.txt'));
  assert.deepEqual(nomiViciniNellaCartella(cartella, 'qwertyuiop'), [], 'niente di simile: nessun candidato inventato');
  mkdirSync(join(cartella, 'sub'));
  mkdirSync(join(cartella, 'sub', 'kernel'));
  const testo = correggiEsitoToolDesktop({ name: 'elenca', args: { percorso: 'sub/kernal' }, cartella,
    content: '"sub/kernal" is not a readable folder of this workspace. Check the project map.' });
  assert.match(testo, /^"sub\/kernal" does not exist in this workspace\. Closest existing names: "sub\/kernel\/"\. Use `cerca`/u);
  const nessunVicino = correggiEsitoToolDesktop({ name: 'elenca', args: { percorso: 'qwertyuiop' }, cartella,
    content: '"qwertyuiop" is not a readable folder of this workspace.' });
  assert.doesNotMatch(nessunVicino, /Closest/u, 'al contrario: nessun nome simile, nessuna riga');
});

test('DOVE-10 la correzione di un esito si FISSA alla prima richiesta: il disco che cambia non riscrive il passato (cache del prefisso)', (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'dove-fissa-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  mkdirSync(join(cartella, 'alfx-vecchia'));
  const storia = [
    { role: 'assistant', content: null, tool_calls: [chiamata('k1', 'elenca', { percorso: 'alfx' })] },
    { role: 'tool', tool_call_id: 'k1', content: '"alfx" is not a readable folder of this workspace.' },
  ];
  const memoria = new Map();
  const prima = correggiMessaggiDesktop(storia, { cartella, memoria })[1].content;
  assert.match(prima, /Closest existing names: "alfx-vecchia\/"/u);
  mkdirSync(join(cartella, 'alfx'));
  assert.equal(correggiMessaggiDesktop(storia, { cartella, memoria })[1].content, prima, 'con la memoria: identico');
  assert.notEqual(correggiMessaggiDesktop(storia, { cartella })[1].content, prima, 'senza memoria cambierebbe (il caso che la memoria ferma)');
});

test('DOVE-11 il filo: agent-service accende la nota sul desktop e toglie «Piattaforma: win32» dalla scheda (la dice il kernel)', async (t) => {
  const { avviaSessione } = await import('../src/agent-service.mjs');
  const cartella = cartellaConSotto(t);
  let visto;
  await avviaSessione({ cartella, task: { consegna: 'prova' }, modello: 'm', chiave: 'k', onEvento: () => {},
    talosLavoraFn: async (input) => { visto = input; return { comeFinita: 'concluso', detto: 'fatto' }; } });
  assert.equal(visto.doveNelPrompt, true);
  assert.equal(typeof visto.contestoDelProgetto, 'string');
  assert.match(visto.contestoDelProgetto, /Working folder: «/u, 'la scheda c\'è');
  assert.doesNotMatch(visto.contestoDelProgetto, /Piattaforma:/u, 'la riga che mentiva non c\'è più');
});

test('DOVE-12 in «Accesso pieno» le letture partono IN ANTICIPO: anche lì con il percorso riscritto, non quello letterale', async (t) => {
  const cartella = cartellaConSotto(t);
  const nome = basename(cartella);
  const chiamate = [chiamata('l1', 'leggi', { percorso: `${nome}/sub/f.txt` }), chiamata('e1', 'elenca', { percorso: `${nome}/sub` })];
  const { esiti } = await giro(t, cartella, chiamate, { doveNelPrompt: true, livelloAccesso: 'accesso-pieno' });
  assert.match(esiti.l1, /^Note: /u);
  assert.match(esiti.l1, /alpha/u, 'ha letto il file dentro la cartella di lavoro');
  assert.match(esiti.e1, /sub\/f\.txt/u);
});

/* ── revisione avversaria del 20/10 (D1, D2, D3) ── */
const kernelDesktop = await import('../src/kernel/talosHarness.desktop-hotfix.mjs');

async function giroDesktop(t, cartella, risposte) {
  const richieste = [];
  let conta = 0;
  await kernelDesktop.talosLavora({
    cartella, task: { consegna: 'guarda' }, modello: 'x', chiave: 'y', doveNelPrompt: true,
    fetchDiRete: async (_u, o) => { richieste.push(JSON.parse(o.body)); const r = risposte[conta++] ?? risposte.at(-1); return rispostaDi(typeof r === 'function' ? r() : r); },
  });
  return richieste;
}

test('DOVE-13 (D1) la correzione desktop di `elenca` vede oltre la nota dell\'alias e usa il percorso RISCRITTO', async (t) => {
  const cartella = cartellaConSotto(t);
  const nome = basename(cartella);
  mkdirSync(join(cartella, 'kernel'));
  const chiamate = [chiamata('A', 'elenca', { percorso: `/${nome}/kernal` }), chiamata('AF', 'elenca', { percorso: `/${nome}/sub/f.txt` })];
  const richieste = await giroDesktop(t, cartella, [{ role: 'assistant', content: null, tool_calls: chiamate }, { role: 'assistant', content: 'fatto' }]);
  const esito = (id) => String(richieste.at(-1).messages.find((m) => m.role === 'tool' && m.tool_call_id === id).content);
  assert.match(esito('A'), new RegExp(`^Note: "/${nome}/kernal" was read as "kernal"[^\n]*\n\n"kernal" does not exist in this workspace\. Closest existing names: "kernel/"`, 'u'));
  assert.match(esito('AF'), /\n\n"sub\/f\.txt" is a FILE, not a folder\./u);
  assert.doesNotMatch(esito('A'), /REFUSED/u, 'mai un falso rifiuto sul percorso grezzo');
});

test('DOVE-14 (D2, D3) partenza anticipata nello STREAM: legge col percorso riscritto; se il disco cambia a metà non riusa l\'esito', async (t) => {
  const enc = new TextEncoder();
  const sse = (obj) => enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const delta = (d, finish = null) => ({ id: 'x', object: 'chat.completion.chunk', choices: [{ index: 0, delta: d, finish_reason: finish }] });
  const flusso = (pezzi, prima = {}) => {
    let i = 0;
    return new Response(new ReadableStream({ async pull(ctrl) {
      if (i >= pezzi.length) { ctrl.close(); return; }
      prima[i]?.();
      await new Promise((r) => setTimeout(r, 20));
      ctrl.enqueue(pezzi[i]); i += 1;
    } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  for (const cambia of [false, true]) {
    const cartella = cartellaConSotto(t);
    const nome = basename(cartella);
    const pezzi1 = [
      sse(delta({ role: 'assistant', tool_calls: [{ index: 0, id: 'c0', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `${nome}/sub/f.txt` }) } }] })),
      sse(delta({ tool_calls: [{ index: 1, id: 'c1', type: 'function', function: { name: 'elenca', arguments: '' } }] })),
      sse(delta({ tool_calls: [{ index: 1, function: { arguments: '{}' } }] })),
      sse(delta({}, 'tool_calls')), enc.encode('data: [DONE]\n\n'),
    ];
    const pezzi2 = [sse(delta({ role: 'assistant', content: 'fatto' })), sse(delta({}, 'stop')), enc.encode('data: [DONE]\n\n')];
    const crea = { 3: () => { mkdirSync(join(cartella, nome, 'sub'), { recursive: true }); writeFileSync(join(cartella, nome, 'sub', 'f.txt'), 'BETA'); } };
    let conta = 0;
    const letti = [];
    const r = await talosLavora({
      cartella, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y', doveNelPrompt: true, livelloAccesso: 'accesso-pieno', onDelta: () => {},
      fetchDiRete: async () => (conta++ ? flusso(pezzi2) : flusso(pezzi1, cambia ? crea : {})),
      onGiro: (e) => { if (e.tipo === 'tool-esito') letti.push(e.toolCallId); },
    });
    const esito = String(r.messaggiFinali.find((m) => m.role === 'tool' && m.tool_call_id === 'c0').content);
    if (!cambia) {
      assert.match(esito, new RegExp(`^Note: "${nome}/sub/f\.txt" was read as "sub/f\.txt"`, 'u'));
      assert.match(esito, /alpha/u, 'letto nella cartella di lavoro');
    } else {
      assert.match(esito, /BETA/u, 'il file che ora esiste davvero, non l\'esito anticipato');
      assert.doesNotMatch(esito, /alpha|was read as/u);
    }
  }
});

test('DOVE-15 (D3) nel wrapper desktop la correzione di un `elenca` passato resta FISSA anche se il disco cambia fra due richieste', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'dove-fissa-filo-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  mkdirSync(join(cartella, 'alfx-vecchia'));
  const richieste = await giroDesktop(t, cartella, [
    { role: 'assistant', content: null, tool_calls: [chiamata('k1', 'elenca', { percorso: 'alfx' })] },
    () => { mkdirSync(join(cartella, 'alfx')); return { role: 'assistant', content: null, tool_calls: [chiamata('k2', 'elenca', {})] }; },
    { role: 'assistant', content: 'fatto' },
  ]);
  const k1 = (r) => String(r.messages.find((m) => m.role === 'tool' && m.tool_call_id === 'k1').content);
  assert.equal(richieste.length, 3);
  assert.match(k1(richieste[1]), /Closest existing names: "alfx-vecchia\/"/u);
  assert.equal(k1(richieste[2]), k1(richieste[1]), 'il passato non si riscrive: il prefisso resta in cache');
});

test('DOVE-16 (riserva D2) il ciclo usa l\'alias deciso col prefisso: se il disco cambia fra due chiamate, esito e nota restano coerenti', async (t) => {
  const cartella = cartellaConSotto(t);
  const nome = basename(cartella);
  writeFileSync(join(cartella, 'primo.txt'), 'uno');
  const chiamate = [chiamata('c0', 'leggi', { percorso: 'primo.txt' }), chiamata('c1', 'leggi', { percorso: `${nome}/sub/f.txt` })];
  let conta = 0;
  const r = await talosLavora({
    cartella, task: { consegna: 'leggi' }, modello: 'x', chiave: 'y', doveNelPrompt: true, livelloAccesso: 'accesso-pieno',
    fetchDiRete: async () => rispostaDi(conta++ ? { role: 'assistant', content: 'fatto' } : { role: 'assistant', content: null, tool_calls: chiamate }),
    // dopo il primo esito, prima che il ciclo arrivi alla seconda chiamata, nasce `<cartella>/<nome>/sub/f.txt`
    onGiro: (e) => { if (e.tipo === 'tool-esito' && e.toolCallId === 'c0') { mkdirSync(join(cartella, nome, 'sub'), { recursive: true }); writeFileSync(join(cartella, nome, 'sub', 'f.txt'), 'BETA'); } },
  });
  const c1 = String(r.messaggiFinali.find((m) => m.role === 'tool' && m.tool_call_id === 'c1').content);
  // la lettura anticipata è partita con l'alias (sub/f.txt, «alpha»): la nota DEVE dirlo, o il modello crede di aver letto l'altro file
  assert.match(c1, new RegExp(`^Note: "${nome}/sub/f\.txt" was read as "sub/f\.txt"`, 'u'));
  assert.match(c1, /alpha/u);
});

/*
 * ⛔ 20/10/2026 notte, S2 della revisione della CLI 0.6.11: l'alias del nome della cartella NON tocca le scritture (Hermes risolve
 *   alla lettera, `tools/file_tools_paths.py:267-274`). Il layout piatto di Python (`myproj/myproj/__init__.py`) si crea, e il
 *   `main.py` della radice, letto per intero prima, non viene sovrascritto da `scrivi "myproj/main.py"`.
 */
test('DOVE-17 gli argomenti: nelle scritture solo `~`, il nome della cartella resta alla lettera; nelle letture l\'alias resta', () => {
  const alias = (p, extra = {}) => aliasDelPercorso(p, { nomeCartella: 'myproj', esiste: nessuno, casaUtente: '/home/u', ...extra });
  assert.equal(argomentiConAlias('scrivi', { percorso: 'myproj/__init__.py', contenuto: '' }, alias, ALIAS_PERCORSO), null);
  assert.equal(argomentiConAlias('scrivi', { percorso: '/myproj/main.py', contenuto: '' }, alias, ALIAS_PERCORSO), null);
  assert.equal(argomentiConAlias('file_edit', { percorso: 'myproj/main.py' }, alias, ALIAS_PERCORSO), null);
  assert.deepEqual(argomentiConAlias('scrivi', { percorso: '~/n.txt', contenuto: 'z' }, alias, ALIAS_PERCORSO).argomenti,
    { percorso: '/home/u/n.txt', contenuto: 'z' }, '`~` resta anche nelle scritture: alla lettera creerebbe una cartella «~»');
  // AL CONTRARIO: le letture tengono l'alias
  assert.deepEqual(argomentiConAlias('leggi', { percorso: 'myproj/main.py' }, alias, ALIAS_PERCORSO).argomenti, { percorso: 'main.py' });
  assert.deepEqual(argomentiConAlias('elenca', { percorso: '/myproj/sub' }, alias, ALIAS_PERCORSO).argomenti, { percorso: 'sub' });
});

test('DOVE-18 nel giro vero: `scrivi "<cartella>/main.py"` crea la sottocartella e NON sovrascrive il main.py della radice letto prima', async (t) => {
  const cartella = cartellaConSotto(t);
  const nome = basename(cartella);
  writeFileSync(join(cartella, 'main.py'), 'ORIGINALE\n');
  const { esiti } = await giro(t, cartella, [
    chiamata('c0', 'leggi', { percorso: 'main.py' }),
    chiamata('c1', 'scrivi', { percorso: `${nome}/__init__.py`, contenuto: '' }),
    chiamata('c2', 'scrivi', { percorso: `${nome}/main.py`, contenuto: 'NUOVO\n' }),
  ], { doveNelPrompt: true });
  assert.equal(readFileSync(join(cartella, 'main.py'), 'utf8'), 'ORIGINALE\n', '⛔ il main.py della radice non si tocca');
  assert.equal(readFileSync(join(cartella, nome, 'main.py'), 'utf8'), 'NUOVO\n', 'il file nuovo sta nella sottocartella omonima');
  assert.ok(existsSync(join(cartella, nome, '__init__.py')), 'il layout piatto di Python si crea');
  assert.ok(!existsSync(join(cartella, '__init__.py')));
  for (const id of ['c1', 'c2']) assert.doesNotMatch(esiti[id], /was read as/u, 'nessuna nota d\'alias su una scrittura');
});
