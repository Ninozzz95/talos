import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/*
 * ============================================================================
 * I FILTRI DEI FORNITORI E I LOGHI VERI — FASE 4-bis, CORSIA BC, 19/09/2026
 * ============================================================================
 * Prova `src/components/provider-card.js` (la riga dei filtri) e
 * `src/components/loghi-fornitori.js` (il marchio di ogni fornitore).
 * La forma è la stessa di `lab-provider.spec.mjs`: il modulo si serve dalla
 * SORGENTE su disco (`page.route('**\/__lab\/*.js')` + `import()` dalla pagina,
 * che la CSP `script-src 'self'` ammette perché è same-origin) e si disegna
 * sulla CARTA VERA del laboratorio, coi FORNITORI VERI del server.
 *
 * ⛔ DA DOVE VIENE LA RICHIESTA (owner, 19/09/2026):
 *     «Ci devono essere tutti i filtri relativi: per Provider, per Impostato,
 *      per Non impostato, qualcosa di fatto bene»
 *     «tutti i provider devono avere il logo reale del provider stesso»
 *   ⛔ E NEL MOCKUP I FILTRI **NON CI SONO**: il «Configurato⌄» che si vede è il
 *     selettore di scenario della statusbar. Questa è una richiesta IN PIÙ: si
 *     progetta, non si copia — e la forma si prende dalla barra a faccette già
 *     approvata (`catalogo-faccette.js`).
 *
 * ⛔ LE REGOLE DEI FILTRI, e ognuna ha il suo caso qui sotto (ricerca 19/09/2026):
 *     il conteggio per valore · OR dentro una faccetta, AND fra faccette ·
 *     i valori a zero si SPENGONO · `aria-live` sul risultato.
 *
 * ⛔ I LOGHI: la licenza e la provenienza stanno in
 *   `src/assets/loghi-fornitori/` (LICENZE.md + un SVG per marchio) e nel
 *   commento di testata di `loghi-fornitori.js`. Qui si prova che il marchio
 *   C'È dove c'è, che è MONOCROMO, che NON si chiede niente a nessuno per
 *   averlo, e che le due copie (SVG su disco e tracciato nel bundle) dicono la
 *   stessa cosa.
 * ============================================================================
 */

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const ASSET = resolve(process.cwd(), 'src', 'assets', 'loghi-fornitori');
const CARTELLA_FOTO = resolve(process.cwd(), 'artifacts', 'fase4-provider', 'foto');

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

/**
 * Apre l'app, va in Impostazioni → Laboratorio modelli → scheda «Provider», monta il
 * pannello (è il montaggio VERO che installa i filtri) e ridisegna la lista con la
 * SORGENTE di oggi e le righe VERE del server.
 * ⛔ L'ORDINE CONTA: `montaProviderPanel` PRIMA di `aggiornaProviderList`, perché è il
 *   montaggio a installare la riga dei filtri e solo il disegno a riempirla coi conteggi.
 *   Al contrario si otterrebbero chip vuoti — cioè una prova che accusa il prodotto di un
 *   ordine che è della prova.
 */
async function apriProvider(page, { colorMode = 'dark', righe = null } = {}) {
  const tentate = [];
  const esterne = [];
  /* ⛔ PRIMA il blocco, POI le eccezioni (stessa ragione di `lab-provider.spec.mjs`):
     Playwright prova i gestori in ordine INVERSO alla registrazione. */
  await page.route('**/*', (route) => {
    const richiesta = route.request();
    const metodo = richiesta.method();
    const url = new URL(richiesta.url());
    /* ⛔ «VERSO L'ESTERNO» = un host che non è il nostro server. I loghi NON devono
       chiedere niente a nessuno: questo contatore è la prova, e vale zero PER COSTRUZIONE
       solo se nessuno scrive un indirizzo assoluto nel codice. */
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') esterne.push(url.href);
    if (metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS') return route.continue();
    tentate.push(`${metodo} ${url.pathname}`);
    return route.abort();
  });
  await page.addInitScript((modo) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' }, chat: {}, workspaces: {} }));
  }, colorMode);
  await serviIlModulo(page);
  await page.goto('/');
  await page.waitForSelector('#talosAvvio', { state: 'detached', timeout: 15000 });
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
  });
  await page.click('#modelLabCard [data-lab-scheda="providers"]');
  await expect(page.locator('#modelLabCard [data-model-lab-panel="providers"]')).toBeVisible();
  const esito = await page.evaluate(async () => {
    const modulo = await import('/__lab/provider-card.js');
    window.__prov = modulo;
    const risposta = await (await fetch('/api/v1/providers')).json();
    window.__righe = risposta.data.items;
    const pannello = document.querySelector('#modelLabCard [data-model-lab-panel="providers"]');
    const lista = pannello.querySelector('#providerList');
    /* Il montaggio VERO (col suo timbro) — è lui che installa i filtri. */
    delete pannello.dataset.providerMontato;
    modulo.montaProviderPanel(pannello);
    modulo.aggiornaProviderList(lista, window.__righe, {});
    return { n: window.__righe.length, filtri: Boolean(lista.previousElementSibling?.matches?.('[data-provider-filtri-riga]')) };
  });
  return { tentate, esterne, esito };
}

