import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ F3 (17/09/2026) — LA RAGIONE PRIMA DELLA REGOLA, E I GUASTI FUORI DALLA SCHEDA DI UN ALTRO.
 *
 * Trovato dal coordinatore in `9-estensioni-light-1440x900.png`, guardando l'ordine della colonna:
 *   paragrafo generico sulla fiducia → la frase «il contenuto è cambiato» → «PACCHETTI NON CARICATI»
 *   con dentro «vecchio-plugin» → il pulsante «Fida».
 *
 * ⛔ Due difetti, non uno:
 *   (a) la frase che dice PERCHÉ serve di nuovo la fiducia è la cosa più importante della scheda, e
 *       stava in fondo a un paragrafo grigio, con lo stesso peso della regola generale che vale
 *       sempre. Chi legge trova prima la regola e poi il fatto. Va accanto allo STATO, che è la
 *       riga che quella frase spiega, e con il peso di un avviso.
 *   (b) l'elenco dei pacchetti che NON si sono caricati non appartiene alla scheda di un ALTRO
 *       plugin: messo lì, col pulsante «Fida» sotto, sembra che si stia per fidare «vecchio-plugin».
 *       Sono voci dell'inventario che mancano, e il loro posto è la COLONNA DELL'ELENCO, sotto
 *       «1 di 1 voci del progetto», come righe che non si possono scegliere.
 *
 * ⭐ Il terzo, trovato spostando: finché l'elenco dei guasti stava nella scheda, veniva disegnato
 *   DOPO il `return` che esce quando non c'è niente di selezionato. Con zero plugin caricati e tre
 *   guasti, la pagina diceva «0 di 0 voci» e non mostrava NESSUNO dei tre — cioè spariva proprio
 *   nel caso in cui contava di più. Nella colonna dell'elenco quel `return` non lo tocca.
 */

const PLUGIN = {
  id: 'quality',
  nome: 'Qualità del progetto',
  descrizione: 'Raccoglie controlli e strumenti per la revisione.',
  fidato: false,
  frase: 'Il contenuto del pacchetto è cambiato dopo la tua approvazione: controllalo e approvalo di nuovo.',
  tools: [{ nome: 'check_notes', descrizione: 'Verifica le note della consegna.', comando: 'node note.mjs' }],
  hooks: [{ id: 'review', eventi: ['dopo-attrezzo'], comando: 'node review.mjs' }],
  avvisi: [],
};
const FALLITI = [{ pluginId: 'vecchio-plugin', frase: 'Il manifesto del pacchetto non si legge: correggilo e ricarica.' }];

async function apriPlugin(page, { larghezza, altezza, tema }, { conVoci = true } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/f3-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/*/plugins', (r) => r.fulfill({
    contentType: 'application/json',
    /* La porta locale parla per buste: `{ok, data}`. Una risposta nuda diventa «Inventario non
       disponibile», e la prova misurerebbe una pagina d'errore credendola il pannello. */
    body: JSON.stringify({ ok: true, data: { plugin: conVoci ? [PLUGIN] : [], falliti: FALLITI } }),
  }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    window.__talosHarnessUiRuntime.passaASessione('f3-uno', 'workspace', 'F3', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
  });
  /* Il gruppo «Strumenti» nasce CHIUSO (scelta del mockup, commentata nel template): si apre come
     farebbe la persona, invece di scavalcarlo con un click forzato su un nodo invisibile. */
  await page.locator('#testataGruppoStrumenti').click();
  await page.locator('nav [data-vaia="capability"]').first().click();
  await page.locator('[data-cap-tab="plugins"]').click();
  const pannello = page.locator('#capPanel-plugins');
  await expect(pannello.locator('[data-ext-falliti] li')).toHaveCount(1);
  return pannello;
}

