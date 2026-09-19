/**
 * lab-installati-azioni.spec.mjs — «Elimina» e «Rinomina» su un modello installato dalla coda dei
 * download (FASE 4-bis, corsia D), 19/09/2026.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * COSA PROVA, E PERCHE' COSI'
 *
 * Owner, guardando il suo schermo: «Download non ha tutte le opzioni: non posso eliminare i modelli
 * installati, non posso rinominarli. È tutto previsto dal backend». Le rotte ci sono
 * (`http-app.mjs:1251`); mancava il comando a schermo, e mancava soprattutto la parte difficile:
 * **un'eliminazione che non mente**. Qui si prova quella.
 *
 *   1. DUE PASSI: il primo clic ARMA e non cancella niente (la rotta NON viene chiamata), il
 *      secondo esegue. Il fuoco entra su «Annulla».
 *   2. LA ROTTA VERA: si elimina e si rinomina davvero, contro il server isolato, e si guarda
 *      l'elenco che il server restituisce dopo — non la busta della risposta.
 *   3. IL VERSO CHE FALLISCE: id inesistente ⇒ lo stato d'errore si vede e NON si finge riuscito.
 *      ⛔ Regge su una misura: `POST …/delete` su un id che non esiste risponde **200
 *      `{"deleted":true}`** e sul disco non cambia niente (misurato il 19/09/2026, sonda
 *      `sonda-rotte.mjs` sul server isolato). La prova lo ESEGUE e mostra che il verdetto, che
 *      rilegge l'elenco, dice comunque «non eliminato».
 *   4. LA FASE 4 NON PERDE NIENTE: coi comandi nuovi le voci di prima ci sono tutte e le nuove si
 *      AGGIUNGONO in coda (`struttura` senza azioni è un PREFISSO di quella con azioni); senza
 *      `azioni` la riga è quella di sempre, che è il contratto del cancello `COMP CodaDownload`.
 *   5. IL RIDISEGNO NON PORTA VIA NIENTE: la coda si ridisegna ogni 800 ms mentre qualcosa scarica
 *      (`app.js:3661`) e `aggiornaCodaDownload` ricostruisce le righe — il pannello aperto e il
 *      nome appena scritto devono sopravvivere al giro successivo.
 *
 * ⛔ COME ARRIVA IL MODULO NELLA PAGINA: dalla SORGENTE su disco (`page.route('**\/__corsiad/*.js')`
 * + `import()` dalla pagina), come `lab-download.spec.mjs` e `lab-guscio.spec.mjs`. Il pacchetto
 * servito (`public/`) lo costruisce l'orchestratore e questa corsia non lo tocca.
 *
 * ⛔ SUL SERVER DELL'OWNER QUESTA PROVA NON ESEGUE NIENTE. Le rotte di scrittura si provano solo
 * sul server isolato: sul 4174 (o su qualunque server che non sia quello del banco) i test che
 * scrivono si SALTANO, e lo dicono. In più ogni test lavora soltanto sull'id che ha creato lui con
 * la rotta d'import, e lo rimette via: non tocca niente che non sia suo.
 *
 * ⛔ COSA DIVENTA ROSSO (la prova deve poter essere rotta, non solo verde):
 *   · si togliesse il primo passo (il clic su «Elimina dal disco» chiamasse subito la rotta) ⇒
 *     AZ-DUE-PASSI rossa: la rotta risulta chiamata prima del secondo clic;
 *   · si togliesse il verdetto e si leggesse la busta della rotta ⇒ AZ-VERSO-ROTTO rossa (il 200
 *     bugiardo diventerebbe «Eliminato dal disco»);
 *   · si smettesse di passare `statoAzioni` a `creaRigaDownload` ⇒ AZ-RIDISEGNO rossa (il pannello
 *     e la bozza spariscono al primo giro);
 *   · si togliesse il `disabled` sul comando a nome vuoto ⇒ AZ-CAMPO-VUOTO rossa (la rete viene
 *     chiamata con un nome che il deposito rifiuta con un 500);
 *   · si disegnassero i due comandi anche senza `azioni` ⇒ AZ-SENZA-AZIONI rossa (e il cancello
 *     `COMP CodaDownload` cambierebbe disegno sotto il mockup);
 *   · dopo un'eliminazione riuscita si lasciasse la frase «Disponibile nei modelli installati»
 *     ⇒ AZ-FRASE rossa.
 */
import { expect, test } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { struttura } from '../parity/aiuto.mjs';

const COMPONENTI = resolve(process.cwd(), 'src', 'components');
const PANEL = '#modelLabCard [data-model-lab-panel="downloads"]';
const CODA = `${PANEL} [data-c="DownloadQueue"]`;

/** La porta da cui si sta parlando: il banco isolato sì, il server vivo dell'owner no. */
function portaDi(testInfo) {
  try { return new URL(testInfo.project.use.baseURL || 'http://127.0.0.1:4176/').port; } catch { return ''; }
}
const SU_SERVER_VIVO = (porta) => porta === '4174';

/**
 * Le due azioni, COME VANNO LEGATE: chiamano la rotta vera e poi RILEGGONO l'elenco.
 * ⛔ Il verdetto non si legge dal codice HTTP della `delete` — un id inesistente risponde 200
 *   `{"deleted":true}` senza toccare il disco (misurato). Chi fornisce l'azione guarda l'elenco.
 * Inietta in pagina `window.__az` con: elimina, rinomina, spie (il registro delle chiamate).
 */
