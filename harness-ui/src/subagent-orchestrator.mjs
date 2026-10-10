/**
 * subagent-orchestrator.mjs — FASE C (sub-agenti), piano
 * `elegant-spinning-dongarra.md`. Delega isolata verso una sessione
 * figlia — un differenziatore diretto rispetto allo stato dell'arte
 * (vincolo persistente dell'owner). Vedi `.claude/LEDGER-FASE-C-SUBAGENTI.md`
 * per il ledger completo, il confronto competitivo e le decisioni
 * prese in corso d'opera.
 *
 * ⛔ Zero registro proprio: opera sulla STESSA `Map` `sessioni` di
 * `session-registry.mjs`, iniettata — mai una seconda fonte di verità
 * su quali sessioni esistono.
 *
 * ⭐⭐⭐ I numeri sotto sono quelli VERI trovati in ricerca, letti da un
 * repository open source dello stesso spazio clonato il 28/8 — non
 * inventati, non presi da doc secondari (due correzioni fatte quel
 * giorno su claim sbagliati di doc secondari, vedi il ledger): un
 * tetto di 10 figli concorrenti di default, e una profondità massima
 * di delega di 2, con la nota nel codice sorgente "for parity with the
 * original MAX_DEPTH constant".
 */

/** Fonte: ricerca su un progetto open source dello stesso spazio, letto il 28/8. */
import { existsSync, statSync } from 'node:fs';
import { attivitaDellaVoce } from './attivita-figlia.mjs';
import { parse as parsePath } from 'node:path';
import { delegaLimitata, modalitaDelega } from './delegation-contract.mjs';

export const LIMITE_FIGLI_CONCORRENTI = 10;

/**
 * Fonte: la stessa ricerca sopra. A differenza dell'approccio trovato
 * (che non ha un tetto duro oltre il default, solo un avviso in log),
 * questa prima fetta applica un tetto DURO — scelta più prudente
 * finché non c'è una misura reale che dica se serve di più (stesso
 * principio "si aggiunge quando serve" già in uso per `GIRI_MASSIMI`
 * nel kernel).
 */
export const LIMITE_PROFONDITA_DELEGA = 2;

const TOOL_ERRORE_ESPLICITO = /^(?:\s*(?:error\b|exit\s+[1-9]\d*\b)|.*\b(?:ENOENT|no such file or directory|could not|unable to|failed to|not accessible|no file matches|non riesco|problema di configurazione|this tool did not run|I cannot tell it from a loop)\b)/i;
// Compatibility heuristic for old journals, never an authorization mechanism.
const VERBO_SCRITTURA = '(?:scriv\\w*|modific\\w*|aggiorn\\w*|crea(?:re|te|to|ta|ti)?|aggiung\\w*|elimin\\w*|rinomin\\w*|implement\\w*|writ(?:e|es|ing)|modify(?:ing)?|modifying|updat(?:e|es|ing)|creat(?:e|es|ing)|add(?:ing)?|delet(?:e|es|ing)|renam(?:e|es|ing))';
const TASK_SCRITTURA_ESPLICITA = new RegExp(`\\b${VERBO_SCRITTURA}\\b`, 'i');
const SCRITTURE_NEGATE = new RegExp(`\\b(?:senza|non(?:\\s+(?:devi|deve|puoi|bisogna))?|without|do\\s+not|don't)\\s+(?:mai\\s+)?${VERBO_SCRITTURA}\\b(?:\\s*(?:,\\s*(?:(?:e|o|and|or)\\s+)?|(?:e|o|and|or)\\s+)${VERBO_SCRITTURA}\\b)*`, 'gi');

/** Una richiesta esplicita di modifica richiede una prova di file/artefatto, non solo una risposta tool. */
export function taskRichiedeEvidenzaScrittura(task) {
  const testo = typeof task === 'string' ? task : task?.consegna ?? task?.consegnaCorta ?? '';
  return TASK_SCRITTURA_ESPLICITA.test(compitoDaPromptDiDelega(String(testo)).replace(SCRITTURE_NEGATE, ''));
}

/**
 * Riassume soltanto i segnali operativi già emessi dal figlio. Il testo
 * finale del modello non è una prova di scrittura: una delega può dichiarare
 * "fatto" anche quando ogni terminale ha risposto con un errore.
 *
 * @param {Array<object>|undefined|null} eventi
 * @returns {{scritture:number, artefatti:number, toolCalls:number, toolCallsOk:number, toolCallsFalliti:number, verificabile:boolean}|null}
 */
export function analizzaEvidenzaDelega(eventi) {
  if (!Array.isArray(eventi)) return null;
  let scritture = 0;
  let artefatti = 0;
  let toolCalls = 0;
  let toolCallsOk = 0;
  let toolCallsFalliti = 0;
  for (const evento of eventi) {
    if (evento?.type === 'ArtifactCreated') artefatti += 1;
    if (evento?.type === 'StateDelta') {
      const delta = Array.isArray(evento.delta) ? evento.delta : [];
      scritture += delta.filter((voce) => typeof voce?.path === 'string' && voce.path.startsWith('/file/')).length;
    }
    if (evento?.type !== 'ToolCallResult') continue;
    toolCalls += 1;
    // Runtime metadata has priority over untrusted file/tool contents. Old journals
    // retain their compatibility fallback until their producers supply a typed result.
    const codicePresente = Number.isSafeInteger(evento.exitCode);
    const erroreEsplicito = evento.isError === true || (codicePresente && evento.exitCode !== 0);
    const esitoNoto = typeof evento.isError === 'boolean' || codicePresente;
    const fallito = esitoNoto ? erroreEsplicito : TOOL_ERRORE_ESPLICITO.test(String(evento.content ?? ''));
    if (fallito) toolCallsFalliti += 1;
    else toolCallsOk += 1;
  }
  return {
    scritture,
    artefatti,
    toolCalls,
    toolCallsOk,
    toolCallsFalliti,
    verificabile: scritture > 0 || artefatti > 0 || toolCallsOk > 0,
  };
}

function motivoEvidenzaMancante(evidenza) {
  const dettaglio = `${evidenza.toolCallsFalliti} of ${evidenza.toolCalls} tools failed and there are no writes or artifacts`;
  return `The sub-agent declared success, but left no verifiable evidence: ${dettaglio}. The work is not considered finished.`;
}

/** C3 tappa 4 — il valore della nota «nessuna modifica fatta» (protocollo, mai a schermo: lo traduce l'interfaccia). */
export const NOTA_NESSUNA_MODIFICA = 'nessuna-modifica';

/** C3 tappa 4 — quanti risultati di attrezzi non portano un esito tipizzato (`isError`/`exitCode`): per loro decide la regex. */
function risultatiSenzaTipo(eventi) {
  if (!Array.isArray(eventi)) return 0;
  return eventi.filter((evento) => evento?.type === 'ToolCallResult'
    && typeof evento.isError !== 'boolean' && !Number.isSafeInteger(evento.exitCode)).length;
}

/**
 * Traduce il risultato di `agent-service.avviaSessione` (il "risultato"
 * catturato dentro il `.then()`/`.catch()` di `avviaESegui`) nella
 * forma onesta che il kernel (`onDelega`) si aspetta — mai un successo
 * inventato quando la figlia non ha concluso per davvero.
 *
 * @param {{ok?: boolean, esito?: object|null, erroreInterno?: string|null}|null} risultato
 * @param {Array<object>|undefined|null} [eventi] eventi AG-UI persistiti dalla figlia
 * @param {{task?:string|object}} [contesto] richiesta originale, per distinguere una lettura da una modifica
 */
