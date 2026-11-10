import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { attendiFineStoria, flussoConConfine } from './aiuto-confine.mjs';
import { cadenzaRegolare } from './aiuto-scenari-fluido.mjs';

/*
 * 10/11/2026 (0.2.1) — IL BLOCCO RICHIUDIBILE NELLA CHAT VERA. Owner, foto delle 13:40: `<details><summary>…` scritti dal modello
 *   uscivano come testo letterale. Le regole stanno nelle unit (`tests/unit/markdown-richiudibili.test.mjs`); qui si guarda la app:
 *   · RICHIUDIBILE-01 — il renderer incrementale della chat dà a OGNI prefisso lo stesso DOM del tutto-insieme (la trappola delle
 *     righe vuote dentro il blocco, recinti e tabelle dentro, blocchi annidati, dieci di fila), a un carattere e a salti;
 *   · RICHIUDIBILE-02 — mentre il messaggio scorre i tag non si vedono mai e il testo arrivato è tutto a schermo; alla fine i
 *     blocchi sono chiusi, si aprono col clic, con Invio e con Spazio, il fuoco si vede, «Copia» ha ancora il testo grezzo;
 *   · RICHIUDIBILE-03 — sicurezza nel DOM vero: nessun `script`, `img`, `iframe`, nessun attributo `on*`, niente che esegua;
 *   · RICHIUDIBILE-04 — le foto in chiaro e in scuro: chiuso, aperto, mentre arriva, un blocco col corpo vuoto accanto a uno pieno;
 *   · RICHIUDIBILE-05 — (giro 2, giudice v1328) la freccia misurata dal `transform` calcolato, e il blocco col corpo vuoto che è una
 *     riga di titolo: niente cursore a mano, niente fuoco, niente freccia, il clic non cambia niente.
 * ⛔ Mai il 4174: server proprio (playwright.config.mjs), sessione finta, il flusso è una rotta. I testi sono finti, scritti qui.
 */

const SID = 'blocchi-richiudibili';
const FOTO = process.env.TALOS_FOTO_RICHIUDIBILI || '';

async function apri(page) {
  await page.addInitScript(() => { try { localStorage.setItem('talos.harness.desktop.intro.v1', JSON.stringify({ esito: 'saltata' })); } catch { /* niente storage */ } });
  await page.route((url) => url.pathname === `/api/v1/sessions/${SID}/events`, flussoConConfine);
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.evaluate((sid) => window.__talosHarnessUiRuntime.passaASessione(sid, 'workspace', 'Blocchi richiudibili', 'local:prova', { conclusa: false, modello: 'local:prova' }), SID);
  await attendiFineStoria(page);
}

const BLOCCO = (n) => [`<details>`, `<summary>Passo ${n}: cosa è successo</summary>`, '', `Primo paragrafo del passo ${n}, con **grassetto** e \`codice\`.`, '', `- voce ${n}a`, `- voce ${n}b`, '', '</details>'].join('\n');

/* Tutto ciò che può andare storto ai confini: righe vuote dentro, un recinto che contiene la chiusura, una tabella, un blocco
   annidato, testo attaccato prima e dopo, blocchi di fila, un details nel codice, uno con attributi (resta testo), uno mai chiuso. */
