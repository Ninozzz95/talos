import { test, expect } from '@playwright/test';

/*
 * F6-1 (26/09/2026) — la scheda «GitHub», parte locale (`components/scheda-github.js`, collegata in `legacy/app.js`).
 * Il servizio git vero ha le sue prove su repository veri (`tests/git-service-f6.test.mjs`, `tests/http-routes-git.test.mjs`);
 * qui si prova la scheda: che parli con le rotte giuste, con i corpi giusti, e che disegni ciò che il server risponde.
 * ⛔ Le rotte git della sessione finta rispondono con la FORMA delle buste vere (`http-app.mjs` `successEnvelope`/`errorEnvelope`),
 *   e le richieste di scrittura si fermano qui (fulfill): niente arriva al server di prova. Ogni altra non-GET si conta.
 * Server di prova (porta 4176).
 */
const SESSIONE = 'scheda-github';
const CONFINE = `data: ${JSON.stringify({ type: 'CUSTOM', name: 'talos.fine-rigiocata' })}\n\n`;
const busta = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data, meta: { schema: 'talos.api.v1' } }) });
const bustaErrore = (status, code, message) => ({ status, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code, message, title: message }, meta: { schema: 'talos.api.v1' } }) });

const DIFF_A = [
  'diff --git a/src/app.js b/src/app.js',
  'index 1111111..2222222 100644',
  '--- a/src/app.js',
  '+++ b/src/app.js',
  '@@ -10,3 +10,4 @@ function avvia() {',
  ' const a = 1;',
  '-const b = 2;',
  '+const b = 3;',
  '+const c = 4;',
  ' return a;',
  '',
].join('\n');

/** Un git finto e piccolo, con la stessa forma di `git-service.mjs`: lo stato cambia con le azioni, e ogni corpo si registra. */
function gitFinto() {
  const voci = [
    { percorso: 'src/app.js', x: ' ', y: 'M', tipo: 'modificato', staged: false, nonStaged: true, conflitto: false, cartella: false, repoAnnidato: false, da: null },
    { percorso: 'README.md', x: 'M', y: ' ', tipo: 'modificato', staged: true, nonStaged: false, conflitto: false, cartella: false, repoAnnidato: false, da: null },
    { percorso: 'note.txt', x: '?', y: '?', tipo: 'nonTracciato', staged: false, nonStaged: true, conflitto: false, cartella: false, repoAnnidato: false, da: null },
  ];
  const f = { voci, impronta: 'impronta-1', corpi: [], rispostaCommit: null, repo: true, letture: [], risposte: {} };
  // ⭐ F6-1 passo 3: rami, storia, messi da parte — stesse forme di `git-service.mjs` (`rami`, `storia`, `accantonati`)
  f.base = { commit: 'abc1234def5678', breve: 'abc1234', soggetto: 'Primo commit' };
  f.ramo = 'lavoro/f6';
  f.rami = ['lavoro/f6', 'main', 'vecchio'];
  f.ultimoMessaggio = 'Primo commit\n\nCon un corpo di due righe.';
  f.storia = [
    { commit: 'abc1234def5678', breve: 'abc1234', autore: 'Prova', data: new Date(Date.now() - 3 * 3600_000).toISOString(), genitori: 1, padri: ['9999999aaaaaaa'], soggetto: 'Primo commit', inviato: false },
    { commit: '9999999aaaaaaa', breve: '9999999', autore: 'Prova', data: new Date(Date.now() - 4 * 86400_000).toISOString(), genitori: 0, padri: [], soggetto: 'Radice del progetto', inviato: true },
  ];
  // ⭐ F6-2 passo 3: HEAD, la punta del remoto, il suo nome e la base comune (`storia` del servizio) — qui in pari con origin
  f.storiaRif = { testa: 'abc1234def5678', remoto: 'abc1234def5678', nomeRemoto: 'origin/lavoro/f6', baseComune: 'abc1234def5678' };
  f.accantonati = [];
  // ⭐ F6-2 (27/09): la sincronizzazione, stessa forma di `git-service.mjs` `sincronizzazione` — in pari con origin, mai recuperato
  f.sinc = {
    ramo: 'lavoro/f6', staccata: false,
    remoti: [{ nome: 'origin', url: 'git@github.com:esempio/progetto.git', urlInvio: null }],
    riferimento: { corto: 'origin/lavoro/f6', remoto: 'origin', ramo: 'lavoro/f6' },
    avanti: 0, indietro: 0, riferimentoSparito: false, remotoPerInvio: 'origin', ultimoRecupero: null, recuperoInCorso: false,
  };
  f.attesaRecupero = null; // una promessa: il recupero finto resta «in volo» finché la prova non la scioglie
  // ⭐ F6-2 passo 4: le modifiche di un commit del grafo — stessa forma di `git-service.mjs` `modificheFra`/`diffFra`
  f.confronti = [];
  f.modificheDi = (da, a) => ({
    da: da ?? '9999999aaaaaaa', a, daVuoto: a === '9999999aaaaaaa',
    file: [{ stato: 'M', prima: null, percorso: 'src/app.js' }, { stato: 'R', prima: 'docs/vecchio.md', percorso: 'docs/nuovo.md' }],
    fuori: da ? 2 : 0, altri: false,
  });
  f.stato = () => ({
    radiceRepo: 'C:/progetto', prefisso: '', cartellaEradiceRepo: true, voci: f.voci,
    riepilogo: { totale: f.voci.length, staged: f.voci.filter((v) => v.staged).length, nonStaged: 0, nonTracciati: 0, conflitti: 0 },
    base: f.base, impronta: f.impronta, preparatiFuori: 0,
  });
  return f;
}

async function preparaPagina(page, { larghezza = 1440, altezza = 900, tema = 'dark', lingua = 'it', f = gitFinto() } = {}) {
  const contatore = { nonGet: 0 };
  await page.setViewportSize({ width: larghezza, height: altezza });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage } }));
  }, { colorMode: tema, uiLanguage: lingua });
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (p.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
    if (p.startsWith(`/api/v1/sessions/${SESSIONE}/git/`)) {
      const azione = p.split('/').pop();
      if (req.method() === 'GET') {
        if (!f.repo) return route.fulfill(bustaErrore(409, 'GIT_NOT_A_REPOSITORY', 'Questa cartella non è un repository git'));
        f.letture.push(azione);
        if (azione === 'status') return route.fulfill(busta(f.stato()));
        if (azione === 'branch') return route.fulfill(busta({ ramo: f.ramo, staccata: false }));
        if (azione === 'branches') return route.fulfill(busta({ rami: f.rami.map((nome) => ({ nome, commit: 'abc1234', riferimento: null, corrente: nome === f.ramo })) }));
        if (azione === 'log') return route.fulfill(busta({ commit: f.storia, altri: false, ultimoMessaggio: f.ultimoMessaggio, ...(f.storiaRif ?? {}) }));
        if (azione === 'stashes') return route.fulfill(busta({ accantonati: f.accantonati }));
        if (azione === 'sync') return route.fulfill(busta(f.sinc));
        if (azione === 'changes' || azione === 'changes-diff') {
          const q = Object.fromEntries(url.searchParams);
          f.confronti.push({ azione, ...q });
          const m = f.modificheDi(q.da ?? null, q.a);
          if (azione === 'changes') return route.fulfill(busta(m));
          // una risposta del diff si può TRATTENERE (la prova della corsa): arriva quando la prova la scioglie
          if (f.trattieni && f.trattieni.da === (q.da ?? null)) await f.trattieni.promessa;
          return route.fulfill(busta({ percorso: q.percorso, prima: q.prima ?? null, da: m.da, a: q.a, daVuoto: m.daVuoto, testo: DIFF_A, troncato: false, binario: false, impronta: 'impronta-confronto' }));
        }
        if (azione === 'diff') return route.fulfill(busta({ percorso: url.searchParams.get('percorso'), area: url.searchParams.get('area'), base: f.stato().base, testo: DIFF_A, troncato: false, binario: false, impronta: `impronta-diff-${f.letture.filter((a) => a === 'diff').length}` }));
      }
      const corpo = JSON.parse(req.postData() || '{}');
      f.corpi.push({ azione, corpo });
      // una risposta preparata dalla prova (un rifiuto per nome) vale UNA volta
      if (f.risposte[azione]?.length) return route.fulfill(f.risposte[azione].shift());
      if (azione === 'hunk') return route.fulfill(busta({ ok: true, stato: f.stato() }));
      // ⭐ F6-2: il remoto finto
      if (azione === 'fetch-stop') { f.fermato = true; f.sciogliRecupero?.(); return route.fulfill(busta({ ok: true, fermato: true })); }
      if (azione === 'fetch') {
        if (f.attesaRecupero) await f.attesaRecupero;
        if (f.fermato) return route.fulfill(bustaErrore(409, 'GIT_ABORTED', 'Fermato'));
        f.sinc = { ...f.sinc, ultimoRecupero: new Date(Date.now() - 1000).toISOString() };
        return route.fulfill(busta({ ok: true, remoto: 'origin', sincronizzazione: f.sinc }));
      }
      if (azione === 'pull') {
        f.sinc = { ...f.sinc, indietro: 0 };
        return route.fulfill(busta({ ok: true, conflitti: 0, commitPrima: 'abc1234def5678', commitDopo: 'bbbb2222cccc', stato: f.stato(), sincronizzazione: f.sinc }));
      }
      if (azione === 'push') {
        const pubblicato = !f.sinc.riferimento;
        const remoto = corpo.remoto ?? f.sinc.riferimento?.remoto;
        f.sinc = { ...f.sinc, avanti: 0, riferimento: { corto: `${remoto}/${f.sinc.ramo}`, remoto, ramo: f.sinc.ramo } };
        return route.fulfill(busta({ ok: true, remoto, ramo: f.sinc.ramo, pubblicato, esiti: [{ flag: pubblicato ? '*' : ' ', da: `refs/heads/${f.sinc.ramo}`, a: `refs/heads/${f.sinc.ramo}`, riepilogo: '' }], sincronizzazione: f.sinc }));
      }
      if (azione === 'commit-message') return route.fulfill(busta({ messaggio: 'Add the GitHub tab\n\nWith one body line.', area: 'preparato', troncato: false, modello: 'z-ai/glm-5.3-flash' }));
      if (azione === 'switch') { f.ramo = corpo.ramo; return route.fulfill(busta({ ok: true, ramo: corpo.ramo, stato: f.stato() })); }
      if (azione === 'branch-create') { f.rami.push(corpo.ramo); f.ramo = corpo.ramo; return route.fulfill(busta({ ok: true, ramo: corpo.ramo, stato: f.stato() })); }
      if (azione === 'branch-rename') { f.rami = f.rami.map((r) => (r === corpo.da ? corpo.a : r)); if (f.ramo === corpo.da) f.ramo = corpo.a; return route.fulfill(busta({ ok: true, rami: [] })); }
      if (azione === 'branch-delete') { f.rami = f.rami.filter((r) => r !== corpo.ramo); return route.fulfill(busta({ ok: true, rami: [] })); }
      if (azione === 'amend') { f.base = { commit: 'a11a11a11a11', breve: 'a11a11a', soggetto: corpo.messaggio.split('\n')[0] }; f.voci = f.voci.filter((v) => !v.staged); f.impronta = 'impronta-dopo-la-modifica'; return route.fulfill(busta({ ok: true, commit: 'a11a11a11a11', stato: f.stato() })); }
      if (azione === 'undo-commit') { f.base = { commit: '9999999aaaaaaa', breve: '9999999', soggetto: 'Radice del progetto' }; return route.fulfill(busta({ ok: true, messaggio: f.ultimoMessaggio, stato: f.stato() })); }
      if (azione === 'stash') { f.accantonati = [{ indice: 0, commit: 'st45h000', data: new Date().toISOString(), messaggio: `On ${f.ramo}: ${corpo.messaggio}` }, ...f.accantonati.map((v) => ({ ...v, indice: v.indice + 1 }))]; f.voci = f.voci.filter((v) => v.tipo === 'nonTracciato' && !corpo.conNuovi); return route.fulfill(busta({ ok: true, accantonati: f.accantonati, stato: f.stato() })); }
      if (azione === 'stash-pop' || azione === 'stash-drop') { f.accantonati = f.accantonati.filter((v) => v.commit !== corpo.commit).map((v, i) => ({ ...v, indice: i })); return route.fulfill(busta({ ok: true, accantonati: f.accantonati, ...(azione === 'stash-pop' ? { stato: f.stato() } : {}) })); }
      if (azione === 'stage') {
        for (const v of f.voci) if (corpo.percorsi.includes(v.percorso)) { v.staged = true; v.nonStaged = false; v.x = v.tipo === 'nonTracciato' ? 'A' : 'M'; v.y = ' '; if (v.tipo === 'nonTracciato') v.tipo = 'aggiunto'; }
        f.impronta = `impronta-${f.corpi.length + 1}`;
        return route.fulfill(busta({ ok: true, percorsi: corpo.percorsi, stato: f.stato() }));
      }
      if (azione === 'unstage') {
        for (const v of f.voci) if (corpo.percorsi.includes(v.percorso)) { v.staged = false; v.nonStaged = true; v.y = 'M'; v.x = ' '; }
        f.impronta = `impronta-${f.corpi.length + 1}`;
        return route.fulfill(busta({ ok: true, percorsi: corpo.percorsi, stato: f.stato() }));
      }
      if (azione === 'discard') {
        f.voci = f.voci.filter((v) => !corpo.percorsi.includes(v.percorso) || v.staged);
        return route.fulfill(busta({ ok: true, riportati: [], eliminati: corpo.percorsi, stato: f.stato() }));
      }
      if (azione === 'commit-staged') {
        if (f.rispostaCommit) return route.fulfill(f.rispostaCommit);
        f.voci = f.voci.filter((v) => !v.staged);
        f.impronta = 'impronta-dopo-il-commit';
        return route.fulfill(busta({ ok: true, commit: 'fedcba9876543210', stato: f.stato() }));
      }
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'GitHub', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  // la colonna destra aperta, scheda GitHub
  await page.evaluate(() => { if (document.querySelector('#app')?.classList.contains('inspector-collapsed')) document.querySelector('[data-azione="dettagli"]')?.click(); });
  // sotto i 1240 px la colonna è flottante e parte chiusa: si apre dal pulsante «Dettagli» della chat (come `badge-schede.spec.mjs`)
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="github"]').click();
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  return { contatore, f };
}

