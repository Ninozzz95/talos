import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ F2 (17/09/2026) — IL «TORNA IN FONDO» NON COPRE CIÒ CHE SI PUÒ TOCCARE.
 *
 * Trovato dal coordinatore GUARDANDO le foto: in `6-menu-utente-piu-dark-1440x900.png` il pulsante
 * tondo stava sopra il piede della scheda di approvazione, sulla destra di «Per questa sessione» e
 * addosso a «Nega»; in `4-menu-risposta-piu-light-1024x800.png` copriva il motivo della richiesta.
 * Ingrandita la foto, non c'è dubbio: è il tondo con la freccia in giù, 36 px, sopra i bottoni di
 * una decisione che il prodotto sta ASPETTANDO dalla persona.
 *
 * ⛔ Perché è peggio del toast di BC-77: un toast copre del testo e se ne va da solo. Questo è un
 *   comando che copre un altro comando, e resta finché lei non scorre.
 *
 * ⛔⛔ E la causa NON è la scheda di approvazione: è DOVE STA il tondo. `left:50%` lo mette in mezzo
 *   alla colonna, e `bottom:12px` su un contenitore alto 0 lo fa galleggiare sugli ultimi 48 px
 *   della conversazione. Qualunque cosa si trovi in quella striscia — il piede di una scheda, la
 *   riga «⋯ copia esegui» di una risposta, «Visualizza le modifiche» della carta dei file — finisce
 *   sotto il tondo. La scheda di approvazione è la vittima più grave, non l'unica.
 *
 * ⇒ Questa prova non fotografa UNA scena: SPAZZOLA le posizioni di scorrimento raggiungibili e
 *   chiede, a ognuna, che il tondo non si sovrapponga a NIENTE di toccabile. Una sola posizione
 *   fortunata non direbbe niente: il difetto dipende da cosa capita nella striscia.
 *
 * ⭐ Misurato scrivendo questa prova (e costato tre riscritture): sotto l'ultimo messaggio la
 *   colonna tiene `--stream-follow-space`, cioè METÀ dell'altezza visibile (292 px a 800, 342 a
 *   900), e la soglia del prodotto è `distanza <= coda + 4`. ⇒ Con la coda accesa il piede
 *   dell'ultima scheda sta SEMPRE ~31 px sotto il bordo quando il tondo si accende: la scena della
 *   foto ha la scheda a 13 px dal composer, quindi lì la coda NON c'era. Che la coda a volte manchi
 *   è un secondo difetto, non questo; la cura di questo vale in tutti e due i mondi, perché toglie
 *   il tondo da sopra la colonna invece di indovinare quando è pericoloso.
 */

const SOVRAPPOSIZIONI = `(() => {
  const area = (a, b) => {
    const l = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return Math.round(l * h);
  };
  const tondo = document.querySelector('#chatTornaInFondo');
  if (!tondo || tondo.hidden) return { visibile: false };
  const r = tondo.getBoundingClientRect();
  const scorrevole = document.querySelector('#schermoChat .talos-conversation').getBoundingClientRect();
  /* Tutto ciò che si può toccare dentro la conversazione, non solo la scheda di approvazione. */
  const toccabili = [...document.querySelectorAll('#conversation button, #conversation a[href], #conversation [role="button"], #conversation input, #conversation select')]
    .filter((n) => {
      const q = n.getBoundingClientRect();
      return q.width > 0 && q.height > 0 && q.bottom > scorrevole.top && q.top < scorrevole.bottom;
    });
  const colpiti = toccabili
    .map((n) => ({ area: area(r, n.getBoundingClientRect()), che: (n.getAttribute('aria-label') || n.textContent || '').trim().slice(0, 40) }))
    .filter((x) => x.area > 0);
  const schede = [...document.querySelectorAll('#conversation [data-c="ApprovalCard"] .talos-approval__foot button')];
  return {
    visibile: true,
    tondo: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) },
    colpiti,
    suiBottoniDellaScheda: schede.reduce((s, b) => s + area(r, b.getBoundingClientRect()), 0),
    /* Il bordo destro delle schede: la cura mette il tondo alla sua destra, nella striscia dei 46 px
       che ogni turno riserva (la coda del turno) e che nessuna scheda occupa a nessuna larghezza.
       ⛔ Qui dentro niente apici inversi: chiuderebbero la stringa che porta questa sonda. */
    destraSchede: Math.round(Math.max(0, ...[...document.querySelectorAll('#conversation .talos-message, #conversation [data-c="ApprovalCard"]')].map((n) => n.getBoundingClientRect().right))),
  };
})()`;

