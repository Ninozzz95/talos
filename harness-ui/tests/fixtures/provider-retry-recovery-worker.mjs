// Processo di prova, non un agente: usa kernel/servizio/store reali su un provider HTTP locale.
import { createSessionRegistry } from '../../src/session-registry.mjs';
import { avviaSessione } from '../../src/agent-service.mjs';
import { talosLavora } from '../../src/kernel/talosHarness.mjs';
import { creaFetchMultiProvider } from '../../src/runtime-owner-adapter.mjs';
import { createProviderCredentialStore } from '../../src/provider-credential-store.mjs';
import { attendiScritture } from '../../src/session-store.mjs';

const [cartellaStore, workspace, endpoint] = process.argv.slice(2);
if (!process.send || new URL(endpoint).hostname !== '127.0.0.1') throw Error('Fixture requires IPC and loopback provider');
const send = value => { if (process.connected) process.send(value); };
const store = createProviderCredentialStore({ env: { OPENROUTER_API_KEY: 'fixture-retry07-only' } });
store.setRuntime('openrouter', { endpoint });
const transport = creaFetchMultiProvider(fetch, { providerStore: store,
  dipendenze: { leggiChiave: p => store.getKey(p), leggiRuntime: p => store.getRuntime(p) } });
let invocazioni = 0;
const registro = createSessionRegistry({ cartellaStore, modello: 'test/recovery-fixture', chiave: 'fixture-retry07-only',
  guardaWorkspaceFn: () => () => {},
  preparaEsecuzioneFn: () => ({ cartella: workspace, task: { id: 'retry07', consegna: 'Controlla la nota senza modificare file.' } }),
  avviaSessioneFn: input => {
    invocazioni++;
    return avviaSessione({ ...input,
      onEvento: (event, options) => { const result = input.onEvento(event, options); send({ kind: 'event', event }); return result; },
      talosLavoraFn: opts => talosLavora({ ...opts, fetchDiRete: transport }),
    });
  },
});
const restore = await registro.ripristina();
process.on('message', async ({ command, id, sessionId, message, riferimento }) => {
  try {
    let data;
    switch (command) {
      case 'start': data = registro.avvia('retry07'); break;
      case 'state': data = { session: registro.esporta(sessionId), invocazioni }; break;
      case 'flush': data = await attendiScritture({ cartellaStore, sessionId }); break;
      case 'settle': data = await registro.attendiAssestamento(sessionId); await attendiScritture({ cartellaStore, sessionId }); break;
      case 'resume': data = registro.resume(sessionId, message ?? null); break;
      case 'remove': data = await registro.rimuoviMessaggio(sessionId, riferimento); break;
      default: throw Error('Unknown fixture command');
    }
    send({ kind: 'reply', id, data });
  } catch (error) { send({ kind: 'reply', id, error: { message: error.message, code: error.code } }); }
});
send({ kind: 'ready', restore, pid: process.pid });
