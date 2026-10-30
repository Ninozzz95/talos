/**
 * ⭐ 0.1.25 — LA SECONDA PORTA dei fornitori a valle esclusi su OpenRouter (owner 09/10/2026).
 *
 * La decisione 14 (08/10/2026 sera) è uscita nella 0.1.24 con UNA porta sola: le Impostazioni e «Escludi» sotto la risposta.
 * La regola delle due porte (owner 26/07, recidiva 08/10: «non dimenticarlo mai») vuole anche un attrezzo del modello. Decisione
 * dell'owner del 09/10: ELENCARE è libero; ESCLUDERE e RIAMMETTERE mostrano una CARTA con prima → dopo e aspettano il sì della
 * persona, come le automazioni (`automation-per-il-modello.mjs`): cambiano l'instradamento di tutte le sessioni.
 *
 * Stato dell'arte: Hermes regge `providers_ignored` solo da config e CLI (`hermes_cli/cli_commands_mixin.py:208`, clone 65ad529),
 * e l'instradamento per modello solo dalla config (`agent/chat_completion_helpers.py:469-487`); nessun attrezzo del modello.
 *
 * Forma dell'ospite, la stessa delle automazioni: `onFornitoriFn(nome, argomenti, {fase})`; `anteprima` ⇒ `{ok, carta, azione}` o
 * `{ok:false, messaggio}` (il rifiuto arriva SUBITO, senza disturbare la persona); `esegui` ⇒ `{ok, testo}` o `{ok:false, messaggio}`.
 * Un giro di automazione non cambia niente qui: nessuno potrebbe rispondere alla carta.
 */
import { ESCLUSI_DI_SERIE, modelloBase, vociDiSerie } from './esclusi-di-serie.mjs';
import { ESCLUSI_MASSIMI } from './provider-credential-store.mjs';
import { finestraDaAprire } from './finestra-che-cresce.mjs';

export const ATTREZZI_FORNITORI_OSPITE = Object.freeze(['provider_exclusions_list', 'provider_exclude', 'provider_allow', 'chatgpt_account', 'local_model_window']);
const FORMA_SLUG = /^[a-z0-9][a-z0-9._-]{0,47}(?:\/[a-z0-9][a-z0-9._-]{0,47})?$/u;
const rifiuto = (messaggio) => ({ ok: false, messaggio });

/**
 * @param {{ providerStore, slugDelFornitoreFn?: ({fornitore, modello}) => Promise<string> }} servizi
 * @returns la fabbrica di `onFornitoriFn` per una sessione: `({ automazioneDelGiro })`.
 */
