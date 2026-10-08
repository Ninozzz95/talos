import { test, expect } from '@playwright/test';

/*
 * ⛔ A16 (bugfixer, 08/10/2026) — L'INDICE DEI GIRI DI UNA CHAT LUNGA ELENCA TUTTI I GIRI, E NON SI RIFÀ A OGNI DISEGNO.
 *   Misurato: in una chat da 1000 messaggi l'Indice dei giri cominciava da 1971, perché leggeva solo i turni rimasti
 *   montati dopo la finestra del rigioco (BUG-24); i turni smontati stanno, interi, nel registro del client.
 *   E `riempiCard` ricreava ogni riga a ogni disegno e lasciava indietro gli a-capo (sul 4174, sola lettura: 68 → 152 → 234
 *   nodi di testo per 12 righe, solo cambiando sessione e tornando).
 * Scene rigiocate dal server finto: ogni richiesta non-GET si ferma e si conta.
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const MODELLO = 'prova/modello-senza-catalogo';
const GIRI = 60;
const giro = (n) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${n}`, input: { consegna: `Domanda numero ${n} della prova lunga`, ...(n > 1 ? { seguito: true } : {}) } },
  { type: 'TextMessageStart', messageId: `m-${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `m-${n}`, delta: `Risposta ${n}: ${'parola '.repeat(30)}fine.` },
  { type: 'TextMessageEnd', messageId: `m-${n}` },
  { type: 'RunFinished', threadId: 't', runId: `r-${n}` },
];
const numera = (eventi) => eventi.map((e, i) => ({ ...e, _sequenza: i + 1 }));
const SCENE = {
  lunga: numera(Array.from({ length: GIRI }, (_, i) => giro(i + 1)).flat()),
  corta: numera([...giro(1), ...giro(2)]),
};

async function apri(page, { tema = 'dark' } = {}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  const contatore = { nonGet: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const m = new URL(req.url()).pathname.match(/\/api\/v1\/sessions\/ig-(\w+)-[a-z0-9]+\/(events|metrics)$/);
    if (m) {
      if (m[2] === 'metrics') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { registrato: true, cacheSessione: null, ragionamentiMs: {} }, meta: { schema: 'talos.harness-ui.api.v1' } }) });
      return route.fulfill({ contentType: 'text/event-stream', body: `retry: 3600000\n${[...SCENE[m[1]], CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}` });
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  return contatore;
}

async function passaA(page, chiave, attesa) {
  await page.evaluate(({ id, modello }) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Indice dei giri', modello, { conclusa: true, modello });
  }, { id: `ig-${chiave}-a1`, modello: MODELLO });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 20_000 });
  await expect(page.locator('#conversation')).toContainText(attesa, { timeout: 10_000 });
  await page.evaluate(() => new Promise((fatto) => requestAnimationFrame(() => requestAnimationFrame(fatto))));
}

const indice = (page) => page.evaluate(() => {
  const card = document.querySelector('#railContesto [data-c="TurnIndex"]');
  const chiavi = [...card.querySelectorAll(':scope > .talos-kv > .talos-kv__k')].map((k) => k.textContent);
  return {
    righe: chiavi.length,
    numeri: chiavi.map((k) => Number.parseInt(k, 10)),
    testi: [...card.childNodes].filter((n) => n.nodeType === 3).length,
    montati: document.querySelectorAll('#conversation > .talos-turn').length,
    precedenti: Boolean(document.querySelector('.talos-mostra-precedenti:not([hidden])')),
  };
});

test.describe('Indice dei giri completo nelle chat lunghe (A16)', () => {
  test('A16-INDICE-01 — con la finestra che smonta i giri vecchi, l\'indice li elenca tutti, dal primo, senza buchi', async ({ page }) => {
    const c = await apri(page);
    await passaA(page, 'lunga', `Risposta ${GIRI}:`);
    const esito = await indice(page);
    expect(esito.precedenti, 'premessa: la finestra ha smontato dei giri (c\'è «Mostra precedenti»)').toBe(true);
    expect(esito.montati, 'premessa: montati meno turni dei giri').toBeLessThan(GIRI * 2);
    expect(esito.righe, 'una riga per messaggio della persona e una per risposta').toBe(GIRI * 2);
    expect(esito.numeri, 'dal primo giro, contigui').toEqual(Array.from({ length: GIRI * 2 }, (_, i) => i + 1));
    // «Mostra precedenti» rimonta una pagina: l'indice resta lo stesso, né doppioni né buchi
    await page.locator('.talos-mostra-precedenti').click();
    await page.evaluate(() => { window.__talosHarnessUiRuntime.syncRunComposerState(); return new Promise((fatto) => requestAnimationFrame(() => requestAnimationFrame(fatto))); });
    const dopo = await indice(page);
    expect(dopo.montati, 'premessa: la pagina è tornata').toBeGreaterThan(esito.montati);
    expect(dopo.numeri).toEqual(esito.numeri);
    expect(c.nonGet).toBe(0);
  });

  test('A16-INDICE-02 — un ridisegno con gli stessi giri non tocca le righe, e gli a-capo non si accumulano', async ({ page }) => {
    const c = await apri(page);
    await passaA(page, 'lunga', `Risposta ${GIRI}:`);
    const primo = await indice(page);
    const record = await page.evaluate(async () => {
      const card = document.querySelector('#railContesto [data-c="TurnIndex"]');
      let n = 0;
      const oss = new MutationObserver((l) => { n += l.length; });
      oss.observe(card, { childList: true, subtree: true, characterData: true });
      for (let i = 0; i < 20; i += 1) {
        window.__talosHarnessUiRuntime.syncRunComposerState();
        await new Promise((fatto) => requestAnimationFrame(fatto));
      }
      oss.disconnect();
      return n;
    });
    expect(record, 'venti ridisegni con gli stessi giri: nessuna riga rifatta').toBe(0);
    // altra sessione e ritorno: stesse righe, stessi a-capo (prima crescevano a ogni disegno)
    await passaA(page, 'corta', 'Risposta 2:');
    await passaA(page, 'lunga', `Risposta ${GIRI}:`);
    const ritorno = await indice(page);
    expect(ritorno.righe).toBe(primo.righe);
    expect(ritorno.testi, 'gli a-capo restano uno per riga, non si sommano').toBe(primo.testi);
    expect(c.nonGet).toBe(0);
  });
});
