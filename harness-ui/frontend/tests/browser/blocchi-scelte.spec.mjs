/*
 * UIG-5.R1 (scena 5, FE-086, gruppo G-G del ledger UI generativa 05/11/2026): le scelte del modello dentro una chat VERA, in un turno
 * oltre il quarto (UIG-A.R-7: `#conversation > .talos-turn[data-disegnato]:not(:nth-last-child(-n + 4))` ha `content-visibility:auto`,
 * `streaming-fluido.css`). I turni li disegna `legacy/app.js` dagli eventi del server, non un `article` costruito dalla prova: il
 * gestore del tasto destro della risposta c'è davvero.
 * Passi: clic su un'opzione → UN messaggio; ricarica vera della pagina (`page.reload`), rigiocata col gesto salvato → il blocco resta
 * spento con la scelta segnata; tasto destro su un'opzione → un menu solo. Tema chiaro e scuro, foto per ciascuno.
 * Guardia: ogni richiesta non-GET si FERMA e si conta; l'unica che riceve risposta è l'invio del messaggio di questa sessione finta.
 * ⛔ SCRITTA E NON LANCIATA (05/11/2026): va nella suite della notte, come `blocchi-pc.spec.mjs`.
 * G-G2 (06/11/2026, scritta e NON lanciata): spento si dice con `aria-disabled`, non `disabled` (UIG-5.6: Chrome non garantisce
 * `contextmenu` su un controllo disabilitato, chromestatus 6128674512830464); il tasto destro su un'opzione spenta apre il menu del
 * blocco. La seconda prova: le stesse scelte offerte di nuovo, la scelta nella vista a lato, il ramo dopo la scelta.
 */
import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { preparaCartellaFoto } from '../aiuto/cartella-foto.mjs';
import { impronta } from '../../../src/blocchi/impronta.mjs';

const ID = 'chat-scelte-r1';
const CHIAVE_IMPOSTAZIONI = 'talos.harness.desktop.settings.v1';
const IMPOSTAZIONI = (modoColore) => JSON.stringify({ version: 1, appearance: { uiLanguage: 'it', colorMode: modoColore }, chat: {}, workspaces: {} });
const SCELTE = 'root = Scelte("prossimo", "Prossimo passo", "Come vuoi procedere?", [{testo: "Continua"}, {testo: "Fermati qui"}])';
const RECINTO = `Ecco:\n\n\`\`\`talos-blocco\n${SCELTE}\n\`\`\`\n\nDimmi tu.`;
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
/* il blocco nel turno 1, poi cinque turni di sola prosa: il turno del blocco resta oltre gli ultimi quattro */
const TURNI = 6;

const pezzi = (testo, n = 14) => { const fuori = []; for (let i = 0; i < testo.length; i += n) fuori.push(testo.slice(i, i + n)); return fuori; };
const turno = (i, testo) => [
  { type: 'RunStarted', threadId: ID, runId: `r${i}`, input: { consegna: `Domanda ${i}` } },
  { type: 'TextMessageStart', messageId: `m${i}`, role: 'assistant' },
  ...pezzi(testo).map((delta) => ({ type: 'TextMessageContent', messageId: `m${i}`, delta })),
  { type: 'TextMessageEnd', messageId: `m${i}` },
  { type: 'RunFinished', threadId: ID, runId: `r${i}`, outcome: { type: 'success' } },
];
const storia = () => Array.from({ length: TURNI }, (_, k) => turno(k + 1, k === 0 ? RECINTO : `Risposta ${k + 1}: prosa senza blocchi, ${'testo '.repeat(40)}`)).flat();
const manda = (page, eventi) => page.evaluate((lista) => {
  const r = window.__talosHarnessUiRuntime;
  for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation);
}, eventi);

