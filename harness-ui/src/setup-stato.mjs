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
export function statoPrimoAvvio({ providerStore = null, localeConfigurato = false, introDisattivato = false, cartelleProgetto = 0 } = {}) {
  let conChiave = [];
  if (providerStore && typeof providerStore.listPublic === 'function') {
    try {
      conChiave = providerStore.listPublic().filter((riga) => riga.keyConfigured === true).map((riga) => riga.id);
    } catch {
      conChiave = []; // un portachiavi rotto non è una chiave: si dichiara «non pronto», mai un'ipotesi
    }
  }
  const locale = localeConfigurato === true;
  return Object.freeze({
    introDisattivato: introDisattivato === true,
    provider: Object.freeze({ pronto: conChiave.length > 0 || locale, conChiave: Object.freeze(conChiave), localeConfigurato: locale }),
    cartelleProgetto: Number.isInteger(cartelleProgetto) && cartelleProgetto >= 0 ? cartelleProgetto : 0,
  });
}
