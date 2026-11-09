/*
 * 11/10/2026 — IL PIANO CHATGPT NELLA CHAT, come chiedono le linee guida di OpenAI (developers.openai.com/siwc/ui-ux-guidelines,
 * lette l'11/10/2026) e come l'owner ha approvato dopo due mockup: la pastiglia compatta «● ChatGPT plan» nel composer col suo
 * pannello, la modale di benvenuto UNA volta per account, la carta «Usage limit reached» con «Manage usage» primario e larga quanto
 * i messaggi. Componenti veri impacchettati con esbuild in una pagina vuota, col CSS del prodotto: nessun server, ogni richiesta
 * del browser si ferma.
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
const sorgenti = { name: 'sorgenti-piano', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'pc' };
  });
  b.onLoad({ filter: /.*/, namespace: 'pc' }, async (args) => {
    const est = extname(args.path);
    const loader = est === '.css' ? 'css' : est === '.ts' || est === '.mts' ? 'ts' : est === '.tsx' ? 'tsx' : 'js';
    return { contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader };
  });
} };

// la pastiglia com'è nel template vero (`index.template.html`), letta da lì: se il template cambia, la prova lo segue
const template = await readFile(resolve(frontend, 'index.template.html'), 'utf8');
const pastigliaHtml = template.match(/<button[^>]*data-piano-chatgpt[^>]*>[\s\S]*?<\/button>/u)?.[0];

const COLLEGATO = { collegato: true, pianoAbilitato: true, email: 'Nino@Example.com', consumi: 'https://evil.example/usage',
  usoTalos: { cinqueOre: { richieste: 2, token: 26449, senzaMisura: 0 }, setteGiorni: { richieste: 5, token: 61000, senzaMisura: 0 } } };

