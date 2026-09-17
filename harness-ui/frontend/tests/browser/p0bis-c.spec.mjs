import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

import { erroreDiUnaPaginaTerza } from '../../src/components/browser.js';

/*
 * ⛔⛔⛔ P0-bis, CORSIA C — LE TRE RIGHE SUL PACCHETTO SERVITO, NEI DUE TEMI.
 *
 * BC-58 · a 1024 px la pillola del composer diceva «Giri 1…» dove il kernel diceva «10». Le prove
 *   unitarie non possono vederlo: è LAYOUT, e il layout esiste solo quando c'è un browser, una
 *   larghezza e un font. Qui si misura il nodo della misura (`scrollWidth <= clientWidth`) con due
 *   cifre e con tre, alle due larghezze desktop e nei due temi.
 * BC-59 · nella riga attività della chat compariva `file_edit`, un nome tecnico a schermo.
 * OSS-3 · gli errori del sandbox di una pagina ospitata non sono errori nostri.
 *
 * ⛔⛔ COME SI LANCIA (senza queste due variabili la prova misura il pacchetto CONSEGNATO l'ultima
 *   volta, cioè il codice di ieri — costa caro saperlo dopo):
 *     node scripts/build.mjs
 *     TALOS_HARNESS_UI_TEST_PORT=4179 TALOS_HARNESS_UI_PUBLIC_DIR="$PWD/dist" \
 *       npx playwright test tests/browser/p0bis-c.spec.mjs --project=chromium-desktop --workers=1
 * ⛔ Mai il 4174 né il 4177: `playwright.config.mjs` avvia un server suo con uno store ISOLATO.
 * ⛔ Due temi sempre tutti e due (owner 11/09), e le due viewport desktop (owner 02/09: la regola
 *   delle quattro viewport è del mobile; sul desktop sono 1024×800 e 1440×900).
 */

const CARTELLA_FOTO = path.resolve(fileURLToPath(new URL('../../artifacts/p0bis-C/', import.meta.url)));
async function foto(page, nome, selettore = null) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.evaluate(() => { const t = document.querySelector('#regioneToast'); if (t) t.hidden = true; });
  const byte = await (selettore ? page.locator(selettore).screenshot() : page.screenshot());
  await writeFile(path.join(CARTELLA_FOTO, nome), byte);
  return byte;
}
/** Le misure si STAMPANO: una misura che si vede solo quando la prova fallisce non è una misura. */
function misura(nome, valore) { console.log(`MISURA-P0BIS-C ${nome} = ${JSON.stringify(valore)}`); }

const SESSIONE = 'p0bisc-madre';
const CONFINE_SSE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;

/** La pagina «terza» e il widget che lei stessa sandboxa: la forma comune di pubblicità e incorporati. */
const PAGINA_TERZA = `<!doctype html><meta charset="utf-8"><title>Documentazione di esempio</title>
<body style="font:16px system-ui;padding:24px">
  <h1>Pagina di un altro sito</h1>
  <p>Questa pagina incorpora un widget e lo chiude nel suo recinto.</p>
  <iframe id="widget" sandbox="allow-scripts" src="https://terza-parte.example/widget" style="width:320px;height:80px"></iframe>
</body>`;
const WIDGET_TERZO = `<!doctype html><meta charset="utf-8"><title>widget</title>
<body><script>window.localStorage.getItem('a');</script><script>window.localStorage.getItem('b');</script></body>`;

