/*
 * 023, primo giro di cura (11/11/2026) — LA RICERCA UNICA DELLE IMPOSTAZIONI, provata nel repo.
 *
 * Il passo 2 aveva portato un campo solo (combobox W3C APG) con i risultati che OSPITANO il controllo vero della riga (variante B,
 * owner 10/11/2026 21:47), ma nessuna prova committata: i 12 mutanti del controllore (`RAPPORTO-CONTROLLORE-023-PASSO-2`, punto 4)
 * restavano tutti vivi per le prove del repo. Qui le sonde del controllore diventano prove vere, e in più i rossi che ha trovato:
 *   · la Lingua cambiata DAL RISULTATO perdeva il fuoco sul `BODY` (9 volte su 10);
 *   · dopo un rimontaggio della vista Ctrl K apriva la palette dei comandi invece di portare al campo;
 *   · Esc col fuoco nel controllo ospitato non faceva niente, mentre la riga dei tasti dice «Esc esce»;
 *   · l'Invio che conferma le lettere di un metodo d'immissione (`isComposing`) saltava alla riga;
 *   · axe `nested-interactive`: un'opzione di un listbox ha i figli presentazionali, e il controllo dentro il risultato può non
 *     essere annunciato. La forma giusta per righe con controlli dentro è la griglia (W3C APG «Combobox with grid popup»).
 * Ogni prova dice nel nome il mutante che la fa cadere (elenco «prova → mutante» nel rapporto dell'agente).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

async function apri(page, sezione = 'appearance') {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    if (!localStorage.getItem('talos.harness.desktop.settings.v1')) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: {}, workspaces: {} }));
  });
  await page.goto('/');
  await expect(page.locator('.talos-sidebar [data-vaia="impostazioni"]')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('#talosAvvio')).toBeHidden({ timeout: 15_000 });
  await vaiAlleImpostazioni(page, sezione);
}
async function vaiAlleImpostazioni(page, sezione = 'appearance') {
  await page.evaluate((s) => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = voce?.closest('.td-nav-group');
    const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
    if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.(s, { persist: false });
  }, sezione);
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
}

const CAMPO = '#settingsSearch';
const ELENCO = '#settingsSearchResultList';
const risultato = (id) => `${ELENCO} [data-settings-result="${id}"]`;

/** Lo stato della ricerca, letto come lo legge un lettore di schermo: chi è segnato, dove sta il fuoco, cosa è ospitato. */
const stato = (page) => page.evaluate(() => {
  const s = document.querySelector('#settingsSearch');
  const righe = [...document.querySelectorAll('#settingsSearchResultList > [data-settings-result]')];
  const attivo = s?.getAttribute('aria-activedescendant');
  const puntato = attivo ? document.getElementById(attivo) : null;
  const ae = document.activeElement;
  return {
    valore: s?.value, espanso: s?.getAttribute('aria-expanded'), attivo,
    rigaPuntata: puntato?.closest('[data-settings-result]')?.dataset.settingsResult ?? null,
    indicePuntato: puntato ? righe.indexOf(puntato.closest('[data-settings-result]')) : -1,
    rigaAccesa: righe.findIndex((r) => r.classList.contains('is-active')),
    selezionati: [...document.querySelectorAll('#settingsSearchResultList [aria-selected="true"]')].map((e) => e.closest('[data-settings-result]')?.dataset.settingsResult),
    risultati: righe.map((r) => r.dataset.settingsResult),
    fuoco: ae ? (ae.id || ae.tagName) : null, fuocoNelCampo: ae === s, fuocoSulBody: ae === document.body || ae === null,
    segnaposto: document.querySelectorAll('[data-settings-hosted-from]').length,
    ospiti: document.querySelectorAll('#settingsSearchResultList .settings-field-control').length,
    risultatiVisibili: !document.querySelector('#settingsSearchResults')?.hidden,
    comandiAperti: (() => { const v = document.querySelector('#veloComandi'); return !!v && !v.hidden && v.getClientRects().length > 0; })(),
  };
});
const salvato = (page, chiave) => page.evaluate((k) => { try { const s = JSON.parse(localStorage.getItem('talos.harness.desktop.settings.v1')); return s.appearance?.[k] ?? s.chat?.[k] ?? null; } catch { return null; } }, chiave);
const doppioni = (page) => page.evaluate(() => { const c = new Map(); for (const el of document.querySelectorAll('[id]')) c.set(el.id, (c.get(el.id) || 0) + 1); return [...c].filter(([, n]) => n > 1).map(([id, n]) => id + '×' + n); });

