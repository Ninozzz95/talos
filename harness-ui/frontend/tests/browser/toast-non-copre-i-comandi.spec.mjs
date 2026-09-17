import { expect, test } from '@playwright/test';

/*
 * ⭐⭐⭐ BC-77 (a) — UN AVVISO NON COPRE MAI UN COMANDO.
 *
 * Trovato dal revisore GUARDANDO le foto di PO-27: in 4 foto su 20, a 1024×800, il toast
 * «Collegato di nuovo» stava SOPRA la barra del composer — sopra «Terminale», sopra il microfono e
 * sopra il pulsante che FERMA il giro. Un avviso che se ne va da solo dopo sei secondi copre, per
 * quei sei secondi, l'unico comando con cui si interrompe il prodotto.
 *
 * ⛔ La cura è di POSIZIONE, non di durata: accorciare il toast lascerebbe il difetto e lo
 *   renderebbe solo più difficile da fotografare. La regione dei toast è `position:fixed;
 *   bottom:var(--talos-space-lg)` (`styles/index.css`, `.talos-toast-region`): a 800 px di altezza
 *   il piede della chat arriva dove arriva la regione, e i due rettangoli si intersecano.
 *
 * ⭐ Ricerca fatta PRIMA di scrivere (17/09/2026):
 *   · WCAG 2.2 SC 2.4.11 «Focus Not Obscured (Minimum)», w3.org/WAI/WCAG22/Understanding/
 *     focus-not-obscured-minimum.html — «A notification implemented as sticky content … will fail
 *     this success criterion if it entirely obscures a component receiving focus». Il nostro caso è
 *     peggiore del minimo: il bottone coperto è quello che ferma il lavoro.
 *   · Carbon Design System «Notification» (carbondesignsystem.com/components/notification/usage) e
 *     Adobe Spectrum «Toast» (spectrum.adobe.com/page/toast): il toast non ostruisce mai la
 *     navigazione primaria né i comandi; si sceglie UN posto e lo si tiene.
 *   ⇒ Qui il posto resta quello del mockup (in basso a destra, l'owner l'ha già approvato il 05/09):
 *     cambia solo il FONDO, che smette di essere un numero fisso e diventa l'ingombro vero del
 *     piede della chat, misurato dal prodotto.
 *
 * ⛔ Questa prova misura RETTANGOLI, non classi: area di sovrapposizione in px² fra il toast e ogni
 *   cosa toccabile del piede. E asserisce la sua PREMESSA — se il toast non si accende o il piede
 *   non ha comandi, la prova è ROSSA, non verde a vuoto.
 */

const SOVRAPPOSIZIONI = `(() => {
  const area = (a, b) => {
    const l = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return Math.round(l * h);
  };
  const regione = document.querySelector('#regioneToast');
  const toasts = regione && !regione.hidden
    ? [...regione.querySelectorAll('.talos-toast')].filter((n) => !n.hidden && !n.dataset.demo && n.getBoundingClientRect().height > 0)
    : [];
  const piede = document.querySelector('#schermoChat .talos-chat-foot');
  const comandi = piede
    ? [...piede.querySelectorAll('button, a[href], [role="button"], textarea, input')].filter((n) => {
        const q = n.getBoundingClientRect();
        return q.width > 0 && q.height > 0 && !n.hidden && n.offsetParent !== null;
      })
    : [];
  const colpiti = [];
  for (const t of toasts) {
    const r = t.getBoundingClientRect();
    for (const n of comandi) {
      const a = area(r, n.getBoundingClientRect());
      if (a > 0) colpiti.push({ px2: a, comando: (n.getAttribute('aria-label') || n.textContent || n.id || '').trim().slice(0, 40), toast: (t.querySelector('p')?.textContent || '').trim().slice(0, 30) });
    }
  }
  return {
    toasts: toasts.length,
    comandi: comandi.length,
    colpiti,
    /* Le due misure che spiegano il rosso: dove finisce il toast più basso, dove comincia il piede. */
    fondoToast: toasts.length ? Math.round(Math.max(...toasts.map((t) => t.getBoundingClientRect().bottom))) : null,
    cimaPiede: piede ? Math.round(piede.getBoundingClientRect().top) : null,
  };
})()`;

