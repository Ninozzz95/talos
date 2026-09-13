/**
 * custom-task.mjs — un compito LIBERO su una cartella dell'allowlist
 * (`TALOS_HARNESS_UI_PROJECT_DIRS`, vedi `config.mjs`), non uno dei task
 * fissi del corpus benchmark. Owner, 27/8: "per adesso un allowlist per
 * testare... come se fosse Claude Code o Pi agent o Hermes o DeepSeek".
 *
 * ⛔⛔ Diverso da `task-catalog.mjs` apposta: quello fa SEMPRE una copia
 * usa-e-getta (`preparaCopia`), perché il suo scopo è misurare un harness
 * senza mai toccare l'originale del corpus. Qui l'obiettivo dichiarato è
 * l'opposto — vedere l'effetto REALE su un progetto vero, esattamente
 * come un coding agent di produzione — quindi si lavora DIRETTAMENTE
 * sulla cartella scelta. Il confine di sicurezza non è "una copia": è
 * l'allowlist stessa, verificata all'AVVIO del server (vedi config.mjs),
 * mai un percorso a piacere accettato a runtime.
 *
 * ⭐⭐⭐ 28/8 — ECCEZIONE dichiarata al paragrafo sopra: col permesso "Full
 * access" (piano elegant-spinning-dongarra.md, owner) un percorso A
 * PIACERE È ammesso — `cartellaLibera` sotto. Ricerca fatta prima di
 * scrivere (REGOLA ZERO): la sicurezza degli harness di coding nel 2026
 * dichiara le DENYLIST di percorsi sensibili (.ssh, credenziali,
 * System32...) una strategia FALLITA — "sandbox escapes documentati
 * proprio nella categoria denylist" (Docker/Developers Digest, agosto
 * 2026) — quindi questo file non ne scrive una. La sicurezza vera sta
 * altrove: (1) il permesso "Full access" è una SCELTA ESPLICITA
 * dell'owner per QUELLA sessione, mai un default; (2) il percorso deve
 * ESISTERE ed essere leggibile/scrivibile DAVVERO (stessa validazione
 * già in uso per l'allowlist fissa, solo a runtime invece che all'avvio
 * — l'owner sceglie un percorso che gestisce già col suo stesso OS); (3)
 * da quel momento la cartella scelta diventa la RADICE della sessione
 * esattamente come una voce dell'allowlist — lo stesso `isPathInside`
 * la contiene, solo più in alto nell'albero. Non è "nessun confine": è
 * "il confine è dove l'owner ha detto esplicitamente", il pattern che
 * VS Code chiama Workspace Trust.
 *
 * ⭐ 29/8 — copia PORTATA verbatim dal canonico
 * (AVM-harness-desktop/harness-ui/src/custom-task.mjs) nella copia
 * standalone imbarcata nell'APK: LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
 * §11.5. Nessuna dipendenza esterna oltre node:fs/node:path — zero
 * adattamento richiesto.
 */
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

export class CustomTaskError extends Error {
  constructor(message, code = 'PROJECT_NOT_ALLOWED') {
    super(message);
    this.name = 'CustomTaskError';
    this.code = code;
  }
}

const COMANDO_PROVA_DEFAULT = 'npm test';
const CONSEGNA_MASSIMA_BYTE = 8192;

/** Proiezione leggera per il menu — mai il percorso assoluto verso il browser: solo id e nome, stesso principio di `listaTaskDisponibili`. */
export function elencaCartelleProgetto(cartelleProgetto) {
  return cartelleProgetto.map(({ id, nome }) => ({ id, nome }));
}

/**
 * ⭐⭐⭐ 28/8 — la validazione di un percorso "Full access", a RUNTIME (non
 * all'avvio: qui il percorso non è noto in anticipo). Stessa forma
 * dell'errore già dichiarata sopra, stessi controlli di
 * `config.mjs#parseCartelleProgetto` — deliberatamente duplicati invece
 * di importati: quella funzione valida un ARRAY all'avvio e fallisce
 * l'intero processo (`fail()`, mai recuperabile), questa valida UN
 * percorso per richiesta e deve tornare un errore HTTP onesto, non far
 * cadere il server.
 */
