/*
 * Riga 199 (PC 0.2.5, 22/11/2026) — T7: GIÀ USCITO dalla 0.2.1. Per una cancellazione con la barra in coda, `Remove-Item`/`ri` o
 *   `del /s`, il lettore delle cancellazioni critiche cerca il percorso vero del bersaglio (un collegamento verso un posto critico), a
 *   ogni livello e anche dalla carta prevista delle chiamate emulate. Per un bersaglio su un altro computer quella ricerca è già il
 *   contatto SMB, prima della carta. Qui le porte del disco sono spiate (`aiuto/spia-di-rete-025.mjs`): ospite inventato, nessuna rete.
 *   Le cancellazioni di un disco LOCALE scritto per esteso restano critiche (le prova anche `rete-prima-della-carta-tocchi`).
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const S = await import('./aiuto/spia-di-rete-025.mjs');
after(S.togliLaSpia);
const { verificaPermessoScrittura, cartaForzataPrevista } = await import('../src/kernel/talosHarness.mjs');
const { cancellazioneCritica, dimenticaPercorsiVeri } = await import('../src/kernel/cancellazioni-critiche.mjs');
const { rimuoviCartellaDiProva } = await import('./aiuto/rimuovi-cartella-di-prova.mjs');
const { B, OSPITE, NAS, unc } = S;

const solo = { skip: process.platform !== 'win32' && 'solo Windows: fuori da Windows `\\\\x` non è la rete' };
const BERSAGLI = [
  unc(OSPITE, 'cond', 'x'), `//${OSPITE}/cond/x`, `${B}${B}?${B}UNC${B}${OSPITE}${B}cond${B}x`, `${B}${B}.${B}UNC${B}${OSPITE}${B}cond${B}x`,
  unc(`${OSPITE}@SSL`, 'cond', 'x'), `${B}${B}?${B}GLOBALROOT${B}Device${B}Mup${B}${OSPITE}${B}cond${B}x`,
  `${B}${B}?${B}GLOBAL${B}GLOBALROOT${B}??${B}UNC${B}${OSPITE}${B}cond${B}x`,
];
const cancellazioni = (p) => [`rm -rf ${p}/`, `rm -rf "${p}${B}"`, `Remove-Item -Recurse -Force ${p}`, `ri -r ${p}`, `del /s /q ${p}`, `rd /s /q ${p}${B}`];

function progetto(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-r199-f3-'));
  mkdirSync(join(c, 'src'));
  t.after(() => rimuoviCartellaDiProva(c));
  return c;
}

test('R199-T7: una cancellazione verso un altro computer non lo tocca prima della carta, dal lettore, dal cancello e dalla carta prevista', solo, async (t) => {
  const c = progetto(t);
  S.azzera();
  const per = { lettore: 0, cancello: 0, prevista: 0 };
  for (const p of BERSAGLI) {
    for (const comando of cancellazioni(p)) {
      let prima = S.tocchi.length;
      dimenticaPercorsiVeri();
      cancellazioneCritica(comando, { cartella: c });
      per.lettore += S.tocchi.length - prima;
      prima = S.tocchi.length;
      for (const livelloAccesso of ['accesso-pieno', 'su-richiesta', 'scrittura-progetto']) {
        await verificaPermessoScrittura({ toolCallId: 'r', tipo: 'shell', comando }, { livelloAccesso, cartella: c, consensiSessione: {}, chiediApprovazioneFn: async () => false });
      }
      per.cancello += S.tocchi.length - prima;
      prima = S.tocchi.length;
      await cartaForzataPrevista('shell', { comando }, { livelloAccesso: 'su-richiesta', cartella: c, consensiSessione: {} });
      per.prevista += S.tocchi.length - prima;
    }
  }
  t.diagnostic(`tocchi: lettore ${per.lettore}, cancello ${per.cancello}, carta prevista ${per.prevista}`);
  assert.deepEqual(S.elencoDeiTocchi(), [], 'nessun contatto con l ospite prima della carta');
});

test('R199-T7-CONTROPROVA: col progetto su una condivisione, il bersaglio dentro il progetto si legge come oggi', solo, async () => {
  const c = unc(NAS, 'lavoro', 'progetto');
  S.azzera();
  dimenticaPercorsiVeri();
  cancellazioneCritica(`rm -rf ${c}${B}src/`, { cartella: c });
  assert.ok(S.delNas.some((p) => /realpath/u.test(p)), 'il percorso vero dentro la condivisione del progetto si cerca come oggi');
  assert.deepEqual(S.elencoDeiTocchi(), []);
});
