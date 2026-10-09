/*
 * Decisione 14 dell'owner (08/10/2026 sera): il fornitore a valle di OpenRouter si vede nella testata della risposta («via
 * DeepInfra») e si esclude o dal «⋯» della risposta o dalle impostazioni di OpenRouter («Impostazioni + "Escludi" dal piede»).
 * Qui le impostazioni: l'elenco «Fornitori esclusi» dentro la modale «Configura», in bozza finché non si preme il «Salva» unico
 * (owner 01/10/2026, «Un Salva solo»), che scrive l'elenco intero su `POST /api/v1/providers/openrouter/esclusi`. E la testata.
 * Stesso banco di `provider-modale-salva-browser.test.mjs`: componente vero impacchettato con esbuild in una pagina vuota,
 * ogni richiesta del browser si ferma tranne quella degli esclusi, che si registra.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, extname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

const frontend = fileURLToPath(new URL('../..', import.meta.url));
const sorgenti = { name: 'sorgenti-esclusi', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'fe' };
  });
  b.onLoad({ filter: /.*/, namespace: 'fe' }, async (args) => {
    const est = extname(args.path);
    const loader = est === '.css' ? 'css' : est === '.ts' || est === '.mts' ? 'ts' : est === '.tsx' ? 'tsx' : 'js';
    return { contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader };
  });
} };

const OPENROUTER = { id: 'openrouter', label: 'OpenRouter', requiresKey: true, keyConfigured: true, supportsOAuth: true, supportsEndpoint: true,
  endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: false, timeoutSeconds: 60, origineChiave: 'custodia',
  pool: [{ impronta: 'f'.repeat(64), origine: 'custodia', stato: 'disponibile' }], esclusi: ['chutes'] };
const URL_ESCLUSI = 'http://127.0.0.1:9/api/v1/providers/openrouter/esclusi';

let pagina;
let paginaVuota;
let browser;
test.after(() => browser?.close());
test.before(async () => {
  const script = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], stdin: { contents: `
    import { creaProviderCard } from './src/components/provider-card.js';
    import { creaMessaggioTalos, segnaFornitoreAValle, fornitoriAValleDi } from './src/components/conversazione.js';
    window.fe = { creaProviderCard, creaMessaggioTalos, segnaFornitoreAValle, fornitoriAValleDi };
  `, resolveDir: frontend, sourcefile: 'fe-banco.js' }, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  const stile = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], entryPoints: [resolve(frontend, 'src/styles/main.css')], tsconfigRaw: {}, bundle: true, write: false, external: ['./fonts/*'], logLevel: 'silent' });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  paginaVuota = async (t, { rispondi = null } = {}) => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    t.after(() => page.close());
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    t.after(() => assert.deepEqual(errori, []));
    const inviati = [];
    await page.route('**/*', (route) => {
      const r = route.request();
      if (r.url() === URL_ESCLUSI && r.method() === 'POST') {
        const corpo = JSON.parse(r.postData() || 'null');
        inviati.push(corpo);
        if (rispondi === 'errore') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'QUERY_INVALID', message: 'no' } }) });
        // 0.1.25: la lista e le voci di serie viaggiano nella STESSA richiesta ({esclusi?, diSerie?}); la rotta per voce non si usa più
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { esclusi: corpo.esclusi ?? ['chutes'],
          esclusiDiSerie: (corpo.diSerie ?? []).map((v) => ({ ...v, perche: 'x' })) } }) });
      }
      return route.abort(); // ⛔ anche `/esclusi/di-serie`: una richiesta per voce sarebbe di nuovo un salvataggio a metà
    });
    /* la card sta dentro `#schermoImpostazioni`, come nel prodotto: le regole delle Impostazioni (es. `#schermoImpostazioni li`, le
       RIGHE) la toccano davvero, e un banco senza quel contenitore non vedrebbe i difetti che fanno a schermo (misurato sul 4177) */
    await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><main id="schermoImpostazioni" style="padding:16px"><div id="card"></div></main></body></html>');
    await page.addStyleTag({ content: stile.outputFiles[0].text });
    await page.addScriptTag({ content: script.outputFiles[0].text });
    return { page, inviati };
  };
  pagina = async (t, { row = OPENROUTER, rispondi = null } = {}) => {
    const { page, inviati } = await paginaVuota(t, { rispondi });
    await page.evaluate(({ row }) => {
      window.__talosHarnessApiBase = 'http://127.0.0.1:9';
      window.chiamate = []; window.salvate = [];
      document.querySelector('#card').append(fe.creaProviderCard(row, {
        onAzionePool: async () => {}, onMenu: () => {},
        onSalvaConfigurazione: async (dati) => { window.chiamate.push(dati); },
        onConfigurazioneSalvata: (esito) => { window.salvate.push(esito); },
      }));
    }, { row });
    await page.locator('[data-provider-toggle]').click();
    const modale = page.locator(`dialog[data-provider-modale="${row.id}"]`);
    await modale.waitFor();
    return { page, modale, inviati };
  };
});