function validaCartellaLibera(percorsoInput, { realpathSyncFn = realpathSync, statSyncFn = statSync, accessSyncFn = accessSync } = {}) {
  if (typeof percorsoInput !== 'string' || percorsoInput.trim().length === 0) {
    throw new CustomTaskError('cartellaLibera mancante', 'QUERY_INVALID');
  }
  if (!isAbsolute(percorsoInput)) {
    throw new CustomTaskError('cartellaLibera deve essere un percorso assoluto', 'QUERY_INVALID');
  }
  let reale;
  try {
    reale = realpathSyncFn(percorsoInput);
  } catch {
    throw new CustomTaskError(`Il percorso non esiste o non è raggiungibile: ${percorsoInput}`, 'PROJECT_NOT_ALLOWED');
  }
  let stat;
  try {
    stat = statSyncFn(reale);
  } catch {
    throw new CustomTaskError(`Il percorso non è leggibile: ${percorsoInput}`, 'PROJECT_NOT_ALLOWED');
  }
  if (!stat.isDirectory()) {
    throw new CustomTaskError(`Il percorso non è una cartella: ${percorsoInput}`, 'PROJECT_NOT_ALLOWED');
  }
  try {
    accessSyncFn(reale, constants.R_OK | constants.W_OK);
  } catch {
    throw new CustomTaskError(`La cartella non è leggibile/scrivibile: ${percorsoInput}`, 'PROJECT_NOT_ALLOWED');
  }
  return reale;
}

/**
 * @returns {{cartella:string, comandoProva:string, task:object}} — mai un
 * `pulisci()`: non c'è una copia usa-e-getta da buttare, la cartella È
 * il progetto vero.
 *
 * ⭐ `cartellaLibera` (assoluta, validata da `validaCartellaLibera`) e
 * `cartellaId` (dall'allowlist) sono MUTUAMENTE ESCLUSIVI — chi chiama
 * decide quale dei due passare in base al permesso della sessione (vedi
 * session-registry.mjs), questa funzione si limita a rifiutare se
 * arrivano ENTRAMBI o NESSUNO dei due, mai a scegliere lei stessa.
 */
export function preparaEsecuzioneLibera(cartelleProgetto, { cartellaId, cartellaLibera, consegna, comandoProva }, deps = {}) {
  if ((cartellaId && cartellaLibera) || (!cartellaId && !cartellaLibera)) {
    throw new CustomTaskError('serve ESATTAMENTE uno fra cartellaId e cartellaLibera', 'QUERY_INVALID');
  }

  let cartella;
  let nomeProgetto;
  if (cartellaLibera) {
    cartella = validaCartellaLibera(cartellaLibera, deps);
    nomeProgetto = cartella.split(/[\\/]/).pop() || cartella;
  } else {
    if (typeof cartellaId !== 'string' || cartellaId.length === 0) {
      throw new CustomTaskError('cartellaId mancante', 'QUERY_INVALID');
    }
    const voce = cartelleProgetto.find((candidata) => candidata.id === cartellaId);
    if (!voce) throw new CustomTaskError(`Cartella non ammessa: ${cartellaId}`);
    cartella = voce.percorso;
    nomeProgetto = voce.nome;
  }

  if (typeof consegna !== 'string' || consegna.trim().length === 0) {
    throw new CustomTaskError('consegna mancante', 'QUERY_INVALID');
  }
  if (Buffer.byteLength(consegna, 'utf8') > CONSEGNA_MASSIMA_BYTE) {
    throw new CustomTaskError(`consegna oltre ${CONSEGNA_MASSIMA_BYTE} byte`, 'QUERY_INVALID');
  }

  let comando = COMANDO_PROVA_DEFAULT;
  if (comandoProva !== undefined && comandoProva !== null) {
    if (typeof comandoProva !== 'string' || comandoProva.trim().length === 0) {
      throw new CustomTaskError('comandoProva non valido', 'QUERY_INVALID');
    }
    comando = comandoProva;
  }

  return {
    cartella,
    comandoProva: comando,
    task: { consegna, consegnaCorta: consegna.length > 80 ? `${consegna.slice(0, 77)}...` : consegna, progetto: nomeProgetto },
  };
}
