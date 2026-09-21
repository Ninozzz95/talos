/*
 * ⛔⛔ 07/9 — IL KERNEL È NEL REPO, E DUE COPIE DIVERGONO IN SILENZIO SE NESSUNO LE GUARDA.
 *
 * Dal 07/09 `harness-ui/src/kernel/talosHarness.mjs` è la copia che il prodotto pubblica: chi
 * clona il repo la usa senza configurare niente. L'owner però continua a lavorare sul kernel nel
 * suo worktree (`AVM-harness/mobile/scripts/harness-talos/`), e quella resta la fonte.
 *
 * Il difetto che questo script impedisce è già successo una volta, in grande: la decisione del
 * 02/09 (`.claude/DECISIONE-KERNEL-DUE-COPIE-2026-09-02.md`) nasce da DUE copie divergenti — 27
 * export in comune, 3 solo di qua, 37 solo di là — che nessuno confrontava. Una copia che diverge
 * senza che nessuno se ne accorga è peggio di una copia mancante: sembra tutto a posto.
 *
 * ⇒ Qui si confronta l'impronta, e si DICE la differenza. Non si copia niente da solo: portare la
 *   versione nuova è un gesto dell'owner, non un effetto collaterale di un controllo.
 *
 * Uso:
 *   node scripts/kernel-controlla.mjs                 confronta con la fonte, se è raggiungibile
 *   node scripts/kernel-controlla.mjs --fonte <file>  confronta con un'altra copia
 *
 * Esce 0 quando le due copie coincidono o la fonte non è raggiungibile (una macchina che clona il
 * repo non ha il worktree dell'owner: lì non c'è niente da confrontare, e non è un guasto).
 * Esce 1 quando divergono: allora la differenza si guarda e si decide.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const QUI = fileURLToPath(new URL('../src/kernel/talosHarness.mjs', import.meta.url));
const FONTE_PREDEFINITA = fileURLToPath(new URL('../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs', import.meta.url));

/** L'impronta di un file, o `null` se non c'è. Puro: nessuna scrittura, nessuna rete. */
export function improntaDi(percorso) {
  try {
    if (!statSync(percorso).isFile()) return null;
    return createHash('sha256').update(readFileSync(percorso)).digest('hex');
  } catch {
    return null;
  }
}

/** Quante righe hanno i due file, per dire *quanto* divergono e non solo *che* divergono. */
function righe(percorso) {
  try { return readFileSync(percorso, 'utf8').split('\n').length; } catch { return null; }
}

const argomenti = process.argv.slice(2);
const iFonte = argomenti.indexOf('--fonte');
const fonte = iFonte >= 0 && argomenti[iFonte + 1] ? argomenti[iFonte + 1] : FONTE_PREDEFINITA;

const improntaQui = improntaDi(QUI);
if (!improntaQui) {
  console.error('⛔ il kernel non è nel repo: atteso src/kernel/talosHarness.mjs');
  process.exit(1);
}

if (!existsSync(fonte)) {
  console.log('kernel nel repo:', `${righe(QUI)} righe · sha256 ${improntaQui.slice(0, 16)}`);
  console.log('fonte non raggiungibile da qui — niente da confrontare (normale su una macchina che ha solo questo repo)');
  process.exit(0);
}

const improntaFonte = improntaDi(fonte);
if (improntaQui === improntaFonte) {
  console.log('✓ il kernel del repo è identico alla fonte —', `${righe(QUI)} righe · sha256 ${improntaQui.slice(0, 16)}`);
  process.exit(0);
}

console.log('⛔ le due copie DIVERGONO');
console.log('   repo :', `${righe(QUI)} righe · sha256 ${improntaQui.slice(0, 16)}`, `(${QUI})`);
console.log('   fonte:', `${righe(fonte)} righe · sha256 ${String(improntaFonte).slice(0, 16)}`, `(${fonte})`);
console.log('   ⇒ decide chi lavora sul kernel: portare la versione nuova nel repo, o lasciarla fuori di proposito.');
process.exit(1);
