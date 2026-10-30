/*
 * PANNELLO v2 (owner 29/10/2026) — gli aiuti delle prove che leggevano le card della scheda Contesto di oggi. Le righe di quelle card
 * (`.talos-kv`) sono nella scheda v2 dentro due pieghe chiuse («Finestra del contesto», «Compattazioni»); l'Indice dei giri è una piega
 * (`data-c="TurnIndex"`) con le sue pagine. Le prove aprono la piega come farebbe la persona, e leggono gli stessi testi.
 */
import { expect } from '@playwright/test';

/** Apre la piega `chiave` della scheda Contesto (se non è già aperta). Prima porta a schermo la scheda. */
export async function apriPiegaContesto(page, chiave) {
  const scheda = page.locator('#railTabs [data-rail="contesto"]');
  if ((await scheda.getAttribute('aria-selected')) !== 'true') await scheda.click();
  const b = page.locator(`#railContesto [data-controllo="piega-${chiave}"]`);
  await expect(b, `la piega «${chiave}» della scheda Contesto`).toBeVisible({ timeout: 10_000 });
  if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click();
  await expect(page.locator(`#railContesto [data-controllo="piega-${chiave}"]`)).toHaveAttribute('aria-expanded', 'true');
}

/** L'Indice dei giri, aperto: la piega col suo nome di componente di oggi. */
export async function indiceAperto(page) {
  await apriPiegaContesto(page, 'giri');
  return page.locator('#railContesto [data-c="TurnIndex"]');
}

/** I testi di TUTTE le righe dell'Indice dei giri, pagina per pagina (il più recente in cima, come il bozzetto). */
export async function righeIndice(page) {
  await apriPiegaContesto(page, 'giri');
  const indice = page.locator('#railContesto [data-c="TurnIndex"]');
  const viste = new Map();
  const prima = indice.locator('[data-controllo="pagina-prima-piega-giri"]');
  while (await prima.isEnabled().catch(() => false)) await prima.click();
  for (let pagina = 0; pagina < 500; pagina += 1) {
    for (const [k, testo] of await indice.locator('.pn-riga[data-chiave^="giro-"]:not(.pn-fuori-pagina)').evaluateAll((n) => n.map((x) => [x.dataset.chiave, x.querySelector('.pn-nome')?.textContent ?? '']))) viste.set(k, testo);
    const dopo = indice.locator('[data-controllo="pagina-dopo-piega-giri"]');
    if (!(await dopo.isEnabled().catch(() => false))) break;
    await dopo.click();
  }
  return [...viste.values()];
}