/**
 * La scena: una sessione con un giro in corso, cioè il piede nel suo stato più POPOLATO
 * (la striscia con «Ferma», le pillole, il microfono, l'invio). È lo stato della foto del revisore.
 */
async function scenaConGiro(page, { larghezza, altezza, tema }) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/bc77-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc77-uno', 'workspace', 'BC77', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 10, input: { consegna: 'Aggiorna il ledger con i numeri veri' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'TextMessageStart', messageId: 'm1' }, g);
    r.handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: 'Sto leggendo i file del progetto. '.repeat(8) }, g);
  });
  await expect(page.locator('#schermoChat .talos-chat-foot')).toBeVisible();
  await page.waitForTimeout(200);
}

/**
 * Accende il toast «Collegato di nuovo» per la strada VERA del prodotto: il browser dice «offline»
 * (sospetto), la sorveglianza batte su `/api/v1/health`, il server risponde, e lo stato passa per
 * `ricollegato` — che è esattamente il punto in cui `app.js` chiama `toast(...)`.
 * ⛔ Nessuna rotta finta e nessuna scrittura diretta nel DOM: un toast messo a mano non
 *   proverebbe che il prodotto lo mette dove dico io.
 */
async function accendiIlToastVero(page) {
  await page.evaluate(() => { window.dispatchEvent(new Event('offline')); });
  await page.locator('#regioneToast .talos-toast:not([data-demo])').first().waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(150);
}

/*
 * ⭐⭐⭐ BC-77 (a), IL TETTO — chiesto dal revisore il 17/09 e misurato prima di scriverlo.
 *
 * Il pavimento da solo non basta. Il piede della chat non ha un'altezza massima piccola: il
 * terminale in basso vive DENTRO di lui, e il composer cresce col testo. Misurato a 1024×800 col
 * terminale aperto e quaranta righe nel composer, col pavimento senza tetto: piede alto **448 px**,
 * e la pila di **tre** toast arrivava con la cima a **y=32** contro il bordo inferiore della testata
 * a **60** — cioè 28 px sopra, addosso al nome della sessione e alle quattro viste.
 *
 * ⇒ Un avviso che smette di coprire i comandi in basso e comincia a coprire quelli in alto non è
 *   una cura. Questa prova misura RETTANGOLI in entrambe le direzioni: la pila non deve toccare la
 *   testata, e non deve nemmeno uscire dalla finestra.
 */
