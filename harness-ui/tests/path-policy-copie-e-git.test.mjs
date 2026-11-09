/*
 * ⭐ 04/11/2026 — decisione 151 dell'owner, sulla funzione `ePercorsoDiControllo` (`src/path-policy.mjs`), e decisione 155 che
 * toglie la 152.
 *
 * 151 (foto dell'owner, 16:16): in Accesso pieno compariva la carta «It wants to write a TALOS control file…» per
 *   `OrcaOne/.claude/worktrees/nfc-lf/orca-rs/crates/orca-lfrfid/tests/firmware.rs`. `.claude/worktrees/<nome>/` è dove
 *   Claude Code mette le sue copie di lavoro del progetto (code.claude.com/docs/en/worktrees, letta il 04/11/2026: «the
 *   worktree is created under `.claude/worktrees/<name>/` at your repository root»; e la sua lista dei percorsi protetti,
 *   code.claude.com/docs/en/permission-modes, «Protected paths», letta il 04/11/2026: `.claude` «with a few exceptions,
 *   such as Claude's own git worktrees under `.claude/worktrees/`»). I file di una copia sono file del progetto; le REGOLE
 *   della copia restano controllo.
 * 152 → 155 (owner 04/11/2026): la 152 faceva di `.git/hooks/**`, `.git/config` e del puntatore `gitdir:` file di controllo;
 *   la 155 la toglie riga per riga. `.git` torna libero com'era prima, tranne il `.git` di una copia di lavoro (condizione 3
 *   della 151); e in Accesso pieno nessun file di controllo chiede più (`tests/accesso-pieno-155.test.mjs`).
 *
 * Tutte su cartelle VERE (mkdtemp), come le prove sorelle in `path-policy.test.mjs`: la funzione risolve il percorso reale.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { ePercorsoDiControllo } from '../src/path-policy.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const FILE_DELLA_FOTO = '.claude/worktrees/nfc-lf/orca-rs/crates/orca-lfrfid/tests/firmware.rs';

async function progetto(t, prefisso = 'talos-151-') {
  const radice = await realpath(await mkdtemp(join(tmpdir(), prefisso)));
  t.after(() => rimuoviCartellaDiProvaAttesa(radice));
  return radice;
}

async function collega(t, verso, dove) {
  try {
    await symlink(verso, dove, 'junction');
    return true;
  } catch (errore) {
    t.skip(`il sistema non consente di creare una giunzione: ${errore.code || errore.message}`);
    return false;
  }
}

/* ───────────────────────────── decisione 151 ───────────────────────────── */

test('151 ROSSA→VERDE — il file della foto, dentro una copia di lavoro di Claude Code, NON è un file di controllo', async (t) => {
  const radice = await progetto(t);
  assert.equal(ePercorsoDiControllo(radice, FILE_DELLA_FOTO), false, 'il file della foto è un file del progetto');
  assert.equal(ePercorsoDiControllo(radice, '.claude/worktrees/nfc-lf/orca-rs/x/tests/firmware.rs'), false, 'il caso del brief');
  // anche con la copia che esiste davvero sul disco, col suo `.git` file come la fa git worktree add
  await mkdir(join(radice, '.claude/worktrees/nfc-lf/orca-rs/crates/orca-lfrfid/tests'), { recursive: true });
  await writeFile(join(radice, '.claude/worktrees/nfc-lf/.git'), 'gitdir: ../../../.git/worktrees/nfc-lf\n');
  await writeFile(join(radice, FILE_DELLA_FOTO), '// firmware');
  assert.equal(ePercorsoDiControllo(radice, FILE_DELLA_FOTO), false, 'file che esiste già');
  assert.equal(ePercorsoDiControllo(radice, join(radice, FILE_DELLA_FOTO)), false, 'percorso assoluto');
  assert.equal(ePercorsoDiControllo(radice, '.claude/worktrees/nfc-lf/README.md'), false, 'un file alla radice della copia');
  assert.equal(ePercorsoDiControllo(radice, '.claude/worktrees/nfc-lf/sotto/skills/x.md'), false, '`skills` annidata nella copia, come nel progetto');
});