export function esitoDelegaDaRisultato(risultato, eventi, contesto = {}) {
  if (modalitaDelega(contesto.task) === 'invalida') {
    return { esito: 'fallito', riassunto: null, motivo: 'The delegation contract is not valid: no capability can be assumed.' };
  }
  if (risultato?.ok) {
    /*
     * ⭐ C3 tappa 4 (09/10/2026, decisione owner «fatti strutturati + nota») — IL VERDETTO NON LEGGE PIÙ IL COMPITO.
     *   Prima una delega «riuscita» diventava fallita se il TESTO del compito conteneva un verbo di modifica e la figlia non
     *   aveva scritto: in tedesco, o con un'altra parola, lo stesso lavoro aveva un altro verdetto. Ora, come Hermes
     *   (`tools/delegate_tool_child_run.py:563-586`: interrotta / errore / conclusa con un riassunto usabile), decidono i FATTI:
     *   - il giro concluso dal kernel (questo ramo: `ok`);
     *   - un riassunto non vuoto (Hermes: senza riassunto usabile è «failed»);
     *   - attrezzi non tutti falliti senza lasciare scritture né artefatti (`isError`/`exitCode` del risultato).
     *   La modalità DICHIARATA (`contrattoDelega.modalita`) aggiunge solo una NOTA: «modifica» senza scritture né artefatti resta
     *   concluso, e il padre e l'interfaccia leggono «nessuna modifica fatta». ⛔ La modalità di serie è «modifica» quando il
     *   padre può scrivere (`delegaSottoTask`): farla decidere avrebbe giudicato fallita ogni ricerca delegata.
     *   I giornali VECCHI senza contratto (o con risultati di attrezzi senza campi tipizzati) usano ancora le regex, solo per
     *   la nota e per gli esiti degli attrezzi: il verdetto lo dice (`verdetto:'euristico'`).
     */
    const evidenza = analizzaEvidenzaDelega(eventi);
    const modo = modalitaDelega(contesto.task);
    /* un giornale scritto prima che `RunFinished` portasse `result` non dice il riassunto: non è VUOTO, è non registrato, e
       la regola del riassunto non può rovesciare il suo verdetto al ripristino */
    const riassuntoIgnoto = contesto.riassuntoNonRegistrato === true;
    const verdetto = modo === null || riassuntoIgnoto || risultatiSenzaTipo(eventi) > 0 ? 'euristico' : 'strutturato';
    const detto = typeof risultato.esito?.detto === 'string' ? risultato.esito.detto.trim() : '';
    if (!detto && !riassuntoIgnoto) {
      return { riassunto: '(the sub-agent left no text summary)', esito: 'fallito', verdetto,
        motivo: 'The sub-agent finished without a summary of what it did. The work is not considered finished.' };
    }
    const riassunto = detto || '(the sub-agent left no text summary)';
    if (evidenza && evidenza.toolCalls > 0 && !evidenza.verificabile) {
      return { riassunto, esito: 'fallito', verdetto, motivo: motivoEvidenzaMancante(evidenza) };
    }
    const potevaModificare = modo === 'modifica' || (modo === null && taskRichiedeEvidenzaScrittura(contesto.task));
    if (potevaModificare && evidenza && evidenza.scritture === 0 && evidenza.artefatti === 0) {
      return { riassunto, esito: 'concluso', verdetto, nota: NOTA_NESSUNA_MODIFICA,
        motivo: 'Note: the sub-agent could change files but made no change. Check whether a change was needed.' };
    }
    return { riassunto, esito: 'concluso', verdetto };
  }
  if (risultato?.esito) {
    // giri-esauriti / fermato: la figlia ha girato, non ha chiuso il task.
    return {
      riassunto: risultato.esito.detto || `The sub-task did not finish (${risultato.esito.comeFinita}).`,
      esito: 'fallito',
    };
  }
  // erroreInterno: avviaSessione dichiara di non lanciare mai, ma un ripiego onesto resta necessario (stesso principio già in uso nel .catch() di avviaESegui).
  return { riassunto: null, esito: 'fallito', motivo: risultato?.erroreInterno ?? 'unknown error in the child session' };
}

/** Ricostruisce il verdetto di una figlia dopo il riavvio del server. */
export function esitoDelegaDaEventi(eventi, contesto = {}) {
  return verdettoDelegaDaEventi(eventi, contesto)?.esito ?? null;
}

/** C3 tappa 4 — il verdetto intero ricostruito dagli eventi (esito, nota, verdetto), come alla fine del giro. */
export function verdettoDelegaDaEventi(eventi, contesto = {}) {
  if (!Array.isArray(eventi)) return null;
  const terminale = [...eventi].reverse().find((evento) => evento?.type === 'RunFinished' || evento?.type === 'RunError');
  if (!terminale) return null;
  /* C3 tappa 4: una figlia in pausa chiude il giro con un RunError `in-pausa` (talosHarness.mjs). Non è un fallimento: dopo un
     riavvio deve restare «in-pausa», o Riprendi la rifiuta (`riprendiFiglia`) e il modello la legge «failed». */
  if (terminale.type === 'RunError' && terminale.code === 'in-pausa') return { esito: 'in-pausa', nota: null, verdetto: 'strutturato' };
  if (terminale.type === 'RunError') return { esito: 'fallito', nota: null, verdetto: 'strutturato' };
  const esito = esitoDelegaDaRisultato({ ok: true, esito: { detto: terminale.result?.detto ?? '', comeFinita: 'concluso' } }, eventi,
    { ...contesto, riassuntoNonRegistrato: terminale.result === undefined });
  return { esito: esito.esito, nota: esito.nota ?? null, verdetto: esito.verdetto ?? null };
}

/*
 * ⛔ 0.1.23 (bugfixer, 08/10/2026) — IL RESOCONTO DI UNA FIGLIA, ACCANTO AL SUO ESITO E NON AL POSTO SUO.
 *   La scheda dell'agente diceva «Che cosa ha riportato: concluso»: leggeva `esitoDelega`, che è uno STATO (concluso,
 *   fallito, fermato), perché il resoconto non usciva mai dal server. Hermes tiene i due fatti separati (`child_status` e
 *   `child_summary`, tools/delegate_tool_results.py:369; e :308 «is "failed" even when a summary exists»).
 * ⇒ `riassuntoDelega` è il testo con cui la figlia ha chiuso il suo ultimo giro (`result.detto`), solo se c'è davvero — mai
 *   il segnaposto che il modello della madre riceve quando manca — e con un tetto, perché viaggia in ogni snapshot.
 */
export const TETTO_RIASSUNTO_DELEGA = 2000;
/*
 * ⛔ Review della sessione desktop (08/10/2026, GIALLO): quando un giro non finisce «concluso» il kernel ANTEPONE al testo
 *   della figlia una riga di STATO, in inglese (`talosHarness.mjs`, `ultimoTesto = \`${comeFinita.detto}\n${ultimoTesto}\``):
 *   fermata su richiesta, giri esauriti, generazione ferma senza risposta, ripetizione. Senza toglierla, «Che cosa ha
 *   riportato» ricominciava con uno stato — lo stesso difetto che questo campo cura. Si toglie SOLO la prima riga, SOLO se è
 *   una di queste frasi (dall'inizio), e MAI per un giro concluso: il testo della figlia che segue resta. Al ripristino
 *   `comeFinita` non c'è (il `RunFinished` salvato porta solo `detto`): vale il riconoscimento della frase.
 *   `delega-riassunto.test.mjs` legge il kernel e diventa rosso se una di queste frasi cambia lì.
 */