export function creaOspiteFornitori({ providerStore, slugDelFornitoreFn = null, accessoChatgpt = null, finestraLocale = null }) {
  /*
   * L1 1.3 (owner 26/10/2026) — `local_model_window`: la seconda porta della finestra che cresce. «status» libero; «enlarge» con la
   *   carta (prima → dopo, memoria): la stessa misura di `finestra-che-cresce.mjs` (`finestraDaAprire`), quindi la carta dice la
   *   cifra che poi si apre davvero. `finestraLocale` = `creaFinestraCheCresce(...)`; senza (la CLI), l'attrezzo dice che non c'è.
   */
  const SCELTE_IN_INGLESE = { allarga: 'it is enlarged by itself (when memory allows), otherwise summarised', riassumi: 'the older part is summarised', chiedi: 'the person is asked each time' };
  async function finestra(argomenti, fase) {
    const azione = typeof argomenti?.action === 'string' ? argomenti.action.trim().toLowerCase() : '';
    if (azione !== 'status' && azione !== 'enlarge') return rifiuto('local_model_window needs action "status" or "enlarge".');
    const stato = finestraLocale ? await finestraLocale.statoAttuale() : null;
    if (!stato) {
      if (azione === 'status' && fase === 'anteprima') return { ok: true, carta: false };
      return azione === 'status' ? { ok: true, testo: 'No local model is running on this computer: the window applies only to a local model loaded in TALOS.' }
        : rifiuto('no local model is running on this computer, so there is no window to enlarge.');
    }
    const massimoTesto = stato.massimo ? `${stato.massimo} tokens` : 'unknown';
    if (azione === 'status') {
      return fase === 'anteprima' ? { ok: true, carta: false }
        : { ok: true, testo: `${stato.nome} runs with a ${stato.finestra} token window; it was trained for up to ${massimoTesto}. When the window fills up, ${SCELTE_IN_INGLESE[stato.scelta] ?? SCELTE_IN_INGLESE.allarga}.` };
    }
    const tokens = Number.isSafeInteger(argomenti?.tokens) && argomenti.tokens > 0 ? argomenti.tokens : (stato.finestra ?? 0) + 1;
    if (stato.massimo && tokens > stato.massimo) return rifiuto(`${stato.nome} cannot read more than ${stato.massimo} tokens: no window can hold ${tokens}. Split the work, or use a model that reads more.`);
    /* ci sta già: `finestraDaAprire` cresce sempre di almeno un passo, quindi il «non serve» si decide qui (trovato da FC-ATTR-03) */
    const dopo = stato.finestra && tokens <= stato.finestra ? null : finestraDaAprire({ servono: tokens, prima: stato.finestra, massimo: stato.massimo ?? 0 });
    if (dopo === null) return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: `Nothing to do: the window (${stato.finestra} tokens) already holds ${tokens} tokens, or it is already at the model maximum (${massimoTesto}).` };
    if (fase === 'anteprima') return { ok: true, carta: true, azione: { modello: stato.nome, prima: stato.finestra, dopo } };
    const esito = await finestraLocale.allarga({ modelId: stato.modelId, servono: tokens, forza: true });
    if (esito?.ok) return { ok: true, testo: `Done. ${stato.nome} was reopened with a ${esito.dopo} token window (it was ${esito.prima}).` };
    const perche = { memoria: 'there is not enough memory for it, so the previous window was kept', 'motore-occupato': 'the model is busy with another request; try again in a moment', 'gia-al-massimo': 'it is already at the model maximum', 'oltre-il-massimo': 'the model cannot read that much',
      'massimo-ignoto': 'the model file does not say how much it can read, so it is not reopened blind' }; // revisione blocco 4
    /* revisione blocco 4 (A-2): nemmeno il ritorno a com'era è riuscito — il motore riparte da solo al prossimo messaggio, e lo si dice */
    if (esito?.spento) return rifiuto('the window was not enlarged, and the model could not be reopened as it was: it starts again with the next message.');
    return rifiuto(`the window was not enlarged: ${perche[esito?.motivo] ?? 'the model could not be reopened, so the previous window was kept'}.`);
  }

  /* 11/10/2026 — `chatgpt_account`: lo stato dell'accesso col piano ChatGPT e lo scollegamento con la carta. Mai un token nel testo. */
  function statoChatgpt() {
    if (!accessoChatgpt) return { ok: true, testo: 'A ChatGPT account cannot be connected on this computer: the system keyring is not available.' };
    const s = accessoChatgpt.stato();
    if (!s.collegato) return { ok: true, testo: 'No ChatGPT account is connected. The person signs in from Settings, Model Lab, Provider, OpenAI, "Continue with ChatGPT" (ChatGPT Plus or Pro). The interface can open that screen.' };
    return { ok: true, testo: s.pianoAbilitato
      ? `A ChatGPT account is connected${s.email ? ` (${s.email})` : ''} and its plan pays requests to the ChatGPT plan models. Usage: ${s.consumi}.`
      : `A ChatGPT account is connected${s.email ? ` (${s.email})` : ''}, but plan use was not granted: the person can enable it from Settings, Model Lab, Provider, OpenAI.` };
  }

  const leggi = () => providerStore.getRuntime('openrouter');

  function lista() {
    const runtime = leggi();
    const persona = runtime.esclusi ?? [];
    const serie = vociDiSerie(runtime.esclusiDiSerieTolti);
    const righe = [
      persona.length ? `Excluded by the person, for every model: ${persona.join(', ')}.` : 'The person has not excluded any provider.',
      ...serie.map((v) => `${v.attivo ? 'Excluded by default' : 'Allowed again by the person (excluded by default)'} for ${v.modello}: ${v.slug} — ${v.perche}.`),
      'Excluded providers apply to OpenRouter only. Changing them needs the person\'s approval on a card.',
    ];
    return { ok: true, testo: righe.join('\n') };
  }

  /** Dal nome che il modello passa allo slug: uno slug si usa com'è; un nome («OpenInference») vuole il modello per cercarlo. */
  async function slugDa(argomenti) {
    const scritto = typeof argomenti.provider === 'string' ? argomenti.provider.trim() : '';
    if (!scritto) throw Object.assign(new Error('"provider" is required: the provider short name, like deepinfra.'), { code: 'INVALID' });
    const minuscolo = scritto.toLowerCase();
    if (FORMA_SLUG.test(minuscolo)) return minuscolo;
    if (typeof argomenti.model !== 'string' || !argomenti.model.trim() || typeof slugDelFornitoreFn !== 'function') {
      throw Object.assign(new Error(`"${scritto}" is not a provider short name; pass the short name (like deepinfra), or "model" too so it can be looked up.`), { code: 'INVALID' });
    }
    return slugDelFornitoreFn({ fornitore: scritto, modello: argomenti.model.trim() });
  }

  /** Che cosa cambierebbe: `{campo:'persona'|'di-serie', slug, modello, prima, dopo}`, o un rifiuto. */
  async function piano(nome, argomenti) {
    const slug = await slugDa(argomenti);
    const runtime = leggi();
    const persona = runtime.esclusi ?? [];
    const modello = typeof argomenti.model === 'string' && argomenti.model.trim() ? modelloBase(argomenti.model) : null;
    const serie = vociDiSerie(runtime.esclusiDiSerieTolti).filter((v) => v.slug === slug && (!modello || v.modello === modello));
    const cambiPersona = (dopo) => ({ campo: 'persona', modello: null, prima: persona, dopo });
    /*
     * ⛔ Review del bugfixer (09/10/2026, YELLOW, provato su una sonda): un piano è un ELENCO di cambi, perché uno slug può stare
     *   sia nella lista della persona sia fra i di-serie. «Riammettilo» toglieva solo la lista: il di-serie restava, l'instradamento
     *   lo saltava ancora, e il modello diceva «fatto». Ora una carta sola copre tutto ciò che lo esclude (per quel modello, se
     *   detto). Con un modello indicato vale la voce di serie DI quel modello; escludere ciò che quel modello già esclude di serie
     *   non cambia niente; il tetto dei 30 si dice all'anteprima, non dopo il sì.
     */
    if (nome === 'provider_exclude') {
      if (modello && serie.length) {
        const voce = serie[0];
        if (voce.attivo) return { gia: `${slug} is already excluded by default for ${modello}.` };
        return { slug, cambi: [{ campo: 'di-serie', modello: voce.modello, prima: false, dopo: true }] };
      }
      if (persona.includes(slug)) return { gia: `${slug} is already excluded for every model.` };
      if (persona.length >= ESCLUSI_MASSIMI) {
        return { errore: `the list of excluded providers is full (${ESCLUSI_MASSIMI}): the person must remove one in Settings first.` };
      }
      return { slug, cambi: [cambiPersona([...persona, slug])] };
    }
    const attive = serie.filter((v) => v.attivo);
    if (!modello && attive.length > 1) return { errore: `${slug} is excluded by default for more than one model: pass "model".` };
    const cambi = [
      ...(persona.includes(slug) ? [cambiPersona(persona.filter((s) => s !== slug))] : []),
      ...attive.map((v) => ({ campo: 'di-serie', modello: v.modello, prima: true, dopo: false })),
    ];
    if (!cambi.length) return { gia: `${slug} is not excluded${modello ? ` for ${modello}` : ''}.` };
    return { slug, cambi };
  }

  /*
   * Tutti i cambi della carta in UNA scrittura (`impostaEsclusioni`): o tutti o nessuno. Prima erano due scritture di fila, e se la
   * seconda falliva la prima restava fatta mentre il modello riceveva un rifiuto che non lo diceva (seguito della review, 09/10).
   */
  function applica(p) {
    const persona = p.cambi.find((c) => c.campo === 'persona');
    const diSerie = p.cambi.filter((c) => c.campo === 'di-serie').map((c) => ({ modello: c.modello, slug: p.slug, attivo: c.dopo }));
    let dopo;
    try {
      dopo = providerStore.impostaEsclusioni('openrouter', { ...(persona ? { esclusi: persona.dopo } : {}), diSerie });
    } catch (errore) {
      throw Object.assign(new Error(`nothing was changed: the settings could not be saved (${errore?.code ?? errore?.message ?? 'error'}).`),
        { code: 'PROVIDER_SETTINGS_NOT_SAVED' });
    }
    const frasi = [];
    if (persona) frasi.push(`Excluded for every model: ${dopo.esclusi.length ? dopo.esclusi.join(', ') : 'none'}.`);
    for (const d of diSerie) frasi.push(d.attivo ? `${p.slug} is excluded again for ${d.modello}, as by default.` : `${p.slug} is allowed again for ${d.modello}.`);
    return `Done. ${frasi.join(' ')} It applies from the next request.`;
  }

  return function perLaSessione({ automazioneDelGiro = null, soloLettura = false } = {}) {
    /* s58 (16/10 notte): con nessuno davanti si legge e basta, come in un giro d'automazione — la carta non avrebbe nessuno a rispondere */
    const perchéNo = automazioneDelGiro ? 'an automation run' : soloLettura ? 'a turn with nobody in front' : null;
    return async function onFornitoriFn(nome, argomenti = {}, { fase = 'esegui' } = {}) {
      try {
        if (nome === 'provider_exclusions_list') return fase === 'anteprima' ? { ok: true, carta: false } : lista();
        if (nome === 'local_model_window') {
          if (perchéNo && String(argomenti?.action ?? '').trim().toLowerCase() === 'enlarge') return rifiuto(`${perchéNo} cannot enlarge the local model window: nobody could approve it.`);
          return finestra(argomenti ?? {}, fase);
        }
        if (nome === 'chatgpt_account') {
          const azione = typeof argomenti?.action === 'string' ? argomenti.action.trim().toLowerCase() : '';
          if (azione === 'status') return fase === 'anteprima' ? { ok: true, carta: false } : statoChatgpt();
          if (azione !== 'disconnect') return rifiuto('chatgpt_account needs action "status" or "disconnect".');
          if (perchéNo) return rifiuto(`${perchéNo} cannot disconnect ChatGPT: nobody could approve it.`);
          if (!accessoChatgpt || !accessoChatgpt.stato().collegato) return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: 'Nothing to do: no ChatGPT account is connected.' };
          if (fase === 'anteprima') return { ok: true, carta: true, azione: { fornitore: 'chatgpt', email: accessoChatgpt.stato().email ?? null } };
          const { revocaConfermata } = await accessoChatgpt.esci();
          return { ok: true, testo: revocaConfermata ? 'Done. ChatGPT is disconnected: requests no longer use the person\'s plan.'
            : 'Disconnected in TALOS, but OpenAI did not confirm the revocation: the person can also remove TALOS in ChatGPT Settings.' };
        }
        if (nome !== 'provider_exclude' && nome !== 'provider_allow') return rifiuto(`unknown tool ${nome}.`);
        if (perchéNo) return rifiuto(`${perchéNo} cannot change the excluded providers: nobody could approve it.`);
        const p = await piano(nome, argomenti ?? {});
        if (p.errore) return rifiuto(p.errore);
        if (p.gia) return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: `Nothing to change: ${p.gia}` };
        if (fase === 'anteprima') return { ok: true, carta: true, azione: { fornitore: p.slug, cambi: p.cambi } };
        return { ok: true, testo: applica(p) };
      } catch (errore) {
        if (errore && typeof errore.message === 'string' && typeof errore.code === 'string') return rifiuto(errore.message);
        throw errore;
      }
    };
  };
}

/** Le voci che il modello può nominare (per la descrizione dell'attrezzo e le prove). */
export const MODELLI_CON_ESCLUSI_DI_SERIE = Object.freeze(Object.keys(ESCLUSI_DI_SERIE));
