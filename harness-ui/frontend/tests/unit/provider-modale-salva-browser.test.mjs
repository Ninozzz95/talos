/*
 * Owner 01/10/2026: «quando inserisco una chiave API la modale di configurazione non si chiude quando faccio salva, rimane
 * aperta e non c'è nessun messaggio di successo, fa confondere molto». Riprodotto sul 4174 (POST intercettate): il «Salva
 * configurazione» del piede salvava SOLO indirizzo e tempo (`/runtime`), la chiave incollata non partiva, compariva
 * «Collegamento salvato.» per 3,5 s e la modale restava aperta. Decisione owner: «Un Salva solo, come Hermes» + campi a
 * tutta larghezza. Hermes `apps/desktop/src/app/settings/connections-registry.tsx:410-484` (un salvataggio con tutti i
 * campi, il segreto solo se digitato, poi `setEditor(null)`; errore = avviso e l'editor resta); il mockup approvato
 * (`prototypes/calm-lab/TALOS-Calm-Lab.html`, `save-provider` → `closeModal(false)`) chiude anche lui.
 * Componente vero impacchettato con esbuild in una pagina vuota: nessun server, ogni richiesta del browser si ferma.
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
const sorgenti = { name: 'sorgenti-modale', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'ms' };
  });
  b.onLoad({ filter: /.*/, namespace: 'ms' }, async (args) => {
    const est = extname(args.path);
    const loader = est === '.css' ? 'css' : est === '.ts' || est === '.mts' ? 'ts' : est === '.tsx' ? 'tsx' : 'js';
    return { contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader };
  });
} };

const OPENROUTER = { id: 'openrouter', label: 'OpenRouter', requiresKey: true, keyConfigured: true, supportsOAuth: true, supportsEndpoint: true,
  endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: false, timeoutSeconds: 60, origineChiave: 'custodia',
  pool: [{ impronta: 'f'.repeat(64), origine: 'custodia', stato: 'disponibile' }] };

let pagina;
let browser;
test.after(() => browser?.close());
test.before(async () => {
  const script = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], stdin: { contents: `
    import { creaProviderCard } from './src/components/provider-card.js';
    window.ms = { creaProviderCard };
  `, resolveDir: frontend, sourcefile: 'ms-banco.js' }, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  const stile = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], entryPoints: [resolve(frontend, 'src/styles/main.css')], tsconfigRaw: {}, bundle: true, write: false, external: ['./fonts/*'], logLevel: 'silent' });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  pagina = async (t, { row = OPENROUTER, fallisce = null, rispostaRuntime = null } = {}) => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    t.after(() => page.close());
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    t.after(() => assert.deepEqual(errori, []));
    await page.route('**/*', (route) => {
      if (rispostaRuntime && route.request().url() === `http://127.0.0.1:9/api/v1/providers/${row.id}/runtime`) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { salvato: true } }) });
      }
      return route.abort();
    });
    await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><main style="padding:16px"><div id="card"></div></main></body></html>');
    await page.addStyleTag({ content: stile.outputFiles[0].text });
    await page.addScriptTag({ content: script.outputFiles[0].text });
    await page.evaluate(({ row, fallisce }) => {
      window.__talosHarnessApiBase = 'http://127.0.0.1:9';
      window.chiamate = []; window.salvate = [];
      document.querySelector('#card').append(ms.creaProviderCard(row, {
        onAzionePool: async () => {}, onMenu: (voci) => { window.voci = voci.map((v) => v.chiave); },
        onSalvaConfigurazione: async (dati) => {
          window.chiamate.push(dati);
          if (fallisce && (!fallisce.solo || (fallisce.solo === 'collegamento' ? dati.collegamento : dati.chiave))) throw Object.assign(new Error(fallisce.motivo), { fase: fallisce.fase });
        },
        onConfigurazioneSalvata: (esito) => { window.salvate.push(esito); },
      }));
    }, { row, fallisce });
    await page.locator('[data-provider-toggle]').click();
    const modale = page.locator(`dialog[data-provider-modale="${row.id}"]`);
    await modale.waitFor();
    const incolla = modale.getByText('Oppure incolla una chiave');
    if (await incolla.count()) await incolla.click();
    return { page, modale };
  };
});