const chiusa = (page) => page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale][open]'));
const pastiglie = (modale) => modale.locator('[data-provider-escluso]').evaluateAll((bs) => bs.map((b) => b.dataset.providerEscluso));

test('ESC-01: nella modale di OpenRouter c è l elenco degli esclusi, con i salvati come pastiglie; Azure non ce l ha', async (t) => {
  const { modale } = await pagina(t);
  await modale.getByText('Fornitori esclusi', { exact: true }).waitFor();
  assert.deepEqual(await pastiglie(modale), ['chutes']);
  assert.equal(await modale.getByRole('button', { name: 'Riammetti chutes', exact: true }).count(), 1, 'la × dice cosa fa');
  const azure = { id: 'azure', label: 'Azure OpenAI', requiresKey: true, keyConfigured: false, supportsEndpoint: true, endpoint: 'https://esempio.openai.azure.com', timeoutSeconds: 60, pool: [], modelli: [] };
  const altra = await pagina(t, { row: azure });
  assert.equal(await altra.modale.locator('[data-provider-esclusi]').count(), 0);
});

test('ESC-02: si scrive un nome, «Escludi» lo mette in bozza (minuscolo), «Salva» scrive l elenco INTERO e chiude', async (t) => {
  const { page, modale, inviati } = await pagina(t);
  await modale.locator('[data-provider-escluso-nuovo]').fill('DeepInfra');
  await modale.getByRole('button', { name: 'Escludi', exact: true }).click();
  assert.deepEqual(await pastiglie(modale), ['chutes', 'deepinfra']);
  assert.deepEqual(inviati, [], 'la bozza non si scrive prima del Salva');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await chiusa(page);
  assert.deepEqual(inviati, [{ esclusi: ['chutes', 'deepinfra'] }]);
  assert.deepEqual(await page.evaluate(() => window.chiamate), [], 'nessuna chiave né collegamento spediti');
  assert.deepEqual(await page.evaluate(() => window.salvate.map((s) => s.salvato)), [['collegamento']]);
});

test('ESC-03: la × toglie dalla bozza; «Salva» manda l elenco vuoto', async (t) => {
  const { page, modale, inviati } = await pagina(t);
  await modale.getByRole('button', { name: 'Riammetti chutes', exact: true }).click();
  assert.deepEqual(await pastiglie(modale), []);
  assert.equal(await modale.getByText('Nessuno: OpenRouter può scegliere qualsiasi fornitore.').isVisible(), true);
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await chiusa(page);
  assert.deepEqual(inviati, [{ esclusi: [] }]);
});

test('ESC-04: AL CONTRARIO — un nome non valido non entra, l errore è accanto al campo e «Salva» non scrive niente', async (t) => {
  const { page, modale, inviati } = await pagina(t);
  await modale.locator('[data-provider-escluso-nuovo]').fill('deep infra!');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  const errore = modale.locator('[data-provider-esclusi-errore]');
  await errore.waitFor({ state: 'visible' });
  assert.match(await errore.innerText(), /«deep infra!» non è un nome breve di fornitore/u);
  assert.equal(await modale.locator('[data-provider-escluso-nuovo]').getAttribute('aria-invalid'), 'true');
  assert.equal(await modale.evaluate((d) => d.open), true);
  assert.deepEqual(inviati, []);
  assert.deepEqual(await page.evaluate(() => window.chiamate), []);
  // scrivere di nuovo spegne l'errore
  await modale.locator('[data-provider-escluso-nuovo]').fill('deepinfra');
  assert.equal(await errore.isVisible(), false);
});

test('ESC-05: un doppione non entra due volte', async (t) => {
  const { modale } = await pagina(t);
  await modale.locator('[data-provider-escluso-nuovo]').fill('Chutes');
  await modale.getByRole('button', { name: 'Escludi', exact: true }).click();
  assert.match(await modale.locator('[data-provider-esclusi-errore]').innerText(), /chutes è già escluso\./u);
  assert.deepEqual(await pastiglie(modale), ['chutes']);
});

