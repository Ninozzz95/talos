/*
 * ⛔⛔⛔ NON PRONTO — fuori dal `testMatch` apposta, e con la ragione scritta qui.
 *
 * Due giri di prova, due modi diversi di essere inerte:
 *  1. prima intercettava niente: senza backend la lista dei modelli è VUOTA, e una lista vuota non
 *     sfonda nessuna colonna. Toglievo la cura, ricostruivo, e il cancello passava lo stesso —
 *     misurava il nulla;
 *  2. ora serve i modelli da una rotta intercettata (`/api/v1/local-models`) e pretende che le
 *     righe ci siano, ma la lista resta vuota lo stesso: il selettore prende i modelli da una
 *     strada diversa da quella che ho intercettato. Da trovare.
 *
 * ⇒ Finché non fallisce davvero togliendo le tre righe di `styles/index.css` (~1080), questo file
 *   non entra nella suite: un cancello inerte supera le stesse prove di uno vero e darebbe una
 *   sicurezza falsa, che è peggio di nessuna sicurezza.
 *
 * Il buco che deve coprire è reale e misurato: cancellando quelle tre righe la suite resta
 * 625/625 VERDE, mentre a schermo torna la barra orizzontale e il nome tagliato a metà parola.
 */

import { test, expect } from '@playwright/test';

/*
 * ⛔⛔⛔ IL SELETTORE DEI MODELLI NON SFONDA LA SUA COLONNA.
 *
 * Nato l'11/09/2026 da un buco trovato mentre si CHIUDEVA BC-04, e che vale più del bug stesso.
 *
 * BC-04 («regressione di stile nel selettore dei modelli locali») risultava curato dall'08/09, in
 * due posti: il nome umano al posto dell'id grezzo (`app.js`, `nomeModelloUmano`) e — la causa
 * vera — la colonna del testo nominata per POSIZIONE in `styles/index.css:1080-1082`
 * (`>span:nth-child(2)`), invece di cadere sulla regola della colonna di coda
 * `.sheet-option>span:last-child` (`flex:0 0 auto` + `text-align:right`), che spingeva il
 * contenuto fuori dalla lista.
 *
 * ⛔ MA: cancellando quelle tre righe di CSS, la suite restava **625/625 verde**. La metà «nome»
 *   ha otto asserzioni (`tests/unit/chat-foot.test.mjs`); la metà CSS — quella che produceva la
 *   barra orizzontale e il testo tagliato a metà parola nello screenshot dell'owner — **non era
 *   protetta da niente**. Un difetto curato e non presidiato torna: è già successo in questo
 *   progetto più volte.
 *
 * ⇒ Questo cancello guarda i PIXEL, non il DOM: la domanda è geometrica — il contenuto sta dentro
 *   la lista, o la sfonda? Misurato con `scrollWidth` contro `clientWidth`, che è esattamente ciò
 *   che produce (o non produce) la barra orizzontale.
 *
 * ⭐ La misura viene dalla sonda che ha chiuso BC-04 ed è già provata NEI DUE VERSI: rimettendo il
 *   codice pre-cura riproduceva lo screenshot dell'owner (lista 410, contenuto 876, barra
 *   orizzontale presente), e con la cura dà 410/410 e 397/397 senza barra, in chiaro e in scuro.
 */

const BASE = process.env.TALOS_UI_URL ?? 'http://127.0.0.1:4174/';