const TESTO_RICCO = [
  'Ecco il riepilogo.',
  '<details>',
  '<summary>Cosa è **successo**</summary>',
  '',
  'Primo paragrafo.',
  '',
  '```js',
  'const html = "</details>";',
  '',
  '```',
  '',
  '| Colonna A | Colonna B |',
  '|---|---|',
  '| uno | due |',
  '',
  '<details open>',
  '<summary>Dentro</summary>',
  '',
  'Annidato.',
  '',
  '</details>',
  '',
  'Ultimo paragrafo del blocco.',
  '</details>',
  'Testo attaccato dopo.',
  '',
  BLOCCO(1),
  BLOCCO(2),
  '',
  BLOCCO(3),
  '- voce di elenco',
  '  <details>',
  '  <summary>Sotto la voce</summary>',
  '  corpo',
  '  </details>',
  '',
  '```html',
  '<details>',
  '<summary>nel codice</summary>',
  '</details>',
  '```',
  'In riga: `<details>` resta codice.',
  '',
  '<details class="x">',
  '',
  'non è un blocco',
  '',
  '</details>',
  '',
  '<details><summary>Su una riga</summary>corpo</details> coda',
  '',
  /* la forma misurata dal giudice (v1328) nella chat dell'owner: tre blocchi col corpo vuoto di fila, poi testo */
  '<details>', '<summary>Vuoto uno</summary>', '', '</details>',
  '<details>', '<summary>Vuoto due</summary>', '', '</details>',
  '<details>', '<summary>Vuoto tre</summary>', '', '</details>',
  '',
  'Testo dopo i vuoti.',
  '',
  '<details>',
  '<summary>Mai chiuso</summary>',
  '',
  'resto del messaggio',
  '',
  '## titolo dentro',
].join('\n');

test('RICHIUDIBILE-01 — il renderer incrementale dà lo stesso DOM del tutto-insieme a OGNI prefisso, anche con le righe vuote dentro il blocco', async ({ page }) => {
  await apri(page);
  const esito = await page.evaluate((testo) => {
    const { nuovoStatoRender, renderizzaIncrementale, renderizzaTutto } = window.__talosHarnessUiRuntime.streamingPerProve;
    const normalizza = (html) => html.replace(/ class="stream-settle"/g, '').replace(/ stream-settle/g, '').replace(/stream-settle /g, '');
    const confronta = (passi) => {
      const contenitore = document.createElement('div');
      const stato = nuovoStatoRender();
      const atteso = document.createElement('div');
      for (const fino of passi) {
        const prefisso = testo.slice(0, fino);
        renderizzaIncrementale(contenitore, stato, prefisso);
        atteso.replaceChildren(renderizzaTutto(prefisso));
        const a = normalizza(contenitore.innerHTML);
        const b = normalizza(atteso.innerHTML);
        if (a !== b) return { fino, prefisso: prefisso.slice(-60), incrementale: a.slice(-400), tuttoInsieme: b.slice(-400) };
      }
      return null;
    };
    const unoAUno = Array.from({ length: testo.length }, (_, i) => i + 1);
    let seme = 7;
    const salti = [];
    for (let i = 0; i < testo.length;) { seme = (seme * 1103515245 + 12345) % 2147483648; i = Math.min(testo.length, i + 1 + (seme % 37)); salti.push(i); }
    const intero = document.createElement('div');
    intero.replaceChildren(renderizzaTutto(testo));
    return {
      unoAUno: confronta(unoAUno), aSalti: confronta(salti), passi: unoAUno.length + salti.length,
      blocchi: intero.querySelectorAll('details.md-richiudibile').length,
      vuoti: [...intero.querySelectorAll('div.md-richiudibile--vuoto > div.md-richiudibile__titolo')].map((s) => s.textContent),
      titoli: [...intero.querySelectorAll('summary.md-richiudibile__titolo')].map((s) => s.textContent),
      codiceConTag: [...intero.querySelectorAll('pre, code')].some((c) => c.textContent.includes('<summary>nel codice</summary>')),
    };
  }, TESTO_RICCO);
  expect(esito.passi).toBeGreaterThan(TESTO_RICCO.length);
  expect(esito.unoAUno, `a passi di un carattere il DOM diverge: ${JSON.stringify(esito.unoAUno)}`).toBeNull();
  expect(esito.aSalti, `a salti il DOM diverge: ${JSON.stringify(esito.aSalti)}`).toBeNull();
  /* il blocco grande, quello annidato, i tre di fila, quello sotto la voce, quello su una riga, quello mai chiuso: otto. Quello nel
     codice e quello con gli attributi NON sono blocchi */
  expect(esito.blocchi).toBe(8);
  expect(esito.titoli).toEqual(['Cosa è successo', 'Dentro', 'Passo 1: cosa è successo', 'Passo 2: cosa è successo', 'Passo 3: cosa è successo', 'Sotto la voce', 'Su una riga', 'Mai chiuso']);
  /* i tre col corpo vuoto sono righe di titolo, non blocchi apribili */
  expect(esito.vuoti).toEqual(['Vuoto uno', 'Vuoto due', 'Vuoto tre']);
  expect(esito.codiceConTag).toBe(true);
});

