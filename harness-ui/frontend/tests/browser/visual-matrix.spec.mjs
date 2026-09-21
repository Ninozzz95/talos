import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const scenarios = [
  ['empty-1024x768', { width: 1024, height: 768 }, 'empty'],
  ['empty-1440x900', { width: 1440, height: 900 }, 'empty'],
  ['empty-2560x1080', { width: 2560, height: 1080 }, 'empty'],
  ['active-chat-1440x900', { width: 1440, height: 900 }, 'active'],
  ['approval-pending-1440x900', { width: 1440, height: 900 }, 'approval'],
  ['long-content-1280x800', { width: 1280, height: 800 }, 'long'],
  ['dashboard-1440x900', { width: 1440, height: 900 }, 'dashboard'],
  ['settings-1440x900', { width: 1440, height: 900 }, 'settings'],
  ['model-lab-1440x900', { width: 1440, height: 900 }, 'model-lab'],
  ['terminal-1440x900', { width: 1440, height: 900 }, 'terminal'],
  ['capabilities-1440x900', { width: 1440, height: 900 }, 'capabilities'],
  ['reduced-motion-1440x900', { width: 1440, height: 900 }, 'reduced-motion'],
  ['settings-chat-1440x900', { width: 1440, height: 900 }, 'settings-chat'],
  ['chat-standard-1920x1080', { width: 1920, height: 1080 }, 'chat-standard'],
  ['chat-full-width-1920x1080', { width: 1920, height: 1080 }, 'chat-full-width'],
  ['inspector-wide-1920x1080', { width: 1920, height: 1080 }, 'inspector-wide'],
  ['inspector-clamped-1200x900', { width: 1200, height: 900 }, 'inspector-clamped'],
  ['tool-lifecycle-running-1440x900', { width: 1440, height: 900 }, 'tool-running'],
  ['tool-lifecycle-complete-1440x900', { width: 1440, height: 900 }, 'tool-complete'],
  ['waiting-loader-1440x900', { width: 1440, height: 900 }, 'waiting-loader'],
  ['composer-standard-1440x900', { width: 1440, height: 900 }, 'composer-standard'],
  ['composer-classic-1440x900', { width: 1440, height: 900 }, 'composer-classic'],
  ['composer-compact-1440x900', { width: 1440, height: 900 }, 'composer-compact'],
  ['compact-390x844', { width: 390, height: 844 }, 'empty'],
];

const outputDir = resolve(process.cwd(), 'artifacts', 'visual-audit-2026-09-01');

async function injectConversation(page, kind) {
  if (!['active', 'approval', 'long', 'full-width', 'chat-standard'].includes(kind)) return;
  await page.evaluate((variant) => {
    const conversation = document.querySelector('#conversation');
    conversation.replaceChildren();
    const widthComparison = variant === 'full-width' || variant === 'chat-standard';
    if (widthComparison) {
      const shortUser = document.createElement('article');
      shortUser.className = 'message user-message';
      shortUser.innerHTML = '<div class="message-bubble">Ci sei?</div>';
      conversation.appendChild(shortUser);
    }
    const user = document.createElement('article');
    user.className = 'message user-message';
    const userBubble = document.createElement('div');
    userBubble.className = 'message-bubble';
    userBubble.textContent = widthComparison
      ? 'Analizza l’intero workspace, confronta ogni dipendenza, verifica i contratti pubblici e prepara una risposta completa. Includi i rischi di regressione, le prove sintetiche, le verifiche reali e le fonti primarie consultate. Concludi con una consegna esplicita che renda misurabile la larghezza massima della bolla utente senza cambiare il composer.'
      : variant === 'long'
      ? 'Verifica una risposta con percorsi e codice molto lunghi.'
      : 'Rifinisci la superficie desktop e verifica ogni stato operativo.';
    user.appendChild(userBubble);
    const assistant = document.createElement('article');
    assistant.className = 'message assistant-message';
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    const paragraph = document.createElement('p');
    paragraph.textContent = variant === 'long'
      ? 'Percorso estremamente lungo senza spazi '.repeat(80)
      : 'La superficie è pronta per la verifica visuale e funzionale.';
    copy.appendChild(paragraph);
    if (variant === 'long') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = `const extremelyLongIdentifier = "${'x'.repeat(240)}";`;
      pre.appendChild(code);
      copy.appendChild(pre);
    }
    assistant.appendChild(copy);
    conversation.append(user, assistant);
    if (variant === 'approval') {
      const approval = document.createElement('section');
      approval.className = 'approval-card';
      const approvalIcon = document.createElement('span');
      approvalIcon.className = 'approval-icon';
      approvalIcon.textContent = '⏸';
      const approvalCopy = document.createElement('div');
      approvalCopy.className = 'assistant-copy';
      approvalCopy.textContent = 'Conferma richiesta: il prossimo passaggio attende il tuo consenso.';
      const approvalActions = document.createElement('div');
      approvalActions.className = 'sheet-actions';
      approvalActions.append(document.createElement('button'), document.createElement('button'));
      approval.append(approvalIcon, approvalCopy, approvalActions);
      conversation.appendChild(approval);
    }
  }, kind);
}