test.describe('RICERCA UNICA DELLE IMPOSTAZIONI (023 cura 1)', () => {
  test('RICERCA-01 · un campo solo: combobox che apre una griglia di righe (M nested-interactive)', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).fill('tema');
    const forma = await page.evaluate(() => {
      const s = document.querySelector('#settingsSearch');
      const elenco = document.getElementById(s.getAttribute('aria-controls') || 'x');
      const righe = [...elenco.children];
      return {
        bottoneVecchio: document.querySelectorAll('[data-settings-open-search]').length, finestraVecchia: document.querySelectorAll('dialog.settings-palette').length,
        campiVisibili: [...document.querySelectorAll('#schermoImpostazioni input[type="search"]')].filter((e) => e.getClientRects().length).length,
        ruolo: s.getAttribute('role'), popup: s.getAttribute('aria-haspopup'), ruoloElenco: elenco?.getAttribute('role'), nomeElenco: elenco?.getAttribute('aria-label'),
        righe: righe.length, ruoliRighe: [...new Set(righe.map((r) => r.getAttribute('role')))],
        celle: [...new Set(righe.flatMap((r) => [...r.children].map((c) => c.getAttribute('role'))))],
        attivoECella: document.getElementById(s.getAttribute('aria-activedescendant') || 'x')?.getAttribute('role'),
      };
    });
    expect(forma.bottoneVecchio, 'il bottone «Cerca impostazioni» è tolto').toBe(0);
    expect(forma.finestraVecchia, 'la finestra «Trova un’impostazione» è tolta').toBe(0);
    expect(forma.campiVisibili, 'una ricerca sola nelle Impostazioni').toBe(1);
    expect(forma.ruolo).toBe('combobox');
    expect(forma.righe).toBeGreaterThan(1);
    // W3C APG, «Editable Combobox With Grid Popup»: il campo annuncia una griglia, le righe sono `row`, i figli `gridcell`, e il
    // segnato è una cella (non un'opzione: un'opzione ha i figli presentazionali e il controllo dentro non si annuncia).
    expect(forma.popup).toBe('grid');
    expect(forma.ruoloElenco).toBe('grid');
    expect(forma.nomeElenco).toBeTruthy();
    expect(forma.ruoliRighe).toEqual(['row']);
    expect(forma.celle).toEqual(['gridcell']);
    expect(forma.attivoECella).toBe('gridcell');
  });

  test('RICERCA-02 · i risultati: il primo è segnato, uno solo selezionato, e l’elenco si dice aperto', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).click();
    await page.keyboard.type('tema');
    const s = await stato(page);
    expect(s.risultati.length).toBeGreaterThan(1);
    expect(s.espanso).toBe('true');
    expect(s.indicePuntato).toBe(0);
    expect(s.rigaAccesa).toBe(0);
    expect(s.selezionati).toEqual([s.risultati[0]]);
  });

  test('RICERCA-03 · Freccia giù e su girano in tondo, il fuoco resta nel campo e il segnato lo dice (M1, M10)', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).click();
    await page.keyboard.type('tema');
    const n = (await stato(page)).risultati.length;
    const giro = [];
    for (let i = 0; i < n; i += 1) { await page.keyboard.press('ArrowDown'); giro.push((await stato(page)).indicePuntato); }
    expect(giro.at(-1), 'dall’ultimo, giù torna al primo').toBe(0);
    expect(giro.slice(0, -1)).toEqual(Array.from({ length: n - 1 }, (_, i) => i + 1));
    await page.keyboard.press('ArrowUp');
    const s = await stato(page);
    expect(s.indicePuntato, 'dal primo, su va all’ultimo').toBe(n - 1);
    expect(s.rigaAccesa).toBe(n - 1);
    expect(s.selezionati).toEqual([s.risultati[n - 1]]);
    expect(s.fuocoNelCampo).toBe(true);
  });

  test('RICERCA-04 · Invio apre la riga segnata e svuota la ricerca (M12)', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).click();
    await page.keyboard.type('densit');
    const s0 = await stato(page);
    // «densit» trova anche la densità del movimento, che viene prima: si scende con le frecce fino alla densità dell'interfaccia
    const indice = s0.risultati.indexOf('uiDensitySelect');
    expect(indice, 'la densità dell’interfaccia è fra i risultati e non è la prima: la prova scende con le frecce').toBeGreaterThan(0);
    for (let i = 0; i < indice; i += 1) await page.keyboard.press('ArrowDown');
    expect((await stato(page)).rigaAccesa, 'la riga segnata è quella a cui si è scesi').toBe(indice);
    await page.keyboard.press('Enter');
    const s = await stato(page);
    expect(s.valore).toBe('');
    expect(s.espanso).toBe('false');
    expect(s.risultatiVisibili).toBe(false);
    expect(await page.evaluate(() => document.activeElement?.closest('[data-setting-row]')?.dataset.settingRow)).toBe('uiDensitySelect');
    await expect(page.locator('[data-setting-row="uiDensitySelect"][data-settings-hit]')).toHaveCount(1);
  });

  test('RICERCA-05 · Esc nel campo svuota e rimette a casa lo STESSO nodo, col suo nome di prima (M4, M7, M9, M11)', async ({ page }) => {
    await apri(page);
    const nodo = await page.locator('[data-setting-row="uiDensitySelect"] .settings-field-control').elementHandle();
    const nomiPrima = await page.evaluate((h) => [...h.querySelectorAll('input, select, textarea')].map((e) => e.getAttribute('aria-labelledby')), nodo);
    await page.locator(CAMPO).fill('densit');
    expect(await page.evaluate((h) => !!h.closest('#settingsSearchResultList'), nodo), 'il risultato ospita il nodo vero').toBe(true);
    await page.locator(CAMPO).focus();
    await page.keyboard.press('Escape');
    const s = await stato(page);
    expect(s.valore).toBe('');
    expect(s.fuocoNelCampo).toBe(true);
    expect(s.risultatiVisibili, 'Esc ridisegna: i risultati spariscono').toBe(false);
    expect(s.segnaposto).toBe(0);
    expect(await page.evaluate((h) => h.isConnected && h.closest('[data-setting-row]')?.dataset.settingRow, nodo), 'il nodo è tornato nella sua riga').toBe('uiDensitySelect');
    const nomiDopo = await page.evaluate((h) => [...h.querySelectorAll('input, select, textarea')].map((e) => e.getAttribute('aria-labelledby')), nodo);
    expect(nomiDopo, 'tornato a casa, il controllo non punta più al nome di un risultato tolto').toEqual(nomiPrima);
  });

  test('RICERCA-06 · nodo vero: il cambio fatto dal risultato si salva, e a casa l’ascoltatore è vivo', async ({ page }) => {
    await apri(page);
    const nodo = await page.locator('[data-setting-row="uiDensitySelect"] .settings-field-control').elementHandle();
    const prima = await page.locator('[data-setting-row="uiDensitySelect"] select').evaluate((e) => e.value);
    await page.locator(CAMPO).fill('densit');
    expect(await page.evaluate((h) => !!h.closest('#settingsSearchResultList [data-settings-result="uiDensitySelect"]'), nodo)).toBe(true);
    expect(await page.locator('select[id$="uiDensitySelect"]').count(), 'nessuna copia del controllo').toBe(1);
    expect(await doppioni(page)).toEqual([]);
    const altra = prima === 'comoda' ? 'compatta' : 'comoda';
    const etichetta = (await page.locator(`select[id$="uiDensitySelect"] option[value="${altra}"]`).textContent()).trim();
    await page.locator(`${risultato('uiDensitySelect')} .calm-select`).click();
    await page.locator('[data-calm-popup]').getByRole('option', { name: etichetta, exact: true }).click();
    await expect.poll(() => salvato(page, 'uiDensity')).toBe(altra);
    expect((await stato(page)).valore, 'cambiare il valore non chiude la ricerca').toBe('densit');
    await page.locator(CAMPO).fill('');
    expect(await page.evaluate((h) => h.closest('[data-setting-row]')?.dataset.settingRow, nodo)).toBe('uiDensitySelect');
    const etichetta2 = (await page.locator(`select[id$="uiDensitySelect"] option[value="${prima}"]`).textContent()).trim();
    await page.locator('[data-setting-row="uiDensitySelect"] .calm-select').click();
    await page.locator('[data-calm-popup]').getByRole('option', { name: etichetta2, exact: true }).click();
    await expect.poll(() => page.locator('select[id$="uiDensitySelect"]').evaluate((e) => e.value)).toBe(prima);
  });

  test('RICERCA-07 · battute di fila: segnaposto e ospiti sempre in pari, nessuno orfano alla fine', async ({ page }) => {
    await apri(page);
    const giri = [];
    for (const t of ['m', 'mo', 'mov', 'movi', 'movimento', 'mov', '']) {
      await page.locator(CAMPO).fill(t);
      giri.push(await page.evaluate(() => [document.querySelectorAll('[data-settings-hosted-from]').length, document.querySelectorAll('#settingsSearchResultList .settings-field-control').length]));
    }
    expect(giri.every(([a, b]) => a === b), JSON.stringify(giri)).toBe(true);
    expect(giri[3][1], 'a metà parola ci sono controlli ospitati: la prova misura').toBeGreaterThan(0);
    expect(giri.at(-1)).toEqual([0, 0]);
    expect(await doppioni(page)).toEqual([]);
  });

  test('RICERCA-08 · cambiare un cursore o una scelta a segmenti DENTRO il risultato non salta alla riga (M8)', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).fill('intensità ui');
    const cursore = page.locator(`${risultato('motionUiIntensityRange')} [role="slider"]`);
    await expect(cursore).toHaveCount(1);
    const box = await cursore.boundingBox();
    await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
    let s = await stato(page);
    expect(s.valore, 'il clic sul cursore cambia il valore, non porta alla riga').toBe('intensità ui');
    expect(s.risultatiVisibili).toBe(true);
    // i segmenti di «Come si apre Nuova sessione», ospitati nel risultato
    await page.locator(CAMPO).fill('nuova sessione');
    const segmenti = page.locator(`${risultato('newSessionViewSelect')} [role="radio"]`);
    await expect(segmenti).toHaveCount(2);
    const spento = page.locator(`${risultato('newSessionViewSelect')} [role="radio"][aria-checked="false"]`);
    const valore = await spento.getAttribute('data-value');
    await spento.click();
    s = await stato(page);
    expect(s.valore, 'il clic su un segmento sceglie, non porta alla riga').toBe('nuova sessione');
    await expect.poll(() => page.locator('[data-setting-row="newSessionViewSelect"] select, [data-settings-hosted-from] ~ select, select[data-settings-segmented-source]').first().evaluate((e) => e.value)).toBe(valore);
    // e il clic sul TESTO del risultato invece porta alla riga
    await page.locator(CAMPO).fill('densit');
    await page.locator(`${risultato('uiDensitySelect')} .settings-result__name`).click();
    s = await stato(page);
    expect(s.valore).toBe('');
    expect(await page.evaluate(() => document.activeElement?.closest('[data-setting-row]')?.dataset.settingRow)).toBe('uiDensitySelect');
  });

  test('RICERCA-09 · la Lingua cambiata DAL risultato non perde il fuoco: 10 volte su 10', async ({ page }) => {
    await apri(page);
    const esiti = [];
    for (let i = 0; i < 10; i += 1) {
      const lingua = await page.evaluate(() => document.documentElement.lang || 'it');
      await page.locator(CAMPO).fill(lingua.startsWith('en') ? 'language' : 'lingua');
      const calm = page.locator(`${risultato('uiLanguageSelect')} .calm-select`);
      await calm.click();
      await page.locator('[data-calm-popup]').waitFor({ state: 'visible', timeout: 3000 });
      await page.locator('[data-calm-popup] [role="option"]').nth(lingua.startsWith('en') ? 1 : 2).click(); // italiano ↔ inglese
      await expect.poll(() => page.evaluate(() => document.documentElement.lang)).not.toBe(lingua);
      await page.waitForTimeout(150);
      const f = await page.evaluate(() => ({ id: document.activeElement?.id || document.activeElement?.tagName, nelRisultato: !!document.activeElement?.closest('#settingsSearchResultList'), campo: document.activeElement?.id === 'settingsSearch' }));
      esiti.push(f);
    }
    const persi = esiti.filter((f) => !(f.campo || (f.nelRisultato && /uiLanguageSelect--calm$/.test(f.id))));
    expect(persi, `il fuoco deve restare sul controllo della Lingua o tornare al campo: ${JSON.stringify(esiti)}`).toEqual([]);
  });

  test('RICERCA-10 · Ctrl K e «/»: dentro le Impostazioni portano al campo, fuori Ctrl K resta ai comandi (M2, M6)', async ({ page }) => {
    await apri(page);
    await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
    await page.keyboard.press('Control+k');
    let s = await stato(page);
    expect(s.fuocoNelCampo).toBe(true);
    expect(s.comandiAperti).toBe(false);
    await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
    await page.keyboard.press('/');
    s = await stato(page);
    expect(s.fuocoNelCampo).toBe(true);
    expect(s.valore, 'la «/» che porta al campo non si scrive').toBe('');
    await page.keyboard.type('a/b');
    expect((await stato(page)).valore, 'nel campo la «/» si scrive').toBe('a/b');
    await page.locator(CAMPO).fill('');
    // fuori dalle Impostazioni: Ctrl K apre i comandi e il campo non si prende il fuoco
    await page.locator('.talos-nav-item[data-vaia="chat"]').first().click();
    await expect(page.locator('#schermoImpostazioni')).toBeHidden();
    /* la classe `active` resta per l'animazione d'uscita: in quella finestra Ctrl K è ancora delle Impostazioni (misurato in
       `velo-fornitori.spec.mjs:341-344`, e qui: senza questa attesa il tasto arriva con le Impostazioni ancora attive) */
    await expect(page.locator('#schermoImpostazioni')).not.toHaveClass(/(^|\s)active(\s|$)/);
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('Control+k');
    await expect.poll(async () => (await stato(page)).comandiAperti).toBe(true);
    expect((await stato(page)).fuocoNelCampo).toBe(false);
  });

  test('RICERCA-11 · in un campo dove si scrive Ctrl K e «/» non rubano, e i comandi non si aprono sopra le Impostazioni (M3)', async ({ page }) => {
    await apri(page, 'models');
    const id = await page.evaluate(() => {
      const e = [...document.querySelectorAll('#schermoImpostazioni input, #schermoImpostazioni textarea')]
        .find((x) => x.id !== 'settingsSearch' && !x.disabled && !x.readOnly && ['text', 'number', 'search', 'url', 'textarea', ''].includes(x.type === undefined ? 'textarea' : x.tagName === 'TEXTAREA' ? 'textarea' : x.type) && x.getClientRects().length);
      if (!e) return null;
      e.dataset.provaCampo = '1'; return e.id || e.name || e.type;
    });
    expect(id, 'nella sezione c’è un campo dove si scrive: la prova misura').not.toBeNull();
    const campo = page.locator('[data-prova-campo="1"]');
    await campo.click();
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(200);
    let s = await stato(page);
    expect(s.fuocoNelCampo, 'Ctrl K non porta via chi sta scrivendo').toBe(false);
    expect(s.comandiAperti, 'e non apre i comandi sopra le Impostazioni').toBe(false);
    expect(await campo.evaluate((e) => e === document.activeElement)).toBe(true);
    const tipo = await campo.evaluate((e) => e.type);
    if (tipo !== 'number') {
      await campo.fill('');
      await page.keyboard.type('a/b');
      expect(await campo.inputValue(), 'la «/» si scrive nel campo').toBe('a/b');
    } else {
      await page.keyboard.press('/');
      s = await stato(page);
      expect(s.fuocoNelCampo, 'la «/» in un campo numerico non porta al campo di ricerca').toBe(false);
    }
  });

  test('RICERCA-12 · dopo un rimontaggio della vista («Ripristina tutto l’aspetto») Ctrl K porta ancora al campo', async ({ page }) => {
    await apri(page);
    await page.evaluate(() => { document.querySelector('[data-setting-row="uiDensitySelect"]').dataset.provaSegno = '1'; });
    await page.locator('#schermoImpostazioni [data-reset-appearance]').click();
    // ⛔ ultimo giro (reperto 7 del controllore): la precondizione non si ingoia più. Se il rimontaggio non avviene, la prova è rossa.
    await expect.poll(() => page.evaluate(() => !document.querySelector('[data-setting-row="uiDensitySelect"]')?.dataset.provaSegno), { message: 'PRECONDIZIONE: la vista si è rimontata' }).toBe(true);
    await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(250);
    const s = await stato(page);
    expect(s.comandiAperti, 'la palette dei comandi non si apre nelle Impostazioni').toBe(false);
    expect(s.fuocoNelCampo, 'Ctrl K porta al campo, come dice la riga dei tasti').toBe(true);
  });

  test('RICERCA-13 · Esc col fuoco nel controllo ospitato fa ciò che dice la riga dei tasti: svuota, e il fuoco torna al campo', async ({ page }) => {
    await apri(page);
    const nodo = await page.locator('[data-setting-row="uiDensitySelect"] .settings-field-control').elementHandle();
    await page.locator(CAMPO).fill('densit');
    await page.locator(`${risultato('uiDensitySelect')} .calm-select`).focus();
    await page.keyboard.press('Escape');
    const s = await stato(page);
    expect(s.valore).toBe('');
    expect(s.fuocoNelCampo).toBe(true);
    expect(s.risultatiVisibili).toBe(false);
    expect(await page.evaluate((h) => h.closest('[data-setting-row]')?.dataset.settingRow, nodo)).toBe('uiDensitySelect');
    // con la tendina APERTA, invece, Esc chiude solo la tendina (lo strato più interno per primo)
    await page.locator(CAMPO).fill('densit');
    await page.locator(`${risultato('uiDensitySelect')} .calm-select`).click();
    await page.locator('[data-calm-popup]').waitFor({ state: 'visible', timeout: 3000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-calm-popup]')).toBeHidden();
    expect((await stato(page)).valore, 'Esc sulla tendina aperta non svuota la ricerca').toBe('densit');
  });

  test('RICERCA-14 · l’Invio che conferma le lettere di un metodo d’immissione non salta alla riga (isComposing)', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).fill('densit');
    await page.locator(CAMPO).focus();
    const fermato = await page.evaluate(() => {
      const s = document.querySelector('#settingsSearch');
      const e = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true });
      s.dispatchEvent(e);
      return e.defaultPrevented;
    });
    const s = await stato(page);
    expect(s.valore, 'la ricerca resta: l’Invio era del metodo d’immissione').toBe('densit');
    expect(s.risultatiVisibili).toBe(true);
    expect(fermato, 'l’Invio della composizione non si ferma: lo usa il metodo d’immissione').toBe(false);
    // il keyCode 229 dei motori senza isComposing vale uguale
    await page.evaluate(() => {
      const s = document.querySelector('#settingsSearch');
      const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      Object.defineProperty(e, 'keyCode', { get: () => 229 });
      s.dispatchEvent(e);
    });
    expect((await stato(page)).valore).toBe('densit');
    // e l'Invio vero, dopo, apre la riga
    await page.keyboard.press('Enter');
    expect((await stato(page)).valore).toBe('');
  });

  test('RICERCA-23 · mentre un metodo d’immissione compone, Ctrl K e «/» non sono scorciatoie: il tasto resta suo (K2)', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).fill('densit');
    const tab = page.locator('#schermoImpostazioni [role="tab"]').first();
    for (const [dove, tasto] of [['campo', 'k'], ['scheda', '/'], ['scheda', 'k']]) {
      if (dove === 'campo') await page.locator(CAMPO).focus(); else await tab.focus();
      const esito = await page.evaluate(([t]) => {
        const s = document.querySelector('#settingsSearch'); s.setSelectionRange(s.value.length, s.value.length);
        const e = new KeyboardEvent('keydown', { key: t, code: t === 'k' ? 'KeyK' : 'Slash', ctrlKey: t === 'k', isComposing: true, bubbles: true, cancelable: true });
        const prima = document.activeElement; prima.dispatchEvent(e);
        return { fermato: e.defaultPrevented, fuocoUguale: document.activeElement === prima, selezione: s.selectionStart === 0 && s.selectionEnd === s.value.length };
      }, [tasto]);
      expect(esito, `${dove}, ${tasto === 'k' ? 'Ctrl K' : '«/»'} durante la composizione`).toEqual({ fermato: false, fuocoUguale: true, selezione: false });
    }
    expect((await stato(page)).comandiAperti).toBe(false);
  });

  test('RICERCA-24 · Ctrl K in un campo che scrive FUORI dalle Impostazioni (la ricerca delle chat) resta ai comandi dell’app (K6)', async ({ page }) => {
    await apri(page);
    const fuori = page.locator('.talos-sidebar input[data-ph="cerca"]');
    await expect(fuori, 'il campo delle chat si vede accanto alle Impostazioni: la prova misura').toBeVisible();
    await fuori.focus();
    await page.keyboard.press('Control+k');
    await expect.poll(async () => (await stato(page)).comandiAperti, { message: 'Ctrl K apre i comandi come nel resto dell’app' }).toBe(true);
    expect((await stato(page)).fuocoNelCampo).toBe(false);
  });

  test('RICERCA-15 · axe con la ricerca aperta e i controlli ospitati: nessun nested-interactive, niente nei risultati', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).fill('movimento');
    await expect(page.locator(`${ELENCO} .settings-field-control`).first()).toBeAttached();
    await page.route('**/__axe.min.js', (route) => route.fulfill({ contentType: 'application/javascript', body: AXE }));
    await page.addScriptTag({ url: '/__axe.min.js' });
    const violazioni = await page.evaluate(async () => {
      const res = await window.axe.run(document.querySelector('#schermoImpostazioni'), { resultTypes: ['violations'] });
      return res.violations.map((v) => ({ id: v.id, impact: v.impact, nodi: v.nodes.map((n) => n.target.join(' ')) }));
    });
    expect(violazioni.filter((v) => v.id === 'nested-interactive'), JSON.stringify(violazioni)).toEqual([]);
    // anche le righe (`#settingsResultRow-N`) e le celle (`#settingsResult-N`): un `li role=row` dentro la griglia è vietato (mutante N4)
    const neiRisultati = violazioni.filter((v) => v.nodi.some((n) => /settingsSearchResult|settingsResult|settings-result/.test(n)));
    expect(neiRisultati, JSON.stringify(neiRisultati)).toEqual([]);
    // il controllo nel risultato ha un nome, e il nome è quello del risultato
    const nomi = await page.evaluate(() => [...document.querySelectorAll('#settingsSearchResultList [role="combobox"], #settingsSearchResultList [role="switch"], #settingsSearchResultList [role="slider"]')]
      .map((e) => ({ id: e.id, nome: e.getAttribute('aria-labelledby') ? e.getAttribute('aria-labelledby').split(' ').map((i) => document.getElementById(i)?.textContent || '').join(' ').trim() : (e.getAttribute('aria-label') || '') })));
    expect(nomi.length).toBeGreaterThan(0);
    expect(nomi.filter((n) => !n.nome), JSON.stringify(nomi)).toEqual([]);
  });

  test('RICERCA-16 · finestre strette fino a 600 px: il controllo resta dentro il risultato, la pagina non sfonda', async ({ page }) => {
    await apri(page);
    for (const [w, h] of [[1180, 800], [1024, 800], [900, 760], [760, 760], [600, 800]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(150);
      await page.locator(CAMPO).fill('densit');
      const m = await page.evaluate(() => {
        const li = document.querySelector('#settingsSearchResultList [data-settings-result="uiDensitySelect"]');
        const c = li?.querySelector('.settings-field-control')?.getBoundingClientRect(); const r = li?.getBoundingClientRect();
        return { dentro: !!(r && c && c.left >= r.left - 0.5 && c.right <= r.right + 0.5), sfonda: document.documentElement.scrollWidth > document.documentElement.clientWidth };
      });
      expect(m, `larghezza ${w}`).toEqual({ dentro: true, sfonda: false });
      await page.locator(CAMPO).fill('');
    }
  });

  test('RICERCA-19 · con la tendina ospitata APERTA, «/» e Ctrl K non portano il fuoco al campo e non lasciano il menu orfano (N9, N11)', async ({ page }) => {
    await apri(page);
    for (const tasto of ['/', 'Control+k']) {
      await page.locator(CAMPO).fill('lingua');
      const tendina = page.locator('#settingsSearchResultList [data-settings-result="uiLanguageSelect"] [role="combobox"]');
      await tendina.focus();
      await page.keyboard.press('Enter');
      await expect(tendina, 'la tendina si apre').toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press(tasto);
      await page.waitForTimeout(150);
      const s = await stato(page);
      expect(s.fuocoNelCampo, `${tasto}: il campo non si prende il fuoco mentre la tendina è aperta`).toBe(false);
      expect(s.comandiAperti, `${tasto}: i comandi non si aprono sopra`).toBe(false);
      expect(await tendina.evaluate((e) => e === document.activeElement), `${tasto}: il fuoco resta sulla tendina`).toBe(true);
      expect(await tendina.getAttribute('aria-expanded'), `${tasto}: il menu resta aperto e suo, non orfano`).toBe('true');
      await page.keyboard.press('Escape');
      await expect(tendina).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('RICERCA-18 · con la palette dei comandi aperta SOPRA le Impostazioni, «/» e Ctrl K restano alla palette e non portano il fuoco dietro (N9)', async ({ page }) => {
    await apri(page);
    await page.evaluate(() => document.querySelector('[data-azione="comandi"]')?.click());
    await expect(page.locator('#veloComandi')).toBeVisible();
    // un elemento della palette che NON scrive (il bordo per allargarla): lì la «/» non è testo
    const unBottone = () => page.evaluate(() => {
      const el = [...document.querySelectorAll('#veloComandi button')].find((e) => e.getClientRects().length);
      if (!el) return false; el.focus(); return document.activeElement === el;
    });
    expect(await unBottone(), 'nella palette c’è un bottone che prende il fuoco: la prova misura').toBe(true);
    await page.keyboard.press('/');
    const s = await stato(page);
    expect(s.fuocoNelCampo, 'il campo delle impostazioni dietro la palette non si prende il fuoco').toBe(false);
    expect(await page.evaluate(() => !!document.activeElement?.closest('#veloComandi')), 'il fuoco resta nella palette').toBe(true);
    /* ⛔ ultimo giro (reperto 1 del controllore): Ctrl K su un bottone della palette la lascia alla palette, che riporta il fuoco al SUO
       campo. Senza la guardia dello strato sopra, Ctrl K veniva fermato qui e il fuoco restava sul bottone (sonda R1 del controllore). */
    expect(await unBottone()).toBe(true);
    await page.keyboard.press('Control+k');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id), { message: 'Ctrl K nella palette porta al campo della palette' }).toBe('cercaComando');
    expect((await stato(page)).fuocoNelCampo, 'e non al campo delle impostazioni dietro').toBe(false);
  });

  test('RICERCA-20 · tornato a casa, il controllo non è più una cella: nessun ruolo rimasto e axe senza errori sulla sezione (K7)', async ({ page }) => {
    await apri(page);
    const ruoliPrima = await page.evaluate(() => [...document.querySelectorAll('#schermoImpostazioni .settings-field-control')].map((n) => n.getAttribute('role')));
    for (const termine of ['densit', 'movimento', 'lingua', '']) await page.locator(CAMPO).fill(termine);
    const casa = await page.evaluate(() => [...document.querySelectorAll('#schermoImpostazioni .settings-field-control')].map((n) => ({ ruolo: n.getAttribute('role'), id: n.id, scelto: n.getAttribute('aria-selected') })));
    expect(casa.map((c) => c.ruolo), 'ogni controllo torna col ruolo che aveva').toEqual(ruoliPrima);
    expect(casa.filter((c) => c.ruolo === 'gridcell' || c.scelto !== null || /^settingsResult/u.test(c.id)), 'niente di cella resta a casa').toEqual([]);
    await page.route('**/__axe.min.js', (route) => route.fulfill({ contentType: 'application/javascript', body: AXE }));
    await page.addScriptTag({ url: '/__axe.min.js' });
    const violazioni = await page.evaluate(async () => (await window.axe.run(document.querySelector('#schermoImpostazioni'), { resultTypes: ['violations'] })).violations.map((v) => ({ id: v.id, impact: v.impact, nodi: v.nodes.map((n) => n.target.join(' ')) })));
    expect(violazioni, JSON.stringify(violazioni)).toEqual([]);
  });

  /* ⛔ ultimo giro (reperto 6 del controllore; W3C APG «Editable Combobox With Grid Popup», letta l'11/11): la griglia dichiara due celle
     per riga, e Destra/Sinistra passano da una cella all'altra; dall'ultima cella Destra va alla prima della riga dopo. Finché nessuna cella
     è scelta col cursore in mezzo alla parola, Sinistra e Destra restano del testo (come nell'esempio APG); Destra col cursore in fondo
     entra nella griglia, e Sinistra dalla prima cella della prima riga ne esce. Invio sulla cella del controllo porta il fuoco nel controllo; Tab resta com'era. */
  test('RICERCA-21 · frecce come la griglia W3C: Destra e Sinistra fra le celle, Su e Giù fra le righe, Invio nel controllo, Tab come prima', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).click();
    await page.keyboard.type('densit');
    const cella = () => page.evaluate(() => {
      const s = document.querySelector('#settingsSearch'); const id = s.getAttribute('aria-activedescendant'); const el = id ? document.getElementById(id) : null;
      const riga = el?.closest('[role="row"]'); const righe = [...document.querySelectorAll('#settingsSearchResultList > [role="row"]')];
      const celle = riga ? [...riga.children].filter((c) => c.getAttribute('role') === 'gridcell') : [];
      return { riga: righe.indexOf(riga), colonna: celle.indexOf(el), ruolo: el?.getAttribute('role') ?? null, scelte: [...document.querySelectorAll('#settingsSearchResultList [aria-selected="true"]')].map((c) => c.id),
        accesa: righe.findIndex((r) => r.classList.contains('is-active')), cursore: s.selectionStart, fuocoNelCampo: document.activeElement === s,
        bordo: el ? getComputedStyle(el).outlineStyle : null };
    });
    const forma = await page.evaluate(() => [...document.querySelectorAll('#settingsSearchResultList > [role="row"]')].slice(0, 2).map((r) => [...r.children].filter((c) => c.getAttribute('role') === 'gridcell').length + (r.querySelector('.settings-field-control') ? ' con controllo' : ' con destinazione')));
    expect(forma, 'le prime due righe di «densit»: la densità del movimento porta alla riga, quella dell’interfaccia ospita il controllo').toEqual(['2 con destinazione', '2 con controllo']);
    let c = await cella();
    expect(c).toMatchObject({ riga: 0, colonna: 0, cursore: 6 });
    await page.keyboard.press('ArrowRight');
    c = await cella();
    expect(c, 'Destra col cursore in fondo: la seconda cella della riga, il fuoco resta nel campo').toMatchObject({ riga: 0, colonna: 1, ruolo: 'gridcell', fuocoNelCampo: true, accesa: 0, cursore: 6 });
    expect(c.scelte, 'una sola cella scelta, ed è quella puntata').toHaveLength(1);
    expect(c.bordo, 'la cella scelta si vede').not.toBe('none');
    await page.keyboard.press('ArrowRight');
    expect(await cella(), 'Destra dall’ultima cella: prima cella della riga dopo').toMatchObject({ riga: 1, colonna: 0, accesa: 1 });
    await page.keyboard.press('ArrowLeft');
    expect(await cella(), 'Sinistra dalla prima cella torna all’ultima della riga prima').toMatchObject({ riga: 0, colonna: 1, accesa: 0 });
    await page.keyboard.press('ArrowLeft');
    expect(await cella()).toMatchObject({ riga: 0, colonna: 0 });
    await page.keyboard.press('ArrowLeft');
    expect(await cella(), 'dalla prima cella della prima riga Sinistra esce dalla griglia e torna al testo: il cursore si sposta').toMatchObject({ riga: 0, colonna: 0, cursore: 5 });
    await page.keyboard.press('ArrowRight');
    expect(await cella(), 'col cursore in mezzo Destra è del testo').toMatchObject({ riga: 0, colonna: 0, cursore: 6 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    expect(await cella(), 'Giù tiene la colonna').toMatchObject({ riga: 1, colonna: 1, accesa: 1 });
    await page.keyboard.press('Enter');
    const dopoInvio = await page.evaluate(() => ({ valore: document.querySelector('#settingsSearch').value, dentro: !!document.activeElement?.closest('#settingsSearchResultList [data-settings-result="uiDensitySelect"] .settings-field-control') }));
    expect(dopoInvio, 'Invio sulla cella del controllo porta il fuoco nel controllo, la ricerca resta').toEqual({ valore: 'densit', dentro: true });
    // scrivendo si torna alla prima cella della prima riga
    await page.locator(CAMPO).focus();
    await page.keyboard.press('Backspace'); await page.keyboard.type('t');
    expect(await cella()).toMatchObject({ riga: 0, colonna: 0 });
    // Tab come prima: il primo Tab non entra nei risultati, il terzo arriva al controllo ospitato (× → scheda della sezione → controllo)
    const tab = [];
    for (let i = 0; i < 3; i += 1) { await page.keyboard.press('Tab'); tab.push(await page.evaluate(() => !!document.activeElement?.closest('#settingsSearchResultList'))); }
    expect(tab).toEqual([false, false, true]);
    // Invio sulla cella della destinazione (una riga senza controllo) apre la riga, come sulla cella del testo
    await page.locator(CAMPO).fill('densit');
    await page.keyboard.press('ArrowRight');
    expect(await cella()).toMatchObject({ riga: 0, colonna: 1 });
    await page.keyboard.press('Enter');
    expect((await stato(page)).valore, 'Invio sulla destinazione apre la riga e svuota la ricerca').toBe('');
  });

  test('RICERCA-22 · con le notifiche aperte sopra le Impostazioni, «/» e Ctrl K non scrivono in un campo che non si vede (reperto 3)', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).fill('');
    for (const tasto of ['/', 'Control+k']) {
      if (await page.locator('#pannelloNotifiche').isHidden()) await page.locator('#notificationsBtn').click();
      await expect(page.locator('#pannelloNotifiche'), 'il pannello delle notifiche si apre').toBeVisible();
      const prima = await page.evaluate(() => document.activeElement?.closest('#pannelloNotifiche') ? 'pannello' : document.activeElement?.id);
      expect(prima, 'aperto, il fuoco sta nel pannello').toBe('pannello');
      await page.keyboard.press(tasto);
      await page.waitForTimeout(200);
      const s = await stato(page);
      expect(s.fuocoNelCampo, `${tasto}: il campo coperto dal pannello non prende il fuoco`).toBe(false);
      expect(s.comandiAperti, `${tasto}: i comandi non si aprono sopra`).toBe(false);
      expect(await page.evaluate(() => !!document.activeElement?.closest('#pannelloNotifiche')), `${tasto}: il fuoco resta nel pannello`).toBe(true);
      await expect(page.locator('#pannelloNotifiche'), `${tasto}: il pannello resta aperto`).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#pannelloNotifiche')).toBeHidden();
    }
    // chiuso il pannello, il tasto torna a fare il suo
    await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
    await page.keyboard.press('/');
    expect((await stato(page)).fuocoNelCampo).toBe(true);
  });

  /* Foto 1920×1080 dell'11/11: la riga andava a capo fra [Esc] e «esce», e «esce» restava da sola sulla terza riga. Qui si misura la
     posizione VERA di ogni tasto e della parola che lo segue (un Range sul testo), in italiano e in inglese, a cinque larghezze. */
  for (const lingua of ['it', 'en']) {
    test(`RICERCA-17 · la riga «Tastiera» non stacca mai una parola dal suo tasto, e il «·» non apre una riga (${lingua})`, async ({ page }) => {
      await page.addInitScript((l) => { if (window.top === window) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: l }, chat: {}, workspaces: {} })); }, lingua);
      await apri(page);
      for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 800], [1100, 800], [900, 760]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(150);
        const m = await page.evaluate(() => {
          const p = document.querySelector('#schermoImpostazioni [data-settings-keys]');
          const centro = (r) => r.top + r.height / 2;
          const staccate = []; const righe = new Set();
          for (const kbd of p.querySelectorAll('kbd')) {
            righe.add(Math.round(centro(kbd.getBoundingClientRect())));
            // la prima parola dopo il tasto (saltando gli altri tasti attaccati, come [↑][↓])
            const giro = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
            giro.currentNode = kbd.lastChild || kbd;
            let t = giro.nextNode();
            while (t && !t.textContent.replace(/[\s\u00a0]/gu, '')) t = giro.nextNode();
            if (!t || kbd.contains(t)) continue;
            const inizio = t.textContent.search(/[^\s\u00a0]/u);
            const fine = t.textContent.slice(inizio).search(/[\s\u00a0]|$/u) + inizio;
            const r = document.createRange(); r.setStart(t, inizio); r.setEnd(t, fine);
            const parola = r.getBoundingClientRect();
            if (Math.abs(centro(parola) - centro(kbd.getBoundingClientRect())) > 8) staccate.push(kbd.textContent + ' → ' + t.textContent.slice(inizio, fine));
          }
          // il «·» a inizio riga: la sua x è la più a sinistra del paragrafo
          const sinistra = p.getBoundingClientRect().left;
          const puntiInTesta = [];
          for (const t of [...p.childNodes].filter((n) => n.nodeType === 3)) {
            for (let i = t.textContent.indexOf('·'); i >= 0; i = t.textContent.indexOf('·', i + 1)) {
              const r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1);
              if (r.getBoundingClientRect().left - sinistra < 4) puntiInTesta.push(i);
            }
          }
          return { staccate, puntiInTesta, tasti: p.querySelectorAll('kbd').length };
        });
        expect(m.tasti, 'la riga ha i suoi tasti: la prova misura').toBeGreaterThanOrEqual(6);
        expect(m.staccate, `larghezza ${w}: una parola lontana dal suo tasto`).toEqual([]);
        expect(m.puntiInTesta, `larghezza ${w}: un «·» apre una riga`).toEqual([]);
      }
    });
  }
});

