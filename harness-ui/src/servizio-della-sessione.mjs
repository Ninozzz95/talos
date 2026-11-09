/*
 * Spesa dei riassunti, il totale «dove c'è già» (owner 30/10/2026 sera, consigliata; contratto
 * in-corso/CONTRATTO-SPESA-RIASSUNTI-SCHEDA-CONTESTO-2026-10-30.md, OK di CLI, Mobile e Performance sulla forma).
 *
 * Il campo `servizio` accanto a `usageSessione`: la somma delle righe `consumo-di-servizio` della conversazione (riassunti, /compact,
 * giudici, obiettivo, domanda, e uno scopo che questa versione non conosce), TRANNE lo scopo `motore`. Il motore del contesto la sua
 * spesa la porta già dentro `usageSessione` (`usageSessioneDaEventi` → `contextUsageFromEvents`, eventi `context.usage.recorded`): le
 * sue righe sono le STESSE chiamate, e due volte non si contano («ogni spesa una volta», forma per fonte del totale della CLI).
 * ⇒ Chi costruisce un totale da `usageSessione` gli aggiunge `servizio` così com'è; `usageSessione` non cambia, così chi non legge il
 * campo nuovo resta com'è oggi.
 * ⛔ Una riga senza uso non aggiunge token e si conta in `nonMisurate` (mai uno 0 al posto di «non so»). Nessuna riga ⇒ `null`.
 * `_sequenza` evita il doppio a una rigiocata.
 */
import { NOME_CONSUMO_DI_SERVIZIO } from './kernel/consumo-di-servizio.mjs';

/** Gli scopi la cui spesa `usageSessione` porta già da un'altra fonte. */
const GIA_IN_USAGE_SESSIONE = Object.freeze(['motore']);

const conto = (n) => (Number.isFinite(n) && n >= 0 ? n : null);

export function servizioDaEventi(eventi) {
  let prompt = 0; let completion = 0; let misurate = 0; let nonMisurate = 0;
  const viste = new Set();
  for (const evento of Array.isArray(eventi) ? eventi : []) {
    if (evento?.type !== 'CUSTOM' || evento.name !== NOME_CONSUMO_DI_SERVIZIO) continue;
    const valore = evento.value;
    if (!valore || typeof valore !== 'object' || GIA_IN_USAGE_SESSIONE.includes(valore.scopo)) continue;
    if (Number.isSafeInteger(evento._sequenza)) {
      if (viste.has(evento._sequenza)) continue;
      viste.add(evento._sequenza);
    }
    const dentro = conto(valore.usage?.prompt_tokens);
    const fuori = conto(valore.usage?.completion_tokens);
    if (dentro === null && fuori === null) { nonMisurate += 1; continue; }
    prompt += dentro ?? 0; completion += fuori ?? 0; misurate += 1;
  }
  if (misurate === 0 && nonMisurate === 0) return null;
  return { prompt_tokens: prompt, completion_tokens: completion, misurate, nonMisurate };
}