/*
 * ⛔ 18/09/2026 — LA NAVIGAZIONE DELLA MATRICE ERA QUELLA DI PRIMA DEL MOCKUP, e la meta no.
 * Misurato il 18/09/2026 (sonda-matrix.mjs, porta 4197) sulla dist servita: `[data-open-view]` è
 * **0 nodi** (una volta sola come stringa dentro `app.js`, senza corrispondenza nel DOM), mentre il
 * contratto vivo è `[data-vaia]` — 33 nodi, 10 visibili, 27 occorrenze in `index.html`. E i nomi
 * delle viste NON sono cambiati: `#schermoImpostazioni` porta `data-view="settings"`, `#schermoChat`
 * `data-view="chat"`, `#schermoTerminale` `data-view="terminal"`, `#schermoBoard`
 * `data-view="dashboard"`. Il clic su `[data-vaia="impostazioni"]` porta `#schermoHome` a `hidden` e
 * `#schermoImpostazioni` a visibile (stessa sonda). ⇒ Si sposta la PORTA, non la meta.
 * `[data-mode]` invece regge ancora: 19 nodi, valori chat/terminal/diff/browser/dashboard, e
 * `clickDirect` usa `dispatchEvent`, che non chiede la visibilità.
 *
 * ⛔ E `[data-mode="chat"|"terminal"]` NON è più univoco: Playwright lo rifiuta in strict mode con
 * **5** elementi per `terminal` — le quattro strisce di schede (`#schermoChat`, `#schermoTerminale`,
 * `#schermoReview`, `#schermoBrowser`, tutte con `class="talos-tabs__tab mode-tab"`) più la copia
 * LEGACY dentro `#talos-legacy`. Le stesse quattro portano anche `data-vaia="terminale"`, quindi
 * nemmeno quello è univoco da solo. La porta univoca è la voce della barra laterale, che ha la
 * classe `talos-nav-item` (le schede di modo no): `.talos-nav-item[data-vaia="<vista>"]` — è la
 * stessa forma già usata da `workspace-chooser.spec.mjs` per la chat. Le viste con una voce nella
 * barra laterale sono home, chat, board (lo `#schermoBoard` del dashboard ha `data-view="dashboard"`)
 * e le altre del mockup; **terminale, review e browser no**: per quelle la porta è la scheda di modo
 * dentro la striscia di uno schermo (misurato, sonda-matrix6.mjs, porta 4197: i nodi
 * `data-vaia="terminale"` sono quattro schede `talos-tabs__tab mode-tab`, una per striscia, e il clic
 * su `#schermoChat [data-vaia="terminale"]` porta `#schermoTerminale` a vista attiva — altezza 900).
 */
