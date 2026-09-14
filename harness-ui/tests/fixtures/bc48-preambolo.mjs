import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { contestoDelProgetto, segnalaFileCambiati } from '../../src/contesto-del-progetto.mjs';
import { rimuoviCartellaDiProvaAttesa } from '../aiuto/rimuovi-cartella-di-prova.mjs';

/** Progetto isolato: nessun comando git, nessuna rete, due stati con gli stessi file. */
export async function progettoBC48() {
  const temporanea = await mkdtemp(join(tmpdir(), 'talos-bc48-'));
  const cartella = join(temporanea, 'bc48-progetto');
  const contenuti = {
    '.git/HEAD': 'ref: refs/heads/prova\n',
    'AGENTS.md': '# Regole\nRispondi in italiano. Verifica con npm test.\n',
    'package.json': '{"scripts":{"test":"node --test"}}\n',
    'src/uno.mjs': 'export const valore = 1;\n',
    'tests/uno.test.mjs': '// Prova dimostrativa.\n',
  };
  for (const [nome, testo] of Object.entries(contenuti)) {
    const pieno = join(cartella, nome);
    await mkdir(join(pieno, '..'), { recursive: true });
    await writeFile(pieno, testo, 'utf8');
  }
  let ora = Date.UTC(2026, 8, 12, 17);
  let modificato = false;
  const deps = {
    adesso: () => ora,
    eseguiGit: async (args) => {
      if (args[0] === 'rev-parse') return args[1] === '--is-inside-work-tree' ? 'true\n' : 'prova\n';
      if (args[0] === 'status') return modificato ? ' M src/uno.mjs\n' : '';
      return null;
    },
  };
  return {
    cartella, deps,
    costruisci: (extra = {}) => contestoDelProgetto({ cartella, deps, ...extra }),
    cambiaGitDopoUnMinuto() { ora += 60_000; modificato = true; segnalaFileCambiati(cartella); },
    async chiudi() {
      segnalaFileCambiati(cartella);
      const destinazione = resolve(temporanea);
      if (!destinazione.startsWith(resolve(tmpdir()) + sep) || !destinazione.split(sep).at(-1).startsWith('talos-bc48-')) throw new Error('Cartella temporanea fuori dal perimetro della prova');
      await rimuoviCartellaDiProvaAttesa(destinazione);
    },
  };
}

export function separaBlocchi(testo) {
  const intestazioni = { istruzioni: 'Istruzioni di questo progetto — ', mappa: 'Struttura di «', scheda: 'Scheda di lavoro — ' };
  const posizioni = Object.entries(intestazioni).map(([nome, inizio]) => ({ nome, indice: testo.indexOf(inizio) })).filter(p => p.indice >= 0).sort((a, b) => a.indice - b.indice);
  return Object.fromEntries(posizioni.map((p, i) => [p.nome, testo.slice(p.indice, i + 1 < posizioni.length ? posizioni[i + 1].indice - 2 : undefined)]));
}

export function primoByteDiverso(a, b) {
  const x = Buffer.from(a, 'utf8'); const y = Buffer.from(b, 'utf8');
  let i = 0;
  while (i < Math.min(x.length, y.length) && x[i] === y[i]) i += 1;
  return i === x.length && i === y.length ? null : i;
}