async function scenaLunga(page, { larghezza, altezza, tema }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/f2-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('f2-uno', 'workspace', 'F2', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    /* Sei giri veri: ognuno lascia la riga di azioni sotto la risposta — è la roba toccabile che
       capita nella striscia mentre si rilegge. In coda, la richiesta in attesa. */
    for (let i = 1; i <= 6; i += 1) {
      r.handleRealEvent({ type: 'RunStarted', _sequenza: i * 10, input: { consegna: `Domanda numero ${i} del giro`, seguito: i > 1 }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
      r.handleRealEvent({ type: 'TextMessageStart', messageId: `m${i}` }, g);
      r.handleRealEvent({ type: 'TextMessageContent', messageId: `m${i}`, delta: `Ho scritto le note e aggiornato due file, giro ${i}. ` .repeat(6) }, g);
      r.handleRealEvent({ type: 'TextMessageEnd', messageId: `m${i}` }, g);
      if (i < 6) r.handleRealEvent({ type: 'RunFinished' }, g);
    }
    r.handleRealEvent({ type: 'ApprovalRequested', requestId: 'f2-app', azione: { tipo: 'shell', comando: 'npm run build -- --profilo=produzione' }, motivo: 'Chiede perché il kernel considera questa azione da confermare, anche con la sessione su «Scrive nel progetto».' }, g);
  });
  await expect(page.locator('#conversation [data-c="ApprovalCard"]')).toBeVisible();
  await page.waitForTimeout(300);
}

/* Porta lo scorrimento a `distanza` px dalla fine del contenuto e lascia decidere al prodotto se il
   tondo si vede: non tocco mai `hidden`. Torna la misura, o `{visibile:false}` se lì non si vede. */
async function misuraA(page, distanza) {
  await page.evaluate((d) => {
    const s = document.querySelector('#schermoChat .talos-conversation');
    s.scrollTop = Math.max(0, s.scrollHeight - s.clientHeight - d);
    s.dispatchEvent(new Event('scroll', { bubbles: true }));
  }, distanza);
  await page.waitForTimeout(90);
  return page.evaluate(SOVRAPPOSIZIONI);
}

for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
  for (const tema of ['dark', 'light']) {
    test(`F2 (${larghezza}x${altezza}, ${tema}) — il tondo non copre niente di toccabile, a nessuna altezza di scorrimento`, async ({ page }) => {
      await scenaLunga(page, { larghezza, altezza, tema });
      const coda = await page.evaluate(() => Math.round(parseFloat(getComputedStyle(document.querySelector('#conversation')).paddingBottom) || 0));
      const massimo = await page.evaluate(() => {
        const s = document.querySelector('#schermoChat .talos-conversation');
        return Math.round(s.scrollHeight - s.clientHeight);
      });
      /* Dalla prima altezza in cui il prodotto accende il tondo (`coda + 6`) fino in cima, a passi
         di 40 px: dodici posizioni bastano a far capitare nella striscia ogni tipo di riga. */
      const passi = [];
      for (let d = coda + 6; d <= massimo && passi.length < 12; d += 40) passi.push(d);
      expect(passi.length, `la scena non scorre abbastanza perché il tondo si accenda: coda ${coda}, scorrimento massimo ${massimo}`).toBeGreaterThan(3);

      /*
       * ⛔ Si RACCOGLIE tutto e si giudica alla fine: un `expect` dentro il giro ferma la spazzolata
       *   alla prima posizione e il rosso racconterebbe una posizione sola. Qui il rosso porta
       *   l'elenco di ciò che il tondo copriva, posizione per posizione — che è la misura chiesta.
       */
      const guai = [];
      const fuoriPosto = [];
      let accesoAlmenoUnaVolta = false;
      for (const d of passi) {
        const m = await misuraA(page, d);
        if (!m.visibile) continue;
        accesoAlmenoUnaVolta = true;
        if (m.colpiti.length) guai.push({ distanza: d, tondo: m.tondo, colpiti: m.colpiti, suiBottoniDellaScheda: m.suiBottoniDellaScheda });
        /* La regola strutturale, valida a OGNI posizione: il tondo sta a destra delle schede. */
        if (m.tondo.left < m.destraSchede) fuoriPosto.push({ distanza: d, sinistraTondo: m.tondo.left, destraSchede: m.destraSchede });
      }
      expect(accesoAlmenoUnaVolta, 'la scena non si è formata: il tondo non si è mai acceso').toBe(true);
      expect(guai, `il tondo copriva roba toccabile: ${JSON.stringify(guai)}`).toEqual([]);
      expect(fuoriPosto, `il tondo galleggiava sopra la colonna: ${JSON.stringify(fuoriPosto.slice(0, 3))} (${fuoriPosto.length} posizioni)`).toEqual([]);
    });
  }
}