/** Fa scorrere `testo` nella chat vera, campionando a ogni fotogramma ciò che si vede. */
async function scorri(page, { testo, passi, modo, messageId, fine = true, campiona = [] }) {
  return page.evaluate(async ({ testo, passi, modo, messageId, fine, campiona }) => {
    const rt = window.__talosHarnessUiRuntime;
    const rs = rt.realSessionState;
    const radice = window.__talosHarnessHost || document.documentElement;
    radice.dataset.talosStreamingAnimation = modo;
    let seq = 500000;
    for (const vista of rs.sequenzeViste) if (vista > seq) seq = vista;
    rt.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Domanda di prova', seguito: true }, _sequenza: seq += 1 }, rs.generation);
    const vietati = new Set();
    let vivo = true;
    let fotogrammi = 0;
    const tick = () => {
      const copia = rs.messageElements.get(messageId)?.querySelector('.assistant-copy');
      const visibile = copia ? copia.textContent : '';
      fotogrammi += 1;
      for (const v of campiona) if (visibile.includes(v)) vietati.add(v);
      if (vivo) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    let previsto = performance.now();
    let dato = 0;
    for (const passo of passi) {
      previsto += passo.dopoMs;
      const manca = previsto - performance.now();
      if (manca > 1) await new Promise((ok) => setTimeout(ok, manca));
      const delta = testo.slice(dato, dato + passo.n);
      dato += passo.n;
      rt.handleRealEvent({ type: 'TextMessageContent', messageId, delta, _sequenza: seq += 1 }, rs.generation);
    }
    if (fine) rt.handleRealEvent({ type: 'TextMessageEnd', messageId, _sequenza: seq += 1 }, rs.generation);
    const scadenza = performance.now() + 8000;
    let completo = false;
    while (performance.now() < scadenza) {
      await new Promise((ok) => requestAnimationFrame(ok));
      if ((rs.renderIncrementale?.get(messageId)?.mostrato ?? 0) >= testo.length) { completo = true; break; }
    }
    await new Promise((ok) => setTimeout(ok, 150));
    vivo = false;
    return { completo, vietati: [...vietati], fotogrammi, grezzo: rs.testoGrezzoMessaggi.get(messageId) };
  }, { testo, passi, modo, messageId, fine, campiona });
}

const TESTO_CHAT = ['Ho finito il lavoro. Qui sotto i dettagli, passo per passo.', '', BLOCCO(1), '', BLOCCO(2), '', 'In breve: tutto a posto.'].join('\n');

test('RICHIUDIBILE-02 — nella chat: i tag non si vedono mai mentre scorre; poi i blocchi si aprono col clic, con Invio e con Spazio, e «Copia» ha il testo grezzo', async ({ page }) => {
  await apri(page);
  const corsa = await scorri(page, { testo: TESTO_CHAT, passi: cadenzaRegolare(TESTO_CHAT.length, 3, 16), modo: 'typewriter', messageId: 'rich-02',
    campiona: ['<det', '<sum', '</det', '</sum', '<details', 'summary>', '<'] });
  expect(corsa.completo, 'il testo deve completarsi').toBe(true);
  expect(corsa.fotogrammi).toBeGreaterThan(20);
  expect(corsa.vietati, `a schermo sono comparsi i tag: ${corsa.vietati.join(' · ')}`).toEqual([]);
  expect(corsa.grezzo, 'il testo grezzo del messaggio (quello che «Copia» copia) resta com\'è arrivato').toBe(TESTO_CHAT);

  const copia = page.locator('.assistant-copy').last();
  const blocchi = copia.locator('details.md-richiudibile');
  await expect(blocchi).toHaveCount(2);
  const primo = blocchi.nth(0);
  const titolo = primo.locator('> summary.md-richiudibile__titolo');
  await expect(titolo).toHaveText('Passo 1: cosa è successo');
  /* chiuso, come l'ha scritto il modello: il corpo c'è ma non si vede */
  expect(await primo.evaluate((d) => d.open)).toBe(false);
  await expect(primo.locator('.md-richiudibile__corpo')).toBeHidden();
  await expect(copia).toContainText('In breve: tutto a posto.');
  /* clic */
  await titolo.click();
  expect(await primo.evaluate((d) => d.open)).toBe(true);
  await expect(primo.locator('.md-richiudibile__corpo strong')).toHaveText('grassetto');
  await expect(primo.locator('.md-richiudibile__corpo li')).toHaveCount(2);
  await titolo.click();
  expect(await primo.evaluate((d) => d.open)).toBe(false);
  /* tastiera: il titolo prende il fuoco, Invio apre, Spazio richiude, e il fuoco si vede */
  await titolo.focus();
  await page.keyboard.press('Enter');
  expect(await primo.evaluate((d) => d.open)).toBe(true);
  await page.keyboard.press('Space');
  expect(await primo.evaluate((d) => d.open)).toBe(false);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const fuoco = await titolo.evaluate((s) => { const c = getComputedStyle(s); return { attivo: document.activeElement === s, stile: c.outlineStyle, spessore: parseFloat(c.outlineWidth), cursore: c.cursor, segnoNativo: getComputedStyle(s, '::marker').content }; });
  expect(fuoco.attivo).toBe(true);
  expect(fuoco.stile).toBe('solid');
  expect(fuoco.spessore).toBeGreaterThanOrEqual(2);
  expect(fuoco.cursore).toBe('pointer');
  /* aprire il primo non tocca il secondo */
  await page.keyboard.press('Enter');
  expect(await blocchi.nth(1).evaluate((d) => d.open)).toBe(false);
});

test('RICHIUDIBILE-03 — sicurezza nel DOM vero: dentro un blocco script, img, iframe e on*= restano testo e niente si esegue', async ({ page }) => {
  await apri(page);
  const cattivo = ['<details open>', '<summary>Titolo <img src=x onerror="window.__bucato=1"></summary>', '', '<script>window.__bucato=2</script>', '<img src=x onerror="window.__bucato=3">',
    '<iframe src="javascript:window.parent.__bucato=4"></iframe>', '<div onclick="window.__bucato=5">div</div>', '[link](javascript:window.__bucato=6)', '', '</details>',
    '<details onclick="window.__bucato=7">', 'x', '</details>', '<details open onmouseover="window.__bucato=8">', 'y', '</details>'].join('\n');
  const corsa = await scorri(page, { testo: cattivo, passi: cadenzaRegolare(cattivo.length, 12, 8), modo: 'none', messageId: 'rich-03' });
  expect(corsa.completo).toBe(true);
  const copia = page.locator('.assistant-copy').last();
  await expect(copia.locator('details.md-richiudibile')).toHaveCount(1);
  await copia.locator('.md-richiudibile__corpo').click();
  await copia.locator('summary').hover();
  const esito = await copia.evaluate((c) => ({
    vietati: c.querySelectorAll('script, img, iframe, object, embed, style, link').length,
    conGestori: [...c.querySelectorAll('*')].filter((e) => [...e.attributes].some((a) => /^on/i.test(a.name) || /javascript:/i.test(a.value))).length,
    attributiDelBlocco: [...c.querySelector('details.md-richiudibile').attributes].map((a) => a.name).sort(),
    bucato: window.__bucato ?? null,
    testo: c.textContent,
  }));
  expect(esito.vietati).toBe(0);
  expect(esito.conGestori).toBe(0);
  expect(esito.attributiDelBlocco).toEqual(['class', 'open']);
  expect(esito.bucato).toBeNull();
  for (const pezzo of ['<script>window.__bucato=2</script>', '<img src=x onerror="window.__bucato=3">', '<details onclick="window.__bucato=7">', '<details open onmouseover="window.__bucato=8">']) expect(esito.testo).toContain(pezzo);
});

/** Gli angoli VERI (gradi, dal `transform` calcolato del `::before`) delle frecce VISIBILI dei blocchi apribili, nell'ordine del
    documento. Quella di un blocco annidato dentro uno chiuso non si disegna (e la sua rotazione resta ferma finché non torna a schermo). */
const frecce = (copia) => copia.evaluate((c) => [...c.querySelectorAll('details.md-richiudibile > summary')].filter((s) => s.checkVisibility()).map((s) => {
  const m = /^matrix\(([^,]+),\s*([^,]+)/.exec(getComputedStyle(s, '::before').transform);
  return m ? Math.round((Math.atan2(Number(m[2]), Number(m[1])) * 180) / Math.PI) : 0;
}));

test('RICHIUDIBILE-05 — la freccia misurata (chiusa dritta, aperta girata) e il blocco col corpo vuoto che non si apre', async ({ page }) => {
  await apri(page);
  const vuoto = (n) => ['<details>', `<summary>${n}</summary>`, '', '</details>'].join('\n');
  const testo = ['Tre passi senza dettagli e uno con.', '', vuoto('Primo passo'), vuoto('Secondo passo'), vuoto('Terzo passo'), '', 'Testo dopo.', '', BLOCCO(1), '', 'Fine.'].join('\n');
  const corsa = await scorri(page, { testo, passi: cadenzaRegolare(testo.length, 20, 4), modo: 'none', messageId: 'rich-05' });
  expect(corsa.completo).toBe(true);
  const copia = page.locator('.assistant-copy').last();
  /* il vuoto: una riga di titolo e basta (niente details, niente summary, niente fuoco, niente cursore a mano, freccia nascosta) */
  const vuoti = copia.locator('.md-richiudibile--vuoto');
  await expect(vuoti).toHaveCount(3);
  await expect(copia.locator('details.md-richiudibile')).toHaveCount(1);
  const riga = await vuoti.first().evaluate((el) => {
    const t = el.querySelector(':scope > .md-richiudibile__titolo');
    return { tag: el.tagName, titolo: t.tagName, testo: t.textContent, cursore: getComputedStyle(t).cursor, freccia: getComputedStyle(t, '::before').visibility, fuoco: t.tabIndex, controlli: el.querySelectorAll('details, summary, button, [tabindex]').length };
  });
  expect(riga).toEqual({ tag: 'DIV', titolo: 'DIV', testo: 'Primo passo', cursore: 'auto', freccia: 'hidden', fuoco: -1, controlli: 0 });
  /* un clic non cambia niente e il fuoco non ci va; la tastiera dal titolo pieno all'indietro non si ferma sui vuoti */
  const altezza = await vuoti.first().evaluate((el) => el.getBoundingClientRect().height);
  await vuoti.first().click();
  expect(await vuoti.first().evaluate((el) => el.getBoundingClientRect().height)).toBe(altezza);
  expect(await vuoti.first().evaluate((el) => el.contains(document.activeElement))).toBe(false);
  const pieno = copia.locator('details.md-richiudibile').first();
  const titolo = pieno.locator('> summary');
  await titolo.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await copia.evaluate((c) => [...c.querySelectorAll('.md-richiudibile--vuoto')].some((v) => v.contains(document.activeElement)))).toBe(false);
  /* la freccia, misura vera del `transform` calcolato: col movimento ridotto subito, col movimento pieno alla fine della rotazione */
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await pieno.evaluate((d) => d.open)).toBe(false);
  expect(await frecce(copia)).toEqual([0]);
  await titolo.click();
  expect(await frecce(copia)).toEqual([90]);
  await titolo.click();
  expect(await frecce(copia)).toEqual([0]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await titolo.click();
  await expect.poll(() => frecce(copia)).toEqual([90]);
  await titolo.click();
  await expect.poll(() => frecce(copia)).toEqual([0]);
  expect(await pieno.evaluate((d) => getComputedStyle(d.querySelector(':scope > summary'), '::before').transform)).toBe('none');
});

test('RICHIUDIBILE-04 — le foto: chiuso, aperto e mentre arriva, in chiaro e in scuro', async ({ page }) => {
  test.skip(!FOTO, 'le foto si scattano solo con TALOS_FOTO_RICHIUDIBILI=<cartella>');
  mkdirSync(FOTO, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await apri(page);
  const testo = ['Ho controllato la cartella e ho trovato tre cose da sistemare.', '', BLOCCO(1), '<details>', '<summary>Passo senza dettagli (corpo vuoto)</summary>', '', '</details>', '', ['<details>', '<summary>Il comando che ho usato</summary>', '', '```bash', 'ls -la ./cartella', '```', '',
    '| File | Stato |', '|---|---|', '| uno.txt | a posto |', '| due.txt | da rifare |', '', '<details>', '<summary>Un blocco dentro il blocco</summary>', '', 'Testo annidato.', '', '</details>', '', '</details>'].join('\n'),
    '', 'Per scrivere un blocco così nel codice si usa `<details>`:', '', '```html', '<details>', '<summary>Titolo</summary>', 'Corpo', '</details>', '```', '', 'In breve: tutto a posto.'].join('\n');
  await scorri(page, { testo, passi: cadenzaRegolare(testo.length, 40, 4), modo: 'none', messageId: 'rich-04' });
  const copia = page.locator('.assistant-copy').last();
  const tema = async (chiaro) => page.evaluate((c) => { const r = document.documentElement; if (c) r.setAttribute('data-theme', 'light'); else r.removeAttribute('data-theme'); }, chiaro);
  for (const [nome, chiaro] of [['scuro', false], ['chiaro', true]]) {
    await tema(chiaro);
    await copia.evaluate((c) => c.querySelectorAll('details.md-richiudibile').forEach((d) => { d.open = false; }));
    /* giudice v1328: la foto chiusa in chiaro era scattata a metà della rotazione (freccia ancora in giù). Si aspetta la fine. */
    await expect.poll(() => frecce(copia)).toEqual(Array(2).fill(0)); // i due di fuori; quello annidato è nascosto
    await page.screenshot({ path: join(FOTO, `richiudibile-chiuso-${nome}.png`) });
    await copia.evaluate((c) => c.querySelectorAll('details.md-richiudibile').forEach((d) => { d.open = true; }));
    await expect.poll(() => frecce(copia)).toEqual(Array(3).fill(90));
    await copia.locator('summary.md-richiudibile__titolo').first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await page.screenshot({ path: join(FOTO, `richiudibile-aperto-${nome}.png`) });
  }
  /* mentre arriva: un secondo messaggio fermato a metà del blocco (niente evento di fine) */
  const aMeta = ['Sto ancora scrivendo.', '', '<details>', '<summary>Cosa sto facendo</summary>', '', 'Primo paragrafo già arrivato.', '', '- una voce', '- una seconda vo'].join('\n');
  await scorri(page, { testo: aMeta, passi: cadenzaRegolare(aMeta.length, 40, 4), modo: 'none', messageId: 'rich-04-arrivo', fine: false });
  for (const [nome, chiaro] of [['scuro', false], ['chiaro', true]]) {
    await tema(chiaro);
    await page.locator('.assistant-copy').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(FOTO, `richiudibile-in-arrivo-${nome}.png`) });
  }
  const inArrivo = page.locator('.assistant-copy').last().locator('details.md-richiudibile');
  await expect(inArrivo).toHaveCount(1);
  expect(await inArrivo.evaluate((d) => d.open), 'un blocco non ancora chiuso si vede aperto').toBe(true);
  await expect(inArrivo.locator('li')).toHaveCount(2);
});
