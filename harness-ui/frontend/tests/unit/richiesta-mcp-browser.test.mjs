/*
 * ⛔ 02/10/2026 — la scheda delle richieste dei server MCP (`src/components/richiesta-mcp.js`), provata in un Chromium VERO:
 * gli `input` (tipi, valori, caselle, interruttori) un documento finto non li sa imitare. Nessun server e nessuna porta: una
 * pagina vuota e il modulo del componente caricato dentro, come `provider-modale-salva-browser.test.mjs`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from '@playwright/test';
import { build } from 'esbuild';

/* 03/10/2026 — il componente ora importa il dizionario (`lingua.js`), come ogni altro: non si può più incollare il suo testo in una
   pagina vuota. Si impacchetta col suo vero grafo di import, nello stesso modo di `famiglia-consenso-stile-browser.test.mjs`. */
const codiceModulo = (await build({ absWorkingDir: tmpdir(), stdin: { contents: `
  import { creaRichiestaMcp, segnaEsitoRichiestaMcp, erroreDelModulo } from './src/components/richiesta-mcp.js';
  window.__mcp = { creaRichiestaMcp, segnaEsitoRichiestaMcp, erroreDelModulo };
`, resolveDir: fileURLToPath(new URL('../..', import.meta.url)), sourcefile: 'rm-banco.js' }, bundle: true, write: false, format: 'iife', logLevel: 'silent' })).outputFiles[0].text;
/* il foglio VERO dell'app (main.css con tutti i suoi @import), impacchettato come in provider-modale-salva-browser.test.mjs */
const frontend = fileURLToPath(new URL('../..', import.meta.url));
const soloFrontend = { name: 'solo-frontend', setup(b) {
  b.onResolve({ filter: /.*/ }, (args) => {
    if (/\.(woff2?|ttf)$/u.test(args.path)) return { path: args.path, external: true };
    if (args.kind !== 'entry-point' && args.path.startsWith('/')) return { path: args.path, external: true };
    const path = resolve(args.resolveDir || frontend, args.path);
    if (relative(frontend, path).startsWith('..')) throw new Error('Sorgente fuori dal frontend: ' + path);
    return { path, namespace: 'rm' };
  });
  b.onLoad({ filter: /.*/, namespace: 'rm' }, async (args) => ({ contents: await readFile(args.path, 'utf8'), resolveDir: dirname(args.path), loader: 'css' }));
} };
const foglio = (await build({ absWorkingDir: tmpdir(), plugins: [soloFrontend], entryPoints: [resolve(frontend, 'src/styles/main.css')], bundle: true, write: false, logLevel: 'silent' })).outputFiles[0].text;
const MODULO = { server: 'github', mode: 'form', message: 'Dettagli della pull request', requestedSchema: { type: 'object', required: ['titolo'], properties: {
  titolo: { type: 'string', title: 'Titolo', description: 'Una riga' }, email: { type: 'string', format: 'email' },
  bozza: { type: 'boolean', default: true }, priorita: { type: 'string', enum: ['bassa', 'alta'], enumNames: ['Bassa', 'Alta'] },
  revisori: { type: 'array', items: { type: 'string', enum: ['ana', 'bo'] } }, quanti: { type: 'integer', minimum: 1 } } } };
const PAGINA = { server: 'linear', mode: 'url', message: 'Accedi a Linear', url: 'https://linear.app/oauth/authorize?x=1', dominio: 'linear.app' };

let browser;
test.before(async () => { browser = await chromium.launch({ headless: true }); });
test.after(async () => { await browser?.close(); });

async function pagina() {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><meta charset="utf-8"><body><div id="r"></div></body>');
  await page.addScriptTag({ content: codiceModulo });
  await page.waitForFunction(() => window.__mcp);
  return page;
}

