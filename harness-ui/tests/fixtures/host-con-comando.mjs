// AND-08: un host minimo che lancia un comando lungo col kernel, stampa il pid del suo gruppo e resta vivo. Con «gestore» installa
// un suo SIGINT che NON esce (come una CLI che al Ctrl-C annulla il giro): il segnale ai comandi deve arrivare lo stesso.
import { eseguiComandoSandboxato } from '../../src/kernel/talosHarness.mjs';
// argv[2] = cartella di lavoro (la crea e la toglie la prova: un host ucciso non pulisce), argv[3] = «gestore» o niente
// «gestore-term»: come l'app Android, un suo SIGTERM (che qui non esce), e un comando che IGNORA SIGTERM (AND-09)
if (process.argv[3] === 'gestore') process.on('SIGINT', () => console.log('host: SIGINT gestito, resto vivo'));
if (process.argv[3] === 'gestore-term') process.on('SIGTERM', () => console.log('host: SIGTERM gestito, resto vivo'));
const cartella = process.argv[2];
const comando = process.argv[3] === 'gestore-term' ? "trap '' TERM; sleep 60; echo finito" : 'sleep 60; echo finito';
void eseguiComandoSandboxato(comando, cartella, { timeoutMs: 120_000, onAvvio: (pid) => console.log(`GRUPPO ${pid}`) });
// Fuga trovata il 31/10/2026 in WSL: 32 host vivi da due giorni. Un host che nessuno chiude (prova caduta prima del suo finally, corsa uccisa) esce da solo.
setTimeout(() => process.exit(0), Number(process.env.TALOS_HOST_PROVA_MS) || 300_000);
