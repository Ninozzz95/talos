/*
 * ⛔⛔ I NUMERI SULLE SCHEDE «AGENTI» E «PROCESSI» — owner, 20/09/2026: «badge counter in tempo reale
 * in sidebar destra tab agenti (badge numero di agenti attivi) e processi (numero processi attivi)».
 *
 * ⛔ PERCHÉ QUESTA PROVA GUARDA PROPRIO QUESTO, e sono tre cose che una prova «di comodo» non vede:
 *
 *  1. **Il numero è quello GIUSTO**, non solo «c'è un numero»: due agenti in corso su tre, un
 *     processo vivo su due. Un badge che dice `3` quando gli attivi sono `2` è peggio di un badge
 *     assente, perché sembra un'informazione.
 *  2. ⭐ **Il numero è vero A SCHEDA CHIUSA.** È la parola «in tempo reale» dell'owner, ed è la
 *     ragione per cui il badge NON si scrive dentro `aggiornaInspector`: quella funzione **salta le
 *     schede nascoste** (`schedaDaSaltare`), e un numero scritto là dentro resterebbe fermo fino
 *     all'apertura. Qui si manda un evento con la scheda chiusa e si pretende che il numero cambi
 *     **senza aprire niente**: è l'unica asserzione che distingue «in tempo reale» da «aggiornato
 *     quando lo guardi».
 *  3. **A zero il badge NON c'è** — non uno `0` accanto alla parola. È la regola del componente
 *     canonico (`impostaConteggioScheda`: `<= 0` ⇒ toglie, e toglie anche lo spazio che lo separa).
 */
import { expect, test } from '@playwright/test';

const FIGLIE = [
  /* In corso: `conclusa: false` ⇒ `statoDelega` = 'in-corso', che è il filtro «Attivi». */
  { sessionId: 'bdg-a', task: 'Compito: leggi il registro', taskCorto: 'leggi il registro', conclusa: false, interrotta: false, avviataAlle: new Date().toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'read-only', collisioni: [], esitoDelega: null, attivita: { file: [], fileTagliati: 0, attrezzoCorrente: 'leggi', chiamate: 1, passi: [], passiTagliati: 0 } },
  /* Conclusa: non deve contare. */
  { sessionId: 'bdg-b', task: 'Compito: controlla i test', taskCorto: 'controlla i test', conclusa: true, interrotta: false, avviataAlle: new Date().toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'read-only', collisioni: [], esitoDelega: 'I test passano tutti.', attivita: { file: [], fileTagliati: 0, attrezzoCorrente: null, chiamate: 1, passi: [], passiTagliati: 0 } },
  /*
   * ⛔⛔ FERMA IN ATTESA DI UN'APPROVAZIONE — e NON deve contare fra gli «attivi».
   *   Questo agente esiste per UNA ragione, ed è la più importante di questa prova: senza di lui la
   *   prova non distingue «attivo» da «in attesa», e ho verificato che non lo distingue — contando
   *   anche `attesa` i sei casi restavano **tutti verdi**. `attesa` è un filtro **separato** nella
   *   scheda («In attesa»), e il numero sulla scheda deve dire la stessa cosa del filtro «Attivi»:
   *   contarlo qui farebbe dire al badge un numero che il filtro non mostra.
   */
  { sessionId: 'bdg-w', task: 'Compito: applica la patch', taskCorto: 'applica la patch', conclusa: false, interrotta: false, inAttesaApprovazione: true, avviataAlle: new Date().toISOString(), modello: 'z-ai/glm-5.3-flash', permessi: 'workspace-write', collisioni: [], esitoDelega: null, attivita: { file: [], fileTagliati: 0, attrezzoCorrente: 'scrivi', chiamate: 1, passi: [], passiTagliati: 0 } },
];

/** Il badge di una scheda, come lo si vede: il numero, o `null` se il badge non c'è. */
const badge = (page, rail) => page.locator(`#railTabs [data-rail="${rail}"] .talos-tabs__count`);
/*
 * ⛔ IL TESTO DELLA SCHEDA, **GREZZO** — e il "grezzo" è il punto.
 *   La prima stesura faceva `.replace(/\s+/g,' ').trim()`, cioè **normalizzava via proprio lo spazio
 *   che l'asserzione diceva di difendere**: `toBe('Agenti')` non poteva fallire nemmeno con lo
 *   spazio di troppo rimasto dietro a un badge tolto. Trovato dal revisore avversario il 20/09/2026.
 *   ⇒ Qui non si normalizza: si legge il `textContent` come sta nel DOM.
 */
