import { expect, test } from '@playwright/test';

/*
 * ⭐ Owner, 08/10/2026 notte («elenco vero, e si scrivono»): Note, Attività e Memoria sono della PERSONA (archivi globali), quindi
 *   si vedono e si scrivono anche SENZA una sessione aperta, dalle rotte personali `/api/v1/me/<risorsa>`. Prima, misurato sulla
 *   4176 con una nota e un'attività salvate: le tre pagine dicevano «nessuna nota» / zero e «Apri una sessione», e il pulsante
 *   «Nuova nota» promesso dal vuoto non c'era.
 * ⛔ E la barra laterale: dopo una scrittura della persona il conteggio si rilegge SUBITO (prima la finestra di 15 s del giro
 *   periodico lo lasciava vecchio: «2 note» nella pagina, «Note 1» nella barra).
 * Le risposte di `/api/v1/me/…` sono simulate qui: la prova guarda che cosa chiede la pagina e che cosa mostra, non i dati del
 * server di prova; ogni altra scrittura verso l'API si ferma e si conta.
 */
test.use({ locale: 'it-IT' });

const nota = (id, titolo) => ({ id, titolo, contenuto: `contenuto di ${titolo}`, formato: 'testo', origine: 'persona', creataAlle: '2026-10-08T20:00:00.000Z', aggiornataAlle: '2026-10-08T20:00:00.000Z' });

async function apri(page) {
  const stato = {
    note: [nota('n1', 'Prima nota'), nota('n2', 'Seconda nota')],
    attivita: [{ id: 't1', titolo: 'Da fare', descrizione: '', priorita: 'normal', stato: 'todo', aggiornataAlle: '2026-10-08T20:00:00.000Z' }],
    memorie: [{ id: 'm1', titolo: 'Tema', contenuto: 'scuro', genere: 'preference', aggiornataAlle: '2026-10-08T20:00:00.000Z' }],
    richieste: [], scrittureAltrove: [],
  };
  await page.addInitScript(() => {
    try { localStorage.setItem('talos.desktop.workspace.v2', JSON.stringify({ version: 2, density: 'compact', restoreWorkspace: false, lastSession: null })); } catch {}
  });
  await page.route('**/api/v1/**', async (route) => {
    const r = route.request();
    const percorso = new URL(r.url()).pathname;
    const me = /^\/api\/v1\/me\/(notes|tasks|memory)$/.exec(percorso);
    if (me) {
      stato.richieste.push(`${r.method()} ${percorso}`);
      const campo = { notes: 'note', tasks: 'attivita', memory: 'memorie' }[me[1]];
      if (r.method() === 'GET') return route.fulfill({ json: { ok: true, data: { [campo]: stato[campo], errore: null } } });
      if (r.method() === 'POST' && me[1] === 'notes') {
        const corpo = r.postDataJSON();
        const nuova = nota(`n${stato.note.length + 1}`, corpo.titolo);
        stato.note = [nuova, ...stato.note];
        return route.fulfill({ status: 201, headers: { Location: `/api/v1/me/notes/${nuova.id}` }, json: { ok: true, data: { nota: nuova } } });
      }
    }
    if (/^\/api\/v1\/me\/notes\/[^/]+$/.test(percorso) && r.method() === 'GET') {
      const id = percorso.split('/').pop();
      return route.fulfill({ json: { ok: true, data: { nota: stato.note.find((n) => n.id === id) } } });
    }
    if (r.method() !== 'GET') { stato.scrittureAltrove.push(`${r.method()} ${percorso}`); return route.abort(); }
    return route.fallback();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState?.sessionId ?? null), 'nessuna sessione aperta').toBeNull();
  return stato;
}
const voceNav = (page, nome) => page.locator('.talos-nav-item', { hasText: new RegExp(`^\\s*${nome}\\s*\\d*\\s*$`, 'u') }).first();

test('SENZA-SESSIONE-01 — Note, Attività e Memoria leggono le rotte personali e mostrano ciò che c\'è, coi conteggi nella barra', async ({ page }) => {
  const stato = await apri(page);
  await expect.poll(() => voceNav(page, 'Note').innerText()).toMatch(/2/u);
  await expect(voceNav(page, 'Attività')).toContainText('1');
  await expect(voceNav(page, 'Memoria')).toContainText('1');
  await voceNav(page, 'Note').click();
  await expect(page.locator('#schermoNote')).toContainText('Prima nota');
  await expect(page.locator('#schermoNote')).toContainText('Seconda nota');
  await expect(page.locator('#schermoNote')).not.toContainText('Apri una sessione');
  await voceNav(page, 'Attività').click();
  await expect(page.locator('#schermoAttivita')).toContainText('Da fare');
  await voceNav(page, 'Memoria').click();
  await expect(page.locator('#schermoMemoria')).toContainText('Tema');
  for (const r of ['GET /api/v1/me/notes', 'GET /api/v1/me/tasks', 'GET /api/v1/me/memory']) expect(stato.richieste, r).toContain(r);
  expect(stato.scrittureAltrove).toEqual([]);
});

test('SENZA-SESSIONE-02 — «Nuova nota» senza sessione scrive su /api/v1/me/notes, e la barra si aggiorna SUBITO', async ({ page }) => {
  const stato = await apri(page);
  await voceNav(page, 'Note').click();
  await expect(page.locator('#schermoNote')).toContainText('Seconda nota');
  await expect.poll(() => voceNav(page, 'Note').innerText()).toMatch(/2/u);
  await page.getByRole('button', { name: 'Nuova nota', exact: true }).first().click();
  await page.locator('[name="titolo"]:visible').first().fill('Scritta senza sessione');
  await page.locator('[name="contenuto"]:visible').first().fill('dal pulsante');
  await page.getByRole('button', { name: 'Salva', exact: true }).last().click();
  await expect.poll(() => stato.richieste.filter((x) => x === 'POST /api/v1/me/notes').length).toBe(1);
  await expect(page.locator('#schermoNote')).toContainText('Scritta senza sessione');
  await expect.poll(() => voceNav(page, 'Note').innerText(), { timeout: 5_000 }).toMatch(/3/u);
  expect(stato.scrittureAltrove).toEqual([]);
});