test('151 AL CONTRARIO — le regole della copia e tutto il resto di `.claude/` restano controllo', async (t) => {
  const radice = await progetto(t);
  const casi = [
    ['.claude/settings.json', 'la `.claude/` del progetto'],
    ['.claude/hooks/x', 'gli hook del progetto'],
    ['.claude/worktrees/nfc-lf/CLAUDE.md', 'le istruzioni della copia'],
    ['.claude/worktrees/nfc-lf/AGENTS.md', 'le istruzioni della copia'],
    ['.claude/worktrees/nfc-lf/src/CLAUDE.md', 'un CLAUDE.md annidato nella copia'],
    ['.claude/worktrees/nfc-lf/.claude/settings.json', 'la `.claude/` della copia'],
    ['.claude/worktrees/nfc-lf/.talos/x', 'la `.talos/` della copia'],
    ['.claude/worktrees/nfc-lf/skills/x.md', '`skills/` alla radice della copia'],
    ['.claude/worktrees/nfc-lf/.harness-ui-hooks.json', 'un file di controllo per nome'],
    ['.claude/worktrees/nfc-lf/src/.memory-store/x', 'una cartella ovunque, dentro la copia'],
    ['.claude/worktrees/x', 'un file direttamente sotto `.claude/worktrees/`'],
    ['.claude/worktrees/nfc-lf', 'la cartella della copia stessa'],
    ['.claude/worktrees', '`.claude/worktrees` stessa'],
    ['.claude/worktrees/nfc-lf/../../hooks/x', 'risalire dalla copia a `.claude/hooks`'],
    ['.claude/worktrees/nfc-lf/.git', 'il puntatore `gitdir:` della copia (condizione 3 del Desktop)'],
    ['.claude/worktrees/nfc-lf/.git/config', 'la cartella `.git` di una copia clonata (condizione 3)'],
    ['.claude/worktrees/nfc-lf/.git/objects/ab/cd', 'tutta la `.git` della copia resta protetta come oggi (condizione 3)'],
    ['.claude/worktrees/a/.claude/worktrees/b/f.rs', 'una copia dentro la `.claude/` di una copia: è la `.claude/` della copia'],
    ['.claude/altro/worktrees/n/f.rs', '`worktrees` non subito sotto `.claude`'],
    ['.claude/worktrees/.talos/x', 'un nome nascosto non è una copia di Claude Code'],
    ['.claude/worktrees/.git/hooks-finti/x', 'idem'],
    ['.claude/worktrees/.claude/x', 'idem'],
    ['.claude/plans/worktrees/n/f.rs', 'idem'],
  ];
  for (const [percorso, perche] of casi) assert.equal(ePercorsoDiControllo(radice, percorso), true, `${percorso}: ${perche}`);
});

test('151 AL CONTRARIO — una giunzione che dalla copia porta a `.claude/hooks` resta controllo (percorso reale)', async (t) => {
  const radice = await progetto(t);
  await mkdir(join(radice, '.claude/hooks'), { recursive: true });
  await writeFile(join(radice, '.claude/hooks/gancio.mjs'), '// gancio');
  await mkdir(join(radice, '.claude/worktrees/nfc-lf'), { recursive: true });
  if (!await collega(t, join(radice, '.claude/hooks'), join(radice, '.claude/worktrees/nfc-lf/innocuo'))) return;
  assert.equal(ePercorsoDiControllo(radice, '.claude/worktrees/nfc-lf/innocuo/gancio.mjs'), true, 'il nome del link non nasconde la destinazione');
  assert.equal(ePercorsoDiControllo(radice, '.claude/worktrees/nfc-lf/innocuo/nuovo.mjs'), true, 'anche un file nuovo dietro il link');
});

test('151 — una giunzione da fuori che porta DENTRO una copia è un file del progetto (decide la destinazione, non il nome)', async (t) => {
  const radice = await progetto(t);
  await mkdir(join(radice, '.claude/worktrees/nfc-lf/src'), { recursive: true });
  if (!await collega(t, join(radice, '.claude/worktrees/nfc-lf'), join(radice, 'scorciatoia'))) return;
  assert.equal(ePercorsoDiControllo(radice, 'scorciatoia/src/a.rs'), false);
  assert.equal(ePercorsoDiControllo(radice, 'scorciatoia/CLAUDE.md'), true, 'e le regole della copia restano regole anche da lì');
  assert.equal(ePercorsoDiControllo(radice, 'scorciatoia/.claude/settings.json'), true);
});

