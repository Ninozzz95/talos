/*
 * 13/10/2026 (bugfixer, lotto 3, parte A) — REVISIONE AVVERSARIA di `5e897ac3a` (che cosa fa ogni agente, i conti, la colonna
 * «Attività recenti», `tela.mostra`, la barra che si compatta, il tetto dell'elenco dei file).
 *
 * Qui stanno le prove di CHI ATTACCA: quelle che passano dicono che cosa ho provato a rompere e non si è rotto; quelle che
 * falliscono sono difetti consegnati alla sessione desktop (i file del diagramma sono suoi: la cura la fa lei). Ogni prova
 * dice nel titolo `[REGGE]` o `[DIFETTO]`. Le due `[ESISTEVA?]` misurano i due difetti che il commit dice di aver curato, con
 * selettori che esistono anche sul commit di prima (`c851a03d8`): lì devono essere rosse.
 * Solo letture: ogni scrittura si ferma e si conta (banco comune).
 */
import { expect, test } from '@playwright/test';
import { apri, at, eventoAgente, figlia, finita } from './aiuto-deleghe-diagramma.mjs';

const passo = (s, attrezzo, percorso = null) => ({ tipo: 'attrezzo', attrezzo, percorso, quando: at(s) });
const conPassi = (id, nascita, passi, extra = {}) => figlia(id, nascita, { taskCorto: `Agente ${id}`, attivita: { file: [], chiamate: passi.length, passi }, ...extra });
const attivo = (page) => page.evaluate(() => { const e = document.activeElement; return { tag: e?.tagName ?? null, voce: e?.classList?.contains('gv-attivita-voce') ?? false, nodo: e?.dataset?.nodoId ?? null, nelDiagramma: Boolean(e?.closest?.('[data-c="GrafoAgenti"]')) }; });
const righeDellaBarra = (grafo) => grafo.locator('.gv-comandi').evaluate((c) => new Set([...c.querySelectorAll(':scope > .gv-comandi-gruppo > *')].filter((x) => x.offsetParent).map((x) => Math.round(x.getBoundingClientRect().top / 20))).size);

/* ——— i due difetti che il commit dice di aver curato: esistevano? (su `c851a03d8` queste due devono essere ROSSE) ——— */
test('REVISIONE-ESISTEVA-01 [ESISTEVA?] — a 1920, in italiano, guardando una richiesta PASSATA la barra dei comandi sta su una riga', async ({ page }) => {
  const { grafo } = await apri(page, [finita('a', 10, 70), finita('b', 310, 400), figlia('c', 610)], {
    richieste: [{ at: at(0), testo: 'Sistema i listini' }, { at: at(300), testo: 'Ora aggiungi le prove' }, { at: at(600), testo: 'Grazie, basta così' }] });
  const richieste = grafo.locator('[data-richieste]');
  await richieste.locator('> button').click();
  await richieste.locator('[role="menuitemradio"]').nth(1).click(); // la penultima: una richiesta passata, con l'ora nel nome
  await expect(grafo.locator('[data-sessione="b"]')).toBeVisible();
  await page.waitForTimeout(300);
  expect(await righeDellaBarra(grafo)).toBe(1);
});

test('REVISIONE-ESISTEVA-02 [ESISTEVA?] — settanta file non raddoppiano il dettaglio rispetto a due', async ({ page }) => {
  const settanta = Array.from({ length: 70 }, (_, i) => ({ percorso: `src/contratti/file-${String(i).padStart(2, '0')}.js`, letto: true }));
  const { grafo } = await apri(page, [finita('tanti', 10, 70, { attivita: { file: settanta, chiamate: 80, passi: [] } }), finita('pochi', 12, 90, { attivita: { file: settanta.slice(0, 2), chiamate: 3, passi: [] } })]);
  const altezza = () => grafo.locator('.gv-dettaglio').evaluate((n) => Math.round(n.getBoundingClientRect().height));
  await grafo.locator('[data-sessione="pochi"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__file')).toHaveCount(2);
  const conPochi = await altezza();
  await grafo.locator('[data-sessione="tanti"]').click();
  await expect(grafo.locator('.gv-dettaglio .talos-wfg__file').first()).toBeVisible();
  expect(await altezza(), `con 2 file ${conPochi} px`).toBeLessThanOrEqual(conPochi + 110);
});