async function pilaAlMassimo(page, { tema }) {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata: la app parte lo stesso */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/bc77-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bc77-pila', 'workspace', 'Pila', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 10, input: { consegna: 'Scrivi un file' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'glm-5.3-flash' } }, g);
    /* Una scrittura vera: serve ad accendere «Copia i diff», che è la porta con cui si alza una
       pila di toast senza toccare il componente — il suo gestore è quello del prodotto. */
    r.handleRealEvent({ type: 'StateDelta', _sequenza: 11, delta: [{ op: 'add', path: '/file/src/uno.mjs', value: 'a\nb\n' }] }, g);
    /* Il composer nel suo stato più alto: quaranta righe di testo. */
    const campo = document.querySelector('#composerInput');
    if (campo) { campo.value = 'riga\n'.repeat(40); campo.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  await page.waitForTimeout(200);
  /* Il terminale in basso, che sta DENTRO il piede: è ciò che lo fa diventare alto sul serio. */
  await page.evaluate(() => document.querySelector('#pillTerminale')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => { for (let i = 0; i < 3; i += 1) document.querySelector('#copyAllDiffs')?.click(); });
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const regione = document.querySelector('#regioneToast');
    const toasts = regione && !regione.hidden ? [...regione.querySelectorAll('.talos-toast')].filter((n) => !n.hidden && !n.dataset.demo) : [];
    const rects = toasts.map((t) => t.getBoundingClientRect());
    const piede = document.querySelector('#schermoChat .talos-chat-foot')?.getBoundingClientRect();
    const testata = document.querySelector('.talos-screen:not([hidden]) .talos-topbar')?.getBoundingClientRect();
    const area = (a, b) => Math.round(Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)));
    return {
      terminaleAperto: !document.querySelector('#pannelloTerminale')?.hidden,
      altezzaPiede: piede ? Math.round(piede.height) : null,
      quantiToast: toasts.length,
      cimaPila: rects.length ? Math.round(Math.min(...rects.map((r) => r.top))) : null,
      fondoPila: rects.length ? Math.round(Math.max(...rects.map((r) => r.bottom))) : null,
      fondoTestata: testata ? Math.round(testata.bottom) : null,
      sullaTestata: testata ? rects.reduce((s, r) => s + area(r, testata), 0) : 0,
      /* ⛔ Le due regole devono valere INSIEME: il tetto abbassa il pavimento, e abbassandolo
         potrebbe ributtare la pila sui comandi che la cura di partenza le aveva tolto da sotto.
         Qui si contano anche quelli — se un giorno la scelta diventasse «o l'una o l'altra», il
         numero lo direbbe invece di lasciarlo scoprire a chi guarda una foto. */
      suiComandi: [...(document.querySelector('#schermoChat .talos-chat-foot')?.querySelectorAll('button, a[href], [role="button"], textarea, input') || [])]
        .filter((n) => { const q = n.getBoundingClientRect(); return q.width > 0 && q.height > 0 && n.offsetParent !== null; })
        .map((n) => ({ px2: rects.reduce((s, r) => s + area(r, n.getBoundingClientRect()), 0), comando: (n.getAttribute('aria-label') || n.textContent || n.id || '').trim().slice(0, 40) }))
        .filter((x) => x.px2 > 0),
      altezzaFinestra: window.innerHeight,
      varFondo: getComputedStyle(document.documentElement).getPropertyValue('--talos-toast-fondo').trim(),
    };
  });
}

for (const tema of ['dark', 'light']) {
  test(`BC77-A-TETTO (1024x800, ${tema}) — col terminale aperto e il composer pieno, tre toast non salgono sulla testata`, async ({ page }) => {
    const m = await pilaAlMassimo(page, { tema });
    console.log(`MISURA-BC77-TETTO ${tema} = ${JSON.stringify(m)}`);
    /* Le PREMESSE: senza il terminale aperto, senza un piede davvero alto e senza la pila piena
       questa prova misurerebbe una scena comoda e passerebbe per il motivo sbagliato. */
    expect(m.terminaleAperto, 'la scena non si è formata: il terminale in basso non si è aperto').toBe(true);
    expect(m.altezzaPiede, 'la scena non si è formata: il piede non è alto').toBeGreaterThan(300);
    expect(m.quantiToast, 'la scena non si è formata: la pila non è piena').toBe(3);
    expect(m.sullaTestata, `la pila copre la testata di ${m.sullaTestata} px² (cima ${m.cimaPila}, testata fino a ${m.fondoTestata})`).toBe(0);
    expect(m.cimaPila, 'e non esce dalla finestra dall’alto').toBeGreaterThanOrEqual(0);
    expect(m.suiComandi, `il tetto ha ributtato la pila sui comandi: ${JSON.stringify(m.suiComandi)}`).toEqual([]);
  });
}