const testo = (page, rail) => page.locator(`#railTabs [data-rail="${rail}"]`).evaluate((n) => n.textContent || '');

/** Le etichette che la riga di un processo disegna quando è VIVA (vedi `STATI_PROCESSO`). */
const ETICHETTE_VIVE = ['In coda', 'In avvio', 'In corso', 'In attesa'];
/** Quante righe della lista Processi si dichiarano VIVE, lette dall'etichetta DIPINTA. */
const righeVive = (page) => page.locator('#railProcessi .talos-process__stato-testo').evaluateAll(
  (nodi, vive) => nodi.filter((n) => vive.includes((n.textContent || '').trim())).length,
  ETICHETTE_VIVE,
);

async function scena(page, { tema = 'dark', larghezza = 1440, altezza = 900 } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* finestra privata */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/bdg-*/events*', (r) => r.fulfill({ contentType: 'text/event-stream', body: '' }));
  await page.route('**/api/v1/sessions/bdg-uno/children', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { figli: FIGLIE } }) }));
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione('bdg-uno', 'workspace', 'BDG', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    const g = r.realSessionState.generation;
    r.handleRealEvent({ type: 'RunStarted', _sequenza: 9701, input: { consegna: 'Dividi il lavoro' }, contesto: { cartella: 'C:\\progetti\\talos-prova', modello: 'glm-5.3-flash' } }, g);
    r.handleRealEvent({ type: 'ToolCallStart', toolCallId: 'bdg-d1', toolCallName: 'delega_sottotask', _sequenza: 9702 }, g);
    r.handleRealEvent({ type: 'ToolCallResult', toolCallId: 'bdg-d1', content: 'ok', _sequenza: 9703 }, g);
  });
  /* ⛔ La colonna destra si apre, ma **la scheda Agenti NO**: la scena deve nascere con le schede
     chiuse, o il punto 2 di questa prova non proverebbe niente. */
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await expect(page.locator('#railTabs')).toBeVisible();
  /*
   * ⛔ LA SCENA È FORMATA QUANDO IL NUMERO C'È — e non si può aspettare la lista, perché con la
   *   scheda CHIUSA la lista **non si disegna affatto** (`schedaDaSaltare`: una scheda `hidden` si
   *   segna sporca e si rifà quando la si apre). È esattamente il motivo per cui il badge si scrive
   *   fuori da quella funzione: il numero è vero anche quando la scheda non lo è.
   *   ⇒ Qui il badge **è** il segnale che i dati sono arrivati: `FIGLIE` ha un agente in corso, e
   *     finché il numero non compare la scena non è pronta.
   */
  await expect(badge(page, 'agenti'), 'la scena non si è formata: le figlie non sono arrivate, o il badge non si scrive').toHaveText('1', { timeout: 10_000 });
}

const mandaAgente = (page, agent) => page.evaluate((a) => {
  const r = window.__talosHarnessUiRuntime;
  r.handleRealEvent({ type: 'CUSTOM', name: 'talos.agenti', value: { version: 1, sessionId: 'bdg-uno', parentId: 'bdg-uno', childId: a.sessionId, reason: a.conclusa ? 'completed' : 'created', agent: { ...a, padreId: 'bdg-uno' } } }, r.realSessionState.generation);
}, agent);

const mandaProcesso = (page, { id, fase, comando = 'git status --short' }) => page.evaluate(({ id, fase, comando }) => {
  const r = window.__talosHarnessUiRuntime;
  const g = r.realSessionState.generation;
  /* ⛔ `_sequenza` CRESCE FRA UNA CHIAMATA E L'ALTRA, non riparte da capo: rilanciandola da 20000 a
     ogni `page.evaluate` gli eventi del secondo processo arrivavano con numeri già usati, e il
     registro li trattava come fuori ordine — la scena si fermava a metà e la colpa sembrava del
     badge. Il contatore vive sulla pagina, dove vivono gli eventi. */
  const evento = (e) => r.handleRealEvent({ ...e, _sequenza: (window.__bdgSeq = (window.__bdgSeq || 20000) + 1) }, g);
  if (fase === 'inizio') {
    evento({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'shell', ricevutoA: 1000, giro: 1 });
    evento({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ comando }) });
  } else {
    evento({ type: 'ToolCallResult', toolCallId: id, ricevutoA: 2000, errore: false, uscita: 0, content: 'exit 0' });
  }
}, { id, fase, comando });