test('DOCTOR-RIGA · «Ricontrolla solo questo» rifà solo quella riga e dice «Controllo rifatto: stesso esito.»', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    if (!localStorage.getItem('talos.harness.desktop.settings.v1')) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: {}, workspaces: {} }));
  });
  let chiamate = 0, trattieni = null, lascia = () => {}, cambia = null;
  await page.route('**/api/v1/doctor', async (route) => {
    chiamate += 1; if (trattieni) await trattieni;
    if (!cambia) { await route.continue(); return; }
    const risposta = await route.fetch(); const dati = await risposta.json();
    await route.fulfill({ response: risposta, json: cambia(dati) });
  });
  await page.goto('/');
  await expect(page.locator('#talosAvvio')).toBeHidden({ timeout: 15_000 });
  await page.evaluate(() => { const v = document.querySelector('.talos-sidebar [data-vaia="doctor"]'); const g = v?.closest('.td-nav-group'); const t = g?.id ? document.querySelector(`.talos-sidebar [aria-controls="${g.id}"]`) : null; if (t?.getAttribute('aria-expanded') === 'false') t.click(); v?.click(); });
  await expect(page.locator('#schermoDoctor')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#schermoDoctor [data-doctor-id="git"]')).toBeVisible({ timeout: 15_000 });
  const primaDellaRiga = chiamate;
  await page.locator('#schermoDoctor [data-doctor-id="git"]').click();
  const righePrima = await page.locator('#schermoDoctor [data-doctor-id]').evaluateAll((r) => r.map((x) => x.dataset.doctorId + ':' + x.querySelector('.talos-doctor__row-line')?.textContent));
  await page.locator('#schermoDoctor [data-doctor-more]').click();
  const voce = page.locator('#menuDelDoctor [role="menuitem"]', { hasText: 'Ricontrolla solo questo' });
  await expect(voce).toHaveCount(1);
  trattieni = new Promise((ok) => { lascia = ok; });
  await voce.click();
  await expect.poll(() => chiamate - primaDellaRiga, { message: 'il controllo si rifà' }).toBe(1);
  // mentre si rifà la riga, la pagina intera NON passa da «Controllo in corso»: il bottone in alto resta com'era
  await page.waitForTimeout(200);
  await expect(page.locator('#schermoDoctor [data-doctor-refresh]')).toBeEnabled();
  lascia();
  await expect(page.getByText('Controllo rifatto: stesso esito.')).toBeVisible({ timeout: 10_000 });
  expect(chiamate - primaDellaRiga, 'il controllo si rifà una volta sola').toBe(1);
  const righeDopo = await page.locator('#schermoDoctor [data-doctor-id]').evaluateAll((r) => r.map((x) => x.dataset.doctorId + ':' + x.querySelector('.talos-doctor__row-line')?.textContent));
  expect(righeDopo).toEqual(righePrima);

  /* Seconda volta: il server risponde con DUE righe cambiate (git e browser). Si è chiesto solo git: cambia solo git, il browser resta
     com'era, e il messaggio dice il nuovo esito. Col controllo intero (`caricaDoctor`) cambierebbero tutt'e due. */
  trattieni = null;
  cambia = (d) => ({ ...d, data: { ...d.data, git: !d.data.git, naviga: !d.data.naviga } });
  const riga = (id) => page.locator(`#schermoDoctor [data-doctor-id="${id}"] .talos-doctor__row-line`).textContent();
  const [gitPrima, browserPrima] = [await riga('git'), await riga('browser')];
  await page.locator('#schermoDoctor [data-doctor-id="git"]').click();
  await page.locator('#schermoDoctor [data-doctor-more]').click();
  await page.locator('#menuDelDoctor [role="menuitem"]', { hasText: 'Ricontrolla solo questo' }).click();
  await expect(page.getByText(/Controllo rifatto: ora /u)).toBeVisible({ timeout: 10_000 });
  expect(chiamate - primaDellaRiga, 'una chiamata per riga ricontrollata').toBe(2);
  await expect.poll(() => riga('git'), { message: 'la riga chiesta prende il nuovo esito' }).not.toBe(gitPrima);
  expect(await riga('browser'), 'la riga non chiesta resta com’era').toBe(browserPrima);
});

