/*
 * ⛔ Owner 09/10/2026 — L'INDIRIZZO DI Z.AI SI SCEGLIE DA SOLO.
 *
 * Il caso: lo stress test dell'owner (zai:glm-5.3-flash) si è fermato con «Credit not available at the provider» mentre
 * l'owner ha il piano GLM. Z.AI fattura il piano SOLO sull'indirizzo `api/coding/paas/v4`; TALOS chiamava sempre
 * `api/paas/v4`, il saldo a consumo (docs.z.ai/devpack/tool/others, letto il 09/10/2026: «Incorrect endpoint configuration
 * will result in inability to use GLM Coding Plan subscription quota»). Owner: «deve essere dinamica, vedi come fanno Pi
 * Hermes e gli altri»; «Prima il piano (Consigliata)»; «Riprova sull'altro e lo dice (Consigliata)».
 *
 * Come Hermes (`hermes_cli/auth_zai_kimi.py`, clone 07/10/2026): una richiesta minuscola (1 token, niente stream) a ogni
 * indirizzo in parallelo con la chiave della persona; vince il primo che risponde 200 IN ORDINE DI PRIORITÀ (uno più in basso
 * vince solo quando tutti quelli sopra hanno finito senza riuscire); il vincitore si ricorda per chiave (un prefisso
 * dell'impronta, mai la chiave); un fallimento non si riprova per 5 minuti; un indirizzo scelto dalla persona vince sempre.
 * Diverso da Hermes, per decisione dell'owner: il PIANO PER PRIMO, come il default di Pi (`packages/ai/src/providers/zai.ts`),
 * Cline (`sdk/packages/llms/src/providers/builtins.ts`) e Goose (`provider_metadata.json`) — chi ha il piano e anche un po' di
 * saldo non paga due volte.
 */
export const INDIRIZZI_ZAI = Object.freeze([
  Object.freeze({ id: 'coding', endpoint: 'https://api.z.ai/api/coding/paas/v4', etichetta: 'the GLM Coding Plan' }),
  Object.freeze({ id: 'coding-cn', endpoint: 'https://open.bigmodel.cn/api/coding/paas/v4', etichetta: 'the GLM Coding Plan (China)' }),
  Object.freeze({ id: 'general', endpoint: 'https://api.z.ai/api/paas/v4', etichetta: 'the pay-as-you-go balance' }),
  Object.freeze({ id: 'general-cn', endpoint: 'https://open.bigmodel.cn/api/paas/v4', etichetta: 'the pay-as-you-go balance (China)' }),
]);
/* Un account del piano può avere solo i modelli recenti; uno più vecchio ancora glm-4.7 (Hermes `_ZAI_CODING_PROBE_MODELS`).
   Il modello della sessione si prova per primo. */
export const MODELLI_SONDA_ZAI = Object.freeze(['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'glm-5.1', 'glm-4.7']);
export const SONDA_FALLITA_MS = 5 * 60_000;
const TEMPO_SONDA_MS = 8_000;

export function indirizzoZaiNoto(endpoint) {
  return INDIRIZZI_ZAI.find((i) => i.endpoint === endpoint) ?? null;
}
export function improntaBreve(impronta) {
  return typeof impronta === 'string' ? impronta.slice(0, 16) : '';
}

async function provaUno({ chiave, fetchFn, indirizzo, modelli, timeoutMs }) {
  for (const modello of modelli) {
    try {
      const risposta = await fetchFn(`${indirizzo.endpoint}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${chiave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modello, stream: false, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      try { await risposta.body?.cancel(); } catch { /* il corpo non serve */ }
      if (risposta.status === 200) return indirizzo;
    } catch { /* rete, tempo: si prova il prossimo modello */ }
  }
  return null;
}

/** Il primo indirizzo che risponde, in ordine di priorità; `null` se nessuno. Le prove partono tutte insieme. */
export async function sondaIndirizziZai({ chiave, fetchFn = fetch, modelli = MODELLI_SONDA_ZAI, escludi = [], timeoutMs = TEMPO_SONDA_MS }) {
  if (typeof chiave !== 'string' || chiave === '') return null;
  const elenco = [...new Set(modelli.filter((m) => typeof m === 'string' && m))];
  const candidati = INDIRIZZI_ZAI.filter((i) => !escludi.includes(i.endpoint));
  const prove = candidati.map((indirizzo) => provaUno({ chiave, fetchFn, indirizzo, modelli: elenco, timeoutMs }));
  for (const prova of prove) {
    const esito = await prova; // in ordine: uno più in basso conta solo dopo che quelli sopra hanno finito senza riuscire
    if (esito) return esito;
  }
  return null;
}

/**
 * Il rilevatore della fetch del kernel. `indirizzoPer` riscrive l'URL di una richiesta verso l'indirizzo ricordato per la
 * chiave (o lo rileva); `dopoCredito` rifà la sonda senza l'indirizzo che ha appena risposto «credito» e lo dice.
 */
export function creaRilevatoreZai({ providerStore, fetchFn, ora = Date.now, onAvviso = null }) {
  const fallite = new Map();
  const configurato = () => providerStore.getRuntime('zai')?.endpointConfigured === true;
  const sostituisci = (target, da, a) => `${a}${String(target).slice(da.length)}`;
  const salva = (endpoint, corta) => { try { providerStore.impostaIndirizzoRilevato('zai', endpoint, corta); } catch { /* resta in memoria per questa richiesta */ } };

  async function indirizzoPer(target, scelta, modello) {
    if (!scelta?.chiave || configurato()) return target;
    const base = providerStore.getRuntime('zai')?.endpoint;
    if (typeof base !== 'string' || !String(target).startsWith(`${base}/`)) return target;
    const corta = improntaBreve(scelta.impronta);
    const ricordato = providerStore.indirizzoRilevato('zai');
    if (ricordato?.impronta === corta) return sostituisci(target, base, ricordato.endpoint);
    if ((fallite.get(corta) ?? 0) > ora()) return target;
    const vinto = await sondaIndirizziZai({ chiave: scelta.chiave, fetchFn, modelli: [modello, ...MODELLI_SONDA_ZAI] });
    if (!vinto) { fallite.set(corta, ora() + SONDA_FALLITA_MS); return target; }
    salva(vinto.endpoint, corta);
    return sostituisci(target, base, vinto.endpoint);
  }

  async function dopoCredito(target, scelta, modello) {
    if (!scelta?.chiave || configurato()) return null;
    const usato = INDIRIZZI_ZAI.find((i) => String(target).startsWith(`${i.endpoint}/`));
    const corta = improntaBreve(scelta.impronta);
    if (!usato || (fallite.get(corta) ?? 0) > ora()) return null; // una sonda appena fallita non si ripete
    const vinto = await sondaIndirizziZai({ chiave: scelta.chiave, fetchFn, modelli: [modello, ...MODELLI_SONDA_ZAI], escludi: [usato.endpoint] });
    if (!vinto) { fallite.set(corta, ora() + SONDA_FALLITA_MS); return null; }
    salva(vinto.endpoint, corta);
    if (typeof onAvviso === 'function') {
      try {
        await onAvviso({ testo: `Z.AI said there is no credit on ${usato.etichetta}: TALOS switched to ${vinto.etichetta} and goes on.`,
          testoChiave: 'server.runtime.notice.zaiEndpointSwitched', testoParams: { from: usato.etichetta, to: vinto.etichetta } }, { ripetibile: true });
      } catch { /* l'avviso non ferma il lavoro */ }
    }
    return sostituisci(target, usato.endpoint, vinto.endpoint);
  }

  return Object.freeze({ indirizzoPer, dopoCredito });
}