async function prepara(page, modoColore) {
  page.inviati = [];
  page.fermati = [];
  page.errori = [];
  page.on('pageerror', (e) => page.errori.push(String(e.message)));
  /* la guardia: nessuna scrittura arriva a un server; il messaggio della sessione finta riceve un «ok» finto */
  await page.route('**/*', (route) => {
    const req = route.request();
    if (req.method() === 'GET' || req.method() === 'HEAD') return route.fallback();
    if (new URL(req.url()).pathname.startsWith(`/api/v1/sessions/${ID}`)) {
      page.inviati.push(req.postDataJSON?.() ?? req.postData());
      return route.fulfill({ json: { ok: true, data: {} } });
    }
    page.fermati.push(`${req.method()} ${req.url()}`);
    return route.abort();
  });
  /* gli eventi del server li dà la prova: il flusso vero resta in sospeso */
  await page.route(`**/api/v1/sessions/${ID}/events*`, () => { /* resta pending */ });
  await page.addInitScript(([chiave, valore]) => { try { localStorage.setItem(chiave, valore); } catch { /* niente storage */ } }, [CHIAVE_IMPOSTAZIONI, IMPOSTAZIONI(modoColore)]);
}

async function entra(page) {
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate((id) => {
    window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Scelte', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
  }, ID);
}
const finito = (page) => page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });

test.use({ viewport: { width: 1280, height: 860 } });

for (const modoColore of ['light', 'dark']) {
  test(`BLOCCHI-SCELTE-UIG-5.R1 in un turno oltre il quarto: clic, ricarica, ancora spento; tasto destro, un menu, ${modoColore}`, async ({ page }) => {
    await prepara(page, modoColore);
    await page.goto('/');
    await entra(page);
    await manda(page, [...storia(), CONFINE]);
    await finito(page);

    const turni = page.locator('#conversation > .talos-turn');
    await expect(turni).toHaveCount(TURNI);
    const delBlocco = turni.filter({ has: page.locator('.gu') });
    await expect(delBlocco).toHaveCount(1);
    expect(await delBlocco.evaluate((n) => [...n.parentElement.children].filter((c) => c.matches('.talos-turn')).indexOf(n)), 'il blocco è nel primo turno').toBe(0);
    await delBlocco.scrollIntoViewIfNeeded();
    await expect.poll(() => delBlocco.evaluate((n) => getComputedStyle(n).contentVisibility), { message: 'premessa: il turno del blocco è chiuso' }).toBe('auto');

    const scelta = (testo) => delBlocco.locator('.gu-scelte button', { hasText: testo });
    const menu = page.locator('#menuDelBlocco');
    /* tasto destro su un'opzione libera: il menu del blocco, uno solo */
    await scelta('Fermati qui').click({ button: 'right' });
    await expect(menu).toBeVisible();
    await expect(page.locator('.talos-context-menu:visible'), 'un menu solo: non anche quello della risposta').toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    expect(page.inviati, 'il tasto destro non è una scelta').toHaveLength(0);

    /* clic, e un secondo clic che non deve partire */
    await scelta('Continua').click();
    await scelta('Continua').click({ force: true, timeout: 1000 }).catch(() => {});
    await expect.poll(() => page.inviati.filter((c) => c?.bolla?.blocco).length).toBe(1);
    const bolla = page.inviati.find((c) => c?.bolla?.blocco).bolla;
    expect(bolla.testo).toBe('Continua');
    expect(bolla.blocco).toMatchObject({ idBlocco: 'prossimo', tipo: 'scelte' });
    await expect(scelta('Continua')).toHaveAttribute('aria-disabled', 'true');
    await expect(scelta('Continua')).toHaveAttribute('aria-pressed', 'true');

    /* la ricarica VERA: la cronologia torna come rigiocata, col messaggio della persona e l'evento del giornale, poi il confine */
    await page.reload();
    await entra(page);
    await manda(page, [
      ...storia(),
      { type: 'RunStarted', threadId: ID, runId: `r${TURNI + 1}`, input: { consegna: 'Continua', seguito: true, bolla } },
      { type: 'CUSTOM', name: 'talos.blocco.azione.v1', value: { idBlocco: 'prossimo', tipo: 'scelte', chiave: bolla.blocco.chiave } },
      CONFINE,
    ]);
    await finito(page);
    const dopo = page.locator('#conversation > .talos-turn').filter({ has: page.locator('.gu') });
    await expect(dopo).toHaveCount(1);
    await dopo.scrollIntoViewIfNeeded();
    const sceltaDopo = (testo) => dopo.locator('.gu-scelte button', { hasText: testo });
    await expect(sceltaDopo('Continua')).toHaveAttribute('aria-disabled', 'true');
    await expect(sceltaDopo('Continua')).toHaveAttribute('aria-pressed', 'true');
    await expect(sceltaDopo('Fermati qui')).toHaveAttribute('aria-disabled', 'true');
    expect(await sceltaDopo('Fermati qui').evaluate((b) => b.disabled), 'non disabled: il tasto destro deve arrivare').toBe(false);
    await expect(sceltaDopo('Fermati qui')).toHaveAttribute('aria-pressed', 'false');
    const primaDelClic = page.inviati.length;
    await sceltaDopo('Fermati qui').click({ force: true, timeout: 1000 }).catch(() => {});
    expect(page.inviati.length, 'dopo la ricarica il blocco non rimanda niente').toBe(primaDelClic);

    /* UIG-5.6: tasto destro sull'opzione spenta → il menu del blocco, uno solo (prima di G-G2 qui si accettava anche «nessuno») */
    await sceltaDopo('Fermati qui').click({ button: 'right' });
    await expect(menu).toBeVisible();
    await expect(page.locator('.talos-context-menu:visible'), 'mai due menu insieme').toHaveCount(1);

    const cartella = await preparaCartellaFoto('blocchi-scelte');
    await page.screenshot({ path: join(cartella, `scelte-dopo-ricarica-${modoColore}.png`), fullPage: true });
    await page.keyboard.press('Escape');

    test.info().annotations.push({ type: 'non-GET fermati', description: String(page.fermati.length) });
    expect(page.errori, 'nessun errore a runtime').toEqual([]);
  });
}