/* ⛔ Ultimo giro della 023 (reperti 4 e 5 del controllore). Il Doctor dal vivo con il server di prova: la rotta del controllo si può
   trattenere (`trattieni`) o cambiare (`cambia`, sulla busta `{ ok, data, meta }` del server). */
async function apriDoctor(page) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    if (!localStorage.getItem('talos.harness.desktop.settings.v1')) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: {}, workspaces: {} }));
  });
  const rotta = { chiamate: 0, trattieni: null, cambia: null };
  await page.route('**/api/v1/doctor', async (route) => {
    rotta.chiamate += 1; if (rotta.trattieni) await rotta.trattieni;
    if (!rotta.cambia) { await route.continue(); return; }
    const risposta = await route.fetch(); const dati = await risposta.json();
    await route.fulfill({ response: risposta, json: rotta.cambia(dati) });
  });
  await page.goto('/');
  await expect(page.locator('#talosAvvio')).toBeHidden({ timeout: 15_000 });
  await page.evaluate(() => { const v = document.querySelector('.talos-sidebar [data-vaia="doctor"]'); const g = v?.closest('.td-nav-group'); const t = g?.id ? document.querySelector(`.talos-sidebar [aria-controls="${g.id}"]`) : null; if (t?.getAttribute('aria-expanded') === 'false') t.click(); v?.click(); });
  await expect(page.locator('#schermoDoctor')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#schermoDoctor [data-doctor-id="git"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#schermoDoctor [data-doctor-refresh]')).toBeEnabled({ timeout: 15_000 });
  return rotta;
}
async function ricontrollaSolo(page, id) {
  await page.locator(`#schermoDoctor [data-doctor-id="${id}"]`).click();
  await page.locator('#schermoDoctor [data-doctor-more]').click();
  await page.locator('#menuDelDoctor [role="menuitem"]', { hasText: 'Ricontrolla solo questo' }).click();
}
const righeDoctor = (page) => page.locator('#schermoDoctor [data-doctor-id]').evaluateAll((r) => r.map((x) => x.dataset.doctorId));