test('MS-01: chiave incollata + «Salva» in fondo: la CHIAVE parte, la modale si chiude, e si annuncia il successo', async (t) => {
  const { page, modale } = await pagina(t);
  await modale.locator('[data-provider-key]').fill('sk-or-v1-finta-di-prova');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale][open]'));
  assert.deepEqual(await page.evaluate(() => window.chiamate), [{ provider: 'openrouter', chiave: 'sk-or-v1-finta-di-prova', pool: true, collegamento: null }]);
  assert.deepEqual(await page.evaluate(() => window.salvate), [{ provider: 'openrouter', etichetta: 'OpenRouter', salvato: ['chiave'] }]);
  assert.equal((await page.content()).includes('sk-or-v1-finta-di-prova'), false, 'la chiave non resta nel documento');
});

test('MS-02: cambiato solo l indirizzo: parte il collegamento, non una chiave vuota', async (t) => {
  const { page, modale } = await pagina(t);
  await modale.locator('[data-provider-endpoint]').fill('https://proxy.esempio.test/v1');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale][open]'));
  /* OWN-01 (09/10/2026, port del kernel CLI 0.5.2): il tempo alla prima risposta parte SOLO se la persona l'ha cambiato — prima
     ogni salvataggio dell'indirizzo lo marcava come scelto, e il predefinito del server (600 s) non poteva più cambiare. */
  assert.deepEqual(await page.evaluate(() => window.chiamate), [{ provider: 'openrouter', chiave: '', pool: true, collegamento: { endpoint: 'https://proxy.esempio.test/v1' } }]);
  assert.deepEqual(await page.evaluate(() => window.salvate.map((s) => s.salvato)), [['collegamento']]);
});

test('MS-02b: OWN-01 — cambiato il tempo alla prima risposta, parte anche lui (fino a 1800 s)', async (t) => {
  const { page, modale } = await pagina(t);
  const tempo = modale.locator('[data-provider-timeout]');
  assert.equal(await tempo.getAttribute('max'), '1800');
  await tempo.fill('900');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale][open]'));
  assert.deepEqual(await page.evaluate(() => window.chiamate), [{ provider: 'openrouter', chiave: '', pool: true, collegamento: { endpoint: 'https://openrouter.ai/api/v1', timeoutSeconds: 900 } }]);
});

test('MS-03: se la chiave non si salva la modale RESTA, l errore è rosso e non sparisce da solo', async (t) => {
  const { page, modale } = await pagina(t, { fallisce: { fase: 'chiave', motivo: 'Il fornitore non risponde.' } });
  await modale.locator('[data-provider-key]').fill('sk-or-v1-finta-di-prova');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  const errore = modale.locator('[data-provider-feedback]');
  await errore.waitFor({ state: 'visible' });
  assert.match(await errore.innerText(), /La chiave non è stata salvata: Il fornitore non risponde\./u);
  assert.equal(await errore.getAttribute('role'), 'alert');
  await page.waitForTimeout(4000);
  assert.equal(await modale.evaluate((d) => d.open), true);
  assert.equal(await errore.isVisible(), true, 'un errore non si spegne da solo');
  assert.deepEqual(await page.evaluate(() => window.salvate), []);
});

test('MS-04: niente da salvare: lo dice, non chiama niente e resta aperta', async (t) => {
  const { page, modale } = await pagina(t);
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  const nota = modale.locator('[data-provider-feedback]');
  await nota.waitFor({ state: 'visible' });
  assert.match(await nota.innerText(), /Niente da salvare/u);
  assert.deepEqual(await page.evaluate(() => window.chiamate), []);
  assert.equal(await modale.evaluate((d) => d.open), true);
});

