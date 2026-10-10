import { test, expect } from '@playwright/test';

/*
 * C1 (owner 10/10/2026) — la scheda Contesto della colonna destra, sulle decisioni dell'owner (AskUserQuestion, tutte «Recommended»):
 *  · il limite mostrato è quello che AGISCE, col perché: un numero solo con l'avviso del compositore;
 *  · la barra per categoria viene dalla richiesta VERA (`talos.contesto-richiesta`), ogni categoria con «~»;
 *  · la card «Compattazioni»: quante, l'ultima, i token, il livello 1 di questa richiesta, e «cosa ha tenuto» dai CAMPI;
 *  · il prompt di sistema e i messaggi grezzi (`GET /last-request`), l'esportazione, «Compatta ora» con conferma.
 * Scene rigiocate dal browser: il server (4177) non conosce queste sessioni, e ogni richiesta non-GET si ferma e si conta.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const MODELLO = 'prova/modello-scheda-contesto';
const usageGiro = (prompt, completion) => ({ type: 'StateDelta', delta: [{ op: 'replace', path: '/usage', value: { prompt_tokens: prompt, completion_tokens: completion, cached_tokens: 0, giri: 1 } }] });
const consumo = (prompt, completion) => ({ type: 'CUSTOM', name: 'consumo-fornitore', value: { tipo: 'consumo-fornitore', provider: 'openrouter', model: MODELLO, usage: { prompt_tokens: prompt, completion_tokens: completion, total_tokens: prompt + completion }, esito: 'completato' } });
const giro = (id, consegna, prompt, testo) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${id}`, input: { consegna } },
  consumo(prompt, 800), usageGiro(prompt, 800),
  { type: 'TextMessageStart', messageId: `m-${id}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `m-${id}`, delta: testo },
  { type: 'TextMessageEnd', messageId: `m-${id}` },
  { type: 'RunFinished', threadId: 't', runId: `r-${id}` },
];
const RIPARTIZIONE = { categorie: [
  { id: 'system', tokens: 4_200 }, { id: 'rules', tokens: 1_800 }, { id: 'memory', tokens: 900 },
  { id: 'tools', tokens: 9_600 }, { id: 'mcp', tokens: 2_400 }, { id: 'conversation', tokens: 74_000 },
] };
const RICHIESTA = { type: 'CUSTOM', name: 'talos.contesto-richiesta', value: { at: '2026-10-10T09:30:00.000Z', model: MODELLO, ripartizione: RIPARTIZIONE, level1: { cleared: 3, shortened: 1 } } };
const COMPATTATA = { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'fine', compattato: true, motivo: 'soglia', at: '2026-10-10T09:00:00.000Z', tokenPrima: 151_000, tokenDopo: 18_000, coveredThrough: 4 } };
const ULTIMA = {
  at: '2026-10-10T09:30:00.000Z', model: MODELLO,
  messages: [
    { role: 'system', content: 'You are TALOS, a coding agent. Follow the project rules.' },
    { role: 'user', content: 'Aggiungi i test per la cache dei modelli' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: '{"path":"src/cache.mjs"}' } }] },
    { role: 'user', content: [{ type: 'text', text: 'Guarda anche questa foto' }, { type: 'image_url', omitted: true }] },
  ],
  tools: [{ type: 'function', function: { name: 'read_file' } }, { type: 'function', function: { name: 'mcp__github__search' } }],
};

const numera = (eventi) => eventi.map((e, i) => ({ ...e, _sequenza: i + 1 }));
const SCENE = {
  legacy: numera([...giro(1, 'Prepara la cache', 151_000, 'Cache preparata.'), COMPATTATA, ...giro(2, 'Aggiungi i test', 98_000, 'Test aggiunti.'), RICHIESTA]),
  motore: numera([...giro(1, 'Prepara la cache', 98_000, 'Cache preparata.'), RICHIESTA]),
  ordine: numera(giro(1, 'Prepara la cache', 98_000, 'Cache preparata.')),
  /* 40 giri: l'Indice dei giri è più alto di una pagina da 1080 */
  lunga: numera([...giro(1, 'Prepara la cache', 20_000, 'Cache preparata.'), ...Array.from({ length: 39 }, (_, i) => giro(i + 2, `Passo ${i + 2}`, 20_000 + i * 100, `Fatto il passo ${i + 2}.`)).flat()]),
};
const busta = (data) => ({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const MOTORE = (sessionId) => ({
  sessionId, revision: 7, stateRevision: 7, settings: {}, jobs: [{ id: 'j1', kind: 'compact', state: 'committed' }, { id: 'j2', kind: 'compact', state: 'cancelled' }],
  activeVersion: {
    id: 'v1', createdAt: '2026-10-10T08:45:00.000Z', summary: { text: 'La persona vuole la cache dei modelli con i test.' },
    retained: { personRequests: { total: 3, kept: [{ n: 1, text: 'Prepara la cache' }, { n: 3, text: 'Non toccare i file di rilascio' }] }, anchorIndex: 'src/cache.mjs\nERR_CACHE_MISS' },
    measurement: { inputTokens: 21_000 },
  },
  facts: [{ text: 'Il progetto usa pnpm', status: 'active' }, { text: 'Fatto tolto', status: 'removed' }],
  budget: { windowTokens: 200_000, inputLimit: 170_000, triggerTokens: 130_212, inputTokens: 98_000, method: 'runtime' },
  measurement: { revision: 7, measuredAt: '2026-10-10T09:30:00.000Z', tokens: { inputTokens: 98_000, windowTokens: 200_000, responseReserve: 16_384, method: 'runtime', exact: true } },
  settings: { auto: true },
});

async function apri(page, chiave, { tema = 'dark', larghezza = 1920, altezza = 1080, dopo = [], stato = null, impostazioni = null, modelli = null, motore = null, contesto = null, politica = null } = {}) {
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const contatore = { nonGet: 0 };
  await page.routeWebSocket(/.*/, (ws) => ws.close());
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const percorso = new URL(req.url()).pathname;
    const m = percorso.match(/\/api\/v1\/sessions\/sc-(\w+)-[a-z0-9]+\/([\w-]+)$/);
    if (impostazioni && req.method() === 'POST' && /\/settings$/.test(percorso)) return impostazioni(route); // il cambio di modello, contato da chi chiama
    if (req.method() !== 'GET') { contatore.nonGet += 1; contatore.scritture = [...(contatore.scritture ?? []), percorso]; return route.abort(); }
    // il Context Manager legge anche le versioni del motore (`listContextVersions`)
    const v = percorso.match(/\/api\/v1\/sessions\/(sc-motore-[a-z0-9]+)\/context\/versions$/);
    if (v) return contesto?.versioni ? contesto.versioni(route) : route.fulfill({ json: { versions: [{ id: 'v1', sessionId: v[1], createdAt: '2026-10-10T08:45:00.000Z', summary: { text: 'La persona vuole la cache dei modelli con i test.' } }] } });
    if (modelli && percorso === '/api/v1/models') return route.fulfill({ json: busta({ modelli, daCache: true }) });
    if (m) {
      const [, scena, coda] = m;
      const id = percorso.split('/')[4];
      if (coda === 'events') return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SCENE[scena], CONFINE, ...dopo].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
      if (coda === 'metrics') return route.fulfill({ json: busta({ registrato: true, cacheSessione: null, ragionamentiMs: {} }) });
      if (coda === 'last-request') return route.fulfill({ json: busta({ ultimaRichiesta: ULTIMA }) });
      if (coda === 'compaction-state' && stato) return stato(route);
      if (coda === 'compaction-state') return route.fulfill({ json: busta(scena === 'legacy' ? { record: { at: COMPATTATA.value.at, riassunto: 'Riassunto legacy: cache preparata.', indice: 'src/cache.mjs' }, inCorso: false } : { record: null, inCorso: false }) });
      if (coda === 'compaction-policy' && politica) return politica(route);
      if (coda === 'compaction-policy') return route.fulfill({ json: busta({ windowTokens: 200_000, triggerTokens: 150_000, warningTokens: 120_000, source: 'route-minimum' }) });
      if (coda === 'context') {
        if (scena === 'motore' && contesto?.stato) return contesto.stato(route, id);
        if (scena === 'motore') return route.fulfill({ json: motore ? motore(id) : MOTORE(id) }); // la rotta del motore risponde grezza (context-client.js)
        return route.fulfill({ status: 503, json: { ok: false, error: { code: 'CTX_NOT_ENABLED', message: 'The context engine is not active for this conversation.' }, meta: {} } });
      }
    }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate(({ id, modello }) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Scheda del contesto', modello, { conclusa: true, modello });
  }, { id: `sc-${chiave}-a1`, modello: MODELLO });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 15_000 });
  await expect(page.locator('#conversation')).toContainText(chiave === 'legacy' ? 'Test aggiunti.' : 'Cache preparata.', { timeout: 10_000 });
  await page.locator('#railTabs [data-rail="contesto"]').click();
  return contatore;
}

