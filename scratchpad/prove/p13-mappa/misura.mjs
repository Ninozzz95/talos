/*
 * P-13 — quanto costa DIRE al modello quali file esistono.
 *
 * La lezione del 22/8 dà due numeri: `elenca` (profondità 2) costa **505 token**, un elenco piatto
 * dell'intero albero ne costa **13.489**. Fra i due c'è tutto lo spazio del disegno, e nessuno l'ha
 * mai misurato: si è passati direttamente a «serve un grafo dei simboli».
 *
 * Qui si misura la via di mezzo, su un repo vero: un elenco PROFONDO ma potato — solo file sorgente,
 * niente `node_modules`/`.git`/build — e quanto costa in token a diverse profondità.
 *
 * ⛔ I token si CONTANO, non si stimano dai byte: la lezione del 09/09 (Context Manager) dice che
 *   contare i byte come token sbaglia di 3,9 volte. Qui si usa la stessa regola d'oro dei tokenizer
 *   BPE per il testo latino — ~4 caratteri per token — e si dichiara che è un'approssimazione,
 *   invece di spacciarla per una misura.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

const RADICE = 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui';
const SALTA = new Set(['node_modules', '.git', 'dist', 'public', '.sessions-store', 'coverage', '.chat-images']);
const SORGENTI = new Set(['.mjs', '.js', '.ts', '.tsx', '.py', '.rs', '.go', '.java', '.rb', '.php', '.css', '.html', '.json', '.md']);

async function raccogli(dove, profonditaMax, profondita = 0) {
  if (profondita > profonditaMax) return [];
  let voci;
  try { voci = await readdir(dove, { withFileTypes: true }); } catch { return []; }
  const fuori = [];
  for (const v of voci) {
    if (v.name.startsWith('.') && v.name !== '.claude') continue;
    if (SALTA.has(v.name)) continue;
    const intero = join(dove, v.name);
    if (v.isDirectory()) fuori.push(...await raccogli(intero, profonditaMax, profondita + 1));
    else if (SORGENTI.has(extname(v.name))) fuori.push(relative(RADICE, intero).replace(/\\/g, '/'));
  }
  return fuori;
}

const CARATTERI_PER_TOKEN = 4; // regola d'oro BPE per il testo latino: approssimazione DICHIARATA

console.log('profondità | file | caratteri | ~token');
for (const p of [2, 3, 4, 6, 10]) {
  const file = await raccogli(RADICE, p);
  const testo = file.join('\n');
  console.log(`${String(p).padStart(9)} | ${String(file.length).padStart(4)} | ${String(testo.length).padStart(9)} | ~${Math.round(testo.length / CARATTERI_PER_TOKEN)}`);
}

/* E quanto costerebbe aggiungere le sole RIGHE DI FIRMA (la via di Aider, senza il grafo). */
const tutti = await raccogli(RADICE, 10);
let firme = 0;
for (const f of tutti.slice(0, 200)) {
  try {
    const s = await stat(join(RADICE, f));
    firme += Math.min(s.size, 0); // segnaposto: qui non si leggono i file, si misura solo l'elenco
  } catch { /* sparito nel frattempo */ }
}
console.log(`\nfile sorgente totali nel repo: ${tutti.length}`);
console.log('⛔ Le firme non sono state lette: questa misura riguarda solo il COSTO DELL\'ELENCO.');