test.use({ locale: 'it-IT' });

test("BADGE-AGENTI — il numero è quello degli ATTIVI, ed è vero anche a scheda chiusa", async ({ page }) => {
  await scena(page);
  /* 1. Tre agenti: uno in corso, uno concluso, uno FERMO IN ATTESA. Il badge dice 1 — non 2, non 3. */
  await expect(badge(page, 'agenti'), "il badge della scheda Agenti non dice il numero degli agenti IN CORSO (né l'attesa né le concluse contano)").toHaveText('1');
  await expect(page.locator('#railTabs [data-rail="contesto"]'), 'la scena deve nascere con le schede CHIUSE').toHaveAttribute('aria-selected', 'true');

  /* 2. ⭐ ARRIVA UN SECONDO AGENTE, e la scheda resta CHIUSA: il numero deve cambiare lo stesso. */
  await mandaAgente(page, { ...FIGLIE[0], sessionId: 'bdg-c', taskCorto: 'secondo agente in corso' });
  await expect(badge(page, 'agenti'), 'il badge non si aggiorna mentre la scheda è chiusa: non è «in tempo reale», è «aggiornato quando lo guardi»').toHaveText('2');
  await expect(page.locator('#railTabs [data-rail="agenti"]')).toHaveAttribute('aria-selected', 'false');

  /* 3. Il numero e la LISTA dicono la stessa cosa: aprendo la scheda, il filtro «Attivi» ne mostra 2,
        e l'agente in attesa sta nel SUO filtro — sono due cose separate, e il badge conta la prima. */
  await page.locator('#railTabs [data-rail="agenti"]').click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]')).toHaveCount(4);
  await page.locator('#railAgenti').getByRole('button', { name: 'Attivi' }).click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]'), 'il badge dice un numero che la lista «Attivi» non mostra').toHaveCount(2);
  await page.locator('#railAgenti').getByRole('button', { name: 'In attesa' }).click();
  await expect(page.locator('#railAgenti [data-c="AgentRow"]'), 'l\'agente in attesa non è nel suo filtro: la scena non prova il confine').toHaveCount(1);

  /* 4. Uno dei due finisce: il badge scende a 1, sempre senza riaprire niente. */
  await page.locator('#railTabs [data-rail="contesto"]').click();
  await mandaAgente(page, { ...FIGLIE[0], sessionId: 'bdg-c', taskCorto: 'secondo agente in corso', conclusa: true, ultimoEsito: 'ok' });
  await expect(badge(page, 'agenti')).toHaveText('1');

  /* 5. E quando non c'è più NESSUN agente in corso il badge SPARISCE — anche se uno è ancora in
        attesa: «in attesa» non è «attivo», ed è il confine che questa prova difende. */
  await mandaAgente(page, { ...FIGLIE[0], sessionId: 'bdg-a', taskCorto: 'leggi il registro', conclusa: true, ultimoEsito: 'ok' });
  await expect(badge(page, 'agenti'), 'a zero agenti IN CORSO il badge deve SPARIRE — e l\'agente in attesa non lo tiene in vita').toHaveCount(0);
  expect(await testo(page, 'agenti'), 'togliendo il badge resta uno spazio di troppo nell\'etichetta').toBe('Agenti');
});