test('DOCTOR-PEGGIORA · una riga rifatta che peggiora sale al primo posto e il verdetto nomina proprio lei (K10)', async ({ page }) => {
  const rotta = await apriDoctor(page);
  const ordinePrima = await righeDoctor(page);
  expect(ordinePrima.indexOf('shell'), 'la riga della shell non è già la prima: la prova misura').toBeGreaterThan(0);
  await page.locator('#schermoDoctor [data-doctor-id="shell"]').click();
  const titoloShell = (await page.locator('#schermoDoctor [data-doctor-panel] h3').textContent()).trim();
  rotta.cambia = (d) => ({ ...d, data: { ...d.data, shell: 'none' } });
  await ricontrollaSolo(page, 'shell');
  /* reperto 6 del controllore (giudice v1477, correzione 1): la parola dell'esito dentro la frase col minuscolo, come nei filtri */
  await expect(page.getByText('Controllo rifatto: ora guasto.', { exact: true }), 'dentro la frase «guasto» va minuscolo').toBeVisible({ timeout: 10_000 });
  await expect.poll(() => righeDoctor(page).then((r) => r[0]), { message: 'la riga che ora è un guasto sale in testa' }).toBe('shell');
  expect((await righeDoctor(page)).slice().sort(), 'nessuna riga persa o doppia').toEqual(ordinePrima.slice().sort());
  await expect(page.locator('#schermoDoctor [data-doctor-verdict]')).toHaveAttribute('data-g', 'danger');
  await expect(page.locator('#schermoDoctor [data-doctor-verdict-actions] button'), 'il verdetto porta alla riga peggiore').toContainText(titoloShell);
});

