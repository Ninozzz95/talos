import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * ============================================================================
 * LA SCHEDA «SISTEMA» — la prova della FASE 4, corsia 4 · 19/09/2026
 * ============================================================================
 * Prova `src/components/misura-memoria.js` SULLA CARTA VERA dell'app viva
 * (`#modelLabOverviewPanel`, dentro `#modelLabCard`), come le prove delle altre
 * corsie: niente finto DOM come unico scenario, niente fixture al posto della
 * misura. Il modulo si serve dalla sua SORGENTE su disco
 * (`page.route('**\/__lab\/*.js')`) e si carica con un `import()` dalla pagina,
 * che la CSP `script-src 'self'` ammette perché è same-origin.
 *
 * ⛔ PERCHÉ SI SERVE IL MODULO DA DISCO, e non si prova il bundle: il bundle in
 *   `harness-ui/public/` lo costruisce e lo consegna l'orchestratore, non questa
 *   corsia. La prova del MODULO è di questa corsia; la prova del CABLAGGIO è del
 *   build. È lo stesso patto di `_fase3-banda.spec.mjs`.
 *
 * ⛔ E UNA PRETESA È STATA RITIRATA PRIMA DI SCRIVERLA, perché misurata FALSA.
 *   La prima stesura di SIS-02 pretendeva che l'eroe della card mostrasse la
 *   misura SENZA l'unità («10,7» + un `<small>GiB</small>`), e che
 *   `#machineFreeMemoryMetric` portasse quel numero nudo. Non si può:
 *   `tests/parity/misura-memoria-vivo.spec.mjs` pretende `toHaveText('12 GiB')`
 *   su QUEL nodo, e in errore `toHaveText('Non misurata')`. ⇒ Il nodo che porta
 *   l'id è il CONTENITORE (numero + unità + spazio), e le due prove convivono:
 *   `textContent` del contenitore è «12 GiB» e dentro stanno i due pezzi.
 *   (Lezione del 13/09: un test adattato a occhio smette di dire la stessa cosa.)
 *
 * ⛔ CHE COSA FA DIVENTARE ROSSA QUESTA PROVA (ogni riga è stata provata ROMPENDO
 *   il prodotto, non dedotta — vedi il resoconto della corsia):
 *   · si toglie `.system-card` dalla card → SIS-01 rossa;
 *   · si svuota l'unità dell'eroe (`set('[data-memory-unit]','')`) → SIS-02 rossa:
 *     `#machineFreeMemoryMetric` non legge più la misura intera ma il numero nudo;
 *   · si riporta «RAM libera» fra le righe di `.model-facts` → SIS-02 rossa (la
 *     stessa misura scritta due volte);
 *   · si toglie il calcolo dell'età dal badge → SIS-03 rossa;
 *   · si spegne il battito (`accendiBattito`) → SIS-04 rossa;
 *   · si toglie `vesteCardRuntime` → SIS-05 rossa;
 *   · si CLONA il bottone legacy invece di spostarlo (`slot.replaceWith(vecchio)`
 *     → `slot.replaceWith(vecchio.cloneNode(true))`) → SIS-06 rossa: il click non
 *     arriva più all'ascoltatore del monolite.
 */

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const CARTELLA_FOTO = resolve(process.cwd(), 'artifacts', 'corsia4-sistema', 'foto');