test('MS-05: nella modale c è UN solo pulsante che salva; chiusa la modale, la card in linea ritrova il suo', async (t) => {
  const { page, modale } = await pagina(t);
  const salvano = await modale.locator('button:visible').evaluateAll((bs) => bs.map((b) => b.textContent.trim()).filter((s) => /^(Salva|Aggiungi chiave|Salva chiave|Salva configurazione)$/u.test(s)));
  assert.deepEqual(salvano, ['Salva']);
  await modale.evaluate((d) => {
    window.ms05Chiusa = new Promise(resolve => d.addEventListener('close', () => resolve(), { once: true }));
  });
  await modale.getByRole('button', { name: 'Annulla', exact: true }).click();
  await page.evaluate(() => window.ms05Chiusa);
  assert.equal(await page.locator('.talos-provider__body [data-provider-salva-chiave]').evaluate((b) => b.hidden), false);
});

test('MS-06: i campi della modale occupano tutta la larghezza del corpo', async (t) => {
  const { modale } = await pagina(t);
  const misure = await modale.evaluate((d) => {
    const telaio = d.querySelector('.talos-provider__modale-corpo').getBoundingClientRect().width;
    return ['[data-provider-key]', '[data-provider-endpoint]', '[data-provider-timeout]'].map((s) => d.querySelector(s).getBoundingClientRect().width / telaio);
  });
  for (const quota of misure) assert.ok(quota > 0.85, `un campo occupa solo ${(quota * 100).toFixed(0)}% del corpo`);
});

test('MS-07: Invio nel campo della chiave salva, come «Salva»', async (t) => {
  const { page, modale } = await pagina(t);
  await modale.locator('[data-provider-key]').fill('sk-or-v1-finta-di-prova');
  await modale.locator('[data-provider-key]').press('Enter');
  await page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale][open]'));
  assert.equal(await page.evaluate(() => window.chiamate.length), 1);
});

test('MS-09: nella modale il menu «⋯» non offre un secondo salvataggio; se non resta altro, sparisce con la sua riga', async (t) => {
  const { modale } = await pagina(t);
  assert.equal(await modale.locator('.talos-provider__body > .talos-cluster:visible').count(), 0,
    'la riga del «⋯», con la sola voce «Salva collegamento», non deve restare vuota nella modale');
  // con l'indirizzo personalizzato il menu ha anche «Ripristina indirizzo»: il «⋯» resta, ma senza «Salva collegamento»
  const altra = await pagina(t, { row: { ...OPENROUTER, endpoint: 'https://proxy.esempio.test/v1', endpointConfigured: true } });
  await altra.modale.getByRole('button', { name: 'Altre azioni per OpenRouter', exact: true }).click();
  assert.deepEqual(await altra.page.evaluate(() => window.voci), ['reset-runtime']);
  // chiusa la modale, la card in linea ritrova la voce (lì è l'unico modo di salvare il collegamento)
  await altra.modale.getByRole('button', { name: 'Annulla', exact: true }).click();
  await altra.page.evaluate(() => document.querySelector('[data-provider-id="openrouter"] [data-provider-altre-azioni]').click());
  assert.deepEqual(await altra.page.evaluate(() => window.voci), ['save-runtime', 'reset-runtime']);
});