/** I fornitori che il server serve per questa prova. */
async function righe(page) { return page.evaluate(() => window.__righe); }

/**
 * La faccetta della credenziale, ricalcolata QUI da zero — di proposito: è un
 * contro-calcolo indipendente dal codice del prodotto, e se le due formule
 * divergono la prova è rossa. Se si chiamasse `credenzialeDiFornitore` del
 * modulo, la prova direbbe solo che la funzione è d'accordo con se stessa.
 */
function credenzialeDi(r) {
  if (r.id === 'esterno') return r.agente ? 'impostata' : 'daImpostare';
  if (r.origineChiave === 'ambiente' || r.origineChiave === 'accesso') return 'impostata';
  if (r.keyConfigured === true) return 'impostata';
  return r.requiresKey === true ? 'daImpostare' : 'facoltativa';
}
function attesi(elenco) {
  const c = { impostata: 0, daImpostare: 0, facoltativa: 0 };
  for (const r of elenco) c[credenzialeDi(r)]++;
  return c;
}

async function leggiChip(page, gruppo) {
  return page.evaluate((g) => [...document.querySelectorAll(`[data-provider-filtro-gruppo="${g}"] [data-provider-filter]`)].map((b) => ({
    valore: b.dataset.providerFilter.split(':')[1],
    testo: b.textContent.trim(),
    conteggio: Number(b.querySelector('.talos-badge')?.textContent ?? NaN),
    acceso: b.getAttribute('aria-pressed') === 'true',
    spento: b.disabled,
  })), gruppo);
}

async function quanteCard(page) {
  return page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]').count();
}

async function foto(page, nome) {
  await mkdir(CARTELLA_FOTO, { recursive: true });
  await page.screenshot({ path: resolve(CARTELLA_FOTO, `${nome}.png`), fullPage: false, animations: 'disabled' });
}

