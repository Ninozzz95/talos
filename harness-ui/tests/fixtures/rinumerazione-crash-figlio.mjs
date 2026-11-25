/*
 * Un processo TALOS VERO che ripristina un giornale coi numeri doppi e viene UCCISO dal padre in un punto della rinumerazione, per
 * `tests/affitto-crash-rinumerazione.test.mjs` (13/11/2026). argv: <cartellaStore> <punto>
 *   Il registro vero col suo ripristino, lo store vero con l'affitto; solo l'operazione del punto è avvolta: fa il suo lavoro VERO, poi
 *   stampa `PUNTO <nome>` e si ferma (un timer tiene vivo il processo) finché il padre non lo uccide (TerminateProcess su Windows).
 *   · `durante-copia`: la copia accanto scritta a metà (metà dei byte), poi il punto;
 *   · `dopo-temporaneo`: il primo blocco del temporaneo scritto, poi il punto (prima del fsync e del rename);
 *   · `dopo-rename`: il rename del giornale rinumerato fatto, poi il punto (prima di qualunque altra cosa).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as store from '../../src/session-store.mjs';
import { createSessionRegistry } from '../../src/session-registry.mjs';

const [cartellaStore, punto] = process.argv.slice(2);
const fermati = async (nome) => {
  process.stdout.write(`PUNTO ${nome}\n`);
  setInterval(() => {}, 1_000);
  await new Promise(() => {});
};
const deps = {
  'durante-copia': {
    copyFileFn: async (sorgente, destinazione) => {
      const tutto = readFileSync(sorgente);
      writeFileSync(destinazione, tutto.subarray(0, tutto.length >> 1), { flag: 'wx' });
      await fermati('durante-copia');
    },
  },
  'dopo-temporaneo': {
    scriviFn: async (fh, buf) => { await fh.write(buf); await fermati('dopo-temporaneo'); },
  },
  'dopo-rename': {
    renameFn: async (da, a) => { await fsp.rename(da, a); await fermati('dopo-rename'); },
  },
}[punto];
if (!deps) { process.stderr.write(`unknown point ${punto}\n`); process.exit(2); }

store.attivaAffittiArchivio(cartellaStore, { etichetta: 'the child killed while renumbering', battitoMs: 0 });
const registro = createSessionRegistry({ cartellaStore, affittoFraProcessi: { etichetta: 'the child killed while renumbering' },
  avviaSessioneFn: async () => ({ ok: true }), guardaWorkspaceFn: () => () => {}, modello: 'm', chiave: 'k',
  rinumeraGiornaleFn: (argomenti) => store.rinumeraDoppiDelGiornale(argomenti, deps) });
await registro.ripristina();
process.stdout.write('FINITO senza punto\n');
process.exit(3);