for (const [nome, larghezza] of [['desktop', 1440], ['laptop', 1024]]) {
  for (const modo of ['dark', 'light']) {
    test(`il selettore dei modelli sta dentro la sua colonna — ${nome}, tema ${modo === 'dark' ? 'scuro' : 'chiaro'}`, async ({ browser }) => {
      const contesto = await browser.newContext({ viewport: { width: larghezza, height: 900 }, colorScheme: modo });
      const pagina = await contesto.newPage();
      /*
       * ⛔⛔⛔ I MODELLI SI SERVONO QUI, e senza questo il cancello era INERTE — provato: toglievo
       *   la cura, ricostruivo, e passava lo stesso. Il motivo è banale e istruttivo: senza backend
       *   la lista dei modelli è VUOTA, e una lista vuota non sfonda niente. Misurava il nulla.
       * ⇒ Si intercettano le rotte e si servono nomi veri, presi dalla sonda che ha chiuso BC-04.
       * ⛔ L'ultimo è il VERSO CONTRARIO: un id che `nomeModelloUmano` non può accorciare (nessun
       *   parametro, nessuna quantizzazione da tagliare). Se l'ellissi funziona davvero quella riga
       *   si tronca; se la lista tornasse a scorrere in orizzontale, è lì che si vedrebbe per prima.
       */
      const ID_LUNGO = 'bartowski-nvidia_Nemotron-Cascade-2-30B-A3B-GGUF-931b595fc71b-nvidia-Nemotron-Cascade-2-30B-A3B-Q4-0-gguf';
      await pagina.route('**/api/v1/local-models*', (rotta) => rotta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { items: [
          { id: ID_LUNGO, name: '', bytes: 18_500_000_000, state: 'ready' },
          { id: 'unsloth-gemma-3-4b-it-GGUF-gemma-3-4b-it-Q4_K_M-gguf', name: '', bytes: 2_490_000_000, state: 'ready' },
          { id: 'unaCasaEditriceMoltoLunga-un-modello-dal-nome-interminabile-che-nessuna-regola-puo-accorciare-perche-non-dichiara-ne-parametri-ne-quantizzazione', name: '', bytes: 900_000_000, state: 'ready' },
        ] }, meta: { schema: 'talos.harness-ui.api.v1' } }),
      }));
      /*
       * ⛔ Anche il CATALOGO va servito, non solo i locali: il picker chiama `/api/v1/models` per
       *   primo e, se quella fallisce, mostra «Catalogo non disponibile» e **non disegna nemmeno le
       *   fonti** — niente scheda «Locali», niente righe, niente da misurare. È il terzo modo in cui
       *   questo cancello è nato inerte, e ognuno dei tre diceva «verde» sul nulla.
       */
      await pagina.route('**/api/v1/models*', (rotta) => rotta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data: { modelli: [
          { id: 'z-ai/glm-5.3-flash', name: 'GLM 5.3 Flash', context_length: 200000, pricing: { prompt: '0.0000002', completion: '0.0000008' } },
        ], daCache: true }, meta: { schema: 'talos.harness-ui.api.v1' } }),
      }));
      await pagina.goto(BASE, { waitUntil: 'domcontentloaded' });
      await pagina.waitForTimeout(3000);
      await pagina.evaluate(() => document.getElementById('introSalta')?.click());
      await pagina.waitForTimeout(600);

      /* Si apre il selettore dalla pill del composer, com'è il gesto vero. */
      await pagina.evaluate(() => document.querySelector('[data-open-sheet="model"]')?.click());
      await pagina.waitForTimeout(1500);
      /*
       * ⛔⛔ E SI APRE LA SCHEDA «LOCALI»: era il pezzo che mancava, e la ragione per cui questo
       *   cancello è nato inerte due volte. Il selettore si apre su «OpenRouter»; i modelli locali
       *   — quelli coi nomi lunghi, quelli di BC-04 — stanno in un'altra fonte, e finché non la si
       *   apre la lista misurata è quella sbagliata. Misurare la superficie sbagliata dà sempre
       *   ragione a chi misura.
       */
      await pagina.evaluate(() => document.querySelector('[data-picker-source="locali"]')?.click());
      await pagina.waitForTimeout(1200);

      const misura = await pagina.evaluate(() => {
        const lista = document.querySelector('.model-picker-panel:not([hidden]) .model-picker-list')
          ?? document.querySelector('.model-picker-list');
        if (!lista) return { assente: true };
        return {
          clientWidth: lista.clientWidth,
          scrollWidth: lista.scrollWidth,
          quanteRighe: lista.querySelectorAll('.model-picker-option').length,
          /* Quante righe hanno il nome che esce dal suo spazio invece di essere troncato con l'ellissi. */
          righeFuori: [...lista.querySelectorAll('.model-picker-option')].filter((o) => {
            const r = o.getBoundingClientRect();
            const l = lista.getBoundingClientRect();
            return r.right > l.right + 1;
          }).length,
        };
      });

      /*
       * ⛔ Se il selettore non si apre, il cancello NON passa in silenzio: dire «va bene» su una
       *   superficie che non è stata guardata è il modo in cui un cancello diventa inerte.
       */
      expect(misura.assente, 'il selettore dei modelli deve aprirsi dalla pill del composer: se non si apre, questo cancello non sta misurando niente').toBeFalsy();
      /* ⛔ E deve avere RIGHE: una lista vuota passa qualunque prova sulla larghezza, ed è
         esattamente come questo cancello è nato inerte la prima volta. */
      expect(misura.quanteRighe, 'la lista deve contenere i modelli serviti dalla rotta intercettata: senza righe, la misura sulla larghezza non prova niente').toBeGreaterThan(0);

      expect(misura.scrollWidth, `⛔ il contenuto del selettore (${misura.scrollWidth}px) sfonda la sua colonna (${misura.clientWidth}px): è la barra orizzontale di BC-04, tornata. La causa storica erano tre righe in styles/index.css (~1080) che nominano la colonna del testo per posizione invece di lasciarla cadere sulla regola della colonna di coda.`)
        .toBeLessThanOrEqual(misura.clientWidth + 1);

      expect(misura.righeFuori, '⛔ nessuna riga deve uscire dal bordo della lista: un nome lungo si tronca con l’ellissi, non spinge fuori la colonna')
        .toBe(0);

      await contesto.close();
    });
  }
}