test.describe('i filtri dei fornitori — conteggi veri, e filtrano davvero', () => {
  test('FILL-01 — la riga dei filtri sta sopra la lista, e i conteggi sono quelli VERI', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { esito } = await apriProvider(page);
    expect(esito.filtri, 'il montaggio del pannello deve installare la riga dei filtri').toBe(true);
    expect(esito.n).toBeGreaterThanOrEqual(28);

    /* ── LA POSIZIONE: sopra la lista, non dentro e non sotto ─────────────────────── */
    const posizione = await page.evaluate(() => {
      const lista = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] #providerList');
      const riga = lista.previousElementSibling;
      return {
        riga: riga?.matches?.('[data-provider-filtri-riga]') ?? false,
        sopra: riga ? riga.getBoundingClientRect().bottom <= lista.getBoundingClientRect().top + 1 : false,
        dentro: Boolean(riga?.closest?.('#providerList')),
        filtri: riga?.querySelectorAll('[data-provider-filter]').length ?? 0,
      };
    });
    expect(posizione.riga, 'la riga dei filtri è il fratello precedente della lista').toBe(true);
    expect(posizione.dentro, 'e NON sta dentro la lista (o sparirebbe a ogni ridisegno)').toBe(false);
    expect(posizione.sopra, 'e si vede sopra la lista').toBe(true);
    /* Tre valori di credenziale, due di prova: cinque chip, che è il massimo che una
       barra a faccette regge senza diventare un modulo (5-8 valori visibili). */
    expect(posizione.filtri).toBe(5);

    /* ── I CONTEGGI: ricalcolati qui da zero, e sommano al totale ─────────────────── */
    const elenco = await righe(page);
    const c = attesi(elenco);
    const chip = await leggiChip(page, 'credenziale');
    for (const b of chip) expect(b.conteggio, `il chip «${b.testo}» porta un conteggio vero`).toBe(c[b.valore]);
    const somma = chip.reduce((t, b) => t + b.conteggio, 0);
    expect(somma, 'i conteggi della credenziale coprono TUTTI i fornitori, senza doppioni').toBe(elenco.length);
    const prova = await leggiChip(page, 'prova');
    expect(prova.reduce((t, b) => t + b.conteggio, 0), 'e quelli della prova pure').toBe(elenco.length);
    expect(prova.find((b) => b.valore === 'mai').conteggio, 'senza prove in corso sono tutti «mai provati»').toBe(elenco.length);

    /* ── E il verso contrario: un chip il cui valore NON esiste è SPENTO, non nascosto ── */
    for (const b of [...chip, ...prova]) expect(b.spento, `«${b.testo}» con ${b.conteggio} risultati`).toBe(b.conteggio === 0);

    /* ── L'ESITO, annunciato ─────────────────────────────────────────────────────── */
    const esitoRiga = await page.evaluate(() => {
      const p = document.querySelector('[data-provider-filtro-esito]');
      return { testo: p?.textContent ?? null, live: p?.getAttribute('aria-live') ?? null, ruolo: p?.getAttribute('role') ?? null };
    });
    expect(esitoRiga.testo).toBe(`${elenco.length} fornitori`);
    expect(esitoRiga.live, 'chi non vede la lista deve sentire che il numero è cambiato').toBe('polite');
    expect(esitoRiga.ruolo).toBe('status');

    /* ── E nessuna scrittura: questa prova non tocca niente ──────────────────────── */
    await expect(page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]')).toHaveCount(elenco.length);
  });

  test('FILL-02 — un chip FILTRA davvero, si toglie, e i conteggi non si rimpiccioliscono', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriProvider(page);
    const elenco = await righe(page);
    const c = attesi(elenco);
    const totale = elenco.length;

    /* Il valore più grande è quello che si può provare meglio: filtra e resta qualcosa. */
    const valore = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
    const atteso = c[valore];
    expect(atteso, `nessun fornitore ha «${valore}»: la prova sarebbe vacua`).toBeGreaterThan(0);

    await page.click(`[data-provider-filtro-gruppo="credenziale"] [data-provider-filter="credenziale:${valore}"]`);
    await expect.poll(() => quanteCard(page), { timeout: 15000, message: 'il chip non ha filtrato la lista' }).toBe(atteso);
    /* ⛔ E LE CARD SONO QUELLE GIUSTE, non solo il numero giusto: un filtro che ne
       lasciasse N a caso passerebbe un contatore e non direbbe niente. */
    const rimaste = await page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]')].map((n) => n.dataset.providerId));
    const giuste = elenco.filter((r) => credenzialeDi(r) === valore).map((r) => r.id);
    expect([...rimaste].sort()).toEqual([...giuste].sort());

    /* ── IL CONTEGGIO NON SEGUE IL FILTRO: è il numero di TUTTI, o la faccetta mentirebbe
          dicendo che gli altri non esistono ─────────────────────────────────────────── */
    const dopo = await leggiChip(page, 'credenziale');
    expect(dopo.find((b) => b.valore === valore).conteggio, 'il conteggio resta quello dell\'elenco intero').toBe(atteso);
    expect(dopo.filter((b) => b.valore !== valore).every((b) => !b.spento), 'gli altri restano accendibili: è così che si cambia filtro').toBe(true);

    /* ── L'ESITO LO DICE, e «Togli i filtri» compare ─────────────────────────────── */
    await expect(page.locator('[data-provider-filtro-esito]')).toHaveText(`${atteso} fornitori su ${totale}`);
    await expect(page.locator('[data-provider-filtro-togli]')).toBeVisible();
    await expect(page.locator(`[data-provider-filter="credenziale:${valore}"]`)).toHaveAttribute('aria-pressed', 'true');

    /* ── E SI TOGLIE ─────────────────────────────────────────────────────────────── */
    await page.click(`[data-provider-filter="credenziale:${valore}"]`);
    await expect.poll(() => quanteCard(page), { timeout: 15000, message: 'togliendo il chip la lista non è tornata' }).toBe(totale);
    await expect(page.locator('[data-provider-filtro-esito]')).toHaveText(`${totale} fornitori`);
    await expect(page.locator('[data-provider-filtro-togli]')).toBeHidden();
  });

  test('FILL-03 — OR dentro una faccetta, AND fra faccette, e la ricerca è una terza faccetta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriProvider(page);
    /* ⛔ Righe SINTETICHE, e dichiarate: servono a provare la LOGICA (OR/AND) con le
       combinazioni che i dati veri di questo banco non hanno — un ambiente con una chiave
       salvata, uno con una chiave d'ambiente, due senza. Non sono un surrogato del
       prodotto: il renderer è quello vero, e le righe sono la sua materia prima. */
    const finte = await page.evaluate(() => {
      const base = { execution: 'collegato', supportsEndpoint: true, endpoint: 'https://x.test/v1', timeoutSeconds: 60 };
      const righe = [
        { ...base, id: 'a-salvata', label: 'Alfa', requiresKey: true, keyConfigured: true },
        { ...base, id: 'b-ambiente', label: 'Beta', requiresKey: true, origineChiave: 'ambiente' },
        { ...base, id: 'c-mancante', label: 'Gamma', requiresKey: true },
        { ...base, id: 'd-mancante', label: 'Delta', requiresKey: true },
        { ...base, id: 'e-facoltativa', label: 'Epsilon', requiresKey: false, execution: 'runtime locale' },
      ];
      window.__finte = righe;
      const lista = document.querySelector('#modelLabCard [data-model-lab-panel="providers"] #providerList');
      /* Le prove si passano dal vivo: la mappa dice che Alfa e Gamma sono state provate. */
      window.__prove = new Map([['a-salvata', { esito: 'collegato' }], ['c-mancante', { esito: 'errore' }]]);
      window.__prov.aggiornaProviderList(lista, righe, { prove: window.__prove });
      return righe.length;
    });
    expect(finte).toBe(5);
    const conta = async () => quanteCard(page);
    await expect.poll(conta, { timeout: 15000 }).toBe(5);
    const chip = await leggiChip(page, 'credenziale');
    expect(Object.fromEntries(chip.map((b) => [b.valore, b.conteggio])), 'i conteggi delle righe finte').toEqual({ impostata: 2, daImpostare: 2, facoltativa: 1 });

    /* ── OR DENTRO UNA FACCETTA: due valori accesi insieme ALLARGANO ─────────────── */
    await page.click('[data-provider-filter="credenziale:impostata"]');
    await expect.poll(conta, { timeout: 15000 }).toBe(2);
    await page.click('[data-provider-filter="credenziale:daImpostare"]');
    await expect.poll(conta, { timeout: 15000, message: 'due valori della STESSA faccetta devono sommarsi (OR)' }).toBe(4);

    /* ── E AND FRA FACCETTE: «provato» restringe ─────────────────────────────────── */
    await page.click('[data-provider-filter="prova:provato"]');
    await expect.poll(conta, { timeout: 15000, message: 'una faccetta diversa deve RESTRINGERE (AND)' }).toBe(2);
    /* ⛔ La ricerca è SCOPED al pannello: il VELO «Fornitori e accessi» tiene nel documento una
       card di esempio con `data-provider-id` (`popolaVeloFornitori`, la statica), e un
       `querySelectorAll('[data-provider-id]')` nudo la conterebbe — una prova che legge il
       documento intero misura anche ciò che non sta provando. */
    const rimaste = await page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]')].map((n) => n.dataset.providerId).sort());
    expect(rimaste, 'impostata|daImpostare E provato = Alfa e Gamma').toEqual(['a-salvata', 'c-mancante']);

    /* ── E LA RICERCA È UNA TERZA FACCETTA, in AND con le altre due ──────────────── */
    const nelPannello = () => page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]')].map((n) => n.dataset.providerId));
    await page.fill('[data-provider-filtro-cerca]', 'gam');
    await expect.poll(conta, { timeout: 15000, message: 'la ricerca deve restringere ancora (AND)' }).toBe(1);
    expect(await nelPannello()).toEqual(['c-mancante']);
    /* E cerca anche per identificatore, non solo per etichetta. */
    await page.fill('[data-provider-filtro-cerca]', 'a-salvata');
    await expect.poll(conta, { timeout: 15000 }).toBe(1);
    expect(await nelPannello()).toEqual(['a-salvata']);

    /* ── «TOGLI I FILTRI» LI TOGLIE TUTTI, non solo l'ultimo ─────────────────────── */
    await page.click('[data-provider-filtro-togli]');
    await expect.poll(conta, { timeout: 15000 }).toBe(5);
    expect(await page.evaluate(() => document.querySelector('[data-provider-filtro-cerca]').value)).toBe('');
    expect(await page.evaluate(() => document.querySelector('[data-provider-filtro-togli]').hidden)).toBe(true);

    /* ── E IL FILTRO CHE NON LASCIA NIENTE HA UNA FRASE SUA ──────────────────────── */
    await page.fill('[data-provider-filtro-cerca]', 'zuzzurellone');
    await expect.poll(conta, { timeout: 15000 }).toBe(0);
    const vuoto = await page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-c="EmptyState"]').textContent();
    expect(vuoto, 'un filtro che non lascia niente non può accusare il server').toContain('con questi filtri');
    expect(vuoto).not.toContain('server');
  });
});