for (const modo of ['dark', 'light']) {
  test.describe(`P0-bis corsia C · tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, () => {
    /* ⛔ `locale: 'it-IT'`: i nomi umani seguono la lingua della UI, e con en-US le foto sarebbero
       quelle di un browser inglese invece di quelle che vede l'owner. */
    test.use({ colorScheme: modo, locale: 'it-IT' });

    test.beforeEach(async ({ page }) => {
      await page.addInitScript((colorMode) => {
        localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' }));
        localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode } }));
      }, modo);
      /* ⛔ Predicato, non glob: l'11/09 un `**\/api/v1/sessions` che non copriva la query string ha
         fatto partire una sessione VERA a pagamento. Qui si guarda il percorso pulito. */
      await page.route((url) => url.pathname.endsWith(`/sessions/${SESSIONE}/events`), (route) => route.fulfill({ contentType: 'text/event-stream', body: CONFINE_SSE }));
      await page.goto('/');
      await page.waitForFunction(() => window.__talosHarnessUiRuntime);
      await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
      await page.evaluate((id) => {
        window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'P0-bis corsia C', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
      }, SESSIONE);
      await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
    });

    async function manda(page, lista) {
      await page.evaluate((l) => {
        const r = window.__talosHarnessUiRuntime;
        for (const e of l) r.handleRealEvent(e, r.realSessionState.generation);
      }, lista);
      await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    }

    /* ─────────────────────────────────────────────────────────────────────────────── BC-58 ─── */

    /*
     * ⛔⛔⛔ 17/09 sera — LA PRIMA CURA SPOSTAVA IL TAGLIO, NON LO TOGLIEVA, e questa prova non lo
     *   vedeva perché accendeva UNA pillola sola. Nel prodotto le due misure sono indipendenti
     *   (`chat-foot.js` decide `hidden` per ciascuna) e in un giro vero, oltre metà tetto, stanno
     *   accese INSIEME: con tutte e due i tre nomi si assottigliavano a una lettera («gl…»), e con
     *   quattro cifre sparivano del tutto senza che nessuno l'avesse deciso.
     * ⇒ Da qui in avanti si prova lo stato VERO — entrambe accese — e si misura anche la larghezza
     *   RESIDUA dei nomi, non solo i numeri. La regola che si verifica è quella dichiarata nel CSS:
     *   i numeri non si toccano mai, i nomi cedono INTERI e in un ordine scritto, e il nome del
     *   modello o si legge (≥ 5 caratteri) o non c'è — mai una o due lettere.
     */
    const STATI_PILLOLE = [
      { nome: 'stato realistico', giri: '10', costo: '$0,08' },
      { nome: 'al tetto', giri: '128/128', costo: '$1,23' },
      { nome: 'quattro cifre e spesa lunga', giri: '1024/1024', costo: '$12.345,67' },
    ];
    /** Quanti caratteri ci stanno in una larghezza, col font vero della barra: una soglia si misura. */
    const CARATTERI_MINIMI_MODELLO = 5;

    for (const larghezza of [1024, 1440]) {
      test(`BC-58 — numeri interi e nomi che cedono in ordine, con ENTRAMBE le pillole accese (${larghezza}px, ${modo})`, async ({ page }, info) => {
        await page.setViewportSize({ width: larghezza, height: larghezza === 1024 ? 800 : 900 });

        const esiti = [];
        for (const caso of STATI_PILLOLE) {
          /* ⛔ `#composerForm`, non `.talos-composer`: di composer nel documento ce ne sono DUE
             (due schermi), e misurare «il primo che trovo» misura un elemento a caso.
             ⛔ Si scrive DOVE SCRIVE IL PRODOTTO — gli stessi nodi che riempie `chat-foot.js`. */
          const m = await page.evaluate(({ giri, costo }) => {
            const composer = document.querySelector('#composerForm');
            const pg = composer.querySelector('[data-runtime-giri]');
            const pc = composer.querySelector('[data-runtime-costo]');
            pg.hidden = false; pc.hidden = false;
            pg.querySelector('.talos-mono').textContent = giri;
            pc.querySelector('.talos-mono').textContent = costo;
            /* il nome del modello è quello vero del giro: il più lungo che la barra incontra davvero */
            composer.querySelector('[data-open-sheet="model"] .talos-chip__label').textContent = 'glm-5.3-flash';
            composer.querySelector('[data-open-sheet="permissions"] .talos-chip__label').textContent = 'Scrive nel progetto';
            return null;
          }, caso).then(() => page.evaluate(() => {
            const composer = document.querySelector('#composerForm');
            const barra = composer.querySelector('.talos-composer__bar');
            const visibile = (el) => {
              if (!el) return null;
              const r = el.getBoundingClientRect();
              const st = getComputedStyle(el);
              /* ⛔ «Ceduta» è una DECISIONE dichiarata nel CSS (fuori dagli occhi, non dalla voce:
                 `position:absolute` + `clip-path`), non un pixel sotto una soglia a caso: si legge
                 l'intento, così la prova non confonde «nascosta apposta» con «schiacciata». */
              const spento = st.display === 'none' || st.visibility === 'hidden' || st.position === 'absolute' || r.width < 1;
              return { larghezza: Math.round(r.width), scroll: el.scrollWidth, testo: el.textContent, assente: spento };
            };
            const misuraDi = (sel) => {
              const n = composer.querySelector(`${sel} .talos-mono`);
              return { scroll: n.scrollWidth, client: n.clientWidth, testo: n.textContent };
            };
            return {
              composerW: Math.round(composer.getBoundingClientRect().width),
              barraW: Math.round(barra.getBoundingClientRect().width),
              giri: misuraDi('[data-runtime-giri]'),
              costo: misuraDi('[data-runtime-costo]'),
              nomeModello: visibile(composer.querySelector('[data-open-sheet="model"] .talos-chip__label')),
              nomePermesso: visibile(composer.querySelector('[data-open-sheet="permissions"] .talos-chip__label')),
              nomeTerminale: visibile(composer.querySelector('#pillTerminale .talos-chip__label')),
              nomeGiri: visibile(composer.querySelector('[data-runtime-giri] .talos-chip__label')),
              nomeCosto: visibile(composer.querySelector('[data-runtime-costo] .talos-chip__label')),
              barraSfonda: barra.scrollWidth > barra.clientWidth + 1,
              /* ⛔ Un nome nascosto deve restare un nome per chi non vede: si controlla il nome
                 accessibile del CONTROLLO, non la presenza del testo a schermo. */
              nomeAccessibile: {
                modello: composer.querySelector('[data-open-sheet="model"]')?.getAttribute('aria-label') || composer.querySelector('[data-open-sheet="model"] .talos-chip__label')?.textContent || '',
                permesso: composer.querySelector('[data-open-sheet="permissions"]')?.getAttribute('aria-label') || composer.querySelector('[data-open-sheet="permissions"] .talos-chip__label')?.textContent || '',
                terminale: composer.querySelector('#pillTerminale')?.getAttribute('aria-label') || composer.querySelector('#pillTerminale .talos-chip__label')?.textContent || '',
              },
              suggerimenti: {
                modello: composer.querySelector('[data-open-sheet="model"]')?.getAttribute('title') || '',
                permesso: composer.querySelector('[data-open-sheet="permissions"]')?.getAttribute('title') || '',
                terminale: composer.querySelector('#pillTerminale')?.getAttribute('title') || '',
              },
            };
          }));
          esiti.push({ caso: caso.nome, ...m });
          /* ⛔ La misura si stampa QUI, prima delle asserzioni: se si stampasse dopo, il primo
             rosso porterebbe via anche i numeri degli altri due casi. */
          misura(`bc58.${larghezza}.${modo}.${caso.nome.replace(/ /gu, '-')}`, m);

          const dove = `${caso.nome} a ${larghezza}px (${modo})`;
          /* 1. I NUMERI NON SI TOCCANO MAI — nessuno dei due. */
          expect(m.giri.scroll, `${dove}: i giri sono tagliati (${m.giri.scroll} > ${m.giri.client})`).toBeLessThanOrEqual(m.giri.client);
          expect(m.giri.testo).toBe(caso.giri);
          expect(m.costo.scroll, `${dove}: la spesa è tagliata (${m.costo.scroll} > ${m.costo.client})`).toBeLessThanOrEqual(m.costo.client);
          expect(m.costo.testo).toBe(caso.costo);

          /* 2. LA BARRA NON SFONDA: le pillole delle misure non si stringono più, quindi qualcuno
                deve cedere per davvero — e la prova è che non esce niente dai bordi. */
          expect(m.barraSfonda, `${dove}: la barra del composer sfonda in larghezza`).toBe(false);

          /* 3. I NOMI CEDONO INTERI, MAI A UNA LETTERA. Il nome del modello o si legge o non c'è. */
          for (const [chi, n] of [['modello', m.nomeModello], ['permesso', m.nomePermesso], ['terminale', m.nomeTerminale], ['Giri', m.nomeGiri], ['Sessione', m.nomeCosto]]) {
            if (!n || n.assente) continue;
            /* ⛔ Una parola CORTA ma intera non è una parola tagliata. La prima stesura di questa
               riga pretendeva cinque caratteri da chiunque e bocciava «Giri», che di caratteri ne
               ha quattro ed era visibile tutto: la guardia accusava il caso sano. La domanda giusta
               è «è intero?», e solo se non lo è «se ne legge abbastanza?». */
            const intero = n.larghezza >= n.scroll - 1;
            if (intero) continue;
            const caratteriVisibili = Math.floor((n.larghezza / Math.max(1, n.scroll)) * n.testo.length);
            expect(caratteriVisibili, `${dove}: del nome «${chi}» si leggono ${caratteriVisibili} caratteri su ${n.testo.length} (${n.larghezza}px su ${n.scroll}) — un nome o si legge o sparisce, mai una lettera`).toBeGreaterThanOrEqual(CARATTERI_MINIMI_MODELLO);
          }

          /* 4. CIÒ CHE SPARISCE A SCHERMO RESTA PER CHI NON VEDE: nome accessibile e suggerimento. */
          for (const chi of ['modello', 'permesso', 'terminale']) {
            expect(m.nomeAccessibile[chi].length, `${dove}: il controllo «${chi}» ha perso il suo nome accessibile`).toBeGreaterThan(3);
            expect(m.suggerimenti[chi].length, `${dove}: il controllo «${chi}» ha perso il suggerimento`).toBeGreaterThan(3);
          }

          /* ⛔ UNA FOTO PER CASO, non una sola alla fine: le prime quattro foto mostravano tutte
             l'ultimo stato provato (quello estremo) e lo stato che l'owner vede piu spesso — due
             cifre e pochi centesimi — non era in nessuna. Una prova che fotografa solo il caso
             peggiore non dice come sta la barra il resto del tempo. */
          await info.attach(`bc58-${caso.nome.replace(/ /gu, '-')}-${larghezza}-${modo}.png`, { body: await foto(page, `bc58-${caso.nome.replace(/ /gu, '-')}-${larghezza}-${modo}.png`, '#composerForm'), contentType: 'image/png' });
        }

      });
    }

    /* ─────────────────────────────────────────────────────────────────────────────── BC-59 ─── */

    test(`BC-59 — la riga attività di una modifica di file parla italiano, non «file_edit» (${modo})`, async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('[data-vaia="chat"]').first().click();
      await expect(page.locator('#schermoChat')).toBeVisible();
      await manda(page, [
        { type: 'RunStarted', input: { consegna: 'Correggi il prezzo' }, _sequenza: 1 },
        { type: 'TextMessageContent', messageId: 'm1', delta: 'Cambio la riga sbagliata.', _sequenza: 2 },
        { type: 'ToolCallStart', toolCallId: 'fe1', toolCallName: 'file_edit', _sequenza: 3 },
        { type: 'ToolCallArgs', toolCallId: 'fe1', delta: JSON.stringify({ percorso: 'src/prezzo.mjs', old_string: 'const iva = 0.2', new_string: 'const iva = 0.22' }), _sequenza: 4 },
        { type: 'ToolCallResult', toolCallId: 'fe1', content: 'exit 0\nsostituito', _sequenza: 5 },
      ]);

      /*
       * ⛔ LA RIGA CHE SI VEDE è la TESTA del bundle, non la `ToolRow`: le righe di dettaglio
       *   stanno dentro `.talos-activity__body`, che nasce chiuso (`hidden`). Alla prima stesura
       *   puntavo alla `ToolRow` e la prova diceva «hidden» — misurava un nodo che l'owner non
       *   guarda mai. La frase che è arrivata sul suo schermo con scritto «file_edit» è questa.
       */
      /*
       * ⛔ Le azioni di un giro stanno DENTRO un bundle che nasce chiuso («1 altra azione»): la
       *   frase per attrezzo si legge aprendolo, ed è lì che il 17/09 c'era scritto «file_edit».
       *   Alla prima stesura puntavo alla `ToolRow` chiusa e la prova diceva «hidden»: misuravo un
       *   nodo che nessuno guarda. Prima si apre, come fa una persona, poi si legge.
       */
      const bundle = page.locator('#conversation [data-c="ActivityBundle"]').first();
      await expect(bundle).toBeVisible();
      await bundle.locator('.talos-activity__head').click();

      const riga = page.locator('#conversation [data-c="ToolRow"]').filter({ hasText: 'prezzo' }).first();
      await expect(riga).toBeVisible();
      const testo = await riga.innerText();
      const icona = await riga.locator('use').first().getAttribute('href');
      misura(`bc59.rigaAttivita.${modo}`, { testo: testo.trim().slice(0, 140), icona });
      expect(testo, `la riga diceva: «${testo.trim()}»`).toMatch(/Modificato src\/prezzo\.mjs/u);
      expect(icona, 'un attrezzo che cambia i file non può restare sull’icona generica').toBe('#i-code');

      /* ⛔ E il nome tecnico non deve comparire da NESSUNA parte nella conversazione — non solo in
         quella riga: è la regola dell'owner del 04/09, e si controlla su tutto il testo visibile. */
      const conversazione = await page.locator('#conversation').innerText();
      expect(conversazione, 'un nome tecnico è rimasto a schermo').not.toContain('file_edit');

      await info.attach(`bc59-riga-attivita-${modo}.png`, { body: await foto(page, `bc59-riga-attivita-${modo}.png`, '#conversation'), contentType: 'image/png' });
    });

    /* ───────────────────────────────────────────────────────────── OSS-1 / OSS-2, dal vivo ─── */

    test(`OSS-1/OSS-2 — i campi del contratto arrivano fino alla RIGA a schermo (${modo})`, async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      /*
       * ⛔⛔⛔ PERCHÉ QUESTA PROVA ESISTE, e perché i soli unit non bastavano: fra il server e
       *   `processiDagliEventi` c'è una LISTA BIANCA (`legacy/app.js`, dove si riempie
       *   `eventiAttrezzi`) che copia un elenco FISSO di campi. Finché quella lista non li nomina,
       *   `avviatoA`, `durataMs`, `comando` e `cwd` muoiono lì — in silenzio — e una cura scritta
       *   più a valle resta verde nei suoi test e INERTE nel prodotto. Qui gli eventi entrano dalla
       *   porta vera (`handleRealEvent`) e si legge quello che finisce a schermo.
       * ⛔ I tre casi sono quelli VERI consegnati dalla corsia B, non inventati:
       *   1. uno `shell` eseguito: `durataMs` e `cwd` in forma Windows;
       *   2. una `prova` RIFIUTATA (`exit 127`): `comando` e `cwd` ci sono, `durataMs` NO —
       *      la riga non deve inventare «0 s»;
       *   3. la RIGIOCATA: stesso istante d'arrivo per tutti, nessun `durataMs`.
       */
      const t = Date.now();
      await manda(page, [
        { type: 'RunStarted', input: { consegna: 'Controlla il progetto' }, _sequenza: 1 },
        { type: 'ToolCallStart', toolCallId: 'e1', toolCallName: 'shell', avviatoA: t - 18_100, _sequenza: 2 },
        { type: 'ToolCallArgs', toolCallId: 'e1', delta: JSON.stringify({ comando: 'npm run build' }), _sequenza: 3 },
        { type: 'ToolCallResult', toolCallId: 'e1', content: 'exit 0\nfatto', durataMs: 18_100, cwd: 'C:\\progetti\\talos', _sequenza: 4 },
        { type: 'ToolCallStart', toolCallId: 'e2', toolCallName: 'prova', avviatoA: t, _sequenza: 5 },
        { type: 'ToolCallArgs', toolCallId: 'e2', delta: '{}', _sequenza: 6 },
        { type: 'ToolCallResult', toolCallId: 'e2', content: 'exit 127\nnessuna suite trovata', isError: true, comando: 'npm test', cwd: 'C:\\progetti\\talos', _sequenza: 7 },
        { type: 'ToolCallStart', toolCallId: 'e3', toolCallName: 'shell', _sequenza: 8 },
        { type: 'ToolCallArgs', toolCallId: 'e3', delta: JSON.stringify({ comando: 'git status --short' }), _sequenza: 9 },
        { type: 'ToolCallResult', toolCallId: 'e3', content: 'exit 0\npulito', _sequenza: 10 },
      ]);

      await page.locator('#railTabs [data-rail="processi"]').click();
      const righe = page.locator('#railProcessi [data-c="ProcessRow"]');
      await expect(righe).toHaveCount(3);

      const lette = await righe.evaluateAll((nodi) => nodi.map((n) => ({
        comando: n.querySelector('.talos-process__cmd')?.textContent?.trim() || '',
        famiglia: n.dataset.famiglia,
        misura: n.querySelector('.talos-process__misura')?.textContent?.trim() || '',
      })));
      misura(`oss1.righeAschermo.${modo}`, lette);

      const shell = lette.find((r) => r.comando.includes('npm run build'));
      const prova = lette.find((r) => r.comando.includes('npm test'));
      const rigiocata = lette.find((r) => r.comando.includes('git status'));

      /* 1. il comando eseguito porta la durata del SERVER */
      expect(shell, 'la riga dello shell eseguito non c’è').toBeTruthy();
      expect(shell.misura).toContain('18,1 s');

      /* 2. `prova` è una riga di processo, col comando preso dal risultato e la famiglia «prove» */
      expect(prova, '`prova` non è diventata una riga di processo').toBeTruthy();
      expect(prova.famiglia).toBe('test');
      /* ⛔ Non eseguita: nessuna durata inventata. «uscita 127» sì, «0 s» mai. */
      expect(prova.misura, `la riga della prova rifiutata diceva: «${prova.misura}»`).not.toMatch(/\b0 s\b/u);
      expect(prova.misura).toContain('127');

      /* 3. la rigiocata non produce «0 s» */
      expect(rigiocata, 'la riga rigiocata non c’è').toBeTruthy();
      expect(rigiocata.misura, `la riga rigiocata diceva: «${rigiocata.misura}»`).not.toMatch(/\b0 s\b/u);

      /* E la CARTELLA arriva fino al dettaglio, in forma Windows come la manda il server. */
      const rigaShell = righe.filter({ hasText: 'npm run build' }).first();
      await rigaShell.locator('.talos-process__apri').click();
      const dettaglio = rigaShell.locator('.talos-process__dettaglio');
      await expect(dettaglio).toBeVisible();
      const testoDettaglio = await dettaglio.innerText();
      misura(`oss2.dettaglio.${modo}`, testoDettaglio.replace(/\n+/gu, ' | ').slice(0, 240));
      expect(testoDettaglio).toContain('C:\\progetti\\talos');
      expect(testoDettaglio).toContain('18,1 s');

      await info.attach(`oss1-processi-${modo}.png`, { body: await foto(page, `oss1-processi-${modo}.png`, '.talos-inspector'), contentType: 'image/png' });
    });

    /* ──────────────────────────────────────────────────────────────────── F15 · il segreto ─── */

    /*
     * ⛔⛔⛔ F15 — LA CARTA DEVE DIRE PERCHÉ, e finora diceva il motivo generico.
     *   Dal 17/09 (corsia D, fusa) `ApprovalRequested` porta `azione.segreto = { frase, classe }`:
     *   la frase è già scritta per una persona, dal kernel, ed è l'unica cosa che conta davanti a
     *   un file di chiavi. La carta mostrava invece «Chiede perché la sessione è su …», cioè
     *   rispondeva a una domanda sulle POLITICHE mentre la persona ne aveva un'altra, più urgente.
     * ⛔ Il campo NON è nel codice di questo worktree (la corsia D non è nella mia base): si legge
     *   il contratto dichiarato e si degrada onestamente se manca — esattamente come per OSS-1.
     */
    const FRASE_SEGRETO = 'Il comando tocca un file che può contenere chiavi o password (.env): vuoi che lo esegua?';

    async function cartaDiApprovazione(page, azione, requestId = 'app-1') {
      await manda(page, [
        { type: 'RunStarted', input: { consegna: 'Guarda la configurazione' }, _sequenza: 1 },
        { type: 'ApprovalRequested', requestId, azione, _sequenza: 2 },
      ]);
      return page.locator('#conversation [data-c="ApprovalCard"]').first();
    }

    for (const larghezza of [1024, 1440]) {
      test(`F15 — davanti a un segreto la carta dice la frase del kernel e non promette «per questa sessione» (${larghezza}px, ${modo})`, async ({ page }, info) => {
        await page.setViewportSize({ width: larghezza, height: larghezza === 1024 ? 800 : 900 });
        await page.locator('[data-vaia="chat"]').first().click();

        /* ⛔ La POST si intercetta: una prova non risponde a un'approvazione VERA di nessuno. */
        const risposte = [];
        await page.route((url) => url.pathname.endsWith('/approve'), (route) => {
          risposte.push(route.request().postDataJSON());
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { requestId: 'app-1', approvato: true } }) });
        });

        const carta = await cartaDiApprovazione(page, {
          tipo: 'shell', comando: 'cat .env',
          segreto: { frase: FRASE_SEGRETO, classe: 'segreto', percorso: '.env' },
        });
        await expect(carta).toBeVisible();

        const letto = await carta.evaluate((n) => ({
          motivo: n.querySelector('.talos-approval__motivo')?.textContent?.trim() || '',
          perche: n.querySelector('.talos-approval__why')?.textContent?.trim() || '',
          codice: n.querySelector('.talos-approval__codice')?.textContent?.trim() || '',
          badge: n.querySelector('.talos-badge')?.textContent?.trim() || '',
          bottoni: [...n.querySelectorAll('.talos-approval__foot button')].map((b) => b.textContent.trim()),
        }));
        misura(`f15.carta.${larghezza}.${modo}`, letto);

        /* 1. Il motivo è la FRASE DEL KERNEL, non la politica della sessione. */
        expect(letto.motivo, `il motivo diceva: «${letto.motivo}»`).toBe(FRASE_SEGRETO);
        expect(letto.motivo).not.toMatch(/sessione è su|canale di approvazione/u);
        /* 2. Il blocco codice mostra il comando esatto. */
        expect(letto.codice).toBe('cat .env');
        /* 3. «Per questa sessione» NON c'è: non smetterebbe di chiedere, sarebbe una promessa falsa. */
        expect(letto.bottoni, `i bottoni erano: ${letto.bottoni.join(' · ')}`).not.toContain('Per questa sessione');
        expect(letto.bottoni).toEqual(['Consenti una volta', 'Nega']);
        /* ⛔ LA FOTO SI SCATTA PRIMA DEL CLIC. La prima versione fotografava dopo, e `rispondi()`
           spegne i pulsanti: lo scatto mostrava una carta GRIGIA, cioè uno stato che la persona non
           vede mai nel momento in cui deve decidere. Una foto della schermata sbagliata non prova
           niente di quello che si sta curando. */
        await info.attach(`f15-segreto-${larghezza}-${modo}.png`, { body: await foto(page, `f15-segreto-${larghezza}-${modo}.png`, '#conversation'), contentType: 'image/png' });

        /* 4. E le due risposte rimaste funzionano davvero. */
        await carta.getByRole('button', { name: 'Consenti una volta' }).click();
        await expect.poll(() => risposte.length).toBe(1);
        expect(risposte[0]).toEqual({ requestId: 'app-1', approvato: true });
      });
    }

    test(`F15 — AL CONTRARIO: senza «segreto» la carta è quella di ieri, con tutte e tre le risposte (${modo})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('[data-vaia="chat"]').first().click();
      const carta = await cartaDiApprovazione(page, { tipo: 'shell', comando: 'npm run build' }, 'app-2');
      await expect(carta).toBeVisible();
      const letto = await carta.evaluate((n) => ({
        motivo: n.querySelector('.talos-approval__motivo')?.textContent?.trim() || '',
        codice: n.querySelector('.talos-approval__codice')?.textContent?.trim() || '',
        bottoni: [...n.querySelectorAll('.talos-approval__foot button')].map((b) => b.textContent.trim()),
      }));
      misura(`f15.senzaSegreto.${modo}`, letto);
      expect(letto.bottoni).toEqual(['Consenti una volta', 'Per questa sessione', 'Nega']);
      expect(letto.codice).toBe('npm run build');
      expect(letto.motivo, 'senza segreto il motivo torna a parlare di politiche').toMatch(/Chiede perché/u);
      expect(letto.motivo, 'e NON deve più nominare il canale: quella clausola non esiste dal 06/09').not.toMatch(/canale di approvazione aperto/u);
    });

    test(`F15 — un «leggi» su un percorso segreto mostra il file, non il ripiego generico (${modo})`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.locator('[data-vaia="chat"]').first().click();
      const carta = await cartaDiApprovazione(page, {
        tipo: 'leggi', percorso: 'config/.env.production',
        segreto: { frase: FRASE_SEGRETO, classe: 'portachiavi' },
      }, 'app-3');
      const letto = await carta.evaluate((n) => ({
        badge: n.querySelector('.talos-badge')?.textContent?.trim() || '',
        perche: n.querySelector('.talos-approval__why')?.textContent?.trim() || '',
        codice: n.querySelector('.talos-approval__codice')?.textContent?.trim() || '',
      }));
      misura(`f15.leggi.${modo}`, letto);
      expect(letto.codice, '`leggi` mancava in codiceAzioneApprovazione: la carta chiedeva senza dire CHE COSA').toBe('config/.env.production');
      expect(letto.perche).toMatch(/leggere/u);
      expect(letto.badge).toBe('Chiede di leggere');
    });


    /* ─────────────────────────────────────────── D1 · il rientro della carta di approvazione ─── */

    for (const larghezza of [1024, 1440]) {
      test(`D1 — nella carta la riga del motivo è rientrata come le altre, e la prima lettera c'è (${larghezza}px, ${modo})`, async ({ page }, info) => {
        /*
         * ⛔ Dal giro vero del 17/09: la frase del segreto cominciava a filo del bordo della carta,
         *   che ha `overflow:hidden`, e si leggeva «ll comando tocca un file…» — la «I» mangiata.
         *   La misura non è «sembra storto»: è che il testo del motivo e quello della riga sopra
         *   devono partire dalla STESSA colonna, perché entrambi sono testo della carta.
         */
        await page.setViewportSize({ width: larghezza, height: larghezza === 1024 ? 800 : 900 });
        await page.locator('[data-vaia="chat"]').first().click();
        const carta = await cartaDiApprovazione(page, {
          tipo: 'shell', comando: 'cat .env',
          segreto: { frase: FRASE_SEGRETO, classe: 'segreto' },
        }, 'd1-1');
        await expect(carta).toBeVisible();

        const m = await carta.evaluate((n) => {
          /*
           * ⛔ Si misura il TESTO, non la scatola. La prima stesura confrontava
           *   `getBoundingClientRect()` dei due `<p>`: sono due blocchi larghi quanto la carta, e
           *   partivano tutti e due dal suo bordo anche quando uno dei due aveva il rientro e
           *   l'altro no. La misura diceva «allineati» mentre la «I» spariva. Un `Range` sul primo
           *   nodo di testo dà la colonna da cui la lettera comincia davvero.
           */
          const sinistraDelTesto = (el) => {
            const r = document.createRange();
            r.selectNodeContents(el);
            return r.getBoundingClientRect().left;
          };
          const why = n.querySelector('.talos-approval__why');
          const motivo = n.querySelector('.talos-approval__motivo');
          const piede = n.querySelector('.talos-approval__foot button');
          return {
            whyTesto: Math.round(sinistraDelTesto(why)),
            motivoTestoLeft: Math.round(sinistraDelTesto(motivo)),
            piedeLeft: Math.round(piede.getBoundingClientRect().left),
            cartaLeft: Math.round(n.getBoundingClientRect().left),
            motivoScroll: motivo.scrollWidth, motivoClient: motivo.clientWidth,
            motivoTesto: motivo.textContent,
          };
        });
        misura(`d1.rientro.${larghezza}.${modo}`, m);

        /* ⛔ ±1 px: il testo del motivo parte dove parte quello della riga sopra. */
        expect(Math.abs(m.motivoTestoLeft - m.whyTesto), `testo del motivo a ${m.motivoTestoLeft}, «Vuole eseguire…» a ${m.whyTesto}`).toBeLessThanOrEqual(1);
        /* ⛔ E non è allineato «per caso»: dev'essere staccato dal bordo della carta, che taglia. */
        expect(m.motivoTestoLeft - m.cartaLeft, 'il testo del motivo è ancora a filo del bordo della carta').toBeGreaterThan(8);
        expect(m.motivoScroll, 'il motivo nasconde parte di sé').toBeLessThanOrEqual(m.motivoClient);
        expect(m.motivoTesto.startsWith('Il comando tocca'), `il testo comincia con: «${m.motivoTesto.slice(0, 24)}»`).toBe(true);

        await info.attach(`d1-motivo-${larghezza}-${modo}.png`, { body: await foto(page, `d1-motivo-${larghezza}-${modo}.png`, '[data-c="ApprovalCard"]'), contentType: 'image/png' });
      });
    }

    /* ──────────────────────────────── D2 · la scala scatta solo quando serve davvero ─── */

    /**
     * Accende le pillole come fa il prodotto e legge cosa resta a schermo.
     * ⛔ `conSpesa:false` NON è uno stato inventato: `chat-foot.js` tiene la pillola della spesa
     *   `hidden` finché un costo non c'è (`costoChip.hidden = !dati.costo`), ed è lo stato in cui si
     *   trova ogni sessione appena comincia — cioè quello che l'owner vede più spesso.
     */
    async function statoBarra(page, { giri, costo, conSpesa, pienaLarghezza = false }) {
      await page.evaluate(({ g, c, conSpesa: cs, piena }) => {
        document.documentElement.classList.toggle('chat-full-width', Boolean(piena));
        const composer = document.querySelector('#composerForm');
        const pg = composer.querySelector('[data-runtime-giri]');
        const pc = composer.querySelector('[data-runtime-costo]');
        pg.hidden = false;
        pg.querySelector('.talos-mono').textContent = g;
        pc.hidden = !cs;
        if (cs) pc.querySelector('.talos-mono').textContent = c;
        composer.querySelector('[data-open-sheet="model"] .talos-chip__label').textContent = 'glm-5.3-flash';
        composer.querySelector('[data-open-sheet="permissions"] .talos-chip__label').textContent = 'Scrive nel progetto';
      }, { g: giri, c: costo, conSpesa, piena: pienaLarghezza });
      return page.evaluate(() => {
        const composer = document.querySelector('#composerForm');
        const barra = composer.querySelector('.talos-composer__bar');
        const leggi = (sel) => {
          const el = composer.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          const ceduta = st.display === 'none' || st.visibility === 'hidden' || st.position === 'absolute' || r.width < 1;
          return { larghezza: Math.round(r.width), scroll: el.scrollWidth, testo: el.textContent, ceduta, intero: !ceduta && r.width >= el.scrollWidth - 1 };
        };
        const numero = (sel) => { const n = composer.querySelector(`${sel} .talos-mono`); return { scroll: n.scrollWidth, client: n.clientWidth, testo: n.textContent }; };
        return {
          composerW: Math.round(composer.getBoundingClientRect().width),
          giri: numero('[data-runtime-giri]'),
          costoVisibile: !composer.querySelector('[data-runtime-costo]').hidden,
          costo: composer.querySelector('[data-runtime-costo]').hidden ? null : numero('[data-runtime-costo]'),
          modello: leggi('[data-open-sheet="model"] .talos-chip__label'),
          permesso: leggi('[data-open-sheet="permissions"] .talos-chip__label'),
          terminale: leggi('#pillTerminale .talos-chip__label'),
          parolaGiri: leggi('[data-runtime-giri] .talos-chip__label'),
          barraSfonda: barra.scrollWidth > barra.clientWidth + 1,
          vuotoADestra: Math.round(composer.querySelector('.talos-composer__mic').getBoundingClientRect().left - composer.querySelector('#pillTerminale').getBoundingClientRect().right),
        };
      });
    }

    test(`D2 (a) — con la SOLA pillola dei giri le etichette non cedono: a 1440 tutte intere (${modo})`, async ({ page }, info) => {
      /*
       * ⛔ IL DIFETTO, dal giro vero: a 1440 con «Giri 1» e nessuna spesa, il permesso era ridotto
       *   allo scudo e «Terminale» all'icona, con ~250 px VUOTI fra l'icona e il microfono. Cioè
       *   l'interfaccia era SOTTO quella del giorno prima per pagare un caso che non c'era.
       */
      await page.setViewportSize({ width: 1440, height: 900 });
      const m = await statoBarra(page, { giri: '1', costo: '$0,00', conSpesa: false });
      misura(`d2a.1440.${modo}`, m);

      expect(m.costoVisibile, 'la prova deve girare proprio nello stato senza spesa').toBe(false);
      expect(m.permesso.ceduta, 'a 1440 senza spesa il permesso non ha ragione di cedere').toBe(false);
      expect(m.terminale.ceduta, 'a 1440 senza spesa «Terminale» non ha ragione di cedere').toBe(false);
      expect(m.permesso.intero, `«Scrive nel progetto»: ${m.permesso.larghezza}px su ${m.permesso.scroll}`).toBe(true);
      expect(m.terminale.intero, `«Terminale»: ${m.terminale.larghezza}px su ${m.terminale.scroll}`).toBe(true);
      expect(m.modello.intero, `«glm-5.3-flash»: ${m.modello.larghezza}px su ${m.modello.scroll}`).toBe(true);
      expect(m.barraSfonda).toBe(false);
      await info.attach(`d2a-solo-giri-1440-${modo}.png`, { body: await foto(page, `d2a-solo-giri-1440-${modo}.png`, '#composerForm'), contentType: 'image/png' });
    });

    test(`D2 (a) — con la sola pillola dei giri, a 1024 nessun nome sotto i 5 caratteri (${modo})`, async ({ page }, info) => {
      await page.setViewportSize({ width: 1024, height: 800 });
      const m = await statoBarra(page, { giri: '128/128', costo: '$0,00', conSpesa: false });
      misura(`d2a.1024.${modo}`, m);
      expect(m.giri.scroll).toBeLessThanOrEqual(m.giri.client);
      expect(m.barraSfonda).toBe(false);
      /* ⛔ Prima ancora dei caratteri: senza spesa NESSUNO deve cedere, nemmeno a 1024. Senza questa
         riga il test passava anche col CSS di prima (le etichette cedute venivano saltate dal
         controllo qui sotto) — cioè non distingueva la cura dal difetto. */
      for (const [chi, n] of [['modello', m.modello], ['permesso', m.permesso], ['terminale', m.terminale]]) {
        expect(n.ceduta, `${chi} ceduto a 1024 senza spesa: la scala non doveva scattare`).toBe(false);
      }
      for (const [chi, n] of [['modello', m.modello], ['permesso', m.permesso], ['terminale', m.terminale]]) {
        if (n.ceduta || n.intero) continue;
        const visibili = Math.floor((n.larghezza / Math.max(1, n.scroll)) * n.testo.length);
        expect(visibili, `${chi}: ${visibili} caratteri su ${n.testo.length}`).toBeGreaterThanOrEqual(CARATTERI_MINIMI_MODELLO);
      }
      await info.attach(`d2a-solo-giri-1024-${modo}.png`, { body: await foto(page, `d2a-solo-giri-1024-${modo}.png`, '#composerForm'), contentType: 'image/png' });
    });

    test(`D2 (c) — dove il composer È largo abbastanza, la scala NON scatta nemmeno con la spesa (${modo})`, async ({ page }, info) => {
      /*
       * ⛔⛔ IL CRITERIO CHIESTO ERA «con `:root.chat-full-width` a 1440 tutto intero anche con la
       *   spesa», e MISURANDOLO si scopre che a 1440 quella classe NON allarga il composer: 680 px
       *   contro i 690 della disposizione normale — dieci in MENO. La colonna della chat è già al
       *   suo tetto (`--talos-measure-w: 768px`), quindi «piena larghezza» lì non aggiunge spazio.
       *   ⇒ Il criterio non era sbagliato: era irraggiungibile a quella viewport. Quello che va
       *   provato è la cosa che il criterio voleva dire — **quando lo spazio c'è, nessuno cede** —
       *   e per provarla bisogna prima TROVARE una larghezza in cui c'è, invece di assumerla.
       */
      const misurate = [];
      for (const larghezza of [1440, 1920, 2560]) {
        for (const piena of [false, true]) {
          await page.setViewportSize({ width: larghezza, height: 900 });
          const m = await statoBarra(page, { giri: '128/128', costo: '$12.345,67', conSpesa: true, pienaLarghezza: piena });
          misurate.push({ larghezza, piena, composerW: m.composerW, permessoCeduta: m.permesso.ceduta, terminaleCeduta: m.terminale.ceduta, barraSfonda: m.barraSfonda, modelloIntero: m.modello.intero });
        }
      }
      misura(`d2c.larghezze.${modo}`, misurate);

      /* ⛔ In OGNI caso misurato la barra non deve sfondare e i numeri restano interi: è la
         garanzia che non dipende dalla larghezza. */
      for (const m of misurate) expect(m.barraSfonda, `sfonda a ${m.larghezza}px (piena: ${m.piena})`).toBe(false);

      /* ⛔ E la scala deve essere SPENTA dove il composer supera la soglia dichiarata (800 px), e
         ACCESA dove non la supera. Le due metà insieme: se un giorno la soglia sparisse, la prima
         riga diventerebbe rossa; se scattasse sempre, la seconda. */
      const SOGLIA = 800;
      for (const m of misurate) {
        if (m.composerW > SOGLIA) {
          expect(m.terminaleCeduta, `composer ${m.composerW}px > ${SOGLIA}: nessuno deve cedere`).toBe(false);
          expect(m.permessoCeduta, `composer ${m.composerW}px > ${SOGLIA}: nessuno deve cedere`).toBe(false);
        } else {
          expect(m.terminaleCeduta, `composer ${m.composerW}px ≤ ${SOGLIA} con la spesa accesa: la scala deve scattare`).toBe(true);
        }
      }
      /* ⛔ E si dichiara se una larghezza sopra la soglia esiste davvero in questa disposizione:
         un elenco che non contiene mai il caso «largo» non prova la prima metà di sopra. */
      const sopraSoglia = misurate.filter((m) => m.composerW > SOGLIA).length;
      misura(`d2c.casiSopraSoglia.${modo}`, sopraSoglia);

      await page.setViewportSize({ width: 1440, height: 900 });
      await statoBarra(page, { giri: '128/128', costo: '$12.345,67', conSpesa: true, pienaLarghezza: true });
      await info.attach(`d2c-piena-larghezza-1440-${modo}.png`, { body: await foto(page, `d2c-piena-larghezza-1440-${modo}.png`, '#composerForm'), contentType: 'image/png' });
      await page.evaluate(() => document.documentElement.classList.remove('chat-full-width'));
    });

    /* ──────────────────────────────────────────────────────────────────────────────── OSS-3 ─── */

    test(`OSS-3 — gli errori del sandbox di una pagina ospitata NON sono nostri (${modo})`, async ({ page }, info) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const tutti = [];
      page.on('pageerror', (e) => tutti.push({ messaggio: e.message, cornici: page.frames().map((f) => f.url()) }));

      /*
       * ⛔ La pagina terza è SERVITA DA NOI via `page.route`, non presa dalla rete: una prova che
       *   dipende da un sito vivo misura quel sito. L'indirizzo però è di un'altra origine vera
       *   (`https://terza-parte.example`), quindi il prodotto la tratta come una pagina terza —
       *   `localeAnnotabile()` dice no, quindi niente proxy: cornice diretta, come nel giro vero.
       * ⛔ `iana.org`, l'esempio del 17/09, NON si incornicia affatto: risponde
       *   `X-Frame-Options: deny` (misurato con Playwright il 17/09). Per vedere il difetto serve
       *   una pagina che si lasci incorniciare: questa lo fa, e annida il widget sandboxato che
       *   lancia gli errori — che è la forma in cui il difetto esiste davvero.
       */
      /* ⛔ ORDINE: Playwright prova le rotte dall'ULTIMA registrata alla prima. La generica va
         quindi PRIMA e quella del widget DOPO — al contrario, la generica avrebbe servito anche
         `/widget` (e la prima esecuzione l'ha fatto davvero: la pagina si annidava in sé stessa,
         e i tre errori misurati non venivano da dove credevo). */
      await page.route((url) => url.hostname === 'terza-parte.example', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGINA_TERZA }));
      await page.route((url) => url.href.startsWith('https://terza-parte.example/widget'), (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: WIDGET_TERZO }));
      /* ⛔ Il percorso è `/api/v1/browser/incorniciabile` — letto in `legacy/app.js:12011`, non
         indovinato: alla prima stesura avevo scritto `/browser/frame`, la rotta non veniva
         intercettata, la cornice non nasceva e la prova passava A VUOTO (zero cornici, zero
         errori, zero misure). Un verde che non può diventare rosso non è una prova: per questo
         qui sotto si PRETENDE che la cornice esista e che gli errori ci siano davvero. */
      await page.route((url) => url.pathname.endsWith('/api/v1/browser/incorniciabile'), (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { url: 'https://terza-parte.example/doc', titolo: 'Documentazione di esempio', incorniciabile: true, motivo: null, via: 'cornice', percheVia: 'la pagina si lascia incorniciare' } }),
      }));

      /* ⛔ Si passa dalla UI VERA — la scheda «Browser» e il campo dell'indirizzo — e non da una
         funzione interna: il difetto vive nella cornice che nasce da quel gesto lì. */
      await page.locator('[data-vaia="browser"]').first().click();
      await expect(page.locator('#schermoBrowser')).toBeVisible();
      const campo = page.locator('#urlBrowser');
      await campo.fill('https://terza-parte.example/doc');
      await campo.press('Enter');
      await page.waitForTimeout(4000);

      const cornici = page.frames().map((f) => f.url());
      misura(`oss3.cornici.${modo}`, cornici);
      misura(`oss3.erroriTotali.${modo}`, tutti.map((e) => e.messaggio.slice(0, 90)));

      /*
       * ⛔⛔ PRIMA DI TUTTO, LA PROVA CHE C'È QUALCOSA DA MISURARE. Senza queste due righe la prova
       *   resta verde anche quando la cornice non nasce affatto — ed è esattamente quello che è
       *   successo alla prima esecuzione: zero cornici, zero errori, verde. Una misura che non può
       *   smentirti non sta misurando.
       */
      expect(cornici.filter((u) => u.includes('terza-parte.example')).length,
        `la pagina terza non è mai stata incorniciata: cornici = ${cornici.join(', ')}`).toBeGreaterThanOrEqual(2);
      expect(tutti.length, 'nessun errore del sandbox: la riproduzione non riproduce più niente').toBeGreaterThanOrEqual(2);

      const origine = new URL(page.url()).origin;
      const classificati = tutti.map((e) => ({ messaggio: e.messaggio, ...erroreDiUnaPaginaTerza(e.messaggio, e.cornici, origine) }));
      const nostri = classificati.filter((c) => !c.terzo);
      misura(`oss3.classificati.${modo}`, classificati.map((c) => `${c.terzo ? 'OSPITE' : 'NOSTRO'} · ${c.perche} · ${c.messaggio.slice(0, 70)}`));

      /* ⛔ LA MISURA CHE CONTA, e vale nei due versi:
         · niente errore NOSTRO mentre si ospita una pagina terza;
         · e se gli errori del sandbox ci sono, devono risultare tutti della pagina ospitata. */
      expect(nostri, `errori attribuiti a NOI: ${nostri.map((n) => n.messaggio).join(' | ')}`).toEqual([]);

      /* ⛔ E non deve nascere nessuna nota «TALOS · errore» in chat: un errore di un'altra pagina
         non è un guasto della sessione. (La app non ha ascoltatori globali su `window.onerror` —
         verificato leggendo il codice — quindi questa riga è una GUARDIA, non una cura.) */
      const note = await page.locator('#conversation').innerText().catch(() => '');
      expect(note).not.toContain('TALOS · errore');

      /* ⛔ E il sandbox NON è stato allargato per far tacere niente: si controlla l'attributo vero
         della cornice, non il fatto che gli errori siano spariti. MDN: `allow-scripts` +
         `allow-same-origin` insieme lasciano al contenuto togliersi il recinto da sé. */
      const sandboxNostro = await page.evaluate(() => [...document.querySelectorAll('iframe')].map((f) => f.getAttribute('sandbox')));
      misura(`oss3.sandboxDelleNostreCornici.${modo}`, sandboxNostro);
      for (const s of sandboxNostro) if (s) expect(s).not.toContain('allow-top-navigation');

      await info.attach(`oss3-browser-${modo}.png`, { body: await foto(page, `oss3-browser-${modo}.png`), contentType: 'image/png' });
    });
  });
}
