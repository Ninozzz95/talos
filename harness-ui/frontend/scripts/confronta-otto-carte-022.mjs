// Cura gemella 0.2.2 giro 3, giudice v1856 punto 1 (sola lettura): confronta le misure delle carte PRIMA del giro 1 (f2612bf54) e DOPO
// la cura (testa). Per ogni carta, lingua, tema e zoom: rettangoli di carta, blocchi e righe `.talos-kv`, e l'impronta della foto della sola
// carta. Le carte con gli argomenti (dal-testo, connettore) devono cambiare; tutte le altre devono essere IDENTICHE.
// Uso: node scripts/confronta-otto-carte-022.mjs <misure prima> <misure dopo> (le cartelle OTTO_DUMP di tests/browser/otto-carte-022.spec.mjs
// corsa sulle due build). Rimesso nel ramo dal revisore della pagina del giro 5 (giudice v1886): prima stava solo nella cartella di lavoro.
import { readdirSync, readFileSync } from 'node:fs';
if (process.argv.length < 4) { console.error('uso: node confronta-otto-carte-022.mjs <misure prima> <misure dopo>'); process.exit(2); }
const P = process.argv[2];
const D = process.argv[3];
const ARGOMENTI = new Set(['dal-testo', 'connettore']);
const nomi = readdirSync(P).filter((f) => { try { readFileSync(`${D}/${f}`); return true; } catch { return false; } }).filter((f) => f.endsWith('.json')).sort();
const mancanti = readdirSync(D).filter((f) => f.endsWith('.json')).length;
let uguali = 0; let diversiFuori = []; let diversiArgomenti = 0; let carteFuori = new Set();
for (const f of nomi) {
  const carta = f.replace(/-(it|en)-(light|dark)-(100|150|200)\.json$/u, '');
  let a, b;
  try { a = JSON.parse(readFileSync(`${P}/${f}`, 'utf8')); b = JSON.parse(readFileSync(`${D}/${f}`, 'utf8')); } catch (e) { diversiFuori.push(`${f}: manca (${e.message.slice(0, 40)})`); continue; }
  const stessaMisura = JSON.stringify({ c: a.carta, b: a.blocchi, r: a.righe }) === JSON.stringify({ c: b.carta, b: b.blocchi, r: b.righe });
  const stessaFoto = a.impronta === b.impronta;
  if (ARGOMENTI.has(carta)) { if (!stessaMisura || !stessaFoto) diversiArgomenti += 1; continue; }
  carteFuori.add(carta);
  if (stessaMisura && stessaFoto) uguali += 1;
  else diversiFuori.push(`${f}: misura ${stessaMisura ? 'uguale' : 'DIVERSA'}, foto ${stessaFoto ? 'uguale' : 'DIVERSA'}${stessaMisura ? '' : ` prima ${JSON.stringify(a.carta)} dopo ${JSON.stringify(b.carta)}`}`);
}
console.log(`file prima ${nomi.length}, dopo ${mancanti}`);
console.log(`carte fuori dagli argomenti: ${[...carteFuori].join(', ')} (${carteFuori.size})`);
console.log(`fuori dagli argomenti: ${uguali} identiche, ${diversiFuori.length} diverse`);
for (const r of diversiFuori) console.log(`  ${r}`);
console.log(`carte con gli argomenti cambiate: ${diversiArgomenti} su ${nomi.filter((f) => ARGOMENTI.has(f.replace(/-(it|en)-(light|dark)-(100|150|200)\.json$/u, ''))).length}`);