/*
 * ============================================================================
 * LOG-05 — LA REGOLA DEL MONOGRAMMA, e le sue tre metà
 * ============================================================================
 * ⛔ Owner, 19/09/2026: «Per quelli che non hanno i loghi, usa la lettera come si fa di
 *   convenzione». La convenzione è quella dell'avatar con le iniziali, e le fonti la documentano
 *   (Siemens Element · Astryx/Meta · retro-ai issue #37 — «multiple team members with same first
 *   initial are indistinguishable»). ⛔ Ma NESSUNA fonte dice cosa fare quando due monogrammi
 *   restano uguali anche a due lettere: qui lo risolve la tabella `MONOGRAMMI`, e questa prova la
 *   tiene onesta su tre cose che si possono sbagliare in silenzio:
 *     1. la lettera **non si inventa**: ogni lettera del monogramma deve comparire nell'etichetta
 *        che il server dichiara, NELL'ORDINE in cui compare;
 *     2. **due fornitori non portano lo stesso monogramma** — e chi collide a una lettera sta
 *        nella tabella, o la prova lo nomina;
 *     3. la tabella **non ha righe in più**: ogni riga corrisponde a una collisione vera.
 * ============================================================================
 */
test('LOG-05 — il monogramma: la lettera viene dal nome, è unica, e la tabella copre tutte le collisioni', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await apriProvider(page);
  const esito = await page.evaluate(async () => {
    const modulo = await import('/__lab/loghi-fornitori.js');
    const senza = window.__righe.filter((r) => !modulo.marchioDiFornitore(r));
    return {
      senza: senza.map((r) => ({ id: r.id, label: r.label, monogramma: modulo.monogrammaFornitore(r), iniziale: modulo.inizialeFornitore(r) })),
      collisioni: modulo.collisioniDiIniziale(senza),
      tabella: Object.keys(modulo.MONOGRAMMI),
      dichiarati: Object.keys(modulo.SENZA_MARCHIO),
    };
  });

  /* ── LA PREMESSA: senza fornitore senza marchio, la prova sarebbe vacua ─────────────────── */
  expect(esito.senza.length, 'il banco deve avere fornitori senza marchio').toBeGreaterThan(0);

  /* ── 1. LA LETTERA VIENE DAL NOME, NELL'ORDINE ──────────────────────────────────────────── */
  for (const r of esito.senza) {
    const normalizzato = r.label.toUpperCase().replace(/[^A-Z0-9]/gu, '');
    let da = 0;
    for (const lettera of r.monogramma) {
      const dove = normalizzato.indexOf(lettera, da);
      expect(dove, `il monogramma «${r.monogramma}» di ${r.id} contiene una lettera che l'etichetta «${r.label}» non ha: le lettere non si inventano`).toBeGreaterThanOrEqual(0);
      da = dove + 1; // ⛔ e NELL'ORDINE: «NE» per «Nebius» sì, «EN» no
    }
    expect(r.monogramma[0], `il monogramma di ${r.id} non comincia con l'iniziale del nome`).toBe(r.iniziale);
  }

  /* ── 2. NESSUNO PORTA LO STESSO MONOGRAMMA ──────────────────────────────────────────────── */
  const perMonogramma = new Map();
  for (const r of esito.senza) perMonogramma.set(r.monogramma, [...(perMonogramma.get(r.monogramma) || []), r.id]);
  const doppi = [...perMonogramma.entries()].filter(([, ids]) => ids.length > 1);
  expect(doppi, `questi fornitori portano lo stesso monogramma: ${JSON.stringify(doppi)}`).toEqual([]);

  /* ── 3. E CHI COLLIDE A UNA LETTERA STA NELLA TABELLA ───────────────────────────────────── */
  const collisi = new Set(esito.collisioni.flatMap((c) => c.ids));
  expect(collisi.size, 'il banco deve avere almeno una collisione a una lettera: senza, la tabella non servirebbe').toBeGreaterThan(0);
  for (const id of collisi) expect(esito.tabella, `${id} collide a una lettera e non è nella tabella: due schede porterebbero la stessa lettera`).toContain(id);
  for (const id of esito.tabella) expect(collisi.has(id), `${id} è nella tabella ma la sua iniziale non collide con nessuno: una riga in più è una regola che mente`).toBe(true);

  /* ── E I SENZA MARCHIO SONO ESATTAMENTE QUELLI CHE DICHIARANO PERCHÉ ────────────────────── */
  /* ⛔ Il numero non si scrive a mano: si CONFRONTANO le due liste. Il 19/09/2026 ne sono
     arrivati due in più (Anthropic e Mistral, tolti su ordine dell'owner) e questa riga li ha
     accettati senza essere toccata — mentre la collisione che hanno portato con sé l'ha trovata
     l'asserzione qui sopra, che ha nominato `anthropic`. */
  for (const r of esito.senza) expect(esito.dichiarati, `${r.id} non dice perché non ha il marchio`).toContain(r.id);
  expect(esito.senza.map((r) => r.id).sort()).toEqual([...esito.dichiarati].sort());
});