function azioniVere() {
  const spie = [];
  window.__az = { spie, idInesistente: null };
  const chiama = async (percorso, corpo) => {
    spie.push(percorso);
    const risposta = await fetch(percorso, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo ?? {}) });
    const busta = await risposta.json().catch(() => null);
    return { risposta, busta };
  };
  const elenco = async () => {
    const r = await fetch('/api/v1/local-models');
    const j = await r.json().catch(() => null);
    return Array.isArray(j?.data?.items) ? j.data.items : [];
  };
  window.__az.elimina = async (id) => {
    /* ⛔ SI GUARDA PRIMA E DOPO, e non è un dettaglio: la `delete` risponde 200 `{"deleted":true}`
       anche per un id che non è MAI esistito, e in quel caso l'elenco di dopo è identico a quello
       di prima. Guardando solo il dopo, «non c'è più» e «non c'è mai stato» sono la stessa
       fotografia — cioè la bugia passa. */
    const cEra = (await elenco()).some((m) => m.id === id);
    const { risposta, busta } = await chiama(`/api/v1/local-models/${encodeURIComponent(id)}/delete`, {});
    if (!risposta.ok || !busta?.ok) return { ok: false, motivo: busta?.error?.message || `il server ha risposto ${risposta.status}` };
    if (!cEra) return { ok: false, motivo: 'non risultava fra i modelli installati: non c’era niente da eliminare' };
    if ((await elenco()).some((m) => m.id === id)) return { ok: false, motivo: 'il modello risulta ancora fra gli installati' };
    return { ok: true };
  };
  window.__az.rinomina = async (id, nome) => {
    const { risposta, busta } = await chiama(`/api/v1/local-models/${encodeURIComponent(id)}/rename`, { name: nome });
    if (!risposta.ok || !busta?.ok) return { ok: false, motivo: busta?.error?.message || `il server ha risposto ${risposta.status}` };
    const dopo = (await elenco()).find((m) => m.id === id);
    if (!dopo) return { ok: false, motivo: 'il modello non risulta più installato' };
    if (dopo.name !== nome) return { ok: false, motivo: 'il server non ha registrato il nome nuovo' };
    return { ok: true, nome };
  };
}

/** La pagina: sola lettura se il server è quello vivo, il modulo dalla sorgente, la coda appesa. */
async function prepara(page, dove = '') {
  const fermati = [];
  if (/127\.0\.0\.1:4174|localhost:4174/.test(dove)) {
    await page.route('**/*', (route) => {
      const metodo = route.request().method();
      if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) return route.continue();
      fermati.push(`${metodo} ${route.request().url()}`);
      return route.abort();
    });
  }
  /* ⛔ La coda dell'app è APPESA per la durata della misura: `renderizzaDownloadConMockup`
     ridisegnerebbe il pannello dal suo stato (vuoto) e due scritture sulla stessa lista si
     pesterebbero. Qui il ridisegno lo comanda la prova, che è l'unico modo di misurare il giro. */
  await page.route('**/api/v1/huggingface/downloads', () => { /* appesa */ });
  await page.route('**/__corsiad/*.js', async (route) => {
    const nome = new URL(route.request().url()).pathname.split('/').pop();
    try {
      const sorgente = await readFile(resolve(COMPONENTI, nome), 'utf8');
      await route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: sorgente });
    } catch {
      await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: `manca ${nome}` });
    }
  });
  return fermati;
}

/** Apre l'app e va in Impostazioni → Laboratorio modelli → scheda «Download», come un utente. */
async function apriIlLaboratorio(page, { colorMode = 'dark', dove = '' } = {}) {
  const fermati = await prepara(page, dove);
  await page.addInitScript(azioniVere);
  await page.addInitScript((modo) => {
    try {
      window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
        version: 1,
        appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' },
        chat: {}, workspaces: {},
      }));
    } catch { /* un frame in sandbox non ha storage */ }
  }, colorMode);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__talosHarnessUiRuntime, null, { timeout: 20000 });
  /* ⛔ IL VELO D'AVVIO PRIMA DI TUTTO: `#talosAvvio` copre la schermata finché l'app non è pronta
     (`dist/avvio.js`, e la sua promessa `window.__talosAvvioPronta`). Senza questa attesa le prime
     foto escono col MARCHIO di TALOS grande sopra la pagina — successo davvero, il 19/09: la prima
     tornata di foto mostrava il velo al posto dell'intestazione, e sembrava un difetto del
     laboratorio. ⛔ La pratica non è «aspettare un tempo» ma «aspettare lo STATO finale»
     (qaskills.sh, «Visual Testing Animation Freeze Strategies»; il caso identico l'ha risolto
     Hermes con `fix(desktop): kill boot overlay fade-race in e2e screenshots`,
     NousResearch/hermes-agent a9e7b85 — letti il 19/09/2026), ed è la stessa attesa che usano gli
     script di foto già in casa (`frontend/artifacts/foto-vivo-fase-a.mjs:29`). */
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  const esito = await page.evaluate(async () => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    if (voce && !voce.offsetParent) {
      const gruppo = voce.closest('.td-nav-group');
      const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
      if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    }
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
    await new Promise((r) => setTimeout(r, 250));
    document.querySelector('#labSchedaDownloads')?.click();
    await new Promise((r) => setTimeout(r, 250));
    window.__dl = await import('/__corsiad/download-coda.js');
    const carta = document.querySelector('#modelLabCard');
    const panel = carta?.querySelector('[data-model-lab-panel="downloads"]');
    return { carta: Boolean(carta), panel: Boolean(panel), coda: Boolean(panel?.querySelector('[data-c="DownloadQueue"]')) };
  });
  expect(esito.carta, 'la carta del laboratorio deve esistere').toBe(true);
  expect(esito.panel).toBe(true);
  expect(esito.coda, 'la coda del mockup è montata nel pannello vero').toBe(true);
  return { fermati };
}

/**
 * Apre l'ingresso vero di «Installati» con risposte HTTP deterministiche. Il secondo elenco
 * compare solo quando il polling vero dei download osserva una riga `ready`: in questo modo la
 * prova attraversa lo stesso aggiornamento che usa l'app, senza chiamare funzioni interne.
 */
