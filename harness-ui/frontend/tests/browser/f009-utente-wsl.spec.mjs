import { expect, test } from '@playwright/test';

/*
 * ⛔⛔ F009 (owner 01/10/2026) — a schermo: il blocco «con che utente girano i comandi in Linux» nel velo dei permessi (con
 *   l'interruttore, «nel foglio, sotto la riga»), la carta della conferma di root che vale per la sessione, e il «dove»
 *   dell'esito di un comando. Gira sul 4174: ogni richiesta che non è GET e che questa prova non intercetta si FERMA e si
 *   conta, e le scritture che la prova esercita (POST /api/v1/wsl, /approve) le risponde la prova stessa.
 */

const STATO_VERO = {
  preferenze: { usaUtenteNormale: true },
  wsl: { disponibile: true, distro: 'Ubuntu', utentePredefinito: 'root', predefinitoRoot: true, utenteNormale: null, utenteUsato: 'root', root: true,
    montaggi: [{ montaggio: '/mnt/c', metadata: false }, { montaggio: '/mnt/d', metadata: false }] },
};
const STATO_MARIO = (acceso) => ({
  preferenze: { usaUtenteNormale: acceso },
  wsl: { ...STATO_VERO.wsl, utenteNormale: 'mario', utenteUsato: acceso ? 'mario' : 'root', root: !acceso },
});
const ETICHETTA_ROOT = "wsl2 (Linux in WSL come root; nessun isolamento: /mnt/c è il disco di Windows con i diritti dell'utente Windows di TALOS, e lì i permessi Linux non valgono)";

/** Le scritture che nessuno ha previsto si fermano e si contano: sul 4174 non arriva niente che non sia una lettura. */
async function guardia(page) {
  const fermate = [];
  await page.route('**/api/**', (rotta) => {
    if (rotta.request().method() === 'GET') return rotta.fallback();
    fermate.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
    return rotta.abort();
  });
  return fermate;
}

async function apriApp(page, tema = 'dark') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(({ colorMode }) => {
    if (window.top !== window) return;
    try { localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiFontScale: 'default' }, chat: { model: 'qwen/qwen3.8-flash' } })); }
    catch { /* finestra privata */ }
  }, { colorMode: tema });
  await page.route('**/api/v1/sessions/f009-*/events*', () => { /* VELO-SPEC (08/10/2026): aperto e muto — un corpo che si chiude fa riaprire lo stream, e ogni onopen rimette la chat nella storia */ });
  await page.goto('/');
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => Boolean(window.__talosHarnessUiRuntime));
}

async function apriVeloPermessi(page) {
  await page.locator('.talos-sidebar [data-vaia="chat"]').first().click();
  await expect(page.locator('#schermoChat')).toBeVisible();
  await page.locator('[data-open-sheet="permissions"]:visible').first().click();
  await expect(page.locator('#veloPermessi')).toBeVisible();
}

test('F009-UI-01: il velo dice con che utente girano i comandi in Linux, e l interruttore scrive la preferenza di tutte le sessioni', async ({ page }) => {
  const fermate = await guardia(page);
  const scritte = [];
  let risposta = STATO_VERO;
  await page.route('**/api/v1/wsl', (rotta) => {
    if (rotta.request().method() === 'GET') return rotta.fulfill({ json: { ok: true, data: risposta } });
    scritte.push(rotta.request().postDataJSON());
    return rotta.fulfill({ json: { ok: true, data: STATO_MARIO(false) } });
  });
  await apriApp(page);
  await apriVeloPermessi(page);
  const blocco = page.locator('#veloPermessiWsl');
  await expect(blocco).toBeVisible();
  await expect(page.locator('#veloPermessiWslChi')).toHaveText('In Linux i comandi girano come root (Ubuntu)');
  await expect(page.locator('#veloPermessiWslDischi')).toContainText('/mnt/c, /mnt/d sono i dischi di Windows: nessun isolamento, e lì i permessi Linux non valgono.');
  await expect(page.locator('#veloPermessiWslNota')).toContainText('Vale per tutte le sessioni. Ubuntu non ne ha uno.');
  await expect(page.locator('#veloPermessiWslNota .talos-mono')).toHaveText('wsl -d Ubuntu -u root adduser <nome>');
  /* Misurato sulla prima foto: la frase dei dischi finiva in «…» e il blocco toccava la griglia. Le righe vanno a capo, e sopra
     c'è lo stesso ritmo della griglia (10 px). */
  for (const riga of ['#veloPermessiWslDischi', '#veloPermessiWslNota']) {
    expect(await page.locator(riga).evaluate((n) => n.scrollWidth <= n.clientWidth), `${riga} troncata`).toBe(true);
  }
  const spazio = await page.evaluate(() => document.querySelector('#veloPermessiWsl').getBoundingClientRect().top
    - document.querySelector('#veloPermessi [aria-label="Dove girano i comandi"]').getBoundingClientRect().bottom);
  expect(Math.round(spazio)).toBe(10);
  const interruttore = page.locator('#veloPermessiWslNormale');
  await expect(interruttore).toBeChecked();
  await page.locator('label[for="veloPermessiWslNormale"]').click();
  await expect.poll(() => scritte.length).toBe(1);
  expect(scritte[0]).toEqual({ usaUtenteNormale: false });
  await expect(interruttore).not.toBeChecked();
  await expect(page.locator('#veloPermessiWslNota')).toContainText('Spento: i comandi girano come root anche se c’è mario.');
  expect(fermate).toEqual([]);
});

