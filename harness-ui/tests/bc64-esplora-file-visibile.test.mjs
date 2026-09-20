import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { createProcessPolicy } from '../src/process-policy.mjs';
import { EXPLORER_PROCESS_POLICY } from '../src/workspace-files.mjs';

/*
 * BC-64 (owner, 17/09/2026, dal vivo): «la funzione visualizza in esplora file non apre nessuna finestra».
 * Misurato su questa macchina: `explorer.exe /select,<file>` lanciato con `windowsHide: true` crea la finestra
 * con `Visible=False` — esiste, non si vede; con `false` è `Visible=True`. La politica di processo imponeva
 * `true` a tutti. Qui si prova l'argv VERO che arriva a `execFile`, nei due versi: Esplora si vede, tutto il
 * resto resta nascosto.
 */
function politicaConSpia(opzioni) {
  const chiamate = [];
  const politica = createProcessPolicy({
    ...opzioni,
    execFileFn: (comando, args, options, callback) => { chiamate.push({ comando, args, options }); callback?.(null, '', ''); return { pid: 1 }; },
  });
  return { politica, chiamate };
}

test('BC64-01 — la politica di serie NASCONDE la finestra: un processo di servizio non fa lampeggiare una console', () => {
  const { politica, chiamate } = politicaConSpia({ allowedExecutables: ['git.exe', 'git'] });
  politica.execFile('git', ['--version'], { cwd: tmpdir() }, () => {});
  assert.equal(chiamate.length, 1);
  assert.equal(chiamate[0].options.windowsHide, true);
  assert.equal(chiamate[0].options.shell, false);
});

test('BC64-02 — una politica che dichiara `finestreVisibili` lancia con la finestra VISIBILE', () => {
  const { politica, chiamate } = politicaConSpia({ allowedExecutables: ['explorer.exe', 'explorer'], finestreVisibili: true });
  politica.execFile('explorer.exe', ['/select,C:\\x\\file.txt'], { cwd: tmpdir() }, () => {});
  assert.equal(chiamate[0].options.windowsHide, false, 'con SW_HIDE Esplora nasce invisibile: è il difetto che l\'owner ha visto');
  assert.equal(chiamate[0].options.shell, false, 'la visibilità non allenta nient\'altro');
  assert.deepEqual(chiamate[0].args, ['/select,C:\\x\\file.txt'], 'gli argomenti restano argomenti');
});

test('BC64-03 — chi chiama NON può scavalcare la politica dall\'esterno, in nessuno dei due versi', () => {
  const nascosta = politicaConSpia({ allowedExecutables: ['git'] });
  nascosta.politica.execFile('git', ['--version'], { cwd: tmpdir(), windowsHide: false }, () => {});
  assert.equal(nascosta.chiamate[0].options.windowsHide, true);
  const visibile = politicaConSpia({ allowedExecutables: ['explorer.exe'], finestreVisibili: true });
  visibile.politica.execFile('explorer.exe', [], { cwd: tmpdir(), windowsHide: true }, () => {});
  assert.equal(visibile.chiamate[0].options.windowsHide, false);
});

test('BC64-04 — `finestreVisibili` è un booleano o niente: un valore ambiguo si rifiuta alla nascita', () => {
  for (const storto of ['true', 1, null, {}]) {
    assert.throws(() => createProcessPolicy({ allowedExecutables: ['explorer.exe'], finestreVisibili: storto }), { code: 'POLICY_INVALID' }, String(storto));
  }
});

test('BC64-05 — la porta VERA di Esplora file è quella visibile, e ammette solo explorer', () => {
  assert.throws(() => EXPLORER_PROCESS_POLICY.execFile('cmd.exe', ['/c', 'dir'], { cwd: tmpdir() }, () => {}), (e) => /non.*(consentit|ammess|approv)/i.test(e.message) || Boolean(e.code));
  // L'opzione effettiva si legge dal sorgente della porta: l'istanza non espone le opzioni e non lanciamo Esplora in una suite.
});
