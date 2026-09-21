import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { leggiContestoWorkspace, repoAnnidati } from '../src/workspace-context.mjs';

/** Un repository git VERO (`git init`), non una cartella `.git` finta — stessa disciplina del resto del file. */
function creaRepoVero(cartella) {
  execFileSync('git', ['init', '--quiet', cartella]);
}

const quiRepo = dirname(dirname(fileURLToPath(import.meta.url))); // harness-ui/, dentro il repo git vero

test('⭐ su un repository git VERO (questo stesso repo), il branch è reale — nessun mock', () => {
  const contesto = leggiContestoWorkspace({ cartella: quiRepo, progetto: null });
  assert.equal(contesto.cartella, quiRepo);
  assert.equal(typeof contesto.branch, 'string');
  assert.ok(contesto.branch.length > 0, 'un repo git vero ha sempre un branch (anche "HEAD" se distaccato)');
});

test('⭐⭐ e il VERSO CONTRARIO, su una cartella VERA che non è un repository: branch è null, non un errore', () => {
  const vuota = mkdtempSync(join(tmpdir(), 'workspace-context-non-git-'));
  try {
    const contesto = leggiContestoWorkspace({ cartella: vuota, progetto: 'listino' });
    assert.equal(contesto.progetto, 'listino');
    assert.equal(contesto.cartella, vuota);
    assert.equal(contesto.branch, null);
  } finally {
    rmSync(vuota, { recursive: true, force: true });
  }
});

test('un exec che lancia per qualunque motivo (git assente, permessi) produce branch null, mai un\'eccezione', () => {
  const execCheGetta = () => { throw new Error('git: comando non trovato'); };
  const contesto = leggiContestoWorkspace({ cartella: '/qualunque', progetto: 'x' }, { exec: execCheGetta });
  assert.equal(contesto.branch, null);
});

test('un branch con output vuoto (git risponde ma senza testo) è null, non una stringa vuota', () => {
  const execVuoto = () => '   \n';
  const contesto = leggiContestoWorkspace({ cartella: '/qualunque' }, { exec: execVuoto });
  assert.equal(contesto.branch, null);
});

test('progetto viene passato attraverso senza modifiche, incluso null', () => {
  assert.equal(leggiContestoWorkspace({ cartella: '/x', progetto: 'inventario' }, { exec: () => 'main' }).progetto, 'inventario');
  assert.equal(leggiContestoWorkspace({ cartella: '/x' }, { exec: () => 'main' }).progetto, null);
});

/*
 * ⭐⭐⭐ 04/9 — W1-13, `repoAnnidati`. Un repository git VERO (`git init`),
 * mai una cartella `.git` finta: stessa disciplina "vero, non finto" già
 * in uso dal resto di questo file (vedi `quiRepo` in cima).
 */

