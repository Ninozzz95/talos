/*
 * TALOS contro Hermes Desktop, componente per componente — il corridore.
 *
 * Uso (da harness-ui/frontend, con il 4175 acceso e Hermes aperto o apribile):
 *   node scripts/confronto/confronto.mjs --gruppo=chat [--finestra]
 *
 * Scrive artifacts/confronto/<gruppo>/<blocco>/{talos,hermes,affiancato}.png e
 * artifacts/confronto/<gruppo>/esiti.json. Ogni coppia si GUARDA (regola del taccuino).
 * Piano: .claude/PIANO-CONFRONTO-HERMES-2026-09-05.md · taccuino: .claude/TACCUINO-CONFRONTO-HERMES-2026-09-05.md
 */
import { eseguiGruppo } from './guida.mjs';

const ARGV = process.argv.slice(2);
const arg = (nome, pre) => ARGV.find((a) => a.startsWith(`--${nome}=`))?.slice(nome.length + 3) ?? pre;
const gruppo = arg('gruppo', 'chat');
const headless = !ARGV.includes('--finestra');

const { PASSI } = await import(`./passi/${gruppo}.mjs`);
console.log(`Confronto · gruppo ${gruppo} · ${PASSI.length} passi`);
const rapporto = await eseguiGruppo(gruppo, PASSI, { headless });
const conteggio = rapporto.esiti.reduce((acc, r) => { acc[r.esito] = (acc[r.esito] || 0) + 1; return acc; }, {});
console.log(`\nEsiti: ${JSON.stringify(conteggio)} · Hermes: ${rapporto.hermes.versione || rapporto.hermes.errore} · errori di pagina: talos ${rapporto.erroriPagina.talos.length}, hermes ${rapporto.erroriPagina.hermes.length}`);
console.log(`Rapporto: artifacts/confronto/${gruppo}/esiti.json`);
