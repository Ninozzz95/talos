import { build, Platform, Arch } from 'electron-builder';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { verificaImpronta } from './prepara-pacchetto.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
process.env.ELECTRON_BUILDER_CACHE ||= join(root, '.cache-r02', 'builder');
try {
  const manifest = JSON.parse(await readFile(join(root, '.staging/MANIFEST.json'), 'utf8'));
  if (manifest.electron !== '44.3.0' || manifest.electronBuilder !== '26.16.1') throw new Error('Staging non compatibile: eseguire npm run prepara.');
  if (process.env.TALOS_R02_BUILDER_NETWORK !== '1') {
    // Il brief R-02 permette npm e llama.cpp. Non estendere implicitamente la rete.
    for (const [cartella, nome, hash] of [
      ['nsis@1.2.1', 'nsis-bundle-3.12.tar.gz', '56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4'],
      ['7zip@1.0.0', '7zip-win-x64.tar.gz', 'be071f15bd6da2f78fe81c6ddef2009b0c4d8a51f36b780cb806c7e6df95e1b3'],
    ]) {
      try { await verificaImpronta(join(process.env.ELECTRON_BUILDER_CACHE, cartella, nome), hash); }
      catch { throw new Error(`Cache ufficiale verificata assente: ${nome}. Preparare ELECTRON_BUILDER_CACHE offline oppure autorizzare i download ufficiali e impostare TALOS_R02_BUILDER_NETWORK=1.`); }
    }
  }
  const icone = spawnSync(process.execPath, [join(root, 'scripts/genera-icone.mjs')], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (icone.error || icone.status !== 0) throw new Error('Generazione icone fallita.');
  await build({ projectDir: root, targets: Platform.WINDOWS.createTarget(['nsis', 'zip'], Arch.x64), publish: 'never' });
} catch (e) { console.error(`Distribuzione fallita: ${e.message}`); process.exitCode = 1; }