export const PREFISSI_STATO_DEL_KERNEL = Object.freeze([
  '⛔ stopped on request',                       // fermato su richiesta (con o senza il punto di fermata)
  '⏸ paused on request',                         // C3 tappa 4: messo in pausa (la delega riprende con un messaggio nuovo)
  '⛔ turns exhausted:',                         // giri esauriti
  '⛔ generation stopped without an answer',     // generazione ferma senza risposta
  '⛔ the model asked ',                         // la stessa richiesta ripetuta nella stessa risposta
]);
export function riassuntoDelegaDaDetto(detto, { comeFinita = null } = {}) {
  if (typeof detto !== 'string') return null;
  let testo = detto.trim();
  if (comeFinita !== 'concluso') {
    const [prima, ...resto] = testo.split('\n');
    if (PREFISSI_STATO_DEL_KERNEL.some((p) => prima.startsWith(p))) testo = resto.join('\n').trim();
  }
  if (!testo) return null;
  return testo.length > TETTO_RIASSUNTO_DELEGA ? `${testo.slice(0, TETTO_RIASSUNTO_DELEGA - 1)}…` : testo;
}
/** Lo stesso resoconto dopo il riavvio del server: il `result.detto` dell'ultimo giro chiuso bene (un errore non ne ha). */
export function riassuntoDelegaDaEventi(eventi) {
  if (!Array.isArray(eventi)) return null;
  const terminale = [...eventi].reverse().find((evento) => evento?.type === 'RunFinished' || evento?.type === 'RunError');
  return terminale?.type === 'RunFinished' ? riassuntoDelegaDaDetto(terminale.result?.detto) : null;
}

/**
 * @param {Map<string, object>} sessioni — la STESSA Map di session-registry.mjs.
 * @param {Function} avviaESeguiFn — la funzione interna avviaESegui di session-registry.mjs, non una sua copia.
 */
/** Uno dei due controlli sul percorso che il kernel non può fare: esiste, ed è una cartella. */
export function esisteCartella(percorso, { esiste = existsSync, stato = statSync } = {}) {
  const p = String(percorso || '');
  if (!p.trim()) return false;
  try { return esiste(p) && stato(p).isDirectory(); } catch { return false; }
}

/**
 * La FORMA di un percorso: come è ancorato, non dove porta. È la sola cosa che distingue
 * «C:\progetto» da «/mnt/c/progetto» PRIMA di toccare il disco.
 *
 * ⛔⛔⛔ 13/09/2026 — MISURATO SU QUESTA MACCHINA (Windows 11, Node v24.18.0), non dedotto.
 *   `esisteCartella` da sola NON ferma un percorso di un altro sistema operativo, perché su
 *   Windows un percorso che comincia con `/` è ANCORATO ALL'UNITÀ CORRENTE, non rifiutato:
 *     esisteCartella('/tmp')   → true   (il disco risponde per C:\tmp)
 *     esisteCartella('/Users') → true   (il disco risponde per C:\Users)
 *     esisteCartella('src')    → true   (relativo: risolto sulla cartella del SERVER, non su
 *                                        quella della madre — la figlia finirebbe in harness-ui)
 *   Cioè: tre forme storte ACCETTATE IN SILENZIO, e la figlia parte in una cartella che nessuno
 *   ha scelto. Le due che il difetto dell'08/09 nominava (`/mnt/c/…`, `/home/user/app`) venivano
 *   fermate solo per caso — perché `C:\mnt` e `C:\home` non esistono su QUESTA macchina.
 *
 * Fonte (documentazione ufficiale Node v24, modulo `path` e modulo `fs`, letta il 13/09/2026 via
 * ctx7): `path.isAbsolute('//server')` e `path.isAbsolute('\\\\server')` sono `true` su Windows, e
 * «On Windows, Node.js follows the concept of per-drive working directory» — cioè `isAbsolute` da
 * solo NON distingue le due forme, mentre `path.parse().root` sì: `'/'` per un percorso ancorato
 * alla sola radice, `'C:\'` per un'unità, `'\\server\share\'` per la rete, `''` per un relativo.
 * ⛔ Ricerca web NON disponibile in questa sessione (budget esaurito, 200/200): la citazione è la
 *   documentazione ufficiale del runtime, che per questa domanda è la fonte primaria.
 *
 * @returns {'assente'|'relativo'|'radice-sola'|'unita'|'unita-senza-radice'|'rete'}
 */
export function formaDelPercorso(percorso) {
  const p = String(percorso ?? '');
  if (!p.trim()) return 'assente';
  const radice = parsePath(p).root;
  if (radice === '') return 'relativo';
  if (/^[A-Za-z]:$/u.test(radice)) return 'unita-senza-radice'; // «C:progetto»: relativo alla cartella corrente DI QUELL'UNITÀ
  if (/^[A-Za-z]:[\\/]$/u.test(radice)) return 'unita';
  if (radice === '/' || radice === '\\') return 'radice-sola';
  return 'rete';
}

/**
 * Il percorso che il MODELLO ha proposto per la figlia è utilizzabile su questo computer?
 *
 * ⛔ La misura NON è «assomiglia a Windows»: è «ha la STESSA FORMA della cartella in cui la madre
 *   sta già lavorando». Quella cartella l'ha scelta una persona ed è vera per costruzione, quindi
 *   è il metro giusto — e si tara da sé, senza una riga che nomini un sistema operativo. Il kernel
 *   non può farlo: non sa in che forma è il disco (`talosHarness.mjs`, `delega_sottotask`, che per
 *   questo delega il no a `onDelega`).
 *
 * ⛔ Percorso assente ⇒ nessun giudizio: si lavora dove lavora la madre, ed è il caso NORMALE
 *   (stato dell'arte letto il 06/09/2026: i sotto-agenti condividono la cartella del padre).
 *
 * @returns {{ok:true}|{ok:false, motivo:string}} mai un'eccezione: un rifiuto è un esito.
 */
export function percorsoDellaFigliaUsabile(proposto, cartellaMadre) {
  const forma = formaDelPercorso(proposto);
  if (forma === 'assente') return { ok: true };
  const formaMadre = formaDelPercorso(cartellaMadre);
  if (forma === formaMadre) return { ok: true };
  /*
   * ⛔ Il motivo PORTA la cartella giusta, scritta per esteso. Un rifiuto che dice solo «no»
   *   lascia il modello a indovinare, ed è esattamente così che sono morte tre deleghe di fila:
   *   vedeva un REFUSED, inventava un'altra forma, ne vedeva un altro. Chi rifiuta e conosce la
   *   risposta la dice.
   */
  const spiegazione = forma === 'relativo' || forma === 'unita-senza-radice'
    ? `the folder "${proposto}" is not an absolute path`
    : `the folder "${proposto}" is written in the form of another operating system`;
  if (formaMadre === 'assente') {
    return { ok: false, motivo: `${spiegazione}. Omit the folder to work where the one who delegated to you works.` };
  }
  return {
    ok: false,
    motivo: `${spiegazione}: on this computer paths are written like "${cartellaMadre}". `
      + `Omit the folder to work where the one who delegated to you works, or use exactly "${cartellaMadre}".`,
  };
}

/*
 * `cartellaEsisteFn` si inietta: le prove costruiscono sessioni con cartelle che sul disco non
 * esistono, e il controllo vero (quello che ferma un percorso in forma WSL) resta acceso in produzione.
 */
