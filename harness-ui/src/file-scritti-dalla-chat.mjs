/*
 * Decisione 215 dell'owner (04/11/2026): «Scarica», «Apri nel lettore» e «Invia al telefono» su un file FUORI dalla cartella della
 * chat funzionano solo se quel file compare fra i file che QUESTA chat ha creato o scritto. Ogni altro percorso fuori resta rifiutato.
 *
 * ⛔ La lista viene dagli EVENTI della sessione che il server ha registrato, mai dal percorso che manda il browser: il percorso chiesto
 *   serve solo a cercare una voce. Una sola fonte: lo `StateDelta` con `op` `add`/`replace` su `/file/<percorso>`
 *   (`eventoPerScrittura`, agui-events.mjs), che il nucleo manda SOLO dopo aver scritto davvero (`onScrittura`,
 *   kernel/talosHarness.mjs, dopo `discoAttivo().scrivi` di `scrivi` e dopo la sostituzione di `file_edit`), e che
 *   document_create e library_export mandano dopo il salvataggio. È lo stesso segnale «scrittura certa» di `attivita-figlia.mjs`.
 * ⛔ Revisori del giro 2 (08/11/2026, MEDIO, decisione 215): fino a ieri contava anche ogni chiamata di `scrivi`/`file_edit` con
 *   `isError !== true`, coi percorsi degli argomenti. Ma un `file_edit` fallito («NOT FOUND») torna con `isError` falso: il file
 *   che la chat NON ha scritto entrava nella lista, e diventava scaricabile e inviabile al telefono. Ora conta solo la scrittura
 *   confermata dal nucleo. ⚠ La cura RESTRINGE: un file che il nucleo non conferma non entra più.
 *   Hermes prende i file toccati da `files_modified`, che l'attrezzo riempie solo dopo aver verificato la scrittura
 *   (`hermes-agent-2026-11-01/tools/file_operations.py:1662`, letto in `agent/tool_dispatch_helpers.py:401`), ma se manca ricade
 *   sui bersagli dichiarati negli argomenti (`:404`): TALOS quel ripiego non lo tiene.
 * ⛔ Il confronto si fa sul REALPATH dei due lati (`fs.realpathSync.native`, «Synchronous realpath(3). Returns the resolved pathname»,
 *   nodejs.org/api/fs.html, letto il 04/11/2026): un `..`, una giunzione, un collegamento simbolico o le maiuscole diverse portano allo
 *   stesso file solo se ci portano davvero; un file che non esiste più non si serve. Su Windows il confronto ignora le maiuscole, come
 *   il file system (`chiave` di `remoto/file-dispositivi.mjs`).
 * Hermes (`hermes-agent-2026-11-01/apps/desktop/electron/hardening.ts:401-439`, `resolveRequestedPathForIpc`) risolve il bersaglio contro
 *   la cartella di lavoro SENZA nessun confine, e i soli freni sono i file sensibili sul percorso chiesto e sul reale (`:543-560`). TALOS
 *   tiene il confine e lo allarga solo ai file che la chat stessa ha scritto; i controlli dei segreti restano quelli di prima.
 */
import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

const ATTREZZI_DI_SCRITTURA = new Set(['scrivi', 'file_edit']);

const chiave = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

/** Le operazioni `/file/<percorso>` di uno `StateDelta` (la scrittura confermata dal nucleo), o `[]`. */
function percorsiDelDelta(e) {
  if (e?.type !== 'StateDelta' || !Array.isArray(e.delta)) return [];
  const percorsi = [];
  for (const op of e.delta) {
    if ((op?.op === 'add' || op?.op === 'replace') && typeof op.path === 'string' && op.path.startsWith('/file/')) {
      const p = op.path.slice('/file/'.length);
      if (p) percorsi.push(p);
    }
  }
  return percorsi;
}

/** I percorsi (così come li ha scritti il nucleo) dei file creati o scritti dalla chat: solo le scritture confermate. Puro. */
export function percorsiScrittiDaEventi(eventi) {
  const percorsi = new Set();
  for (const e of Array.isArray(eventi) ? eventi : []) {
    if (!e || typeof e !== 'object') continue;
    for (const p of percorsiDelDelta(e)) percorsi.add(p);
  }
  return [...percorsi];
}

/**
 * Per l'elenco del telefono (`daiEventi` di `remoto/file-dispositivi.mjs`): i file che `scrivi`/`file_edit` hanno scritto DAVVERO,
 * col giro (numero di `RunStarted` visti). Una riga è uno `StateDelta` `/file/<p>` arrivato mentre una chiamata di `scrivi` o
 * `file_edit` era aperta (fra il suo `ToolCallStart` e il suo `ToolCallResult`), ed entra solo quando quella chiamata si chiude:
 * il percorso è quello che il nucleo ha scritto (`percorsoDelGiro(percorsoDiFile(argomenti))`, la vista Windows anche nella casa
 * Linux), mai quello degli argomenti. Un `file_edit` fallito non manda lo `StateDelta`, quindi non entra, con qualunque alias.
 * L'esito `isError` non decide niente (revisori del giro 2, 08/11/2026). Puro.
 * @returns {{percorso:string, giro:number}[]}
 */
export function scrittureConfermateDaEventi(eventi) {
  const righe = [];
  const aperte = new Map();
  let giro = 0;
  for (const e of Array.isArray(eventi) ? eventi : []) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'RunStarted') giro += 1;
    if (e.type === 'ToolCallStart' && typeof e.toolCallId === 'string') {
      aperte.set(e.toolCallId, { scrive: ATTREZZI_DI_SCRITTURA.has(String(e.toolCallName ?? '')), confermati: [] });
    } else if (e.type === 'StateDelta') {
      const percorsi = percorsiDelDelta(e);
      if (percorsi.length) for (const c of aperte.values()) if (c.scrive) c.confermati.push(...percorsi);
    } else if (e.type === 'ToolCallResult' && aperte.has(e.toolCallId)) {
      const c = aperte.get(e.toolCallId);
      aperte.delete(e.toolCallId);
      for (const percorso of c.scrive ? c.confermati : []) righe.push({ percorso, giro });
    }
  }
  return righe;
}

const realeOppureNull = (p, realpathFn) => { try { return realpathFn(p); } catch { return null; } };

/**
 * Il realpath del file chiesto, se è uno dei file scritti dalla chat; altrimenti `null`.
 * @param {{cartella:string, percorso:string, eventi:unknown[], realpathFn?:(p:string)=>string}} richiesta — `cartella` è la base
 *   contro cui si risolvono i percorsi relativi, sia quello chiesto sia quelli scritti (la stessa del nucleo e della rotta).
 */
export function realeScrittoDallaChat({ cartella, percorso, eventi, realpathFn = realpathSync.native }) {
  if (typeof cartella !== 'string' || !cartella || typeof percorso !== 'string' || !percorso || percorso.includes('\0')) return null;
  const voluto = realeOppureNull(isAbsolute(percorso) ? percorso : resolve(cartella, percorso), realpathFn);
  if (!voluto) return null;
  const cercata = chiave(voluto);
  for (const scritto of percorsiScrittiDaEventi(eventi)) {
    if (scritto.includes('\0')) continue;
    const reale = realeOppureNull(isAbsolute(scritto) ? scritto : resolve(cartella, scritto), realpathFn);
    if (reale && chiave(reale) === cercata) return reale;
  }
  return null;
}
