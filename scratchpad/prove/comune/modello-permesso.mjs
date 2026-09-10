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
    /* ⛔ La pillola del modello NEL COMPOSER: e' cio' che partira' col prossimo invio.
       La prima versione leggeva il piede della barra e tornava «AVM-harness-desktop Tema Calm · z-ai»,
       cioe' fermava la sonda per un motivo sbagliato: un cancello che nega a chi ha obbedito. */
    const pillola = document.querySelector('[data-open-sheet="model"] span');
    return pillola?.textContent?.trim() ?? null;
  });
  if (!letto || !letto.includes(MODELLO_PERMESSO)) {
    throw new Error(
      `⛔ FERMO: la sessione userebbe «${letto || '(non letto)'}», non «${MODELLO_PERMESSO}». `
      + 'Giri reali solo col modello permesso dall\'owner (regola del 09/09). Nessun messaggio inviato.',
    );
  }
  return letto;
}