test('ESC-05b: al tetto (30, come il server) un nome in più non entra, e la frase lo dice al plurale', async (t) => {
  const pieni = Array.from({ length: 30 }, (_, i) => `fornitore-${i}`);
  const { modale } = await pagina(t, { row: { ...OPENROUTER, esclusi: pieni } });
  await modale.locator('[data-provider-escluso-nuovo]').fill('uno-di-troppo');
  await modale.getByRole('button', { name: 'Escludi', exact: true }).click();
  assert.equal(await modale.locator('[data-provider-esclusi-errore]').innerText(), 'Puoi escludere al massimo 30 fornitori.');
  assert.equal((await pastiglie(modale)).length, 30);
});

test('ESC-06: Invio con un nome scritto lo aggiunge e NON salva; Invio a campo vuoto salva come «Salva»', async (t) => {
  const { page, modale, inviati } = await pagina(t);
  const campo = modale.locator('[data-provider-escluso-nuovo]');
  await campo.fill('together');
  await campo.press('Enter');
  assert.deepEqual(await pastiglie(modale), ['chutes', 'together']);
  assert.equal(await modale.evaluate((d) => d.open), true);
  assert.deepEqual(inviati, []);
  await campo.press('Enter');
  await chiusa(page);
  assert.deepEqual(inviati, [{ esclusi: ['chutes', 'together'] }]);
});

test('ESC-07: scritto e «Salva» senza premere «Escludi»: quello che hai scritto non si perde', async (t) => {
  const { page, modale, inviati } = await pagina(t);
  await modale.locator('[data-provider-escluso-nuovo]').fill('novita');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await chiusa(page);
  assert.deepEqual(inviati, [{ esclusi: ['chutes', 'novita'] }]);
});

test('ESC-08: AL CONTRARIO — elenco invariato e niente altro: «Niente da salvare», nessuna richiesta', async (t) => {
  const { modale, inviati } = await pagina(t);
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await modale.locator('[data-provider-feedback]').waitFor({ state: 'visible' });
  assert.match(await modale.locator('[data-provider-feedback]').innerText(), /Niente da salvare/u);
  assert.deepEqual(inviati, []);
});

test('ESC-09: il server rifiuta: la modale resta, l errore è rosso, la bozza non si perde', async (t) => {
  const { modale, inviati } = await pagina(t, { rispondi: 'errore' });
  await modale.locator('[data-provider-escluso-nuovo]').fill('deepinfra');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  const errore = modale.locator('[data-provider-feedback]');
  await errore.waitFor({ state: 'visible' });
  assert.match(await errore.innerText(), /La configurazione non è stata salvata/u);
  assert.equal(await errore.getAttribute('role'), 'alert');
  assert.equal(await modale.evaluate((d) => d.open), true);
  assert.deepEqual(await pastiglie(modale), ['chutes', 'deepinfra']);
  assert.equal(inviati.length, 1);
});

test('ESC-10: il blocco sta a tutta larghezza nella modale, e il campo e «Escludi» su una riga', async (t) => {
  const { modale } = await pagina(t);
  const m = await modale.evaluate((d) => {
    const telaio = d.querySelector('.talos-provider__modale-corpo').getBoundingClientRect();
    const blocco = d.querySelector('[data-provider-esclusi]').getBoundingClientRect();
    const campo = d.querySelector('[data-provider-escluso-nuovo]').getBoundingClientRect();
    const pulsante = d.querySelector('[data-provider-escludi-aggiungi]').getBoundingClientRect();
    const li = d.querySelector('[data-provider-esclusi] li'), chip = li.querySelector('button');
    return { quota: blocco.width / telaio.width, stessaRiga: Math.abs((campo.top + campo.bottom) / 2 - (pulsante.top + pulsante.bottom) / 2) < 4, fuori: pulsante.right > telaio.right + 1,
      altezze: Math.abs(campo.height - pulsante.height), liInPiu: li.getBoundingClientRect().height - chip.getBoundingClientRect().height,
      tipi: [...d.querySelectorAll('[data-provider-esclusi] button')].map((b) => b.getAttribute('type')) };
  });
  assert.ok(m.quota > 0.85, `il blocco occupa solo ${(m.quota * 100).toFixed(0)}% del corpo`);
  assert.equal(m.stessaRiga, true);
  assert.equal(m.fuori, false);
  assert.ok(m.altezze <= 1, `«Escludi» e il campo differiscono di ${m.altezze}px`);
  assert.ok(m.liInPiu <= 1, `la pastiglia sta in una riga più alta di lei di ${m.liInPiu}px`);
  assert.deepEqual([...new Set(m.tipi)], ['button'], 'ogni pulsante del blocco è type=button (mai un submit)');
});