test.describe('i loghi veri dei fornitori', () => {
  test('LOG-01 — ogni fornitore che ha un marchio verificabile lo MOSTRA, e gli altri il ripiego', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriProvider(page);
    const elenco = await righe(page);
    const esito = await page.evaluate(async () => {
      const modulo = await import('/__lab/loghi-fornitori.js');
      window.__loghi = modulo;
      /* Il conto lo fa il MODULO (`contaMarchi`), e le card si contano a parte: se le due
         letture non tornano, una delle due mente — ed è il solo modo di saperlo. */
      const conto = modulo.contaMarchi(window.__righe);
      const con = new Set(conto.fornitoriConMarchio);
      const senza = window.__righe.filter((r) => !con.has(r.id)).map((r) => r.id);
      const carte = [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]')].map((c) => ({
        id: c.dataset.providerId,
        haMarchio: Boolean(c.querySelector('.talos-provider__glifo svg[data-marchio]')),
        glifo: c.querySelector('.talos-provider__glifo')?.dataset.glifo ?? null,
        /* ⛔ Il marchio è una forma DISEGNATA (un `<svg>` con un `<path>`); il ripiego è il
           MONOGRAMMA (un `<span>` con la lettera). Si guarda che il glifo disegni qualcosa in
           entrambi i casi — mai un riquadro vuoto — e che i due non si scambino. */
        tracciato: c.querySelector('.talos-provider__glifo svg path')?.getAttribute('d') ?? null,
        monogramma: c.querySelector('.talos-provider__glifo .talos-provider__monogramma')?.textContent ?? null,
        monogrammaNascosto: c.querySelector('.talos-provider__glifo .talos-provider__monogramma')?.getAttribute('aria-hidden') ?? null,
      }));
      return { con: [...con], senza, carte, dichiaratiSenza: Object.keys(modulo.SENZA_MARCHIO) };
    });

    /* ── LA PREMESSA SI ASSERISCE: se nessuno avesse il marchio, la prova sarebbe vacua ── */
    expect(esito.con.length, 'il server deve dichiarare dei fornitori, e almeno uno con marchio').toBeGreaterThan(0);
    expect(esito.con.length + esito.senza.length).toBe(elenco.length);
    /* ⛔ E IL CONTO DEL MODULO DEVE TORNARE CON QUELLO DELLE CARD: se il modulo dice «14 con
       marchio» e le card ne disegnano 13, un fornitore è passato per il ripiego senza che la
       mappa lo sapesse. Due misure indipendenti, e devono coincidere. */
    const disegnati = esito.carte.filter((c) => c.haMarchio).length;
    expect(disegnati, `il modulo dichiara ${esito.con.length} marchi e le card ne disegnano ${disegnati}`).toBe(esito.con.length);

    /* ── UNO PER UNO: chi ha il marchio ce l'ha, chi non l'ha ha il ripiego, e si vede ── */
    for (const carta of esito.carte) {
      if (esito.con.includes(carta.id)) {
        expect(carta.haMarchio, `la card ${carta.id} ha il marchio in mappa ma non lo disegna`).toBe(true);
        expect(carta.glifo).toBe('marchio');
        expect(carta.tracciato, `la card ${carta.id} non disegna nessun tracciato`).toBeTruthy();
        expect(carta.monogramma, `la card ${carta.id} ha il marchio E il ripiego insieme: due glifi in un riquadro`).toBe(null);
      } else {
        expect(carta.haMarchio, `la card ${carta.id} disegna un marchio che non le spetta`).toBe(false);
        expect(carta.glifo, `la card ${carta.id} non dichiara il ripiego`).toBe('monogramma');
        /* ⛔ Il ripiego NON è un riquadro vuoto: è la LETTERA, e non è un marchio disegnato. */
        expect(carta.monogramma, `la card ${carta.id} non disegna niente al posto del marchio`).toBeTruthy();
        expect(carta.monogramma, `il monogramma di ${carta.id} non è una lettera`).toMatch(/^[A-Z]{1,3}$/u);
        expect(carta.tracciato, `il ripiego di ${carta.id} non deve essere una forma disegnata: sembrerebbe un marchio vero`).toBe(null);
        /* E il nome lo dice il testo della card: due lettere staccate in più sarebbero rumore. */
        expect(carta.monogrammaNascosto, 'il monogramma non deve finire nel nome accessibile').toBe('true');
      }
    }

    /* ── E L'ELENCO DI CHI NON CE L'HA È DICHIARATO, con una ragione, non con un buco ── */
    for (const id of esito.senza) {
      const ragione = await page.evaluate((i) => window.__loghi.SENZA_MARCHIO[i] ?? null, id);
      if (id !== 'ollama-cloud' && id !== 'minimax-anthropic') {
        expect(ragione, `${id} non ha il marchio e non dice perché: un buco non è una risposta`).toBeTruthy();
        expect(ragione.length, `la ragione di ${id} è troppo corta per essere una ragione`).toBeGreaterThan(20);
      }
    }
    await expect(page.locator('#modelLabCard [data-model-lab-panel="providers"] [data-provider-id]')).toHaveCount(elenco.length);
  });

  test('LOG-02 — i marchi sono MONOCROMI e non si chiede niente a nessuno per averli', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const { esterne } = await apriProvider(page);

    const disegno = await page.evaluate(() => {
      const svg = [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] .talos-provider__glifo svg[data-marchio]')];
      return {
        quanti: svg.length,
        /* Nessun colore scritto addosso: il marchio prende il colore del tema. Se un `fill`
           portasse un esadecimale, in tema chiaro o scuro uno dei due sarebbe illeggibile. */
        /* ⛔ In minuscolo: il CSSOM di Chrome riscrive `currentColor` in `currentcolor`, e un
           confronto per stringa esatta accuserebbe il prodotto di una differenza di maiuscole. */
        colori: [...new Set(svg.map((n) => String(n.style.fill || getComputedStyle(n).fill).toLowerCase()))],
        esadecimali: svg.flatMap((n) => [...n.attributes].map((a) => a.value)).filter((v) => /#[0-9a-f]{3,8}/i.test(v)),
        taglie: [...new Set(svg.map((n) => `${n.getBoundingClientRect().width}x${n.getBoundingClientRect().height}`))],
      };
    });
    expect(disegno.quanti, 'almeno un marchio disegnato').toBeGreaterThan(0);
    expect(disegno.colori, 'il marchio si dipinge col colore del tema, non con un colore suo').toEqual(['currentcolor']);
    expect(disegno.esadecimali, 'nessun esadecimale del marchio addosso al nodo').toEqual([]);
    expect(disegno.taglie, 'la misura del mockup: 22×22 dentro il riquadro da 38').toEqual(['22x22']);

    /*
     * ⛔ E IL MONOGRAMMA HA LA STESSA MISURA, o la riga delle card ballerebbe: le card con un
     *   marchio e quelle con la lettera devono avere il glifo della stessa altezza. E ha la forma
     *   dell'AVATAR (un cerchio), che è ciò che lo distingue a colpo d'occhio da un marchio vero.
     */
    const ripieghi = await page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="providers"] .talos-provider__monogramma')].map((n) => {
      const r = n.getBoundingClientRect(); const cs = getComputedStyle(n);
      return { lato: `${Math.round(r.width)}x${Math.round(r.height)}`, raggio: cs.borderTopLeftRadius, testo: n.textContent, aria: n.getAttribute('aria-hidden') };
    }));
    expect(ripieghi.length, 'il banco ha fornitori senza marchio: senza, questa metà della prova sarebbe vacua').toBeGreaterThan(0);
    for (const m of ripieghi) {
      expect(m.lato, `il monogramma «${m.testo}» non ha la misura del marchio`).toBe('22x22');
      expect(m.raggio, 'il monogramma è un cerchio: è la forma che non si scambia per un logo').toBe('50%');
      expect(m.aria, 'il monogramma non deve finire nel nome accessibile').toBe('true');
    }
    /* E le altezze dei due glifi, misurate insieme, devono coincidere. */
    const altezze = await page.evaluate(() => {
      const dentro = (sel) => [...document.querySelectorAll(`#modelLabCard [data-model-lab-panel="providers"] .talos-provider__glifo ${sel}`)].map((n) => Math.round(n.getBoundingClientRect().height));
      /* ⛔ ARRAY, non `Set`: un `Set` non attraversa il confine di `page.evaluate` (Playwright lo
         serializza come `{}`), e la prima stesura di questa riga moriva con «not iterable». */
      const unici = (a) => [...new Set(a)];
      return { marchi: unici(dentro('svg[data-marchio]')), monogrammi: unici(dentro('.talos-provider__monogramma')) };
    });
    expect(altezze.marchi, 'i marchi hanno tutti la stessa altezza').toHaveLength(1);
    expect(altezze.monogrammi, 'e i monogrammi la stessa dei marchi').toEqual(altezze.marchi);

    /* ── E VERSO L'ESTERNO: ZERO. È la riga che l'owner ha chiesto di misurare. ───── */
    const versoFuori = esterne.filter((u) => !u.startsWith('data:'));
    expect(versoFuori, `i loghi non devono chiedere niente a un host esterno: ${JSON.stringify(versoFuori)}`).toEqual([]);
  });

  test('LOG-03 — il tracciato nel bundle e l\'SVG su disco dicono la STESSA cosa', async ({ page }) => {
    /* ⛔ Due copie esistono per una ragione: il bundle non può leggere un file a runtime
       (sarebbe una richiesta, e local-first dice di no) e l'asset serve a chi deve poter
       guardare la provenienza. Ma due copie DIVERGONO, ed è così che un file "verificato"
       smette di essere quello che si disegna: qui si confrontano, uno per uno. */
    await page.setViewportSize({ width: 1440, height: 900 });
    await apriProvider(page);
    const nelBundle = await page.evaluate(async () => {
      const modulo = await import('/__lab/loghi-fornitori.js');
      const fuori = [];
      for (const r of window.__righe) {
        const m = modulo.marchioDiFornitore(r);
        if (m) fuori.push({ id: r.id, chiave: m.chiave, d: m.d });
      }
      return fuori;
    });
    expect(nelBundle.length).toBeGreaterThan(0);
    for (const voce of nelBundle) {
      const suDisco = readFileSync(resolve(ASSET, `${voce.chiave}.svg`), 'utf8');
      const tracciato = /d="([^"]+)"/u.exec(suDisco)?.[1];
      expect(tracciato, `manca il tracciato in ${voce.chiave}.svg`).toBeTruthy();
      expect(voce.d, `il tracciato di ${voce.chiave} nel bundle non è quello del file su disco`).toBe(tracciato);
    }
    /* E la provenienza si dichiara, per ogni marchio usato. */
    const provenienza = JSON.parse(readFileSync(resolve(ASSET, 'provenienza.json'), 'utf8'));
    expect(provenienza.fonte).toBe('simple-icons');
    expect(provenienza.licenza, 'la licenza della sorgente, scritta accanto ai file').toBe('CC0-1.0');
    const chiavi = new Set(provenienza.icone.map((i) => i.chiave));
    for (const voce of new Set(nelBundle.map((v) => v.chiave))) expect(chiavi.has(voce), `${voce} non è dichiarato in provenienza.json`).toBe(true);
  });
});