for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
  for (const tema of ['dark', 'light']) {
    test(`BC77-A (${larghezza}x${altezza}, ${tema}) — il toast non copre nessun comando del piede`, async ({ page }) => {
      await scenaConGiro(page, { larghezza, altezza, tema });
      await accendiIlToastVero(page);
      const m = await page.evaluate(SOVRAPPOSIZIONI);
      console.log(`MISURA-BC77A ${larghezza}x${altezza} ${tema} = ${JSON.stringify(m)}`);
      /* La PREMESSA, prima del verdetto: senza toast acceso e senza comandi nel piede questa prova
         passerebbe a vuoto, e un verde così non direbbe niente. */
      expect(m.toasts, 'la scena non si è formata: nessun toast acceso').toBeGreaterThan(0);
      expect(m.comandi, 'la scena non si è formata: il piede della chat non ha comandi toccabili').toBeGreaterThan(3);
      expect(m.colpiti, `il toast copriva dei comandi: ${JSON.stringify(m.colpiti)} (fondo del toast ${m.fondoToast}, cima del piede ${m.cimaPiede})`).toEqual([]);
    });
  }
}

/*
 * ⛔⛔ 17/09/2026 notte — IL COMANDO CHE GALLEGGIA SOPRA IL PIEDE. Regressione entrata con la fusione di BC-77 e
 *   trovata dal giro INTERO delle prove browser (CHAT-FONDO-01), non da queste: alzato sopra il piede, il toast
 *   finiva esattamente sul pulsante «Torna in fondo alla conversazione», che nasce scorrendo in su e sta appena
 *   sopra il piede, a destra. Le prove qui sopra contavano i soli comandi DENTRO il piede — cioè una misura
 *   ristretta a dove ci si aspettava il difetto. Questa mette in scena il caso per nome.
 */
for (const tema of ['dark', 'light']) {
  test(`BC77-A-FONDO (1024x800, ${tema}) — il toast non copre «Torna in fondo alla conversazione»`, async ({ page }) => {
    await scenaConGiro(page, { larghezza: 1024, altezza: 800, tema });
    await page.evaluate(() => {
      const r = window.__talosHarnessUiRuntime;
      r.handleRealEvent({ type: 'TextMessageContent', messageId: 'm1', delta: Array.from({ length: 70 }, (_, i) => `Paragrafo ${i + 1}: il progetto conserva la cronologia.\n\n`).join('') }, r.realSessionState.generation);
    });
    await page.locator('#schermoChat .talos-conversation').hover();
    await page.mouse.wheel(0, -20000);
    const pulsante = page.getByRole('button', { name: 'Torna in fondo alla conversazione', exact: true });
    await expect(pulsante, 'la scena non si è formata: il pulsante non è comparso').toBeVisible();
    await accendiIlToastVero(page);
    const m = await page.evaluate(() => {
      const b = document.querySelector('#chatTornaInFondo').getBoundingClientRect();
      const toasts = [...document.querySelectorAll('#regioneToast .talos-toast')].filter((n) => !n.hidden && !n.dataset.demo).map((n) => n.getBoundingClientRect());
      const area = (p, q) => Math.round(Math.max(0, Math.min(p.right, q.right) - Math.max(p.left, q.left)) * Math.max(0, Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top)));
      const centro = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
      return { toasts: toasts.length, coperto: toasts.reduce((s, r) => s + area(r, b), 0), cimaPulsante: Math.round(b.top), fondoToast: toasts.length ? Math.round(Math.max(...toasts.map((r) => r.bottom))) : null, centroSulPulsante: document.querySelector('#chatTornaInFondo').contains(centro) };
    });
    console.log(`MISURA-BC77-FONDO ${tema} = ${JSON.stringify(m)}`);
    expect(m.toasts, 'la scena non si è formata: nessun toast').toBeGreaterThan(0);
    expect(m.coperto, `il toast copre il pulsante di ${m.coperto} px² (fondo toast ${m.fondoToast}, cima pulsante ${m.cimaPulsante})`).toBe(0);
    expect(m.centroSulPulsante, 'al centro del pulsante deve esserci il pulsante').toBe(true);
  });
}