test('DOCTOR-DURANTE · mentre gira il controllo intero, «Ricontrolla solo questo» non parte una seconda volta (K11)', async ({ page }) => {
  const rotta = await apriDoctor(page);
  let lascia = () => {};
  rotta.trattieni = new Promise((ok) => { lascia = ok; });
  const prima = rotta.chiamate;
  await page.locator('#schermoDoctor [data-doctor-refresh]').click();
  await expect.poll(() => rotta.chiamate - prima, { message: 'il controllo intero è partito' }).toBe(1);
  await expect(page.locator('#schermoDoctor [data-doctor-refresh]')).toBeDisabled();
  await ricontrollaSolo(page, 'git');
  await page.waitForTimeout(400);
  expect(rotta.chiamate - prima, 'nessuna seconda chiamata mentre la prima è in corso').toBe(1);
  rotta.trattieni = null; lascia();
  await expect(page.locator('#schermoDoctor [data-doctor-refresh]')).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByText(/Controllo rifatto/u), 'nessun messaggio di una riga rifatta che non è partita').toHaveCount(0);
});

test('DOCTOR-ESPORTA · dopo una riga rifatta, «Esporta» scrive anche il risultato NUOVO di quella riga, come la pagina (reperto 5)', async ({ page }) => {
  const rotta = await apriDoctor(page);
  const scarica = async () => { const [d] = await Promise.all([page.waitForEvent('download'), page.locator('#schermoDoctor [data-doctor-export]').click()]); const testo = readFileSync(await d.path(), 'utf8'); return { testo, file: JSON.parse(testo), byte: Buffer.byteLength(testo) }; };
  const primaDiTutto = await scarica();
  const gitPrima = await page.evaluate(async () => (await (await fetch('/api/v1/doctor')).json()).data.git);
  rotta.cambia = (d) => ({ ...d, data: { ...d.data, git: !d.data.git } });
  await ricontrollaSolo(page, 'git');
  await expect(page.getByText(/Controllo rifatto: ora /u)).toBeVisible({ timeout: 10_000 });
  const gravitaInPagina = await page.locator('#schermoDoctor [data-doctor-panel] .talos-doctor__word').getAttribute('data-g');
  const [scarico] = await Promise.all([page.waitForEvent('download'), page.locator('#schermoDoctor [data-doctor-export]').click()]);
  const file = JSON.parse(readFileSync(await scarico.path(), 'utf8'));
  expect(file.risultato.git, 'il controllo intero resta quello di prima').toBe(gitPrima);
  expect(file.righeRifatte?.git?.risultato?.git, 'la riga rifatta c’è col risultato nuovo').toBe(!gitPrima);
  expect(typeof file.righeRifatte?.git?.ricevutoAlle).toBe('string');
  const git = file.voci?.find((v) => v.id === 'git');
  expect(git?.esito, 'le righe del file dicono ciò che dice la pagina').toBe(gravitaInPagina);
  /* 023 cura piccola, punto 4 (giudice 14:33; reperto 5 del controllore): la riga rifatta porta SOLO i dati che fanno la sua riga, non il
     controllo intero nuovo (30 → 62 → 94 KB, con valori di righe che la pagina non mostra); e la sua ora è la sua (C13) */
  expect(Object.keys(file.righeRifatte.git.risultato), 'della riga rifatta solo i suoi dati').toEqual(['git']);
  expect(Date.parse(file.righeRifatte.git.ricevutoAlle), 'l’ora della riga rifatta è la sua, dopo quella del controllo intero').toBeGreaterThan(Date.parse(file.ricevutoAlle));
  const unaRiga = Buffer.byteLength(JSON.stringify(file, null, 2));
  rotta.cambia = (d) => ({ ...d, data: { ...d.data, shell: d.data.shell === 'none' ? 'desktop' : 'none' } });
  await ricontrollaSolo(page, 'shell');
  /* il messaggio della prima riga può essere ancora a schermo: si aspetta la seconda riga nel file, non un testo */
  await expect.poll(async () => Object.keys((await scarica()).file.righeRifatte ?? {}).sort(), { timeout: 10_000, message: 'la riga della shell rifatta entra nel file' }).toEqual(['git', 'shell']);
  const dueRighe = await scarica();
  expect(dueRighe.file.righeRifatte.git.risultato, 'nessun valore di una riga non rifatta').not.toHaveProperty('naviga');
  console.log(`ESPORTA-KB prima ${primaDiTutto.byte} una riga ${unaRiga} due righe ${dueRighe.byte}`);
  expect(unaRiga - primaDiTutto.byte, 'una riga rifatta pesa la sua riga, non un controllo intero').toBeLessThan(2048);
  expect(dueRighe.byte - unaRiga, 'la seconda riga rifatta pure').toBeLessThan(2048);
  rotta.cambia = null;
  // «Ricontrolla» in alto rifà tutto: le righe rifatte non ci sono più, né nella pagina né nel file
  rotta.cambia = null;
  await page.locator('#schermoDoctor [data-doctor-refresh]').click();
  await expect(page.locator('#schermoDoctor [data-doctor-refresh]')).toBeEnabled({ timeout: 10_000 });
  const [scarico2] = await Promise.all([page.waitForEvent('download'), page.locator('#schermoDoctor [data-doctor-export]').click()]);
  const file2 = JSON.parse(readFileSync(await scarico2.path(), 'utf8'));
  expect(file2.righeRifatte ?? {}).toEqual({});
  expect(file2.voci.find((v) => v.id === 'git').esito).toBe(gitPrima ? 'success' : 'warning');
});

/*
 * ⛔ 023 cura piccola e completamento (11/11/2026, giudice v1477; rapporto del controllore dell'ultimo giro, GIALLO). Le sue sonde
 *   (`C:/T/ctrl-023-ultimo-lavoro/p-vivi.mjs`, `p-equivalenti.mjs`) diventano prove del repo: ognuna cade col mutante che porta nel
 *   nome, applicato su una copia. In più le rosse dei punti nuovi: la guardia degli strati che vede il piano ChatGPT, la ricerca sui
 *   nomi dei valori (owner 11/11 13:50, decisione 10), il Doctor che prova il motore locale (decisione 9), il file di «Esporta» che non
 *   si gonfia, «ora guasto» col minuscolo.
 */
/** Il piano ChatGPT (finto: `page.route` sullo stato, mai il portachiavi) aperto dalla chat, poi le Impostazioni da Ctrl K: il pannello
 *  del piano resta lì sopra (preesistente, `piano-sopra-impostazioni.png` del controllore). */
async function apriPianoSopraLeImpostazioni(page) {
  await page.route('**/api/v1/auth/chatgpt/stato', async (r) => { const x = await r.fetch(); const j = await x.json(); await r.fulfill({ response: x, json: { ...j, data: { ...j.data, collegato: true, pianoAbilitato: true } } }); });
  await page.addInitScript(() => { if (window.top === window) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: 'it' }, chat: { model: 'chatgpt:gpt-5.1-codex' }, workspaces: {} })); });
  await page.goto('/');
  await expect(page.locator('#talosAvvio')).toBeHidden({ timeout: 15_000 });
  await page.evaluate(() => { const voce = document.querySelector('.talos-sidebar [data-vaia="chat"]'); const g = voce?.closest('.td-nav-group'); const t = g?.id ? document.querySelector(`.talos-sidebar [aria-controls="${g.id}"]`) : null; if (t?.getAttribute('aria-expanded') === 'false') t.click(); voce?.click(); });
  const pastiglia = page.locator('[data-piano-chatgpt]').first();
  await expect(pastiglia).toBeVisible({ timeout: 10_000 });
  await pastiglia.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-piano-pannello]')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page.locator('#veloComandi')).toBeVisible();
  await page.keyboard.type('Impostazioni');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await expect(page.locator('#schermoImpostazioni')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-piano-pannello]'), 'il pannello del piano resta sopra le Impostazioni').toBeVisible();
}
const celleScelte = (page) => page.evaluate(() => {
  const s = document.querySelector('#settingsSearch'); const id = s.getAttribute('aria-activedescendant'); const el = id ? document.getElementById(id) : null;
  const righe = [...document.querySelectorAll('#settingsSearchResultList > [role="row"]')]; const riga = el?.closest('[role="row"]');
  const celle = riga ? [...riga.children].filter((c) => c.getAttribute('role') === 'gridcell') : [];
  return { riga: righe.indexOf(riga), colonna: celle.indexOf(el), righe: righe.length, cursore: s.selectionStart, valore: s.value };
});