// 08/10 (bugfixer): con l'indirizzo DI SERIE salvato non c'è niente da ripristinare (egui `reset_button`, Zed settings_ui #40135).
test('MS-11: indirizzo salvato ma uguale al predefinito ⇒ niente «Ripristina indirizzo»; AL CONTRARIO, uno diverso lo offre', async (t) => {
  const serie = await pagina(t, { row: { ...OPENROUTER, endpoint: 'https://openrouter.ai/api/v1', endpointConfigured: true, endpointPredefinito: true } });
  await serie.modale.getByRole('button', { name: 'Annulla', exact: true }).click();
  await serie.page.evaluate(() => document.querySelector('[data-provider-id="openrouter"] [data-provider-altre-azioni]').click());
  assert.deepEqual(await serie.page.evaluate(() => window.voci), ['save-runtime']);
  const diverso = await pagina(t, { row: { ...OPENROUTER, endpoint: 'https://proxy.esempio.test/v1', endpointConfigured: true, endpointPredefinito: false } });
  await diverso.modale.getByRole('button', { name: 'Annulla', exact: true }).click();
  await diverso.page.evaluate(() => document.querySelector('[data-provider-id="openrouter"] [data-provider-altre-azioni]').click());
  assert.deepEqual(await diverso.page.evaluate(() => window.voci), ['save-runtime', 'reset-runtime']);
});

test('MS-10: chiave + indirizzo, e fallisce solo il secondo: la modale dice che la chiave È salvata e non la rimanda', async (t) => {
  const { page, modale } = await pagina(t, { fallisce: { fase: 'collegamento', solo: 'collegamento', motivo: 'Indirizzo non valido.' } });
  await modale.locator('[data-provider-key]').fill('sk-or-v1-finta-di-prova');
  await modale.locator('[data-provider-endpoint]').fill('https://proxy.esempio.test/v1');
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  const errore = modale.locator('[data-provider-feedback]');
  await errore.waitFor({ state: 'visible' });
  assert.match(await errore.innerText(), /La chiave è salvata, ma la configurazione no: Indirizzo non valido./u);
  assert.equal(await modale.locator('[data-provider-key]').inputValue(), '', 'la chiave salvata non resta nel campo, o un secondo «Salva» la aggiungerebbe due volte');
  assert.deepEqual(await page.evaluate(() => window.chiamate.map((c) => [Boolean(c.chiave), Boolean(c.collegamento)])), [[true, false], [false, true]]);
  // il secondo «Salva» rimanda solo ciò che manca
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await page.waitForFunction(() => window.chiamate.length === 3);
  assert.deepEqual(await page.evaluate(() => [Boolean(window.chiamate[2].chiave), Boolean(window.chiamate[2].collegamento)]), [false, true]);
});