async function apriInstallatiConAggiornamento(page, { colorMode = 'dark' } = {}) {
  const GB = 1024 ** 3;
  const modello = (id, name, repo, bytes) => ({
    id,
    name,
    repo,
    revision: 'a'.repeat(40),
    state: 'ready',
    license: 'Apache-2.0',
    bytes,
    path: `${id}/${id}.gguf`,
    files: [{ path: `${id}.gguf`, bytes, sha256: 'a'.repeat(64) }],
    sha256: 'a'.repeat(64),
    updatedAt: '2026-09-19T12:00:00.000Z',
  });
  const iniziali = [
    modello('qwen8', 'Qwen3 8B', 'Qwen/Qwen3-8B-GGUF', 5 * GB),
    modello('gemma', 'Gemma 3 12B', 'google/gemma-3-12b-it-GGUF', 8 * GB),
    modello('mistral', 'Mistral 7B', 'mistralai/Mistral-7B-GGUF', 4 * GB),
  ];
  const arrivato = modello('gemma-refresh', 'Gemma aggiornata', 'google/gemma-refresh-GGUF', 9 * GB);
  const controllo = { download: 0, locali: 0, pronto: false };

  await page.route(/\/api\/v1\/local-models(?:\?.*)?$/, route => {
    controllo.locali += 1;
    return route.fulfill({ json: { ok: true, data: { items: controllo.pronto ? [...iniziali, arrivato] : iniziali } } });
  });
  await page.route(/\/api\/v1\/runtime(?:\?.*)?$/, route => route.fulfill({
    json: {
      ok: true,
      data: {
        items: [{
          runtimeId: 'llama.cpp',
          state: 'observed',
          runtimeState: 'ready',
          modelId: 'qwen8',
          models: iniziali.map(({ id, name }) => ({ id, name })),
        }],
      },
    },
  }));
  await page.route(/\/api\/v1\/huggingface\/downloads(?:\?.*)?$/, route => {
    controllo.download += 1;
    const state = controllo.pronto ? 'ready' : 'running';
    return route.fulfill({
      json: {
        ok: true,
        data: {
          items: [{
            id: 'aggiornamento-installati',
            repo: 'google/gemma-refresh-GGUF',
            file: 'gemma-refresh.gguf',
            bytes: 9 * GB,
            downloadedBytes: state === 'ready' ? 9 * GB : 4 * GB,
            state,
          }],
        },
      },
    });
  });
  await page.addInitScript((modo) => {
    window.localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({
      version: 1,
      appearance: { colorMode: modo, themePreset: 'calm', themePresetVersione: 2, uiLanguage: 'it' },
      chat: {},
      workspaces: {},
    }));
  }, colorMode);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__talosHarnessUiRuntime, null, { timeout: 20_000 });
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => {
    const voce = document.querySelector('.talos-sidebar [data-vaia="impostazioni"]');
    if (voce && !voce.offsetParent) {
      const gruppo = voce.closest('.td-nav-group');
      const testata = gruppo?.id ? document.querySelector(`.talos-sidebar [aria-controls="${gruppo.id}"]`) : null;
      if (testata?.getAttribute('aria-expanded') === 'false') testata.click();
    }
    voce?.click();
    window.__talosHarnessUiRuntime?.setSettingsSection?.('models');
  });
  await expect(page.locator('#modelLabCard')).toBeVisible({ timeout: 10_000 });
  await vaiAInstallati(page);
  await expect(page.locator('#modelLabInstalledList [data-c="ListRow"]')).toHaveCount(3);
  return controllo;
}

/** Usa il combobox Calm che vede la persona; il `<select>` sorgente resta intenzionalmente nascosto. */
async function scegliInstallatiCalm(page, value) {
  const sorgente = page.locator('#modelLabInstalledStateFilter');
  const nome = (await sorgente.locator(`option[value="${value}"]`).textContent())?.trim();
  expect(nome).toBeTruthy();
  await page.locator('#modelLabInstalledStateFilter--calm').click();
  await page.getByRole('option', { name: nome, exact: true }).click();
  await expect(sorgente).toHaveValue(value);
}

/** Entra negli installati dalla porta visibile «Aggiungi modello → Da un file», senza premere tab nascosti. */
async function vaiAInstallati(page) {
  await page.locator('[data-settings-add-model]').click();
  const modale = page.locator('#settingsAddModel');
  await expect(modale).toBeVisible();
  await modale.locator('[data-settings-road="file"]').click();
  await expect(modale).toBeHidden();
  await expect(page.locator('#modelLabInstalledPanel')).toBeVisible();
}

/** Rende una coda nel pannello VERO, con le azioni VERE (o senza, per il confronto). */
async function rendi(page, items, { conAzioni = true, soloAttivi = false } = {}) {
  return page.evaluate(({ items, conAzioni, soloAttivi }) => {
    const panel = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"]');
    window.__dlSpie = [];
    const azioni = conAzioni ? {
      pausa: (id) => window.__dlSpie.push(['pausa', id]),
      riprendi: (id) => window.__dlSpie.push(['riprendi', id]),
      annulla: (id) => window.__dlSpie.push(['annulla', id]),
      vediModello: (id) => window.__dlSpie.push(['vediModello', id]),
      elimina: (id) => window.__az.elimina(id),
      rinomina: (id, nome) => window.__az.rinomina(id, nome),
    } : {};
    window.__dl.aggiornaCodaDownload(panel, items, { soloAttivi, stime: new Map(), azioni });
    const coda = panel.querySelector('[data-c="DownloadQueue"]');
    return {
      righe: coda.querySelectorAll('[data-c="DownloadRow"]').length,
      conteggi: [...panel.querySelectorAll('.talos-count [data-c="Badge"]')].map((b) => b.textContent.trim()),
    };
  }, { items, conAzioni, soloAttivi });
}

/** Crea un modello con la rotta VERA d'import: un GGUF minimo (basta la magic, come il server chiede). */
async function creaModello(request, id) {
  const pesi = Buffer.concat([Buffer.from('GGUF'), Buffer.alloc(64, 7)]);
  const risposta = await request.post('/api/v1/local-models/import', {
    headers: {
      'content-type': 'application/octet-stream',
      'x-talos-model-id': id,
      'x-talos-model-filename': 'corsia-d.gguf',
      'x-talos-model-bytes': String(pesi.length),
      'x-talos-model-name': 'Modello della corsia D',
    },
    data: pesi,
  });
  expect(risposta.status(), 'la rotta d’import deve accettare il modello della prova').toBe(200);
  return { id, bytes: pesi.length };
}

/** La riga `ready` di un modello scaricato come la manda il server (`hf-direct-transfer.mjs status()`). */
const rigaPronta = (id, bytes) => ({
  id, state: 'ready', progress: 100, bytes, totalBytes: bytes, reason: null,
  startedAt: '2026-09-19T08:00:00.000Z', finishedAt: '2026-09-19T08:05:00.000Z',
  repo: 'local-upload', file: 'corsia-d.gguf', name: 'Modello della corsia D',
});

/** Un id nuovo per ogni prova: niente collisioni con quello che c'è sul server. */
const idNuovo = (t) => `corsia-d-${t}-${Date.now().toString(36)}`;

async function pulisci(request, id) {
  await request.post(`/api/v1/local-models/${encodeURIComponent(id)}/delete`, { data: {} }).catch(() => {});
}