const riga = (page, percorso, gruppo) => page.locator(`#railGithub .talos-github-gruppo[data-gruppo="${gruppo}"] .talos-github-riga[data-percorso="${percorso}"]`);

for (const tema of ['dark', 'light']) {
  test(`GITHUB-01 — la scheda dopo File: ramo, base dichiarata, i gruppi coi conteggi e le lettere (${tema})`, async ({ page }) => {
    const { contatore } = await preparaPagina(page, { tema });
    const schede = await page.locator('#railTabs [role="tab"]').allTextContents();
    expect(schede.map((s) => s.trim()).slice(0, 3)).toEqual(['Contesto', 'File', 'Git']); // A22 (owner 09/10): la scheda si chiama Git
    await expect(page.locator('#railGithub .talos-github__testa')).toContainText('lavoro/f6');
    await expect(page.locator('#railGithub .talos-github__base')).toHaveText('Confronto con l’ultimo commit abc1234 — Primo commit');
    // F6-1 passo 3: in coda c'è «Commit recenti», chiuso e senza conteggio finché non si legge (decisione dell'owner: la storia in F6-1)
    const gruppi = await page.locator('#railGithub .talos-github-gruppo').evaluateAll((g) => g.map((n) => `${n.dataset.gruppo}:${n.querySelector('.talos-github-gruppo__conto')?.textContent ?? '—'}`));
    // F6-3 (27/09): «Pull request» prima di «Commit recenti», chiuso anche lui e senza conteggio finché GitHub non si legge
    expect(gruppi).toEqual(['preparati:1', 'modificati:1', 'nuovi:1', 'pr:—', 'storia:—']);
    await expect(riga(page, 'src/app.js', 'modificati').locator('.talos-github-riga__lettera')).toHaveText('M');
    await expect(riga(page, 'note.txt', 'nuovi').locator('.talos-github-riga__lettera')).toHaveText('U');
    await expect(page.locator('#railGithub .talos-github-commit__fai')).toHaveText('Committa 1 file preparato');
    await expect(page.locator('#railGithub .talos-github-commit__fai')).toBeDisabled();
    await page.screenshot({ path: `artifacts/scheda-github-1440-${tema}.png` });
    expect(contatore.nonGet).toBe(0);
  });
}

test('GITHUB-02 — un clic su una riga apre il diff nel rail: pezzi a parole, righe numerate, e si torna all\'elenco sulla stessa riga', async ({ page }) => {
  const { contatore } = await preparaPagina(page);
  await riga(page, 'src/app.js', 'modificati').locator('.talos-github-riga__apri').click();
  const diff = page.locator('#railGithub .talos-github-diff');
  await expect(diff).toBeVisible();
  await expect(diff.locator('.talos-lettore__nome')).toHaveText('app.js');
  await expect(diff.locator('.talos-lettore__meta')).toHaveText('Da preparare · src');
  await expect(diff.locator('.talos-diff-chat__righe')).toHaveText('righe 10-13');
  await expect(diff.locator('.talos-diff__line--add')).toHaveCount(2);
  await expect(diff.locator('.talos-diff__line--del')).toHaveCount(1);
  expect(await diff.locator('.talos-diff').textContent()).not.toContain('@@');
  await page.screenshot({ path: 'artifacts/scheda-github-diff-1440-dark.png' });
  // ⛔ Una carta sola (foto sul 4174, 26/09): la base rientra come le intestazioni dei pezzi, il diff non ha un secondo bordo.
  const cornice = await diff.locator('.talos-github-diff__corpo').evaluate((corpo) => {
    const testo = document.createRange();
    testo.selectNodeContents(corpo.querySelector('.talos-github__base'));
    const pezzi = getComputedStyle(corpo.querySelector('.talos-diff-chat'));
    return { rientro: testo.getBoundingClientRect().left - corpo.getBoundingClientRect().left, lati: `${pezzi.borderLeftWidth}|${pezzi.borderRightWidth}`, sopra: pezzi.borderTopWidth };
  });
  expect(cornice.rientro).toBeGreaterThanOrEqual(8);
  expect(cornice.lati).toBe('0px|0px');
  expect(cornice.sopra).toBe('1px');
  await diff.locator('.talos-github-diff__indietro').click();
  await expect(page.locator('#railGithub .talos-github')).toBeVisible();
  await expect(riga(page, 'src/app.js', 'modificati').locator('.talos-github-riga__apri')).toBeFocused();
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-03 — Prepara e Togli mandano percorsi ESPLICITI e la scheda disegna lo stato che torna', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  await riga(page, 'src/app.js', 'modificati').hover();
  await riga(page, 'src/app.js', 'modificati').getByRole('button', { name: 'Prepara', exact: true }).click();
  await expect(riga(page, 'src/app.js', 'preparati')).toBeVisible();
  expect(f.corpi.at(-1)).toEqual({ azione: 'stage', corpo: { percorsi: ['src/app.js'] } });
  await expect(page.locator('#railGithub .talos-github-commit__fai')).toHaveText('Committa 2 file preparati');
  await page.locator('#railGithub .talos-github-gruppo[data-gruppo="preparati"] .talos-github-gruppo__testa').getByRole('button', { name: 'Togli tutti' }).click();
  await expect(page.locator('#railGithub .talos-github-gruppo[data-gruppo="preparati"]')).toHaveCount(0);
  expect(f.corpi.at(-1).azione).toBe('unstage');
  expect(f.corpi.at(-1).corpo.percorsi.sort()).toEqual(['README.md', 'src/app.js']);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-04 — il commit manda il messaggio e l\'impronta vista; l\'impronta cambiata è un avviso con le parole del server e si rilegge', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  const campo = page.locator('#railGithub .talos-github-commit__messaggio');
  const pulsante = page.locator('#railGithub .talos-github-commit__fai');
  f.rispostaCommit = bustaErrore(409, 'GIT_STAGED_CHANGED', 'Ciò che è preparato è cambiato: guarda di nuovo e riprova');
  await campo.fill('Il messaggio');
  await expect(pulsante).toBeEnabled();
  await pulsante.click();
  await expect(page.locator('#regioneToast')).toContainText('Ciò che è preparato è cambiato');
  expect(f.corpi.at(-1)).toEqual({ azione: 'commit-staged', corpo: { messaggio: 'Il messaggio', impronta: 'impronta-1' } });
  f.rispostaCommit = null;
  await pulsante.click();
  await expect(page.locator('#regioneToast')).toContainText('Commit fatto');
  await expect(page.locator('#regioneToast')).toContainText('fedcba9 · Il messaggio');
  await expect(campo).toHaveValue('');
  await expect(page.locator('#railGithub .talos-github-gruppo[data-gruppo="preparati"]')).toHaveCount(0);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-05 — niente di preparato: il pulsante lo dice, chiede, prepara TUTTO per nome e poi committa', async ({ page }) => {
  const f = gitFinto();
  f.voci = f.voci.filter((v) => !v.staged);
  const { contatore } = await preparaPagina(page, { f });
  const pulsante = page.locator('#railGithub .talos-github-commit__fai');
  await expect(pulsante).toHaveText('Prepara tutto e committa');
  await page.locator('#railGithub .talos-github-commit__messaggio').fill('Tutto');
  await pulsante.click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('Preparo tutti i 2 file e li committo?');
  await dialogo.getByRole('button', { name: 'Prepara tutto e committa' }).click();
  await expect(page.locator('#regioneToast')).toContainText('Commit fatto');
  expect(f.corpi.map((c) => c.azione)).toEqual(['stage', 'commit-staged']);
  expect(f.corpi[0].corpo.percorsi.sort()).toEqual(['note.txt', 'src/app.js']);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-06 — annullare passa da «⋯» o dal tasto destro, chiede coi NOMI, e «Non ora» non tocca niente', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  await riga(page, 'note.txt', 'nuovi').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Annulla le modifiche' }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('Annullare le modifiche a 1 file?');
  await expect(dialogo).toContainText('Si elimina');
  await expect(dialogo).toContainText('note.txt');
  await dialogo.getByRole('button', { name: 'Non ora' }).click();
  expect(f.corpi.filter((c) => c.azione === 'discard')).toHaveLength(0);
  await riga(page, 'note.txt', 'nuovi').hover();
  await riga(page, 'note.txt', 'nuovi').getByRole('button', { name: /Altre azioni su note\.txt/u }).click();
  // il menu non ripete l'azione che sta già in riga
  await expect(page.getByRole('menuitem', { name: 'Prepara' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Annulla le modifiche' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annulla le modifiche' }).click();
  await expect(page.locator('#railGithub .talos-github-gruppo[data-gruppo="nuovi"]')).toHaveCount(0);
  expect(f.corpi.at(-1)).toEqual({ azione: 'discard', corpo: { percorsi: ['note.txt'] } });
  expect(contatore.nonGet).toBe(0);
});

/**
 * ⭐ 28/09/2026 — la cartella che non è un repository non è più un vicolo cieco: la scheda offre «Inizializza repository», come
 * la vista vuota di VS Code (owner: «un pulsante come fa esattamente VS Code, anche se non hai effettuato accesso a GitHub»).
 * Il server finto diventa un repository SOLO dopo la POST `init`: se la scheda non la manda, l'elenco non compare.
 */
async function paginaNonRepository(page, { tema = 'dark', larghezza = 1440, primaRisposta = null } = {}) {
  const f = gitFinto();
  f.repo = false;
  f.init = [];
  const contatore = { nonGet: 0 };
  await page.setViewportSize({ width: larghezza, height: 900 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript((colorMode) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
  }, tema);
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p.endsWith(`/sessions/${SESSIONE}/events`)) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
    if (p.startsWith(`/api/v1/sessions/${SESSIONE}/git/`)) {
      const azione = p.split('/').pop();
      if (req.method() === 'POST' && azione === 'init') {
        const corpo = JSON.parse(req.postData() || '{}');
        f.init.push(corpo);
        if (primaRisposta && corpo.conferma !== true) return route.fulfill(primaRisposta); // il server vuole il sì finché non arriva
        f.repo = true;
        f.voci = [{ percorso: 'leggimi.md', x: '?', y: '?', tipo: 'nonTracciato', staged: false, nonStaged: true, conflitto: false, cartella: false, repoAnnidato: false, da: null }];
        f.base = null;
        return route.fulfill(busta({ ok: true, ramo: 'main', stato: f.stato() }));
      }
      if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
      if (!f.repo) return route.fulfill(bustaErrore(409, 'GIT_NOT_A_REPOSITORY', 'Questa cartella non è un repository git'));
      if (azione === 'status') return route.fulfill(busta(f.stato()));
      if (azione === 'branch') return route.fulfill(busta({ ramo: 'main', staccata: false }));
      if (azione === 'stashes') return route.fulfill(busta({ accantonati: [] }));
      if (azione === 'sync') return route.fulfill(busta({ ramo: 'main', remoti: [], riferimento: null, avanti: 0, indietro: 0, ultimoRecupero: null }));
      return route.fulfill(busta({}));
    }
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'GitHub', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SESSIONE);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  // sotto i 1240 px la colonna è flottante e parte chiusa: si apre dal pulsante «Dettagli», come in `preparaPagina`
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="github"]').click();
  return { f, contatore };
}

