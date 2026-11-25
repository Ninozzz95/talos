/*
 * Riga 199, giro unico (punto 4, reperto A-R3; vecchio) — in Accesso pieno `Remove-Item -Recurse \\.\UNC\H\c\x` non chiedeva, mentre
 *   `\\H\c\x` è una cancellazione critica (primo livello della condivisione): il lettore delle cancellazioni non riportava le forme lunghe
 *   di rete alla loro forma corta. Ora sì, con `portaInRete`, anche con punti e spazi in coda (punto 1). Spia chiusa, ospite inventato.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { verificaPermessoScrittura } = await import('../src/kernel/talosHarness.mjs');
const { cancellazioneCritica, dimenticaPercorsiVeri } = await import('../src/kernel/cancellazioni-critiche.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE } = S;

const solo = { skip: process.platform !== 'win32' && 'solo Windows' };
const LUNGHE = [`${B}${B}.${B}UNC${B}${OSPITE}${B}c${B}x`, `${B}${B}?${B}UNC${B}${OSPITE}${B}c${B}x`, `//./unc/${OSPITE}/c/x`, `${B}${B}.${B}UNC.${B}${OSPITE}${B}c${B}x`,
  `${B}${B}?${B}GLOBALROOT${B}Device${B}Mup${B}${OSPITE}${B}c${B}x`, `${B}${B}.${B}GLOBAL${B}GLOBALROOT${B}??${B}UNC${B}${OSPITE}${B}c${B}x`];

test('R199-R3: in Accesso pieno cancellare una forma lunga di rete chiede come la forma corta (carta critica), 0 tocchi', solo, async (t) => {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-r3-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  S.azzera();
  const senzaCarta = [];
  for (const p of LUNGHE) {
    for (const comando of [`Remove-Item -Recurse ${p}`, `rm -rf ${p}/`, `rd /s /q ${p}`]) {
      dimenticaPercorsiVeri();
      const lettore = cancellazioneCritica(comando, { cartella: c });
      const chieste = [];
      await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso: 'accesso-pieno', cartella: c, consensiSessione: {}, chiediApprovazioneFn: async (a) => { chieste.push(a); return false; } });
      if (!lettore || !chieste.some((a) => a.cancellazioneCritica)) senzaCarta.push(comando);
    }
  }
  assert.deepEqual(S.elencoDeiTocchi(), []);
  assert.deepEqual(senzaCarta, []);
});