/* ——— la barra e il suo osservatore: nessun ciclo, a ogni larghezza, in due lingue, con e senza la richiesta passata ——— */
for (const lingua of ['it', 'en']) {
  for (const larghezza of [1024, 1280, 1440, 1920]) {
    test(`REVISIONE-BARRA (${lingua}, ${larghezza}) ${larghezza === 1920 ? '[DIFETTO]' : '[REGGE]'} — nessun «ResizeObserver loop», nessun errore di pagina, e la barra non oscilla fra piena e compatta`, async ({ page }) => {
      const errori = []; page.on('pageerror', (e) => errori.push(e.message));
      await page.addInitScript(() => { window.__ro = []; window.addEventListener('error', (e) => { if (/ResizeObserver/iu.test(String(e.message))) window.__ro.push(e.message); }); });
      const { grafo } = await apri(page, [finita('a', 10, 70), finita('b', 310, 400), figlia('c', 610)], { lingua, finestra: { width: larghezza, height: 900 },
        richieste: [{ at: at(0), testo: 'Sistema i listini' }, { at: at(300), testo: 'Ora aggiungi le prove' }, { at: at(600), testo: 'Grazie, basta così' }] });
      const barra = grafo.locator('.gv-comandi');
      // quante volte `data-compatta` cambia mentre si sceglie la richiesta passata, si torna, e la finestra si stringe e si allarga
      await barra.evaluate((n) => { window.__cambi = 0; new MutationObserver(() => { window.__cambi += 1; }).observe(n, { attributes: true, attributeFilter: ['data-compatta'] }); });
      const richieste = grafo.locator('[data-richieste]');
      await richieste.locator('> button').click();
      await richieste.locator('[role="menuitemradio"]').nth(1).click();
      await page.waitForTimeout(400);
      await page.setViewportSize({ width: larghezza - 60, height: 900 }); await page.waitForTimeout(250);
      await page.setViewportSize({ width: larghezza, height: 900 }); await page.waitForTimeout(400);
      const prima = await page.evaluate(() => window.__cambi);
      await page.waitForTimeout(1500); // a riposo: niente deve più cambiare
      expect(await page.evaluate(() => window.__cambi), 'a riposo la barra non cambia forma da sola').toBe(prima);
      expect(prima, 'pochi cambi di forma in tutto: nessuna oscillazione').toBeLessThanOrEqual(12);
      expect(await page.evaluate(() => window.__ro)).toEqual([]);
      expect(errori).toEqual([]);
    });
  }
}

/* ——— la colonna ——— */
test('REVISIONE-COLONNA-01 [DIFETTO] — la voce col fuoco esce dall’elenco (arrivano passi più nuovi): il fuoco resta nella colonna, non cade sul body', async ({ page }) => {
  const passiDi = (quanti, da) => Array.from({ length: quanti }, (_, i) => passo(da + i, 'leggi', `src/f${da + i}.js`));
  const figli = [conPassi('a', 10, passiDi(8, 20))];
  const { grafo } = await apri(page, () => figli);
  const voci = grafo.locator('.gv-attivita-voce');
  await expect(voci).toHaveCount(8);
  await voci.last().focus(); // la più vecchia: la prima a uscire
  expect((await attivo(page)).voce).toBe(true);
  figli.splice(0, 1, conPassi('a', 10, passiDi(8, 40))); // otto passi nuovi: nessuno di quelli di prima resta
  await eventoAgente(page, figli[0]);
  await expect(voci.first()).toContainText('f47.js', { timeout: 4000 });
  const dopo = await attivo(page);
  expect(dopo.nelDiagramma, `il fuoco è finito su <${dopo.tag}>`).toBe(true);
  expect(dopo.voce, 'il fuoco resta su una voce dell’elenco').toBe(true);
});