const finestra = (page) => page.locator('#railContesto [data-c="InspectorCard"]').filter({ hasText: 'Finestra del contesto' });
const riga = (card, etichetta) => card.locator('.talos-kv').filter({ has: card.page().locator('.talos-kv__k', { hasText: etichetta }) }).locator('.talos-kv__v');

test.describe('C1 — la scheda Contesto', () => {
  test('C1-SCHEDA-01 legacy — il limite che agisce (150k, 75% della finestra), la barra della richiesta vera, le compattazioni', async ({ page }) => {
    const c = await apri(page, 'legacy');
    const f = finestra(page);
    await expect(f.locator('.talos-inspector-card__head > span')).toHaveText('150k', { timeout: 10_000 });
    await expect(f.locator('[data-contesto-perche]')).toContainText('75%');
    await expect(f.locator('#contestoSchedaBarra')).toBeVisible();
    await expect(f.locator('#contestoSchedaBarra .talos-contesto__fetta')).toHaveCount(6);
    await expect(riga(f, 'Attrezzi MCP')).toHaveText('2,4k · 1,6%');
    await expect(riga(f, 'Attrezzi MCP')).toHaveClass(/talos-measure--estimate/);
    await expect(riga(f, 'In uso (misurato)')).toContainText('98');
    await expect(riga(f, 'Prima della compattazione')).toContainText('52');
    const comp = page.locator('#contestoCompattazioni');
    await expect(riga(comp, 'Compattazioni')).toHaveText('1');
    await expect(riga(comp, "Dopo l'ultima")).toContainText('151k → 18k');
    await expect(riga(comp, 'In questa richiesta')).toContainText('3 messe da parte · 1 accorciate');
    await expect(riga(comp, 'Indice di percorsi ed errori')).toHaveText('tenuto');
    expect(c.nonGet).toBe(0);
  });

  test('C1-SCHEDA-02 legacy — «Mostra la richiesta inviata» e «Mostra cosa ha tenuto» aprono le finestre coi dati veri', async ({ page }) => {
    const c = await apri(page, 'legacy');
    await page.locator('#contestoAltro').click();
    await page.locator('#contestoRichiesta').click();
    const modale = page.locator('dialog[open], [role="dialog"]').filter({ hasText: 'La richiesta inviata al modello' }).last();
    await expect(modale).toContainText('You are TALOS, a coding agent.');
    await expect(modale).toContainText('→ read_file({"path":"src/cache.mjs"})');
    await expect(modale).toContainText('[immagine non mostrata]');
    await expect(modale).toContainText('mcp__github__search');
    await page.keyboard.press('Escape');
    await page.locator('#compattazioniAltro').click();
    await page.locator('#compattazioniTenuto').click();
    const tenuto = page.locator('dialog[open], [role="dialog"]').filter({ hasText: 'Cosa ha tenuto la compattazione' }).last();
    await expect(tenuto).toContainText('Riassunto legacy: cache preparata.');
    await expect(tenuto).toContainText('src/cache.mjs');
    expect(c.nonGet).toBe(0);
  });

  test('C1-SCHEDA-03 — «Compatta ora…» chiede conferma, e annullando non parte niente', async ({ page }) => {
    const c = await apri(page, 'legacy');
    await page.locator('#contestoAltro').click();
    await page.locator('#contestoCompatta').click();
    const conferma = page.locator('dialog[open], [role="dialog"], [role="alertdialog"]').filter({ hasText: 'Compattare adesso la conversazione?' }).last();
    await expect(conferma).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(conferma).toBeHidden();
    await page.waitForTimeout(300);
    expect(c.nonGet).toBe(0);
  });

  test('C1-SCHEDA-04 motore — il limite è il budget del motore (130k), e «cosa ha tenuto» viene dai CAMPI della versione', async ({ page }) => {
    const c = await apri(page, 'motore');
    const f = finestra(page);
    await expect(f.locator('.talos-inspector-card__head > span')).toHaveText('130,2k', { timeout: 10_000 });
    await expect(f.locator('[data-contesto-perche]')).toContainText('motore del contesto');
    const comp = page.locator('#contestoCompattazioni');
    await expect(riga(comp, 'Compattazioni')).toHaveText('1');
    await expect(riga(comp, 'Le tue richieste alla lettera')).toHaveText('2 di 3');
    await expect(riga(comp, 'Fatti protetti')).toHaveText('1');
    await page.locator('#compattazioniAltro').click();
    await page.locator('#compattazioniTenuto').click();
    const tenuto = page.locator('dialog[open], [role="dialog"]').filter({ hasText: 'Cosa ha tenuto la compattazione' }).last();
    await expect(tenuto).toContainText('Non toccare i file di rilascio');
    await expect(tenuto).toContainText('Il progetto usa pnpm');
    await expect(tenuto).not.toContainText('Fatto tolto');
    await expect(tenuto).toContainText('ERR_CACHE_MISS');
    expect(c.nonGet).toBe(0);
  });

  /* Owner 10/10/2026: «collassabili, compresse di default con dettagli minimi dentro la versione compressa, e scrollabili se superano
     l'altezza della pagina»; la scelta di chi apre si ricorda (AskUserQuestion, «Sì, ricordata»). */
  test('C1-SCHEDA-05 — le quattro card nascono compresse con i dettagli minimi, e una aperta resta aperta dopo il ricaricamento', async ({ page }) => {
    const c = await apri(page, 'legacy');
    const card = (k) => page.locator(`#railContesto [data-comprimibile="${k}"]`);
    for (const k of ['ambiente', 'finestra', 'compattazioni', 'giri']) {
      await expect(card(k)).toHaveAttribute('data-compressa', '');
      await expect(card(k).locator('.talos-inspector-card__comprimi')).toHaveAttribute('aria-expanded', 'false');
      await expect(card(k).locator('.talos-kv').first()).toBeHidden();
      if (k !== 'ambiente') await expect(card(k).locator('[data-anteprima]')).toBeVisible();
    }
    await expect(card('ambiente').locator('[data-anteprima]')).toHaveText(''); // la scena non ha ramo: niente, non un «—»
    await expect(card('finestra').locator('[data-anteprima]')).toHaveText('98k / 150k');
    await expect(card('finestra').locator('#contestoSchedaBarra')).toBeVisible(); // la barra è il dettaglio minimo della Finestra
    await expect(card('finestra').locator('#contestoAltro')).toBeVisible(); // le azioni restano fuori dal pulsante
    await expect(card('compattazioni').locator('[data-anteprima]')).toHaveText(/^1 · /);
    await expect(card('giri').locator('[data-anteprima]')).toHaveText('3 giri');
    // si apre: le righe compaiono, l'anteprima sparisce (lo dicono le righe)
    await card('finestra').locator('.talos-inspector-card__comprimi').click();
    await expect(card('finestra')).not.toHaveAttribute('data-compressa', '');
    await expect(card('finestra').locator('.talos-inspector-card__comprimi')).toHaveAttribute('aria-expanded', 'true');
    await expect(card('finestra').locator('.talos-kv').first()).toBeVisible();
    await expect(card('finestra').locator('[data-anteprima]')).toBeHidden();
    // si richiude, e si riapre
    await card('finestra').locator('.talos-inspector-card__comprimi').click();
    await expect(card('finestra')).toHaveAttribute('data-compressa', '');
    await card('finestra').locator('.talos-inspector-card__comprimi').click();
    expect(c.nonGet).toBe(0);
    // ricaricando resta aperta, le altre restano compresse (la colonna può non essere a schermo: si leggono gli attributi)
    await page.reload();
    await page.waitForFunction(() => window.__talosHarnessUiRuntime);
    await expect(card('finestra')).not.toHaveAttribute('data-compressa', '');
    await expect(card('finestra').locator('.talos-inspector-card__comprimi')).toHaveAttribute('aria-expanded', 'true');
    await expect(card('ambiente')).toHaveAttribute('data-compressa', '');
  });

  /* ⛔ Visto sul 4174 il 10/10, su una sessione vera da 200 giri: «417,4k / 750k» in 82 px su 86 — l'ultima cifra tagliata (un
     numero tagliato è un numero sbagliato, BC-58). Le scene di prova avevano «98k / 150k», che ci stava. Il numero non cede mai:
     se manca spazio cede il titolo, coi puntini, e il titolo intero resta nel suggerimento. */
  test('C1-SCHEDA-09 — a long numeric preview is never cut; the title yields first, with its full text as a tooltip', async ({ page }) => {
    const c = await apri(page, 'legacy');
    const card = page.locator('#railContesto [data-comprimibile="finestra"]');
    await expect(card).toHaveAttribute('data-compressa', '');
    for (const valore of ['417,4k / 750k', '1,24M / 1,5M']) {
      const m = await card.evaluate((el, v) => {
        const a = el.querySelector('[data-anteprima]');
        a.textContent = v; // la misura riguarda il CSS della testata, qualunque sia il numero che arriva
        const titolo = el.querySelector('.talos-inspector-card__comprimi b');
        return { anteprimaTagliata: a.scrollWidth > a.clientWidth + 1, larghezza: a.clientWidth, serve: a.scrollWidth, titoloSuggerimento: titolo.getAttribute('title') };
      }, valore);
      expect(m.anteprimaTagliata, `${valore}: ${m.serve}px needed, ${m.larghezza}px given`).toBe(false);
      expect(m.titoloSuggerimento).toBe('Finestra del contesto');
    }
    // al contrario: un NOME lungo (il ramo) cede lui coi puntini, e il titolo «Ambiente» resta leggibile intero
    const ambiente = await page.locator('#railContesto [data-comprimibile="ambiente"]').evaluate((el) => {
      const a = el.querySelector('[data-anteprima]');
      a.textContent = 'feature/a-very-long-branch-name-that-goes-on-and-on-without-end';
      const t = el.querySelector('.talos-inspector-card__comprimi b');
      return { titoloTagliato: t.scrollWidth > t.clientWidth + 1, anteprimaCede: a.scrollWidth > a.clientWidth + 1 };
    });
    expect(ambiente).toEqual({ titoloTagliato: false, anteprimaCede: true });
    expect(c.nonGet).toBe(0);
  });

  /* ⛔ Visto sul 4174 il 10/10 sera, subito dopo un riavvio: `GET /compaction-policy` risponde col RIPIEGO (fonte `fallback`, 200k)
     finché il server non ha letto le rotte del fornitore, e la scheda scriveva «417,4k / 200k» come il limite vero — poi, a pagina
     ricaricata, «/ 750k». Come Hermes («the fallback is never cached», `agent/model_metadata.py:255`): il ripiego si dichiara
     («~») e si rilegge da solo, senza che la persona ricarichi. */
  test('C1-SCHEDA-10 — a fallback limit is marked «~» and re-read until the real one arrives, without a reload', async ({ page }) => {
    let letture = 0;
    const c = await apri(page, 'legacy', { politica: (route) => {
      letture += 1;
      return route.fulfill({ json: busta(letture <= 2
        ? { windowTokens: null, triggerTokens: 200_000, warningTokens: 160_000, source: 'fallback' }
        : { windowTokens: 1_000_000, triggerTokens: 750_000, warningTokens: 600_000, source: 'route-minimum' }) });
    } });
    const anteprima = page.locator('#railContesto [data-comprimibile="finestra"] [data-anteprima]');
    await expect(anteprima).toHaveText('98k / ~200k');
    await expect(anteprima).toHaveText('98k / 750k', { timeout: 15_000 });
    const viste = letture;
    // al contrario: con la politica vera non si rilegge più
    await page.waitForTimeout(4000);
    expect(letture).toBe(viste);
    expect(c.nonGet).toBe(0);
  });

  test('C1-SCHEDA-06 — una card più alta della pagina scorre da sola, con la testata sempre in vista', async ({ page }) => {
    await apri(page, 'lunga');
    const giri = page.locator('#railContesto [data-comprimibile="giri"]');
    await giri.locator('.talos-inspector-card__comprimi').click();
    await expect.poll(() => giri.locator('.talos-kv').count()).toBeGreaterThanOrEqual(40);
    const m = await giri.evaluate((n) => ({ alta: n.scrollHeight, vista: n.clientHeight, pagina: window.innerHeight, overflow: getComputedStyle(n).overflowY }));
    expect(m.overflow).toBe('auto');
    expect(m.vista).toBeLessThan(m.pagina);
    expect(m.alta).toBeGreaterThan(m.vista);
    await giri.evaluate((n) => { n.scrollTop = n.scrollHeight; });
    const testa = giri.locator('.talos-inspector-card__head');
    const [rc, rt] = await Promise.all([giri.boundingBox(), testa.boundingBox()]);
    expect(Math.abs(rt.y - rc.y)).toBeLessThan(2); // in cima alla card anche in fondo allo scorrimento
    await expect(giri.locator('.talos-inspector-card__comprimi')).toBeInViewport();
  });

  /* Review del bugfixer (Y2): una «fine» e poi un «annullata» DAL VIVO fanno partire due letture di `compaction-state`; la più
     vecchia risponde per ULTIMA. «Cosa ha tenuto» deve mostrare la lettura più recente, non quella arrivata dopo. */
  test('C1-SCHEDA-07 — due letture in ordine inverso: vale la più recente', async ({ page }) => {
    let chiamate = 0;
    const stato = async (route) => {
      chiamate += 1;
      const n = chiamate;
      if (n < 3) { await new Promise((r) => setTimeout(r, 1500)); return route.fulfill({ json: busta({ record: { at: COMPATTATA.value.at, riassunto: `VECCHIO ${n}` }, inCorso: false }) }); }
      return route.fulfill({ json: busta({ record: { at: '2026-10-10T09:10:00.000Z', riassunto: 'NUOVO' }, inCorso: false }) });
    };
    const dopo = [COMPATTATA, { type: 'CUSTOM', name: 'talos.compattazione', value: { fase: 'annullata', at: COMPATTATA.value.at, coveredThrough: 4 } }]
      .map((e, i) => ({ ...e, _sequenza: 100 + i }));
    const c = await apri(page, 'ordine', { dopo, stato });
    await expect.poll(() => chiamate, { timeout: 10_000 }).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(2_000); // le due lente hanno risposto, DOPO la veloce
    await page.locator('#compattazioniAltro').click();
    await page.locator('#compattazioniTenuto').click();
    const tenuto = page.locator('dialog[open], [role="dialog"]').filter({ hasText: 'Cosa ha tenuto la compattazione' }).last();
    await expect(tenuto).toContainText('NUOVO');
    await expect(tenuto).not.toContainText('VECCHIO');
    expect(c.nonGet).toBe(0);
  });

  /* Review del bugfixer (punto 1): cambiato il modello, il limite che agisce è quello del modello NUOVO. Il server lo calcola col
     profilo attuale (`budgetDellaMisura(snapshot, profilo)`); l'app rilegge `/context` appena il server accetta il modello, senza
     aspettare il giro dopo. */
  test('C1-SCHEDA-08 motore — cambiato il modello, la testata dice subito il limite del modello nuovo', async ({ page }) => {
    let accettato = false;
    const scritture = [];
    const catalogo = [
      { id: MODELLO, provider: 'prova', nome: 'Prova: finestra 200k', reasoning: { supportedEfforts: [], defaultEffort: null, defaultEnabled: false, mandatory: false } },
      { id: 'prova/finestra-grande', provider: 'prova', nome: 'Prova: finestra 1M', reasoning: { supportedEfforts: [], defaultEffort: null, defaultEnabled: false, mandatory: false } },
    ];
    const motore = (id) => {
      const base = MOTORE(id);
      return accettato ? { ...base, budget: { windowTokens: 1_000_000, inputLimit: 918_000, triggerTokens: 688_500, inputTokens: 98_000, method: 'runtime' } } : base;
    };
    const impostazioni = async (route) => {
      scritture.push(route.request().postDataJSON());
      await new Promise((r) => setTimeout(r, 200));
      accettato = true;
      return route.fulfill({ json: busta({ updated: true }) });
    };
    const c = await apri(page, 'motore', { impostazioni, modelli: catalogo, motore });
    const f = finestra(page);
    await f.locator('.talos-inspector-card__comprimi').click();
    await expect(f.locator('.talos-inspector-card__head > span')).toHaveText('130,2k', { timeout: 10_000 });
    await page.locator('[data-open-sheet="model"]').click();
    await page.locator('.talos-dialog input.sheet-input').fill('finestra-grande');
    await page.getByRole('option').filter({ hasText: 'prova/finestra-grande' }).click();
    await expect.poll(() => scritture.map((w) => w.modello)).toEqual(['prova/finestra-grande']);
    await expect(f.locator('.talos-inspector-card__head > span')).toHaveText('688,5k', { timeout: 5_000 });
    expect(c.nonGet).toBe(0);
  });

  /* ⭐ C1 (owner 10/10/2026, «la modale del Context Manager va rifatta a regola d'arte»): panoramica sempre in alto, poi schede.
     Decisioni: «Panoramica + schede», «Nascoste, con una riga» per il legacy, «Pulsante in panoramica, con conferma». */
  const cm = (page) => page.locator('#veloContesto');
  async function apriCm(page) {
    await page.locator('[data-azione="comprimi"]').first().click();
    await expect(cm(page)).toBeVisible();
  }
  const schedeVisibili = (page) => cm(page).locator('[data-context-tab]:not([hidden])').evaluateAll((n) => n.map((x) => x.dataset.contextTab));

  test('C1-CM-01 motore — panoramica sul limite che agisce, riservati a parte, cinque schede, «Compatta ora…» chiede conferma', async ({ page }) => {
    const c = await apri(page, 'motore');
    await apriCm(page);
    await expect(cm(page).locator('[data-context-headline]')).toHaveText('98k di 130,2k · 75,3%');
    await expect(cm(page).locator('[data-context-measurement]')).toContainText('motore del contesto');
    const barra = cm(page).locator('[data-context-gauge]');
    await expect(barra).toBeVisible();
    await expect(barra.locator('.talos-cm__tacca')).toHaveCount(1);
    await expect(barra.locator('.talos-cm__riservato')).toHaveCount(1);
    await expect(barra).toHaveAttribute('aria-label', /98k di 130,2k in uso; 32,2k liberi prima della compattazione; 69,8k riservati/);
    await expect(cm(page).locator('[data-context-legend]')).toContainText('Riservati');
    await expect(cm(page).locator('[data-context-compactions]')).toContainText('1 · ');
    // owner 10/10 («non troppo affollata»): l'interruttore è un'impostazione, sta nella scheda Impostazioni; a riposo niente riga del lavoro
    await expect(cm(page).locator('.talos-cm__auto')).toBeHidden();
    await expect(cm(page).locator('[data-context-job]')).toBeHidden();
    await cm(page).locator('[data-context-tab="impostazioni"]').click();
    await expect(cm(page).locator('.talos-cm__auto')).toBeVisible();
    await expect(cm(page).locator('[data-context-auto]')).toHaveClass(/talos-switch/);
    await cm(page).locator('[data-context-tab="tenuto"]').click();
    expect(await schedeVisibili(page)).toEqual(['tenuto', 'fatti', 'versioni', 'richiesta', 'impostazioni']);
    await expect(cm(page).locator('[data-context-panel="tenuto"]')).toContainText('Non toccare i file di rilascio');
    await expect(cm(page).locator('details, summary')).toHaveCount(0);
    await expect(cm(page).locator('[data-context-refresh], .talos-dialog__footer')).toHaveCount(0);
    // un clic su «Compatta ora…» NON parte: chiede conferma; «Annulla» la toglie
    await cm(page).locator('[data-context-start]').click();
    const conferma = cm(page).locator('[data-context-conferma-legacy]');
    await expect(conferma).toContainText('Il passato si riassume');
    expect(c.nonGet).toBe(0);
    await conferma.locator('[data-context-conferma-no]').click();
    await expect(conferma).toHaveCount(0);
    expect(c.nonGet).toBe(0);
    // e «Sì, compatta» manda il comando del motore (fermato qui: il 4177 non conosce la sessione)
    await cm(page).locator('[data-context-start]').click();
    await cm(page).locator('[data-context-conferma-si]').click();
    await expect.poll(() => (c.scritture ?? []).some((x) => /\/context\/jobs$/.test(x))).toBe(true);
  });

  test('C1-CM-02 legacy — schede del motore nascoste e una riga lo dice; niente interruttore; numeri della politica', async ({ page }) => {
    const c = await apri(page, 'legacy');
    await apriCm(page);
    await expect(cm(page).locator('[data-context-headline]')).toHaveText('98k di 150k · 65,3%');
    await expect(cm(page).locator('[data-context-measurement]')).toContainText('75%');
    expect(await schedeVisibili(page)).toEqual(['tenuto', 'richiesta']);
    await expect(cm(page).locator('[data-context-legacy-note]')).toBeVisible();
    await expect(cm(page).locator('.talos-cm__auto')).toBeHidden();
    await expect(cm(page).locator('[data-context-status]')).toHaveText('');
    await expect(cm(page).locator('[data-context-panel="tenuto"]')).toContainText('Riassunto legacy: cache preparata.');
    await cm(page).locator('[data-context-tab="richiesta"]').click();
    await expect(cm(page).locator('[data-context-panel="richiesta"]')).toContainText('You are TALOS, a coding agent.');
    await expect(cm(page).locator('[data-context-panel="richiesta"]')).toContainText('[immagine non mostrata]');
    await cm(page).locator('[data-context-start]').click();
    await expect(cm(page).locator('[data-context-conferma-legacy]')).toContainText('Il modello vedrà un riassunto');
    expect(c.nonGet).toBe(0);
  });

  test('C1-CM-03 — una lettura fallita offre «Riprova» (non più «usa Aggiorna»), e Riprova rilegge', async ({ page }) => {
    let primaVolta = true;
    const contesto = { stato: (route, id) => {
      if (primaVolta && route.request().url().endsWith('/context')) { primaVolta = false; return route.fulfill({ status: 500, json: { ok: false, error: { code: 'CTX_BROKEN', message: 'boom' } } }); }
      return route.fulfill({ json: MOTORE(id) });
    } };
    await apri(page, 'motore', { contesto });
    await page.evaluate(() => { /* la colonna ha già letto: la prossima lettura è quella della finestra */ });
    primaVolta = true;
    await apriCm(page);
    await expect(cm(page).locator('[data-context-status]')).toHaveText('Non è stato possibile leggere il contesto.');
    await expect(cm(page).locator('[data-context-retry]')).toBeVisible();
    await cm(page).locator('[data-context-retry]').click();
    await expect(cm(page).locator('[data-context-headline]')).toHaveText('98k di 130,2k · 75,3%');
    await expect(cm(page).locator('[data-context-retry]')).toBeHidden();
  });

  /* Review del bugfixer (Y1, misurato): la rilettura automatica ogni 4 s azzerava la conferma aperta — spariva da sola. */
  test('C1-CM-05 — la conferma di «Compatta ora…» resta aperta mentre la finestra si rilegge da sola', async ({ page }) => {
    let letture = 0;
    const contesto = { stato: (route, id) => { if (route.request().url().endsWith('/context')) letture += 1; return route.fulfill({ json: MOTORE(id) }); } };
    const c = await apri(page, 'motore', { contesto });
    await apriCm(page);
    await cm(page).locator('[data-context-start]').click();
    const conferma = cm(page).locator('[data-context-conferma-legacy]');
    await expect(conferma).toBeVisible();
    const prima = letture;
    await page.waitForTimeout(5_500);
    expect(letture - prima, 'premise: the window re-read itself meanwhile').toBeGreaterThan(0);
    await expect(conferma).toBeVisible();
    expect(c.nonGet).toBe(0);
  });

  /* Review del bugfixer (Y2, misurato): un «Sì» rifiutato fermava per sempre la rilettura automatica. */
  test('C1-CM-06 — dopo una compattazione rifiutata la finestra continua a rileggersi da sola', async ({ page }) => {
    let letture = 0;
    const contesto = { stato: (route, id) => {
      const r = route.request();
      if (r.method() === 'POST' && r.url().endsWith('/context/jobs')) return route.fulfill({ status: 409, json: { error: { code: 'CTX_NOTHING_TO_COMPACT', message: 'nothing' } } });
      if (r.url().endsWith('/context')) letture += 1;
      return route.fulfill({ json: MOTORE(id) });
    } };
    await apri(page, 'motore', { contesto });
    // DOPO `apri`: in Playwright vince l'ultima rotta registrata, e quella generale di `apri` ferma ogni POST
    await page.route('**/api/v1/sessions/*/context/jobs', (route) => contesto.stato(route, null));
    await apriCm(page);
    await cm(page).locator('[data-context-start]').click();
    await cm(page).locator('[data-context-conferma-si]').click();
    await expect(cm(page).locator('[data-context-status]')).toContainText('Non ci sono scambi precedenti');
    const prima = letture;
    await page.waitForTimeout(5_500);
    expect(letture - prima, 'the self-refresh survived the refusal').toBeGreaterThan(0);
  });

  /* Review del bugfixer (N1): il DISEGNO della barra oltre il limite. 170k in uso su un limite di 130,2k e una finestra di 200k: i pezzi
     della barra (la tacca a parte, è posizionata) sommano il 100%, non di più, e i riservati visibili sono ciò che resta: 30k = 15%. */
  test('C1-CM-07 — oltre il limite la barra somma il 100% e i riservati visibili sono ciò che resta della finestra', async ({ page }) => {
    const motore = (id) => { const m = MOTORE(id); m.measurement = { ...m.measurement, tokens: { ...m.measurement.tokens, inputTokens: 170_000 } }; return m; };
    await apri(page, 'motore', { motore });
    await apriCm(page);
    await expect(cm(page).locator('[data-context-headline]')).toHaveAttribute('data-oltre', '');
    const misure = await cm(page).locator('[data-context-gauge]').evaluate((barra) => {
      const pezzi = [...barra.children].filter((n) => !n.classList.contains('talos-cm__tacca'));
      const percento = (n) => Number.parseFloat(n.style.width);
      return { somma: pezzi.reduce((t, n) => t + percento(n), 0), riservati: pezzi.filter((n) => n.classList.contains('talos-cm__riservato')).map(percento) };
    });
    expect(misure.somma).toBeLessThanOrEqual(100.01);
    expect(misure.somma).toBeGreaterThan(99.9);
    expect(misure.riservati.length).toBe(1);
    expect(Math.abs(misure.riservati[0] - 15)).toBeLessThan(0.01);
    await expect(cm(page).locator('[data-context-legend]')).toContainText(/Riservati\s*69,8k/); // la legenda li dice interi (nome e numero sono due elementi)
  });

  test('C1-CM-04 — le schede si percorrono con le frecce (APG Tabs), una alla volta', async ({ page }) => {
    await apri(page, 'motore');
    await apriCm(page);
    await cm(page).locator('[data-context-tab="tenuto"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(cm(page).locator('[data-context-tab="fatti"]')).toHaveAttribute('aria-selected', 'true');
    await expect(cm(page).locator('[data-context-tab="fatti"]')).toBeFocused();
    await expect(cm(page).locator('[data-context-panel="fatti"]')).toBeVisible();
    await expect(cm(page).locator('[data-context-panel="tenuto"]')).toBeHidden();
    await page.keyboard.press('End');
    await expect(cm(page).locator('[data-context-tab="impostazioni"]')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(cm(page).locator('[data-context-tab="tenuto"]')).toHaveAttribute('aria-selected', 'true');
  });

  for (const tema of ['dark', 'light']) {
    for (const scena of ['legacy', 'motore']) {
      test(`C1-CM-FOTO ${scena} ${tema} 1920`, async ({ page }) => {
        await apri(page, scena, { tema });
        await apriCm(page);
        await page.waitForTimeout(600);
        await page.screenshot({ path: `artifacts/c1-context-manager-${scena}-1920-${tema}.png` });
        await cm(page).locator('[data-context-tab="richiesta"]').click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `artifacts/c1-context-manager-${scena}-1920-${tema}-richiesta.png` });
        if (scena === 'motore') {
          await cm(page).locator('[data-context-tab="impostazioni"]').click();
          await page.waitForTimeout(300);
          await page.screenshot({ path: `artifacts/c1-context-manager-${scena}-1920-${tema}-impostazioni.png` });
        }
      });
    }
  }

  /* Review del bugfixer (punto 3): la testata sticky ha un fondo pieno sopra il gradiente della card; foto di una card SCORSA. */
  for (const tema of ['dark', 'light']) {
    test(`C1-SCHEDA-FOTO card scorsa ${tema} 1920`, async ({ page }) => {
      await apri(page, 'lunga', { tema });
      const giri = page.locator('#railContesto [data-comprimibile="giri"]');
      await giri.locator('.talos-inspector-card__comprimi').click();
      await giri.evaluate((n) => { n.scrollTop = Math.floor(n.scrollHeight / 2); });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `artifacts/c1-scheda-contesto-scorsa-1920-${tema}.png` });
    });
  }

  for (const tema of ['dark', 'light']) {
    for (const scena of ['legacy', 'motore']) {
      test(`C1-SCHEDA-FOTO ${scena} ${tema} 1920`, async ({ page }) => {
        await apri(page, scena, { tema });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `artifacts/c1-scheda-contesto-${scena}-1920-${tema}-compresse.png` });
        for (const k of ['finestra', 'compattazioni']) await page.locator(`#railContesto [data-comprimibile="${k}"] .talos-inspector-card__comprimi`).click();
        await expect(page.locator('#contestoCompattazioni .talos-kv').first()).toBeVisible();
        await page.waitForTimeout(400);
        await page.screenshot({ path: `artifacts/c1-scheda-contesto-${scena}-1920-${tema}.png` });
      });
    }
  }
});