test('RICHIESTA-MCP-01 (modulo): ogni campo col controllo del suo tipo, i predefiniti, l’obbligatorio; chi chiede è scritto', async () => {
  const page = await pagina();
  const m = await page.evaluate((richiesta) => {
    const s = window.__mcp.creaRichiestaMcp(richiesta, {});
    document.getElementById('r').append(s.scheda);
    const campo = (n) => s.scheda.querySelector(`[data-campo="${n}"]`);
    return {
      testa: s.scheda.querySelector('.talos-approval__head').textContent,
      frase: s.scheda.querySelector('.talos-approval__why').textContent,
      titolo: { tipo: campo('titolo').querySelector('input').type, obbligatorio: campo('titolo').querySelector('input').required, etichetta: campo('titolo').querySelector('label').textContent },
      email: campo('email').querySelector('input').type,
      bozza: { tipo: campo('bozza').querySelector('input').type, ruolo: campo('bozza').querySelector('input').getAttribute('role'), acceso: campo('bozza').querySelector('input').checked },
      priorita: [...campo('priorita').querySelectorAll('input')].map((i) => [i.type, i.value]),
      prioritaTesti: [...campo('priorita').querySelectorAll('.talos-mcp-campo__scelta')].map((x) => x.textContent),
      revisori: [...campo('revisori').querySelectorAll('input')].map((i) => i.type),
      quanti: { tipo: campo('quanti').querySelector('input').type, passo: campo('quanti').querySelector('input').step, min: campo('quanti').querySelector('input').min },
      pulsanti: [...s.scheda.querySelectorAll('.talos-approval__foot button')].map((b) => b.textContent),
    };
  }, MODULO);
  assert.match(m.testa, /Chiede dei dati/u);
  assert.match(m.testa, /server MCP github/u, 'la persona deve sapere CHI chiede');
  assert.equal(m.frase, 'Dettagli della pull request');
  assert.deepEqual(m.titolo, { tipo: 'text', obbligatorio: true, etichetta: 'Titolo · obbligatorio' });
  assert.equal(m.email, 'email');
  assert.deepEqual(m.bozza, { tipo: 'checkbox', ruolo: 'switch', acceso: true });
  assert.deepEqual(m.priorita, [['radio', 'bassa'], ['radio', 'alta']]);
  assert.deepEqual(m.prioritaTesti, ['Bassa', 'Alta']);
  assert.deepEqual(m.revisori, ['checkbox', 'checkbox']);
  assert.deepEqual(m.quanti, { tipo: 'number', passo: '1', min: '1' });
  assert.deepEqual(m.pulsanti, ['Invia', 'Rifiuta', 'Annulla']);
  await page.close();
});

test('RICHIESTA-MCP-02 (modulo): senza l’obbligatorio non parte e lo dice; compilato manda SOLO i campi riempiti', async () => {
  const page = await pagina();
  const esito = await page.evaluate((richiesta) => {
    const inviati = [];
    const s = window.__mcp.creaRichiestaMcp(richiesta, { onInvia: (c) => inviati.push(c) });
    document.getElementById('r').append(s.scheda);
    const invia = s.pulsanti.invia;
    invia.click();
    const errore = { testo: s.scheda.querySelector('.talos-mcp-richiesta__errore').textContent, visibile: !s.scheda.querySelector('.talos-mcp-richiesta__errore').hidden, fuoco: document.activeElement?.closest('[data-campo]')?.dataset.campo };
    s.scheda.querySelector('[data-campo="titolo"] input').value = 'Fix login';
    s.scheda.querySelector('[data-campo="quanti"] input').value = '0';
    invia.click();
    const sottoMinimo = s.scheda.querySelector('.talos-mcp-richiesta__errore').textContent;
    s.scheda.querySelector('[data-campo="quanti"] input').value = '2';
    s.scheda.querySelector('[data-campo="revisori"] input[value="ana"]').checked = true;
    s.scheda.querySelector('[data-campo="priorita"] input[value="alta"]').checked = true;
    invia.click();
    return { errore, sottoMinimo, inviati, erroreDopo: s.scheda.querySelector('.talos-mcp-richiesta__errore').hidden };
  }, MODULO);
  assert.deepEqual(esito.errore, { testo: 'Compila «Titolo».', visibile: true, fuoco: 'titolo' });
  assert.equal(esito.sottoMinimo, '«quanti» deve essere almeno 1.');
  assert.deepEqual(esito.inviati, [{ titolo: 'Fix login', bozza: true, priorita: 'alta', revisori: ['ana'], quanti: 2 }], 'email vuota non si manda');
  assert.equal(esito.erroreDopo, true);
  await page.close();
});

test('RICHIESTA-MCP-03 (pagina): il dominio davanti, l’indirizzo intero, si apre SOLO col clic, poi «Ho finito»', async () => {
  const page = await pagina();
  const esito = await page.evaluate((richiesta) => {
    const aperti = [], fatti = [];
    const s = window.__mcp.creaRichiestaMcp(richiesta, { onApri: (u) => aperti.push(u), onFatto: () => fatti.push(1) });
    document.getElementById('r').append(s.scheda);
    const prima = { aperti: aperti.length, dominio: s.scheda.querySelector('.talos-mcp-pagina__dominio').textContent, indirizzo: s.scheda.querySelector('.talos-mcp-pagina__indirizzo').textContent, fattoNascosto: s.pulsanti.fatto.hidden, testa: s.scheda.querySelector('.talos-approval__head').textContent };
    s.pulsanti.apri.click();
    const dopo = { aperti: [...aperti], apriNascosto: s.pulsanti.apri.hidden, fattoNascosto: s.pulsanti.fatto.hidden };
    s.pulsanti.fatto.click();
    return { prima, dopo, fatti: fatti.length };
  }, PAGINA);
  assert.deepEqual(esito.prima, { aperti: 0, dominio: 'linear.app', indirizzo: 'https://linear.app/oauth/authorize?x=1', fattoNascosto: true, testa: esito.prima.testa });
  assert.match(esito.prima.testa, /Chiede di aprire una pagina.*server MCP linear/u);
  assert.deepEqual(esito.dopo, { aperti: ['https://linear.app/oauth/authorize?x=1'], apriNascosto: true, fattoNascosto: false });
  assert.equal(esito.fatti, 1);
  await page.close();
});