/*
 * LE FOTO — le stesse due combinazioni di `lab-provider.spec.mjs`, con la riga dei filtri
 * in cima alla lista.
 */
test('FILL-FOTO — i filtri e i loghi nei due temi e alle due larghezze', async ({ page }) => {
  for (const modo of ['dark', 'light']) {
    for (const larghezza of [1440, 1024]) {
      const nuova = await page.context().newPage();
      await nuova.setViewportSize({ width: larghezza, height: 900 });
      await apriProvider(nuova, { colorMode: modo });
      /* Si porta in cima la RIGA DEI FILTRI, non la lista: la riga sta SOPRA la lista, e
         inquadrando la lista si fotograferebbe proprio ciò che non si vuole mostrare. */
      await nuova.evaluate(() => document.querySelector('[data-provider-filtri-riga]')?.scrollIntoView({ block: 'start' }));
      await nuova.waitForTimeout(250);
      await foto(nuova, `filtri-${modo}-${larghezza}`);
      /* E una foto coi filtri ACCESI: un chip acceso che non si distingue da uno spento è la
         stessa classe di difetto del pulsante che promette un'altra cosa. */
      await nuova.click('[data-provider-filtro-gruppo="credenziale"] [data-provider-filter$="daImpostare"]');
      await nuova.waitForTimeout(250);
      await foto(nuova, `filtri-accesi-${modo}-${larghezza}`);
      await nuova.close();
    }
  }
});