test('RIPRESA-MODEL-LOCKED — la app mostra il rifiuto e conserva il modello nel server', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), 'Solo banco isolato');
  const id = idNuovo('locked');
  const { bytes } = await creaModello(request, id);
  let tentativi = 0;
  try {
    await page.route('**/api/v1/huggingface/downloads', route => route.fulfill({ json: {
      ok: true, data: { items: [rigaPronta(id, bytes)] },
    } }));
    await page.route(`**/api/v1/local-models/${id}/delete`, route => {
      tentativi += 1;
      return route.fulfill({ status: 409, json: { ok: false,
        error: { code: 'MODEL_LOCKED', message: 'Il modello è in uso: libera la memoria prima di eliminarlo.' },
      } });
    });
    await page.goto('/');
    await expect(page.locator('#talosAvvio')).toHaveCount(0);
    const voce = page.locator('.talos-sidebar [data-vaia="impostazioni"]');
    const gruppo = await voce.evaluate(el => el.closest('.td-nav-group')?.id);
    if (gruppo) {
      const testata = page.locator(`.talos-sidebar [aria-controls="${gruppo}"]`);
      if (await testata.getAttribute('aria-expanded') === 'false') await testata.click();
    }
    await voce.click();
    await page.locator('#setting-tab-models').click();
    await page.locator('#labSchedaDownloads').click();
    const riga = page.locator(`#modelLabDownloadsPanel [data-download-id="${id}"]`);
    await riga.locator('[data-action="eliminaModello"]').click();
    expect(tentativi).toBe(0);
    await expect(riga.locator('[data-action="annullaEliminaModello"]')).toBeFocused();
    await riga.locator('[data-action="eseguiEliminaModello"]').click();
    await expect(riga.locator('[data-c="EsitoModello"]')).toContainText('Il modello è in uso');
    await expect(riga.locator('[data-c="EsitoModello"]')).not.toHaveAttribute('data-tono', 'success');
    expect(tentativi).toBe(1);
    expect((await (await request.get('/api/v1/local-models')).json()).data.items.map(model => model.id)).toContain(id);
    await expect(riga).not.toContainText('Eliminato dal disco:');
  } finally { await pulisci(request, id); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1 · I DUE PASSI
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('AZ-DUE-PASSI — il primo clic ARMA e non cancella: la rotta non viene chiamata, il fuoco va su «Annulla»', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const id = idNuovo('passi');
  const { bytes } = await creaModello(request, id);
  try {
    await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });
    await rendi(page, [rigaPronta(id, bytes)]);

    const riga = page.locator(`${CODA} [data-c="DownloadRow"]`);
    const apri = riga.locator('[data-action="eliminaModello"]');
    await expect(apri, 'il comando c’è, e dice cosa fa').toHaveText('Elimina dal disco');

    await apri.click();

    // Il pannello è nella RIGA, non in fondo alla sezione né in un velo.
    const pannello = riga.locator('[data-c="ConfermaEliminazione"]');
    await expect(pannello, 'il pannello di conferma vive dentro la riga').toHaveCount(1);
    await expect(page.locator('.overlay-layer:not([hidden])'), 'e non è un velo').toHaveCount(0);
    await expect(pannello.locator('.talos-check-card__title')).toHaveText(`Eliminare «Modello della corsia D»?`);
    /* ⛔ LA FRASE DICE COSA SPARISCE DAVVERO: i file del modello, non «un manifest» (misura del
       19/09: `delete` porta via la cartella del modello, il manifest e il nome). */
    await expect(pannello.locator('p')).toContainText('Spariscono i file del modello');
    await expect(pannello.locator('[data-action="eseguiEliminaModello"]')).toHaveText('Elimina dal disco');
    await expect(pannello.locator('[data-action="annullaEliminaModello"]')).toHaveText('Annulla');

    // ⛔⛔ IL PRIMO PASSO NON CANCELLA: nessuna chiamata alla rotta, e il modello è ancora là.
    expect(await page.evaluate(() => window.__az.spie), 'il primo clic ARMA: non chiama nessuna rotta').toEqual([]);
    const ancora = await request.get('/api/v1/local-models');
    const elenco = (await ancora.json()).data.items.map((m) => m.id);
    expect(elenco, 'il modello è ancora installato: la conferma è armata, non eseguita').toContain(id);

    // Il fuoco entra su «Annulla»: chi arriva da tastiera non trova la punta delle dita sul comando che cancella.
    expect(await page.evaluate(() => document.activeElement?.dataset?.action ?? document.activeElement?.tagName)).toBe('annullaEliminaModello');
  } finally { await pulisci(request, id); }
});