async function applyScenario(page, kind) {
  const clickDirect = async (selector) => page.locator(selector).dispatchEvent('click');
  const vaiA = (vista) => clickDirect(`.talos-nav-item[data-vaia="${vista}"]`);
  if (kind === 'dashboard') {
    await vaiA('board');
  } else if (kind === 'settings' || kind === 'model-lab' || kind === 'settings-chat') {
    await clickDirect('[data-vaia="impostazioni"]');
    if (kind === 'model-lab') {
      /*
       * ⛔ 18/09/2026 — `[data-settings-tab="models"]` è AMBIGUO e Playwright lo rifiuta (strict mode
       * violation: 2 elementi — la voce di navigazione `#setting-tab-models` in `.settings-nav__list`,
       * visibile, e una copia LEGACY dentro `#talos-legacy`, nascosta). Misurato il 18/09/2026
       * (sonda-matrix5.mjs, porta 4197): le voci canoniche sono `.settings-nav__item` con
       * `id="setting-tab-<scheda>"` — appearance, chat, tools, memoria, privacy, models, providers,
       * costi, workspace, account — tutte visibili; le copie legacy non hanno id. ⇒ Si punta l'id.
       */
      await clickDirect('#setting-tab-models');
      await clickDirect('#modelLabHfTab');
    } else if (kind === 'settings-chat') {
      await clickDirect('#setting-tab-chat');
    }
  } else if (kind === 'chat-standard') {
    /* ⛔ 18/09/2026 — «LA v2 ATTERRA SULLA HOME»: senza un gesto la chat non è la vista attiva, e la
     * metrica `activeView` di questo scenario valeva 'home' invece di 'chat'. Misurato (sonda-matrix4.mjs,
     * porta 4197): dopo il clic su `[data-vaia="chat"]` `#schermoChat` è la `.view-pane.active` con
     * `data-view="chat"`. È lo stesso helper usato da `workspace-chooser.spec.mjs` e `baseline-shell.spec.mjs`. */
    await vaiA('chat');
    await injectConversation(page, 'chat-standard');
  } else if (kind === 'chat-full-width') {
    await clickDirect('[data-vaia="impostazioni"]');
    await clickDirect('#setting-tab-chat');
    /*
     * ⛔ 18/09/2026 — IL GESTO VERO È SULLA FACCIA A TEMA, NON SUL CONTROLLO NATIVO.
     * `#chatFullWidthToggle` è un `<input type="checkbox">` con `role="switch"`, `aria-hidden="true"`,
     * `tabindex="-1"` e `data-calm-source`: è il controllo NATIVO dietro la faccia, 0×0, e
     * `check({ force: true })` NON lo scavalca (misurato il 18/09/2026, porta 4197: «Element is not
     * visible» anche con force, dopo «scrolling into view if needed»).
     * ⇒ La faccia che la persona vede e preme è `button#chatFullWidthToggle--calm.calm-check[role="switch"]`
     * (42×25) dentro `.settings-field-control` — misurato il 18/09/2026 con sonda-matrix8.mjs, porta 4197.
     * Il clic su quella fa scattare davvero il controllo: misurato con sonda-matrix9.mjs —
     * `checked` da `false` a `true` e `aria-checked` a `"true"`.
     */
    await page.locator('#chatFullWidthToggle--calm').click();
    await vaiA('chat');
    await injectConversation(page, 'full-width');
  } else if (kind === 'inspector-wide' || kind === 'inspector-clamped') {
    await page.evaluate(() => localStorage.setItem('talos-harness-panel-widths', JSON.stringify({ sessions: 292, inspector: 680 })));
    await page.reload();
    await injectConversation(page, 'active');
  } else if (kind === 'terminal') {
    await clickDirect('#schermoChat [data-vaia="terminale"]');
  } else if (kind === 'capabilities') {
    await clickDirect('#manageCapabilitiesBtn');
  } else if (kind === 'tool-running' || kind === 'tool-complete') {
    /*
     * ⛔ 18/09/2026 — «LA v2 ATTERRA SULLA HOME»: senza questo gesto `#schermoChat` non è la vista
     * attiva e le righe di attività sono ATTACCATE ma non VISIBILI (misurato nel giro vero del
     * 18/09/2026: `locator.click` su `.talos-activity__head` ha ritentato 206 volte su «element is
     * not visible»). Non è un difetto del prodotto — è lo scenario che vuole fotografare la chat e
     * non ci si era spostato: `handleRealEvent` disegna dentro `#conversation` qualunque sia la
     * vista attiva, ma solo `data-vaia="chat"` la porta davanti. Stesso gesto di `chat-standard`
     * (sopra) e dell'helper `apriChat` di `workspace-chooser.spec.mjs`.
     */
    await vaiA('chat');
    await page.evaluate((variant) => {
      const runtime = window.__talosHarnessUiRuntime;
      const session = runtime.realSessionState;
      document.querySelector('#conversation')?.replaceChildren();
      session.sequenzeViste.clear();
      session.batchAttivo = null;
      session.ultimoBatchChiuso = null;
      session.toolCallNomi.clear();
      const total = variant === 'tool-complete' ? 5 : 1;
      for (let index = 0; index < total; index += 1) {
        const id = `visual-read-${index}`;
        const sequence = 99000 + index * 3;
        runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: id, toolCallName: 'leggi', _sequenza: sequence }, session.generation);
        runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ percorso: `src/components/feature-${index}.js` }), _sequenza: sequence + 1 }, session.generation);
        if (variant === 'tool-complete') runtime.handleRealEvent({ type: 'ToolCallResult', toolCallId: id, content: 'ok', _sequenza: sequence + 2 }, session.generation);
      }
    }, kind);
    /*
     * ⛔ 18/09/2026 — `.tool-batch-summary` NON ESISTE PIÙ nel prodotto: 0 nodi nel DOM vivo e 0
     * occorrenze in `src/` e in `dist/app.js` (misurato, sonda-batch.mjs, porta 4197). Il cambio è
     * DELIBERATO e datato: commit `1f6ca521` (05/09/2026) «la chat del monolite emette i blocchi del
     * mockup» — la riga vecchia `summary.className = 'tool-note-summary tool-batch-summary'` è stata
     * rimossa e al suo posto c'è il blocco **ActivityBundle** del mockup
     * (`src/components/conversazione.js:700-720`): `div.talos-card.talos-activity` con la testa
     * `button.talos-activity__head` (la frase di riepilogo, `.tool-note-summary-text` dentro) e il
     * corpo `div.talos-activity__body.tool-batch-items`.
     * ⇒ Il gesto che apre il raggruppamento è il clic sulla TESTA. Misurato il 18/09/2026
     * (sonda-batch2.mjs, porta 4197), nei due scenari di questo file:
     *   `tool-running`  → testa «Lettura di 1 file…», `aria-expanded` da `false` a `true` dopo il
     *                     clic, corpo non più `hidden` e visibile, 1 riga dentro;
     *   `tool-complete` → testa «5 file letti», stessa transizione, 5 righe dentro.
     */
    await page.locator('.talos-activity__head').click();
  } else if (kind === 'waiting-loader') {
    await page.route('**/api/v1/sessions', async (route) => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { sessionId: 'visual-loader-session' }, meta: { schema: 'talos.harness-ui.api.v1' } }),
      });
    });
    await page.evaluate(() => {
      void window.__talosHarnessUiRuntime.startRealSession({ id: 'visual-loader-task', nome: 'Attesa risposta', consegna: 'Verifica il loader TALOS.' });
    });
    /*
     * ⛔ 18/09/2026 — `.real-waiting-note` (0 nodi) e `.talos-line-loader` (0 nodi) sono ENTRAMBI morti.
     * Misurato sull'app viva (sonda-attesa2.mjs, porta 4197) mentre la sessione aspetta: il nodo che la
     * persona vede è `div.talos-stack.talos-waiting[role="status"]` dentro `#conversation`, e dentro la
     * sua riga c'è `span.talos-orb.working[data-testid="talos-assistant-orb"]` — NON l'SVG a tre nodi.
     * Il cambio è deliberato e datato: `src/components/conversazione.js:1200-1210` — 12/09/2026, owner:
     * «il mobile ha introdotto un nuovo logo animato di caricamento… mettilo al posto del segnavia con i
     * pallini e la linea» ⇒ `creaAttesa` monta l'orb e non monta più `.talos-line-loader` (che resta nel
     * CSS e in `animaSegnavia` per chi lo usa ancora). Lo stesso fatto è già scritto, il 13/09 sera, in
     * `baseline-shell.spec.mjs:1009` e `:1043`.
     * Misurato nei due regimi (sonda-orb.mjs, porta 4197): orb presente, `data-testid="talos-assistant-orb"`,
     * visibile, animazione `talos-orb-spin` in corso; con `prefers-reduced-motion: reduce` nessuna animazione
     * (la CSS rispetta la preferenza) — quindi la metrica più sotto può ancora smentire.
     */
    await expect(page.locator('.talos-waiting [data-testid="talos-assistant-orb"]')).toBeVisible();
  } else if (kind.startsWith('composer-')) {
    await clickDirect('[data-vaia="impostazioni"]');
    await clickDirect('#setting-tab-appearance');
    /*
     * ⛔ 18/09/2026 — `force: true` perché il `<select>` nativo non è più il controllo VISIBILE:
     * `#composerShapeSelect` è `class="talos-select" aria-hidden="true" tabindex="-1"` dietro il
     * controllo a tema (`TalosThemedSelect`), e Playwright senza `force` si ferma su «element is not
     * visible» (misurato, sonda-matrix2.mjs, porta 4197). Il valore vive nel nativo — la sonda lo
     * rilegge dopo la selezione (`valore: "classic"`) e la forma si applica davvero: cambia il raggio
     * del composer (`src/styles/index.css:654-656`, `:root[data-talos-composer-shape="classic"]`
     * `.talos-composer{border-radius:8px}`).
     */
    await page.locator('#composerShapeSelect').selectOption(kind.slice('composer-'.length), { force: true });
    await vaiA('chat');
    await injectConversation(page, 'active');
  } else {
    await injectConversation(page, kind);
  }
  await page.waitForTimeout(250);
}