test('F009-UI-02: se il server rifiuta, l interruttore torna com era e lo dice', async ({ page }) => {
  await guardia(page);
  await page.route('**/api/v1/wsl', (rotta) => rotta.request().method() === 'GET'
    ? rotta.fulfill({ json: { ok: true, data: STATO_VERO } })
    : rotta.fulfill({ status: 503, json: { ok: false, error: { code: 'WSL_STORE_UNAVAILABLE', message: 'Preferenze di WSL non disponibili' } } }));
  await apriApp(page);
  await apriVeloPermessi(page);
  await page.locator('label[for="veloPermessiWslNormale"]').click();
  await expect(page.locator('#veloPermessiWslNormale')).toBeChecked();
  await expect(page.locator('#veloPermessiWslNormale')).toBeEnabled();
});

test('F009-UI-07 (fase B): con la casa Linux pronta «Automatico» e «Linux (WSL2)» dicono che anche i file lavorano in Linux; senza, tornano i testi di sempre', async ({ page }) => {
  const fermate = await guardia(page);
  let risposta = { ...STATO_VERO, wsl: { ...STATO_VERO.wsl, casaLinux: { pronta: true } } };
  await page.route('**/api/v1/wsl', (rotta) => rotta.fulfill({ json: { ok: true, data: risposta } }));
  await apriApp(page);
  await apriVeloPermessi(page);
  const automatico = page.locator('#veloPermessi [data-dove-choice=""]');
  const linux = page.locator('#veloPermessi [data-dove-choice="wsl2"]');
  await expect(automatico.locator('.talos-badge')).toHaveText('Linux con WSL');
  await expect(automatico.locator('.talos-choice__sub')).toHaveText('Una casa sola: con WSL comandi e attrezzi dei file lavorano in Linux, senza WSL su Windows.');
  await expect(linux.locator('.talos-choice__sub')).toContainText('Sempre in Linux, comandi e attrezzi dei file con gli stessi percorsi.');
  await expect(linux.locator('.talos-badge')).toHaveText('Consigliato');
  for (const scelta of [automatico, linux]) {
    expect(await scelta.locator('.talos-choice__sub').evaluate((n) => n.scrollHeight <= n.clientHeight + 1 && n.scrollWidth <= n.clientWidth + 1), 'il testo nuovo non è tagliato').toBe(true);
  }
  risposta = STATO_VERO; // binari della casa assenti: il comportamento è quello di prima, e i testi pure
  await page.locator('[data-chiudi="veloPermessi"]:visible').first().click();
  await expect(page.locator('#veloPermessi')).toBeHidden();
  await page.locator('[data-open-sheet="permissions"]:visible').first().click();
  await expect(automatico.locator('.talos-badge')).toHaveText('Come prima');
  await expect(automatico.locator('.talos-choice__sub')).toHaveText('Sceglie da sé, e può cambiare da un comando all’altro.');
  await expect(linux.locator('.talos-choice__sub')).toHaveText('Sempre in Linux. Se WSL non c’è, il comando lo dice invece di ripiegare in silenzio.');
  expect(fermate).toEqual([]);
});

test('F009-UI-03: senza WSL il blocco non si mostra — un fatto che non c è non si scrive', async ({ page }) => {
  await guardia(page);
  await page.route('**/api/v1/wsl', (rotta) => rotta.fulfill({ json: { ok: true, data: { preferenze: { usaUtenteNormale: true }, wsl: { disponibile: false } } } }));
  await apriApp(page);
  await apriVeloPermessi(page);
  await expect(page.locator('#veloPermessiWsl')).toBeHidden();
});