test('AZ-ANNULLA — «Annulla» chiude il pannello, non tocca niente, e riporta il fuoco al comando che l’aveva aperto', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const id = idNuovo('annulla');
  const { bytes } = await creaModello(request, id);
  try {
    await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });
    await rendi(page, [rigaPronta(id, bytes)]);
    const riga = page.locator(`${CODA} [data-c="DownloadRow"]`);
    await riga.locator('[data-action="eliminaModello"]').click();

    await riga.locator('[data-action="annullaEliminaModello"]').click();

    await expect(riga.locator('[data-c="ConfermaEliminazione"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__az.spie), 'annullare non chiama nessuna rotta').toEqual([]);
    expect((await (await request.get('/api/v1/local-models')).json()).data.items.map((m) => m.id)).toContain(id);
    // Il fuoco torna al comando che aveva aperto il pannello.
    expect(await page.evaluate(() => document.activeElement?.dataset?.action ?? null)).toBe('eliminaModello');
    // E i due comandi tornano disponibili: il comando è lo stesso di prima, non uno nuovo.
    await expect(riga.locator('[data-action="eliminaModello"]')).toHaveText('Elimina dal disco');
  } finally { await pulisci(request, id); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2 · LA ROTTA VERA, E LA FRASE CHE NON MENTE
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('AZ-ELIMINA — il secondo clic esegue sulla rotta vera: il modello sparisce dall’elenco del SERVER, e la riga lo dice', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const id = idNuovo('elimina');
  const { bytes } = await creaModello(request, id);
  await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });

  expect((await (await request.get('/api/v1/local-models')).json()).data.items.map((m) => m.id), 'il modello c’è prima').toContain(id);
  await rendi(page, [rigaPronta(id, bytes)]);
  const riga = page.locator(`${CODA} [data-c="DownloadRow"]`);
  await expect(riga).toContainText('Disponibile nei modelli installati.');
  await riga.locator('[data-action="eliminaModello"]').click();
  await riga.locator('[data-action="eseguiEliminaModello"]').click();

  // ⛔ LA PROVA È L'ELENCO DEL SERVER, non la busta della risposta.
  await expect.poll(async () => (await (await request.get('/api/v1/local-models')).json()).data.items.map((m) => m.id), { timeout: 5000 })
    .not.toContain(id);
  expect(await page.evaluate(() => window.__az.spie), 'la rotta è stata chiamata una volta sola').toEqual([`/api/v1/local-models/${encodeURIComponent(id)}/delete`]);

  // L'esito si vede, col tono giusto, e il pannello si è chiuso (il comando non serve più).
  const esito = riga.locator('[data-c="EsitoModello"]');
  await expect(esito).toHaveAttribute('role', 'status');
  await expect(esito).toHaveAttribute('data-tono', 'success');
  await expect(esito).toContainText('Eliminato dal disco');
  await expect(riga.locator('[data-c="ConfermaEliminazione"]')).toHaveCount(0);

  /* ⛔ AZ-FRASE — la riga NON può continuare a dire «Disponibile nei modelli installati»: il
     registro dei trasferimenti tiene la voce `ready` in memoria anche dopo l'eliminazione
     (misurato il 19/09: `GET /huggingface/downloads` porta ancora la riga). */
  await expect(riga, 'la frase vecchia non sopravvive all’eliminazione').not.toContainText('Disponibile nei modelli installati.');
  await expect(riga).toContainText('Eliminato dal disco: per usarlo di nuovo va scaricato o importato.');
  // E il badge resta «Completato»: il trasferimento È completato, è storia vera, e i contatori combaciano.
  await expect(riga.locator('.talos-badge').first()).toHaveText('Completato');

  // «Vedi modello» prometterebbe una pagina che non esiste più: si spegne, e dice perché.
  const vedi = riga.locator('[data-action="vediModello"]');
  await expect(vedi).toBeDisabled();
  expect(await vedi.getAttribute('title')).toContain('non è più sul disco');
  // E non si rioffre l'eliminazione di qualcosa che non c'è più.
  await expect(riga.locator('[data-action="eliminaModello"]')).toHaveCount(0);
  await expect(riga.locator('[data-action="rinominaModello"]')).toHaveCount(0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3 · IL VERSO CHE DEVE FALLIRE
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('AZ-VERSO-ROTTO — id inesistente: la rotta risponde 200 «deleted», il verdetto NO, e la riga dice «Non eliminato»', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const vivo = idNuovo('rotto');
  const { bytes } = await creaModello(request, vivo);
  const fantasma = `${idNuovo('fantasma')}-non-esiste`;
  try {
    await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });
    /* ⛔ IL FATTO CHE RENDE NECESSARIA LA PROVA, misurato qui e ora: la rotta `delete` su un id che
       non esiste risponde **200** e dichiara `deleted:true`. Sul disco non cambia niente. */
    const bugiarda = await request.post(`/api/v1/local-models/${encodeURIComponent(fantasma)}/delete`, { data: {} });
    expect(bugiarda.status(), '⛔ la rotta dichiara riuscita un’eliminazione che non è avvenuta').toBe(200);
    expect((await bugiarda.json()).data.deleted).toBe(true);

    /* La riga che il fantasma la mostra comunque: la coda può portare un id che il deposito non ha
       più (un'altra finestra l'ha eliminato, una cartella tolta a mano). */
    await rendi(page, [rigaPronta(fantasma, 68), rigaPronta(vivo, bytes)]);
    const riga = page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${fantasma}"]`);
    await riga.locator('[data-action="eliminaModello"]').click();
    await riga.locator('[data-action="eseguiEliminaModello"]').click();

    // Il pannello resta aperto (c'è il comando per riprovare) e l'errore è DENTRO, col tono giusto.
    const esito = riga.locator('[data-c="EsitoModello"]');
    await expect(esito).toHaveAttribute('data-tono', 'danger');
    await expect(esito).toContainText('Non eliminato');
    /* ⛔ E la ragione è quella VERA: non «è ancora installato» (non lo è mai stato), ma «non c'era
       niente da eliminare» — la differenza fra le due frasi è tutta la differenza fra una UI che
       guarda il mondo e una che ripete la busta del server. */
    await expect(esito).toContainText('non c’era niente da eliminare');
    await expect(riga.locator('[data-c="ConfermaEliminazione"]')).toHaveCount(1);
    // ⛔ E NON si finge riuscito: niente frase di vittoria da nessuna parte nella riga.
    await expect(riga).not.toContainText('non è più su questo computer');
    await expect(riga).not.toContainText('Eliminato dal disco:');
    // L'altra riga non è stata toccata.
    await expect(page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${vivo}"]`)).toHaveCount(1);
  } finally { await pulisci(request, vivo); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4 · LA RINOMINA
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('AZ-RINOMINA — il campo dice cosa cambia, e la rotta vera rinomina: id, percorso e byte restano gli stessi', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const id = idNuovo('rinomina');
  const { bytes } = await creaModello(request, id);
  try {
    await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });
    const prima = (await (await request.get('/api/v1/local-models')).json()).data.items.find((m) => m.id === id);
    await rendi(page, [rigaPronta(id, bytes)]);
    const riga = page.locator(`${CODA} [data-c="DownloadRow"]`);
    await riga.locator('[data-action="rinominaModello"]').click();

    const campo = riga.locator('[data-c="CampoRinomina"]');
    await expect(campo, 'il campo vive dentro la riga').toHaveCount(1);
    // ⛔ IL CAMPO DICE COSA CAMBIA — ed è la misura del 19/09: `rename` scrive solo il nome MOSTRATO.
    await expect(campo.locator('label')).toContainText('Nome mostrato');
    await expect(campo.locator('p').first()).toContainText('Cambia solo il nome con cui il modello compare qui e nella sua pagina');
    await expect(campo.locator('p').first()).toContainText('il file e la cartella sul disco non si toccano');
    // Il fuoco entra nel campo, col testo selezionato: si scrive sopra, non si cancella a mano.
    expect(await page.evaluate(() => document.activeElement?.dataset?.campo ?? null)).toBe('nomeModello');
    expect(await page.evaluate(() => { const i = document.activeElement; return i.selectionStart === 0 && i.selectionEnd === i.value.length; })).toBe(true);

    await campo.locator('input').fill('Gemma locale di prova');
    await campo.locator('[data-action="salvaNomeModello"]').click();

    const esito = riga.locator('[data-c="EsitoModello"]');
    await expect(esito).toHaveAttribute('data-tono', 'success');
    await expect(esito).toContainText('Nome salvato');
    await expect(esito).toContainText('Gemma locale di prova');
    await expect(riga.locator('[data-c="CampoRinomina"]')).toHaveCount(0);

    /* ⛔ LA PROVA È L'ELENCO DEL SERVER: il nome è cambiato, e NIENT'ALTRO è cambiato — l'id, il
       percorso e i byte restano quelli di prima (sul disco: solo `manifests/<id>.name.json`). */
    const dopo = (await (await request.get('/api/v1/local-models')).json()).data.items.find((m) => m.id === id);
    expect(dopo.name).toBe('Gemma locale di prova');
    expect(dopo.path, 'il percorso non si tocca: la rinomina non sposta file').toBe(prima.path);
    expect(dopo.bytes, 'i pesi non si toccano').toBe(prima.bytes);
  } finally { await pulisci(request, id); }
});

