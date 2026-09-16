/*
 * ⛔ (16/09/2026) — LA MIGRAZIONE DELLE CHIAVI VECCHIE VERSO IL NAMESPACE DELL'APP (decisione owner).
 *
 * Chi aveva l'app ≤ 0.1.10 ha le sue chiavi nei servizi SENZA suffisso (`talos-harness-provider`,
 * `talos-harness-search`): l'app con lo scope desktop legge SOLO `-desktop` (2a) e senza cura
 * partirebbe vuota, costretta a reinserire tutto. Al primo avvio l'app COPIA (mai sposta) le
 * chiavi vecchie nel proprio namespace:
 *   - provider: l'intero pool, ordine di priorità compreso, scritto con le porte del negozio
 *     (`aggiungiChiave`) — zero copie della forma del pool: la forma la conosce solo il negozio;
 *   - ricerca: la chiave per fonte (un account per fonte, contratto piatto di
 *     `search-source-store.mjs`).
 * I servizi vecchi NON si toccano: restano allo sviluppo da sorgente (4174), che su quei nomi
 * c'è ancora. La pulizia alla disinstallazione (`pulizia-dati.mjs`) continua a cancellare SOLO
 * `-desktop`.
 *
 * ⛔ UNA VOLTA SOLA per macchina: il marcatore (`markerFile`, un JSON accanto ai dati dell'app)
 *   impedisce di rigirare la copia a ogni avvio. Senza marcatore, una chiave cancellata
 *   dall'utente nell'app ripartirebbe dal namespace vecchio a ogni boot; e le chiavi che il dev
 *   aggiunge DOPO la migrazione non devono infilarsi nell'app a sorpresa. Due difese contro la
 *   resurrezione lavorano insieme:
 *   - il marcatore (una volta sola);
 *   - `tracciaInCustodia` del negozio: un provider che ha GIÀ una traccia nel namespace
 *     `-desktop` (chiave reale o tombstone dell'indice vuoto lasciato da `clearKey`) non viene
 *     mai toccato, anche se la migrazione dovesse rigirare per un marcatore perso.
 *   Il marcatore si scrive SOLO quando la migrazione ha DECISO qualcosa (chiavi copiate, o
 *   provider riconosciuti come già in custodia dell'app): con errori, o davanti a un namespace
 *   vecchio vuoto/illleggibile (portachiavi sordo), resta senza — e il giro dopo riprova. La
 *   copia è difensiva: ciò che l'app ha già non si tocca.
 *
 * ⛔ Vive in src/ perché è SPEDITA col pacchetto, come `pulizia-dati.mjs`. Scope desktop SEMPRE e
 *   SOLO: chi chiama (server.mjs) ha già letto lo scope; qui non si legge l'ambiente, e i negozi
 *   di passaggio nascono con `env: {}` — il portachiavi è l'unica fonte.
 */

import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

import { SCOPE_DESKTOP, avvolgiAdattatoreKeyring, creaAdattatorePortachiaviSistema } from './adattatore-keyring.mjs';
import { PROVIDER_IDS, createProviderCredentialStore } from './provider-credential-store.mjs';
import { FONTI_RICERCA_IDS, KEYRING_SERVICE_RICERCA, createSearchSourceStore } from './search-source-store.mjs';

/**
 * Copia le chiavi dal namespace senza suffisso al namespace `-desktop`, una volta sola.
 * `keyring` è un adattatore `{get,set,remove}` INIETTABILE per i test (nudo, senza suffisso:
 * il suffisso lo mette questa routine con `avvolgiAdattatoreKeyring`); senza, si costruisce
 * quello di sistema (la stessa fabbrica del server).
 *
 * @param {{keyring?: {get:Function,set:Function,remove:Function}|null, markerFile?: string|null, logger?: {log:Function,warn:Function}}} [opzioni]
 * @returns {{migrati: Array<{tipo:string, id:string, chiavi:number}>, saltati: Array<{tipo:string, id:string, motivo:string}>, errori: Array<{tipo:string, id:string, messaggio:string}>, giaMigrata: boolean, ok: boolean}}
 *   Il riepilogo contiene SOLO nomi e conteggi: nessun valore di chiave (che non entra nemmeno
 *   in questo modulo — i negozi non lo espongono, e la lettura diretta delle fonti non lo registra).
 */
