// REVISIONE (bugfixer, 15/10/2026): un host minimo che lancia col kernel il comando che gli si passa e resta vivo.
// argv[2] = cartella di lavoro (la crea e la toglie la prova), argv[3] = il comando, argv[4] = «gestore» o niente.
import { eseguiComandoSandboxato } from '../../src/kernel/talosHarness.mjs';
if (process.argv[4] === 'gestore') process.on('SIGINT', () => console.log('host: SIGINT gestito, resto vivo'));
// «gestore-term»: un SIGTERM gestito che NON esce (cb8dee280: il SIGKILL ai gruppi dopo la grazia)
if (process.argv[4] === 'gestore-term') process.on('SIGTERM', () => console.log('host: SIGTERM gestito, resto vivo'));
void eseguiComandoSandboxato(process.argv[3], process.argv[2], { timeoutMs: 120_000, onAvvio: (pid) => console.log(`GRUPPO ${typeof pid === 'object' ? pid?.pid : pid}`) });
console.log('HOST PRONTO');
setInterval(() => {}, 1000);