test('AZ-ROTTO-RINOMINA — id inesistente ⇒ il nome NON è salvato e la riga lo dice', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const fantasma = `${idNuovo('rinomina-rotto')}-non-esiste`;
  await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });
  await rendi(page, [rigaPronta(fantasma, 68)]);
  const riga = page.locator(`${CODA} [data-c="DownloadRow"]`);
  await riga.locator('[data-action="rinominaModello"]').click();
  await riga.locator('[data-c="CampoRinomina"] input').fill('Un nome che non avrà mai');
  await riga.locator('[data-action="salvaNomeModello"]').click();

  const esito = riga.locator('[data-c="EsitoModello"]');
  await expect(esito).toHaveAttribute('data-tono', 'danger');
  await expect(esito).toContainText('Nome non salvato');
  await expect(esito).not.toContainText('Nome salvato');
  await expect(riga.locator('[data-c="CampoRinomina"]'), 'il campo resta aperto: si può correggere').toHaveCount(1);
  // La rotta vera ha risposto 404 `MODEL_NOT_FOUND` (misurato): il messaggio lo porta a schermo.
  expect(await page.evaluate(() => window.__az.spie)).toEqual([`/api/v1/local-models/${encodeURIComponent(fantasma)}/rename`]);
});

test('AZ-CAMPO-VUOTO — un nome vuoto non chiama la rete e non manda la persona a cercare un guasto del server', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const id = idNuovo('vuoto');
  const { bytes } = await creaModello(request, id);
  try {
    await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });
    await rendi(page, [rigaPronta(id, bytes)]);
    const riga = page.locator(`${CODA} [data-c="DownloadRow"]`);
    await riga.locator('[data-action="rinominaModello"]').click();
    await riga.locator('[data-c="CampoRinomina"] input').fill('   ');

    /* ⛔ IL COMANDO RESTA PREMIBILE, e deve: spento non spiegherebbe niente, e chi preme Invio a
       campo vuoto non vedrebbe succedere NIENTE senza sapere perché. Premerlo è ciò che fa
       ARRIVARE la risposta. */
    await expect(riga.locator('[data-action="salvaNomeModello"]')).toBeEnabled();
    await expect(riga.locator('[data-action="salvaNomeModello"]')).toHaveText('Salva nome');
    await riga.locator('[data-action="salvaNomeModello"]').click();
    // E l'invio da tastiera passa dalla stessa strada: nessuna delle due arriva alla rete.
    await riga.locator('[data-c="CampoRinomina"] input').press('Enter');
    expect(await page.evaluate(() => window.__az.spie), '⛔ il deposito risponde a un nome vuoto con un 500 «Errore interno»: non ci si arriva').toEqual([]);
    // L'errore lo dice il campo, ed è un messaggio di campo (annunciato), non un guasto del server.
    await expect(riga.locator('[data-campo-errore]')).toHaveAttribute('role', 'alert');
    await expect(riga.locator('[data-campo-errore]')).toContainText('Scrivi un nome');
    await expect(riga.locator('[data-c="CampoRinomina"] input')).toHaveAttribute('aria-invalid', 'true');
    // E il campo non si svuota: quello che la persona ha scritto resta dov'è, e si può correggere.
    await expect(riga.locator('[data-c="CampoRinomina"] input')).toHaveValue('   ');
  } finally { await pulisci(request, id); }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5 · FILTRI INSTALLATI — ingresso vero, controllo Calm e refresh periodico
// ─────────────────────────────────────────────────────────────────────────────────────────────

test('RIPRESA-INSTALLATI-FILTRI — ricerca e stato restano applicati durante il refresh e si azzerano a schermo', async ({ page }) => {
  const controllo = await apriInstallatiConAggiornamento(page);
  const righe = page.locator('#modelLabInstalledList [data-c="ListRow"]');
  const ricerca = page.locator('#modelLabInstalledSearchControl');
  const calm = page.locator('#modelLabInstalledStateFilter--calm');

  await scegliInstallatiCalm(page, 'caricato');
  await expect(righe).toHaveCount(1);
  await expect(righe).toContainText('Qwen3 8B');

  await scegliInstallatiCalm(page, 'disco');
  await ricerca.fill('Gemma');
  await expect(righe).toHaveCount(1);
  await expect(righe).toContainText('Gemma 3 12B');

  // Il polling della coda è il percorso reale che rilegge gli installati quando un download è pronto.
  await page.locator('#labSchedaDownloads').click();
  await expect.poll(() => controllo.download).toBeGreaterThan(0);
  await vaiAInstallati(page);
  controllo.pronto = true;
  await expect.poll(() => controllo.locali, { timeout: 5_000 }).toBeGreaterThan(1);
  await expect(righe).toHaveCount(2);
  await expect(righe).toContainText(['Gemma 3 12B', 'Gemma aggiornata']);
  await expect(ricerca).toHaveValue('Gemma');
  await expect(page.locator('#modelLabInstalledStateFilter')).toHaveValue('disco');
  await expect(calm).toContainText('Solo sul disco');

  await ricerca.fill('nessuna-corrispondenza');
  await expect(righe).toHaveCount(0);
  const azzera = page.locator('#modelLabInstalledPanel [data-clear="installati"]');
  await expect(azzera).toBeVisible();
  await azzera.click();
  await expect(ricerca).toHaveValue('');
  await expect(page.locator('#modelLabInstalledStateFilter')).toHaveValue('tutti');
  await expect(calm).toContainText('Tutti gli stati');
  await expect(righe).toHaveCount(4);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 6 · LE FOTO — sul server VERO, senza eseguire niente
// ─────────────────────────────────────────────────────────────────────────────────────────────

const FOTO = resolve(process.cwd(), 'artifacts', 'lab-installati-azioni-2026-09-19');

/**
 * Aspetta che la pagina sia FERMA prima di fotografarla: un fotogramma preso a metà di una
 * transizione è una foto che accusa il prodotto di un difetto che non ha.
 * ⛔ Il metodo è quello indicato dalla ricerca (19/09/2026): non un tempo fisso, ma lo stato reale —
 *   si lascia girare un fotogramma perché le animazioni appena programmate si registrino, poi si
 *   aspettano TUTTE le animazioni non infinite (`document.getAnimations()`, escludendo le
 *   `iterations: Infinity`, che non finirebbero mai). Fonte: qaskills.sh «Visual Testing Animation
 *   Freeze Strategies» (il blocco `getAnimations()` + `animation.finished`), letta il 19/09/2026.
 */
async function attendiFermo(pagina) {
  await pagina.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => r()));
    const animazioni = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity);
    await Promise.allSettled(animazioni.map((a) => a.finished));
  });
}

