import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/*
 * Revisione UX della candidata, 04/11/2026 (Frontend), righe 38, 39, 40 e 42: la chat vista da utente.
 *   38 · in fondo alla chat, due domande corte: la successiva restava a metà SOPRA la ferma, per sempre (foto 92).
 *   39 · la carta dopo Stop diceva la stessa cosa tre volte: «Fermato», «TALOS · fermato», «Hai fermato il giro.» (foto 85).
 *   40 · il suggerimento nel campo dopo una ricerca: «Approfondisci "segret"», parola tagliata e virgolette dritte (foto 88).
 *   42 · un allegato solo: «~16 token» scritto due volte, sulla scheda e a destra (foto 91).
 * Ogni prova misura nel DOM vivo (`elementFromPoint`, riquadri, testo a schermo). ⛔ Nessuna scrittura: il server finto risponde ai
 * GET; un caricamento d'allegato si risponde qui con la ricevuta (forma di `chat-files-workspace.spec.mjs`), ogni altro non-GET si conta.
 * Foto 1920×1080 chiaro e scuro in `UX_FOTO_DIR` (se c'è).
 */

const ID = 'ux-38-42';
const LUNGA = Array.from({ length: 40 }, (_, i) => `Paragrafo ${i}: testo della risposta che continua a lungo per riempire lo schermo.`).join('\n\n');
const FOTO = process.env.UX_FOTO_DIR || '';
const ID_ALLEGATO = 'b'.repeat(24);
const ricevuta = (nome) => ({ tipo: 'file', nome, percorso: `attachments/${ID_ALLEGATO}/${nome}`, allegatoId: ID_ALLEGATO, bytes: 63 });

function turni(risposte) {
  const lista = [];
  risposte.forEach((risposta, t) => {
    lista.push(
      { type: 'RunStarted', runId: `run-${t}`, input: { consegna: `Domanda numero ${t}: spiegami il passo ${t}.`, seguito: t > 0 } },
      { type: 'TextMessageStart', messageId: `m-${t}`, role: 'assistant' },
      { type: 'TextMessageContent', messageId: `m-${t}`, delta: risposta },
      { type: 'TextMessageEnd', messageId: `m-${t}` },
      { type: 'RunFinished', outcome: { type: 'success' } },
    );
  });
  return lista;
}

async function apri(page, modo) {
  await page.addInitScript((colorMode) => {
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } })); } catch { /* storage assente */ }
  }, modo);
  const tentate = [];
  await page.route('**/api/v1/**', (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === '/api/v1/chat-files' && req.method() === 'POST') {
      const nome = decodeURIComponent(req.headers()['x-talos-file-name'] ?? 'allegato.txt');
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, data: ricevuta(nome) }) });
    }
    if (req.method() !== 'GET') { tentate.push(`${req.method()} ${path}`); return route.abort(); }
    return route.fallback();
  });
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta aperto e muto */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Revisione UX', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    r.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, r.realSessionState.generation);
  }, ID);
  await expect(page.locator('#conversation')).not.toHaveClass(/\bis-restoring\b/);
  return tentate;
}

let sequenza = 0;
const eventi = (page, lista) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, lista.map((e) => ({ ...e, _sequenza: ++sequenza })));
const assestato = (page) => page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(ok)), 150)))));
const foto = async (page, nome) => { if (!FOTO) return; mkdirSync(FOTO, { recursive: true }); await page.screenshot({ path: `${FOTO}/${nome}.png` }); };
const tema = (modo) => (modo === 'light' ? 'chiaro' : 'scuro');

/** In cima alla chat: quale domanda è ferma, fin dove arriva la sua fascia, e dove sta la testa della domanda dopo. */
const cima = (page) => page.evaluate(() => {
  const sc = document.querySelector('#conversation').parentElement;
  const alto = sc.getBoundingClientRect().top;
  const domande = [...document.querySelectorAll('#conversation > .talos-turn[data-turno="utente"]')];
  const ferme = domande.filter((d) => getComputedStyle(d).position === 'sticky' && d.getBoundingClientRect().top <= alto);
  return {
    sticky: domande.filter((d) => getComputedStyle(d).position === 'sticky').length,
    ferme: ferme.map((f) => {
      const fondoFascia = f.getBoundingClientRect().top + (parseFloat(f.style.getPropertyValue('--talos-domanda-vista')) || 0);
      const dopo = domande[domande.indexOf(f) + 1];
      const b = f.querySelector('.talos-message__body').getBoundingClientRect();
      const pixel = document.elementFromPoint((b.left + b.right) / 2, Math.max(alto + 2, b.top + 4))?.closest('#conversation > .talos-turn');
      return { indice: domande.indexOf(f), dopoAlto: dopo ? Math.round(dopo.getBoundingClientRect().top) : null, fondoFascia: Math.round(fondoFascia), dipinta: pixel === f };
    }),
  };
});