test('151 (condizione 2 del Mobile) — progetto aperto da un collegamento, come /sdcard → /storage/emulated/0: stesso esito del percorso vero', async (t) => {
  const contenitore = await progetto(t, 'talos-151-mobile-');
  const vero = join(contenitore, 'storage', 'emulated', '0', 'OrcaOne');
  await mkdir(join(vero, '.claude/worktrees/nfc-lf/src'), { recursive: true });
  if (!await collega(t, join(contenitore, 'storage', 'emulated', '0'), join(contenitore, 'sdcard'))) return;
  const dalCollegamento = join(contenitore, 'sdcard', 'OrcaOne');
  const casi = [
    ['.claude/worktrees/nfc-lf/src/main.rs', false],
    [FILE_DELLA_FOTO, false],
    ['.claude/settings.json', true],
    ['.claude/worktrees/nfc-lf/CLAUDE.md', true],
    ['.claude/worktrees/nfc-lf/.claude/settings.json', true],
    ['.claude/worktrees/x', true],
  ];
  for (const [percorso, atteso] of casi) {
    assert.equal(ePercorsoDiControllo(vero, percorso), atteso, `dal percorso vero: ${percorso}`);
    assert.equal(ePercorsoDiControllo(dalCollegamento, percorso), atteso, `dal collegamento: ${percorso}`);
  }
  // incrociati: progetto aperto dal collegamento, percorso assoluto scritto col percorso vero (e viceversa)
  assert.equal(ePercorsoDiControllo(dalCollegamento, join(vero, '.claude/worktrees/nfc-lf/src/main.rs')), false);
  assert.equal(ePercorsoDiControllo(vero, join(dalCollegamento, '.claude/worktrees/nfc-lf/src/main.rs')), false);
  assert.equal(ePercorsoDiControllo(dalCollegamento, join(vero, '.claude/settings.json')), true);
});

test('151 — `~/.claude/worktrees/…` FUORI dal progetto segue la stessa regola (la doc di Claude Code mette lì le copie dei suoi hook)', async (t) => {
  const contenitore = await progetto(t, 'talos-151-casa-');
  const progettoAperto = join(contenitore, 'progetto');
  const casa = join(contenitore, 'casa');
  await mkdir(progettoAperto, { recursive: true });
  await mkdir(join(casa, '.claude/worktrees/feature/src'), { recursive: true });
  assert.equal(ePercorsoDiControllo(progettoAperto, join(casa, '.claude/worktrees/feature/src/a.rs')), false, 'il file di una copia nella casa');
  assert.equal(ePercorsoDiControllo(progettoAperto, join(casa, '.claude/settings.json')), true, 'la `.claude/` della casa resta controllo');
  assert.equal(ePercorsoDiControllo(progettoAperto, join(casa, '.claude/worktrees/feature/CLAUDE.md')), true);
  assert.equal(ePercorsoDiControllo(progettoAperto, join(casa, '.claude/worktrees/feature/.claude/x')), true);
  assert.equal(ePercorsoDiControllo(progettoAperto, join(casa, '.claude/worktrees/feature/skills/x.md')), true, '`skills/` alla radice della copia, anche fuori');
  assert.equal(ePercorsoDiControllo(progettoAperto, join(casa, '.claude/worktrees/feature')), true);
});

test('151 (condizione 1 di Performance) — nessun realpath in più per file: due per chiamata, come prima', async (t) => {
  const radice = await progetto(t);
  await mkdir(join(radice, '.claude/worktrees/nfc-lf/src'), { recursive: true });
  let chiamate = 0;
  const realpathFn = (p) => { chiamate += 1; return realpathSync.native(p); };
  for (let i = 0; i < 50; i += 1) ePercorsoDiControllo(radice, `.claude/worktrees/nfc-lf/src/f${i}.rs`, { realpathFn });
  assert.equal(chiamate, 100, 'una risoluzione per la cartella e una per il file, a ogni chiamata: nessuna in più');
});

test('151 (Windows) — il confronto è senza maiuscole: `.CLAUDE/Settings.json` resta controllo, `.Claude/WORKTREES/n/x.rs` è del progetto', async (t) => {
  const radice = await progetto(t);
  assert.equal(ePercorsoDiControllo(radice, '.CLAUDE/settings.json', { piattaforma: 'win32' }), true);
  assert.equal(ePercorsoDiControllo(radice, 'src/claude.MD', { piattaforma: 'win32' }), true);
  assert.equal(ePercorsoDiControllo(radice, '.Claude/WORKTREES/n/x.rs', { piattaforma: 'win32' }), false);
  assert.equal(ePercorsoDiControllo(radice, '.Claude/WORKTREES/n/Claude.md', { piattaforma: 'win32' }), true);
});

/* ──────────────── decisione 155: la 152 è tolta, `.git` torna libero (tranne quello di una copia) ──────────────── */

test('155 — la 152 è tolta: `.git/hooks`, `.git/config` e il puntatore `gitdir:` NON sono più file di controllo', async (t) => {
  const radice = await progetto(t, 'talos-155-git-');
  const liberi = [
    '.git/hooks/pre-commit', '.git/hooks', '.git/config', '.git/config.worktree', '.git/worktrees/nfc-lf/commondir',
    '.git/modules/sub/config', '.git/modules/sub/hooks/pre-commit', '.git', 'sotto/progetto/.git/hooks/x',
    '.git/index', '.git/objects/ab/cdef', '.git/refs/heads/main', '.git/HEAD', '.gitignore', 'src/hooks/useThing.js',
  ];
  for (const percorso of liberi) assert.equal(ePercorsoDiControllo(radice, percorso), false, percorso);
  for (const percorso of ['.GIT/Config', '.Git/HOOKS/x']) assert.equal(ePercorsoDiControllo(radice, percorso, { piattaforma: 'win32' }), false, percorso);
});

