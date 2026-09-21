/*
 * ⛔⛔ (16/09/2026) — LA ROUTINE DI PULIZIA ALLA DISINSTALLAZIONE (bug 2, gamba 2b).
 *
 * L'uninstaller NSIS la lancia DENTRO l'eseguibile installato con
 * `ExecWait "$INSTDIR\TALOS.exe" --talos-pulizia-dati` (desktop/assets/installer.nsh), SOLO se
 * l'utente ha chiesto di eliminare i dati; il guscio (desktop/main.mjs) vede il flag, importa
 * QUESTO modulo e esce col suo codice: 0 = tutto pulito, non-0 = fallimento onesto (allora
 * l'uninstaller mostra l'errore e NON cancella i dati: una pulizia a metà non si nasconde).
 *
 * Cosa cancella: SOLO il namespace `-desktop` del portachiavi di sistema — le chiavi provider e
 * le chiavi di ricerca registrate dall'app INSTALLATA. NON si tocca mai:
 *   - i servizi SENZA suffisso (`talos-harness-provider`, `talos-harness-search`): sono lo
 *     sviluppo da sorgente (4174), su un'altra istanza e con un'altra volontà;
 *   - le cartelle `.harness-ui-library` / `.harness-ui-research` nei progetti dell'utente
 *     (file suoi, nelle sue cartelle);
 *   - le chiavi d'AMBIENTE della macchina (con lo scope desktop non arrivano nemmeno all'app).
 * Il resto dei dati dell'app (%APPDATA%\TALOS: sessioni, impostazioni, cache, i JSON
 * `.provider-runtime.json` e `.search-source.json`) lo cancella l'uninstaller con RMDir,
 * solo se questa routine esce 0.
 *
 * ⛔ Vive in src/ perché è SPEDITA col pacchetto: le radici di staging sono server.mjs,
 *   package*.json, src/ e public/ (scripts/prepara-pacchetto.mjs), e `extraResources` manda
 *   .staging/harness-ui → resources/harness-ui — quindi al volo l'eseguibile la trova.
 *
 * ⛔ Scope desktop SEMPRE e SOLO, mai letto dall'ambiente: la pulizia gira solo nell'app
 *   installata, e un eventuale `TALOS_HARNESS_UI_KEYRING_SCOPE` sbagliato non deve poter far
 *   cancellare i servizi del dev. Il default «mantieni» sta nell'uninstaller, non qui.
 */

import { SCOPE_DESKTOP, avvolgiAdattatoreKeyring, creaAdattatorePortachiaviSistema } from './adattatore-keyring.mjs';
import { PROVIDER_IDS, createProviderCredentialStore } from './provider-credential-store.mjs';
import { FONTI_RICERCA_IDS, createSearchSourceStore } from './search-source-store.mjs';

/**
 * Cancella il namespace `-desktop` del portachiavi. `keyring` è un adattatore `{get,set,remove}`
 * INIETTABILE per i test; senza, si costruisce quello di sistema (la stessa fabbrica del server).
 *
 * @param {{keyring?: {get:Function,set:Function,remove:Function}|null, logger?: {log:Function,error:Function}}} [opzioni]
 * @returns {{cancellati: Array<{tipo:string, id:string}>, errori: Array<{tipo:string, id:string, messaggio:string}>, ok: boolean}}
 *   Il riepilogo stampato su stdout contiene SOLO nomi e conteggi: mai il valore di una chiave
 *   (che non entra nemmeno in questo modulo — i negozi non lo espongono).
 */
export async function puliziaDatiDesktop({ keyring, logger = console } = {}) {
  const portachiaviNudo = keyring ?? await creaAdattatorePortachiaviSistema();
  const portachiavi = avvolgiAdattatoreKeyring(portachiaviNudo, SCOPE_DESKTOP);
  const cancellati = [];
  const errori = [];
  const segnala = (tipo, id, errore) => errori.push({ tipo, id, messaggio: errore?.message ?? String(errore) });

  /*
   * Le chiavi provider: `clearKey(provider)` è l'azzeramento deterministico completo del negozio
   * (salvaPool vuoto → gli account del pool tolti uno a uno e INDICE VUOTO scritto per ultimo:
   * il tombstone che impedisce di resuscitare nulla al prossimo avvio). Prima `loadFromKeyring`
   * ricarica ciò che c'è, così anche le chiavi salvate prima di oggi vengono viste e rimosse.
   */
  const providerStore = createProviderCredentialStore({ env: {}, keyring: portachiavi });
  try {
    providerStore.loadFromKeyring();
    for (const id of PROVIDER_IDS) {
      try {
        providerStore.clearKey(id);
        cancellati.push({ tipo: 'provider', id });
      } catch (errore) { segnala('provider', id, errore); }
    }
  } catch (errore) { for (const id of PROVIDER_IDS) segnala('provider', id, errore); }

  /* Le chiavi della fonte di ricerca: stessa cura, stesso namespace. */
  const searchStore = createSearchSourceStore({ env: {}, keyring: portachiavi });
  for (const id of FONTI_RICERCA_IDS) {
    try {
      searchStore.clearKey(id);
      cancellati.push({ tipo: 'ricerca', id });
    } catch (errore) { segnala('ricerca', id, errore); }
  }

  logger.log?.(`Pulizia dati TALOS: ${cancellati.filter((v) => v.tipo === 'provider').length} chiavi provider, ${cancellati.filter((v) => v.tipo === 'ricerca').length} fonti di ricerca; errori: ${errori.length}.`);
  if (errori.length) logger.error?.(`Pulizia incompleta: ${errori.map((v) => `${v.tipo} ${v.id}: ${v.messaggio}`).join('; ')}`);
  return Object.freeze({ cancellati, errori, ok: errori.length === 0 });
}