test.use({ viewport: { width: 1920, height: 1080 } });
test.beforeEach(() => { sequenza = 0; });

for (const modo of ['light', 'dark']) {
  test(`UX-38 (${modo}) at the end of the chat a stuck question never sits half under the next one`, async ({ page }) => {
    const tentate = await apri(page, modo);
    /* tre turni lunghi, poi due domande con una risposta di una riga: come la foto 92 */
    await eventi(page, turni([LUNGA, LUNGA, LUNGA, 'Breve risposta.', 'La parola segreta è girasole.']));
    /* a metà della risposta lunga del secondo turno la sua domanda resta ferma in cima (la funzione non si spegne) */
    for (let i = 0; i < 3; i += 1) {
      await page.evaluate(() => { const sc = document.querySelector('#conversation').parentElement; const t = document.querySelectorAll('#conversation > .talos-turn')[3]; t.style.position = 'static'; const y = sc.scrollTop + t.getBoundingClientRect().top - sc.getBoundingClientRect().top + 900; t.style.position = ''; sc.scrollTop = y; });
      await assestato(page);
    }
    let s = await cima(page);
    expect(s.ferme.map((c) => c.indice), 'mentre si legge la risposta lunga la sua domanda è ferma in cima').toEqual([1]);
    expect(s.ferme[0].dipinta, 'ed è lei a dipingere la fascia').toBe(true);
    /* in fondo, dove la domanda dopo non può più salire in cima */
    const alFondo = async () => {
      for (let i = 0; i < 4; i += 1) {
        await page.evaluate(() => { const sc = document.querySelector('#conversation').parentElement; sc.scrollTop = sc.scrollHeight; });
        await assestato(page);
      }
    };
    await alFondo();
    /* La foto 92 nasce quando, a riposo in fondo, la testa dell'ultima domanda cade DENTRO la fascia della domanda ferma. Quanto è
       lunga l'ultima risposta lo decide il caso; qui la si allunga di righe vere, quante servono perché la testa arrivi a metà fascia
       (misurato, non a occhio). Sulla base 2645d812c questo scenario mostra le due domande una sopra l'altra. */
    s = await cima(page);
    const ferma = s.ferme.find((c) => c.dopoAlto !== null);
    expect(ferma, 'in fondo una domanda è ferma in cima e ne ha una dopo').toBeTruthy();
    const serve = ferma.dopoAlto - ferma.fondoFascia + 30;
    if (serve > 0) {
      await page.evaluate((px) => {
        const corpo = [...document.querySelectorAll('#conversation > .talos-turn')].at(-1).querySelector('.talos-message__body') ?? [...document.querySelectorAll('#conversation > .talos-turn')].at(-1);
        const riga = document.createElement('p'); riga.textContent = 'Riga in più della risposta.'; corpo.append(riga);
        const alta = riga.getBoundingClientRect().height || 24;
        riga.remove();
        for (let i = 0; i < Math.ceil(px / alta); i += 1) { const p = document.createElement('p'); p.textContent = `Riga ${i} in più della risposta.`; corpo.append(p); }
      }, serve);
      await alFondo();
    }
    s = await cima(page);
    await foto(page, `38-fondo-due-domande-${tema(modo)}`);
    const sovrapposte = await page.evaluate(() => {
      const sc = document.querySelector('#conversation').parentElement.getBoundingClientRect();
      const corpi = [...document.querySelectorAll('#conversation > .talos-turn[data-turno="utente"] .talos-message__body')]
        .map((b) => ({ r: b.getBoundingClientRect(), t: b.textContent.trim().slice(0, 30) }))
        .filter(({ r }) => r.bottom > sc.top && r.top < sc.bottom);
      const coppie = [];
      for (let i = 0; i < corpi.length; i += 1) for (let j = i + 1; j < corpi.length; j += 1) {
        const a = corpi[i].r; const b = corpi[j].r;
        if (a.top < b.bottom - 1 && b.top < a.bottom - 1 && a.left < b.right && b.left < a.right) coppie.push(`${corpi[i].t} ↔ ${corpi[j].t}`);
      }
      return coppie;
    });
    expect(sovrapposte, 'a riposo in fondo due domande non stanno mai una sopra l\'altra').toEqual([]);
    for (const c of s.ferme) {
      expect(c.dopoAlto === null || c.dopoAlto >= c.fondoFascia - 1, `la domanda ${c.indice} è ferma in cima e la domanda dopo le sta sopra a metà (testa a ${c.dopoAlto}, fascia fino a ${c.fondoFascia})`).toBe(true);
    }
    expect(s.sticky, 'mai più di una domanda appiccicata').toBeLessThanOrEqual(1);
    expect(tentate).toEqual([]);
  });

  test(`UX-39 (${modo}) the card after Stop says it once: one title, then what stays done and what to do`, async ({ page }) => {
    const tentate = await apri(page, modo);
    await eventi(page, [{ type: 'RunStarted', runId: 'run-s', input: { consegna: 'Scrivi un elenco numerato di 60 frutti.' } }, { type: 'RunError', message: '⛔ stopped on request.', code: 'fermato' }]);
    const carta = page.locator('#conversation .real-session-status').last();
    await expect(carta).toBeVisible();
    const testo = (await carta.innerText()).replace(/\s+/gu, ' ');
    expect(testo).not.toContain('TALOS · fermato');
    expect(testo.match(/Hai fermato il giro/gu)?.length ?? 0, `«Hai fermato il giro» una volta sola: ${testo}`).toBe(1);
    await expect(carta.locator('.talos-system-note__title')).toHaveText('Hai fermato il giro');
    await expect(carta.locator('.talos-badge')).toHaveText('Fermato');
    await expect(carta, 'cosa resta fatto').toContainText('Quello che era già fatto resta');
    await expect(carta, 'cosa fare (decisioni 166 e 191)').toContainText('Un messaggio nuovo è una richiesta nuova.');
    await expect(carta, 'AL CONTRARIO: il rimedio vecchio').not.toContainText('Scrivi un altro messaggio per continuare da qui');
    await foto(page, `39-carta-dopo-stop-${tema(modo)}`);
    expect(tentate).toEqual([]);
  });

  test(`UX-40 (${modo}) decision 192: after a search the suggestion appears only for a whole word the person wrote, in typographic quotes`, async ({ page }) => {
    const tentate = await apri(page, modo);
    const giro = (run, consegna, cercato) => [
      { type: 'RunStarted', runId: run, input: { consegna } },
      { type: 'ToolCallStart', toolCallId: `call-${run}`, toolCallName: 'cerca' },
      { type: 'ToolCallArgs', toolCallId: `call-${run}`, delta: JSON.stringify({ testo: cercato }) },
      { type: 'ToolCallEnd', toolCallId: `call-${run}` },
      { type: 'ToolCallResult', toolCallId: `call-${run}`, content: 'Nessun risultato.' },
      { type: 'TextMessageStart', messageId: `m-${run}`, role: 'assistant' },
      { type: 'TextMessageContent', messageId: `m-${run}`, delta: 'Non c’è nessuna parola segreta.' },
      { type: 'TextMessageEnd', messageId: `m-${run}` },
      { type: 'RunFinished', outcome: { type: 'success' } },
    ];
    const campo = page.locator('#composerInput');
    // «segret» è un pezzo di «segreta»: nessun suggerimento (prima: «Cosa hai trovato cercando «segret»?»)
    await eventi(page, giro('run-c', 'Qual è la parola segreta nel file allegato?', 'segret'));
    await expect(page.locator('#conversation')).toContainText('Non c’è nessuna parola segreta.');
    await expect.poll(() => campo.getAttribute('placeholder')).not.toContain('cercando');
    await foto(page, `40-nessun-suggerimento-${tema(modo)}`);
    // AL CONTRARIO: la parola intera scritta dalla persona torna nel suggerimento, con le caporali
    await eventi(page, giro('run-d', 'Cerca la parola girasole nel file allegato.', 'girasole'));
    await expect.poll(() => campo.getAttribute('placeholder')).toBe('Cosa hai trovato cercando «girasole»?');
    await foto(page, `40-suggerimento-ricerca-${tema(modo)}`);
    expect(tentate).toEqual([]);
  });

  test(`UX-42 (${modo}) one attachment: its token count is written once; with two the total comes back`, async ({ page }) => {
    const tentate = await apri(page, modo);
    const lascia = (nome) => page.locator('#schermoChat .talos-chat-foot').evaluate((target, n) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new TextEncoder().encode('La parola segreta è girasole. Una riga di prova per gli allegati.')], n, { type: 'text/plain' }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, nome);
    await lascia('allegato-prova.txt');
    const riga = page.locator('#schermoChat .talos-allegati');
    await expect(riga).toContainText('allegato-prova.txt');
    const visibiliToken = () => riga.evaluate((r) => [...r.querySelectorAll('*')].filter((e) => e.children.length === 0 && /token/u.test(e.textContent) && e.getClientRects().length > 0).map((e) => e.textContent.trim()));
    await expect.poll(visibiliToken, 'un allegato: il conto una volta sola, sulla sua scheda').toHaveLength(1);
    await foto(page, `42-un-allegato-${tema(modo)}`);
    /* AL CONTRARIO: con due allegati il totale serve, e c'è */
    await lascia('secondo.txt');
    await expect(riga).toContainText('secondo.txt');
    await expect.poll(visibiliToken, 'due allegati: le due schede e il totale').toHaveLength(3);
    expect(tentate).toEqual([]);
  });
}
