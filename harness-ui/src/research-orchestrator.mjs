/**
 * research-orchestrator.mjs — FASE N, ottavo sistema (30/8): Deep
 * Research, "fetta onesta" (owner, AskUserQuestion: "Fetta onesta
 * (consigliato)"). Mirror ARCHITETTURALE di `subagent-orchestrator.mjs`
 * (FASE C): istanziato UNA volta dentro `session-registry.mjs`, dove
 * `avviaESegui`/`sessioni` sono in scope — gli 8 callback `onRicerca*`
 * che `avviaESegui` costruisce sono thin delegate verso i metodi qui,
 * stesso principio di `onDelega` verso `delegaSottoTask`.
 *
 * ⭐⭐⭐ La FORMA che serve è DIVERSA da `delegaSottoTask`: quella BLOCCA
 * (una Promise risolta solo alla conclusione del figlio, per il
 * dispatcher del kernel del PADRE che aspetta un riassunto SINCRONO
 * dentro lo stesso giro). `research_start` deve tornare SUBITO con un
 * id (mobile, `researchTools.ts`: "avvia e torna SUBITO... una
 * ricerca dura minuti, e un tool che aspetta terrebbe occupato il giro
 * di conversazione per tutto quel tempo") — qui `onConclusioneFn` si
 * PASSA e basta, mai atteso: esattamente come `avviaESegui` stesso fa
 * per OGNI sessione (avvia, ritorna `{sessionId}`, il `.then()` gira
 * in background).
 *
 * L'id di una ricerca È il sessionId della sessione che la esegue — un
 * solo spazio di identità, mai una mappatura a parte, mai
 * disallineabile per costruzione.
 *
 * ⭐⭐⭐ Deep Research è PER-PROGETTO (vedi la doc di testa di
 * `research-store.mjs`): la ricerca gira nella STESSA cartella della
 * sessione che l'ha avviata (mai un workspace dedicato) — il suo
 * rapporto finale, salvato in Libreria via `salvaVoceLibreriaFn`,
 * finisce quindi nella Libreria di QUEL progetto, raggiungibile dalle
 * sessioni future sullo stesso progetto (mobile: "i rapporti di
 * ricerca SONO file di Libreria"). `permessi:'Read only'` — la ricerca
 * non deve MAI scrivere/eseguire nel progetto ospite, solo cercare/
 * leggere/sintetizzare: difesa in profondità, il prompt lo dice E il
 * permesso lo garantisce, mai uno solo dei due.
 *
 * ⛔⛔⛔ Pausa/ripresa RIUSANO la macchina già costruita per il bottone
 * Stop (`voce.controller.abort()`) e per `resume()` — non un secondo
 * meccanismo. L'AMBIGUITÀ che questo risolve, trovata leggendo
 * `talosHarness.mjs` (comeSonoFinitiIGiri) prima di scrivere una riga:
 * `comeFinita.esito==='fermato'` copre SIA "ho chiamato io l'abort per
 * una pausa" SIA "il modello ha semplicemente smesso di generare senza
 * rispondere senza che nessuno l'abbia fermato" — indistinguibili dal
 * SOLO esito del kernel. Cura: un flag sulla VOCE stessa (proprietà
 * dinamica, mai nello schema condiviso di `avviaESegui`), scritto
 * PRIMA di abortire, letto e SEMPRE azzerato dentro
 * `onConclusioneRicerca` — mai lasciato sporco per il giro successivo
 * (altrimenti una ripresa che poi conclude DAVVERO verrebbe scambiata
 * per un'altra pausa, silenziosamente: il bug esatto che un test
 * dedicato sotto verifica AL CONTRARIO).
 *
 * ⛔ Nessuno stato "sta girando ORA" è mai scritto su disco (vedi
 * `research-store.mjs`): `statoVivo()` lo deriva SEMPRE dal vivo,
 * confrontando `terminata` (research-store) con lo stato REALE della
 * sessione in `sessioni` — per costruzione non può disallinearsi.
 */