test('GITHUB-07 — una cartella che non è un repository offre «Inizializza repository», e dopo il clic la scheda è un repository', async ({ page }) => {
  const { f, contatore } = await paginaNonRepository(page);
  const carta = page.locator('#railGithub [data-c="InizializzaRepository"]');
  await expect(carta).toBeVisible();
  await expect(carta).toContainText('Nessun repository git');
  await expect(carta).toContainText('non serve un account GitHub');
  await expect(page.locator('#railGithub .talos-github__testa')).toHaveCount(0);
  expect(f.init).toEqual([]);
  await carta.getByRole('button', { name: 'Inizializza repository' }).click();
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  await expect(page.locator('#railGithub [data-c="InizializzaRepository"]')).toHaveCount(0);
  await expect(page.locator('#railGithub .talos-github__ramo')).toContainText('main');
  await expect(page.locator('#railGithub')).toContainText('leggimi.md');
  expect(f.init).toEqual([{}]);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-07b — la cartella che contiene quella utente chiede conferma, come VS Code; «Non ora» non manda niente', async ({ page }) => {
  const { f } = await paginaNonRepository(page, { primaRisposta: bustaErrore(409, 'GIT_INIT_NEEDS_CONFIRM', 'La cartella contiene la tua cartella utente: serve una conferma') });
  const carta = page.locator('#railGithub [data-c="InizializzaRepository"]');
  await carta.getByRole('button', { name: 'Inizializza repository' }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('Inizializzare un repository qui?');
  await dialogo.getByRole('button', { name: 'Non ora' }).click();
  await expect(dialogo).toHaveCount(0);
  expect(f.init).toEqual([{}]);
  await expect(carta).toBeVisible();
  await carta.getByRole('button', { name: 'Inizializza repository' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Inizializza repository' }).click();
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  expect(f.init).toEqual([{}, {}, { conferma: true }]);
});

for (const [larghezza, tema] of [[1440, 'dark'], [1024, 'light'], [1440, 'light'], [1024, 'dark']]) {
  test(`GITHUB-07-FOTO — «Inizializza repository», per l’occhio (${larghezza}, ${tema})`, async ({ page }) => {
    await paginaNonRepository(page, { larghezza, tema });
    const carta = page.locator('#railGithub [data-c="InizializzaRepository"]');
    await expect(carta).toBeVisible();
    const colonna = await page.locator('#railGithub').boundingBox();
    const box = await carta.boundingBox();
    expect(box.x + box.width, 'la carta sta nella colonna').toBeLessThanOrEqual(colonna.x + colonna.width + 0.5);
    await page.locator('#regioneToast').evaluate((n) => { n.style.visibility = 'hidden'; });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `artifacts/scheda-github-init-${larghezza}-${tema}.png` });
    await carta.screenshot({ path: `artifacts/scheda-github-init-carta-${larghezza}-${tema}.png` });
  });
}

test('GITHUB-08 — «Schermo intero» porta il diff nell\'area della chat, e torna nel rail sulla stessa scheda', async ({ page }) => {
  const { contatore } = await preparaPagina(page);
  await riga(page, 'src/app.js', 'modificati').locator('.talos-github-riga__apri').click();
  await page.locator('#railGithub .talos-github-diff').getByRole('button', { name: 'Schermo intero' }).click();
  const schermo = page.locator('[data-view="chat"] > .talos-github-schermo');
  await expect(schermo).toBeVisible();
  await expect(schermo.locator('.talos-diff__line--add')).toHaveCount(2);
  // il rail non resta vuoto: rimette l'elenco, come il lettore rimette l'albero, e un altro file si apre nello stesso posto
  await page.evaluate(() => { if (document.querySelector('#app')?.classList.contains('inspector-collapsed')) document.querySelector('[data-azione="dettagli"]')?.click(); });
  await expect(page.locator('#railGithub .talos-github')).toBeVisible();
  await riga(page, 'README.md', 'preparati').locator('.talos-github-riga__apri').click();
  await expect(schermo.locator('.talos-lettore__nome')).toHaveText('README.md');
  await expect(schermo.locator('.talos-lettore__meta')).toHaveText('Preparato');
  await page.screenshot({ path: 'artifacts/scheda-github-schermo-1440-dark.png' });
  await schermo.getByRole('button', { name: 'Esci dallo schermo intero' }).click();
  await expect(page.locator('[data-view="chat"] > .talos-github-schermo')).toHaveCount(0);
  await expect(page.locator('#railGithub .talos-github-diff')).toBeVisible();
  await expect(page.locator('#railTabs [data-rail="github"]')).toHaveAttribute('aria-selected', 'true');
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-09 — con l\'interfaccia in inglese la scheda parla inglese (gruppi, pulsanti, base)', async ({ page }) => {
  const { contatore } = await preparaPagina(page, { lingua: 'en' });
  await expect(page.locator('#railGithub .talos-github__base')).toHaveText('Compared with the last commit abc1234 — Primo commit');
  const titoli = await page.locator('#railGithub .talos-github-gruppo__titolo span:not(.talos-github-gruppo__conto)').allTextContents();
  expect(titoli).toEqual(['Staged', 'Changes', 'Untracked', 'Pull requests', 'Recent commits']); // F6-3 (27/09): le PR prima della storia // F6-1 passo 3: la storia, chiusa
  await expect(page.locator('#railGithub .talos-github-commit__fai')).toHaveText('Commit 1 staged file');
  await expect(page.locator('#railGithub .talos-github-commit__messaggio')).toHaveAttribute('placeholder', 'Commit message');
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-10 — riaprire una sessione con tre giri legge lo stato UNA volta: il replay non rilegge a ogni giro', async ({ page }) => {
  const SECONDA = 'scheda-github-giri';
  const letture = { status: 0 };
  const giri = [];
  for (let i = 0; i < 3; i += 1) {
    giri.push({ type: 'RunStarted', threadId: 't', runId: `r${i}`, input: { consegna: `Giro ${i}` }, _sequenza: i * 2 + 1 });
    giri.push({ type: 'RunFinished', threadId: 't', runId: `r${i}`, outcome: { type: 'success' }, _sequenza: i * 2 + 2 });
  }
  const corpoEventi = `${giri.map((e) => `data: ${JSON.stringify(e)}

`).join('')}${CONFINE}`;
  // la prima sessione apre la colonna e la scheda GitHub (senza sessione si vede la Home, e la colonna non c'è)
  const { f, contatore } = await preparaPagina(page);
  await page.route(`**/api/v1/sessions/${SECONDA}/**`, async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: corpoEventi });
    if (p.endsWith('/git/status')) { letture.status += 1; return route.fulfill(busta(f.stato())); }
    if (p.endsWith('/git/branch')) return route.fulfill(busta({ ramo: 'seconda', staccata: false }));
    return route.fallback();
  });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Seconda', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SECONDA);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.evaluate(() => { if (document.querySelector('#app')?.classList.contains('inspector-collapsed')) document.querySelector('[data-azione="dettagli"]')?.click(); });
  if ((await page.locator('#railTabs [data-rail="github"]').getAttribute('aria-selected')) !== 'true') await page.locator('#railTabs [data-rail="github"]').click();
  await expect(page.locator('#railGithub .talos-github__testa')).toContainText('seconda');
  await page.waitForTimeout(600); // ogni rilettura in ritardo avrebbe il tempo di partire
  expect(letture.status, 'tre giri nel replay, una lettura sola').toBe(1);
  expect(contatore.nonGet).toBe(0);
});

/* ═══════════════════ F6-1 passo 3 (26/09/2026) — rami, ultimo commit, messi da parte, commit recenti ═══════════════════ */

const corpiDi = (f, azione) => f.corpi.filter((c) => c.azione === azione).map((c) => c.corpo);
const testata = (page) => page.locator('#railGithub .talos-github__testa');
const menuRepository = async (page) => { await testata(page).getByRole('button', { name: 'Altre azioni del repository' }).click(); };

for (const [larghezza, tema] of [[1024, 'dark'], [1440, 'light']]) {
  test(`GITHUB-P3-01 — il ramo è un pulsante: il menu dei rami passa a un altro, e la testata lo dice (${larghezza}, ${tema})`, async ({ page }) => {
    const { f, contatore } = await preparaPagina(page, { larghezza, altezza: larghezza === 1024 ? 800 : 900, tema });
    const ramo = page.locator('#railGithub .talos-github__ramo');
    await expect(ramo).toHaveAccessibleName('Ramo: lavoro/f6');
    await ramo.click();
    await expect(page.getByRole('menuitem').first()).toBeVisible(); // il menu aspetta l'elenco dei rami dal server
    const voci = (await page.getByRole('menuitem').allTextContents()).map((s) => s.trim());
    expect(voci).toEqual(['Passa a main', 'Passa a vecchio', 'Nuovo ramo…', 'Rinomina «lavoro/f6»…', 'Elimina un ramo…']);
    await page.screenshot({ path: `artifacts/scheda-github-rami-${larghezza}-${tema}.png` });
    await page.getByRole('menuitem', { name: 'Passa a main' }).click();
    await expect(ramo).toHaveAccessibleName('Ramo: main');
    expect(corpiDi(f, 'switch')).toEqual([{ ramo: 'main' }]);
    // la fila delle cinque schede resta dentro la colonna (owner: «margine 10 px + scorrimento»)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(contatore.nonGet).toBe(0);
  });
}