test('RICHIESTA-MCP-04: l’esito toglie modulo e piede (il contenuto non resta a schermo), con le parole e il tono giusti', async () => {
  const page = await pagina();
  const esiti = await page.evaluate((richiesta) => {
    const prova = (esito, modo = 'form') => {
      const s = window.__mcp.creaRichiestaMcp(modo === 'url' ? { ...richiesta, mode: 'url', url: 'https://a.example/', dominio: 'a.example' } : richiesta, {});
      document.getElementById('r').append(s.scheda);
      if (modo === 'form') s.scheda.querySelector('[data-campo="titolo"] input').value = 'Segreto da non lasciare';
      const riga = window.__mcp.segnaEsitoRichiestaMcp(s.scheda, { ...esito, modo });
      return { testo: riga.textContent, classe: riga.className, resto: s.scheda.textContent.includes('Segreto da non lasciare'), input: s.scheda.querySelectorAll('input, button').length, frase: Boolean(s.scheda.querySelector('.talos-approval__why')) };
    };
    return [prova({ action: 'accept' }), prova({ action: 'accept' }, 'url'), prova({ action: 'decline', altrove: true }), prova({ action: 'cancel', motivo: 'fermato' }), prova({ action: 'cancel', motivo: 'non-in-attesa' })];
  }, MODULO);
  assert.deepEqual(esiti.map((e) => e.testo), ['Inviato al server', 'Fatto sulla pagina', 'Rifiutato da un’altra finestra', 'Annullato: la sessione si è fermata', 'Il server non aspetta più una risposta']);
  assert.deepEqual(esiti.map((e) => e.classe.split('--')[1]), ['si', 'si', 'no', 'neutro', 'neutro']);
  for (const e of esiti) {
    assert.equal(e.resto, false, 'il contenuto del modulo non resta a schermo');
    assert.equal(e.input, 0, 'niente più campi né pulsanti');
    assert.equal(e.frase, true, 'resta la frase del server: cosa era stato chiesto');
  }
  await page.close();
});

test('RICHIESTA-MCP-05: Rifiuta e Annulla chiamano i loro gesti; in attesa tutti i pulsanti sono spenti', async () => {
  const page = await pagina();
  const esito = await page.evaluate((richiesta) => {
    const gesti = [];
    const s = window.__mcp.creaRichiestaMcp(richiesta, { onRifiuta: () => gesti.push('rifiuta'), onAnnulla: () => gesti.push('annulla') });
    document.getElementById('r').append(s.scheda);
    s.pulsanti.rifiuta.click(); s.pulsanti.annulla.click();
    s.inAttesa(true);
    const spenti = [...s.scheda.querySelectorAll('.talos-approval__foot button')].every((b) => b.disabled);
    s.inAttesa(false);
    const accesi = [...s.scheda.querySelectorAll('.talos-approval__foot button')].every((b) => !b.disabled);
    return { gesti, spenti, accesi };
  }, MODULO);
  assert.deepEqual(esito, { gesti: ['rifiuta', 'annulla'], spenti: true, accesi: true });
  await page.close();
});

/*
 * ⛔ 02/10/2026 sera — dalle foto della prova sul 4174: l'errore restava a schermo dopo che la persona aveva compilato il
 * campo, e stava fuori dal modulo. Codex `mcp_server_elicitation.rs:1636-1642` lo azzera appena la bozza cambia.
 */
test('RICHIESTA-MCP-06: l’errore sta in fondo al modulo e sparisce appena la persona tocca un campo (testo o scelta)', async () => {
  const page = await pagina();
  await page.evaluate((richiesta) => {
    window.__s = window.__mcp.creaRichiestaMcp(richiesta, {});
    document.getElementById('r').append(window.__s.scheda);
  }, MODULO);
  const errore = page.locator('.talos-mcp-richiesta__errore');
  await page.getByRole('button', { name: 'Invia' }).click();
  assert.equal(await errore.isVisible(), true);
  assert.equal(await page.evaluate(() => Boolean(document.querySelector('[data-corpo] > .talos-mcp-richiesta__errore'))), true, 'l’errore è l’ultima riga del modulo, non fuori');
  await page.locator('[data-campo="titolo"] input').fill('F');
  assert.equal(await errore.isVisible(), false, 'scrivere nel campo toglie l’errore');
  await page.locator('[data-campo="titolo"] input').fill('');
  await page.getByRole('button', { name: 'Invia' }).click();
  assert.equal(await errore.isVisible(), true);
  await page.locator('[data-campo="priorita"] input[value="alta"]').check();
  assert.equal(await errore.isVisible(), false, 'anche una scelta toglie l’errore');
  await page.close();
});

