/*
 * Owner 16/10/2026 notte («Cartella + radice + casa») — un HARD LINK col nome innocuo è lo stesso file del segreto. Dalla riverifica
 * del bugfixer (SEG-DOC-RI-05): leggi, scrivi, file_edit, la shell e document_create non chiedevano. Ora, per i file con più di un nome,
 * si confronta l'identità (dev + ino) coi segreti per nome della cartella del file, della radice del progetto e della casa.
 * Collegamenti VERI su disco (`fs.linkSync`, su NTFS non serve nessun privilegio). Ogni caso anche AL CONTRARIO.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { motivoDaChiedere } from '../src/path-policy.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function scena(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-hard-link-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  const progetto = join(radice, 'progetto');
  const casa = join(radice, 'casa');
  mkdirSync(join(progetto, 'docs'), { recursive: true });
  mkdirSync(join(progetto, 'config'), { recursive: true });
  mkdirSync(join(casa, '.ssh'), { recursive: true });
  writeFileSync(join(progetto, '.env'), 'API_KEY=sk-vero\n');
  linkSync(join(progetto, '.env'), join(progetto, 'appunti.md'));
  linkSync(join(progetto, '.env'), join(progetto, 'docs', 'leggimi.txt'));
  writeFileSync(join(casa, '.ssh', 'id_ed25519'), 'chiave privata finta\n');
  linkSync(join(casa, '.ssh', 'id_ed25519'), join(progetto, 'chiave.txt'));
  writeFileSync(join(progetto, 'a.txt'), 'innocuo\n');
  linkSync(join(progetto, 'a.txt'), join(progetto, 'b.txt'));
  writeFileSync(join(progetto, 'config', '.env'), 'ALTRO=1\n');
  linkSync(join(progetto, 'config', '.env'), join(progetto, 'docs', 'note.txt'));
  return { progetto, casa };
}
const chiedi = (tipo, x, { progetto, casa }) => motivoDaChiedere(tipo === 'shell'
  ? { tipo, comando: x, cartella: progetto, home: casa, puntiNascosti: false }
  : { tipo, percorso: x, cartella: progetto, home: casa, puntiNascosti: false });

test('HARD-LINK-01 — a hard link to .env asks for read, write, file_edit and the shell, and says which secret it is', (t) => {
  const s = scena(t);
  for (const [tipo, x] of [['leggi', 'appunti.md'], ['scrivi', 'appunti.md'], ['file_edit', 'appunti.md'], ['shell', 'cat appunti.md'], ['leggi', 'docs/leggimi.txt']]) {
    const r = chiedi(tipo, x, s);
    assert.ok(r, `${tipo} ${x}: must ask`);
    assert.equal(r.classe, 'segreto', `${tipo} ${x}`);
    assert.match(r.percorso, /= .*\.env$/u, `${tipo} ${x}: names the secret (${r.percorso})`);
  }
  assert.equal(chiedi('scrivi', 'appunti.md', s).chiaveDelConsenso, 'scrittura:appunti.md = ' + join(s.progetto, '.env'), 'a write keeps its own consent key');
});

test('HARD-LINK-02 — a hard link to a home credential (~/.ssh/id_ed25519) asks too', (t) => {
  const s = scena(t);
  const r = chiedi('leggi', 'chiave.txt', s);
  assert.ok(r, 'must ask');
  assert.match(r.percorso, /id_ed25519$/u);
});

test('HARD-LINK-03 — AL CONTRARIO: two harmless files linked together stay silent, and a secret in ANOTHER subfolder is out of scope (owner)', (t) => {
  const s = scena(t);
  assert.equal(chiedi('leggi', 'a.txt', s), null);
  assert.equal(chiedi('scrivi', 'b.txt', s), null);
  assert.equal(chiedi('shell', 'cat b.txt', s), null);
  /* `docs/note.txt` = `config/.env`: né nella cartella del file (docs), né nella radice, né nella casa — fuori dal perimetro scelto */
  assert.equal(chiedi('leggi', 'docs/note.txt', s), null);
  /* e un file con un nome solo non fa nessun confronto */
  writeFileSync(join(s.progetto, 'solo.txt'), 'x');
  assert.equal(chiedi('leggi', 'solo.txt', s), null);
});

test('HARD-LINK-04 — AL CONTRARIO: the same inode on ANOTHER volume (dev differs) is another file, never «the .env»', (t) => {
  const s = scena(t);
  writeFileSync(join(s.progetto, 'altro.md'), 'testo\n');
  const finto = (dev) => ({ isFile: () => true, nlink: 2n, dev, ino: 77n, size: 10n });
  const statSync = (p) => (String(p).endsWith('altro.md') ? finto(1n) : String(p).endsWith('.env') ? finto(2n) : { isFile: () => false, nlink: 1n, dev: 0n, ino: 0n, size: 0n });
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'altro.md', cartella: s.progetto, home: s.casa, puntiNascosti: false, fsSync: { statSync } }), null);
  /* e lo stesso dev + ino è lo stesso file: chiede (il controllo positivo della prova) */
  const stesso = (p) => (String(p).endsWith('altro.md') || String(p).endsWith('.env') ? finto(1n) : { isFile: () => false, nlink: 1n, dev: 0n, ino: 0n, size: 0n });
  assert.equal(motivoDaChiedere({ tipo: 'leggi', percorso: 'altro.md', cartella: s.progetto, home: s.casa, puntiNascosti: false, fsSync: { statSync: stesso } })?.classe, 'segreto');
});