test('@visual 24-scenario visual matrix stays inside the desktop contract', async ({ browser }) => {
  test.setTimeout(120_000);
  await mkdir(outputDir, { recursive: true });
  const allMetrics = [];
  for (const [name, viewport, kind] of scenarios) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: kind === 'reduced-motion' ? 'reduce' : 'no-preference',
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      /*
       * ⛔ 18/09/2026 — la riga registrava solo il TESTO, e «Failed to load resource:
       * net::ERR_NO_BUFFER_SPACE» non dice QUALE risorsa: una sonda che non dice chi non è
       * azionabile. `location().url` è la pagina o la risorsa che ha prodotto il messaggio
       * (API ConsoleMessage di Playwright), quindi si appende fra parentesi quadre. Il filtro delle
       * avvertenze CSP più sotto continua a funzionare: il testo originale resta intatto.
       */
      const dove = message.location()?.url || '';
      consoleErrors.push(dove ? `${message.text()} [${dove}]` : message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    await page.goto('/');
    await applyScenario(page, kind);
    const metrics = await page.evaluate(() => ({
      activeView: document.querySelector('.view-pane.active')?.dataset.view || null,
      page: {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      },
      visibleDemoBadges: [...document.querySelectorAll('.demo-surface-badge')]
        .filter((element) => element.getBoundingClientRect().width > 0)
        .map((element) => element.textContent.trim()),
      interactiveCount: [...document.querySelectorAll('button, a[href], input, select, textarea')]
        .filter((element) => element.getBoundingClientRect().width > 0).length,
      bodyClass: document.body.className,
      composerGeometry: (() => {
        /*
         * ⛔ 18/09/2026 — `.composer` NON ESISTE PIÙ: 0 nodi nel DOM vivo (misurato, sonda-matrix3.mjs,
         * porta 4197), quindi questa metrica tornava `null` per tutti e 24 gli scenari e le due
         * asserzioni finali sulla geometria misuravano il nulla. Il composer del mockup è
         * `form#composerForm.talos-composer` (1 nodo), dentro `div.talos-chat-foot` dentro
         * `#schermoChat`: stesso ruolo, stesso posto nel contratto.
         */
        const composer = document.querySelector('#composerForm');
        if (!composer || composer.getBoundingClientRect().width === 0) return null;
        const style = getComputedStyle(composer);
        const rect = composer.getBoundingClientRect();
        return { width: rect.width, height: rect.height, minHeight: style.minHeight, borderRadius: style.borderRadius, padding: style.padding };
      })(),
      /*
       * ⛔ 18/09/2026 — DUE METRICHE CHE MISURAVANO IL NULLA (entrambi i selettori: 0 nodi nel DOM vivo).
       * `.real-tool-note[data-tool-state]` non esiste: l'attributo lo scrive
       * `src/components/conversazione.js:778-779` sulla riga del mockup, `div.talos-tool-row` (ToolRow,
       * commit `1f6ca521`). Misurato il 18/09/2026 (sonda-batch2.mjs, porta 4197): con il selettore vero
       * dà `["running"]` nello scenario `tool-running` e cinque `"complete"` in `tool-complete`, mentre il
       * selettore vecchio dà `[]`. Una misura che non può smentire non sta misurando: si punta quello vero.
       * `.talos-line-loader` è morto con la stessa sostituzione descritta sopra: l'indicatore vivo è l'orb
       * `[data-testid="talos-assistant-orb"]`, e la sua animazione è `talos-orb-spin` — presente con
       * movimento normale, assente con `reduce` (misurato, sonda-orb.mjs). Il nome del campo segue ciò che
       * misura: `waitingOrbAnimations`, non più `waitingLoaderAnimations`.
       */
      toolStates: [...document.querySelectorAll('.talos-tool-row[data-tool-state]')].map((element) => element.dataset.toolState),
      waitingOrbAnimations: document.querySelector('[data-testid="talos-assistant-orb"]')?.getAnimations({ subtree: true }).map((animation) => animation.playState) ?? [],
    }));
    const screenshotPath = resolve(outputDir, `${name}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const screenshotSha256 = createHash('sha256').update(await (await import('node:fs/promises')).readFile(screenshotPath)).digest('hex');
    const expectedCspWarnings = consoleErrors.filter((message) => message.includes("Content Security Policy directive 'style-src 'self'"));
    const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes("Content Security Policy directive 'style-src 'self'"));
    const record = { scenario: name, viewport, ...metrics, consoleErrors, expectedCspWarnings, unexpectedConsoleErrors, screenshot: screenshotPath, screenshotSha256 };
    await writeFile(resolve(outputDir, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    allMetrics.push(record);
    expect(unexpectedConsoleErrors, `${name} unexpected console/page errors`).toEqual([]);
    expect(metrics.page.scrollWidth, `${name} page horizontal overflow`).toBeLessThanOrEqual(metrics.page.clientWidth + 1);
    expect(metrics.interactiveCount, `${name} interactive surface`).toBeGreaterThan(0);
    if (kind === 'chat-full-width' || kind === 'chat-standard') expect(metrics.activeView, `${name} active chat view`).toBe('chat');
    if (kind !== 'reduced-motion') expect(metrics.bodyClass).not.toContain('reduce-motion');
    await context.close();
  }
  const composerStandard = allMetrics.find((item) => item.scenario === 'chat-standard-1920x1080')?.composerGeometry;
  const composerFullWidth = allMetrics.find((item) => item.scenario === 'chat-full-width-1920x1080')?.composerGeometry;
  /*
   * ⛔ 18/09/2026 — QUESTA RIGA DICEVA UNA COSA FALSA, e lo si vedeva solo adesso.
   * Diceva `expect(composerFullWidth).toEqual(composerStandard)` con l'etichetta «full width must
   * preserve the original composer geometry»: cioè che la modalità a tutta larghezza NON tocca il
   * composer. Non è vero, ed è voluto: `src/styles/index.css:96-101` (07/9, owner: «metti la
   * larghezza massima della chat di 768px di default» ⇒ `--talos-measure-w:768px`) scrive nero su
   * bianco «La modalita a tutta larghezza NON passa di qui: `:root.chat-full-width` mette
   * `max-width:none` sulla colonna e `calc(100% - 56px)` sul piede, e continua a farlo»; e
   * `index.css:708` allarga proprio i figli del piede (`--talos-colonna-chat:100%; width:calc(100% -
   * var(--talos-turno-coda)); max-width:none`). Le misure del 07/9 citate lì accanto («allargava la
   * colonna e il composer (1216 e 1212)») confermano che il composer più largo è il COMPORTAMENTO
   * atteso, non una regressione — lì il difetto era che i MESSAGGI restavano a 768.
   * ⛔ E la prova non poteva accorgersene: fino a ieri `composerGeometry` cercava `.composer`, che ha
   * 0 nodi, quindi tornava `null` per tutti e 24 gli scenari e `toEqual(null, null)` era verde per
   * COSTRUZIONE. Ripuntata su `#composerForm` (sopra), i numeri veri sono comparsi: a 1920×1080,
   * standard **768** (esattamente la misura del 07/9) contro full width **1072**.
   * ⇒ L'invariante che il prodotto promette davvero è: la modalità a tutta larghezza è una questione
   * di LARGHEZZA (del piede, della colonna e delle bolle) e non deve toccare la FORMA del composer —
   * altezza, raggio, padding restano gli stessi — mentre la larghezza DEVE cambiare, altrimenti la
   * coppia di scenari non sta misurando niente. Misurato il 18/09/2026 nel giro di questa spec:
   * forma identica nei due (`height 120`, `borderRadius 18px`, `padding "14px 14px 12px"`,
   * `minHeight 0px`), larghezza 768 → 1072. (Playwright: `toEqual` è l'uguaglianza stretta, la forma
   * si confronta dopo aver tolto la sola chiave che DEVE differire — playwright.dev/docs/api/
   * class-genericassertions, consultato il 18/09/2026.)
   */
  const { width: larghezzaStandard, ...formaStandard } = composerStandard || {};
  const { width: larghezzaFullWidth, ...formaFullWidth } = composerFullWidth || {};
  expect(formaFullWidth, 'full width must not touch the composer SHAPE (height, radius, padding)').toEqual(formaStandard);
  expect(larghezzaFullWidth, 'full width must widen the composer, or the toggle is doing nothing').toBeGreaterThan(larghezzaStandard);
  /*
   * ⛔ 18/09/2026 — non sono più tre volte 116. Misurate a 1440×900 sulla schermata chat, forma per
   * forma, su `#composerForm` (artefatti di questa spec, `composer-<forma>-1440x900.json`):
   *   standard 690×**120**, raggio **18px**, padding `14px 14px 12px`
   *   classic  690×**120**, raggio  **8px**, stesso padding
   *   compact  690×**102,5**, raggio **11px**, padding `8px 10px 6px`
   * `standard` e `classic` condividono l'altezza e si distinguono per il RAGGIO; `compact` è più
   * bassa perché cambia padding e minimo dell'input (`src/styles/index.css:654-656`).
   * ⛔ E LA MISURA HA UNA RISOLUZIONE: il primo giro di questa cura dichiarava «compact 103», che era
   * una lettura ARROTONDATA da una sonda; il valore vero è **102,5**, e `toBe(103)` su un'altezza
   * frazionaria è un'asserzione che nessuna pagina può soddisfare. Si confronta con la precisione
   * dichiarata (`toBeCloseTo`, ±0,05) e l'invariante resta quello che conta: due forme alte uguali e
   * distinte dal raggio, una più bassa, e nessuna delle tre che cambia LARGHEZZA (690 tutte e tre).
   */
  const formeComposer = {
    standard: { height: 120, borderRadius: '18px' },
    classic: { height: 120, borderRadius: '8px' },
    compact: { height: 102.5, borderRadius: '11px' },
  };
  for (const forma of ['standard', 'classic', 'compact']) {
    const geometry = allMetrics.find((item) => item.scenario === `composer-${forma}-1440x900`)?.composerGeometry;
    expect(geometry?.height, `${forma} must preserve the mockup composer height`).toBeCloseTo(formeComposer[forma].height, 1);
    expect(geometry?.borderRadius, `${forma} must preserve the mockup composer radius`).toBe(formeComposer[forma].borderRadius);
    expect(geometry?.width, `${forma} must not change the composer width`).toBe(690);
  }
  expect(formeComposer.compact.height, 'compact must be the LOWER shape').toBeLessThan(formeComposer.standard.height);
  await writeFile(resolve(outputDir, 'index.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), scenarios: allMetrics }, null, 2)}\n`, 'utf8');
  expect(allMetrics).toHaveLength(24);
});
