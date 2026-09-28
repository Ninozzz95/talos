/*
 * 23/09/2026 notte — decisione owner: quando ai lati del composer non c'è posto, la pila dei toast sale
 * sopra il composer e PUÒ coprire per qualche secondo il contenuto della conversazione subito sopra
 * (nodi del grafo, pulsanti di un messaggio); i comandi del piede restano sempre liberi.
 * ⇒ Una prova che deve cliccare un nodo del grafo fa quello che farebbe una persona: chiude i toast
 *   aperti con la loro X, poi clicca. Non si tocca il DOM del prodotto e non si spegne niente.
 */
export async function chiudiToastAperti(page, { tentativi = 5 } = {}) {
  for (let i = 0; i < tentativi; i += 1) {
    const chiudi = page.locator('#regioneToast .talos-toast:not([data-demo]) [data-toast-chiudi]');
    const quanti = await chiudi.count();
    if (quanti === 0) return;
    for (let j = quanti - 1; j >= 0; j -= 1) await chiudi.nth(j).click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
  }
}