/* Dove sta ogni pezzo, e che peso ha: si leggono i rettangoli e gli stili calcolati, non le classi. */
const DISPOSIZIONE = `(() => {
  const p = document.querySelector('#capPanel-plugins');
  const frase = p.querySelector('[data-ext-frase]');
  const nota = p.querySelector('[data-ext-nota]');
  const falliti = p.querySelector('[data-ext-falliti]');
  const scheda = p.querySelector('[data-ext-detail]');
  const elenco = p.querySelector('[data-ext-list]');
  const esito = p.querySelector('[data-ext-esito]');
  const stile = getComputedStyle(frase);
  const r = (n) => { const q = n.getBoundingClientRect(); return { top: Math.round(q.top), left: Math.round(q.left), right: Math.round(q.right) }; };
  return {
    fraseDopoLoStato: frase.previousElementSibling?.querySelector('[data-ext-stato]') ? true : false,
    fraseSopraLaNota: r(frase).top < r(nota).top,
    fraseHaCornice: stile.borderTopWidth !== '0px' && stile.backgroundColor !== 'rgba(0, 0, 0, 0)',
    fraseNellaScheda: scheda.contains(frase),
    fallitiNellaScheda: scheda.contains(falliti),
    /* «nella colonna dell'elenco» si misura: stessa ascissa dell'elenco, e sotto la riga del conto. */
    fallitiAllineatiAllElenco: Math.abs(r(falliti).left - r(elenco).left) <= 24,
    fallitiSottoIlConto: r(falliti).top > r(esito).top,
    toccabiliNeiFalliti: falliti.querySelectorAll('button, a[href], [role="option"], [tabindex], input').length,
    frasiDeiFalliti: [...falliti.querySelectorAll('li')].map((li) => li.textContent.trim()),
  };
})()`;

for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
  for (const tema of ['dark', 'light']) {
    test(`F3 (${larghezza}x${altezza}, ${tema}) — la frase sta accanto allo stato, i guasti stanno nell'elenco`, async ({ page }) => {
      await apriPlugin(page, { larghezza, altezza, tema });
      const d = await page.evaluate(DISPOSIZIONE);
      expect(d.fraseNellaScheda, 'la frase spiega lo stato di QUESTO plugin: resta nella sua scheda').toBe(true);
      expect(d.fraseDopoLoStato, 'la frase segue la riga «Stato», che è quella che spiega').toBe(true);
      expect(d.fraseSopraLaNota, 'e viene prima della regola generale, non dopo').toBe(true);
      expect(d.fraseHaCornice, 'ha il peso di un avviso, non quello di un paragrafo qualunque').toBe(true);
      expect(d.fallitiNellaScheda, 'i pacchetti guasti non stanno nella scheda di un ALTRO plugin').toBe(false);
      expect(d.fallitiAllineatiAllElenco, 'stanno nella colonna dell\'elenco').toBe(true);
      expect(d.fallitiSottoIlConto, 'sotto la riga che conta le voci del progetto').toBe(true);
      expect(d.toccabiliNeiFalliti, 'e non si possono scegliere: non sono voci vive').toBe(0);
      expect(d.frasiDeiFalliti[0]).toContain('Il manifesto del pacchetto non si legge');
      expect(d.frasiDeiFalliti[0]).toContain('vecchio-plugin');
    });
  }
}

test('F3 — con ZERO plugin caricati i guasti si vedono lo stesso', async ({ page }) => {
  /* ⛔ AL CONTRARIO del caso normale: è lo stato in cui l'elenco è vuoto PERCHÉ i pacchetti sono
     guasti, cioè quello in cui nascondere i guasti mente due volte. */
  const pannello = await apriPlugin(page, { larghezza: 1440, altezza: 900, tema: 'dark' }, { conVoci: false });
  await expect(pannello.locator('[data-ext-esito]')).toHaveText('0 di 0 voci del progetto');
  await expect(pannello.locator('[data-ext-falliti] li')).toHaveCount(1);
  await expect(pannello.locator('[data-ext-falliti] li').first()).toContainText('vecchio-plugin');
  await expect(pannello.locator('[data-ext-detail]')).toBeHidden();
});