export async function migraChiaviLegacySuDesktop({ keyring = null, markerFile = null, logger = console } = {}) {
  const esito = { migrati: [], saltati: [], errori: [], giaMigrata: false, ok: false };

  /* Il marcatore parla prima di tutto: una migrazione già fatta non si rifà. */
  if (markerFile && existsSync(markerFile)) {
    try {
      const marker = JSON.parse(readFileSync(markerFile, 'utf8'));
      if (marker?.version === 1) { esito.giaMigrata = true; esito.ok = true; return Object.freeze(esito); }
    } catch { /* marcatore illeggibile: si rimigra — la copia difensiva non tocca ciò che c'è già */ }
  }

  const portachiaviNudo = keyring ?? await creaAdattatorePortachiaviSistema();
  const portachiaviDesktop = avvolgiAdattatoreKeyring(portachiaviNudo, SCOPE_DESKTOP);

  /* I negozi di passaggio, entrambi SENZA semi d'ambiente (`env: {}`): solo portachiavi. */
  const legacyProvider = createProviderCredentialStore({ env: {}, keyring: portachiaviNudo });
  const desktopProvider = createProviderCredentialStore({ env: {}, keyring: portachiaviDesktop });
  legacyProvider.loadFromKeyring();
  desktopProvider.loadFromKeyring();

  for (const id of PROVIDER_IDS) {
    try {
      if (desktopProvider.tracciaInCustodia(id)) { esito.saltati.push({ tipo: 'provider', id, motivo: 'gia in custodia' }); continue; }
      const righe = legacyProvider.esportaPool(id);
      if (!righe.length) { esito.saltati.push({ tipo: 'provider', id, motivo: 'niente da migrare' }); continue; }
      for (const riga of righe) desktopProvider.aggiungiChiave(id, riga.chiave, { priorita: riga.priorita });
      esito.migrati.push({ tipo: 'provider', id, chiavi: righe.length });
    } catch (errore) {
      esito.errori.push({ tipo: 'provider', id, messaggio: errore?.message ?? String(errore) });
    }
  }

  /*
   * Le fonti di ricerca: il negozio non espone segreti (e non deve), quindi la LETTURA dal
   * namespace vecchio passa dall'adattatore direttamente — contratto piatto e pubblico
   * (`KEYRING_SERVICE_RICERCA`, un account per fonte). La SCRITTURA usa le porte del negozio
   * desktop, come farebbe la UI.
   */
  const desktopRicerca = createSearchSourceStore({ env: {}, keyring: portachiaviDesktop, file: null });
  const fontiDesktop = desktopRicerca.listPublic().fonti;
  for (const id of FONTI_RICERCA_IDS) {
    try {
      if (fontiDesktop.find((f) => f.id === id)?.keyConfigured) { esito.saltati.push({ tipo: 'ricerca', id, motivo: 'gia in custodia' }); continue; }
      let valore = null;
      try { valore = portachiaviNudo.get(KEYRING_SERVICE_RICERCA, id); } catch { valore = null; }
      if (typeof valore !== 'string' || !valore.trim()) { esito.saltati.push({ tipo: 'ricerca', id, motivo: 'niente da migrare' }); continue; }
      desktopRicerca.setKey(id, valore);
      esito.migrati.push({ tipo: 'ricerca', id, chiavi: 1 });
    } catch (errore) {
      esito.errori.push({ tipo: 'ricerca', id, messaggio: errore?.message ?? String(errore) });
    }
  }

  esito.ok = esito.errori.length === 0;
  /*
   * ⛔ Il marcatore si scrive SOLO se la migrazione ha DECISO qualcosa — almeno una chiave
   *   copiata o almeno un provider/fonte riconosciuto come «già in custodia» dell'app. Una
   *   macchina senza tracce nel namespace vecchio, o un portachiavi momentaneamente sordo
   *   (l'adattatore di sistema traduce ogni guasto di lettura in «assente»), restano SENZA
   *   marcatore: il prossimo avvio riprova — sono una dozzina di letture nulle, costo nullo.
   *   Bruciare il marcatore al primo avvio in uno di questi stati farebbe perdere le chiavi
   *   vecchie per sempre, ed è esattamente il guasto che la migrazione esiste per evitare.
   */
  const deciso = esito.migrati.length > 0 || esito.saltati.some((v) => v.motivo === 'gia in custodia');
  if (esito.ok && deciso && markerFile) {
    const temporaneo = `${markerFile}.tmp-${process.pid}`;
    try {
      writeFileSync(temporaneo, `${JSON.stringify({ version: 1, migrati: esito.migrati }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      renameSync(temporaneo, markerFile);
    } catch (errore) {
      try { if (existsSync(temporaneo)) unlinkSync(temporaneo); } catch { /* best effort */ }
      esito.errori.push({ tipo: 'marcatore', id: 'marcatore', messaggio: errore?.message ?? String(errore) });
      esito.ok = false;
    }
  }

  logger.log?.(`Migrazione chiavi: ${esito.migrati.length} voci copiate, ${esito.saltati.length} saltate, ${esito.errori.length} errori.`);
  if (esito.errori.length) logger.warn?.(`Migrazione incompleta: ${esito.errori.map((v) => `${v.tipo} ${v.id}: ${v.messaggio}`).join('; ')}`);
  return Object.freeze(esito);
}