/**
 * Le due azioni FOTOGRAFATE sul server vero (il 4174 dell'owner), nei due temi a 1024 e 1440.
 *
 * ⛔ L'AZIONE NON SI ESEGUE: si apre il pannello (che per costruzione non chiama niente), si
 *   fotografa, si annulla. La prova lo DIMOSTRA invece di prometterlo: su un server vivo ogni
 *   metodo che non sia di lettura viene fermato e contato, e a fine giro il conto deve essere ZERO.
 * ⛔ La coda è quella VERA del server (`GET`, sola lettura): la riga pronta di oggi, non una
 *   fixture. Se il server non ha nessun download completato, la prova si salta e lo dice.
 */
test('AZ-FOTO — «Elimina» e «Rinomina» a schermo nei due temi a 1024 e 1440, fotografati e mai eseguiti', async ({ browser, request }, testInfo) => {
  const base = (testInfo.project.use.baseURL || 'http://127.0.0.1:4176/').replace(/\/+$/, '');
  const host = new URL(base).port;
  const pronte = ((await (await request.get('/api/v1/huggingface/downloads')).json())?.data?.items || []).filter((i) => i.state === 'ready');
  test.skip(!pronte.length, 'su questo server non c’è nessun download completato da fotografare');

  const cartella = resolve(FOTO, `sul-${host}`);
  await mkdir(cartella, { recursive: true });
  const righe = [];
  for (const [larghezza, altezza] of [[1024, 800], [1440, 900]]) {
    for (const modo of ['dark', 'light']) {
      // Un contesto nuovo per ogni combinazione: tema, viewport e pagina non si ereditano a metà.
      const contesto = await browser.newContext({ viewport: { width: larghezza, height: altezza }, colorScheme: modo, locale: 'it-IT' });
      const pagina = await contesto.newPage();
      try {
        const { fermati } = await apriIlLaboratorio(pagina, { colorMode: modo, dove: base });
        await rendi(pagina, pronte);
        const riga = pagina.locator(`${CODA} [data-c="DownloadRow"]`).first();

        // 1) L'ELIMINAZIONE: si ARMA e si fotografa. Il comando che esegue non si preme — mai.
        await riga.locator('[data-action="eliminaModello"]').click();
        await riga.scrollIntoViewIfNeeded();
        await attendiFermo(pagina);
        await pagina.screenshot({ path: resolve(cartella, `elimina-${modo}-${larghezza}x${altezza}-pagina.png`), fullPage: true });
        await riga.locator('[data-c="ConfermaEliminazione"]').screenshot({ path: resolve(cartella, `elimina-${modo}-${larghezza}x${altezza}-pannello.png`) });
        /* La frase che dice cosa sparisce, letta DALLO SCHERMO e scritta accanto alle foto: è la
           cosa che l'owner vuole sapere, e una foto da sola non la cita a parole. */
        const misure = await pagina.evaluate(() => {
          const p = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"] [data-c="ConfermaEliminazione"]');
          const r = p.getBoundingClientRect();
          return {
            frase: p.querySelector('p').textContent.trim(),
            riquadro: `${Math.round(r.width)}×${Math.round(r.height)}`,
            fuoco: document.activeElement?.dataset?.action ?? document.activeElement?.tagName,
            dentroLaRiga: Boolean(p.closest('[data-c="DownloadRow"]')),
            comandoCheEsegue: p.querySelector('[data-action="eseguiEliminaModello"]').textContent,
            annulla: p.querySelector('[data-action="annullaEliminaModello"]').textContent,
          };
        });

        // 2) LA RINOMINA: si apre il campo e si fotografa. Non si salva.
        await riga.locator('[data-action="annullaEliminaModello"]').click();
        await riga.locator('[data-action="rinominaModello"]').click();
        await riga.locator('[data-c="CampoRinomina"] input').fill('Un nome di prova, mai salvato');
        await attendiFermo(pagina);
        await pagina.screenshot({ path: resolve(cartella, `rinomina-${modo}-${larghezza}x${altezza}-pagina.png`), fullPage: true });
        await riga.locator('[data-c="CampoRinomina"]').screenshot({ path: resolve(cartella, `rinomina-${modo}-${larghezza}x${altezza}-pannello.png`) });
        const campo = await pagina.evaluate(() => {
          const p = document.querySelector('#modelLabCard [data-model-lab-panel="downloads"] [data-c="CampoRinomina"]');
          return {
            etichetta: p.querySelector('label')?.textContent.trim(),
            aiuto: p.querySelector('p')?.textContent.trim(),
            fuoco: document.activeElement?.dataset?.campo ?? document.activeElement?.tagName,
            valore: p.querySelector('input').value,
          };
        });
        await riga.locator('[data-action="annullaRinominaModello"]').click();

        righe.push(`${modo} ${larghezza}x${altezza} · elimina: ${JSON.stringify(misure)} · rinomina: ${JSON.stringify(campo)} · nonGETfermati=${(fermati || []).length}`);
        /* ⛔ LA PROVA CHE NON SI È SCRITTO NIENTE: su un server vivo ogni metodo che non sia di
           lettura è stato fermato, e nessuno è stato fermato — perché nessuno è partito. */
        expect(fermati, '⛔ sul server vivo non deve uscire NESSUN metodo che non sia di lettura').toEqual([]);
      } finally {
        await contesto.close();
      }
    }
  }
  await mkdir(cartella, { recursive: true });
  await writeFile(resolve(cartella, 'misure.txt'), righe.join('\n') + '\n');
  expect(righe, 'le quattro combinazioni: due temi × due larghezze').toHaveLength(4);
  expect(righe.join(' ')).toContain('dentroLaRiga":true');
});