/*
 * ⛔ 02/10/2026 sera — la scheda vive dentro `.talos-message`, dove `.talos-message p` (0,1,1) e `p:last-child` (0,2,1)
 * battevano le sue regole (0,1,0): esito ed errore a 17 px col colore del testo, l'esito senza tono, la nota attaccata al
 * bordo, l'esito attaccato al fondo, il pallino della scelta del blu di Chromium. Prova col foglio VERO dell'app.
 */
test('RICHIESTA-MCP-07: dentro la chat, col foglio vero: esito ed errore piccoli e col loro tono, nota staccata, pallino d’accento', async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.setContent('<!doctype html><html lang="it"><head><meta charset="utf-8"></head><body><div id="conversation"><article class="talos-message"><div class="talos-message__body" id="r"></div></article></div></body></html>');
  await page.addStyleTag({ content: foglio });
  await page.addScriptTag({ content: codiceModulo });
  await page.waitForFunction(() => window.__mcp);
  const m = await page.evaluate(([modulo, paginaR]) => {
    const r = document.getElementById('r');
    const tinta = (v) => { const s = document.createElement('span'); s.style.color = `var(${v})`; r.append(s); const c = getComputedStyle(s).color; s.remove(); return c; };
    const tinte = { si: tinta('--talos-success'), no: tinta('--talos-danger'), muto: tinta('--talos-muted'), testo: tinta('--talos-assistant-text'), accento: tinta('--talos-accent') };
    const f = window.__mcp.creaRichiestaMcp(modulo, {}); r.append(f.scheda);
    f.pulsanti.invia.click();
    const e = getComputedStyle(f.scheda.querySelector('.talos-mcp-richiesta__errore'));
    const radio = getComputedStyle(f.scheda.querySelector('[data-campo="priorita"] input'));
    const sinistra = (sel) => Math.round(f.scheda.querySelector(sel).getBoundingClientRect().left);
    const allineati = sinistra('[data-campo="priorita"] input') === sinistra('[data-campo="revisori"] input');
    const p = window.__mcp.creaRichiestaMcp(paginaR, {}); r.append(p.scheda);
    const nota = p.scheda.querySelector('.talos-mcp-pagina .talos-approval__motivo');
    const fondo = (n) => n.parentElement.getBoundingClientRect().bottom - parseFloat(getComputedStyle(n.parentElement).borderBottomWidth) - n.getBoundingClientRect().bottom;
    const esiti = [['accept', 'si'], ['decline', 'no'], ['cancel', 'muto']].map(([action]) => {
      const s = window.__mcp.creaRichiestaMcp(modulo, {}); r.append(s.scheda);
      const riga = window.__mcp.segnaEsitoRichiestaMcp(s.scheda, { action });
      const c = getComputedStyle(riga);
      return { fs: c.fontSize, colore: c.color, fondo: Math.round(s.scheda.getBoundingClientRect().bottom - parseFloat(getComputedStyle(s.scheda).borderBottomWidth) - riga.getBoundingClientRect().bottom) };
    });
    return { tinte, allineati, errore: { fs: e.fontSize, colore: e.color }, radio: radio.accentColor, nota: { fs: getComputedStyle(nota).fontSize, colore: getComputedStyle(nota).color, fondo: Math.round(fondo(nota)) }, esiti };
  }, [MODULO, PAGINA]);
  assert.notEqual(m.tinte.si, m.tinte.testo, 'le tinte di prova devono essere diverse dal testo, o la prova non morde');
  assert.deepEqual(m.errore, { fs: '12.5px', colore: m.tinte.no });
  assert.equal(m.radio, m.tinte.accento);
  assert.equal(m.allineati, true, 'i pallini della scelta singola allineati alle caselle della multipla');
  assert.equal(m.nota.fs, '12.5px');
  assert.equal(m.nota.colore, m.tinte.muto);
  assert.ok(m.nota.fondo >= 10, `la nota della pagina non tocca il bordo del corpo (${m.nota.fondo}px)`);
  assert.deepEqual(m.esiti.map((x) => x.fs), ['12px', '12px', '12px']);
  assert.deepEqual(m.esiti.map((x) => x.colore), [m.tinte.si, m.tinte.no, m.tinte.muto], 'ogni esito col suo tono');
  for (const x of m.esiti) assert.ok(x.fondo >= 10, `l’esito non tocca il fondo della carta (${x.fondo}px)`);
  await page.close();
});
