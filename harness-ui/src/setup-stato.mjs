/**
 * ⭐⭐⭐ 04/9 — R-02, intro al primo avvio (Fascia R, owner: «abbia un intro
 * stile mobile»). Lo stato che dice al browser QUALI passi del primo avvio
 * sono già fatti — letto dalla realtà, come sul telefono
 * (`mobile/src/lib/onboarding/setupProgress.ts`: «a step is done when the
 * thing it asks for EXISTS», non da un cursore salvato che può invecchiare).
 *
 * ⛔ Nessun segreto passa di qui: della chiave si dice solo per QUALI provider
 * esiste (`conChiave`), mai il valore. È la stessa disciplina di
 * `providerStore.listPublic()`, e il test lo prova con `JSON.stringify`.
 *
 * `TALOS_INTRO=0` è il rollback dichiarato nel ledger: l'intro non si apre,
 * e il lanciatore torna al comportamento di R-01 (schermata Doctor se manca
 * la chiave).
 */
/*
 * ⛔ 01/10/2026 — decisione owner per l'avviso «Imposta un provider» della Home: contano anche
 *   - `conIndirizzo`: i provider SENZA chiave obbligatoria con un indirizzo salvato (oggi Ollama e LM Studio);
 *   - `agenteEsterno`: l'agente esterno configurato.
 *   Come Hermes (`hermes_cli/auth.py:2079-2083`, `configured = bool(api_key) or actual_local_noauth`). Prima chi usava solo
 *   Ollama risultava «non pronto» per sempre. Un indirizzo salvato per un provider che VUOLE la chiave non basta.
 */
export function statoPrimoAvvio({ providerStore = null, localeConfigurato = false, introDisattivato = false, cartelleProgetto = 0 } = {}) {
  let conChiave = [];
  let conIndirizzo = [];
  let agenteEsterno = false;
  if (providerStore && typeof providerStore.listPublic === 'function') {
    try {
      const righe = providerStore.listPublic();
      conChiave = righe.filter((riga) => riga.keyConfigured === true).map((riga) => riga.id);
      conIndirizzo = righe.filter((riga) => riga.requiresKey === false && riga.supportsEndpoint === true && riga.endpointConfigured === true)
        .map((riga) => riga.id);
      agenteEsterno = righe.some((riga) => riga.id === 'esterno' && riga.execution === 'configurato');
    } catch {
      // un portachiavi rotto non è una chiave: si dichiara «non pronto», mai un'ipotesi
      conChiave = []; conIndirizzo = []; agenteEsterno = false;
    }
  }
  const locale = localeConfigurato === true;
  const pronto = conChiave.length > 0 || conIndirizzo.length > 0 || agenteEsterno || locale;
  return Object.freeze({
    introDisattivato: introDisattivato === true,
    provider: Object.freeze({ pronto, conChiave: Object.freeze(conChiave), conIndirizzo: Object.freeze(conIndirizzo), agenteEsterno,
      localeConfigurato: locale }),
    cartelleProgetto: Number.isInteger(cartelleProgetto) && cartelleProgetto >= 0 ? cartelleProgetto : 0,
  });
}