test('F009-UI-04: la carta della conferma di root vale per la sessione — due azioni, la ragione del kernel, e nessun «sempre» scritto', async ({ page }) => {
  const fermate = await guardia(page);
  const risposte = [];
  await page.route('**/api/v1/sessions/f009-*/approve', (rotta) => { risposte.push(rotta.request().postDataJSON()); return rotta.fulfill({ json: { ok: true, data: { ok: true } } }); });
  await apriApp(page);
  const frase = 'Questo comando gira in Linux (WSL, Ubuntu) come root, e con i permessi di questa sessione nessuno lo approva: può cambiare tutto il sistema Linux e scrivere sui dischi di Windows. Se lo confermi, vale per tutta la sessione.';
  await page.evaluate((frase) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('f009-uno', 'workspace', 'F009 conferma', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, runtime.realSessionState.generation); // VELO-SPEC: da A1-R3 una sessione aperta resta velata fino al confine, che il server manda SEMPRE (anche a storia vuota)
    const generazione = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Elenca i file' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }, _sequenza: 1 }, generazione);
    runtime.handleRealEvent({ type: 'ApprovalRequested', requestId: 'f009-app-1', azione: { tipo: 'shell', toolCallId: 'c1', comando: 'ls -la', wslRoot: { distro: 'Ubuntu', utente: 'root', frase } }, _sequenza: 2 }, generazione);
  }, frase);
  const scheda = page.locator('#conversation [data-c="ApprovalCard"]').first();
  await expect(scheda).toBeVisible();
  await expect(scheda).toContainText(frase);
  await expect(scheda.locator('button')).toHaveText(['Consenti per questa sessione', 'Nega']);
  await expect(scheda.locator('.talos-approval__foot-note')).toHaveText('Vale per tutta la sessione');
  await scheda.getByRole('button', { name: 'Consenti per questa sessione' }).click();
  await expect.poll(() => risposte.length).toBe(1);
  expect(risposte[0]).toEqual({ requestId: 'f009-app-1', approvato: true });
  expect(fermate, 'nessun permesso per attrezzo scritto: il sì vive nel kernel, non in «shell: sempre»').toEqual([]);
});

test('F009-UI-05: una carta di shell qualunque resta com era (tre azioni, «vale solo per questa richiesta»)', async ({ page }) => {
  await guardia(page);
  await apriApp(page);
  await page.evaluate(() => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('f009-due', 'workspace', 'F009 carta normale', 'qwen/qwen3.8-flash', { conclusa: false, modello: 'qwen/qwen3.8-flash' });
    runtime.handleRealEvent({ type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null }, runtime.realSessionState.generation); // VELO-SPEC: da A1-R3 una sessione aperta resta velata fino al confine, che il server manda SEMPRE (anche a storia vuota)
    const generazione = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'RunStarted', input: { consegna: 'Compila' }, contesto: { cartella: 'C:\\progetti\\AVM', modello: 'qwen/qwen3.8-flash' }, _sequenza: 1 }, generazione);
    runtime.handleRealEvent({ type: 'ApprovalRequested', requestId: 'f009-app-2', azione: { tipo: 'shell', comando: 'npm run build' }, _sequenza: 2 }, generazione);
  });
  const scheda = page.locator('#conversation [data-c="ApprovalCard"]').first();
  await expect(scheda.locator('button')).toHaveText(['Consenti una volta', 'Per questa sessione', 'Nega']);
});

test('F009-UI-06: l esito di un comando dice «in Linux (WSL) come root»', async ({ page }) => {
  await guardia(page);
  await apriApp(page);
  await page.evaluate((etichetta) => {
    const runtime = window.__talosHarnessUiRuntime;
    runtime.passaASessione('f009-tre', 'workspace', 'F009 esito', 'qwen/qwen3.8-flash', { conclusa: true, modello: 'qwen/qwen3.8-flash' });
    const generazione = runtime.realSessionState.generation;
    runtime.handleRealEvent({ type: 'ComandoUtenteIniziato', comandoId: 'k1', comando: 'id -un', _sequenza: 1 }, generazione);
    runtime.handleRealEvent({ type: 'ToolCallStart', toolCallId: 't1', toolCallName: 'shell', _sequenza: 2 }, generazione);
    runtime.handleRealEvent({ type: 'ToolCallArgs', toolCallId: 't1', delta: JSON.stringify({ comando: 'id -un' }), _sequenza: 3 }, generazione);
    runtime.handleRealEvent({ type: 'ToolCallResult', messageId: 'm1', toolCallId: 't1', content: `exit 0 [sandbox: ${etichetta}]\nroot`, role: 'tool', _sequenza: 4 }, generazione);
    runtime.handleRealEvent({ type: 'ComandoUtenteFinito', comandoId: 'k1', codice: 0, enforcement: 'wsl2', _sequenza: 5 }, generazione);
  }, ETICHETTA_ROOT);
  await expect(page.locator('#conversation')).toContainText('in Linux (WSL) come root, non su Windows');
});
