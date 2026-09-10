/*
 * ⛔⛔ IL MODELLO DI UN GIRO VERO SI CONTROLLA PRIMA DI INVIARE.
 *
 * Owner, 09/09: giri reali SOLO con `glm-5.3-flash`. Il 10/09 due mie sonde hanno speso due giri
 * con `deepseek-v4.1-flash` senza accorgersene: la sessione che aprivano era stata cambiata di
 * modello, e nessuna sonda guardava. Me ne sono accorto DOPO, guardando una foto — cioe' per caso.
 *
 * ⇒ Il controllo non vive nella mia memoria: vive qui, e ogni sonda che manda un messaggio lo chiama.
 *   Non «avvisa»: SI FERMA. Una sonda che spende soldi su un modello non autorizzato ha gia' fatto
 *   il danno quando lo scrive nel log.
 */
export const MODELLO_PERMESSO = 'glm-5.3-flash';

/**
 * Legge il modello che la sessione aperta userebbe ADESSO e si ferma se non e' quello permesso.
 * @param {import('@playwright/test').Page} pagina
 * @returns {Promise<string>} il modello letto, quando e' quello giusto
 */
export async function esigiModelloPermesso(pagina) {
  const letto = await pagina.evaluate(() => {
    /* Il selettore del composer e' la fonte: e' cio' che partira' col prossimo invio. */
    const bottone = document.querySelector('#composerModello, [data-c="ModelPicker"], .talos-composer__modello');
    const daBottone = bottone?.textContent?.trim();
    if (daBottone) return daBottone;
    const piede = document.querySelector('.talos-workspace-footer__meta, .talos-sidebar__foot')?.textContent ?? '';
    return piede.trim();
  });
  if (!letto || !letto.includes(MODELLO_PERMESSO)) {
    throw new Error(
      `⛔ FERMO: la sessione userebbe «${letto || '(non letto)'}», non «${MODELLO_PERMESSO}». `
      + 'Giri reali solo col modello permesso dall\'owner (regola del 09/09). Nessun messaggio inviato.',
    );
  }
  return letto;
}