/* G-G2 — il nome del blocco arriva col suo v1 (`talos.blocco.versione` alla versione 1, G-B3), dopo il testo del messaggio */
const versione = (nome, messaggio) => ({ type: 'CUSTOM', name: 'talos.blocco.versione', value: { blocco: nome, versione: 1, sorgente: SCELTE, messaggio, posizione: 0, quando: '2026-11-06T00:00:00.000Z' } });
const conNome = (i, nome, testo = RECINTO) => [...turno(i, testo), versione(nome, `m${i}`)];

for (const modoColore of ['light', 'dark']) {
  test(`BLOCCHI-SCELTE-UIG-5.R1-G2 stesse scelte di nuovo, ramo dopo la scelta, scelta a lato, ${modoColore}`, async ({ page }) => {
    await prepara(page, modoColore);
    await page.goto('/');
    await entra(page);
    /* UIG-5.3b: lo stesso blocco, parola per parola, in due messaggi della stessa chat */
    await manda(page, [...conNome(1, 'b1'), ...conNome(2, 'b2'), CONFINE]);
    await finito(page);
    const blocchi = page.locator('#conversation .gu');
    await expect(blocchi).toHaveCount(2);
    const opz = (i, testo) => blocchi.nth(i).locator('.gu-scelte button', { hasText: testo });
    const bolle = () => page.inviati.filter((c) => c?.bolla?.blocco).map((c) => c.bolla);
    await opz(0, 'Continua').click();
    await expect.poll(() => bolle().length).toBe(1);
    const prima = bolle()[0];
    expect(prima.blocco.chiave).toBe('nome:b1@m1#prossimo');
    await expect(opz(1, 'Continua'), 'il secondo, uguale, resta libero').not.toHaveAttribute('aria-disabled', 'true');
    await opz(1, 'Fermati qui').click();
    await expect.poll(() => bolle().length).toBe(2);
    expect(bolle()[1].blocco.chiave).toBe('nome:b2@m2#prossimo');

    /* UIG-5.5: un terzo blocco, scelto nella vista a lato → in linea spento subito, senza ricarica */
    await manda(page, conNome(3, 'b3'));
    await expect(blocchi).toHaveCount(3);
    /* decision 399: the chat scrolls by itself after the new turn and any scroll closes the block menu (`menu-del-blocco.js`, R-10):
       measured 08/11, menu open at 126 ms and closed at 133 ms by the conversation scroll. The menu is opened when the page stands still */
    await blocchi.nth(2).scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => new Promise((fine) => {
      const posizioni = () => [...document.querySelectorAll('*')].filter((n) => n.scrollHeight > n.clientHeight).map((n) => n.scrollTop).join(',');
      const prima = posizioni();
      requestAnimationFrame(() => requestAnimationFrame(() => fine(posizioni() === prima)));
    })), { message: 'the page stops scrolling' }).toBe(true);
    /* a late scroll can still close it: open «⋯» and pick the entry again until the pick lands (the product is not changed) */
    await expect(async () => {
      const piu = blocchi.nth(2).locator('button[aria-haspopup="menu"]');
      if (await piu.getAttribute('aria-expanded') !== 'true') await piu.click({ timeout: 2_000 });
      await page.locator('#menuDelBlocco [role="menuitem"]', { hasText: 'Apri a lato' }).click({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    /* decision 399: before the cure `colonna()` was null on the page mounted by the bridge and «Apri a lato» opened the full screen */
    await expect(page.locator('.gu-schermo'), 'the full screen opened in place of the side view').toHaveCount(0);
    const lato = page.locator('.gu-lato');
    await expect(lato).toBeVisible();
    await lato.locator('.gu-scelte button', { hasText: 'Fermati qui' }).click();
    await expect(opz(2, 'Fermati qui')).toHaveAttribute('aria-pressed', 'true');
    await expect(opz(2, 'Continua')).toHaveAttribute('aria-disabled', 'true');
    const cartella = await preparaCartellaFoto('blocchi-scelte');
    await page.screenshot({ path: join(cartella, `scelte-g2-lato-${modoColore}.png`), fullPage: true });
    const inviatiPrimaDelRamo = page.inviati.length;

    /* UIG-5.3c: il ramo. `disegnaStoriaEreditata` (`legacy/app.js:15605-15622`) rigioca gli eventi della madre COI SUOI id di messaggio;
       qui la prova li manda a mano in una sessione nuova: è un'approssimazione del rigioco, non il «Riprova» vero */
    await page.evaluate((id) => {
      window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Scelte ramo', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    }, `${ID}-ramo`);
    await manda(page, [
      ...conNome(1, 'b1'),
      { type: 'RunStarted', threadId: ID, runId: 'r-ramo', input: { consegna: 'Continua', seguito: true, bolla: prima } },
      { type: 'CUSTOM', name: 'talos.blocco.azione.v1', value: { idBlocco: 'prossimo', tipo: 'scelte', chiave: prima.blocco.chiave } },
      ...conNome(9, 'b4'),
      CONFINE,
    ]);
    await finito(page);
    const ramo = page.locator('#conversation .gu');
    await expect(ramo).toHaveCount(2);
    const opzRamo = (i, testo) => ramo.nth(i).locator('.gu-scelte button', { hasText: testo });
    await expect(opzRamo(0, 'Continua'), 'prima del punto del ramo: spento, con la scelta della madre').toHaveAttribute('aria-pressed', 'true');
    await opzRamo(0, 'Fermati qui').click({ force: true, timeout: 1000 }).catch(() => {});
    expect(page.inviati.length, 'niente rimandato dal ramo').toBe(inviatiPrimaDelRamo);
    await expect(opzRamo(1, 'Continua'), 'dopo il punto del ramo, stesse scelte: libero').not.toHaveAttribute('aria-disabled', 'true');
    /* UIG-5.6 nel ramo: tasto destro sull'opzione spenta → il menu del blocco, uno solo */
    /* `force`: the option is `aria-disabled="true"` on purpose (UIG-5.6) and Playwright never clicks an element it reads as disabled
       (actionability, «Enabled»); the right click is the gesture under test, not a pick */
    await opzRamo(0, 'Fermati qui').click({ button: 'right', force: true });
    await expect(page.locator('#menuDelBlocco')).toBeVisible();
    await expect(page.locator('.talos-context-menu:visible')).toHaveCount(1);
    await page.screenshot({ path: join(cartella, `scelte-g2-ramo-${modoColore}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    test.info().annotations.push({ type: 'non-GET fermati', description: String(page.fermati.length) });
    expect(page.errori, 'nessun errore a runtime').toEqual([]);
  });
}

/*
 * G-BG2, UIG-5.11 (06/11/2026, WRITTEN AND NOT RUN: night suite). The fence carries `nome=b1` (stamped by the host) but its v1 has not
 * arrived yet, so a click records `nome:b1@~<chat>#prossimo`. Once the v1 binds b1 to m1, the same block asks for `nome:b1@m1#prossimo`:
 * after a real reload, and in a fork that replays the parent's events, the provisional key must still lock it.
 */
const RECINTO_COL_NOME = (nome) => `Ecco:\n\n\`\`\`talos-blocco nome=${nome}\n${SCELTE}\n\`\`\`\n\nDimmi tu.`;

for (const modoColore of ['light', 'dark']) {
  test(`BLOCCHI-SCELTE-UIG-5.11 a click before the v1 stays locked after the v1, a reload and a fork, ${modoColore}`, async ({ page }) => {
    await prepara(page, modoColore);
    await page.goto('/');
    await entra(page);
    await manda(page, [...turno(1, RECINTO_COL_NOME('b1')), CONFINE]);
    await finito(page);
    const blocchi = page.locator('#conversation .gu');
    await expect(blocchi).toHaveCount(1);
    const opz = (testo) => blocchi.first().locator('.gu-scelte button', { hasText: testo });
    await opz('Continua').click();
    const bolle = () => page.inviati.filter((c) => c?.bolla?.blocco).map((c) => c.bolla);
    await expect.poll(() => bolle().length).toBe(1);
    const bolla = bolle()[0];
    expect(bolla.blocco.chiave, 'no v1 yet: the key carries the chat').toBe(`nome:b1@~${ID}#prossimo`);
    /* the v1 arrives after the click: the block stays locked */
    await manda(page, [versione('b1', 'm1')]);
    await expect(opz('Continua')).toHaveAttribute('aria-pressed', 'true');

    /* the real reload: text, v1, the person's bubble and the journal event, in journal order */
    const giornale = [
      ...turno(1, RECINTO_COL_NOME('b1')), versione('b1', 'm1'),
      { type: 'RunStarted', threadId: ID, runId: 'r2', input: { consegna: 'Continua', seguito: true, bolla } },
      { type: 'CUSTOM', name: 'talos.blocco.azione.v1', value: { idBlocco: 'prossimo', tipo: 'scelte', chiave: bolla.blocco.chiave } },
    ];
    await page.reload();
    await entra(page);
    await manda(page, [...giornale, CONFINE]);
    await finito(page);
    await expect(opz('Continua')).toHaveAttribute('aria-pressed', 'true');
    await expect(opz('Fermati qui')).toHaveAttribute('aria-disabled', 'true');
    const prima = page.inviati.length;
    await opz('Fermati qui').click({ force: true, timeout: 1000 }).catch(() => {});
    expect(page.inviati.length, 'after the reload nothing is sent again').toBe(prima);
    const cartella = await preparaCartellaFoto('blocchi-scelte');
    await page.screenshot({ path: join(cartella, `scelte-bg2-tilde-ricarica-${modoColore}.png`), fullPage: true });

    /* the fork: the parent's events replayed in a new chat (an approximation of `disegnaStoriaEreditata`, as in UIG-5.R1-G2) */
    await page.evaluate((id) => {
      window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Scelte ramo', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    }, `${ID}-ramo`);
    await manda(page, [...giornale, CONFINE]);
    await finito(page);
    await expect(blocchi).toHaveCount(1);
    await expect(opz('Continua'), 'in the fork too').toHaveAttribute('aria-pressed', 'true');
    await expect(opz('Fermati qui')).toHaveAttribute('aria-disabled', 'true');
    await page.screenshot({ path: join(cartella, `scelte-bg2-tilde-ramo-${modoColore}.png`), fullPage: true });
    test.info().annotations.push({ type: 'non-GET fermati', description: String(page.fermati.length) });
    expect(page.errori, 'no runtime error').toEqual([]);
  });
}

/*
 * G-BG2, UIG-5.2c (06/11/2026, WRITTEN AND NOT RUN: night suite). An old chat: two identical blocks (b1, b2 by their v1), then ONE
 * gesture saved before G-G2 names, with the old key `<chat>:<impronta>#prossimo`. Rule: it locks every block with that text drawn
 * BEFORE it in journal order (both twins), never a block of a later message (b3). The same after a real reload and in a fork.
 */
for (const modoColore of ['light', 'dark']) {
  test(`BLOCCHI-SCELTE-UIG-5.2c an old-key gesture locks both earlier twins, never a later one; reload and fork, ${modoColore}`, async ({ page }) => {
    await prepara(page, modoColore);
    const chiave = `${ID}:${impronta(SCELTE)}#prossimo`;
    const bolla = { testo: 'Continua', blocco: { idBlocco: 'prossimo', tipo: 'scelte', chiave, titolo: 'Prossimo passo' } };
    const giornale = [
      ...conNome(1, 'b1'), ...conNome(2, 'b2'),
      { type: 'RunStarted', threadId: ID, runId: 'r3', input: { consegna: 'Continua', seguito: true, bolla } },
      { type: 'CUSTOM', name: 'talos.blocco.azione.v1', value: { idBlocco: 'prossimo', tipo: 'scelte', chiave } },
      ...conNome(4, 'b3'),
    ];
    const blocchi = page.locator('#conversation .gu');
    const opz = (i, testo) => blocchi.nth(i).locator('.gu-scelte button', { hasText: testo });
    const controlla = async (dove) => {
      await expect(blocchi, dove).toHaveCount(3);
      for (const i of [0, 1]) {
        await expect(opz(i, 'Continua'), `${dove}: twin ${i + 1} locked with the old choice`).toHaveAttribute('aria-pressed', 'true');
        await expect(opz(i, 'Fermati qui'), `${dove}: twin ${i + 1}`).toHaveAttribute('aria-disabled', 'true');
      }
      await expect(opz(2, 'Continua'), `${dove}: the later message is a new question`).not.toHaveAttribute('aria-disabled', 'true');
      await expect(opz(2, 'Continua')).not.toHaveAttribute('aria-pressed', /.*/u);
      const prima = page.inviati.length;
      await opz(1, 'Fermati qui').click({ force: true, timeout: 1000 }).catch(() => {});
      expect(page.inviati.length, `${dove}: the twin sends nothing`).toBe(prima);
    };
    await page.goto('/');
    await entra(page);
    await manda(page, [...giornale, CONFINE]);
    await finito(page);
    await controlla('replay');
    const cartella = await preparaCartellaFoto('blocchi-scelte');
    await page.screenshot({ path: join(cartella, `scelte-bg2-vecchia-${modoColore}.png`), fullPage: true });

    await page.reload();
    await entra(page);
    await manda(page, [...giornale, CONFINE]);
    await finito(page);
    await controlla('after a reload');

    await page.evaluate((id) => {
      window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Scelte ramo', 'z-ai/glm-5.3-flash', { conclusa: false, modello: 'z-ai/glm-5.3-flash' });
    }, `${ID}-ramo`);
    await manda(page, [...giornale, CONFINE]);
    await finito(page);
    await controlla('in a fork');
    await page.screenshot({ path: join(cartella, `scelte-bg2-vecchia-ramo-${modoColore}.png`), fullPage: true });
    /* the later block is still a live question: one click, one message, with its own named key */
    await opz(2, 'Fermati qui').click();
    await expect.poll(() => page.inviati.filter((c) => c?.bolla?.blocco?.chiave === 'nome:b3@m4#prossimo').length).toBe(1);
    test.info().annotations.push({ type: 'non-GET fermati', description: String(page.fermati.length) });
    expect(page.errori, 'no runtime error').toEqual([]);
  });
}
