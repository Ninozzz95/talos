// BC48-B: misura offline; nessun token fatturato e nessuna chiamata al modello.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { trovaIstruzioniDiProgetto, testoIstruzioniDiProgetto } from '../../src/istruzioni-di-progetto.mjs';
import { contestoDelProgetto } from '../../src/contesto-del-progetto.mjs';
import { creaFiltroGitignore } from '../../src/gitignore-elenco.mjs';
import { costoElenco } from '../../src/costo-elenco.mjs';
import { separaBlocchi } from './bc48-preambolo.mjs';

export const RADICE = fileURLToPath(new URL('../../../', import.meta.url));
export const FILE_ISTRUZIONI = ['AGENTS.md', 'core/AGENTS.md', 'validator/AGENTS.md', 'control-plane/AGENTS.md', 'harness-ui/AGENTS.md'];
const primaUrl = new URL('./bc48-b-prima.json', import.meta.url);
const dopoUrl = new URL('./bc48-b-dopo.json', import.meta.url);
const sha256 = testo => createHash('sha256').update(testo).digest('hex');

export async function leggiPrima() {
  return JSON.parse(await readFile(primaUrl, 'utf8'));
}

export function misuraTesto(testo) {
  const byte = Buffer.byteLength(testo, 'utf8');
  return { byte, tokenStimatiA: Math.ceil(byte / 4), tokenStimatiProdotto: costoElenco(testo, { metodo: 'stimato' }).token, sha256: sha256(testo) };
}

export async function misuraCatene({ desktopStabile } = {}) {
  const catene = {};
  for (const cwd of ['.', 'harness-ui', 'core', 'control-plane']) {
    const trovati = await trovaIstruzioniDiProgetto(join(RADICE, cwd));
    const resa = testoIstruzioniDiProgetto(trovati);
    catene[cwd] = { ...misuraTesto(resa.testo), usati: resa.usati, omessi: resa.omessi, indicizzati: resa.indicizzati, testo: resa.testo };
  }
  let stabile = desktopStabile;
  if (!stabile) {
    const esito = await contestoDelProgetto({
      cartella: join(RADICE, 'harness-ui'), statoVolatile: false,
      creaFiltro: radice => creaFiltroGitignore({ radice }),
      deps: { eseguiGit: async () => null },
    });
    const { mappa, scheda } = separaBlocchi(esito.testo);
    if (!mappa || !scheda) throw new Error('Mappa o scheda desktop assente: confronto non valido');
    stabile = { mappa, scheda };
  }
  const testo = [catene['harness-ui'].testo, stabile.mappa, stabile.scheda].join('\n\n');
  return { metodo: 'Byte UTF-8 misurati; token stimati ceil(byte/4) come A e ceil(byte/3,5) dal prodotto. Non token fatturati.',
    catene, desktopStabile: stabile, preamboloDesktop: { ...misuraTesto(testo), testo },
    bersaglio: { massimoToken: 900, raggiuntoStimaA: misuraTesto(testo).tokenStimatiA <= 900, raggiuntoStimaProdotto: misuraTesto(testo).tokenStimatiProdotto <= 900 } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    let risultato;
    if (process.argv.includes('--salva-prima')) {
      const originale = await readFile(join(RADICE, 'AGENTS.md'), 'utf8');
      if (sha256(originale) !== 'd7b56001cc35767f889d4aa4f40decb2a3cebab78fcc97c11eb929ba9493b9ac') throw new Error('La cattura prima richiede il vero originale di A');
      const proposta = await readFile(join(RADICE, '.claude/BC48-B-PROPOSTA-TESTI-2026-09-12.md'), 'utf8');
      const blocchi = [...proposta.matchAll(/```markdown\r?\n([\s\S]*?)```/g)].map(m => m[1]);
      if (blocchi.length !== 2) throw new Error('Attesi esattamente i due testi approvati');
      risultato = { originale, originaleSha256: sha256(originale), approvati: { sezione3: blocchi[0], desktop: blocchi[1] }, ...await misuraCatene() };
      await writeFile(primaUrl, JSON.stringify(risultato, null, 2) + '\n', { flag: 'wx' });
    } else {
      const prima = await leggiPrima();
      risultato = await misuraCatene({ desktopStabile: prima.desktopStabile });
      if (process.argv.includes('--salva-dopo')) await writeFile(dopoUrl, JSON.stringify(risultato, null, 2) + '\n');
    }
    console.log(JSON.stringify({ catene: Object.fromEntries(Object.entries(risultato.catene).map(([cwd, { testo, ...misura }]) => [cwd, misura])),
      preamboloDesktop: Object.fromEntries(Object.entries(risultato.preamboloDesktop).filter(([nome]) => nome !== 'testo')), bersaglio: risultato.bersaglio }, null, 2));
    if (process.argv.includes('--verifica-bersaglio') && (!risultato.bersaglio.raggiuntoStimaA || !risultato.bersaglio.raggiuntoStimaProdotto)) {
      console.error('BC48-B-BERSAGLIO: preambolo desktop sopra 900 token stimati; testi approvati conservati.');
      process.exitCode = 1;
    }
  } catch (errore) {
    console.error(`Misura BC48-B fallita: ${errore.message}`);
    process.exitCode = 1;
  }
}
