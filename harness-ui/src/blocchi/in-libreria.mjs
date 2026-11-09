/*
 * Decisione 142 dell'owner (04/11/2026): «Salva in Libreria» per i blocchi vivi, con le versioni.
 * Ricerca: Downloads/TALOS/desktop/in-corso/RICERCA-BLOCCHI-IN-LIBRERIA-2026-11-04.md.
 *
 * La voce è di TESTO (`text/plain`, `<titolo>.txt`) e tiene il SORGENTE del blocco, non un suo disegno: chi ha il catalogo lo ridisegna
 * vivo (il PC, nel lettore della Libreria), chi non lo ha lo legge come testo (il telefono, all'ultima versione, senza nessun campo
 * nuovo: condizione del Mobile sulla 142). A2UI v0.9 fa lo stesso: il blocco vive dove c'è il suo disegnatore.
 *
 * L'identità è (conversazione, `id` del blocco), come la coppia (sessione, slug) di Hermes (`apps/desktop/src/store/artifacts.ts:14-17`):
 * il legame sta nel `meta.json` della voce (`blocco: { sessionId, id }`, scritto da `salvaVoce`, letto da `trovaVocePerBlocco`).
 *   - nessuna voce per quel blocco ⇒ voce nuova, versione 1;
 *   - la voce c'è e una sua versione QUALUNQUE ha lo STESSO testo ⇒ niente, e la risposta dice quella versione («resta la versione N»):
 *     Hermes `upsertArtifact` (`apps/desktop/src/store/artifacts.ts:281-285`, `existing.versions.some(version => version.hash === hash)`).
 *     Revisione J, D5 (04/11): prima si guardava solo l'ultima, e un blocco vecchio salvato dopo uno nuovo diventava una versione-copia.
 *     Niente «ripristino» in questa versione (guida delle piccole scelte del Desktop);
 *   - testo mai visto ⇒ `aggiungiVersione`, la stessa funzione di `artifact_update` e del ripristino.
 * ⛔ Revisione J, D2 (04/11): il modello che rifà con `artifact_create` un blocco già in Libreria NON fa una seconda voce
 *   (`creaVoceDiBlocco`): riceve BLOCK_EXISTS con l'id e «call artifact_update». Clic della persona e `artifact_create` stanno nella
 *   STESSA fila del blocco (`inFila`), quindi anche due gesti nello stesso istante fanno una voce sola.
 * ⛔ Un blocco che il lettore del catalogo non dice «completo» (rotto, a metà, vuoto) NON si salva: entrerebbe in Libreria un testo che
 *   nessuno sa ridisegnare (OpenUI Lang 1.0, «version coupling»). ⛔ Un lucchetto per blocco: due clic insieme fanno UNA voce.
 */
import { leggi } from './lettore.mjs';
import { sorgenteDelBlocco } from './recinto.mjs';
import { impronta } from './impronta.mjs';
import {
  aggiungiVersione, elencaVersioni, legamiDeiBlocchi, LibraryStoreError, leggiVersione, leggiVoce, salvaVoce, sanificaNomeLibreria,
  legameValido, trovaVocePerBlocco, voceDaiLegami,
} from '../library-store.mjs';

export { sembraUnBlocco, sorgenteDelBlocco } from './recinto.mjs';

/** Lo stesso tetto degli artefatti (`ARTEFATTO_MAX_BYTE`, agent-service.mjs): una voce di Libreria non è un archivio. */
export const PESO_MASSIMO_BLOCCO = 400_000;

const invalido = (messaggio) => new LibraryStoreError(messaggio, 'LIBRARY_INVALID');

/**
 * Legge e controlla il blocco da salvare. Restituisce `{ sorgente, blocco }` o lancia `LIBRARY_INVALID` con un motivo in inglese
 * (lo legge il modello quando arriva dalla seconda porta).
 */
export function bloccoDaSalvare(testo) {
  if (typeof testo !== 'string' || !testo.trim()) throw invalido('There is no block to save');
  if (Buffer.byteLength(testo, 'utf8') > PESO_MASSIMO_BLOCCO) {
    throw invalido(`The block is ${Buffer.byteLength(testo, 'utf8')} bytes; the maximum is ${PESO_MASSIMO_BLOCCO}`);
  }
  const sorgente = sorgenteDelBlocco(testo);
  const risultato = leggi(sorgente);
  if (risultato?.stato !== 'completo' || !risultato.blocco?.id) {
    const motivo = risultato?.stato === 'in-arrivo' ? 'it is incomplete' : `it is broken${risultato?.motivo ? ` (${risultato.motivo})` : ''}`;
    throw invalido(`This is not a valid live block: ${motivo}`);
  }
  return { sorgente, blocco: risultato.blocco };
}

