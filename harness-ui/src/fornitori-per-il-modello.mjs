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

export const ATTREZZI_FORNITORI_OSPITE = Object.freeze(['provider_exclusions_list', 'provider_exclude', 'provider_allow']);
const FORMA_SLUG = /^[a-z0-9][a-z0-9._-]{0,47}(?:\/[a-z0-9][a-z0-9._-]{0,47})?$/u;
const rifiuto = (messaggio) => ({ ok: false, messaggio });

/**
 * @param {{ providerStore, slugDelFornitoreFn?: ({fornitore, modello}) => Promise<string> }} servizi
 * @returns la fabbrica di `onFornitoriFn` per una sessione: `({ automazioneDelGiro })`.
 */
export function creaOspiteFornitori({ providerStore, slugDelFornitoreFn = null }) {
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

  return function perLaSessione({ automazioneDelGiro = null } = {}) {
    return async function onFornitoriFn(nome, argomenti = {}, { fase = 'esegui' } = {}) {
      try {
        if (nome === 'provider_exclusions_list') return fase === 'anteprima' ? { ok: true, carta: false } : lista();
        if (nome !== 'provider_exclude' && nome !== 'provider_allow') return rifiuto(`unknown tool ${nome}.`);
        if (automazioneDelGiro) return rifiuto('an automation run cannot change the excluded providers: nobody could approve it.');
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