test.describe('023 CURA PICCOLA: i mutanti vivi del controllore, la guardia col piano, la ricerca sui valori', () => {
  test('RICERCA-25 · piano ChatGPT aperto sopra le Impostazioni: il primo Esc nel controllo ospitato chiude solo il piano, il secondo la ricerca (K3)', async ({ page }) => {
    await apriPianoSopraLeImpostazioni(page);
    await page.locator(CAMPO).focus();
    await page.keyboard.type('densit');
    for (const k of ['ArrowDown', 'ArrowRight', 'Enter']) await page.keyboard.press(k);
    expect(await page.evaluate(() => !!document.activeElement?.closest('#settingsSearchResultList .settings-field-control')), 'Invio sulla cella porta il fuoco nel controllo ospitato').toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-piano-pannello]'), 'il primo Esc chiude il piano').toHaveCount(0);
    await expect(page.locator(CAMPO), 'un Esc chiude uno strato solo: la ricerca resta').toHaveValue('densit');
    if (!(await page.evaluate(() => !!document.activeElement?.closest('#settingsSearchResultList .settings-field-control')))) {
      await page.locator(`${ELENCO} [data-settings-result="uiDensitySelect"] .settings-field-control [aria-haspopup]`).first().focus();
    }
    await page.keyboard.press('Escape');
    await expect(page.locator(CAMPO), 'il secondo Esc esce dalla ricerca').toHaveValue('');
  });

  test('RICERCA-26 · Destra dall’ultima cella dell’ultima riga torna alla prima (C3); dopo aver scritto Sinistra è di nuovo del testo (C6)', async ({ page }) => {
    await apri(page);
    await page.locator(CAMPO).click();
    await page.keyboard.type('densit');
    expect((await celleScelte(page)).righe, '«densit» ha due righe: la prova misura').toBe(2);
    for (const k of ['End', 'ArrowRight', 'ArrowRight', 'ArrowRight']) await page.keyboard.press(k);
    expect(await celleScelte(page), 'l’ultima cella dell’ultima riga').toMatchObject({ riga: 1, colonna: 1 });
    await page.keyboard.press('ArrowRight');
    expect(await celleScelte(page), 'W3C APG: Destra dall’ultima cella gira alla prima cella della prima riga').toMatchObject({ riga: 0, colonna: 0 });
    // si scrive mentre si è nella griglia: le frecce laterali tornano al testo
    await page.locator(CAMPO).fill('');
    await page.keyboard.type('densit');
    await page.keyboard.press('ArrowRight');
    expect(await celleScelte(page), 'Destra col cursore in fondo entra nella griglia').toMatchObject({ riga: 0, colonna: 1 });
    await page.keyboard.press('Backspace');
    await page.keyboard.type('t');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowLeft');
    expect(await celleScelte(page), 'dopo aver scritto Sinistra sposta il cursore, non la cella').toMatchObject({ riga: 1, cursore: 5 });
  });

  test('RICERCA-27 · Invio sui segmenti va sulla scelta ACCESA, e Spazio non la cambia (C5)', async ({ page }) => {
    await apri(page);
    const sorgente = () => page.locator('[data-setting-row="newSessionViewSelect"] select, [data-settings-hosted-from] ~ select, select[data-settings-segmented-source]').first().evaluate((e) => e.value);
    await page.locator(CAMPO).fill('nuova sessione');
    const spento = page.locator(`${risultato('newSessionViewSelect')} [role="radio"][aria-checked="false"]`);
    const scelta = await spento.getAttribute('data-value');
    const prima = await page.locator(`${risultato('newSessionViewSelect')} [role="radio"]`).first().getAttribute('data-value');
    expect(scelta, 'la scelta che si accende non è la prima del gruppo: la prova misura').not.toBe(prima);
    await spento.click(); // la persona sceglie l'altra
    await expect.poll(sorgente).toBe(scelta);
    await page.locator(CAMPO).fill('');
    await page.locator(CAMPO).focus();
    await page.keyboard.type('nuova sessione');
    const indice = await page.evaluate(() => [...document.querySelectorAll('#settingsSearchResultList > [role="row"]')].findIndex((r) => r.dataset.settingsResult === 'newSessionViewSelect'));
    expect(indice).toBeGreaterThanOrEqual(0);
    await page.keyboard.press('ArrowRight');
    for (let k = 0; k < indice; k += 1) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const fuoco = await page.evaluate(() => ({ acceso: document.activeElement?.getAttribute('aria-checked'), valore: document.activeElement?.getAttribute('data-value') }));
    expect(fuoco, 'Invio porta il fuoco sulla scelta accesa').toEqual({ acceso: 'true', valore: scelta });
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    expect(await sorgente(), 'Spazio sulla scelta accesa non cambia il valore').toBe(scelta);
  });

  test('RICERCA-28 · notifiche aperte e fuoco portato fuori col Tab: «/» non scrive nel campo coperto (C15)', async ({ page }) => {
    await apri(page);
    await page.locator('#notificationsBtn').click();
    await expect(page.locator('#pannelloNotifiche')).toBeVisible();
    let n = 0;
    while (n < 30 && (await page.evaluate(() => !!document.activeElement?.closest('#pannelloNotifiche')))) { await page.keyboard.press('Tab'); n += 1; }
    expect(await page.evaluate(() => !!document.activeElement?.closest('#pannelloNotifiche')), 'il fuoco è uscito dal pannello').toBe(false);
    await expect(page.locator('#pannelloNotifiche'), 'il pannello è ancora aperto').toBeVisible();
    await page.keyboard.press('/');
    await page.waitForTimeout(200);
    expect((await stato(page)).fuocoNelCampo, 'il campo coperto dalle notifiche non prende il fuoco').toBe(false);
  });

  test('RICERCA-29 · piano ChatGPT aperto: «/» e Ctrl K non agiscono né col fuoco nel piano (C9) né col fuoco nelle Impostazioni; Esc lo chiude e il tasto torna', async ({ page }) => {
    await apriPianoSopraLeImpostazioni(page);
    const nelPiano = () => page.evaluate(() => !!document.activeElement?.closest('[data-piano-pannello]'));
    if (!(await nelPiano())) await page.locator('[data-piano-pannello] a, [data-piano-pannello] button').first().focus();
    expect(await nelPiano(), 'il fuoco sta nel pannello del piano').toBe(true);
    await page.keyboard.press('/');
    await page.waitForTimeout(150);
    expect((await stato(page)).fuocoNelCampo, '«/» col fuoco nel piano: il campo non si prende il fuoco').toBe(false);
    // il fuoco torna nelle Impostazioni, il piano resta aperto sopra la pagina
    for (const tasto of ['/', 'Control+k']) {
      await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
      await expect(page.locator('[data-piano-pannello]')).toBeVisible();
      await page.keyboard.press(tasto);
      await page.waitForTimeout(150);
      const s = await stato(page);
      expect(s.fuocoNelCampo, `${tasto} con il piano aperto: il campo non prende il fuoco`).toBe(false);
      expect(s.comandiAperti, `${tasto} con il piano aperto: i comandi non si aprono`).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-piano-pannello]'), 'Esc chiude il piano').toHaveCount(0);
    await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
    await page.keyboard.press('/');
    expect((await stato(page)).fuocoNelCampo, 'chiuso il piano, «/» torna a portare al campo').toBe(true);
  });

  /* Dopo la cura il piano ChatGPT ha la sua guardia: il mutante C9 (tolta la clausola «fuoco in una finestra o in un menu») non lo vede più
     RICERCA-29. Lo vede la finestra delle scorciatoie aperta sopra le Impostazioni: «/» premuto lì dentro non porta il fuoco nel campo
     coperto dalla finestra. */
  test('RICERCA-31 · finestra delle scorciatoie aperta sopra le Impostazioni (Ctrl /): «/» resta nella finestra, il campo sotto non prende il fuoco (C9)', async ({ page }) => {
    await apri(page);
    await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
    await page.keyboard.press('Control+/');
    const finestra = page.locator('#veloScorciatoie');
    await expect(finestra, 'Ctrl / apre le scorciatoie sopra le Impostazioni').toBeVisible();
    const nellaFinestra = () => page.evaluate(() => !!document.activeElement?.closest('#veloScorciatoie [role="dialog"]'));
    if (!(await nellaFinestra())) await page.locator('#veloScorciatoie [role="dialog"] button').first().focus();
    expect(await nellaFinestra(), 'il fuoco sta nella finestra').toBe(true);
    await page.keyboard.press('/');
    await page.waitForTimeout(150);
    expect((await stato(page)).fuocoNelCampo, '«/» nella finestra: il campo coperto non prende il fuoco').toBe(false);
    expect(await nellaFinestra(), 'il fuoco resta nella finestra').toBe(true);
    await expect(finestra).toBeVisible();
  });

  /* C9b (giudice v1490, 11/11 16:32): un menu aperto sopra le Impostazioni — il «⋯» di una conversazione nella barra a sinistra, che non
     è modale — prende «/» e Ctrl K PRIMA delle Impostazioni, col fuoco dentro (RICERCA-32) e anche col fuoco tornato nelle Impostazioni
     (RICERCA-33). Come Codex: la vista aperta sopra ha la prima occasione di prendere il tasto (`codex-rs/tui/src/bottom_pane/mod.rs:1026`),
     e «nessuno strato aperto» ha una definizione sola (`:1933`). */
  const SESSIONE_DELLA_BARRA = { sessionId: '40000000-0000-4000-8000-0000000c9b00', taskId: 'libero:default', nome: 'Conversazione col menu', avviataAlle: '2026-11-11T07:00:00.000Z', conclusa: true, modello: 'z-ai/glm-5.3-flash', provider: 'cloud' };
  async function apriMenuDellaBarraSopraLeImpostazioni(page) {
    await page.route('**/api/v1/sessions', (route) => (route.request().method() === 'GET'
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { items: [SESSIONE_DELLA_BARRA] }, meta: { schema: 'talos.harness-ui.api.v1' } }) })
      : route.fallback()));
    await apri(page);
    const riga = page.locator(`.talos-sidebar [data-real-session-id="${SESSIONE_DELLA_BARRA.sessionId}"]`).first();
    if (!(await riga.isVisible())) await page.evaluate((id) => { const r = document.querySelector(`.talos-sidebar [data-real-session-id="${id}"]`); const g = r?.closest('.td-nav-group'); const t = g?.id ? document.querySelector(`.talos-sidebar [aria-controls="${g.id}"]`) : null; if (t?.getAttribute('aria-expanded') === 'false') t.click(); }, SESSIONE_DELLA_BARRA.sessionId);
    await expect(riga, 'la conversazione è nella barra accanto alle Impostazioni').toBeVisible({ timeout: 10_000 });
    await riga.click({ button: 'right' });
    const menu = page.locator('.session-actions-menu[role="menu"]');
    await expect(menu, 'il menu della conversazione è aperto sopra le Impostazioni').toBeVisible();
    await expect(page.locator('#schermoImpostazioni')).toBeVisible();
    return menu;
  }
  test('RICERCA-32 · menu di una conversazione aperto sopra le Impostazioni, fuoco nel menu: «/» e Ctrl K restano al menu (C9b)', async ({ page }) => {
    const menu = await apriMenuDellaBarraSopraLeImpostazioni(page);
    for (const tasto of ['/', 'Control+k']) {
      await menu.getByRole('menuitem').first().focus();
      await page.keyboard.press(tasto);
      await page.waitForTimeout(150);
      const s = await stato(page);
      expect(s.fuocoNelCampo, `${tasto} col fuoco nel menu: il campo sotto non prende il fuoco`).toBe(false);
      expect(s.comandiAperti, `${tasto} col fuoco nel menu: i comandi non si aprono`).toBe(false);
      await expect(menu, 'il menu resta aperto, non orfano').toBeVisible();
    }
  });
  test('RICERCA-33 · menu di una conversazione aperto, fuoco tornato nelle Impostazioni: «/» e Ctrl K non agiscono sotto il menu; Esc lo chiude e il tasto torna', async ({ page }) => {
    const menu = await apriMenuDellaBarraSopraLeImpostazioni(page);
    for (const tasto of ['/', 'Control+k']) {
      await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
      await expect(menu).toBeVisible();
      await page.keyboard.press(tasto);
      await page.waitForTimeout(150);
      const s = await stato(page);
      expect(s.fuocoNelCampo, `${tasto} con il menu aperto: il campo non prende il fuoco`).toBe(false);
      expect(s.comandiAperti, `${tasto} con il menu aperto: i comandi non si aprono`).toBe(false);
    }
    await menu.getByRole('menuitem').first().focus();
    await page.keyboard.press('Escape');
    await expect(menu, 'Esc chiude il menu').toBeHidden();
    await page.locator('#schermoImpostazioni [role="tab"]').first().focus();
    await page.keyboard.press('/');
    expect((await stato(page)).fuocoNelCampo, 'chiuso il menu, «/» torna a portare al campo').toBe(true);
  });

  for (const lingua of ['it', 'en']) {
    test(`RICERCA-30 · la ricerca trova anche dai nomi dei valori, e axe resta a 0 (${lingua})`, async ({ page }) => {
      await page.addInitScript((l) => { if (window.top === window) localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { uiLanguage: l }, chat: {}, workspaces: {} })); }, lingua);
      await apri(page);
      const casi = lingua === 'it'
        ? [['scuro', 'colorModeSelect'], ['inglese', 'uiLanguageSelect'], ['italiano', 'uiLanguageSelect'], ['francese', 'replyLanguageSelect'], ['giapponese', 'replyLanguageSelect']]
        : [['dark', 'colorModeSelect'], ['italian', 'uiLanguageSelect'], ['english', 'uiLanguageSelect'], ['french', 'replyLanguageSelect'], ['japanese', 'replyLanguageSelect']];
      for (const [termine, campo] of casi) {
        await page.locator(CAMPO).fill(termine);
        expect((await stato(page)).risultati, `«${termine}» trova ${campo}`).toContain(campo);
      }
      await page.locator(CAMPO).fill(lingua === 'it' ? 'inglese' : 'italian');
      await page.route('**/__axe.min.js', (route) => route.fulfill({ contentType: 'application/javascript', body: AXE }));
      await page.addScriptTag({ url: '/__axe.min.js' });
      const violazioni = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((v) => ({ id: v.id, nodi: v.nodes.map((n) => n.target.join(' ')) })));
      expect(violazioni, JSON.stringify(violazioni)).toEqual([]);
    });
  }
});