/* Visto sul 4174 (08/10 notte, OpenRouter con indirizzo personalizzato): il blocco degli esclusi stava PRIMA della riga delle
   azioni, e il «⋯» (che porta «Ripristina indirizzo») finiva solo in fondo, sotto l'elenco, lontano dai campi che governa. */
test('ESC-14: con un indirizzo personalizzato il «⋯» sta subito sotto i campi, PRIMA del blocco degli esclusi', async (t) => {
  const { modale } = await pagina(t, { row: { ...OPENROUTER, endpoint: 'https://proxy.esempio.it/api/v1', endpointConfigured: true } });
  const m = await modale.evaluate((d) => {
    const tre = d.querySelector('[aria-haspopup="menu"][aria-label*="OpenRouter"]');
    const blocco = d.querySelector('[data-provider-esclusi]');
    const riga = tre?.closest('.talos-cluster');
    return { tre: Boolean(tre), prima: Boolean(riga && blocco && (riga.compareDocumentPosition(blocco) & Node.DOCUMENT_POSITION_FOLLOWING)),
      sopra: tre && blocco ? tre.getBoundingClientRect().bottom <= blocco.getBoundingClientRect().top + 1 : null };
  });
  assert.equal(m.tre, true, 'il «⋯» c è');
  assert.equal(m.prima, true, 'la riga del «⋯» viene prima del blocco degli esclusi');
  assert.equal(m.sopra, true, 'e a schermo sta sopra');
});

test('ESC-13: la card di OpenRouter dice quanti fornitori sono esclusi; AL CONTRARIO, a zero la riga non c è', async (t) => {
  const riga = async (row) => {
    const { page } = await paginaVuota(t);
    return page.evaluate((r) => {
      const card = fe.creaProviderCard(r, { onMenu: () => {} });
      document.querySelector('#card').append(card);
      return [...card.querySelectorAll('.talos-provider__fatti .talos-kv')].map((n) => n.innerText.replace(/\s+/gu, ' ').trim()).filter((s) => s.startsWith('Fornitori esclusi'));
    }, row);
  };
  assert.deepEqual(await riga({ ...OPENROUTER, esclusi: ['chutes', 'reka'] }), ['Fornitori esclusi 2 fornitori']);
  assert.deepEqual(await riga({ ...OPENROUTER, esclusi: ['chutes'] }), ['Fornitori esclusi 1 fornitore']);
  assert.deepEqual(await riga({ ...OPENROUTER, esclusi: [] }), []);
});

test('ESC-11: la testata della risposta dice «via X», in ordine d arrivo e senza doppioni', async (t) => {
  const { page } = await paginaVuota(t);
  const esito = await page.evaluate(() => {
    const m = fe.creaMessaggioTalos({ modello: 'glm-5.3-flash', ora: '21:00', paragrafi: ['ciao'] });
    document.querySelector('#card').append(m);
    fe.segnaFornitoreAValle(m, 'DeepInfra');
    fe.segnaFornitoreAValle(m, 'Chutes');
    fe.segnaFornitoreAValle(m, 'DeepInfra');
    fe.segnaFornitoreAValle(m, '   ');
    const via = m.querySelectorAll('.talos-message__head > .talos-message__via');
    return { quanti: via.length, testo: via[0]?.textContent, titolo: via[0]?.title, nomi: fe.fornitoriAValleDi(m) };
  });
  assert.equal(esito.quanti, 1, 'una sola etichetta per messaggio');
  assert.equal(esito.testo, 'via DeepInfra, Chutes');
  assert.match(esito.titolo, /OpenRouter/u);
  assert.deepEqual(esito.nomi, ['DeepInfra', 'Chutes']);
});

test('ESC-12: AL CONTRARIO — una risposta senza fornitore a valle non ha l etichetta', async (t) => {
  const { page } = await paginaVuota(t);
  const esito = await page.evaluate(() => {
    const m = fe.creaMessaggioTalos({ modello: 'glm-5.3-flash', ora: '21:00', paragrafi: ['ciao'] });
    return { via: m.querySelectorAll('.talos-message__via').length, nomi: fe.fornitoriAValleDi(m), ritorno: fe.segnaFornitoreAValle(m, null) };
  });
  assert.deepEqual(esito, { via: 0, nomi: [], ritorno: [] });
});

/* ⭐ 0.1.25 (owner 09/10/2026, «visibile e togliibile») — gli esclusi DI SERIE: sotto la lista della persona, stessa pastiglia,
   tolti diventano una riga con «Escludi di nuovo»; in bozza finché non si preme il «Salva» unico, che manda solo ciò che è cambiato. */
