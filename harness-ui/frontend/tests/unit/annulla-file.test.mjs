import test from 'node:test';
import assert from 'node:assert/strict';
import { diffPerFile, pianoDalMessaggio } from '../../src/components/annulla-file.js';

/*
 * 18/10/2026 — R5.11 «Annulla le modifiche ai file», le due parti pure della finestra: quale punto vale per un messaggio della
 * persona, e il diff diviso file per file.
 */
test('ANN-UI-01 il punto di un messaggio è il primo nato a quel turno o dopo (sequenza del RunStarted)', () => {
  const punti = [{ turno: 3, seqAvvio: 40, annullabile: true }, { turno: 1, seqAvvio: 5, annullabile: true }, { turno: 5, seqAvvio: 90, annullabile: false }];
  assert.equal(pianoDalMessaggio(punti, 5).turno, 1, 'il messaggio stesso');
  assert.equal(pianoDalMessaggio(punti, 6).turno, 3, 'un messaggio senza scritture: il primo dopo');
  assert.equal(pianoDalMessaggio(punti, 41).turno, 5, 'anche un punto non annullabile si sceglie: la finestra dice perché');
  assert.equal(pianoDalMessaggio(punti, 91), null, 'dopo l\'ultimo punto TALOS non ha scritto niente');
});

test('ANN-UI-02 al contrario: punti senza sequenza (nati prima di questa versione) e argomenti storti non valgono', () => {
  assert.equal(pianoDalMessaggio([{ turno: 1, annullabile: true }], 1), null);
  assert.equal(pianoDalMessaggio(null, 1), null);
  assert.equal(pianoDalMessaggio([{ turno: 1, seqAvvio: 3 }], Number.NaN), null);
});

test('ANN-UI-03 il diff di più file si divide per percorso: modificato, nuovo, cancellato, con spazi e lettere accentate', () => {
  const testo = [
    'diff --git a/src/a.txt b/src/a.txt', 'index 1..2 100644', '--- a/src/a.txt', '+++ b/src/a.txt', '@@ -1 +1 @@', '-uno', '+due',
    'diff --git a/nuovo file.txt b/nuovo file.txt', 'new file mode 100644', '--- /dev/null', '+++ b/nuovo file.txt\t', '@@ -0,0 +1 @@', '+ciao',
    'diff --git a/città.md b/città.md', 'deleted file mode 100644', '--- a/città.md', '+++ /dev/null', '@@ -1 +0,0 @@', '-via',
    '',
  ].join('\n');
  const d = diffPerFile(testo);
  assert.deepEqual([...d.keys()], ['src/a.txt', 'nuovo file.txt', 'città.md']);
  assert.match(d.get('src/a.txt'), /-uno\n\+due/);
  assert.doesNotMatch(d.get('src/a.txt'), /ciao/, 'ogni pezzo ha solo il suo file');
  assert.equal(diffPerFile('').size, 0);
});
