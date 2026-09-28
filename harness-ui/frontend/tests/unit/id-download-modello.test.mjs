import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corpoDownloadHf, idDelDownload } from '../../src/components/scheda-modello.js';

/*
 * ⛔⛔⛔ 25/09/2026 sera, bug dell'owner con la foto: il Qwen3.8-27B appena scaricato dava «Avvio non riuscito: Query non
 *   valida» a ogni messaggio. Il suo id era tagliato a 120 caratteri e il taglio cadeva su un trattino. Il costruttore era
 *   scritto in TRE copie (`scheda-modello.js` e due in `legacy/app.js`), tutte col taglio nudo.
 * ⇒ Uno solo, e dopo il taglio si tolgono i separatori in coda: è ciò che fa Hermes quando taglia un nome
 *   (`hermes_cli/kanban_transfer.py:195`, `preferred[:58].rstrip("-_")`, clone 65ad529 del 23/09/2026).
 */
const ID_ARCHIVIO = /^[a-z0-9][a-z0-9._-]{0,127}$/iu; // `local-model-store.mjs`, FORMA_ID_MODELLO_LOCALE
const QWEN = {
  repo: 'HauhauCS/Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF',
  revision: '993a5971fda8f30dd1b7eb2654792ba4415c7460',
  path: 'Qwen3.8-27B-Uncensored-HauhauCS-Aggressive-Q4_K_P.gguf',
};

test('ID-DOWNLOAD: il taglio non lascia un separatore in coda (il caso vero del Qwen dell\'owner)', () => {
  const id = idDelDownload(QWEN.repo, QWEN.revision, QWEN.path);
  assert.equal(id, 'HauhauCS-Qwen3-8-27B-Uncensored-HauhauCS-Aggressive-MTP-GGUF-993a5971fda8-Qwen3-8-27B-Uncensored-HauhauCS-Aggressive-Q4');
  assert.match(id, /[a-z0-9]$/iu, 'finisce con una lettera o una cifra');
  assert.ok(id.length <= 120);
  assert.match(id, ID_ARCHIVIO);
});

test('ID-DOWNLOAD, al contrario: un id che non tocca il tetto resta IDENTICO a quello di prima', () => {
  /* ⛔ Il MiniCPM5 dell'owner è sul disco con questo id: cambiarlo farebbe riscaricare un modello che c'è già. */
  assert.equal(
    idDelDownload('openbmb/MiniCPM5-2B-GGUF', '2079a22f3beaa4e306449978533478fe0522f4b3', 'MiniCPM5-2B-F16.gguf'),
    'openbmb-MiniCPM5-2B-GGUF-2079a22f3bea-MiniCPM5-2B-F16-gguf',
  );
  assert.equal(idDelDownload('org/nome', '', 'file.gguf'), 'org-nome-main-file-gguf', 'senza revisione vale «main», come prima');
});

test('ID-DOWNLOAD: il corpo del download usa lo stesso id, e app.js non ha più una copia sua', () => {
  const corpo = corpoDownloadHf({ repo: QWEN.repo, revision: QWEN.revision }, { bytes: 1, file: [{ path: QWEN.path, sizeBytes: 1, sha256: 'a'.repeat(64) }] });
  assert.equal(corpo.id, idDelDownload(QWEN.repo, QWEN.revision, QWEN.path));
  assert.equal(corpo.path, corpo.id);
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  assert.equal(app.split('.slice(0, 120)').length - 1, 0, 'nessun costruttore dell\'id copiato in app.js');
  assert.ok(app.split('idDelDownload(').length - 1 >= 2, 'le due strade di app.js usano quello unico');
});