test('AZ-FASE4 — senza `azioni` la riga è quella di sempre; con i comandi nuovi le voci di FASE 4 restano tutte', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const id = idNuovo('fase4');
  const { bytes } = await creaModello(request, id);
  const coda = [
    { id: `${id}-a`, state: 'running', progress: 64, bytes: 5_400_000_000, totalBytes: 8_500_000_000, request: { repo: 'Qwen/Qwen3-8B-GGUF', files: [{ path: 'Qwen3-8B-Q8_0.gguf' }] } },
    { id: `${id}-f`, state: 'failed', progress: 15, bytes: 1_200_000_000, totalBytes: 8_100_000_000, reason: 'NETWORK', request: { repo: 'C/G', files: [{ path: 'g.gguf' }] } },
    rigaPronta(id, bytes),
  ];
  try {
    await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });

    /* ⛔ PRIMA: il disegno di FASE 4 — nessuna azione, quindi nessun comando nuovo. È il contratto
       che il laboratorio dei componenti (`lab/main.js:442`, senza `azioni`) e il cancello
       `COMP CodaDownload` misurano contro il mockup: se qui comparisse qualcosa, cambierebbe anche lì. */
    await rendi(page, coda, { conAzioni: false });
    const senza = await struttura(page, CODA);
    const senzaTesti = await page.evaluate(() => document.querySelector('#modelLabCard [data-model-lab-panel="downloads"]').innerText.replace(/\s+/gu, ' ').trim());
    expect(await page.evaluate(() => document.querySelectorAll('[data-action="eliminaModello"], [data-action="rinominaModello"]').length),
      '⛔ senza azioni i due comandi NON esistono: il laboratorio non passa nessuna azione, e il mockup non li ha').toBe(0);
    expect(senzaTesti).toContain('Disponibile nei modelli installati.');

    // DOPO: coi comandi nuovi.
    await rendi(page, coda);
    const con = await struttura(page, CODA);

    /* ⛔ NIENTE PERSO, e la forma della prova è la più stretta possibile: il disegno di FASE 4 è un
       PREFISSO di quello nuovo. Il comando in più si AGGIUNGE in coda alla riga `ready`; qualunque
       nodo vecchio che cambiasse, sparisse o si spostasse romperebbe l'uguaglianza dei primi N. */
    expect(con.slice(0, senza.length), 'le voci di FASE 4 restano dove erano: i comandi nuovi si aggiungono in coda').toEqual(senza);

    // E le voci di FASE 4 ci sono ancora tutte, una per una.
    const riga = page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${id}"]`);
    await expect(riga.locator('[data-action="vediModello"]')).toHaveText('Vedi modello');
    const lavora = page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${id}-a"]`);
    await expect(lavora.locator('[data-action="pausa"]')).toHaveText('Pausa');
    await expect(lavora.locator('[data-action="annulla"]')).toHaveText('Annulla');
    await expect(lavora.locator('progress')).toHaveAttribute('value', '64');
    await expect(lavora).toContainText('64%');
    const fallita = page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${id}-f"]`);
    await expect(fallita.locator('[data-action="riprendiDownload"]')).toHaveText('Riprendi');
    await expect(fallita.locator('[data-action="annulla"]'), 'lo stop non si disegna dove il trasporto lo rifiuta').toHaveCount(0);
    // I contatori dicono quello che c'è, e la somma fa il numero delle righe.
    const contati = await page.evaluate(() => [...document.querySelectorAll('#modelLabCard [data-model-lab-panel="downloads"] .talos-count [data-c="Badge"]')].map((b) => b.textContent.trim()));
    expect(contati).toEqual(['1 in corso', '1 fallito', '1 completato']);
    expect(contati.reduce((t, b) => t + Number(b.split(' ')[0]), 0)).toBe(3);
  } finally { await pulisci(request, id); }
});

test('AZ-RIDISEGNO — il giro di ridisegno (quello che l’app fa ogni 800 ms) non porta via il pannello né il nome scritto', async ({ page, request }, testInfo) => {
  test.skip(SU_SERVER_VIVO(portaDi(testInfo)), '⛔ sul server dell’owner le rotte di scrittura non si eseguono');
  const id = idNuovo('ridisegno');
  const { bytes } = await creaModello(request, id);
  try {
    await apriIlLaboratorio(page, { dove: testInfo.project.use.baseURL });
    // Una riga che scarica: è la condizione in cui la coda si ridisegna da sola, ogni 800 ms.
    const coda = [
      { id: `${id}-a`, state: 'running', progress: 30, bytes: 3_000_000_000, totalBytes: 10_000_000_000, request: { repo: 'Q/V', files: [{ path: 'v.gguf' }] } },
      rigaPronta(id, bytes),
    ];
    await rendi(page, coda);
    const riga = page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${id}"]`);
    await riga.locator('[data-action="rinominaModello"]').click();
    await riga.locator('[data-c="CampoRinomina"] input').fill('Nome scritto a metà');

    // ⛔ Il giro di ridisegno: la STESSA chiamata che fa l'app quando rilegge i download.
    await rendi(page, coda);

    const campo = page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${id}"] [data-c="CampoRinomina"]`);
    await expect(campo, 'il pannello aperto sopravvive al ridisegno').toHaveCount(1);
    await expect(campo.locator('input'), '⛔ e non porta via il nome che la persona stava scrivendo').toHaveValue('Nome scritto a metà');
    /* ⛔ E NON RIPRENDE IL FUOCO: riselezionare il testo a ogni giro (ogni 800 ms) strapperebbe la
       tastiera di mano a chi sta scrivendo. */
    expect(await page.evaluate(() => document.activeElement?.dataset?.campo ?? null), 'il nome si scrive una volta sola: il ridisegno non riseleziona').toBeNull();

    // Il pannello dell'eliminazione, stessa storia: aperto attraverso un giro, resta aperto.
    await rendi(page, coda);
    await page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${id}"] [data-action="annullaRinominaModello"]`).click();
    await page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${id}"] [data-action="eliminaModello"]`).click();
    await rendi(page, coda);
    await expect(page.locator(`${CODA} [data-c="DownloadRow"][data-download-id="${id}"] [data-c="ConfermaEliminazione"]`)).toHaveCount(1);
    // E la rotta non è mai stata chiamata: nessuno dei due pannelli ha eseguito niente da solo.
    expect(await page.evaluate(() => window.__az.spie)).toEqual([]);
  } finally { await pulisci(request, id); }
});