function promptRicerca(question, depth) {
  const guida = depth === 'quick'
    ? 'Keep this brief: a couple of searches are enough — do not over-investigate.'
    : depth === 'exhaustive'
      ? 'Be exhaustive: search from many different angles, cross-check the claims that matter, and go deep before writing.'
      : 'Do a thorough pass: search from a few different angles before writing the report.';
  return [
    `Research this question thoroughly using web_search and naviga: "${question}"`,
    guida,
    'When you are done investigating, write your findings as a complete, well-organized final response (not a tool call) — this text becomes the permanent research report, so make it complete and self-contained. Note any real uncertainty instead of guessing.',
    'Do not modify any files and do not run shell commands: this is a research task, not a coding task.',
  ].join(' ');
}

const PROMPT_RIPRESA = 'Continue the research from where you left off, using web_search and naviga as needed, then write the final report as your last message.';

/** L'ultimo messaggio assistente con testo VERO — quello che diventa il rapporto. `null` se non ce n'è uno (un giro esaurito senza mai rispondere). */
function estraiTestoRapporto(messaggiFinali) {
  if (!Array.isArray(messaggiFinali)) return null;
  for (let i = messaggiFinali.length - 1; i >= 0; i -= 1) {
    const m = messaggiFinali[i];
    if (m?.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0) return m.content.trim();
  }
  return null;
}

function nomeRapporto(domanda) {
  const troncato = String(domanda ?? '').trim().slice(0, 100);
  return `Research - ${troncato || 'untitled'}.md`;
}

/**
 * Il bucket "vivo" — mai duplicato su disco (vedi la doc di testa).
 * `voceSessione` assente O `interrotta` (il processo che la eseguiva
 * non esiste più, e non aveva mai finito da sola — stesso stato che
 * `resume()` rifiuta onestamente) ⇒ 'failed': mai "running" per un
 * processo che non c'è, mai "paused" per un run che non era mai stato
 * fermato apposta.
 */
function statoVivo(voceRicerca, voceSessione) {
  if (voceRicerca.terminata) return voceRicerca.terminata;
  if (!voceSessione || voceSessione.interrotta) return 'failed';
  return voceSessione.conclusa ? 'paused' : 'running';
}

function clampNumero(valore, min, max, difetto) {
  const numero = Number(valore);
  return Number.isFinite(numero) ? Math.min(Math.max(numero, min), max) : difetto;
}