test('repoAnnidati: una sottocartella con un repository git VERO è trovata', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'repo-annidati-'));
  try {
    const sotto = join(workspace, 'progetto-annidato');
    mkdirSync(sotto);
    creaRepoVero(sotto);
    assert.deepEqual(repoAnnidati(workspace), ['progetto-annidato']);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('repoAnnidati AL CONTRARIO: una sottocartella VERA ma SENZA .git non è trovata', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'repo-annidati-'));
  try {
    mkdirSync(join(workspace, 'cartella-normale'));
    assert.deepEqual(repoAnnidati(workspace), []);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('repoAnnidati: node_modules è SALTATA anche se contiene un repository git vero', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'repo-annidati-'));
  try {
    const dentro = join(workspace, 'node_modules', 'un-pacchetto');
    mkdirSync(dentro, { recursive: true });
    creaRepoVero(dentro);
    assert.deepEqual(repoAnnidati(workspace), []);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('repoAnnidati AL CONTRARIO: una cartella con un nome SIMILE a node_modules (non esatto) NON è saltata — match esatto sul nome, non un prefisso', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'repo-annidati-'));
  try {
    const sotto = join(workspace, 'node_modules_extra');
    mkdirSync(sotto);
    creaRepoVero(sotto);
    assert.deepEqual(repoAnnidati(workspace), ['node_modules_extra']);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('repoAnnidati: una cartella radice illeggibile (inesistente) non lancia — elenco vuoto, non un\'eccezione', () => {
  assert.deepEqual(repoAnnidati('C:\\percorso\\che\\di-sicuro-non-esiste-talos'), []);
});

test('repoAnnidati AL CONTRARIO: input degenere (non stringa/vuoto) torna elenco vuoto, non un\'eccezione', () => {
  assert.deepEqual(repoAnnidati(undefined), []);
  assert.deepEqual(repoAnnidati(''), []);
  assert.deepEqual(repoAnnidati(123), []);
});

test('leggiContestoWorkspace: repoAnnidati è nel contesto restituito, sullo stesso repo git VERO usato per branch', () => {
  const contesto = leggiContestoWorkspace({ cartella: quiRepo, progetto: null });
  assert.ok(Array.isArray(contesto.repoAnnidati), 'sempre un array, mai undefined');
});

/*
 * ⛔⛔ IL WORKTREE — il campo che il pannello «Ambiente» scriveva CABLATO a «—».
 *
 * Visto dal vivo il 10/09 sul 4174: «Ramo lane/harness-desktop» accanto a «Worktree —», nello stesso
 * pannello, mentre la sessione girava dentro un worktree collegato. Il commento che difendeva il
 * trattino diceva «mai un repository git nel corpus di oggi» — vero per i task del corpus (copie di
 * tre file), falso per una cartella dell'allowlist, e la riga sopra lo smentiva già da sola.
 *
 * Il modo di rilevarlo NON è confrontare `--git-dir` con `--git-common-dir` (git-scm.com/docs/
 * git-worktree e la doc di git-rev-parse, lette il 10/09/2026): è cercare il segmento `worktrees/`
 * dentro `--git-dir` — `$GIT_COMMON_DIR` può essere definito a mano e rendere il confronto bugiardo.
 */

test('worktree: dentro un worktree collegato si legge il suo nome', () => {
  const esito = leggiContestoWorkspace({ cartella: '/qualunque', progetto: null }, {
    exec: (comando, argomenti) => {
      if (argomenti.includes('--git-dir')) return 'C:/Users/x/projects/AVM/.git/worktrees/AVM-harness-desktop\n';
      return 'lane/harness-desktop\n';
    },
  });
  assert.equal(esito.worktree, 'AVM-harness-desktop');
  assert.equal(esito.branch, 'lane/harness-desktop');
});

test('worktree: le due barre di Windows valgono come quelle di git', () => {
  const esito = leggiContestoWorkspace({ cartella: '/qualunque', progetto: null }, {
    exec: (comando, argomenti) => (argomenti.includes('--git-dir')
      ? `${String.raw`C:\Users\x\projects\AVM\.git\worktrees\lane-mobile`}\n`
      : 'main\n'),
  });
  assert.equal(esito.worktree, 'lane-mobile', '⛔ git e Windows mescolano le barre nello stesso percorso');
});

/*
 * ⛔ AL CONTRARIO, e sono i due casi in cui «—» è la risposta GIUSTA: il worktree principale non è
 * un worktree collegato, e una cartella che non è un repo non ne ha nessuno.
 */
test('worktree, AL CONTRARIO: nel worktree principale è null, non una stringa vuota', () => {
  const esito = leggiContestoWorkspace({ cartella: '/qualunque', progetto: null }, {
    exec: (comando, argomenti) => (argomenti.includes('--git-dir') ? '.git\n' : 'main\n'),
  });
  assert.equal(esito.worktree, null, '⛔ il principale NON è un worktree collegato: il trattino è onesto');
});

test('worktree, AL CONTRARIO: se git non risponde non si inventa niente', () => {
  const esito = leggiContestoWorkspace({ cartella: '/qualunque', progetto: null }, {
    exec: () => { throw new Error('git non installato'); },
  });
  assert.equal(esito.worktree, null);
  assert.equal(esito.branch, null, 'e l’avvio della sessione non si ferma per questo');
});

test('worktree, AL CONTRARIO: un percorso che finisce con «worktrees» non ha un nome da dare', () => {
  const esito = leggiContestoWorkspace({ cartella: '/qualunque', progetto: null }, {
    exec: (comando, argomenti) => (argomenti.includes('--git-dir') ? '/repo/.git/worktrees\n' : 'main\n'),
  });
  assert.equal(esito.worktree, null, '⛔ meglio nessun nome che un nome inventato dall’indice successivo');
});