async function serviIlModulo(page) {
  await page.route('**/__lab/*.js', async (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop();
    try {
      const sorgente = readFileSync(resolve(COMPONENTI, nome), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: sorgente });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca ${nome}` });
    }
  });
}

async function apriIlLaboratorio(page, { colorMode = 'dark', runtime = null } = {}) {
  if (runtime) await page.route('**/api/v1/runtime', route => route.fulfill({ json: { ok: true, data: { items: runtime } } }));
  await page.addInitScript((modo) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' },
      chat: {},
      workspaces: {},
    }));
  }, colorMode);
  await serviIlModulo(page);
  await page.goto('/');
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 10000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
  });
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10000 });
  /* La scheda «Sistema» del guscio: mostra il pannello `overview`, che è dove vive la card.
     ⛔ Si preme il pulsante VERO e non si chiama l'API del modulo: è quel che fa una persona, e
     il guscio è di un'altra corsia — questa prova non deve sapere come è fatto dentro. */
  await page.locator('#setting-tab-models').click();
  await page.locator('#labSchedaSystem').click();
  await expect(page.locator('#modelLabOverviewPanel')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1200);
  return page;
}

/*
 * ⛔ IL BANCO CHE RIPRODUCE IL PRIMO AVVIO — ed è l'unico modo di provare il
 *   percorso VERO del montaggio senza rifare il build. Sulla pagina viva
 *   `montaMisuraMemoria` è già passata (il bundle monta al boot): una seconda
 *   chiamata esce subito per il timbro d'idempotenza, e quel che resterebbe da
 *   provare — la SOSTITUZIONE della card statica e la pulizia della colonna
 *   legacy — non verrebbe mai eseguito.
 *   ⇒ Il DOM qui dentro è ricopiato DA DOVE STA DAVVERO: il blocco della colonna
 *   da `src/legacy/frammenti.html` (`#modelLabOverviewPanel`) e la card statica
 *   da `index.template.html` (`#panel-runtime [data-c=MemoryMeter]`), riga per
 *   riga, id compresi. Non è una fixture inventata: è la fotografia dello stato
 *   in cui il montaggio trova le cose al primo avvio.
 */
const BANCO_LEGACY = `
 <section id="bancoOrigine"><div class="model-lab-layout"><div>
  <h4>Capacità di questa macchina</h4>
  <div class="model-lab-metrics">
   <div><span>RAM totale</span><strong id="machineMemoryMetric">—</strong></div>
   <div><span>RAM libera</span><strong id="machineFreeMemoryMetric">—</strong></div>
   <div><span>Spazio disponibile</span><strong id="machineStorageMetric">—</strong></div>
   <div><span>Allocabile dopo riserva 1 GB</span><strong id="machineAllocatableMetric">—</strong></div>
  </div>
  <p id="machineCapacityDetail">La misura usa solo le API del server locale.</p>
  <div class="memoria-libera" id="memoriaLibera">
   <div class="memoria-barra"><span id="memoriaBarraUsata"></span></div>
   <p id="memoriaBarraEtichetta">Misura non ancora eseguita.</p>
   <p id="memoriaTenuta" hidden></p>
   <div class="memoria-azioni"><button id="memoriaRimisura" type="button">Rimisura</button><button id="memoriaScarica" type="button" disabled>Libera la memoria del modello</button></div>
  </div></div>
  <div class="runtime-gate runtime-gate-large" id="modelLabRuntimeGate"><h4>Runtime locale</h4>
   <p id="modelLabRuntimeStatus">Verifica in corso…</p>
   <div id="modelLabRuntimeList" class="model-lab-runtime-list" aria-live="polite"></div>
   <div><select id="modelLabRuntimeSelect" disabled><option value="">Nessun runtime pronto</option></select></div>
   <button class="secondary-btn compact" id="modelLabRuntimeRefresh" type="button">Aggiorna runtime</button>
  </div></div>
 </section>
 <section id="bancoCanonico"><section class="talos-card talos-card--pad" data-c="MemoryMeter" data-memory-meter>
  <div class="talos-cluster"><h3>Memoria e spazio sul disco</h3><span class="talos-badge talos-badge--sm" data-memory-date data-c="Badge">Misurato 21:00:00</span></div>
  <p data-memory-error role="alert" hidden></p>
  <meter id="memoriaModello" min="0" max="100" low="75" high="90" optimum="0" data-memory-bar value="62.5" aria-label="20 GiB in uso su 32 GiB · 62,5%"></meter>
  <p data-memory-label>20 GiB in uso su 32 GiB · 62,5%</p>
  <div class="talos-kv"><span class="talos-kv__k">RAM totale</span><span class="talos-kv__v" data-memory-value="totale">32 GiB</span></div>
  <div class="talos-kv"><span class="talos-kv__k">RAM libera</span><span class="talos-kv__v" data-memory-value="libera">12 GiB</span></div>
  <hr class="talos-lab__rule">
  <div class="talos-kv"><span class="talos-kv__k">Disponibile sul disco</span><span class="talos-kv__v" data-memory-value="discoDisponibile">100 GiB</span></div>
  <div class="talos-kv"><span class="talos-kv__k">Riserva sul disco</span><span class="talos-kv__v" data-memory-value="discoRiserva">1 GiB</span></div>
  <div class="talos-kv"><span class="talos-kv__k">Allocabile sul disco</span><span class="talos-kv__v" data-memory-value="discoAllocabile">99 GiB</span></div>
  <p data-memory-tenuta>TALOS ha un modello caricato nel motore locale.</p>
  <div class="talos-cluster"><button type="button" data-c="Button" data-memory-action="refresh" data-demo="x">Rimisura</button><button type="button" data-c="Button" data-memory-action="unload" data-action="runtimeLibera">Libera memoria del modello</button></div>
  <p data-memory-detail>win32 · x64</p>
 </section></section>`;

/** Costruisce il banco, monta, e restituisce i nodi su cui la prova lavora. */
async function montaNelBanco(page, { misura = true } = {}) {
  return page.evaluate(async ({ markup, conMisura }) => {
    const mod = await import('/__lab/misura-memoria.js');
    window.__labMem = mod;
    const vecchio = document.querySelector('#bancoCorsia4'); if (vecchio) vecchio.remove();
    /* ⛔ LA CARD DELL'APP SI TIRA VIA PRIMA, e non è un dettaglio di comodo: il banco porta la
       fotografia del PRIMO AVVIO, cioè gli stessi id che il bundle ha già consegnato alla sua card.
       Lasciandoli tutt'e due, la pagina avrebbe DUE nodi per `#machineFreeMemoryMetric` — il
       difetto che questo modulo evita da sempre — e le asserzioni non saprebbero più quale dei due
       hanno misurato (misurato: `strict mode violation: locator('#machineFreeMemoryMetric')
       resolved to 2 elements`, il 19/09/2026). Si toglie la card dell'app e resta il banco. */
    document.querySelector('#modelLabOverviewPanel [data-memory-meter]')?.remove();
    const banco = document.createElement('div');
    banco.id = 'bancoCorsia4';
    banco.innerHTML = markup;
    document.body.append(banco);
    const originale = banco.querySelector('#bancoOrigine');
    const canonico = banco.querySelector('#bancoCanonico [data-c=MemoryMeter]');
    // Un ascoltatore sul bottone LEGACY: se il nodo viene SPOSTATO resta vivo, se clonato no.
    let clic = 0;
    banco.querySelector('#memoriaRimisura').addEventListener('click', () => { clic += 1; });
    mod.montaMisuraMemoria(originale, canonico);
    let capacita = null;
    if (conMisura) {
      capacita = (await (await fetch('/api/v1/model-lab/capacity')).json()).data;
      const runtimes = (await (await fetch('/api/v1/runtime')).json()).data.items;
      mod.aggiornaMisuraMemoria(banco.querySelector('[data-memory-meter]'), { capacita, runtimes, runtimeVerificato: true });
    }
    banco.querySelector('#memoriaRimisura').click();
    return { clicAscoltatore: clic, capacita };
  }, { markup: BANCO_LEGACY, conMisura: misura });
}

const ID_MEMORIA = ['machineMemoryMetric', 'machineFreeMemoryMetric', 'machineStorageMetric', 'machineAllocatableMetric', 'memoriaBarraEtichetta', 'memoriaTenuta', 'machineCapacityDetail', 'memoriaModello', 'memoriaRimisura', 'memoriaScarica'];

/*
 * ⛔ OGNI PROVA APRE PRIMA L'APP, e non è una formalità: `await import('/__lab/misura-memoria.js')`
 *   dentro `page.evaluate` si risolve sull'URL del DOCUMENTO. Su una pagina
 *   `about:blank` — quella che c'è prima di un `goto` — uno `specifier` che comincia con `/` non
 *   ha niente su cui risolversi e la prova muore con `Failed to resolve module specifier`, che
 *   sembra un difetto del modulo e invece è la pagina sbagliata. Misurato il 19/09/2026: sei
 *   prove rosse per questa sola ragione.
 */
test.describe('la scheda Sistema', () => {
  test('SIS-01 — le due card del mockup, e nessun id perso né doppio', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await montaNelBanco(page);
    const esito = await page.evaluate((ids) => {
      const banco = document.querySelector('#bancoCorsia4');
      const card = banco.querySelector('[data-memory-meter]');
      return {
        classiCard: card.className,
        timbro: card.dataset.sistemaCard,
        copie: ids.map((id) => id + ':' + banco.querySelectorAll('#' + CSS.escape(id)).length),
        dentroCard: ids.filter((id) => banco.querySelector('#' + CSS.escape(id))?.closest('[data-memory-meter]') === card),
        colonna: banco.querySelector('.model-lab-layout > div').children.length,
        grigliaLegacy: Boolean(banco.querySelector('.model-lab-metrics')),
        memoriaLiberaLegacy: Boolean(banco.querySelector('#memoriaLibera')),
        figli: [...card.children].map((c) => c.tagName.toLowerCase() + '.' + (c.className || '').split(' ')[0]),
        gate: { classi: banco.querySelector('#modelLabRuntimeGate').className, timbro: banco.querySelector('#modelLabRuntimeGate').dataset.sistemaCard },
        layout: banco.querySelector('.model-lab-layout').dataset.sistemaSchede,
      };
    }, ID_MEMORIA);

    // Il vestito del mockup è sulla card vera.
    expect(esito.classiCard).toContain('system-card');
    expect(esito.timbro).toBe('memoria');
    // L'ordine dei nodi è quello del mockup: intestazione, errore, eroe, barra, etichetta, fatti.
    expect(esito.figli.slice(0, 6)).toEqual(['div.section-heading', 'p.talos-muted', 'p.system-value', 'meter.talos-lab__meter', 'p.talos-muted', 'dl.model-facts']);

    // ⛔ UNA COPIA PER ID, TUTTE DENTRO LA CARD: la colonna legacy è stata svuotata, quindi i
    //    quattro `<strong>` della griglia non portano più gli stessi id della card.
    expect(esito.copie).toEqual(ID_MEMORIA.map((id) => id + ':1'));
    expect(esito.dentroCard).toEqual(ID_MEMORIA);
    expect(esito.grigliaLegacy).toBe(false);
    expect(esito.memoriaLiberaLegacy).toBe(false);
    expect(esito.colonna).toBe(1);

    // E la seconda card del mockup: il gate del runtime prende la forma della card.
    expect(esito.gate.classi).toContain('system-card');
    expect(esito.gate.timbro).toBe('runtime');
    expect(esito.layout).toBe('v1');
  });

  test('SIS-02 — la card porta la MISURA VERA, e la RAM libera non si scrive due volte', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    await montaNelBanco(page);
    const letto = await page.evaluate(() => {
      const banco = document.querySelector('#bancoCorsia4');
      const t = (s) => banco.querySelector(s)?.textContent?.trim() ?? null;
      const card = banco.querySelector('[data-memory-meter]');
      return {
        // Il contenitore dell'eroe: legge la misura INTERA, unità compresa.
        eroe: t('[data-memory-value=libera]'),
        numero: t('[data-memory-hero]'),
        // ⛔ Senza `trim`, ed è il punto della riga: lo spazio di separazione VIVE dentro l'unità,
        //    e un `trim` qui cancellerebbe proprio il carattere che la prova deve vedere.
        unita: banco.querySelector('[data-memory-unit]')?.textContent ?? null,
        label: t('[data-memory-label]'),
        detail: t('[data-memory-detail]'),
        righe: [...card.querySelectorAll('.model-facts [data-memory-value]')].map((n) => n.dataset.memoryValue),
        righeTutte: [...card.querySelectorAll('[data-memory-value]')].map((n) => n.dataset.memoryValue),
        intestazione: t('.section-heading h3'),
        avviso: t('.inline-notice'),
      };
    });
    // L'eroe legge la misura INTERA (numero + unità), che è il testo che le prove già scritte
    // pretendono da `#machineFreeMemoryMetric`; dentro stanno i due pezzi separati.
    expect(letto.eroe).toMatch(/^[\d.,]+ GiB$/);
    expect(letto.unita.trim()).toBe('GiB');
    expect(letto.numero).toMatch(/^[\d.,]+$/);
    // Lo spazio di separazione appartiene all'unità: il contenitore è esattamente numero + unità.
    expect(letto.numero + letto.unita).toBe(letto.eroe);
    // E il numero è quello del server, non un letterale: coincide con la misura scritta in dettaglio.
    expect(letto.detail).toContain('win32');
    // ⛔ La RAM libera sta NELL'EROE e non anche in tabella: la stessa misura due volte a venti
    //    pixel di distanza è il difetto che il mockup stesso non ha.
    expect(letto.righeTutte.filter((k) => k === 'libera')).toEqual(['libera']);
    expect(letto.righe).toEqual(['totale', 'discoDisponibile', 'discoRiserva', 'discoAllocabile']);
    expect(letto.intestazione).toBe('Memoria e spazio sul disco');
    expect(letto.avviso).toContain('GiB = 1.024³ byte');
  });

  test('SIS-03 — il badge dichiara la verità sul dato: quando è misurato, e quanto è vecchio', async ({ page }) => {
    await apriIlLaboratorio(page);
    const esiti = await page.evaluate(async () => {
      const mod = await import('/__lab/misura-memoria.js');
      const capacita = (await (await fetch('/api/v1/model-lab/capacity')).json()).data;
      const leggi = (stato, misuratoIl) => {
        const card = mod.creaMisuraMemoria();
        document.body.append(card);
        mod.aggiornaMisuraMemoria(card, misuratoIl === undefined ? stato : { ...stato, capacita: { ...capacita, measuredAt: misuratoIl } });
        const b = card.querySelector('[data-memory-date]');
        const fuori = { testo: b.textContent, classe: b.className, freschezza: card.dataset.memoryFreschezza, eroe: card.querySelector('[data-memory-value=libera]').textContent };
        card.remove();
        return fuori;
      };
      const adesso = Date.now();
      return {
        // 3 s e non 5: la soglia di «adesso» è `< 5 s`, e 5_000 millisecondi esatti cadevano
        // dall'altra parte per il tempo passato fra la misura e il disegno (misurato: la prova
        // leggeva «5 s fa»). Il margine è di due secondi, non di un millisecondo.
        fresco: leggi({ capacita }, new Date(adesso - 3_000).toISOString()),
        vecchio: leggi({ capacita }, new Date(adesso - 10 * 60_000).toISOString()),
        caricamento: leggi({ capacita: null, caricamento: true }),
        errore: leggi({ errore: 'Misura temporaneamente non disponibile' }),
        assente: leggi({}),
      };
    });
    // Fresco: il tempo c'è, l'età pure, e il tono è quello del dato buono.
    expect(esiti.fresco.testo).toMatch(/^Misurato \d{2}:\d{2}:\d{2} · adesso$/);
    expect(esiti.fresco.classe).toContain('talos-badge--success');
    expect(esiti.fresco.freschezza).toBe('fresca');
    // Vecchio: la misura RESTA a schermo — non si azzera mai — e l'età si vede.
    expect(esiti.vecchio.testo).toMatch(/^Misurato \d{2}:\d{2}:\d{2} · 10 minuti fa$/);
    expect(esiti.vecchio.classe).toContain('talos-badge--warning');
    expect(esiti.vecchio.freschezza).toBe('vecchia');
    expect(esiti.vecchio.eroe).toMatch(/GiB$/);
    // Senza misura non si inventa uno zero: si dichiara, e l'unità sparisce dal testo.
    expect(esiti.caricamento.testo).toBe('Misurazione…');
    expect(esiti.errore.testo).toBe('Misura non disponibile');
    expect(esiti.errore.classe).toContain('talos-badge--danger');
    expect(esiti.assente.testo).toBe('Non ancora misurata');
    expect(esiti.assente.freschezza).toBe('assente');
    expect(esiti.assente.eroe).toBe('Non misurata');
  });

  test('SIS-04 — l’età scorre da sola, e una card staccata non si tocca', async ({ page }) => {
    await apriIlLaboratorio(page);
    const prima = await page.evaluate(async () => {
      const mod = await import('/__lab/misura-memoria.js');
      const capacita = (await (await fetch('/api/v1/model-lab/capacity')).json()).data;
      const misurato = new Date(Date.now() - 30_000).toISOString();
      const viva = mod.creaMisuraMemoria(); document.body.append(viva);
      const morta = mod.creaMisuraMemoria(); document.body.append(morta);
      mod.aggiornaMisuraMemoria(viva, { capacita: { ...capacita, measuredAt: misurato } });
      mod.aggiornaMisuraMemoria(morta, { capacita: { ...capacita, measuredAt: misurato } });
      const testoMorta = morta.querySelector('[data-memory-date]').textContent;
      morta.remove();
      window.__morta = testoMorta; window.__viva = viva;
      return { viva: viva.querySelector('[data-memory-date]').textContent, morta: testoMorta };
    });
    expect(prima.viva).toMatch(/· 30 s fa$/);
    await expect.poll(async () => page.evaluate(() => window.__viva.querySelector('[data-memory-date]').textContent), { timeout: 5000 })
      .toMatch(/· 3[12] s fa$/);
    // La card staccata: il battito l'ha tolta dal giro al primo passaggio, e il testo è quello.
    const dopo = await page.evaluate(() => window.__morta);
    expect(dopo).toBe(prima.morta);
    await page.evaluate(() => { window.__viva.remove(); });
  });

  test('SIS-05 — la seconda card del mockup: il gate prende la forma, e il nodo di stato resta LO STESSO', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    /* ⛔ PRIMA IL CABLAGGIO, POI LA FUNZIONE — e l'ordine è stato IMPARATO rompendo la prova.
       La prima stesura chiamava `vesteCardRuntime` a mano sul pannello vivo, e togliendo la
       chiamata da `montaMisuraMemoria` la prova RESTAVA VERDE: misurava la funzione, non il fatto
       che il montaggio la esegua. Una prova che non può diventare rossa non sta misurando niente. */
    const nelBanco = await montaNelBanco(page);
    expect(nelBanco.clicAscoltatore).toBe(1);
    const cablaggio = await page.evaluate(() => {
      const gate = document.querySelector('#bancoCorsia4 #modelLabRuntimeGate');
      return { classi: gate?.className ?? null, timbro: gate?.dataset.sistemaCard ?? null, head: [...(gate?.querySelector('.section-heading')?.children || [])].map((c) => c.tagName) };
    });
    expect(cablaggio.classi).toContain('system-card');
    expect(cablaggio.timbro).toBe('runtime');
    expect(cablaggio.head).toEqual(['H4', 'P']);
    // ⛔ Il banco se ne va PRIMA di guardare il pannello vero: il suo `#modelLabRuntimeGate` porta
    //    lo stesso id, e due copie sulla stessa pagina sono esattamente il difetto che questa
    //    corsia combatte — la prima stesura di questa prova è caduta lì (`copieGate: 2`).
    await page.evaluate(() => document.querySelector('#bancoCorsia4')?.remove());

    /* E POI LA FUNZIONE SUL PANNELLO VERO, con i suoi nodi veri: sulla pagina viva il montaggio
       l'ha già fatta il BUNDLE (che è di un'altra generazione) e il timbro d'idempotenza farebbe
       uscire la seconda chiamata senza eseguire niente. Qui si prova che il nodo di stato è LO
       STESSO — non un clone — e che l'id resta uno solo. */
    await page.evaluate(async () => {
      const mod = await import('/__lab/misura-memoria.js');
      mod.vesteCardRuntime(document.querySelector('#modelLabOverviewPanel'));
    });
    const esito = await page.evaluate(() => {
      const gate = document.querySelector('#modelLabOverviewPanel #modelLabRuntimeGate');
      const stato = document.querySelector('#modelLabRuntimeStatus');
      const head = gate?.querySelector('.section-heading');
      return {
        classi: gate.className,
        statoDentroHead: Boolean(head && stato && head.contains(stato)),
        statoEsiste: Boolean(stato),
        copieStato: document.querySelectorAll('#modelLabRuntimeStatus').length,
        headFigli: [...(head?.children || [])].map((c) => c.tagName),
        titolo: head?.querySelector('h4')?.textContent ?? null,
        copieGate: document.querySelectorAll('#modelLabRuntimeGate').length,
      };
    });
    expect(esito.classi).toContain('system-card');
    expect(esito.copieGate).toBe(1);
    expect(esito.copieStato).toBe(1);
    // Il titolo e la pastiglia di stato stanno nella stessa riga, come nel mockup.
    expect(esito.headFigli).toEqual(['H4', 'P']);
    expect(esito.statoDentroHead).toBe(true);
    expect(esito.titolo).toBe('Runtime locale');
  });

  test('SIS-06 — i due bottoni del monolite restano VIVI: nodi spostati, non clonati', async ({ page }) => {
    await apriIlLaboratorio(page);
    const esito = await montaNelBanco(page);
    // L'ascoltatore era legato al bottone LEGACY, prima del montaggio: se il click lo raggiunge,
    // il nodo è stato SPOSTATO. Un clone avrebbe perso l'ascoltatore e la funzione con lui.
    expect(esito.clicAscoltatore).toBe(1);
    const dentro = await page.evaluate(() => {
      const card = document.querySelector('#bancoCorsia4 [data-memory-meter]');
      return {
        rimisura: card.querySelector('#memoriaRimisura')?.dataset.memoryAction,
        scarica: card.querySelector('#memoriaScarica')?.dataset.memoryAction,
        opt: card.querySelector('[data-memory-bar]')?.getAttribute('optimum'),
      };
    });
    expect(dentro.rimisura).toBe('refresh');
    expect(dentro.scarica).toBe('unload');
    // Il `<meter>` del monolite non si tocca: `optimum=0` è la sua soglia, e la card la conserva.
    expect(dentro.opt).toBe('0');
  });

  // Tre stati espliciti al confine HTTP verificano le etichette del bundle.
  // Non richiede modelli preinstallati e non ricopia le formule di produzione.
  test('SIS-07 — «disponibile» e «raggiunto» misurano due cose diverse, dallo stesso carico', async ({ page }) => {
    const modelli = [{ id: 'fixture-gguf', name: 'Modello di prova' }];
    const casi = [
      { runtimeState: 'unavailable', state: 'observed', models: modelli, badge: '1 runtime disponibile', stato: 'Nessun runtime raggiunto' },
      { runtimeState: 'ready', state: 'observed', models: modelli, badge: '1 runtime disponibile', stato: '1 motore raggiunto · 1 con modelli disponibili' },
      { runtimeState: 'unavailable', state: 'unavailable', models: [], badge: 'Nessun runtime raggiunto', stato: 'Nessun runtime raggiunto' },
    ];
    for (const caso of casi) {
      await apriIlLaboratorio(page, { runtime: [{ runtimeId: 'llama.cpp', state: caso.state, runtimeState: caso.runtimeState, models: caso.models }] });
      await expect(page.locator('#modelLabRuntimeBadge')).toHaveCount(0); // Badge rimosso su richiesta owner.
      await expect(page.locator('#modelLabRuntimeStatus')).toHaveText(caso.stato);
    }
  });

  test('SIS-08 — il montaggio non tocca il 4174 e non rompe la banda: il denominatore resta uno', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriIlLaboratorio(page);
    /* ⛔ QUESTA È LA PROVA CHE CONTA PER LA FASE 3, e per questo la card dell'app si SOSTITUISCE
       con la MIA invece di misurarne una vecchia: `#machineMemoryMetric` è il denominatore della
       barra della banda (`_fase3-banda.spec.mjs`, BANDA-03), e questo pannello è il posto da cui
       la banda lo legge. Montare la card nuova qui e muovere il nodo è l'unico modo di provare che
       il vestito della corsia 4 non spezza la corsia 3 — sul bundle consegnato, che è di
       un'altra generazione, la prova misurerebbe il codice di ieri. */
    await page.evaluate(async () => {
      const mod = await import('/__lab/misura-memoria.js');
      const originale = document.querySelector('#modelLabOverviewPanel');
      const card = originale.querySelector('[data-memory-meter]');
      /* La card nuova si costruisce con lo stesso costruttore del prodotto e si monta al posto di
         quella dell'app: `canonico` è la card stessa, come fa `montaMisuraMemoria` quando la trova. */
      const nuova = mod.creaMisuraMemoria();
      card.replaceWith(nuova);
      for (const [key, id] of [['refresh', 'memoriaRimisura'], ['unload', 'memoriaScarica']]) {
        const vecchio = document.getElementById(id);
        const slot = nuova.querySelector('[data-memory-action=' + key + ']');
        if (vecchio && slot) slot.replaceWith(vecchio);
      }
      for (const [key, id] of [['totale', 'machineMemoryMetric'], ['libera', 'machineFreeMemoryMetric'], ['discoDisponibile', 'machineStorageMetric'], ['discoRiserva', null], ['discoAllocabile', 'machineAllocatableMetric']]) {
        const n = nuova.querySelector('[data-memory-value=' + key + ']');
        if (id && n) n.id = id;
      }
      for (const [sel, id] of [['[data-memory-label]', 'memoriaBarraEtichetta'], ['[data-memory-tenuta]', 'memoriaTenuta'], ['[data-memory-detail]', 'machineCapacityDetail']]) {
        const n = nuova.querySelector(sel); if (n) n.id = id;
      }
      mod.aggiornaMisuraMemoria(nuova, { capacita: (await (await fetch('/api/v1/model-lab/capacity')).json()).data, runtimeVerificato: false });
    });
    const esito = await page.evaluate(() => {
      const bande = document.querySelectorAll('[data-lab-banda]').length;
      const metriche = document.querySelectorAll('#machineMemoryMetric').length;
      const card = document.querySelector('[data-memory-meter]');
      const dentroLaCard = Boolean(document.getElementById('machineMemoryMetric')?.closest('[data-memory-meter]'));
      document.querySelector('#machineMemoryMetric').textContent = '42 GiB';
      return { bande, metriche, dentroLaCard, eroe: card.querySelector('[data-memory-value=libera]')?.textContent ?? null };
    });
    // Una sola copia dell'id, dentro la card nuova: è la condizione perché la banda legga il
    // denominatore giusto.
    expect(esito.metriche).toBe(1);
    expect(esito.dentroLaCard).toBe(true);
    expect(esito.eroe).toMatch(/GiB$/);
    expect(esito.bande).toBeGreaterThan(0);
    /* La banda della FASE 3 legge il denominatore da QUESTA scheda: si muove il nodo e la banda
       lo segue. Se il montaggio avesse lasciato due copie dell'id, `getElementById` avrebbe reso
       la PRIMA in ordine d'albero e la banda avrebbe letto l'altra.
       ⛔ Si ASPETTA, non si legge subito: la banda si aggiorna da un osservatore, e una lettura
       sincrona al `textContent` arriverebbe prima del giro — la prima stesura leggeva
       «su 31,6 GiB» e sembrava un difetto del montaggio. */
    await expect(page.locator('[data-lab-banda-frazione]')).toHaveText('su 42 GiB');
  });

  test('SIS-09 — le due card viste nei due temi, a 1440 e a 1024', async ({ page }) => {
    test.setTimeout(90_000);
    await mkdir(CARTELLA_FOTO, { recursive: true });
    for (const [modo, tema] of [['dark', 'scuro'], ['light', 'chiaro']]) {
      for (const larghezza of [1440, 1024]) {
        await page.setViewportSize({ width: larghezza, height: 900 });
        await apriIlLaboratorio(page, { colorMode: modo });
        await montaNelBanco(page);
        const banco = page.locator('#bancoCorsia4');
        await banco.scrollIntoViewIfNeeded();
        /* La foto è del BANCO e non della pagina: le due card del mockup sono l'una sotto l'altra,
           e una fotografia a tutta pagina le mescolerebbe con l'app dietro — il confronto testa a
           testa col mockup vuole le sue due card, non il contorno. */
        await banco.screenshot({ path: resolve(CARTELLA_FOTO, `sistema-${tema}-${larghezza}.png`), animations: 'disabled' });
        // La foto si guarda: la card esiste, è visibile e non è vuota.
        await expect(page.locator('#bancoCorsia4 [data-memory-meter]')).toBeVisible();
        await expect(page.locator('#bancoCorsia4 #machineFreeMemoryMetric')).not.toHaveText('—');
        await expect(page.locator('#bancoCorsia4 #modelLabRuntimeGate')).toContainText('Runtime locale');
        await page.evaluate(() => document.querySelector('#bancoCorsia4').remove());
      }
    }
  });
});