export function creaResearchOrchestrator({
  sessioni, avviaESeguiFn,
  creaRicercaFn, leggiRicercaFn, aggiornaRicercaFn, eliminaRicercaFn, elencaRicercheFn,
  salvaVoceLibreriaFn, leggiVoceLibreriaFn, eliminaVoceLibreriaFn,
  randomUUIDFn,
}) {
  async function onConclusioneRicerca({ cartella, id, risultato }) {
    const voceSessione = sessioni.get(id);
    const richiesta = voceSessione?._ricercaTerminataRichiesta ?? null;
    // ⛔ SEMPRE azzerato qui, su OGNI conclusione — mai lasciato sporco per il giro successivo (vedi la doc di testa: pausa→ripresa→conclusione naturale non deve essere scambiata per una seconda pausa).
    if (voceSessione) voceSessione._ricercaTerminataRichiesta = null;
    if (richiesta === 'paused') return; // terminata resta null: resumable, il bucket "paused" lo deriva statoVivo() dal vivo.
    if (richiesta === 'cancelled') {
      await aggiornaRicercaFn({ cartella, id, terminata: 'cancelled' });
      return;
    }
    const record = await leggiRicercaFn({ cartella, id });
    const domanda = record?.domanda ?? 'research';
    const testo = estraiTestoRapporto(risultato?.esito?.messaggiFinali);
    if (!testo) {
      await aggiornaRicercaFn({ cartella, id, terminata: 'failed' });
      return;
    }
    let reportLibraryId;
    try {
      reportLibraryId = await salvaVoceLibreriaFn({ cartella, nome: nomeRapporto(domanda), mediaType: 'text/markdown', origine: 'generated', testo });
    } catch {
      // ⛔ il rapporto esiste (il modello l'ha scritto) ma non si è potuto salvare in Libreria — onesto: 'failed', mai un successo inventato senza un id di Libreria vero.
      await aggiornaRicercaFn({ cartella, id, terminata: 'failed' });
      return;
    }
    const finitaBene = risultato?.esito?.comeFinita === 'concluso';
    await aggiornaRicercaFn({ cartella, id, terminata: finitaBene ? 'done' : 'failed', reportLibraryId });
  }

  /**
   * Avvia — torna `{ok, esito, id}` SUBITO, mai atteso il .then() (vedi
   * la doc di testa). L'id è generato QUI, PRIMA di chiamare
   * avviaESeguiFn, e la riga di metadata è scritta PRIMA che la sessione
   * parta: elimina per costruzione la race in cui una conclusione
   * fulminea (un mock nei test, o un modello istantaneo) potrebbe far
   * scattare onConclusioneRicerca prima che il file esista.
   *
   * ⛔⛔⛔ Trovato dal vivo (30/8), non da lettura: le prime versioni di
   * questa funzione tornavano solo `{id}` — il DISPATCH del kernel per
   * `research_start` (talosHarness.mjs) si aspetta lo STESSO contratto
   * `{ok,esito}` degli altri 5 mutanti (`String(risultato?.esito ??
   * (risultato?.ok ? 'started' : 'failed'))`): senza `ok`/`esito`,
   * `risultato?.ok` era `undefined` (falsy) e il messaggio mostrato al
   * modello era SEMPRE "failed" — anche quando la ricerca era
   * DAVVERO partita (confermato dal `research_list` immediatamente
   * successivo, nello stesso giro, che la mostrava "running"). Un
   * bug che NESSUN test a unità poteva vedere: i test del kernel
   * mockano `onRicercaAvvia` con la forma già corretta, i test di
   * `session-registry.mjs` verificano il wiring ma non il messaggio
   * finale — solo una sessione VERA, con un modello VERO, l'ha
   * mostrato.
   */
  async function avvia({ cartella, question, depth }) {
    const id = randomUUIDFn();
    await creaRicercaFn({ cartella, id, domanda: question, profondita: depth || 'deep' });
    avviaESeguiFn({
      sessionId: id, cartella, taskId: 'ricerca', task: { consegna: promptRicerca(question, depth) },
      permessiRichiesti: 'Read only',
      onConclusioneFn: (risultato) => onConclusioneRicerca({ cartella, id, risultato }),
    });
    return {
      ok: true,
      esito: `Started the research «${question}» (id ${id}). It runs in the background and keeps going even if the app is closed.`,
      id,
    };
  }

  function mettiInPausa({ id }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    if (voce.conclusa) {
      return { ok: false, esito: 'That research is not running: it may already be paused, cancelled or done. Call research_list to see how it stands.' };
    }
    voce._ricercaTerminataRichiesta = 'paused';
    voce.controller.abort();
    return { ok: true, esito: 'That research is paused. Everything it collected is kept, and it can be resumed.' };
  }

  function annulla({ id }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    if (voce.conclusa) {
      // ⭐ una ricerca già ferma (in pausa, o già conclusa) si annulla lo stesso: cambia solo la metadata (terminata:'cancelled'), nessun abort da fare — mai un rifiuto per un caso che mobile stesso permette (research_cancel su una "paused"/"unfinished").
      return aggiornaRicercaFn({ cartella: voce.cartella, id, terminata: 'cancelled' })
        .then(() => ({ ok: true, esito: 'That research is stopped for good. What it collected is still readable.' }));
    }
    voce._ricercaTerminataRichiesta = 'cancelled';
    voce.controller.abort();
    return { ok: true, esito: 'That research is stopped for good. What it collected is still readable.' };
  }

  async function riprendi({ id }) {
    const voce = sessioni.get(id);
    if (!voce) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    if (!voce.messaggiFinali) {
      return {
        ok: false,
        esito: voce.interrotta
          ? 'That research was interrupted by a server restart and cannot be resumed: start a new one.'
          : 'That research is still running: nothing to resume.',
      };
    }
    avviaESeguiFn({
      sessionId: id, taskId: voce.taskId, cartella: voce.cartella, task: voce.task, comandoProva: voce.comandoProva,
      messaggiIniziali: [...voce.messaggiFinali, { role: 'user', content: PROMPT_RIPRESA }],
      forkDa: voce.forkDa, voceEsistente: voce,
      onConclusioneFn: (risultato) => onConclusioneRicerca({ cartella: voce.cartella, id, risultato }),
    });
    return { ok: true, esito: 'That research is running again, from where it had stopped.' };
  }

  async function rinomina({ cartella, id, title }) {
    const aggiornata = await aggiornaRicercaFn({ cartella, id, titolo: title });
    if (!aggiornata) return { ok: false, esito: 'There is no research with that id. Call research_list to see the current ones.' };
    return {
      ok: true,
      esito: title === null ? 'That research shows its question again.' : `Renamed that research to «${title}».`,
    };
  }

  async function elimina({ cartella, id }) {
    const record = await leggiRicercaFn({ cartella, id });
    if (!record) return { ok: true, esito: 'There was no research with that id — nothing to delete.' };
    if (record.reportLibraryId && eliminaVoceLibreriaFn) {
      try { await eliminaVoceLibreriaFn({ cartella, id: record.reportLibraryId }); } catch { /* il rapporto potrebbe già essere sparito dalla Libreria per un'altra via (library_delete diretto) — non blocca l'eliminazione della ricerca. */ }
    }
    await eliminaRicercaFn({ cartella, id });
    return { ok: true, esito: 'That research and its report have been deleted.' };
  }

  async function elenca({ cartella, status, page_size: pageSize, offset }) {
    const record = await elencaRicercheFn({ cartella });
    const conStato = record.map((r) => ({
      id: r.id,
      titolo: r.titolo || r.domanda,
      stato: statoVivo(r, sessioni.get(r.id)),
      avviataAlle: r.avviataAlle,
    }));
    const filtrate = !status || status === 'all' ? conStato : conStato.filter((r) => r.stato === status);
    const dimensionePagina = clampNumero(pageSize, 1, 20, 10);
    const salto = clampNumero(offset, 0, Number.MAX_SAFE_INTEGER, 0);
    const pagina = filtrate.slice(salto, salto + dimensionePagina);
    return { ricerche: pagina, totale: filtrate.length };
  }

  async function leggi({ cartella, id }) {
    const record = await leggiRicercaFn({ cartella, id });
    if (!record) return { trovata: false };
    const stato = statoVivo(record, sessioni.get(id));
    let contenutoRapporto = null;
    if (stato === 'done' && record.reportLibraryId && leggiVoceLibreriaFn) {
      try {
        const voce = await leggiVoceLibreriaFn({ cartella, id: record.reportLibraryId });
        contenutoRapporto = voce?.testo ?? null;
      } catch {
        contenutoRapporto = null; // il rapporto è dichiarato pronto ma illeggibile ORA — onesto: si comporta come "non ancora leggibile", mai un crash.
      }
    }
    return { trovata: true, stato, titolo: record.titolo || record.domanda, contenutoRapporto };
  }

  return Object.freeze({ avvia, mettiInPausa, annulla, riprendi, rinomina, elimina, elenca, leggi });
}