test('GITHUB-P3-02 — il nome di un ramo si chiede IN RIGA: il rifiuto del server resta lì, Esc chiude solo la richiesta', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page, { larghezza: 1024, altezza: 800 });
  f.risposte['branch-create'] = [bustaErrore(409, 'GIT_BRANCH_EXISTS', 'Esiste già un ramo con questo nome')];
  await page.locator('#railGithub .talos-github__ramo').click();
  await page.getByRole('menuitem', { name: 'Nuovo ramo…' }).click();
  const richiesta = page.locator('#railGithub .talos-github-richiesta');
  await expect(richiesta).toHaveAttribute('aria-label', 'Nuovo ramo da lavoro/f6');
  const campo = richiesta.getByRole('textbox', { name: 'Nome del ramo' });
  await expect(campo).toBeFocused();
  await expect(richiesta.getByRole('button', { name: 'Crea il ramo' })).toBeDisabled();
  await campo.fill('main');
  await campo.press('Enter');
  await expect(richiesta.getByRole('alert')).toHaveText('Esiste già un ramo con questo nome');
  await expect(campo).toBeFocused();
  await expect(campo).toHaveAttribute('aria-invalid', 'true');
  await page.screenshot({ path: 'artifacts/scheda-github-richiesta-1024-dark.png' });
  await campo.fill('prova/nuovo');
  await richiesta.getByRole('button', { name: 'Crea il ramo' }).click();
  await expect(richiesta).toHaveCount(0);
  await expect(page.locator('#railGithub .talos-github__ramo')).toHaveAccessibleName('Ramo: prova/nuovo');
  expect(corpiDi(f, 'branch-create')).toEqual([{ ramo: 'main' }, { ramo: 'prova/nuovo' }]);
  // Esc: si chiude la richiesta, e la colonna resta dov'è
  await page.locator('#railGithub .talos-github__ramo').click();
  await page.getByRole('menuitem', { name: 'Rinomina «prova/nuovo»…' }).click();
  const rinomina = page.locator('#railGithub .talos-github-richiesta').getByRole('textbox', { name: 'Nome nuovo' });
  await expect(rinomina).toHaveValue('prova/nuovo');
  await rinomina.press('Escape');
  await expect(page.locator('#railGithub .talos-github-richiesta')).toHaveCount(0);
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  expect(corpiDi(f, 'branch-rename')).toEqual([]);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-03 — un ramo non unito si elimina solo dopo l\'avviso: «Non ora» non tocca niente, «Elimina lo stesso» manda forza', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  const nonUnito = () => bustaErrore(409, 'GIT_BRANCH_NOT_MERGED', 'Il ramo ha commit che non sono in nessun altro ramo');
  f.risposte['branch-delete'] = [nonUnito(), nonUnito()];
  for (const scelta of ['Non ora', 'Elimina lo stesso']) {
    await page.locator('#railGithub .talos-github__ramo').click();
    await page.getByRole('menuitem', { name: 'Elimina un ramo…' }).click();
    await page.getByRole('menuitem', { name: 'vecchio' }).click();
    const dialogo = page.getByRole('alertdialog');
    await expect(dialogo).toContainText('Eliminare «vecchio» lo stesso?');
    await dialogo.getByRole('button', { name: scelta }).click();
    await expect(dialogo).toHaveCount(0);
  }
  // la richiesta con «forza» parte DOPO che il dialogo si è chiuso: si aspetta, non si fotografa l'istante
  await expect.poll(() => corpiDi(f, 'branch-delete')).toEqual([{ ramo: 'vecchio' }, { ramo: 'vecchio' }, { ramo: 'vecchio', forza: true }]);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-04 — modificare l\'ultimo commit: la casella rimette il messaggio intero e lo dichiara; «Lascia stare» torna com\'era', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page, { larghezza: 1024, altezza: 800 });
  const campo = page.locator('#railGithub .talos-github-commit__messaggio');
  await campo.fill('bozza mia');
  await menuRepository(page);
  await page.getByRole('menuitem', { name: 'Modifica l’ultimo commit' }).click();
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toContainText('Modifichi il commit abc1234');
  await expect(campo).toHaveValue('Primo commit\n\nCon un corpo di due righe.');
  await expect(campo).toBeFocused();
  await expect(page.locator('#railGithub .talos-github-commit__fai')).toHaveText('Modifica il commit e aggiungi 1 file');
  await page.screenshot({ path: 'artifacts/scheda-github-modifica-1024-dark.png' });
  await page.locator('#railGithub .talos-github-commit__modo').getByRole('button', { name: 'Lascia stare' }).click();
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toHaveCount(0);
  await expect(campo).toHaveValue('bozza mia');
  // di nuovo, e questa volta si modifica
  await menuRepository(page);
  await page.getByRole('menuitem', { name: 'Modifica l’ultimo commit' }).click();
  await expect(campo).toHaveValue('Primo commit\n\nCon un corpo di due righe.'); // la modalità legge il messaggio dal server: si aspetta
  await campo.fill('Primo commit, riscritto');
  await page.locator('#railGithub .talos-github-commit__fai').click();
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toHaveCount(0);
  await expect(page.locator('#railGithub .talos-github__base')).toHaveText('Confronto con l’ultimo commit a11a11a — Primo commit, riscritto');
  expect(corpiDi(f, 'amend')).toEqual([{ messaggio: 'Primo commit, riscritto', impronta: 'impronta-1', commit: 'abc1234def5678' }]);
  expect(corpiDi(f, 'commit-staged')).toEqual([]);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-05 — un commit già inviato non entra in modifica né si annulla: lo dice, e non manda niente', async ({ page }) => {
  const f = gitFinto();
  f.storia[0].inviato = true;
  const { contatore } = await preparaPagina(page, { f });
  for (const voce of ['Modifica l’ultimo commit', 'Annulla l’ultimo commit']) {
    await menuRepository(page);
    await page.getByRole('menuitem', { name: voce }).click();
    await expect(page.getByText('L’ultimo commit è già stato inviato').first()).toBeVisible();
  }
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toHaveCount(0);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(f.corpi).toEqual([]);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-06 — annullare l\'ultimo commit chiede coi nomi e rimette il suo messaggio nella casella', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  await menuRepository(page);
  await page.getByRole('menuitem', { name: 'Annulla l’ultimo commit' }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('abc1234 · Primo commit');
  await dialogo.getByRole('button', { name: 'Annulla il commit' }).click();
  await expect(page.locator('#railGithub .talos-github-commit__messaggio')).toHaveValue('Primo commit\n\nCon un corpo di due righe.');
  await expect(page.locator('#railGithub .talos-github__base')).toHaveText('Confronto con l’ultimo commit 9999999 — Radice del progetto');
  expect(corpiDi(f, 'undo-commit')).toEqual([{ commit: 'abc1234def5678' }]);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-07 — mettere da parte, riprendere, scartare: indice E hash, la nota in riga, «Scarta» nel menu e col tasto destro', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page, { larghezza: 1024, altezza: 800 });
  await menuRepository(page);
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  const voci = (await page.getByRole('menuitem').allTextContents()).map((s) => s.trim());
  // F6-1 ✨ (owner 26/09, punto 10): in fondo «Affida il commit all'agente»
  expect(voci).toEqual(['Aggiorna', 'Modifica l’ultimo commit', 'Annulla l’ultimo commit', 'Metti da parte le modifiche', 'Metti da parte con i file nuovi', 'Affida il commit all’agente']);
  await page.getByRole('menuitem', { name: 'Metti da parte le modifiche' }).click();
  const richiesta = page.locator('#railGithub .talos-github-richiesta');
  await expect(richiesta.getByRole('button', { name: 'Metti da parte' })).toBeEnabled(); // la nota è facoltativa
  await richiesta.getByRole('textbox', { name: 'Nota (facoltativa)' }).fill('prima della prova');
  await richiesta.getByRole('textbox', { name: 'Nota (facoltativa)' }).press('Enter');
  const gruppo = page.locator('#railGithub .talos-github-gruppo[data-gruppo="accantonati"]');
  await expect(gruppo.locator('.talos-github-gruppo__conto')).toHaveText('1');
  await expect(gruppo.locator('.talos-github-riga__nome')).toHaveText('prima della prova');
  await expect(gruppo.locator('.talos-github-riga__cartella')).toContainText('su lavoro/f6');
  await page.screenshot({ path: 'artifacts/scheda-github-accantonati-1024-dark.png' });
  expect(corpiDi(f, 'stash')).toEqual([{ messaggio: 'prima della prova', conNuovi: false }]);
  // il tasto destro apre lo stesso menu del «⋯»: solo «Scarta», «Riprendi» sta in riga
  await gruppo.locator('.talos-github-riga').click({ button: 'right' });
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  expect((await page.getByRole('menuitem').allTextContents()).map((s) => s.trim())).toEqual(['Scarta']);
  /* ⛔ Il menu condiviso (`apriMenuAzioni`) si mette in ascolto di Esc in un `setTimeout(0)` dopo essersi aperto, e sotto carico
     Chrome consegna un tasto PRIMA dei timer: nella suite intera Esc è arrivato alla catena della app e ha chiuso la colonna
     flottante a 1024 (26/09, foto del fallimento). Un `setTimeout(0)` accodato qui scatta per forza DOPO quello del menu. */
  await page.evaluate(() => new Promise((fatto) => { setTimeout(fatto, 0); }));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem')).toHaveCount(0);
  // «Scarta» è irreversibile: chiede, coi nomi, e «Non ora» non manda niente
  await gruppo.locator('.talos-github-riga').hover();
  await gruppo.getByRole('button', { name: 'Altre azioni su questa voce' }).click();
  await page.getByRole('menuitem', { name: 'Scarta' }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('prima della prova');
  await dialogo.getByRole('button', { name: 'Non ora' }).click();
  await expect(dialogo).toHaveCount(0);
  expect(corpiDi(f, 'stash-drop')).toEqual([]);
  await gruppo.getByRole('button', { name: 'Riprendi' }).click();
  await expect(gruppo).toHaveCount(0);
  expect(corpiDi(f, 'stash-pop')).toEqual([{ indice: 0, commit: 'st45h000' }]);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-08 — «Commit recenti» è chiuso e non legge niente finché non lo apri; poi dice cosa è solo qui e cosa è inviato', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  const gruppo = page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"]');
  await expect(gruppo.locator('.talos-github-gruppo__titolo')).toHaveAttribute('aria-expanded', 'false');
  expect(f.letture.filter((a) => a === 'log')).toEqual([]);
  await gruppo.locator('.talos-github-gruppo__titolo').click();
  await expect(gruppo.locator('.talos-github-riga')).toHaveCount(2);
  await expect(gruppo.locator('.talos-github-riga').nth(0)).toContainText('Primo commit');
  await expect(gruppo.locator('.talos-github-riga').nth(0).locator('.talos-github-riga__cartella')).toContainText('abc1234 · Prova');
  await expect(gruppo.locator('.talos-github-riga').nth(0).locator('.talos-github-riga__cartella')).toContainText('solo qui');
  await expect(gruppo.locator('.talos-github-riga').nth(1).locator('.talos-github-riga__cartella')).toContainText('inviato');
  await expect(gruppo.locator('.talos-github-gruppo__conto')).toHaveText('2');
  await page.screenshot({ path: 'artifacts/scheda-github-storia-1440-dark.png' });
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-09 — il fuoco sopravvive al ridisegno: un giro che finisce non toglie il cursore a chi scrive il messaggio', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  const campo = page.locator('#railGithub .talos-github-commit__messaggio');
  await campo.click();
  await page.keyboard.type('Messaggio a metà');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  const lettePrima = f.letture.filter((a) => a === 'status').length;
  await page.evaluate(() => {
    const r = window.__talosHarnessUiRuntime;
    r.handleRealEvent({ type: 'RunFinished', threadId: 't', runId: 'fuoco', outcome: { type: 'success' }, _sequenza: 99 }, r.realSessionState.generation);
  });
  await expect.poll(() => f.letture.filter((a) => a === 'status').length).toBeGreaterThan(lettePrima);
  await expect(campo).toBeFocused();
  expect(await campo.evaluate((n) => { const t = /** @type {HTMLTextAreaElement} */ (n); return [t.selectionStart, t.selectionEnd]; })).toEqual([14, 14]);
  await page.keyboard.type('X');
  await expect(campo).toHaveValue('Messaggio a meXtà');
  expect(contatore.nonGet).toBe(0);
});