/**
 * Il COMPITO dentro il prompt che il kernel costruisce per una figlia.
 * ⛔ `Compito:` è il marcatore del kernel dell'owner (`mobile/scripts/harness-talos`), che non è di questa
 *   lane: se un giorno cambia, il nome torna a essere il preambolo — brutto e visibile, mai un silenzio.
 *   Senza marcatore si restituisce la stringa intera: non si indovina dove finisce un preambolo che non c'è.
 */
export function compitoDaPromptDiDelega(prompt) {
  const testo = typeof prompt === 'string' ? prompt : prompt?.consegna ?? '';
  const marcatore = new RegExp(String.raw`(?:^|[.` + String.fromCharCode(10) + String.raw`])\s*Compito\s*:\s*`, 'u').exec(testo);
  if (!marcatore) return testo;
  const dopo = testo.slice(marcatore.index + marcatore[0].length).trim();
  return dopo || testo;
}

/**
 * ⛔⛔⛔⛔ BC-76, secondo giro (17/09/2026) — CON QUALE MODELLO NASCE UNA FIGLIA.
 *
 * Era `padre.modello ?? null`, scritto qui dentro. Reggeva finché una madre era per forza cloud;
 * da quando una sessione `provider:'local'` esegue gli attrezzi, quella riga **mandava fuori casa**
 * il compito delegato: `voce.modello` di una madre locale è il `modelId` NUDO del GGUF, e
 * `separaFonteModello` legge un id nudo come OpenRouter.
 *
 * ⇒ La domanda «come si chiama in rete il modello di questa sessione» ha già una risposta sola, in
 *   `session-registry.mjs` (`modelloDellaFiglia` → `modelloDiSessionePerRete`). Qui NON si ricopia:
 *   si riceve. ⛔ E non si importa nemmeno — `session-registry` importa già questo file, e un ciclo
 *   fra i due metterebbe una costante di modulo in zona morta a seconda di chi viene caricato prima.
 *
 * Il default riproduce il comportamento di prima **parola per parola**: un host che non passa questa
 * dipendenza non cambia di un byte.
 *
 * @callback ModelloPerLaFiglia
 * @param {object} padre la voce della sessione madre
 * @returns {{ok: true, modello: string|null} | {ok: false, motivo: string}}
 */

/**
 * C2 R6-bis (owner 08/10/2026, «Segnalo anche») — per ogni «Consenti sempre» del padre, che la figlia riceve per COPIA alla
 * nascita, la sessione che l'ha dato: il padre, oppure, se anche il suo era una copia, la sua origine. `null` se il padre non ha
 * nessun «sempre». Esportata per le prove.
 * @param {object|null|undefined} padre la voce della sessione madre (`permessiPerAttrezzo`, `origineSempre`)
 * @param {string} padreId
 * @returns {Record<string, string>|null}
 */
export function origineDeiSempreCopiati(padre, padreId) {
  const origine = {};
  for (const [attrezzo, valore] of Object.entries(padre?.permessiPerAttrezzo ?? {})) {
    if (valore !== 'sempre') continue;
    const daChi = padre?.origineSempre?.[attrezzo];
    origine[attrezzo] = typeof daChi === 'string' && daChi ? daChi : padreId;
  }
  return Object.keys(origine).length ? origine : null;
}