test('REVISIONE-COLONNA-02 [DIFETTO] — a diagramma stretto la colonna aperta SOPRA la tela si chiude con Esc (e il diagramma resta aperto)', async ({ page }) => {
  const { grafo } = await apri(page, [conPassi('a', 10, [passo(20, 'leggi', 'src/a.js')]), figlia('b', 11)], { finestra: { width: 1024, height: 800 } });
  const bottone = grafo.locator('[data-attivita]');
  const colonna = grafo.locator('.gv-attivita');
  await expect(colonna).toBeHidden();
  await expect(grafo.locator('[data-sessione]')).toHaveCount(2); // i fatti sono arrivati (un clic PRIMA cambia la scelta ricordata invece di aprire: vedi il rapporto)
  await bottone.click();
  await expect(colonna).toBeVisible();
  await colonna.locator('.gv-attivita-voce').first().focus();
  await page.keyboard.press('Escape');
  await expect(grafo, 'Esc non chiude il diagramma intero').toBeVisible();
  await expect(colonna, 'Esc chiude la colonna che copre la tela').toBeHidden();
});

test('REVISIONE-COLONNA-03 [REGGE] — Invio e Spazio su una voce scelgono il suo agente; la voce ha un nome con l’ora; una memoria del browser che LANCIA non rompe il pulsante', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  await page.addInitScript(() => {
    const vera = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(chiave, valore) { if (String(chiave).includes('deleghe-attivita')) throw new DOMException('QuotaExceededError'); return vera.call(this, chiave, valore); };
  });
  const { grafo } = await apri(page, [conPassi('a', 10, [passo(20, 'leggi', 'src/a.js')]), conPassi('b', 11, [passo(30, 'scrivi', 'src/b.js')])]);
  const voci = grafo.locator('.gv-attivita-voce');
  await expect(voci).toHaveCount(2);
  await expect(voci.first()).toHaveAttribute('aria-label', /^\d{1,2}[:.]\d{2}.*Agente b/u);
  await voci.first().focus(); await page.keyboard.press('Enter');
  await expect(grafo.locator('[data-sessione="b"]')).toHaveAttribute('aria-pressed', 'true');
  await voci.nth(1).focus(); await page.keyboard.press('Space');
  await expect(grafo.locator('[data-sessione="a"]')).toHaveAttribute('aria-pressed', 'true');
  const bottone = grafo.locator('[data-attivita]');
  await bottone.click();
  await expect(grafo.locator('.gv-attivita')).toBeHidden();
  await expect(bottone).toHaveAttribute('aria-pressed', 'false');
  await bottone.click();
  await expect(grafo.locator('.gv-attivita')).toBeVisible();
  expect(errori).toEqual([]);
});

/* ——— le schede ——— */
test('REVISIONE-SCHEDE-02 [REGGE] — un nome di file con un a capo e un carattere che inverte la scrittura non rompe la scheda né il suo nome accessibile', async ({ page }) => {
  const errori = []; page.on('pageerror', (e) => errori.push(e.message));
  const { grafo } = await apri(page, [figlia('a', 10, { taskCorto: 'Agente a', attivita: { file: [], chiamate: 1, attrezzoCorrente: 'scrivi', bersaglioCorrente: 'src/a\nb‮gnp.exe', passi: [] } })]);
  const riga = grafo.locator('[data-sessione="a"] .gv-passo-attivita');
  await expect(riga).toBeVisible();
  expect(await riga.evaluate((n) => n.children.length), 'solo testo: nessun elemento nato dal nome').toBe(0);
  expect(errori).toEqual([]);
});

test('REVISIONE-PAROLE-01 [REGGE] — uno e molti: 1 chiamata, 1 file, 1 agente che aspetta; e «almeno» quando UN solo agente non dichiara i token', async ({ page }) => {
  const uso = { prompt_tokens: 900, completion_tokens: 100 };
  const { grafo } = await apri(page, [
    figlia('a', 10, { taskCorto: 'Agente a', attivita: { file: [{ percorso: 'src/a.js', letto: true }], chiamate: 1, passi: [] }, usageSessione: uso }),
    finita('b', 11, 60, { taskCorto: 'Agente b', attivita: { file: [], chiamate: 0, passi: [] } }), // non dichiara i token
  ]);
  const testata = grafo.locator(':scope > header');
  await expect(testata).toContainText(/1 chiamata\b/u);
  await expect(testata).not.toContainText(/1 chiamate|1 file toccati\b.*\b1 file toccati/u);
  await expect(testata).toContainText(/almeno/iu);
  await expect(grafo.locator('[data-coordinatore="true"]')).toContainText(/1 agente\b/u);
  await grafo.locator('[data-sessione="a"]').click();
  await expect(grafo.locator('.gv-dettaglio [data-conti]')).toHaveText(/^1 chiamata · 1 file · /u);
});