for (const [larghezza, tema] of [[1024, 'light'], [1440, 'dark'], [1024, 'dark'], [1440, 'light']]) {
  test(`GITHUB-P3-FOTO — tutte le parti nuove insieme, per l'occhio (${larghezza}, ${tema})`, async ({ page }) => {
    const f = gitFinto();
    f.accantonati = [
      { indice: 0, commit: 'st45h001', data: new Date(Date.now() - 20 * 60_000).toISOString(), messaggio: 'On lavoro/f6: prima della prova del ramo nuovo con una nota lunga' },
      { indice: 1, commit: 'st45h002', data: new Date(Date.now() - 2 * 86400_000).toISOString(), messaggio: 'WIP on main: 9999999 Radice del progetto' },
    ];
    f.risposte['branch-create'] = [bustaErrore(422, 'GIT_BRANCH_INVALID', 'Nome di ramo non valido')];
    const { contatore } = await preparaPagina(page, { larghezza, altezza: larghezza === 1024 ? 800 : 900, tema, f });
    /* ⛔ 27/09: con la riga della sincronizzazione (F6-2) il gruppo scende, e il toast «Collegato di nuovo» gli sta sopra — lo
       stream finto si richiude e l'EventSource si ricollega di continuo (4 toast, misurato): il gruppo si apre da tastiera. */
    const titoloStoria = page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"] .talos-github-gruppo__titolo');
    await titoloStoria.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"] .talos-github-riga')).toHaveCount(2);
    await menuRepository(page);
    await page.getByRole('menuitem', { name: 'Modifica l’ultimo commit' }).click();
    await expect(page.locator('#railGithub .talos-github-commit__modo')).toBeVisible();
    await page.locator('#railGithub .talos-github__ramo').click();
    await page.getByRole('menuitem', { name: 'Nuovo ramo…' }).click();
    const campo = page.locator('#railGithub .talos-github-richiesta__campo');
    await campo.fill('nome con spazi');
    await campo.press('Enter');
    await expect(page.locator('#railGithub .talos-github-richiesta__errore')).toHaveText('Nome di ramo non valido');
    // l'errore ha il colore di pericolo del tema, non quello del testo
    const colori = await page.evaluate(() => ({
      errore: getComputedStyle(document.querySelector('.talos-github-richiesta__errore')).color,
      testo: getComputedStyle(document.querySelector('.talos-github-richiesta__titolo')).color,
    }));
    expect(colori.errore).not.toBe(colori.testo);
    // la freccetta del ramo sta accanto al nome, non in fondo alla riga.
    // ⛔ Si misura il TESTO (un Range), non la scatola del nome: una scatola allargata arriva fino alla freccetta anche quando il
    //   testo è lontano, e la prima stesura di questa riga restava verde col difetto a schermo (mutazione U13b, 26/09).
    const ramo = await page.locator('#railGithub .talos-github__ramo').evaluate((b) => {
      const testo = document.createRange();
      testo.selectNodeContents(b.querySelector('.talos-file-head__nome'));
      const freccia = b.querySelector('.i:last-child').getBoundingClientRect();
      return { distanza: Math.round(freccia.left - testo.getBoundingClientRect().right) };
    });
    expect(ramo.distanza).toBeLessThanOrEqual(8);
    await page.mouse.move(5, 5);
    await page.screenshot({ path: `artifacts/scheda-github-passo3-${larghezza}-${tema}.png` });
    await page.locator('#railGithub').evaluate((n) => n.scrollTo(0, n.scrollHeight));
    await page.locator('#railGithub .talos-github-gruppo[data-gruppo="accantonati"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/scheda-github-passo3-coda-${larghezza}-${tema}.png` });
    expect(page.url()).not.toContain('4174');
    expect(contatore.nonGet).toBe(0);
  });
}

test('GITHUB-P3-10 — cambiando sessione non resta niente dell\'altra: né il messaggio, né la richiesta in riga, né la modalità modifica', async ({ page }) => {
  const SECONDA = 'scheda-github-seconda';
  const { f, contatore } = await preparaPagina(page);
  await page.route(`**/api/v1/sessions/${SECONDA}/**`, async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    if (p.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: CONFINE });
    if (p.endsWith('/git/status')) return route.fulfill(busta({ ...f.stato(), base: { commit: 'b0b0b0b0b0', breve: 'b0b0b0b', soggetto: 'Della seconda' } }));
    if (p.endsWith('/git/branch')) return route.fulfill(busta({ ramo: 'seconda', staccata: false }));
    if (p.endsWith('/git/stashes')) return route.fulfill(busta({ accantonati: [] }));
    return route.fallback();
  });
  // nella prima: un messaggio a metà, la modalità modifica e una richiesta in riga aperta
  await page.locator('#railGithub .talos-github-commit__messaggio').fill('messaggio della prima');
  await menuRepository(page);
  await page.getByRole('menuitem', { name: 'Modifica l’ultimo commit' }).click();
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toBeVisible();
  await page.locator('#railGithub .talos-github__ramo').click();
  await page.getByRole('menuitem', { name: 'Nuovo ramo…' }).click();
  await expect(page.locator('#railGithub .talos-github-richiesta')).toBeVisible();
  // la seconda sessione
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Seconda', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SECONDA);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.evaluate(() => { if (document.querySelector('#app')?.classList.contains('inspector-collapsed')) document.querySelector('[data-azione="dettagli"]')?.click(); });
  if ((await page.locator('#railTabs [data-rail="github"]').getAttribute('aria-selected')) !== 'true') await page.locator('#railTabs [data-rail="github"]').click();
  await expect(page.locator('#railGithub .talos-github__ramo')).toHaveAccessibleName('Ramo: seconda');
  await expect(page.locator('#railGithub .talos-github-richiesta')).toHaveCount(0);
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toHaveCount(0);
  await expect(page.locator('#railGithub .talos-github-commit__messaggio')).toHaveValue('');
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-11 — i pezzi: «Prepara il pezzo» manda l\'impronta del diff VISTO e rilegge; «Annulla il pezzo» chiede; un file nuovo non ha pezzi', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  await riga(page, 'src/app.js', 'modificati').locator('.talos-github-riga__apri').click();
  const diff = page.locator('#railGithub .talos-github-diff');
  const comandi = diff.locator('.talos-github-pezzo__comandi');
  await expect(comandi).toHaveCount(1);
  await expect(comandi.getByRole('button', { name: 'Prepara il pezzo: righe 10-13' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/scheda-github-pezzi-1440-dark.png' });
  const lettePrima = f.letture.filter((a) => a === 'diff').length;
  await comandi.getByRole('button', { name: 'Prepara il pezzo: righe 10-13' }).click();
  await expect.poll(() => f.letture.filter((a) => a === 'diff').length).toBeGreaterThan(lettePrima); // il diff si rilegge
  expect(corpiDi(f, 'hunk')).toEqual([{ percorso: 'src/app.js', area: 'lavoro', indice: 0, impronta: 'impronta-diff-1', azione: 'prepara' }]);
  // annullare passa dal «⋯» e chiede; «Non ora» non manda niente
  await diff.locator('.talos-github-pezzo__comandi').getByRole('button', { name: /Altre azioni sul pezzo/u }).click();
  await page.getByRole('menuitem', { name: 'Annulla il pezzo' }).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo).toContainText('src/app.js');
  await dialogo.getByRole('button', { name: 'Non ora' }).click();
  expect(corpiDi(f, 'hunk').length).toBe(1);
  // il tasto destro sulla testa del pezzo apre lo stesso menu
  await diff.locator('.talos-github-pezzo__comandi').click({ button: 'right' });
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  expect((await page.getByRole('menuitem').allTextContents()).map((x) => x.trim())).toEqual(['Annulla il pezzo']);
  await page.getByRole('menuitem', { name: 'Annulla il pezzo' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annulla il pezzo' }).click();
  await expect.poll(() => corpiDi(f, 'hunk').length).toBe(2);
  expect(corpiDi(f, 'hunk')[1].azione).toBe('annulla');
  // un preparato ha solo «Togli il pezzo»; un file nuovo nessun pezzo
  await diff.locator('.talos-github-diff__indietro').click();
  await riga(page, 'README.md', 'preparati').locator('.talos-github-riga__apri').click();
  await expect(diff.locator('.talos-github-pezzo__comandi').getByRole('button', { name: /^Togli il pezzo/u })).toBeVisible();
  await expect(diff.locator('.talos-github-pezzo__comandi').getByRole('button', { name: /Altre azioni sul pezzo/u })).toHaveCount(0);
  await diff.locator('.talos-github-diff__indietro').click();
  await riga(page, 'note.txt', 'nuovi').locator('.talos-github-riga__apri').click();
  await expect(diff.locator('.talos-diff__line').first()).toBeVisible();
  await expect(diff.locator('.talos-github-pezzo__comandi')).toHaveCount(0);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-12 — ✨ scrive il messaggio col modello della sessione (la prima riga fa da traccia); un rifiuto lo dice e non tocca il testo', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page, { larghezza: 1024, altezza: 800 });
  const campo = page.locator('#railGithub .talos-github-commit__messaggio');
  const genera = page.locator('#railGithub .talos-github-commit__genera');
  await expect(genera).toHaveAccessibleName('Genera il messaggio');
  await campo.fill('Aggiungi la scheda\ncorpo mio');
  await genera.click();
  await expect(campo).toHaveValue('Add the GitHub tab\n\nWith one body line.');
  expect(corpiDi(f, 'commit-message')).toEqual([{ bozza: 'Aggiungi la scheda', lingua: 'it' }]);
  await expect(campo).toBeFocused();
  await page.screenshot({ path: 'artifacts/scheda-github-genera-1024-dark.png' });
  // un rifiuto (modello della sessione sconosciuto): l'avviso con le parole del server, e il testo resta com'era
  f.risposte['commit-message'] = [bustaErrore(409, 'SESSION_MODEL_UNKNOWN', 'Non so quale modello usa questa sessione')];
  await campo.fill('mio testo');
  await genera.click();
  await expect(page.getByText('Non so quale modello usa questa sessione').first()).toBeVisible();
  await expect(campo).toHaveValue('mio testo');
  await expect(genera).toBeEnabled();
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-P3-13 — «Affida il commit all\'agente» scrive la richiesta nel composer e NON la manda', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  await menuRepository(page);
  await page.getByRole('menuitem', { name: 'Affida il commit all’agente' }).click();
  const composer = page.locator('#composerInput');
  await expect(composer).toHaveValue('Guarda le modifiche preparate in questa cartella, scrivi un buon messaggio di commit e fai il commit.');
  await expect(composer).toBeFocused();
  await page.waitForTimeout(300); // un invio partirebbe subito: si lascia il tempo di vederlo, e non deve esserci
  expect(contatore.nonGet, 'la richiesta non è partita: la manda la persona').toBe(0);
  expect(f.corpi).toEqual([]);
});

/* ═══════════════════ F6-2 (27/09/2026) — la sincronizzazione col remoto ═══════════════════
 * Decisioni dell'owner: memoria `decisioni-owner-f6-github-26-09`, punti 2 e 16-23. Un pulsante che cambia (GitHub Desktop
 * `push-pull-button.tsx`), ↓ ↑ e l'ultimo recupero sempre; conferma con remoto e ramo prima di Invia/Pubblica; il remoto di
 * Pubblica scelto NELLA conferma; «Ferma» solo per il recupero; «Metti da parte e scarica» quando git rifiuta. */

const sinc = (page) => page.locator('#railGithub .talos-github-sinc');
const pulsanteSinc = (page) => sinc(page).locator('.talos-github-sinc__azione');
async function rileggi(page) { await menuRepository(page); await page.getByRole('menuitem', { name: 'Aggiorna' }).click(); }

test('GITHUB-F62-01 — il pulsante dice l’azione utile adesso, e accanto ci sono sempre ↓ ↑ e l’ultimo recupero', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  await expect(pulsanteSinc(page)).toHaveText('Recupera');
  await expect(sinc(page).locator('.talos-github-sinc__conti')).toHaveText('↓0↑0');
  await expect(sinc(page).locator('.talos-github-sinc__conti')).toHaveAttribute('aria-label', '0 da scaricare, 0 da inviare');
  await expect(sinc(page).locator('.talos-github-sinc__recupero')).toHaveText('Mai recuperato');
  const casi = [
    [{ avanti: 2 }, 'Invia 2', '↓0↑2'],
    [{ indietro: 3, avanti: 1 }, 'Scarica 3', '↓3↑1'], // divergenti: prima si scarica (GitHub Desktop)
    [{ riferimento: null, avanti: null, indietro: null }, 'Pubblica il ramo', null],
    [{ riferimentoSparito: true }, 'Pubblica il ramo', null],
  ];
  for (const [cambio, etichetta, conti] of casi) {
    f.sinc = { ...gitFinto().sinc, ...cambio, ultimoRecupero: new Date(Date.now() - 5 * 60_000).toISOString() };
    await rileggi(page);
    await expect(pulsanteSinc(page)).toHaveText(etichetta);
    if (conti) await expect(sinc(page).locator('.talos-github-sinc__conti')).toHaveText(conti);
    else await expect(sinc(page).locator('.talos-github-sinc__conti')).toHaveCount(0);
    await expect(sinc(page).locator('.talos-github-sinc__recupero')).toHaveText('Recuperato 5 minuti fa');
  }
  await expect(sinc(page)).toContainText('non esiste più: pubblicalo di nuovo');
  // nessun remoto, HEAD staccata: niente pulsante, una frase che dice perché
  f.sinc = { ...gitFinto().sinc, remoti: [], riferimento: null };
  await rileggi(page);
  await expect(pulsanteSinc(page)).toHaveCount(0);
  await expect(sinc(page)).toHaveText('Nessun remoto: questo repository vive solo qui.');
  f.sinc = { ...gitFinto().sinc, ramo: null, staccata: true, riferimento: null };
  await rileggi(page);
  await expect(sinc(page)).toHaveText('HEAD staccata: passa a un ramo per sincronizzare.');
  expect(f.corpi).toEqual([]);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-F62-02 — il «⋯» ha le ALTRE azioni valide, mai quella già nel pulsante (riga e menu: intersezione vuota)', async ({ page }) => {
  const f = gitFinto();
  f.sinc = { ...f.sinc, indietro: 2 };
  await preparaPagina(page, { f });
  await expect(pulsanteSinc(page)).toHaveText('Scarica 2');
  await menuRepository(page);
  const voci = (await page.getByRole('menuitem').allTextContents()).map((v) => v.trim());
  expect(voci).toContain('Recupera da origin');
  expect(voci.some((v) => v.startsWith('Scarica'))).toBe(false);
  expect(voci.some((v) => v.startsWith('Invia')), 'indietro: un invio verrebbe rifiutato, non si offre').toBe(false);
  await page.keyboard.press('Escape');
  f.sinc = { ...gitFinto().sinc, avanti: 1 };
  await rileggi(page);
  await menuRepository(page);
  const voci2 = (await page.getByRole('menuitem').allTextContents()).map((v) => v.trim());
  expect(voci2).toContain('Recupera da origin');
  expect(voci2.some((v) => v.startsWith('Invia'))).toBe(false);
  await page.keyboard.press('Escape');
  // in pari: il pulsante dice «Recupera», e il menu non lo ripete (la mutazione U3 del 27/09 passava senza questo caso)
  f.sinc = gitFinto().sinc;
  await rileggi(page);
  await expect(pulsanteSinc(page)).toHaveText('Recupera');
  await menuRepository(page);
  const voci3 = (await page.getByRole('menuitem').allTextContents()).map((v) => v.trim());
  expect(voci3.some((v) => v.startsWith('Recupera') || v.startsWith('Scarica') || v.startsWith('Invia')), voci3.join(' | ')).toBe(false);
});

test('GITHUB-F62-03 — Recupera mostra «Recupero…» e «Ferma»; Ferma manda fetch-stop e l’esito è «Recupero fermato», non un errore', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  f.attesaRecupero = new Promise((r) => { f.sciogliRecupero = r; });
  await pulsanteSinc(page).click();
  await expect(pulsanteSinc(page)).toHaveText('Recupero…');
  await expect(pulsanteSinc(page)).toBeDisabled();
  await sinc(page).getByRole('button', { name: 'Ferma' }).click();
  await expect(page.getByText('Recupero fermato').first()).toBeVisible();
  await expect(pulsanteSinc(page)).toHaveText('Recupera');
  expect(corpiDi(f, 'fetch')).toEqual([{}]);
  expect(corpiDi(f, 'fetch-stop')).toEqual([{}]);
  // un recupero che finisce aggiorna l'ultimo recupero
  f.attesaRecupero = null; f.fermato = false;
  await pulsanteSinc(page).click();
  await expect(sinc(page).locator('.talos-github-sinc__recupero')).toHaveText(/^Recuperato /u);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-F62-04 — Invia chiede con remoto e ramo scritti; «Non ora» non manda niente; la conferma manda il remoto del riferimento', async ({ page }) => {
  const f = gitFinto();
  f.sinc = { ...f.sinc, avanti: 2 };
  const { contatore } = await preparaPagina(page, { f });
  await pulsanteSinc(page).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo.getByRole('heading')).toHaveText('Inviare 2 commit a origin?');
  await expect(dialogo).toContainText('origin — git@github.com:esempio/progetto.git');
  await expect(dialogo).toContainText('lavoro/f6 → origin/lavoro/f6');
  await dialogo.getByRole('button', { name: 'Non ora' }).click();
  expect(corpiDi(f, 'push')).toEqual([]);
  await pulsanteSinc(page).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Invia a origin' }).click();
  // ⛔ nella regione dei toast: `getByText('Inviato')` prende anche «Testo inviato al modello» della chat (misurato 27/09)
  await expect(page.locator('#regioneToast')).toContainText('Inviato');
  expect(corpiDi(f, 'push')).toEqual([{ remoto: 'origin' }]);
  await expect(pulsanteSinc(page)).toHaveText('Recupera');
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-F62-05 — Pubblica con due remoti e nessuna preferenza: la scelta è NELLA conferma, spenta finché non si sceglie, e le frecce la spostano', async ({ page }) => {
  const f = gitFinto();
  f.sinc = { ...f.sinc, riferimento: null, avanti: null, indietro: null, remotoPerInvio: null, remoti: [{ nome: 'origin', url: 'git@github.com:a/privato.git', urlInvio: null }, { nome: 'public', url: 'git@github.com:a/pubblico.git', urlInvio: null }] };
  const { contatore } = await preparaPagina(page, { f });
  await pulsanteSinc(page).click();
  const dialogo = page.getByRole('alertdialog');
  await expect(dialogo.getByRole('heading')).toHaveText('Pubblicare il ramo «lavoro/f6»?');
  const gruppo = dialogo.getByRole('radiogroup', { name: 'Remoto' });
  await expect(gruppo.getByRole('radio')).toHaveCount(2);
  await expect(gruppo.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(dialogo.getByRole('button', { name: 'Pubblica' })).toBeDisabled();
  await gruppo.getByRole('radio', { name: /origin/u }).click();
  await expect(dialogo.getByRole('button', { name: 'Pubblica' })).toBeEnabled();
  await page.keyboard.press('ArrowDown');
  await expect(gruppo.getByRole('radio', { name: /public/u })).toHaveAttribute('aria-checked', 'true');
  await expect(gruppo.getByRole('radio', { name: /public/u })).toBeFocused();
  await page.screenshot({ path: 'artifacts/scheda-github-f62-pubblica.png' });
  await dialogo.getByRole('button', { name: 'Pubblica' }).click();
  await expect(page.locator('#regioneToast')).toContainText('Pubblicato');
  expect(corpiDi(f, 'push')).toEqual([{ remoto: 'public' }]);
  // preselezionato come git (remotoPerInvio): la conferma parte già accesa
  f.sinc = { ...f.sinc, riferimento: null, remotoPerInvio: 'origin' };
  await rileggi(page);
  await pulsanteSinc(page).click();
  await expect(page.getByRole('alertdialog').getByRole('radio', { name: /origin/u })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Non ora' }).click();
  expect(corpiDi(f, 'push')).toHaveLength(1);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-F62-06 — Scarica rifiutato per file modificati: in riga le parole del server e «Metti da parte e scarica», che mette da parte, scarica e riprende', async ({ page }) => {
  const f = gitFinto();
  f.sinc = { ...f.sinc, indietro: 1 };
  const { contatore } = await preparaPagina(page, { f });
  const rifiuto = () => bustaErrore(409, 'GIT_WORKTREE_DIRTY', 'Scaricare sovrascriverebbe 1 file con modifiche non committate: src/app.js. Mettile da parte o committale, poi riprova');
  f.risposte.pull = [rifiuto(), rifiuto()];
  await pulsanteSinc(page).click();
  const blocco = page.locator('#railGithub .talos-github-blocco');
  await expect(blocco.locator('.talos-github-richiesta__titolo')).toHaveText('Lo scarico non è partito');
  const rientro = await blocco.evaluate((c) => c.querySelector('.talos-github-blocco__testo').getBoundingClientRect().left - c.querySelector('.talos-github-richiesta__titolo').getBoundingClientRect().left);
  expect(Math.abs(rientro), 'il testo è allineato al titolo').toBeLessThanOrEqual(0.5);
  await expect(blocco).toContainText('src/app.js');
  await expect(blocco.getByRole('button', { name: 'Metti da parte e scarica' })).toBeFocused();
  await page.screenshot({ path: 'artifacts/scheda-github-f62-blocco.png' });
  // Esc chiude solo la carta
  await page.keyboard.press('Escape');
  await expect(blocco).toHaveCount(0);
  await pulsanteSinc(page).click();
  await expect(blocco).toBeVisible();
  await blocco.getByRole('button', { name: 'Metti da parte e scarica' }).click();
  await expect(page.getByText('Le tue modifiche sono tornate al loro posto').first()).toBeVisible();
  expect(corpiDi(f, 'stash')).toEqual([{ messaggio: 'Prima di scaricare da origin/lavoro/f6', conNuovi: true }]);
  expect(corpiDi(f, 'pull').length).toBe(3);
  expect(corpiDi(f, 'stash-pop')).toEqual([{ indice: 0, commit: 'st45h000' }]);
  expect(contatore.nonGet).toBe(0);
});

for (const [larghezza, tema] of [[1024, 'dark'], [1440, 'light'], [1024, 'light'], [1440, 'dark']]) {
  test(`GITHUB-F62-FOTO — la riga della sincronizzazione sotto la testata, per l’occhio (${larghezza}, ${tema})`, async ({ page }) => {
    const f = gitFinto();
    f.sinc = { ...f.sinc, indietro: 3, avanti: 1, ultimoRecupero: new Date(Date.now() - 12 * 60_000).toISOString() };
    await preparaPagina(page, { f, larghezza, tema });
    const colonna = page.locator('#railGithub');
    const r = await sinc(page).boundingBox();
    const c = await colonna.boundingBox();
    expect(r.x + r.width, 'la riga resta dentro la colonna').toBeLessThanOrEqual(c.x + c.width + 0.5);
    const altezzaPulsante = await pulsanteSinc(page).evaluate((b) => b.getBoundingClientRect().height);
    const altezzaRamo = await page.locator('#railGithub .talos-github__ramo').evaluate((b) => b.getBoundingClientRect().height);
    expect(Math.abs(altezzaPulsante - altezzaRamo), 'il pulsante è alto quanto il ramo della testata').toBeLessThanOrEqual(0.5);
    await colonna.screenshot({ path: `artifacts/scheda-github-f62-${larghezza}-${tema}.png` });
  });
}

/* ═══════════ F6-2 passo 3 — il grafo di «Commit recenti» (decisione 21: il ramo attuale e il suo remoto) ═══════════ */

/** La forma di `git-service.mjs` `storia` con un remoto divergente: due commit là, uno qui, la base comune e la radice. */
function storiaDivergente(f) {
  const ora = Date.now();
  const c = (commit, soggetto, padri, inviato, oreFa) => ({ commit, breve: commit.slice(0, 7), autore: 'Prova', data: new Date(ora - oreFa * 3600_000).toISOString(), genitori: padri.length, padri, soggetto, inviato });
  f.storia = [
    c('2222222bbbbbbb', 'Dal remoto, il secondo', ['1111111aaaaaaa'], true, 1),
    c('1111111aaaaaaa', 'Dal remoto, il primo', ['bbbbbbbcccccc0'], true, 2),
    c('abc1234def5678', 'Primo commit', ['bbbbbbbcccccc0'], false, 3),
    c('bbbbbbbcccccc0', 'Base comune', ['9999999aaaaaaa'], true, 30),
    c('9999999aaaaaaa', 'Radice del progetto', [], true, 96),
  ];
  f.storiaRif = { testa: 'abc1234def5678', remoto: '2222222bbbbbbb', nomeRemoto: 'origin/lavoro/f6', baseComune: 'bbbbbbbcccccc0' };
  f.sinc = { ...f.sinc, avanti: 1, indietro: 2 };
}

/** «Commit recenti» si apre da tastiera: il toast di riconnessione del banco finto può coprire il titolo (vedi GITHUB-P3-FOTO). */
async function apriStoria(page) {
  const titolo = page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"] .talos-github-gruppo__titolo');
  await titolo.focus();
  await page.keyboard.press('Enter');
  await expect(titolo).toHaveAttribute('aria-expanded', 'true');
}
const righeStoria = (page) => page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"] .talos-github-riga');

test('GITHUB-F62-GRAFO-01 — il ramo e il suo remoto: «In uscita» sopra HEAD, «In arrivo» sopra la base comune, i commit del remoto «da scaricare»', async ({ page }) => {
  const f = gitFinto();
  storiaDivergente(f);
  const { contatore } = await preparaPagina(page, { f });
  await apriStoria(page);
  const righe = righeStoria(page);
  await expect(righe).toHaveCount(7);
  expect(await righe.evaluateAll((rr) => rr.map((r) => r.dataset.tipo))).toEqual(['nodo', 'nodo', 'in-uscita', 'testa', 'in-arrivo', 'nodo', 'nodo']);
  await expect(righe.nth(2)).toContainText('In uscita');
  await expect(righe.nth(2)).toContainText('1 commit da inviare a origin/lavoro/f6');
  await expect(righe.nth(4)).toContainText('In arrivo');
  await expect(righe.nth(4)).toContainText('2 commit da scaricare da origin/lavoro/f6');
  for (const i of [0, 1]) await expect(righe.nth(i).locator('.talos-github-riga__cartella')).toContainText('da scaricare');
  await expect(righe.nth(3).locator('.talos-github-riga__cartella')).toContainText('solo qui');
  // una colonna sola: il testo di ogni riga parte alla stessa x, anche dove il grafo ha una corsia in più (foto del 27/09)
  const inizi = await righe.evaluateAll((rr) => rr.map((r) => Math.round(r.querySelector('.talos-github-riga__apri').getBoundingClientRect().left)));
  expect(new Set(inizi).size, `il testo parte alla stessa x: ${inizi.join(', ')}`).toBe(1);
  // e nessun testo è tagliato dall'altezza fissa della riga (foto del 27/09: le discendenti di «origin», «giorni» mangiate)
  const tagli = await righe.evaluateAll((rr) => rr.flatMap((r) => [...r.querySelectorAll('.talos-github-riga__nome, .talos-github-riga__cartella')]
    .map((s) => ({ testo: s.textContent.slice(0, 24), alto: s.clientHeight, serve: s.scrollHeight, riga: Math.round(r.getBoundingClientRect().height), apri: r.querySelector('.talos-github-riga__apri').scrollHeight }))
    .filter((m) => m.serve > m.alto || m.apri > m.riga)));
  expect(tagli, JSON.stringify(tagli)).toEqual([]);
  await expect(righe.nth(3)).toHaveAttribute('aria-current', 'true');
  await expect(righe.nth(5).locator('.talos-github-riga__cartella')).toContainText('inviato');
  await expect(page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"] .talos-github-gruppo__conto')).toHaveText('5');
  // il grafo si tocca da una riga all'altra: ogni disegno è alto quanto la sua riga, parte dal suo bordo, e le righe sono contigue
  const misure = await righe.evaluateAll((rr) => rr.map((r) => {
    const a = r.getBoundingClientRect();
    const g = r.querySelector('svg.talos-github-grafo')?.getBoundingClientRect();
    return { top: a.top, bottom: a.bottom, h: a.height, gTop: g?.top ?? NaN, gH: g?.height ?? NaN };
  }));
  for (const [i, m] of misure.entries()) {
    expect(Math.abs(m.h - m.gH), `riga ${i}: il grafo è alto quanto la riga (${m.gH} contro ${m.h})`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(m.top - m.gTop), `riga ${i}: il grafo parte dal bordo della riga`).toBeLessThanOrEqual(0.5);
    if (i > 0) expect(Math.abs(m.top - misure[i - 1].bottom), `riga ${i}: contigua alla precedente`).toBeLessThanOrEqual(0.5);
  }
  // i due lati hanno due colori, e nessuno dei due è il grigio delle corsie neutre
  const colori = await page.evaluate(() => {
    const tratto = (c) => { const p = document.querySelector(`#railGithub svg.talos-github-grafo path[data-colore="${c}"]`); return p ? getComputedStyle(p).stroke : null; };
    const prova = document.createElement('span');
    prova.style.color = 'var(--talos-muted)';
    document.querySelector('#railGithub').append(prova);
    const grigio = getComputedStyle(prova).color;
    prova.remove();
    return { locale: tratto('locale'), remoto: tratto('remoto'), grigio };
  });
  expect(colori.locale).toBeTruthy();
  expect(colori.remoto).toBeTruthy();
  expect(colori.locale).not.toBe(colori.remoto);
  expect([colori.locale, colori.remoto]).not.toContain(colori.grigio);
  // il «foro» dell'anello di HEAD ha il colore del fondo VERO dietro la riga (risalendo fino al primo fondo non trasparente)
  await page.mouse.move(0, 0);
  const fondi = await righe.nth(3).evaluate((r) => {
    let n = r.parentElement; let fondo = 'rgba(0, 0, 0, 0)';
    while (n && (fondo === 'rgba(0, 0, 0, 0)' || fondo === 'transparent')) { fondo = getComputedStyle(n).backgroundColor; n = n.parentElement; }
    const foro = r.querySelector('circle[data-ruolo="foro"]');
    return { fondo, foro: foro ? getComputedStyle(foro).fill : null };
  });
  expect(fondi.foro, 'il foro di HEAD è del colore del fondo').toBe(fondi.fondo);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-F62-GRAFO-02 — AL CONTRARIO: in pari col remoto, o senza remoto, niente «In arrivo» né «In uscita», e una corsia sola', async ({ page }) => {
  for (const remoto of ['abc1234def5678', null]) {
    const f = gitFinto();
    f.storia = f.storia.map((c, i) => ({ ...c, padri: i === 0 ? ['9999999aaaaaaa'] : [] }));
    f.storiaRif = { testa: 'abc1234def5678', remoto, nomeRemoto: remoto ? 'origin/lavoro/f6' : null, baseComune: remoto };
    await preparaPagina(page, { f });
    await apriStoria(page);
    await expect(righeStoria(page)).toHaveCount(2);
    expect(await righeStoria(page).evaluateAll((rr) => rr.map((r) => r.dataset.tipo)), `remoto ${remoto}`).toEqual(['testa', 'nodo']);
    expect(await righeStoria(page).evaluateAll((rr) => rr.map((r) => r.querySelector('svg.talos-github-grafo').getAttribute('width')))).toEqual(['22', '22']);
    await expect(page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"]')).not.toContainText('In arrivo');
    await expect(page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"]')).not.toContainText('da scaricare');
  }
});

test('GITHUB-F62-GRAFO-03 — col remoto davanti, «Modifica l’ultimo commit» prende HEAD e non il primo della lista (che è del remoto, già inviato)', async ({ page }) => {
  const f = gitFinto();
  storiaDivergente(f);
  const { contatore } = await preparaPagina(page, { f });
  const campo = page.locator('#railGithub .talos-github-commit__messaggio');
  await menuRepository(page);
  await page.getByRole('menuitem', { name: 'Modifica l’ultimo commit' }).click();
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toContainText('Modifichi il commit abc1234');
  await expect(campo).toHaveValue('Primo commit\n\nCon un corpo di due righe.');
  await campo.fill('Primo commit, riscritto');
  await page.locator('#railGithub .talos-github-commit__fai').click();
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toHaveCount(0);
  expect(corpiDi(f, 'amend').map((c) => c.commit)).toEqual(['abc1234def5678']);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-F62-GRAFO-03b — col remoto MOLTO avanti HEAD resta fuori dai 50: «Modifica l’ultimo commit» funziona lo stesso, su HEAD', async ({ page }) => {
  const f = gitFinto();
  storiaDivergente(f);
  f.storia = f.storia.slice(0, 2); // nella finestra solo commit del remoto: HEAD (abc1234) è più in basso
  const { contatore } = await preparaPagina(page, { f });
  const campo = page.locator('#railGithub .talos-github-commit__messaggio');
  await menuRepository(page);
  await page.getByRole('menuitem', { name: 'Modifica l’ultimo commit' }).click();
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toContainText('Modifichi il commit abc1234');
  await expect(campo).toHaveValue('Primo commit\n\nCon un corpo di due righe.');
  await campo.fill('Primo commit, riscritto');
  await page.locator('#railGithub .talos-github-commit__fai').click();
  await expect(page.locator('#railGithub .talos-github-commit__modo')).toHaveCount(0);
  expect(corpiDi(f, 'amend').map((c) => c.commit)).toEqual(['abc1234def5678']);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-F62-GRAFO-04 — dopo un recupero la storia aperta si rilegge: la punta del remoto si è spostata senza toccare HEAD', async ({ page }) => {
  const f = gitFinto();
  f.sinc = { ...f.sinc, avanti: 0, indietro: 0 };
  f.storia = f.storia.map((c, i) => ({ ...c, padri: i === 0 ? ['9999999aaaaaaa'] : [] }));
  f.storiaRif = { testa: 'abc1234def5678', remoto: 'abc1234def5678', nomeRemoto: 'origin/lavoro/f6', baseComune: 'abc1234def5678' };
  await preparaPagina(page, { f });
  await apriStoria(page);
  await expect(righeStoria(page)).toHaveCount(2);
  const lettePrima = f.letture.filter((a) => a === 'log').length;
  storiaDivergente(f); // il recupero porta due commit dal remoto
  await pulsanteSinc(page).click();
  await expect(righeStoria(page)).toHaveCount(7);
  expect(f.letture.filter((a) => a === 'log').length).toBe(lettePrima + 1);
});

for (const [larghezza, tema] of [[1440, 'dark'], [1024, 'light'], [1440, 'light'], [1024, 'dark']]) {
  test(`GITHUB-F62-GRAFO-FOTO — il grafo di «Commit recenti», per l’occhio (${larghezza}, ${tema})`, async ({ page }) => {
    const f = gitFinto();
    storiaDivergente(f);
    await preparaPagina(page, { f, larghezza, tema });
    await apriStoria(page);
    await expect(righeStoria(page)).toHaveCount(7);
    const colonna = await page.locator('#railGithub').boundingBox();
    const lista = await page.locator('#railGithub .talos-github-storia').boundingBox();
    expect(lista.x + lista.width, 'la storia sta nella colonna').toBeLessThanOrEqual(colonna.x + colonna.width + 0.5);
    await page.locator('#railGithub .talos-github-storia').scrollIntoViewIfNeeded();
    /* il toast «Collegato di nuovo» è del banco finto (lo stream finto si richiude e l'EventSource si ricollega, vedi
       GITHUB-P3-FOTO): per l'occhio si nasconde, così la foto mostra la lista e non lui */
    await page.locator('#regioneToast').evaluate((n) => { n.style.visibility = 'hidden'; });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `artifacts/scheda-github-grafo-${larghezza}-${tema}.png` });
    await page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"]').screenshot({ path: `artifacts/scheda-github-grafo-lista-${larghezza}-${tema}.png` });
  });
}

/* ═══════════ F6-2 passo 4 — il clic nel grafo apre le modifiche, come VS Code (decisione 24) ═══════════ */

const rigaDelGrafo = (page, tipoOCommit) => page.locator(`#railGithub .talos-github-storia > .talos-github-riga--commit${tipoOCommit.startsWith('in-') ? `[data-tipo="${tipoOCommit}"]` : `[data-commit="${tipoOCommit}"]`}`);
const righeFile = (page) => page.locator('#railGithub .talos-github-storia > .talos-github-riga--file-commit');
const tornaAlleModifiche = (page) => page.locator('#railGithub').getByRole('button', { name: 'Torna alle modifiche' }).click();

test('GITHUB-F62-GRAFO-05 — un commit si apre nei suoi file (corsie che proseguono), il file apre il diff in SOLA LETTURA, e si richiude', async ({ page }) => {
  const f = gitFinto();
  storiaDivergente(f);
  const { contatore } = await preparaPagina(page, { f });
  await apriStoria(page);
  const bottone = rigaDelGrafo(page, 'abc1234def5678').locator('.talos-github-riga__apri');
  await expect(bottone).toHaveAttribute('aria-expanded', 'false');
  await bottone.click();
  await expect(bottone).toHaveAttribute('aria-expanded', 'true');
  await expect(righeFile(page)).toHaveCount(2);
  expect(f.confronti.at(-1)).toEqual({ azione: 'changes', a: 'abc1234def5678' }); // contro il primo genitore: `da` lo risolve il server
  await expect(righeFile(page).nth(0)).toContainText('app.js');
  await expect(righeFile(page).nth(0).locator('.talos-github-riga__lettera')).toHaveText('M');
  await expect(righeFile(page).nth(1)).toContainText('nuovo.md');
  await expect(righeFile(page).nth(1)).toContainText('da docs/vecchio.md');
  // le righe dei file stanno SUBITO sotto il commit, contigue, e il segnaposto delle corsie è alto quanto ciascuna
  const misure = await page.evaluate(() => {
    const tutte = [...document.querySelectorAll('#railGithub .talos-github-storia > .talos-github-riga')];
    const i = tutte.findIndex((r) => r.dataset.commit === 'abc1234def5678');
    return tutte.slice(i, i + 3).map((r) => {
      const a = r.getBoundingClientRect();
      const g = r.querySelector('svg.talos-github-grafo').getBoundingClientRect();
      return { file: r.classList.contains('talos-github-riga--file-commit'), top: a.top, bottom: a.bottom, h: a.height, gH: g.height, x: Math.round(g.left) };
    });
  });
  expect(misure.map((m) => m.file)).toEqual([false, true, true]);
  for (const [i, m] of misure.entries()) {
    expect(Math.abs(m.h - m.gH), `riga ${i}: il segnaposto è alto quanto la riga`).toBeLessThanOrEqual(0.5);
    if (i > 0) expect(Math.abs(m.top - misure[i - 1].bottom), `riga ${i}: contigua`).toBeLessThanOrEqual(0.5);
  }
  expect(new Set(misure.map((m) => m.x)).size, 'le corsie sono nella stessa colonna').toBe(1);
  // e le corsie ci sono davvero: sotto HEAD scendono le due (il remoto verso «In arrivo», il ramo verso la base comune)
  expect(await righeFile(page).nth(0).locator('svg.talos-github-grafo path').evaluateAll((pp) => pp.map((p) => p.dataset.colore))).toEqual(['remoto', 'locale']);
  // il file apre il diff: il titolo del commit, gli estremi, e NESSUNA azione (la storia non si prepara)
  await righeFile(page).nth(0).locator('.talos-github-riga__apri').click();
  await expect(page.locator('#railGithub .talos-lettore__meta')).toContainText('abc1234 · Primo commit');
  await expect(page.locator('#railGithub .talos-github-diff .talos-github__base')).toHaveText('Confronto fra 9999999 e abc1234');
  expect(f.confronti.at(-1)).toEqual({ azione: 'changes-diff', a: 'abc1234def5678', da: '9999999aaaaaaa', percorso: 'src/app.js' });
  await expect(page.locator('#railGithub .talos-diff__line--add').first()).toBeVisible();
  await expect(page.locator('#railGithub').getByRole('button', { name: /pezzo/u })).toHaveCount(0);
  await expect(page.locator('#railGithub .talos-lettore__comandi').getByRole('button', { name: /^(Prepara|Togli|Annulla)|Altre azioni su/u })).toHaveCount(0);
  // indietro: la lista con la riga ancora aperta; il rinominato porta il nome di prima
  await tornaAlleModifiche(page);
  await expect(bottone).toHaveAttribute('aria-expanded', 'true');
  await righeFile(page).nth(1).locator('.talos-github-riga__apri').click();
  await expect(page.locator('#railGithub .talos-lettore__meta')).toContainText('abc1234 · Primo commit');
  expect(f.confronti.at(-1)).toMatchObject({ azione: 'changes-diff', percorso: 'docs/nuovo.md', prima: 'docs/vecchio.md' });
  await tornaAlleModifiche(page);
  // da tastiera si richiude
  await bottone.focus();
  await page.keyboard.press('Enter');
  await expect(bottone).toHaveAttribute('aria-expanded', 'false');
  await expect(righeFile(page)).toHaveCount(0);
  expect(contatore.nonGet).toBe(0);
});

test('GITHUB-F62-GRAFO-06 — «In arrivo» si apre dalla base comune alla punta del remoto, e i file FUORI dalla cartella si contano', async ({ page }) => {
  const f = gitFinto();
  storiaDivergente(f);
  await preparaPagina(page, { f });
  await apriStoria(page);
  await rigaDelGrafo(page, 'in-arrivo').locator('.talos-github-riga__apri').click();
  await expect(righeFile(page)).toHaveCount(3); // due file e la nota
  expect(f.confronti.at(-1)).toEqual({ azione: 'changes', a: '2222222bbbbbbb', da: 'bbbbbbbcccccc0' });
  const nota = page.locator('#railGithub .talos-github-storia > .talos-github-riga--nota');
  await expect(nota).toHaveText('2 file cambiati fuori dalla cartella della sessione.');
  const m = await nota.evaluate((r) => ({ h: r.getBoundingClientRect().height, gH: r.querySelector('svg.talos-github-grafo').getBoundingClientRect().height }));
  expect(Math.abs(m.h - m.gH), `la nota: il segnaposto si allunga con la riga (${m.gH} contro ${m.h})`).toBeLessThanOrEqual(0.5);
  await righeFile(page).nth(0).locator('.talos-github-riga__apri').click();
  await expect(page.locator('#railGithub .talos-lettore__meta')).toContainText('In arrivo · origin/lavoro/f6');
  // «In uscita» si apre dalla base comune a HEAD
  await tornaAlleModifiche(page);
  await rigaDelGrafo(page, 'in-uscita').locator('.talos-github-riga__apri').click();
  await expect.poll(() => f.confronti.at(-1)).toEqual({ azione: 'changes', a: 'abc1234def5678', da: 'bbbbbbbcccccc0' });
});

test('GITHUB-F62-GRAFO-07 — la radice: il diff contro l albero vuoto lo dice a parole, non con un hash', async ({ page }) => {
  const f = gitFinto();
  storiaDivergente(f);
  await preparaPagina(page, { f });
  await apriStoria(page);
  await page.locator('#regioneToast').evaluate((n) => { n.style.visibility = 'hidden'; }); // la radice sta in fondo: il toast del banco finto la coprirebbe
  await rigaDelGrafo(page, '9999999aaaaaaa').locator('.talos-github-riga__apri').click();
  await righeFile(page).nth(0).locator('.talos-github-riga__apri').click();
  await expect(page.locator('#railGithub .talos-github-diff .talos-github__base')).toHaveText('Il primo commit: tutto è nuovo.');
});

for (const [larghezza, tema] of [[1440, 'dark'], [1024, 'light']]) {
  test(`GITHUB-F62-GRAFO-APERTO-FOTO — un commit aperto nei suoi file e «In arrivo» con la nota, per l’occhio (${larghezza}, ${tema})`, async ({ page }) => {
    const f = gitFinto();
    storiaDivergente(f);
    await preparaPagina(page, { f, larghezza, tema });
    await apriStoria(page);
    await rigaDelGrafo(page, 'abc1234def5678').locator('.talos-github-riga__apri').click();
    await rigaDelGrafo(page, 'in-arrivo').locator('.talos-github-riga__apri').click();
    await expect(righeFile(page)).toHaveCount(5);
    await page.locator('#regioneToast').evaluate((n) => { n.style.visibility = 'hidden'; }); // il toast del banco finto (vedi GRAFO-FOTO)
    await page.mouse.move(0, 0);
    await page.locator('#railGithub .talos-github-gruppo[data-gruppo="storia"]').screenshot({ path: `artifacts/scheda-github-grafo-aperto-${larghezza}-${tema}.png` });
  });
}

test('GITHUB-F62-GRAFO-08 — il diff di un commit NON si chiude quando la scheda rilegge lo stato (non dipende da ciò che c’è da committare)', async ({ page }) => {
  const f = gitFinto();
  storiaDivergente(f);
  await preparaPagina(page, { f });
  await apriStoria(page);
  await rigaDelGrafo(page, 'abc1234def5678').locator('.talos-github-riga__apri').click();
  await righeFile(page).nth(1).locator('.talos-github-riga__apri').click(); // docs/nuovo.md: nell'albero di lavoro NON è modificato
  await expect(page.locator('#railGithub .talos-lettore__meta')).toContainText('abc1234 · Primo commit');
  // a schermo intero l'elenco torna nel rail: da lì «Aggiorna» rilegge lo stato
  await page.locator('#railGithub .talos-github-diff').getByRole('button', { name: 'Schermo intero' }).click();
  /* ⛔ Si aspetta che la rilettura sia ARRIVATA e usata, non solo partita: il caricamento chiede stato, ramo, messi da parte e
     sincronizzazione insieme e chiama `mostraStato` quando tornano tutte e quattro (`legacy/app.js`). Con un `poll` sulla sola
     richiesta la prova guardava il diff prima della rilettura e restava verde anche col difetto (mutazione W5, 27/09). */
  const risposte = ['status', 'branch', 'stashes', 'sync'].map((coda) => page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/git/${coda}`)));
  await menuRepository(page);
  await page.getByRole('menuitem', { name: 'Aggiorna' }).click();
  await Promise.all(risposte);
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await expect(page.locator('.talos-github-diff .talos-lettore__meta')).toContainText('abc1234 · Primo commit');
  await expect(page.locator('.talos-github-diff')).toBeVisible();
});

test('GITHUB-F62-GRAFO-09 — una risposta del diff arrivata TARDI non prende il posto di quella nuova: stessa punta, base diversa', async ({ page }) => {
  const f = gitFinto();
  storiaDivergente(f);
  let sciogli;
  f.trattieni = { da: 'bbbbbbbcccccc0', promessa: new Promise((ok) => { sciogli = ok; }) };
  await preparaPagina(page, { f });
  await apriStoria(page);
  await page.locator('#regioneToast').evaluate((n) => { n.style.visibility = 'hidden'; }); // il toast del banco finto (vedi GRAFO-FOTO)
  await rigaDelGrafo(page, '2222222bbbbbbb').locator('.talos-github-riga__apri').click();
  await rigaDelGrafo(page, 'in-arrivo').locator('.talos-github-riga__apri').click();
  await expect(righeFile(page)).toHaveCount(5); // due file del commit, due di «In arrivo» e la nota
  // 1. «In arrivo» → app.js: la risposta resta trattenuta
  await righeFile(page).nth(2).locator('.talos-github-riga__apri').click();
  await expect(page.locator('.talos-github-diff .talos-lettore__meta')).toContainText('In arrivo · origin/lavoro/f6');
  // 2. a schermo intero l'elenco torna nel rail: lo STESSO file dal commit in cima al remoto (stessa punta, altra base)
  await page.locator('.talos-github-diff').getByRole('button', { name: 'Schermo intero' }).click();
  await righeFile(page).nth(0).locator('.talos-github-riga__apri').click();
  await expect(page.locator('.talos-github-diff .talos-github__base')).toHaveText('Confronto fra 9999999 e 2222222');
  // 3. ora arriva la risposta vecchia: si scarta
  const vecchia = page.waitForResponse((r) => r.url().includes('/git/changes-diff') && r.url().includes('da=bbbbbbbcccccc0'));
  sciogli();
  await vecchia;
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  await expect(page.locator('.talos-github-diff .talos-github__base')).toHaveText('Confronto fra 9999999 e 2222222');
  await expect(page.locator('.talos-github-diff .talos-lettore__meta')).toContainText('2222222 · Dal remoto, il secondo');
});

/* ═══════════════════ C34 (bugfixer, 09/10/2026 sera) — la scheda Git si aggiorna da sola ═══════════════════
 * Owner, più volte: «la scheda Git non si aggiorna da sola quando i file cambiano o si interagisce coi file». Come VS Code
 * (`extensions/git/src/repository.ts`: `onFileChange` → `@debounce(1000)`, e lo stato si rilegge quando la finestra ha il fuoco). */
const lettureStato = (f) => f.letture.filter((a) => a === 'status').length;
const eventoVivo = (page, evento) => page.evaluate((e) => { const r = window.__talosHarnessUiRuntime; r.handleRealEvent(e, r.realSessionState.generation); }, evento);

test('C34-01 — i file cambiati (WorkspaceChanged) rileggono la scheda Git dopo un secondo di quiete: una raffica è UNA lettura', async ({ page }) => {
  const { f, contatore } = await preparaPagina(page);
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  await page.waitForTimeout(300);
  const prima = lettureStato(f);
  for (let i = 0; i < 5; i += 1) await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: [`src/file-${i}.ts`], _sequenza: 9100 + i });
  await page.waitForTimeout(400);
  expect(lettureStato(f) - prima, 'prima del secondo di quiete non si rilegge niente').toBe(0);
  await expect.poll(() => lettureStato(f) - prima, { timeout: 3000 }).toBe(1);
  await page.waitForTimeout(1300);
  expect(lettureStato(f) - prima, 'cinque cambiamenti di fila, una lettura sola').toBe(1);
  expect(contatore.nonGet).toBe(0);
});

test('C34-02 — una rinomina fatta dalla scheda File segna la scheda Git: tornandoci, lo stato si rilegge', async ({ page }) => {
  const { f } = await preparaPagina(page);
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  await page.route(`**/api/v1/sessions/${SESSIONE}/tree?*`, (r) => r.fulfill(busta({ voci: [{ nome: 'note.md', cartella: false }] })));
  await page.route(`**/api/v1/sessions/${SESSIONE}/tree/rename`, (r) => r.fulfill(busta({})));
  await page.locator('#railTabs [data-rail="file"]').click();
  const nodo = page.locator('#alberoFile .ft-node[data-percorso="note.md"]');
  await expect(nodo).toBeVisible();
  const prima = lettureStato(f);
  await nodo.locator(':scope > .ft-row').focus();
  await page.keyboard.press('F2');
  await nodo.locator('.ft-rename').fill('appunti.md');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1300);
  await page.locator('#railTabs [data-rail="github"]').click();
  await expect.poll(() => lettureStato(f) - prima, { timeout: 3000, message: 'la scheda Git deve rileggere lo stato dopo una rinomina' }).toBeGreaterThanOrEqual(1);
});

test('C34-03 — la finestra che torna in primo piano rilegge la scheda Git visibile (un commit fatto da un terminale non manda eventi)', async ({ page }) => {
  const { f } = await preparaPagina(page);
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  await page.waitForTimeout(300);
  const prima = lettureStato(f);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => lettureStato(f) - prima, { timeout: 3000 }).toBe(1);
});

test('C34-04 — al contrario: un WorkspaceChanged della STORIA rigiocata non rilegge la scheda', async ({ page }) => {
  // la storia di questa sessione porta tre WorkspaceChanged prima del confine: riaprirla legge lo stato una volta, come GITHUB-10
  const SECONDA = 'scheda-github-storia';
  const storia = [0, 1, 2].map((i) => ({ type: 'WorkspaceChanged', percorsi: [`a${i}.ts`], _sequenza: i + 1 }));
  const corpo = `${storia.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}${CONFINE}`;
  const letture = { status: 0 };
  const { f } = await preparaPagina(page);
  await page.route(`**/api/v1/sessions/${SECONDA}/**`, async (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: corpo });
    if (p.endsWith('/git/status')) { letture.status += 1; return route.fulfill(busta(f.stato())); }
    if (p.endsWith('/git/branch')) return route.fulfill(busta({ ramo: 'storia', staccata: false }));
    return route.fallback();
  });
  await page.evaluate((id) => window.__talosHarnessUiRuntime.passaASessione(id, 'workspace', 'Storia', 'z-ai/glm-5.3-flash', { conclusa: true, modello: 'z-ai/glm-5.3-flash' }), SECONDA);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await expect(page.locator('#railGithub .talos-github__testa')).toContainText('storia');
  await page.waitForTimeout(1500); // un rinvio di un secondo avrebbe il tempo di partire
  expect(letture.status, 'tre WorkspaceChanged nella storia, una lettura sola').toBe(1);
});

/* C34, review del desktop (09/10/2026 notte): R1 il fuoco della tastiera, R2 il menu aperto, R3 il ritorno alla finestra. */
const altroDi = (page, percorso, gruppo) => riga(page, percorso, gruppo).locator('[data-fuoco$=":altro"]');

test('C34-05 — R1: il fuoco sul «⋯» di una riga sopravvive al ridisegno automatico; una riga sparita non lo sposta su un\'altra', async ({ page }) => {
  const { f } = await preparaPagina(page);
  await expect(riga(page, 'src/app.js', 'modificati')).toBeVisible();
  await altroDi(page, 'src/app.js', 'modificati').focus();
  const prima = lettureStato(f);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/app.js'], _sequenza: 9201 });
  await expect.poll(() => lettureStato(f) - prima, { timeout: 3000 }).toBe(1);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.activeElement?.dataset?.fuoco ?? document.activeElement?.tagName), 'il fuoco resta sul ⋯ della stessa riga').toBe('riga:modificati:src/app.js:altro');
  // al contrario: la riga sparisce (il file è stato ripristinato fuori) — niente errori, e il fuoco non salta su un'altra riga
  f.voci.splice(f.voci.findIndex((v) => v.percorso === 'src/app.js'), 1);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/app.js'], _sequenza: 9202 });
  await expect(riga(page, 'src/app.js', 'modificati')).toHaveCount(0, { timeout: 3000 });
  const dopo = await page.evaluate(() => document.activeElement?.dataset?.fuoco ?? '');
  expect(dopo.startsWith('riga:'), `il fuoco non salta su un'altra riga (${dopo})`).toBe(false);
});

test('C34-06 — R3: tornando alla finestra arrivano visibilitychange E focus, e la scheda si legge UNA volta', async ({ page }) => {
  const { f } = await preparaPagina(page);
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  await page.waitForTimeout(300);
  const prima = lettureStato(f);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  await expect.poll(() => lettureStato(f) - prima, { timeout: 3000 }).toBe(1);
  await page.waitForTimeout(800);
  expect(lettureStato(f) - prima, 'due eventi del ritorno, una lettura').toBe(1);
});

test('C34-07 — R2: sotto un menu «⋯» aperto la scheda non si ridisegna; chiuso il menu, si rilegge e il fuoco torna al «⋯»', async ({ page }) => {
  const { f } = await preparaPagina(page);
  await expect(riga(page, 'src/app.js', 'modificati')).toBeVisible();
  await altroDi(page, 'src/app.js', 'modificati').click();
  const menu = page.locator('.talos-menu-azioni--git');
  await expect(menu).toBeVisible();
  const prima = lettureStato(f);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/app.js'], _sequenza: 9301 });
  await page.waitForTimeout(1500);
  expect(lettureStato(f) - prima, 'col menu aperto non si rilegge').toBe(0);
  await expect(menu, 'e il menu resta lì, ancorato alla sua riga').toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect.poll(() => lettureStato(f) - prima, { timeout: 3000, message: 'chiuso il menu, la scheda sporca si rilegge' }).toBe(1);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => document.activeElement?.dataset?.fuoco ?? ''), 'il fuoco torna al ⋯ della riga').toBe('riga:modificati:src/app.js:altro');
});
/* ═══ REVISIONE C34 (sessione desktop, 09/10 notte): devono essere ROSSE sulla patch e VERDI dopo la cura ═══ */
test('C34-REV-R1 — il fuoco da tastiera sul ⋯ di una riga resta su quella riga dopo un aggiornamento automatico', async ({ page }) => {
  const { f } = await preparaPagina(page);
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  const altro = page.locator('#railGithub li.talos-github-riga[data-percorso="src/app.js"] button[aria-haspopup="menu"]');
  await altro.focus();
  await expect(altro).toBeFocused();
  const prima = lettureStato(f);
  await eventoVivo(page, { type: 'WorkspaceChanged', percorsi: ['src/altro.ts'], _sequenza: 9300 });
  await expect.poll(() => lettureStato(f) - prima, { timeout: 3000 }).toBe(1);
  await page.waitForTimeout(200);
  const dove = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, riga: a?.closest?.('li.talos-github-riga')?.dataset.percorso ?? null, menu: a?.getAttribute?.('aria-haspopup') ?? null };
  });
  expect(dove, 'il fuoco deve restare sul ⋯ di src/app.js, non finire su <body>').toEqual({ tag: 'BUTTON', riga: 'src/app.js', menu: 'menu' });
});

test('C34-REV-R3 — tornare alla finestra (visibilitychange + focus) rilegge la scheda UNA volta', async ({ page }) => {
  const { f } = await preparaPagina(page);
  await expect(page.locator('#railGithub .talos-github__testa')).toBeVisible();
  await page.waitForTimeout(300);
  const prima = lettureStato(f);
  await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  await page.waitForTimeout(1500);
  expect(lettureStato(f) - prima, 'un ritorno alla finestra, una lettura').toBe(1);
});