test('BADGE-PROCESSI — conta i processi VIVI, e si aggiorna a scheda chiusa', async ({ page }) => {
  await scena(page);
  /* Un processo vivo e uno finito: il badge dice 1. */
  await mandaProcesso(page, { id: 'bdg-p1', fase: 'inizio' });
  await mandaProcesso(page, { id: 'bdg-p2', fase: 'inizio', comando: 'ls -la' });
  await mandaProcesso(page, { id: 'bdg-p2', fase: 'fine' });
  await expect(badge(page, 'processi'), 'il badge dei Processi non conta i processi vivi').toHaveText('1');
  await expect(page.locator('#railTabs [data-rail="contesto"]')).toHaveAttribute('aria-selected', 'true');

  /* ⭐ Il secondo finisce: il badge scende a ZERO e il badge sparisce — a scheda chiusa. */
  await mandaProcesso(page, { id: 'bdg-p1', fase: 'fine' });
  await expect(badge(page, 'processi'), 'a zero processi vivi il badge deve sparire').toHaveCount(0);
  expect(await testo(page, 'processi')).toBe('Processi');

  /* E risale: un processo nuovo riporta il numero, sempre senza aprire la scheda. */
  await mandaProcesso(page, { id: 'bdg-p3', fase: 'inizio', comando: 'node --test' });
  await expect(badge(page, 'processi'), 'il badge non torna quando arriva un processo nuovo a scheda chiusa').toHaveText('1');
  await expect(page.locator('#railTabs [data-rail="processi"]')).toHaveAttribute('aria-selected', 'false');

  /*
   * La lista che si apre dice la stessa cosa — e si legge l'ETICHETTA DIPINTA, non il `dataset`.
   * ⛔ La prima stesura contava `[data-stato="in-corso"]`, e il revisore ha mostrato che era
   *   **vacua**: nella scena tutte le righe sono `in-corso`, quindi il conteggio coincideva col
   *   badge per costruzione e non poteva smentirlo. L'etichetta invece nasce da `statoProcesso`
   *   (normalizzazione compresa): se il criterio del badge e quello della riga divergono, qui si
   *   vede.
   */
  await page.locator('#railTabs [data-rail="processi"]').click();
  await expect(page.locator('#railProcessi [data-c="ProcessRow"]')).toHaveCount(3);
  expect(await righeVive(page), 'il badge dice 1 processo vivo e la lista ne disegna un altro numero: i due non leggono lo stesso criterio').toBe(1);
});

for (const tema of ['dark', 'light']) {
  for (const [larghezza, altezza] of [[1440, 900], [1024, 800]]) {
    test(`BADGE-LARGHEZZA (${tema}, ${larghezza}) — i numeri non spingono le schede fuori dalla colonna`, async ({ page }) => {
      await scena(page, { tema, larghezza, altezza });
      /* Due badge ACCESI insieme: è il caso peggiore per la larghezza, ed è il caso vero. */
      await mandaAgente(page, { ...FIGLIE[0], sessionId: 'bdg-c', taskCorto: 'secondo agente' });
      await mandaProcesso(page, { id: 'bdg-p1', fase: 'inizio' });
      await expect(badge(page, 'agenti')).toHaveText('2');
      await expect(badge(page, 'processi')).toHaveText('1');

      const m = await page.locator('#railTabs').evaluate((n) => ({
        clientWidth: n.clientWidth,
        scrollWidth: n.scrollWidth,
        schede: [...n.querySelectorAll('.talos-tabs__tab')].map((b) => {
          const r = b.getBoundingClientRect();
          return { testo: (b.textContent || '').replace(/\s+/g, ' ').trim(), sinistra: Math.round(r.left), destra: Math.round(r.right), largo: Math.round(r.width) };
        }),
      }));
      console.log(`MISURA-BADGE-LARGHEZZA ${tema} ${larghezza} = ${JSON.stringify(m)}`);

      /* 1. Le schede ci stanno: la lista non scorre e nessuna scheda esce dalla colonna. */
      expect(m.scrollWidth, `la lista delle schede sborda: ${m.scrollWidth} px di contenuto su ${m.clientWidth} visibili`).toBeLessThanOrEqual(m.clientWidth + 1);
      const colonna = await page.locator('.talos-inspector').boundingBox();
      for (const s of m.schede) {
        expect(s.destra, `la scheda «${s.testo}» esce dalla colonna a destra (${s.destra} > ${Math.round(colonna.x + colonna.width)})`).toBeLessThanOrEqual(Math.round(colonna.x + colonna.width) + 1);
        expect(s.largo, `la scheda «${s.testo}» è larga ${s.largo} px`).toBeGreaterThan(0);
      }

      /* 2. ⛔ E IL NUMERO NON MANGIA L'ETICHETTA: dentro la scheda si legge la parola E il numero. */
      expect(m.schede.map((s) => s.testo)).toEqual(['Contesto', 'File', 'Agenti 2', 'Processi 1']);
    });
  }
}