export function creaSubagentOrchestrator({
  sessioni, avviaESeguiFn, cartellaEsisteFn = esisteCartella,
  modelloPerLaFigliaFn = (padre) => ({ ok: true, modello: padre?.modello ?? null }),
  statisticheFiglioFn = () => ({}),
  onFiglioCreatoFn = null,
  onFiglioConclusoFn = null,
  /*
   * ⭐ CLI, passo 7 dei sotto-agenti asincroni (owner 01/10/2026), FACOLTATIVI: i due tetti e lo sforzo di serie della
   * figlia, come la configurazione `agents.*` di Codex (core/src/config/mod.rs:3845-3870). Senza, tutto resta com'era:
   * LIMITE_FIGLI_CONCORRENTI, LIMITE_PROFONDITA_DELEGA e lo sforzo della madre. Un valore che non è un intero positivo
   * vale come assente; gli intervalli ammessi li decide chi compone (la CLI: 1–32 e 1–4).
   */
  limiti = null,
  figlioDefault = null,
  /* C3 tappa 4: `(childId, consegna, { onConclusioneFn }) => avvio` — la ripresa di una figlia con un messaggio nuovo (il registro
     passa la sua `resume`). FACOLTATIVA: senza, «Riprendi» e «Riprova» dicono che qui non si può (la CLI non cambia). */
  riprendiFn = null,
}) {
  const interoPositivo = (valore, diSerie) => (Number.isSafeInteger(valore) && valore > 0 ? valore : diSerie);
  const limiteFigli = interoPositivo(limiti?.figliConcorrenti, LIMITE_FIGLI_CONCORRENTI);
  const limiteProfondita = interoPositivo(limiti?.profondita, LIMITE_PROFONDITA_DELEGA);
  const reasoningDiSerie = figlioDefault?.reasoning && typeof figlioDefault.reasoning === 'object' ? figlioDefault.reasoning : null;
  function notificaSenzaBloccare(callback, payload, { onErrore = null } = {}) {
    if (typeof callback !== 'function') return;
    Promise.resolve()
      .then(() => callback(payload))
      .catch((errore) => {
        if (typeof onErrore === 'function') {
          try { onErrore(errore); } catch { /* la diagnosi non deve mascherare l'errore originale */ }
        }
        console.error('[subagent-orchestrator] notifica asincrona fallita:', errore instanceof Error ? errore.message : errore);
      });
  }

  function contaFigliAttivi(sessionPadreId) {
    let n = 0;
    for (const voce of sessioni.values()) {
      /* ⛔ 20/09/2026 — una figlia ripristinata dopo la morte del processo ha
         `conclusa:false` MA `interrotta:true`: non c'è più nessun worker che occupi
         capacità. Contarla qui saturerebbe per sempre il limite legacy con processi morti. */
      if (voce.padreId === sessionPadreId && voce.conclusa !== true && voce.interrotta !== true) n += 1;
    }
    return n;
  }

  /** Proietta una sola figlia. Gli eventi live non devono ricalcolare tutte le sorelle. */
  function snapshotFiglio(sessionId) {
    const voce = sessioni.get(sessionId);
    if (!voce?.padreId) return null;
    const statistiche = statisticheFiglioFn(voce) ?? {};
    return {
          sessionId,
          parentId: voce.padreId,
          task: voce.task?.consegna ?? null,
          /*
           * ⛔ 09/09, visto nella FOTO della scheda «Agenti» dopo il giro vero della delega (D2): le due
           * schede si chiamavano ENTRAMBE «Sei una sessione di lavoro autonoma; non hai altro …», cioè
           * il preambolo del kernel, che è identico per ogni figlia. La barra era già stata curata poche
           * ore prima; qui no, perché la scheda legge QUESTA funzione e non `elenca()`. Stesso difetto,
           * secondo consumatore — la cura non si copia, si espone il dato una volta sola.
           * ⛔ `task` resta la consegna INTERA: il foglio «Albero sessione» la mostra per esteso, e
           * togliere informazione a un consumatore per aggiustarne un altro è esattamente il modo di
           * rifare il giro fra un mese. Il nome corto viaggia accanto.
           */
          taskCorto: voce.task?.consegnaCorta ?? (voce.task?.consegna ? compitoDaPromptDiDelega(voce.task.consegna) : null),
          /* C2b «Coordinazione»: come è partita — 'da-solo' | 'consentito' | null (prima di C2b, o senza Coordinazione). Il grafo e
             la scheda «Agenti» lo dicono accanto al nome, e il modello se la persona ne ha chiesto un altro. */
          avvio: voce.avvioDelega ?? null,
          modello: voce.modello ?? null,
          /*
           * ⛔ D3 — i file che QUESTA figlia ha scritto e che anche un'altra sorella ha toccato. La
           * lista sta sulla madre (il registro la scrive mentre gli eventi passano); qui esce filtrata
           * per la figlia, perché la scheda «Agenti» parla di una delega alla volta. Vuota quasi
           * sempre: se non lo è, due deleghe si sono pestate i piedi e va detto.
           */
          collisioni: (sessioni.get(voce.padreId)?.collisioniDiScrittura ?? [])
            .filter((c) => c.prima === sessionId || c.poi === sessionId)
            .map((c) => ({ percorso: c.percorso, primaDi: c.prima === sessionId ? null : c.prima, dopoDi: c.poi === sessionId ? null : c.poi })),
          conclusa: voce.conclusa,
          /*
           * ⛔ 06/9, T05-D3 un piano più sotto: senza questo campo un sotto-agente ucciso dalla
           * morte del processo restava «In corso» per sempre nella scheda Agenti e nel foglio
           * dell'albero — e il frontend non aveva NIENTE con cui dire il vero, perché il dato
           * non usciva da qui. Il registro la conosce (`interrotta: !conclusa` al ripristino).
           */
          interrotta: voce.interrotta === true,
          esitoDelega: voce.esitoDelega ?? null,
          // C3 tappa 4: la nota «nessuna modifica fatta» e da dove viene il verdetto (fatti strutturati o ripiego dei giornali vecchi)
          notaDelega: voce.notaDelega ?? null,
          verdettoDelega: voce.verdettoDelega ?? null,
          riassuntoDelega: voce.riassuntoDelega ?? null, // 0.1.23: il resoconto della figlia, separato dal suo stato
          evidenzaDelega: voce.evidenzaDelega ?? null,
          avviataAlle: voce.avviataAlle ?? null,
          conclusaAlle: statistiche.conclusaAlle ?? null,
          ultimaAttivitaAlle: statistiche.ultimaAttivitaAlle ?? null,
          approvalPendingCount: Number.isSafeInteger(statistiche.approvalPendingCount) ? statistiche.approvalPendingCount : 0,
          questionPendingCount: Number.isSafeInteger(statistiche.questionPendingCount) ? statistiche.questionPendingCount : 0,
          ultimoEsito: statistiche.ultimoEsito ?? null,
          motivoChiusura: statistiche.motivoChiusura ?? null,
          usageSessione: statistiche.usageSessione ?? null,
          operazioneCorrente: statistiche.operazioneCorrente ?? null,
          erroreConsegnaDelega: voce.erroreConsegnaDelega ?? null,
          /*
           * ⛔⛔ PO-30 (18/09/2026) — ciò che serve al DETTAGLIO di un agente e alla scheda File («chi sta toccando questo
           *   file»), come nel laboratorio dell'owner ma dai dati veri: il modello e i permessi con cui la figlia gira, e che
           *   cosa ha LETTO e SCRITTO — ricavato dagli eventi che la figlia ha già emesso (`attivita-figlia.mjs`, pura, con un
           *   tetto che dice quanti file ha tagliato). Niente di nuovo si raccoglie e niente si scrive sul disco.
           */
          modello: voce.modello ?? null,
          permessi: voce.permessi ?? null,
          attivita: attivitaDellaVoce(voce), // 02/10: a incremento, stesso risultato del ricalcolo (attivita-figlia.mjs)
    };
  }

  /** Per il foglio "Albero sessione" (C.3) — ordinati per avvio, il più vecchio prima. */
  function elencaFigli(sessionPadreId) {
    const figli = [];
    for (const [sessionId, voce] of sessioni.entries()) {
      if (voce.padreId !== sessionPadreId) continue;
      const snapshot = snapshotFiglio(sessionId);
      if (snapshot) figli.push(snapshot);
    }
    figli.sort((a, b) => String(a.avviataAlle).localeCompare(String(b.avviataAlle)));
    return figli;
  }

  /**
   * @returns {Promise<{riassunto?: string, childId?: string, esito: 'avviato'|'rifiutato', motivo?: string}>}
   * Non lancia MAI — un rifiuto (cartella invalida, tetto raggiunto,
   * padre scomparso) è un `esito:'rifiutato'` con `motivo`, non
   * un'eccezione: il dispatcher del kernel lo traduce in un REFUSED
   * onesto per il modello, stessa disciplina di ogni altro cancello.
   *
   * ⭐ F-022 (decisione owner 01/10/2026, «come Hermes: eredita i permessi del padre»): senza `modalita` la figlia lavora con
   *   i permessi del padre, mai di più; se il padre è in sola lettura (o è lui stesso una delega limitata) parte in sola
   *   lettura invece di essere rifiutata. `lettura` esplicita resta; `modifica` esplicita con il padre in sola lettura resta
   *   rifiutata. Prima il predefinito era `lettura` (DELEGHE01/02, 30/09), senza una decisione dell'owner. Riferimenti:
   *   Hermes `tools/delegate_tool.py:1-11` + `delegate_tool_toolsets.py:13-22` (il figlio ha gli strumenti del padre meno
   *   delega, domande, memoria, messaggi, pianificazioni); Claude Code, sotto-agenti: senza `permissionMode` girano nel modo
   *   del padre, e andare oltre è un difetto (anthropics/claude-code#52557).
   */
  /* C2b «Coordinazione» (08/10/2026): `modelloChiesto` è un nome GIÀ ammesso dal registro (fra i disponibili, col consenso
     per il cloud): vince sul modello del padre. `avvio` ('da-solo' | 'consentito') va sulla figlia, per il tetto e per il segno. */
  function delegaSottoTask({ sessionPadreId, task, cartella, modalita, modelloChiesto = null, avvio = null }) {
    return new Promise((resolve) => {
      const padre = sessioni.get(sessionPadreId);
      if (!padre) {
        resolve({ esito: 'rifiutato', motivo: 'the parent session no longer exists' });
        return;
      }
      const padreInLettura = padre.permessi === 'Read only' || delegaLimitata(padre.task);
      if (modalita === undefined) modalita = padreInLettura ? 'lettura' : 'modifica';
      if (!['lettura', 'modifica'].includes(modalita)) {
        resolve({ esito: 'rifiutato', motivo: 'The delegation mode must be read or write.' });
        return;
      }
      if (modalita === 'modifica' && padreInLettura) {
        resolve({ esito: 'rifiutato', motivo: 'The parent session is limited to reading: it cannot delegate changes.' });
        return;
      }
      const taskFiglio = {
        consegna: task, consegnaCorta: compitoDaPromptDiDelega(task),
        contrattoDelega: { schema: 'talos.delegation.v1', modalita },
      };
      /*
       * ⛔⛔⛔⛔ BC-76, secondo giro — PRIMA di tutto il resto, perché è l'unico rifiuto che protegge
       *   qualcosa che non si può disfare: una conversazione già uscita dal computer.
       * ⛔ Se la madre è locale e il suo nome di rete non si sa costruire, si RIFIUTA con una frase.
       *   Non si ripiega sul cloud e non si ripiega sul modello di serie del server: chi ha scelto
       *   il locale l'ha scelto perché niente esca, e un ripiego silenzioso su quel punto è
       *   esattamente il difetto misurato il 17/09 (`openrouter.ai`, corpo col testo della madre).
       */
      const modelloScelto = typeof modelloChiesto === 'string' && modelloChiesto !== ''
        ? { ok: true, modello: modelloChiesto } // C2b: chiesto dalla persona, già verificato dal registro
        : modelloPerLaFigliaFn(padre);
      if (modelloScelto?.ok !== true) {
        resolve({ esito: 'rifiutato', motivo: modelloScelto?.motivo ?? 'it is not known which model to start the sub-session with' });
        return;
      }
      /*
       * ⛔⛔⛔ 06/9 — questa guardia diceva «la cartella della delega deve essere diversa da quella
       * del padre», e insieme alla gemella nel kernel produceva il difetto misurato dal vivo: un
       * giro con UNA delega, quattro sessioni figlie, otto giri, 76,8k token, tutte fallite. Il
       * modello vedeva un rifiuto sul caso normale — delegare un pezzo dello STESSO progetto — e
       * aggirava riscrivendo il percorso in forma WSL (`/mnt/c/…`), che qui passava e su Windows
       * non esiste: il figlio partiva con una cartella inesistente e moriva.
       * Stato dell'arte (letto 06/09/2026): per difetto i
       * sotto-agenti CONDIVIDONO la cartella del padre; l'isolamento vero, quando serve, si fa con
       * un worktree, non con una cartella diversa a caso.
       * ⇒ Restano DUE controlli, quelli che il kernel non può fare: la FORMA del percorso e la sua
       *   ESISTENZA.
       * ⛔⛔ 13/09/2026 — la seconda metà di questa cura MANCAVA, e il difetto è misurato nella doc
       *   di `formaDelPercorso`: su Windows `/tmp`, `/Users` e `src` passavano `esisteCartella`
       *   (rispettivamente `C:\tmp`, `C:\Users` e la cartella del SERVER) e la figlia partiva in
       *   una cartella che nessuno aveva scelto. `/mnt/c/…` veniva fermato solo perché `C:\mnt`
       *   non esiste QUI: una guardia che dipende da quali cartelle ha la macchina non è una
       *   guardia. La forma si controlla PRIMA del disco, e il rifiuto dice quale sia la giusta.
       */
      const proposta = typeof cartella === 'string' && cartella.trim() !== '' ? cartella : null;
      const dove = proposta ?? padre.cartella;
      const forma = percorsoDellaFigliaUsabile(proposta, padre.cartella);
      if (!forma.ok) {
        resolve({ esito: 'rifiutato', motivo: forma.motivo });
        return;
      }
      if (!cartellaEsisteFn(dove)) {
        /* ⛔ Anche qui il motivo porta la cartella della madre — tranne quando è LEI a non esistere:
           consigliare la cartella che ha appena fallito sarebbe un consiglio falso. */
        /* ⛔⛔ 13/09/2026, revisione avversariale: il commento qui sopra prometteva questo, il
           codice NON lo faceva. `dove === padre.cartella` riconosce solo il caso in cui il modello
           RIPETE la cartella della madre; se ne propone un'altra e la cartella della madre nel
           frattempo è sparita (cancellata a sessione viva), il rifiuto consigliava una cartella
           inesistente — il consiglio falso che la riga sopra dice di evitare. Ora la condizione è
           quella dichiarata: si consiglia solo una cartella che il disco conferma. */
        const madreConsigliabile = dove !== padre.cartella && cartellaEsisteFn(padre.cartella);
        const invece = madreConsigliabile
          ? ` Omit the folder to work where the one who delegated to you works, or use exactly "${padre.cartella}".`
          : '';
        resolve({ esito: 'rifiutato', motivo: `the folder ${dove} does not exist on this computer.${invece}` });
        return;
      }
      const profonditaVoluta = (padre.profonditaDelega ?? 0) + 1;
      if (profonditaVoluta > limiteProfondita) {
        resolve({ esito: 'rifiutato', motivo: `maximum delegation depth reached (limit ${limiteProfondita})` });
        return;
      }
      if (contaFigliAttivi(sessionPadreId) >= limiteFigli) {
        resolve({ esito: 'rifiutato', motivo: `limit of ${limiteFigli} concurrent children reached` });
        return;
      }
      let figlioId = null;
      let conclusioneRicevuta = null;
      let conclusioneGestita = false;
      /* ⛔⭐ BUG-16 (05/10/2026, piano §4) — rilancio post-mortem di una figlia: UNO solo, solo lettura,
         solo zero effetti. Il kernel ha già ritentato da solo (fino a 10 reinvii a giro); quando anche il
         budget del kernel è esaurito (_ESAURITO) e la figlia era in sola LETTURA senza scritture né
         artefatti, riprendere la STESSA sessione (stesso childId, stessa voce, storia intatta: la cache
         del prefisso non si rompe) è un reinvio sicuro anche all'orchestratore. Una figlia in `modifica`
         non si rilancia mai: i suoi effetti passati rendono il reinvio non idempotente. */
      let rilanciDelega = 0;
      const completaConclusione = (risultatoSessione) => {
        if (conclusioneGestita) return;
        if (!figlioId) {
          conclusioneRicevuta = risultatoSessione;
          return;
        }
        let rilancioFallito = null;
        if (risultatoSessione?.codiceErrore === 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO' && rilanciDelega < 1) {
          const voce = sessioni.get(figlioId);
          const evidenza = voce ? analizzaEvidenzaDelega(voce.eventi) : null;
          const senzaEffetti = !evidenza || (evidenza.scritture === 0 && evidenza.artefatti === 0);
          if (modalita === 'lettura' && senzaEffetti) {
            /* R2 della review avversariale: il contatore cresce PRIMA dell'avvio — la consegna del
               rilancio può arrivare SINCRONA dentro `avviaFiglia` (onConclusioneFn annidato) e deve
               già vedere il rilancio — ma se l'avvio è rifiutato si RETROCESSA e la consegna dice la
               verità: nessun rilancio è partito, il tetto non è consumato. */
            rilanciDelega += 1;
            const rilancio = avviaFiglia({
              sessionId: figlioId,
              voceEsistente: voce,
              /* Il compito resta quello della voce: qui si dice solo PERCHÉ la figlia riparte, così
                 la sua storia non contiene il task duplicato ma la ragione vera del rilancio. */
              task: 'The provider response was cut off and its outcome is uncertain: resume and finish the task from where you left it.',
            });
            if (rilancio?.sessionId && !rilancio?.erroreAvvio) {
              if (voce) voce.rilanciDelega = rilanciDelega;
              notificaSenzaBloccare(onFiglioCreatoFn, { parentId: sessionPadreId, childId: figlioId, rilanciata: true });
              return; // la seconda corsa ricade qui, con il suo esito
            }
            /* Il rilancio non è partito: si retrocede il contatore e si consegna la prima verità. */
            rilanciDelega -= 1;
            if (voce) voce.rilanciDelega = rilanciDelega;
            rilancioFallito = typeof rilancio?.erroreAvvio === 'string' && rilancio.erroreAvvio
              ? rilancio.erroreAvvio
              : 'the start of the child session was refused';
          }
        }
        conclusioneGestita = true;
        consegnaEsitoFiglia({ sessionPadreId, figlioId, risultatoSessione, task: taskFiglio, modalita, rilanciDelega, rilancioFallito });
      };
      /*
       * ⛔⛔⛔ 06/9, stessa misura: i figli partivano con `glm-4.7-flash` mentre la sessione madre
       * aveva scelto `glm-5.3-flash`, e nessuna riga a schermo lo diceva. Un sotto-agente eredita
       * gli strumenti del padre (stesso principio trovato in ricerca: i sotto-agenti ereditano
       * gli strumenti abilitati del padre); a
       * maggior ragione deve ereditare il MODELLO, altrimenti chi paga non sa cosa sta pagando.
       * Si eredita anche lo sforzo di ragionamento e i permessi: il figlio non è più libero del padre.
       */
      const avviaFiglia = (opzioniExtra = {}) => avviaESeguiFn({
        taskId: `delega:${sessionPadreId}`,
        cartella: dove,
        /*
         * ⛔⛔⛔ 08/09/2026 — SENZA QUESTA RIGA LA FIGLIA LAVORA IN `C:\`, LA RADICE DEL DISCO.
         *
         * Misurato sulla run vera dell'owner (tre sessioni in `.sessions-store/`): l'intestazione
         * della figlia porta la cartella giusta, e il `contesto` di `RunStarted` porta `C:\`. La
         * cartella corretta viene passata qui, scritta su disco, e allargata un istante dopo da
         * `cartellaEffettivaPerPermessi` (session-registry), che senza `cartellaGiaScelta` traduce
         * «Full access» in `parsePath(cartella).root`. La figlia eredita Full access dalla madre —
         * ed è giusto che lo erediti — quindi finiva nella radice.
         *
         * ⇒ Il difetto non è l'eredità dei permessi: è che una FIGLIA NON HA NIENTE DA CUI
         *   ALLARGARSI. La sua cartella è per definizione esattamente quella della madre, già
         *   scelta da una persona. È il caso (d) della famiglia documentata sopra
         *   `cartellaEffettivaPerPermessi` (a: allowlist — l'unico che deve allargare; b:
         *   avviaLibero, curato 03/9; c: avvia() dei task di catalogo, curato 04/9): la delega non
         *   era mai stata considerata.
         *
         * Il danno misurato prima della cura, su 37 chiamate delle due figlie: `scrivi` →
         * `EPERM mkdir 'C:\'`; `document_create` → sei tentativi tutti EPERM; `leggi package.json`
         * → `ENOENT 'C:\package.json'`. Zero file scritti nel workspace, e la delega ha consegnato
         * un artefatto al posto del documento chiesto senza che nessuno protestasse.
         *
         * Ricerca 08/09/2026 — dev.to «Giving an AI agent permission to spawn sub-agents (without
         * losing control)»: il wrapper della delega «resolves the workspace **against the parent's
         * root**», e l'eredità dev'essere «explicit and **downgraded by default**: parent can
         * delegate only permissions it actually has» — «if every subagent inherits the parent
         * token, it recreates sudo with better branding». Qui la cartella è la prima delega da
         * restringere.
         */
        cartellaGiaScelta: true,
        /*
         * ⛔ 09/09/2026 — trovato dal giro vero sul 4174: nella barra e nella scheda «Agenti» le due figlie
         *   si chiamavano entrambe «Sei una sessione di lavoro autonoma; non hai altro …». Il kernel non
         *   passa il compito nudo: passa il PROMPT INTERO della figlia (825 caratteri, letti dal JSONL),
         *   che comincia con un preambolo di sistema e mette il compito dopo «Compito:». Chi legge la barra
         *   vedeva due righe identiche e doveva aprirle per sapere quale fosse quale.
         * ⇒ La forma corta si costruisce QUI, dove si sa che quella stringa è il prompt di una delega:
         *   `session-registry` non può saperlo, e il kernel dell'owner non è mio.
         */
        task: taskFiglio,
        padreId: sessionPadreId,
        profonditaDelega: profonditaVoluta,
        avvioDelega: avvio, // C2b: 'da-solo' conta nel tetto dell'albero; nell'intestazione, regge al riavvio
        /* ⛔ BC-76: non `padre.modello` — vedi `modelloPerLaFigliaFn` in testa a questa funzione.
           Per una madre cloud è lo stesso valore di prima; per una madre locale è il nome con il
           prefisso della sua fonte, cioè l'unico che tiene la figlia sul motore di casa. */
        modelloRichiesta: modelloScelto.modello,
        reasoningRichiesto: reasoningDiSerie ?? padre.reasoning ?? null,
        linguaInterfaccia: padre.linguaInterfaccia ?? null, // K3b: la figlia descrive i comandi nella lingua di chi guarda
        permessiRichiesti: modalita === 'lettura' ? 'Read only' : padre.permessi ?? null,
        permessiPerAttrezzoRichiesti: modalita === 'lettura'
          ? Object.fromEntries(Object.entries(padre.permessiPerAttrezzo ?? {}).filter(([, valore]) => valore === 'nega'))
          : { ...padre.permessiPerAttrezzo },
        /* ⛔ C2 R6-bis (owner 08/10/2026): da chi arriva ogni «sempre» copiato qui sopra — il padre, o chi l'aveva dato a lui (una
           copia di una copia risale all'origine). Serve alla riga «Permesso ereditato» della figlia; una delega in lettura non
           copia nessun «sempre». */
        origineSempreRichiesta: modalita === 'lettura' ? null : origineDeiSempreCopiati(padre, sessionPadreId),
        /* ⛔ C2-Q (08/10/2026, RED del bugfixer REV-C2Q-A/B): la figlia di una sessione che nessuno segue (automazioni, passi dei
           Workflow) nasce come lei, `senzaInterfaccia`. Senza, una sua domanda alla persona o una sua scrittura fuori dal progetto
           aspettavano per sempre una persona che non c'è: decisione 4 dell'owner su C2, «le automazioni senza nessuno davanti
           continuano a negare subito». Nell'intestazione: vale anche dopo un riavvio, e per le nipoti. */
        senzaInterfaccia: padre?.senzaInterfaccia === true,
        /* ⛔ F3-10 (23/09/2026, decisione owner D05-a): la figlia nasce SEMPRE in Normale, col suo ruolo di
           figlia. Prima ereditava `padre.modalitaOperativa ?? 'workflow'`, cioè un modo che non esiste più. */
        modalitaOperativaRichiesta: 'normale',
        onConclusioneFn: (risultatoSessione) => {
          completaConclusione(risultatoSessione);
        },
        ...opzioniExtra,
      });
      const risultatoAvvio = avviaFiglia();
      figlioId = risultatoAvvio?.sessionId ?? null;
      // ⛔ AL CONTRARIO: avviaESeguiFn può rifiutare PRIMA di avviare (es. chiave API non configurata) — mai una Promise appesa in eterno se onConclusioneFn non scatterà mai.
      if (risultatoAvvio?.erroreAvvio) {
        resolve({ esito: 'rifiutato', motivo: risultatoAvvio.erroreAvvio });
        return;
      }
      if (!figlioId) {
        resolve({ esito: 'rifiutato', motivo: 'the child session did not return a valid identifier' });
        return;
      }
      notificaSenzaBloccare(onFiglioCreatoFn, { parentId: sessionPadreId, childId: figlioId });
      if (conclusioneRicevuta) completaConclusione(conclusioneRicevuta);
      /* C2b «Coordinazione» (contratto §7, audit): la ricevuta dice come è partito l'agente e, se la persona l'ha chiesto, su
         quale modello. Senza `avvio` (la CLI, o un registro senza Coordinazione) la frase resta quella di sempre. */
      const comePartito = avvio === 'da-solo' ? ' It started on its own (Coordination is on in this conversation).'
        : avvio === 'consentito' ? ' The person approved starting it.' : '';
      const suQualeModello = typeof modelloChiesto === 'string' && modelloChiesto !== '' ? ` It runs on ${modelloScelto.modello}, as the person asked.` : '';
      resolve({
        esito: 'avviato',
        childId: figlioId,
        riassunto: `Sub-agent ${figlioId} started in the background (${modalita === 'lettura' ? 'read-only' : 'with the parent\'s permissions'}).${comePartito}${suQualeModello} Work on what does not depend on it. Its result reaches you as a new message, delivered only after you END YOUR TURN: when nothing else is left, stop with a one-line status. Do not wait with sleep and do not keep checking list_children for it.`,
      });
    });
  }

  /*
   * ⭐ C3 tappa 4 — LA CONSEGNA DELL'ESITO DI UNA FIGLIA AL PADRE, in un posto solo: la prima corsa, il rilancio (BUG-16), la
   *   ripresa dopo una pausa e il «Riprova» passano tutti da qui (decisioni owner 09/10: Riprendi e Riprova sono un messaggio
   *   nuovo nella STESSA figlia, e il padre riceve il nuovo risultato come oggi).
   *   ⛔ Una figlia IN PAUSA non consegna niente: non è un risultato, è un lavoro fermo che riprenderà. Resta `in-pausa` finché
   *   la persona (o il padre, `resume_child`) non la riprende.
   */
  function consegnaEsitoFiglia({ sessionPadreId, figlioId, risultatoSessione, task, modalita, rilanciDelega = 0, rilancioFallito = null }) {
    const voceFiglia = sessioni.get(figlioId);
    if (risultatoSessione?.esito?.comeFinita === 'in-pausa') {
      if (voceFiglia) {
        voceFiglia.esitoDelega = 'in-pausa';
        voceFiglia.notaDelega = null;
        voceFiglia.riassuntoDelega = riassuntoDelegaDaDetto(risultatoSessione?.esito?.detto, { comeFinita: 'in-pausa' });
        voceFiglia.evidenzaDelega = analizzaEvidenzaDelega(voceFiglia.eventi);
      }
      return;
    }
    const eventi = voceFiglia?.eventi;
    const esito = esitoDelegaDaRisultato(risultatoSessione, eventi, { task });
    /* ⛔⭐ BUG-16: la consegna dichiara SEMPRE il rilancio (piano §4: «lo dice nel riassunto») e,
       quando l'esito incerto è sopravvissuto al suo budget senza rilancio possibile, dice anche
       perché NON si può riprovare — la madre legge `rilanciabile` dal risultato. */
    if (rilanciDelega > 0) {
      esito.rilanciata = rilanciDelega;
      const nota = ' (relaunched once after an uncertain provider outcome)';
      if (typeof esito.riassunto === 'string' && esito.riassunto) esito.riassunto += nota;
      else if (typeof esito.motivo === 'string' && esito.motivo) esito.motivo += nota;
    }
    if (risultatoSessione?.codiceErrore === 'PROVIDER_OUTCOME_UNKNOWN_ESAURITO') {
      esito.rilanciabile = false;
      esito.motivoRilancio = rilancioFallito
        ? `the relaunch did not start: ${rilancioFallito}`
        : rilanciDelega > 0
          ? 'the cap of one relaunch per child has already been used'
          : `the delegation is not a pure read (${modalita}): a relaunch could repeat effects already produced`;
    }
    if (voceFiglia) {
      voceFiglia.esitoDelega = esito.esito;
      voceFiglia.notaDelega = esito.nota ?? null; // C3 tappa 4: «nessuna modifica fatta», mai un fallimento
      voceFiglia.verdettoDelega = esito.verdetto ?? null;
      voceFiglia.motivoDelega = esito.esito === 'fallito' ? (esito.motivo ?? null) : null; // C3 tappa 4: il «perché» che Riprova ripete
      voceFiglia.riassuntoDelega = riassuntoDelegaDaDetto(risultatoSessione?.esito?.detto, { comeFinita: risultatoSessione?.esito?.comeFinita });
      voceFiglia.rilanciDelega = rilanciDelega;
      voceFiglia.evidenzaDelega = analizzaEvidenzaDelega(eventi);
    }
    notificaSenzaBloccare(onFiglioConclusoFn, {
      parentId: sessionPadreId,
      childId: figlioId,
      risultato: esito,
      evidenza: voceFiglia?.evidenzaDelega ?? null,
    }, {
      onErrore: (errore) => {
        if (!voceFiglia) return;
        voceFiglia.erroreConsegnaDelega = errore instanceof Error ? errore.message : String(errore);
        voceFiglia.esitoDelega = 'fallito';
      },
    });
  }

  /*
   * ⭐ C3 tappa 4 (owner 09/10) — «Riprendi» (una figlia in pausa) e «Riprova» (una figlia fallita): un messaggio NUOVO nella
   *   STESSA figlia, a contesto intatto (Claude Code: un agente fermato si riprende con SendMessage). Il giro nuovo passa dalla
   *   ripresa del registro (`riprendiFn`, che riusa modello, permessi e cartella della figlia: vale anche dopo un riavvio del
   *   server) e il suo esito torna al padre da `consegnaEsitoFiglia`, come la prima volta.
   *   ⇒ { esito: 'ripresa', childId } | { esito: 'rifiutato', motivo }
   */
  function riprendiFiglia({ childId, azione } = {}) {
    const voce = typeof childId === 'string' ? sessioni.get(childId) : null;
    if (!voce?.padreId) return { esito: 'rifiutato', motivo: 'not a sub-agent' };
    if (typeof riprendiFn !== 'function') return { esito: 'rifiutato', motivo: 'resuming a sub-agent is not available here' };
    if (voce.conclusa !== true) return { esito: 'rifiutato', motivo: 'the sub-agent is still running' };
    if (azione === 'resume' && voce.esitoDelega !== 'in-pausa') return { esito: 'rifiutato', motivo: 'the sub-agent is not paused' };
    if (azione === 'retry' && voce.esitoDelega !== 'fallito') return { esito: 'rifiutato', motivo: 'the sub-agent did not fail' };
    if (azione !== 'resume' && azione !== 'retry') return { esito: 'rifiutato', motivo: 'the action must be resume or retry' };
    const consegna = azione === 'resume'
      ? 'You were paused by the person. Continue the task from where you stopped: the results of the tools you ran are in this conversation.'
      : `Your previous attempt at this task did not finish: ${voce.motivoDelega ?? 'it failed'} Try again, and check first what is already done.`;
    const sessionPadreId = voce.padreId;
    const task = voce.task;
    const avvio = riprendiFn(childId, consegna, {
      onConclusioneFn: (risultatoSessione) => consegnaEsitoFiglia({ sessionPadreId, figlioId: childId, risultatoSessione, task, modalita: modalitaDelega(task) }),
    });
    if (!avvio || avvio.erroreAvvio) return { esito: 'rifiutato', motivo: avvio?.erroreAvvio ?? 'the sub-agent did not restart' };
    voce.esitoDelega = null;
    voce.notaDelega = null;
    voce.motivoDelega = null;
    notificaSenzaBloccare(onFiglioCreatoFn, { parentId: sessionPadreId, childId, ripresa: azione });
    return { esito: 'ripresa', childId };
  }

  return Object.freeze({ delegaSottoTask, contaFigliAttivi, elencaFigli, snapshotFiglio, riprendiFiglia });
}
