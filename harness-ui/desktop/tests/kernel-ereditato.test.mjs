/*
 * L3-8 (owner 13/10/2026, D7: «la ignora e lo scrive nel registro») — l'app INSTALLATA e una `TALOS_OWNER_RUNTIME_MODULE` ereditata.
 *
 * Il fatto: chi ha lavorato da sorgente si ritrova la variabile nell'ambiente della sessione di Windows (il lanciatore la imposta;
 * `scripts/aggiorna-4174.ps1:197` racconta il caso inverso). L'app installata la ereditava e caricava QUEL kernel — un file di un
 * checkout qualunque, o il kernel di base — al posto dell'adattatore che ha nel pacchetto, senza dirlo.
 * Da sorgente (`npm start`) chi la imposta continua a vincere: è così che si sviluppa il kernel.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { creaAvvioFiglio, risolviPercorsi } from '../runtime.mjs';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const comune = { execPath: resolve('Electron.exe'), port: 49152, token: 'a'.repeat(64), reportFile: resolve('report.json'), dataDir: resolve('profilo') };
const installata = risolviPercorsi({ appPath: resolve('app'), isPackaged: true, resourcesPath: resolve('risorse') });
const SUO = join(installata.root, 'src', 'kernel', 'talosHarness.desktop-hotfix.mjs');
const ALTRO = resolve('C:/checkout-vecchio/harness-ui/src/kernel/talosHarness.mjs');

test('KERNEL-EREDITATO-01 — l’app installata ignora la variabile ereditata, usa il SUO adattatore e lo dice', () => {
  const avvio = creaAvvioFiglio({ ...comune, percorsi: installata, installata: true, env: { PATH: 'sistema', TALOS_OWNER_RUNTIME_MODULE: ALTRO } });
  assert.equal(avvio.options.env.TALOS_OWNER_RUNTIME_MODULE, SUO);
  assert.equal(avvio.avvisi.length, 1);
  assert.match(avvio.avvisi[0], /TALOS_OWNER_RUNTIME_MODULE/u);
  assert.ok(avvio.avvisi[0].includes(ALTRO), 'dice che cosa ha ignorato');
  assert.ok(avvio.avvisi[0].includes(SUO), 'e che cosa usa');
});

test('KERNEL-EREDITATO-02, al contrario — niente da dire quando non c’è niente da ignorare; da sorgente chi la imposta vince', () => {
  /* installata, variabile assente o già uguale al suo adattatore: nessun avviso */
  for (const env of [{}, { TALOS_OWNER_RUNTIME_MODULE: '' }, { TALOS_OWNER_RUNTIME_MODULE: SUO }]) {
    const avvio = creaAvvioFiglio({ ...comune, percorsi: installata, installata: true, env });
    assert.equal(avvio.options.env.TALOS_OWNER_RUNTIME_MODULE, SUO);
    assert.deepEqual(avvio.avvisi, []);
  }
  /* da sorgente: la scelta esplicita resta, byte per byte, e non è un avviso */
  const sorgente = risolviPercorsi({ appPath: resolve('desktop') });
  const scelto = creaAvvioFiglio({ ...comune, percorsi: sorgente, env: { TALOS_OWNER_RUNTIME_MODULE: ALTRO } });
  assert.equal(scelto.options.env.TALOS_OWNER_RUNTIME_MODULE, ALTRO);
  assert.deepEqual(scelto.avvisi, []);
  /* chi non dice se è installata (le prove di sempre) vede il comportamento di sempre */
  assert.equal(creaAvvioFiglio({ ...comune, percorsi: installata, env: { TALOS_OWNER_RUNTIME_MODULE: ALTRO } }).options.env.TALOS_OWNER_RUNTIME_MODULE, ALTRO);
});

test('KERNEL-EREDITATO-03 — il guscio passa «installata» da app.isPackaged e scrive gli avvisi nel registro', () => {
  const main = readFileSync(join(desktop, 'main.mjs'), 'utf8');
  const chiamata = main.split('\n').find((riga) => riga.includes('creaAvvioFiglio({'));
  assert.match(chiamata, /installata: app\.isPackaged/u);
  assert.match(main, /for \(const avviso of avvio\.avvisi\) registro\.scrivi\(avviso\);/u);
});