let browser; let pagina;
test.after(() => browser?.close());
test.before(async () => {
  assert.ok(pastigliaHtml, 'la pastiglia sta nel template');
  const script = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], stdin: { contents: `
    import { montaPastigliaPiano, mostraBenvenutoPiano, pianoInUso, CHIAVE_BENVENUTO_PIANO } from './src/components/piano-chatgpt.js';
    import { montaProviderRetry } from './src/components/provider-retry.js';
    window.pc = { montaPastigliaPiano, mostraBenvenutoPiano, pianoInUso, CHIAVE_BENVENUTO_PIANO, montaProviderRetry };
  `, resolveDir: frontend, sourcefile: 'pc-banco.js' }, tsconfigRaw: {}, bundle: true, write: false, format: 'iife', logLevel: 'silent' });
  const stile = await build({ absWorkingDir: tmpdir(), plugins: [sorgenti], entryPoints: [resolve(frontend, 'src/styles/main.css')], tsconfigRaw: {}, bundle: true, write: false, external: ['./fonts/*'], logLevel: 'silent' });
  const monolite = await readFile(resolve(frontend, 'src/styles/foglio-monolite.css'), 'utf8').catch(() => '');
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  pagina = async (t) => {
    /* CI #91 (09/11/2026): l'ora di «torna alle …» la scrive `provider-retry.js` con `toLocaleTimeString(undefined)`, cioè nella
       lingua del BROWSER; senza `locale` Playwright prende quella del sistema («Defaults to the system default locale») e sul runner
       inglese usciva «11:31 AM». La pagina è italiana (`lang="it"`): la lingua del browser si fissa con lo stesso meccanismo. */
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce', locale: 'it-IT' });
    t.after(() => page.close());
    const errori = []; page.on('pageerror', (e) => errori.push(e.message));
    t.after(() => assert.deepEqual(errori, []));
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body>
      <main id="schermoChat" style="padding:40px 200px">
        <div class="talos-conversation"><div id="conversation"><div class="talos-message"><p>Una risposta del modello.</p></div></div></div>
        <div class="talos-chat-foot" style="margin-top:400px"><form id="composerForm" class="talos-composer" style="width:768px">
          <textarea rows="2">ciao</textarea>
          <div class="talos-composer__bar"><button type="button" class="talos-badge talos-badge--lg" data-open-sheet="model"><span class="talos-chip__label">GPT-6 Luna</span></button>${pastigliaHtml}<button type="button" class="talos-composer__attach talos-composer__mic">mic</button></div>
        </form></div>
      </main></body></html>`);
    await page.addStyleTag({ content: stile.outputFiles[0].text + '\n' + monolite });
    await page.addScriptTag({ content: script.outputFiles[0].text });
    return page;
  };
});

test('PIANO-UI-01: la pastiglia si vede SOLO col modello del piano e il piano collegato e abilitato', async (t) => {
  const page = await pagina(t);
  const casi = await page.evaluate((collegato) => {
    const p = pc.montaPastigliaPiano({ pastiglia: document.querySelector('[data-piano-chatgpt]') });
    const visto = (modelloId, stato) => { p.aggiorna({ modelloId, stato }); return !document.querySelector('[data-piano-chatgpt]').hidden; };
    return [visto('chatgpt:gpt-6-luna', collegato), visto('openai:gpt-6-luna', collegato), visto('chatgpt:gpt-6-luna', { ...collegato, pianoAbilitato: false }),
      visto('chatgpt:gpt-6-luna', { collegato: false }), visto(null, collegato), visto('chatgpt:gpt-6-luna', null)];
  }, COLLEGATO);
  assert.deepEqual(casi, [true, false, false, false, false, false]);
});

test('PIANO-UI-02: il clic apre il pannello SOPRA il composer (mai sul testo) con chi, l uso rilette ora e «Manage usage»; Esc chiude e rende il fuoco', async (t) => {
  const page = await pagina(t);
  await page.evaluate((collegato) => {
    window.letture = 0;
    window.piano = pc.montaPastigliaPiano({ pastiglia: document.querySelector('[data-piano-chatgpt]'),
      leggiStato: async () => { window.letture += 1; return { ...collegato, usoTalos: { ...collegato.usoTalos, cinqueOre: { richieste: 9, token: 90000, senzaMisura: 0 } } }; } });
    window.piano.aggiorna({ modelloId: 'chatgpt:gpt-6-luna', stato: collegato });
  }, COLLEGATO);
  const pastiglia = page.locator('[data-piano-chatgpt]');
  assert.equal(await pastiglia.getAttribute('aria-expanded'), 'false');
  await pastiglia.click();
  const pannello = page.locator('[data-piano-pannello]');
  await pannello.waitFor();
  const m = await page.evaluate(() => {
    const p = document.querySelector('[data-piano-pannello]');
    const link = p.querySelector('[data-piano-consumi]');
    return { ruolo: p.getAttribute('role'), etichetta: document.getElementById(p.getAttribute('aria-labelledby'))?.textContent, testo: p.innerText,
      sotto: Math.round(p.getBoundingClientRect().bottom), composer: Math.round(document.querySelector('#composerForm').getBoundingClientRect().top),
      href: link?.getAttribute('href'), target: link?.target, rel: link?.rel, aperto: document.querySelector('[data-piano-chatgpt]').getAttribute('aria-expanded'), letture: window.letture };
  });
  assert.equal(m.ruolo, 'dialog');
  assert.equal(m.etichetta, 'Stai usando il piano ChatGPT');
  assert.match(m.testo, /Nino@Example\.com/u);
  assert.match(m.testo, /9 richieste/u, 'l uso è quello riletto aprendo, non quello di prima');
  assert.ok(m.sotto <= m.composer, `il pannello finisce sopra il composer (${m.sotto} ≤ ${m.composer})`);
  assert.equal(m.href, 'https://chatgpt.com/settings/usage', 'sempre il link fisso, mai quello arrivato dallo stato');
  assert.deepEqual([m.target, m.rel, m.aperto, m.letture], ['_blank', 'noopener noreferrer', 'true', 1]);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-piano-pannello]')), true, 'aperto, il fuoco è nel pannello (in fondo al documento: con Tab non ci si arriverebbe)');
  await page.keyboard.press('Escape');
  assert.equal(await pannello.count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement?.matches('[data-piano-chatgpt]')), true, 'il fuoco torna alla pastiglia');
  // un clic fuori chiude; e se il modello cambia il pannello se ne va con la pastiglia
  await pastiglia.click(); await pannello.waitFor();
  await page.mouse.click(5, 5);
  assert.equal(await pannello.count(), 0);
  await pastiglia.click(); await pannello.waitFor();
  await page.evaluate(() => window.piano.aggiorna({ modelloId: 'openai:gpt-6-luna' }));
  assert.deepEqual([await pannello.count(), await pastiglia.isHidden()], [0, true]);
});

test('PIANO-UI-03: il benvenuto compare UNA volta per account (anche con le maiuscole diverse), col fuoco su «Ho capito»; un deposito rotto non blocca', async (t) => {
  const page = await pagina(t);
  const prima = await page.evaluate((s) => pc.mostraBenvenutoPiano(s), COLLEGATO);
  assert.equal(prima, true);
  const m = await page.evaluate(() => { const d = document.querySelector('dialog[open][data-piano-benvenuto]'); return d ? { testo: d.innerText, fuoco: document.activeElement?.textContent?.trim(), href: d.querySelector('[data-piano-consumi]')?.getAttribute('href') } : null; });
  assert.match(m.testo, /Stai usando il tuo piano ChatGPT/u);
  assert.match(m.testo, /L’utilizzo idoneo in questa app usa il tuo piano ChatGPT\./u);
  assert.match(m.testo, /Gestisci l’utilizzo nelle impostazioni di ChatGPT\./u);
  assert.deepEqual([m.fuoco, m.href], ['Ho capito', 'https://chatgpt.com/settings/usage']);
  await page.locator('[data-piano-benvenuto-ok]').click();
  await page.waitForFunction(() => !document.querySelector('dialog[open][data-piano-benvenuto]'));
  assert.equal(await page.evaluate((s) => pc.mostraBenvenutoPiano({ ...s, email: 'nino@example.com' }), COLLEGATO), false, 'stesso account: mai più');
  assert.equal(await page.evaluate((s) => pc.mostraBenvenutoPiano({ ...s, pianoAbilitato: false, email: 'altro@example.com' }), COLLEGATO), false, 'senza piano abilitato: niente');
  assert.equal(await page.evaluate((s) => { document.querySelector('dialog[open]')?.close(); return pc.mostraBenvenutoPiano({ ...s, email: 'altro@example.com' }); }, COLLEGATO), true, 'un altro account: una volta');
  assert.equal(await page.evaluate((s) => { document.querySelector('dialog[open]')?.close(); const rotto = { getItem() { throw new Error('negato'); }, setItem() { throw new Error('negato'); } }; return pc.mostraBenvenutoPiano({ ...s, email: 'terzo@example.com' }, { deposito: rotto }); }, COLLEGATO), true);
  // il deposito vero ricorda fra una finestra e l'altra: lo stesso account in un deposito che l'ha già scritto non lo rivede
  const ricordo = await page.evaluate(({ s, chiave }) => {
    document.querySelector('dialog[open]')?.close();
    const memoria = new Map([[chiave, JSON.stringify(['quarto@example.com'])]]);
    const deposito = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
    const gia = pc.mostraBenvenutoPiano({ ...s, email: 'QUARTO@example.com' }, { deposito });
    const nuovo = pc.mostraBenvenutoPiano({ ...s, email: 'quinto@example.com' }, { deposito });
    return { gia, nuovo, scritto: JSON.parse(memoria.get(chiave)) };
  }, { s: COLLEGATO, chiave: await page.evaluate(() => pc.CHIAVE_BENVENUTO_PIANO) });
  assert.deepEqual(ricordo, { gia: false, nuovo: true, scritto: ['quarto@example.com', 'quinto@example.com'] });
});

test('PIANO-UI-04: la carta del limite del piano — parole delle linee guida, «Gestisci l utilizzo» primario, larga quanto i messaggi', async (t) => {
  const page = await pagina(t);
  const m = await page.evaluate(() => {
    const conv = document.getElementById('conversation');
    const carta = pc.montaProviderRetry({ contenitore: () => conv });
    const attivo = { inReplay: false, attivo: true };
    carta.evento({ type: 'RunStarted', runId: 'run1', threadId: 'thread1' }, attivo);
    carta.evento({ type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: 2, value: { schema: 'talos.provider-retry.v1', runId: 'run1', threadId: 'thread1', requestId: 'r1',
      fase: 'attesa', tentativo: 2, tentativiMassimi: 11, httpStatus: 429, motivo: 'limite-del-piano', modello: 'chatgpt:gpt-6-luna', retryAt: Date.now() + 1_800_000, attesaMs: 1_800_000 } }, attivo);
    const nodo = conv.querySelector('[data-provider-retry]');
    const azione = nodo?.querySelector('[data-provider-retry-azione]');
    return { titolo: nodo?.querySelector('.talos-provider-retry__titolo')?.textContent, motivo: nodo?.querySelector('.talos-provider-retry__motivo')?.textContent,
      azione: azione ? { testo: azione.textContent, href: azione.getAttribute('href'), primaria: azione.classList.contains('talos-button--primary'), tag: azione.tagName } : null,
      larghezza: Math.round(nodo.getBoundingClientRect().width), messaggio: Math.round(parseFloat(getComputedStyle(conv.querySelector('.talos-message')).maxWidth)),
      sinistra: Math.round(nodo.getBoundingClientRect().left), sinistraMessaggio: Math.round(conv.querySelector('.talos-message').getBoundingClientRect().left) };
  });
  assert.equal(m.titolo, 'Limite d’uso raggiunto');
  assert.match(m.motivo, /^Controlla il tuo piano o il limite di questa app nelle impostazioni di ChatGPT\. Riprende da solo alle /u);
  assert.deepEqual(m.azione, { testo: 'Gestisci l’utilizzo', href: 'https://chatgpt.com/settings/usage', primaria: true, tag: 'A' });
  assert.ok(m.larghezza <= m.messaggio, `la carta (${m.larghezza}) non sporge oltre la colonna dei messaggi (${m.messaggio})`);
  assert.equal(m.sinistra, m.sinistraMessaggio);
  // AL CONTRARIO: un'attesa comune (503) non offre «Gestisci l'utilizzo»
  const comune = await page.evaluate(() => {
    const conv = document.getElementById('conversation'); conv.querySelector('[data-provider-retry]')?.remove();
    const carta = pc.montaProviderRetry({ contenitore: () => conv }); const attivo = { inReplay: false, attivo: true };
    carta.evento({ type: 'RunStarted', runId: 'run2', threadId: 'thread1' }, attivo);
    carta.evento({ type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: 2, value: { schema: 'talos.provider-retry.v1', runId: 'run2', threadId: 'thread1', requestId: 'r2',
      fase: 'attesa', tentativo: 2, tentativiMassimi: 4, httpStatus: 503, modello: 'x/y', retryAt: Date.now() + 2000, attesaMs: 2000 } }, attivo);
    return { carta: Boolean(conv.querySelector('[data-provider-retry]')), azione: Boolean(conv.querySelector('[data-provider-retry-azione]')) };
  });
  assert.deepEqual(comune, { carta: true, azione: false });
});

/*
 * «Continua adesso con…» (owner 27/10/2026 notte, «Sì, un clic per continuare»; bozzetto approvato il 28/10). Sulla carta del limite del
 *   piano, in più: i modelli già configurati (le proposte le dà chi monta la carta) e «Altro modello…», che apre il selettore della chat.
 *   Un clic riuscito lascia «Continuo con …» come nota anche quando il giro fermato finisce; uno fallito riaccende i pulsanti.
 */
test('PIANO-UI-05: «Continua adesso con…» — proposte e «Altro modello…»; riuscito resta «Continuo con …»; fallito riaccende; AL CONTRARIO un 503 o l invio non li offrono', async (t) => {
  const page = await pagina(t);
  const m = await page.evaluate(async () => {
    const conv = document.getElementById('conversation');
    const scelte = [];
    const durante = [];
    let esito = false;
    const attesa = (ms = 30) => new Promise((r) => setTimeout(r, ms));
    const carta = pc.montaProviderRetry({ contenitore: () => conv, continuaAdesso: {
      proposte: async ({ bloccato }) => (bloccato === 'chatgpt:gpt-6-luna'
        ? [{ valore: 'z-ai/glm-5.3-flash', testo: 'glm-5.3-flash', fornitore: 'OpenRouter' }, { valore: 'local:qwen', testo: 'Qwen3.5 9B', fornitore: 'locale' }] : []),
      onScelto: async (valore) => {
        scelte.push(valore);
        if (esito) carta.evento({ type: 'RunError', message: '⛔ stopped on request.', code: 'fermato' }, attivo); // lo stop chiude il giro mentre il cambio è in corso
        else { carta.evento(piano('attesa', { seq: 4 }), attivo); durante.push(conv.querySelectorAll('[data-provider-retry]').length); } // un aggiornamento dell'attesa mentre il cambio è in corso: nessuna seconda carta
        return esito;
      },
      montaAltro: (contenitore, alScelto) => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = 'gemini-3.5-flash'; b.dataset.pickerFinto = '';
        b.addEventListener('click', () => alScelto('gemini:gemini-3.5-flash')); contenitore.replaceChildren(b);
      },
    } });
    const attivo = { inReplay: false, attivo: true };
    const piano = (fase, extra = {}) => ({ type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: extra.seq ?? 2, value: { schema: 'talos.provider-retry.v1', runId: 'run1', threadId: 'thread1', requestId: 'r1',
      fase, tentativo: 2, tentativiMassimi: 11, httpStatus: 429, motivo: 'limite-del-piano', modello: 'chatgpt:gpt-6-luna', retryAt: Date.now() + 1_800_000, attesaMs: 1_800_000, ...extra.value } });
    carta.evento({ type: 'RunStarted', runId: 'run1', threadId: 'thread1' }, attivo);
    carta.evento(piano('attesa'), attivo);
    await attesa();
    const riga = conv.querySelector('[data-provider-retry-continua]');
    const prima = {
      etichetta: riga?.querySelector('.talos-provider-retry__continua-etichetta')?.textContent ?? null,
      pulsanti: [...(riga?.querySelectorAll('[data-continua-con]') ?? [])].map((b) => b.textContent),
      altro: riga?.querySelector('[data-continua-altro]')?.textContent ?? null,
      nelloStato: Boolean(conv.querySelector('[role="status"] [data-provider-retry-continua]')),
    };
    // un clic che non riesce: il giro aspetta ancora, la carta torna (una sola) coi pulsanti accesi
    riga.querySelector('[data-continua-con]').click();
    await attesa();
    const nuova = conv.querySelector('[data-provider-retry-continua]');
    const fallito = { carte: conv.querySelectorAll('[data-provider-retry]').length, spenti: [...nuova.querySelectorAll('button')].filter((b) => b.disabled).length,
      pulsanti: nuova.querySelectorAll('[data-continua-con]').length, titolo: conv.querySelector('.talos-provider-retry__titolo').textContent };
    // «Altro modello…» apre il selettore della chat; il modello scelto lì segue la stessa strada, e questa volta riesce
    esito = true;
    nuova.querySelector('[data-continua-altro]').click();
    const apertoAltro = nuova.querySelector('[data-continua-altro]').getAttribute('aria-expanded');
    conv.querySelector('[data-picker-finto]').click();
    await attesa();
    const dopo = {
      titolo: conv.querySelector('.talos-provider-retry__titolo')?.textContent ?? null,
      motivo: conv.querySelector('.talos-provider-retry__motivo')?.textContent ?? null,
      righe: conv.querySelectorAll('[data-provider-retry-continua]').length,
      azione: Boolean(conv.querySelector('[data-provider-retry-azione]')),
      tempo: Boolean(conv.querySelector('.talos-provider-retry__tempo')),
    };
    // il giro fermato finisce: la nota resta nella chat (anche quando la fine del giro arriva MENTRE il cambio è in corso: sotto)
    carta.evento({ type: 'RunError', message: '⛔ stopped on request.', code: 'fermato' }, attivo);
    const resta = conv.querySelectorAll('[data-provider-retry-continuato]').length;
    // AL CONTRARIO: un giro nuovo con un'attesa comune (503) o col piano in fase d'invio non offre niente
    carta.evento({ type: 'RunStarted', runId: 'run2', threadId: 'thread1' }, attivo);
    carta.evento({ type: 'CUSTOM', name: 'talos.provider-retry', _sequenza: 2, value: { schema: 'talos.provider-retry.v1', runId: 'run2', threadId: 'thread1', requestId: 'r2',
      fase: 'attesa', tentativo: 2, tentativiMassimi: 4, httpStatus: 503, modello: 'x/y', retryAt: Date.now() + 2000, attesaMs: 2000 } }, attivo);
    await attesa();
    const comune = conv.querySelectorAll('[data-provider-retry] [data-provider-retry-continua]').length;
    carta.evento({ type: 'RunStarted', runId: 'run3', threadId: 'thread1' }, attivo);
    carta.evento({ ...piano('invio'), value: { ...piano('invio').value, runId: 'run3' } }, attivo);
    await attesa();
    const invio = conv.querySelectorAll('[data-provider-retry] [data-provider-retry-continua]').length;
    return { prima, fallito, scelte, apertoAltro, dopo, resta, comune, invio, durante };
  });
  assert.deepEqual(m.prima, { etichetta: 'Continua adesso con', pulsanti: ['glm-5.3-flash · OpenRouter', 'Qwen3.5 9B · locale'], altro: 'Altro modello…', nelloStato: false },
    'la riga sta fuori dalla regione che si annuncia: i pulsanti non si rileggono a ogni cambio');
  assert.deepEqual(m.fallito, { carte: 1, spenti: 0, pulsanti: 2, titolo: 'Limite d’uso raggiunto' });
  assert.deepEqual(m.scelte, ['z-ai/glm-5.3-flash', 'gemini:gemini-3.5-flash']);
  assert.deepEqual(m.durante, [1], 'mentre il cambio è in corso c’è una carta sola');
  assert.equal(m.apertoAltro, 'true');
  assert.equal(m.dopo.titolo, 'Continuo con gemini-3.5-flash');
  assert.match(m.dopo.motivo, /^Il piano ChatGPT torna alle \d{2}[:.]\d{2}: lo riprendi dal menu del modello quando vuoi\.$/u);
  assert.deepEqual({ righe: m.dopo.righe, azione: m.dopo.azione, tempo: m.dopo.tempo }, { righe: 0, azione: false, tempo: false });
  assert.equal(m.resta, 1, '«Continuo con …» resta nella chat quando il giro fermato finisce');
  assert.equal(m.comune, 0, 'un\'attesa comune non offre altri modelli');
  assert.equal(m.invio, 0, 'mentre riprova col piano non si offre niente');
});