test('155 AL CONTRARIO — il `.git` di una copia di lavoro di Claude Code resta controllo (condizione 3 della 151)', async (t) => {
  const radice = await progetto(t, 'talos-155-git-copia-');
  for (const percorso of ['.claude/worktrees/nfc-lf/.git', '.claude/worktrees/nfc-lf/.git/config', '.claude/worktrees/nfc-lf/.git/objects/ab/cd']) {
    assert.equal(ePercorsoDiControllo(radice, percorso), true, percorso);
  }
});

/* ───────────────── il percorso intero: kernel vero, attrezzo `scrivi` vero, cancello vero ───────────────── */

function preparaEsecuzione(cartella) {
  return () => ({ cartella, comandoProva: null, task: { id: 'task-vero', consegna: 'prova' } });
}

async function giroConUnaScrittura(cartella, percorso, permessiScelto = 'Full access') {
  let input = null;
  const registro = createSessionRegistry({
    guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: preparaEsecuzione(cartella), caricaHooksFn: async () => ({ hooks: [] }),
    avviaSessioneFn: (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}); },
  });
  const { sessionId } = registro.avvia('task-vero', { permessiScelto });
  if (permessiScelto === 'Full access') assert.equal(input.livelloAccesso, 'accesso-pieno');
  else assert.notEqual(input.livelloAccesso, 'accesso-pieno');
  const carte = [];
  registro.iscriviti(sessionId, (e) => {
    if (e.type !== 'ApprovalRequested') return;
    carte.push(e);
    registro.rispondiApprovazione(sessionId, e.requestId, false); // la persona dice no: il file non deve comparire
  });
  const risposte = [
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso, contenuto: 'x' }) } }] },
    { role: 'assistant', content: 'fatto', tool_calls: [] },
  ];
  let indice = 0;
  const fetchDiRete = async () => {
    const scelta = risposte[Math.min(indice++, risposte.length - 1)];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  };
  await talosLavora({
    cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y', fetchDiRete,
    livelloAccesso: input.livelloAccesso, chiediApprovazioneFn: input.chiediApprovazioneFn, hookFn: input.hookFn,
  });
  return { carte, scritto: existsSync(join(cartella, percorso)) };
}


test('151 PERCORSO INTERO — in Accesso pieno, `scrivi` del kernel sul file della foto: nessuna carta, file scritto', async (t) => {
  const radice = await progetto(t, 'talos-151-intero-');
  const esito = await giroConUnaScrittura(radice, FILE_DELLA_FOTO);
  assert.equal(esito.carte.length, 0, 'nessuna carta per un file del progetto dentro la copia');
  assert.equal(esito.scritto, true, 'il file è stato scritto');
});


test('155 PERCORSO INTERO — `scrivi` sul CLAUDE.md della copia in Accesso pieno: nessuna carta, file scritto (prima della 155 la carta c\'era)', async (t) => {
  const radice = await progetto(t, 'talos-155-intero-');
  const esito = await giroConUnaScrittura(radice, '.claude/worktrees/nfc-lf/CLAUDE.md');
  assert.equal(esito.carte.length, 0);
  assert.equal(esito.scritto, true);
});

test('151 PERCORSO INTERO AL CONTRARIO — fuori dall\'Accesso pieno, `scrivi` sul CLAUDE.md della copia: la carta c\'è, e col no il file non compare', async (t) => {
  const radice = await progetto(t, 'talos-151-intero-contrario-');
  const esito = await giroConUnaScrittura(radice, '.claude/worktrees/nfc-lf/CLAUDE.md', 'Workspace write');
  assert.equal(esito.carte.length, 1);
  assert.equal(esito.carte[0].azione?.fileDiControllo, true);
  assert.equal(esito.scritto, false);
});

test('155 PERCORSO INTERO — `scrivi` su `.git/hooks/pre-commit` in Accesso pieno: nessuna carta, il file si scrive (la 152 è tolta)', async (t) => {
  const radice = await progetto(t, 'talos-155-intero-git-');
  await mkdir(join(radice, '.git', 'hooks'), { recursive: true });
  const esito = await giroConUnaScrittura(radice, '.git/hooks/pre-commit');
  assert.equal(esito.carte.length, 0);
  assert.equal(esito.scritto, true);
});