/* ⛔ 023 cura piccola, punto 5 (owner 11/11/2026 13:50, decisione 9; giudice v1477, correzione 3): «Prova il motore locale». La rotta vera
   del server di prova (nessun modello locale sul profilo finto) e poi le sue risposte, nella forma del modulo del server
   (`src/doctor-motore-locale.mjs`), via `page.route`, per vedere ogni esito a schermo. Il server non carica né scarica mai un modello:
   lo prova `tests/doctor-motore-locale.test.mjs` con un motore finto che conta i caricamenti. */
test('DOCTOR-MOTORE · «Prova il motore locale»: nessun modello, risposta col tempo, nessun modello caricato, errore; «Ricontrolla solo questo» rifà la prova', async ({ page }) => {
  const rotta = await apriDoctor(page);
  const prove = []; let risposta = null;
  await page.route('**/api/v1/doctor/local-engine', async (route) => {
    prove.push(route.request().method());
    if (!risposta) { await route.continue(); return; }
    await route.fulfill({ status: 200, contentType: 'application/json', json: { ok: true, data: risposta, meta: {} } });
  });
  const riga = page.locator('#schermoDoctor [data-doctor-id="motore"]');
  await expect(riga, 'il motore locale è una riga del Doctor').toBeVisible();
  await expect(riga).toContainText('Non ancora provato');
  await riga.click();
  const prova = page.locator('#schermoDoctor [data-doctor-panel] [data-doctor-action="prova"]');
  await expect(prova).toHaveText('Prova il motore locale');
  const doctorPrima = rotta.chiamate;
  await prova.click();
  await expect(riga, 'il server di prova non ha modelli: lo dice, e non ne scarica uno').toContainText('Nessun modello locale installato', { timeout: 10_000 });
  expect(prove, 'una prova = una POST').toEqual(['POST']);
  expect(rotta.chiamate - doctorPrima, 'la prova del motore non rifà il controllo intero').toBe(0);
  /* Giro dopo il revisore (giudice v1503, punto 3): senza modelli installati niente «Prova di nuovo» né «Apri i modelli installati»
     (portavano a niente), un passo solo verso i modelli da scaricare; rifare la prova resta nel menu «⋯». */
  await expect(page.locator('#schermoDoctor [data-doctor-panel] [data-doctor-action="prova"]'), 'niente da riprovare senza modelli').toHaveCount(0);
  await expect(page.locator('#schermoDoctor [data-doctor-panel]')).toContainText('Trova un modello da scaricare');
  risposta = { esito: 'risponde', modelId: 'qwen3-4b', nome: 'Qwen3 4B', ms: 812 };
  await ricontrollaSolo(page, 'motore');
  await expect(riga).toContainText('Il modello caricato ha risposto in 0,8 s.');
  await expect(riga.locator('.talos-doctor__word')).toHaveAttribute('data-g', 'success');
  await expect(page.locator('#schermoDoctor [data-doctor-panel]')).toContainText('Qwen3 4B');
  risposta = { esito: 'nessunCaricato' };
  await page.locator('#schermoDoctor [data-doctor-panel] [data-doctor-action="prova"]').first().click();
  await expect(riga).toContainText('Nessun modello caricato');
  await expect(page.locator('#schermoDoctor [data-doctor-panel]')).toContainText('non ne carica uno');
  risposta = { esito: 'errore', modelId: 'qwen3-4b', nome: 'Qwen3 4B', ms: 30000, codice: 'TIMEOUT' };
  await ricontrollaSolo(page, 'motore');
  await expect(riga, '«Ricontrolla solo questo» sulla riga del motore rifà la prova').toContainText('non ha risposto');
  await expect(riga.locator('.talos-doctor__word')).toHaveAttribute('data-g', 'warning');
  risposta = { esito: 'dorme', modelId: 'qwen3-4b', nome: 'Qwen3 4B' };
  await page.locator('#schermoDoctor [data-doctor-panel] [data-doctor-action="prova"]').first().click();
  await expect(riga, 'il modello che dorme: lo dice e non manda niente').toContainText('dorme dopo una pausa');
  await expect(riga.locator('.talos-doctor__word')).toHaveAttribute('data-g', 'info');
  expect(prove.length, 'cinque prove, una per tasto').toBe(5);
  expect(rotta.chiamate - doctorPrima, 'mai il controllo intero').toBe(0);
  risposta = { esito: 'nessunModello' };
  await ricontrollaSolo(page, 'motore');
  await expect(riga).toContainText('Nessun modello locale installato');
  const scaricamenti = [];
  await page.route('**/api/v1/huggingface/**', (route) => { // niente rete dalla prova; ogni scaricamento chiesto si conta
    if (/\/api\/v1\/huggingface\/download/u.test(route.request().url())) scaricamenti.push(route.request().method());
    return route.abort();
  });
  await page.locator('#schermoDoctor [data-doctor-panel] [data-doctor-action="apri"]', { hasText: 'Trova un modello da scaricare' }).click();
  await expect(page.locator('#modelLabHfTab'), '«Trova un modello da scaricare» porta ai modelli da scaricare').toHaveAttribute('aria-selected', 'true', { timeout: 10_000 });
  await page.waitForTimeout(500); // una richiesta partita col clic arriva qui; si misura un'assenza
  expect(scaricamenti, 'il pulsante porta ai modelli da scaricare e non scarica niente da solo (mutante M2 del revisore)').toEqual([]);
});