test('MS-08: un fornitore con configurazione propria (Azure) salva il collegamento e chiude', async (t) => {
  const azure = { id: 'azure', label: 'Azure OpenAI', requiresKey: true, keyConfigured: false, supportsEndpoint: true, endpoint: 'https://esempio.openai.azure.com', timeoutSeconds: 60, pool: [], modelli: [] };
  const { page, modale } = await pagina(t, { row: azure, rispostaRuntime: true });
  await modale.getByRole('button', { name: 'Salva', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale][open]'));
  assert.deepEqual(await page.evaluate(() => window.salvate.map((s) => s.salvato)), [['collegamento']]);
});

/* 11/10/2026 — la scelta dell'accesso di OpenAI in testa alla modale (mockup approvato dall'owner): due carte (Codex
   `onboarding/auth.rs:487-518`, Hermes `connections-registry.tsx:697-770`), sotto solo la strada scelta, il piede che segue. */
const OPENAI = { id: 'openai', label: 'OpenAI', requiresKey: true, keyConfigured: false, supportsEndpoint: true, endpoint: 'https://api.openai.com/v1',
  endpointConfigured: false, timeoutSeconds: 600, origineChiave: null,
  chatgpt: { collegato: false, email: null, pianoAbilitato: false, accessoInCorso: false, consumi: 'https://chatgpt.com/settings/usage' } };
const leggiScelta = (page) => page.evaluate(() => {
  const d = document.querySelector('dialog[data-provider-modale="openai"][open]');
  const tab = (id) => d.querySelector(`[role="tab"][data-metodo="${id}"]`);
  return {
    schede: [...d.querySelectorAll('[role="tablist"] [role="tab"]')].map((s) => `${s.dataset.metodo}:${s.getAttribute('aria-selected')}`),
    stati: [...d.querySelectorAll('[data-metodo-stato]')].map((s) => s.textContent.trim()),
    pannelloPiano: !d.querySelector(`#${tab('chatgpt').getAttribute('aria-controls')}`).hidden,
    pannelloChiave: !d.querySelector(`#${tab('chiave').getAttribute('aria-controls')}`).hidden,
    salvaVisibile: !d.querySelector('[data-provider-modale-salva]').hidden,
    annulla: d.querySelector('[data-provider-modale-annulla]').textContent,
    fuoco: document.activeElement?.dataset?.metodo ?? null,
  };
});

test('MS-20: OpenAI senza piano né chiave — si apre sul piano ChatGPT: «Continua con ChatGPT», niente «Salva», «Chiudi»', async (t) => {
  const { page, modale } = await pagina(t, { row: OPENAI });
  assert.deepEqual(await leggiScelta(page), { schede: ['chatgpt:true', 'chiave:false'], stati: ['Non collegato', 'Nessuna chiave'],
    pannelloPiano: true, pannelloChiave: false, salvaVisibile: false, annulla: 'Chiudi', fuoco: 'chatgpt' });
  assert.equal(await modale.getByRole('button', { name: 'Continua con ChatGPT' }).isVisible(), true);
  assert.equal(await modale.locator('[data-provider-key]').isVisible(), false, 'la chiave sta nel suo pannello, nascosta');
});

test('MS-21: con una chiave salvata e senza piano si apre sulla chiave, col «Salva»; da collegato sul piano, con l email', async (t) => {
  const conChiave = await pagina(t, { row: { ...OPENAI, keyConfigured: true, origineChiave: 'custodia' } });
  const s = await leggiScelta(conChiave.page);
  assert.deepEqual([s.schede, s.stati, s.salvaVisibile, s.annulla], [['chatgpt:false', 'chiave:true'], ['Non collegato', 'Chiave salvata'], true, 'Annulla']);
  const collegato = await pagina(t, { row: { ...OPENAI, chatgpt: { ...OPENAI.chatgpt, collegato: true, email: 'nino@example.com', pianoAbilitato: true } } });
  const c = await leggiScelta(collegato.page);
  assert.deepEqual([c.schede, c.stati], [['chatgpt:true', 'chiave:false'], ['Collegato', 'Nessuna chiave']]);
  assert.equal(await collegato.modale.locator('.talos-provider__piano-chi strong').textContent(), 'nino@example.com');
});

test('MS-22: frecce, Home e Fine cambiano scheda col fuoco; il piede segue', async (t) => {
  const { page } = await pagina(t, { row: OPENAI });
  await page.keyboard.press('ArrowRight');
  let s = await leggiScelta(page);
  assert.deepEqual([s.schede, s.fuoco, s.pannelloChiave, s.salvaVisibile, s.annulla], [['chatgpt:false', 'chiave:true'], 'chiave', true, true, 'Annulla']);
  await page.keyboard.press('ArrowRight'); // si gira in tondo
  assert.equal((await leggiScelta(page)).fuoco, 'chatgpt');
  await page.keyboard.press('End');
  assert.equal((await leggiScelta(page)).fuoco, 'chiave');
  await page.keyboard.press('Home');
  s = await leggiScelta(page);
  assert.deepEqual([s.fuoco, s.pannelloPiano, s.salvaVisibile, s.annulla], ['chatgpt', true, false, 'Chiudi']);
});

test('MS-23: chiusa la modale il blocco del piano torna nella card; riaperta, la scelta di prima resta', async (t) => {
  const { page, modale } = await pagina(t, { row: OPENAI });
  await modale.locator('[role="tab"][data-metodo="chiave"]').click();
  await page.keyboard.press('Escape');
  // l'evento `close` arriva DOPO che `open` è sparito: si aspetta il fatto (il blocco nella card), non l'attributo
  await page.waitForFunction(() => !document.querySelector('dialog[data-provider-modale]') && Boolean(document.querySelector('#card .talos-provider__body [data-chatgpt]')), null, { timeout: 5000 });
  await page.locator('[data-provider-toggle]').click();
  assert.deepEqual((await leggiScelta(page)).schede, ['chatgpt:false', 'chiave:true']);
});

test('MS-24 AL CONTRARIO: un fornitore senza piano (OpenRouter, o OpenAI senza lo stato del piano) non ha le carte', async (t) => {
  const { modale } = await pagina(t);
  assert.equal(await modale.locator('[role="tablist"]').count(), 0);
  const { modale: senzaStato } = await pagina(t, { row: { ...OPENAI, chatgpt: undefined } });
  assert.equal(await senzaStato.locator('[role="tablist"]').count(), 0);
  assert.equal(await senzaStato.getByRole('button', { name: 'Salva', exact: true }).isVisible(), true);
});

/* 11/10/2026 — il conteggio NOSTRO di ciò che TALOS ha mandato col piano (decisione owner: «Link + conteggio nostro, barra con Codex
   dopo»). Due righe etichetta/valore (i `talos-kv` della card) e una nota che dice che cosa NON è: il contatore di OpenAI. */
const COLLEGATO = { ...OPENAI.chatgpt, collegato: true, email: 'nino@example.com', pianoAbilitato: true };
const leggiUso = (page) => page.evaluate(() => {
  const blocco = document.querySelector('dialog[open] [data-chatgpt-uso]');
  return blocco ? { righe: [...blocco.querySelectorAll('.talos-kv')].map((r) => `${r.querySelector('.talos-kv__k').textContent} | ${r.querySelector('.talos-kv__v').textContent}`),
    nota: blocco.querySelector('[data-chatgpt-uso-nota]')?.textContent ?? null } : null;
});

test('MS-25: da collegato la modale dice quanto TALOS ha mandato col piano nelle ultime 5 ore e negli ultimi 7 giorni, e che cosa il numero NON è', async (t) => {
  const { page } = await pagina(t, { row: { ...OPENAI, chatgpt: { ...COLLEGATO,
    usoTalos: { cinqueOre: { richieste: 1, token: 900, senzaMisura: 0 }, setteGiorni: { richieste: 132, token: 1_250_000, senzaMisura: 2 } } } } });
  const uso = await leggiUso(page);
  assert.deepEqual(uso.righe, ['Ultime 5 ore | 1 richiesta, 900 token', 'Ultimi 7 giorni | 132 richieste, 1,3 M token (2 senza misura)']);
  assert.match(uso.nota, /Contato da TALOS su questo computer/u);
  assert.match(uso.nota, /non è incluso/u);
});

test('MS-26 AL CONTRARIO: nessuna richiesta si legge «Nessuna richiesta» (mai «0 token»); senza il conteggio, o da scollegato, il blocco non c è', async (t) => {
  const vuoto = { cinqueOre: { richieste: 0, token: 0, senzaMisura: 0 }, setteGiorni: { richieste: 0, token: 0, senzaMisura: 0 } };
  const zero = await pagina(t, { row: { ...OPENAI, chatgpt: { ...COLLEGATO, usoTalos: vuoto } } });
  assert.deepEqual((await leggiUso(zero.page)).righe, ['Ultime 5 ore | Nessuna richiesta', 'Ultimi 7 giorni | Nessuna richiesta']);
  const senza = await pagina(t, { row: { ...OPENAI, chatgpt: COLLEGATO } });
  assert.equal(await leggiUso(senza.page), null);
  const scollegato = await pagina(t, { row: { ...OPENAI, chatgpt: { ...OPENAI.chatgpt, usoTalos: vuoto } } });
  assert.equal(await leggiUso(scollegato.page), null);
  const storto = await pagina(t, { row: { ...OPENAI, chatgpt: { ...COLLEGATO, usoTalos: { cinqueOre: { richieste: 'tante' } } } } });
  assert.equal(await leggiUso(storto.page), null, 'un conteggio di forma sbagliata non diventa un numero a schermo');
});