const DI_SERIE = { ...OPENROUTER, esclusiDiSerie: [{ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', perche: 'x', attivo: true }] };

test('ESC-SERIE-01: la voce di serie si vede col suo modello e il perché; la × la toglie; «Salva» manda solo quella', async (t) => {
  const { page, modale, inviati } = await pagina(t, { row: DI_SERIE });
  const voce = modale.locator('[data-escluso-di-serie="z-ai/glm-5.3-flash#open-inference"]');
  await voce.waitFor();
  assert.match(await voce.innerText(), /open-inference[\s\S]*per glm-5\.3-flash: non chiama gli attrezzi/u);
  assert.doesNotMatch(await voce.innerText(), /z-ai\//u, 'il modello col nome umano, mai l id');
  assert.equal(await modale.getByText('Esclusi di serie', { exact: true }).isVisible(), true, 'un titoletto suo, staccato dalla lista della persona');
  assert.match(await page.locator('#card').innerText(), /Fornitori esclusi\s*2 fornitori/u, 'il riepilogo conta anche il di-serie attivo (chutes + open-inference)');
  assert.deepEqual(await pastiglie(modale), ['chutes'], 'la lista della persona resta sua: la voce di serie non ci si mescola');
  await modale.getByRole('button', { name: 'Riammetti open-inference per glm-5.3-flash', exact: true }).click();
  assert.equal(await voce.getAttribute('data-attivo'), 'false');
  assert.match(await voce.innerText(), /open-inference di nuovo ammesso per glm-5\.3-flash/u);
  assert.equal(await modale.getByRole('button', { name: 'Escludi di nuovo open-inference per glm-5.3-flash', exact: true }).evaluate((b) => b === document.activeElement), true, 'il fuoco va al pulsante che rimette');
  assert.deepEqual(inviati, [], 'in bozza');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await chiusa(page);
  assert.deepEqual(inviati, [{ diSerie: [{ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: false }] }], 'solo la voce cambiata, non la lista della persona');
});

test('ESC-SERIE-03: lista e voce di serie cambiate insieme: UNA richiesta con tutte e due (o tutto o niente sul server)', async (t) => {
  const { page, modale, inviati } = await pagina(t, { row: DI_SERIE });
  await modale.getByRole('button', { name: 'Riammetti open-inference per glm-5.3-flash', exact: true }).click();
  await modale.locator('[data-provider-escluso="chutes"]').click();
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await chiusa(page);
  assert.deepEqual(inviati, [{ esclusi: [], diSerie: [{ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: false }] }]);
});

test('ESC-SERIE-04 AL CONTRARIO: il server rifiuta la richiesta unica: la modale resta aperta e la bozza di tutte e due non si perde', async (t) => {
  const { modale, inviati } = await pagina(t, { row: DI_SERIE, rispondi: 'errore' });
  await modale.getByRole('button', { name: 'Riammetti open-inference per glm-5.3-flash', exact: true }).click();
  await modale.locator('[data-provider-escluso="chutes"]').click();
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await modale.locator('[data-provider-escluso-di-serie], [data-provider-rimetti-di-serie]').first().waitFor();
  assert.equal(inviati.length, 1, 'una richiesta sola, anche quando fallisce');
  assert.equal(await modale.locator('[data-escluso-di-serie="z-ai/glm-5.3-flash#open-inference"]').getAttribute('data-attivo'), 'false', 'la bozza della voce resta');
  assert.deepEqual(await pastiglie(modale), [], 'la bozza della lista resta');
});

test('ESC-SERIE-02 AL CONTRARIO: togliere e rimettere prima del Salva non manda niente; una voce già tolta si rimette', async (t) => {
  const { page, modale, inviati } = await pagina(t, { row: DI_SERIE });
  await modale.getByRole('button', { name: 'Riammetti open-inference per glm-5.3-flash', exact: true }).click();
  await modale.getByRole('button', { name: 'Escludi di nuovo open-inference per glm-5.3-flash', exact: true }).click();
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  assert.deepEqual(inviati, [], 'tornata com era: niente da salvare');
  const tolta = { ...OPENROUTER, esclusiDiSerie: [{ ...DI_SERIE.esclusiDiSerie[0], attivo: false }] };
  const altra = await pagina(t, { row: tolta });
  await altra.modale.getByRole('button', { name: 'Escludi di nuovo open-inference per glm-5.3-flash', exact: true }).click();
  await altra.modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await chiusa(altra.page);
  assert.deepEqual(altra.inviati, [{ diSerie: [{ modello: 'z-ai/glm-5.3-flash', slug: 'open-inference', attivo: true }] }]);
  void page;
});