/**
 * Il nome della voce: `titolo` se c'è (quello dell'attrezzo del modello, che il nucleo gli ripete in «created: "<titolo>"»), se no il
 * titolo del blocco, o il suo `id`. Gli stessi caratteri vietati degli artefatti (`onArtefatto`), poi la pulizia di sempre della
 * Libreria (`sanificaNomeLibreria`: NFKC, controlli, punti iniziali), come la rinomina e le versioni: il nome finisce in un file VERO
 * quando si esporta (revisione J, D6). Vuoto dopo la pulizia ⇒ «block».
 */
export function nomeDellaVoce(blocco, titolo) {
  const grezzo = String((typeof titolo === 'string' && titolo.trim()) || blocco?.titolo || blocco?.id || 'block');
  const base = sanificaNomeLibreria(grezzo.replace(/[\\/:*?"<>|]/gu, '-').trim().slice(0, 80)) || 'block';
  return `${base}.txt`;
}

const conversazioneValida = (sessionId) => typeof sessionId === 'string' && Boolean(sessionId.trim());
const chiaveDelBlocco = (cartella, sessionId, idBlocco) => `${cartella}\u0000${sessionId.trim()}\u0000${idBlocco}`;

/**
 * La versione della voce `id` che ha già il testo `sorgente`, dalla più recente; `null` se nessuna. Hermes, `artifacts.ts:281-285`.
 * Una versione illeggibile (EACCES, EPERM, EBUSY: antivirus, OneDrive) si salta, come in `voceDelBlocco`: non deve bloccare ogni
 * salvataggio dopo (revisione P, P-1; Hermes `tools/checkpoint_maintenance.py:219-222`, `except OSError: continue`).
 */
async function versioneConLoStessoTesto({ cartella, id, sorgente }, deps) {
  const versioni = (await elencaVersioni({ cartella, id }, deps)) ?? [];
  for (const v of [...versioni].reverse()) {
    let letta = null;
    try { letta = await leggiVersione({ cartella, id, n: v.n }, deps); } catch { /* illeggibile: si salta, come voceDelBlocco */ }
    if (letta && letta.testo === sorgente) return { versione: v.n, totale: versioni.length, nome: letta.nome };
  }
  return null;
}

const lucchetti = new Map();
function inFila(chiave, lavoro) {
  const prima = lucchetti.get(chiave) ?? Promise.resolve();
  const mio = prima.then(lavoro, lavoro);
  const coda = mio.catch(() => {});
  lucchetti.set(chiave, coda);
  void coda.then(() => { if (lucchetti.get(chiave) === coda) lucchetti.delete(chiave); });
  return mio;
}

/**
 * Salva il blocco `testo` della conversazione `sessionId` nella Libreria di `cartella`.
 * @returns {Promise<{ id: string, versione: number, totale: number, nome: string, nuova: boolean }>} `nuova:false` ⇒ la
 *   versione `versione` (una qualunque, non solo l'ultima: revisione J, D5) aveva già questo testo, niente è stato scritto
 */
export async function salvaBloccoInLibreria({ cartella, testo, sessionId, sessionNome, modello }, deps = {}) {
  const { sorgente, blocco } = bloccoDaSalvare(testo);
  if (!conversazioneValida(sessionId)) throw invalido('A block is saved from a conversation');
  return inFila(chiaveDelBlocco(cartella, sessionId, blocco.id), async () => {
    const esistente = await trovaVocePerBlocco({ cartella, sessionId, idBlocco: blocco.id }, deps);
    if (esistente) {
      const ultima = await leggiVoce({ cartella, id: esistente }, deps);
      const gia = ultima ? await versioneConLoStessoTesto({ cartella, id: esistente, sorgente }, deps) : null;
      if (gia) return { id: esistente, versione: gia.versione, totale: gia.totale, nome: gia.nome, nuova: false };
      if (ultima) {
        const esito = await aggiungiVersione({ cartella, id: esistente, testo: sorgente, modello, sessionId, sessionNome }, deps);
        if (esito) {
          dimenticaScansione(cartella);
          return { id: esito.id, versione: esito.versione, totale: esito.totale, nome: esito.nome, nuova: true };
        }
      }
    }
    const nome = nomeDellaVoce(blocco);
    const id = await salvaVoce({
      cartella, nome, mediaType: 'text/plain', origine: 'generated', testo: sorgente, modello, sessionId, sessionNome,
      blocco: { sessionId, id: blocco.id },
    }, deps);
    dimenticaScansione(cartella);
    return { id, versione: 1, totale: 1, nome, nuova: true };
  });
}

/**
 * La seconda porta (`artifact_create` col sorgente di un blocco, `agent-service.mjs`): una voce NUOVA, versione 1, nella stessa fila
 * del pulsante della persona. Se la voce di quel blocco c'è già lancia `BLOCK_EXISTS` (`errore.id` = la voce): il modello la
 * cambia con `artifact_update` (revisione J, D2). Senza conversazione non c'è legame né fila: voce nuova, come prima.
 * @returns {Promise<{ id: string, nome: string }>}
 */
export async function creaVoceDiBlocco({ cartella, testo, titolo, sessionId, sessionNome, modello }, deps = {}) {
  const { sorgente, blocco } = bloccoDaSalvare(testo);
  const salvaVoceFn = deps.salvaVoceFn ?? salvaVoce;
  const nome = nomeDellaVoce(blocco, titolo);
  const voce = { cartella, nome, mediaType: 'text/plain', origine: 'generated', testo: sorgente, modello, sessionId, sessionNome };
  if (!conversazioneValida(sessionId)) return { id: await salvaVoceFn(voce), nome };
  return inFila(chiaveDelBlocco(cartella, sessionId, blocco.id), async () => {
    const esistente = await trovaVocePerBlocco({ cartella, sessionId, idBlocco: blocco.id }, deps);
    if (esistente) {
      throw Object.assign(new LibraryStoreError(
        `This block is already in the Library as ${esistente}: call artifact_update with that id. Nothing was created.`, 'BLOCK_EXISTS'), { id: esistente });
    }
    const id = await salvaVoceFn({ ...voce, blocco: { sessionId, id: blocco.id } });
    dimenticaScansione(cartella);
    return { id, nome };
  });
}

/*
 * D7, opzione C (condizione di Performance, 04/11): la scansione IN VOLO di una cartella si divide fra le domande della rotta in sola
 * lettura; finita, si toglie. Nessuna memoria fra una domanda e la successiva (l'indice per blocco è dopo il rilascio), e i
 * salvataggi non la usano: scansionano da sé, dentro la loro fila. Stesse `deps` ⇒ stessa scansione (le prove le iniettano).
 */
const scansioniInVolo = new Map();
function legamiInVolo(cartella, deps) {
  const prima = scansioniInVolo.get(cartella);
  if (prima && prima.readdirFn === deps.readdirFn && prima.readFileFn === deps.readFileFn) return prima.promessa;
  const mia = { promessa: legamiDeiBlocchi({ cartella }, deps), readdirFn: deps.readdirFn, readFileFn: deps.readFileFn };
  scansioniInVolo.set(cartella, mia);
  const togli = () => { if (scansioniInVolo.get(cartella) === mia) scansioniInVolo.delete(cartella); };
  mia.promessa.then(togli, togli);
  return mia.promessa;
}

/*
 * Revisione Z, Z-2.1 (04/11): una scrittura riuscita del blocco toglie la scansione in volo della sua cartella. Chi ha chiesto PRIMA
 * tiene la sua risposta (era davvero contemporaneo); chi chiede DOPO ne fa una nuova e vede la voce appena scritta, invece di unirsi a
 * una scansione partita prima della scrittura e rispondere `null` (il PC terrebbe quel `null` fino alla ricarica). La scansione tolta
 * finisce comunque per chi l'aspetta; il suo `togli` non tocca quella nuova (confronta `mia`). Come `Group.Forget` di singleflight in
 * Go (golang.org/x/sync v0.24.0) e `invalidate_env_cache()` di Hermes dopo ogni scrittura del `.env` (`hermes_cli/config.py:2448-2454`).
 */
function dimenticaScansione(cartella) {
  scansioniInVolo.delete(cartella);
}

/**
 * Revisione J, D7 (04/11): per il tasto «In Libreria · vN» dopo una ricarica. SOLA LETTURA: la voce del blocco `idBlocco` della
 * conversazione `sessionId` con l'impronta di ogni versione (`impronta.mjs`, la stessa che il PC calcola sul sorgente che disegna),
 * o `null`. Il PC confronta da sé: il testo del blocco non viaggia in un indirizzo. Una versione illeggibile si salta.
 * Le domande che arrivano insieme (una per blocco, dopo una ricarica) dividono UNA scansione della Libreria (D7, opzione C).
 * @returns {Promise<{ id: string, nome: string, totale: number, versioni: Array<{ n: number, impronta: string }> } | null>}
 */
export async function voceDelBlocco({ cartella, sessionId, idBlocco }, deps = {}) {
  if (!legameValido(sessionId, idBlocco)) return null;
  const id = voceDaiLegami(await legamiInVolo(cartella, deps), sessionId, idBlocco);
  if (!id) return null;
  const versioni = await elencaVersioni({ cartella, id }, deps);
  if (!versioni) return null;
  const conImpronta = [];
  let nome = null;
  for (const v of versioni) {
    let letta = null;
    try { letta = await leggiVersione({ cartella, id, n: v.n }, deps); } catch { /* illeggibile: si salta */ }
    if (!letta) continue;
    nome = letta.nome;
    conImpronta.push({ n: v.n, impronta: impronta(letta.testo) });
  }
  return { id, nome, totale: versioni.length, versioni: conImpronta };
}
