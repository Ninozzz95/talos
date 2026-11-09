import { test, expect } from '@playwright/test';

/*
 * ⛔ Owner dal vivo, 04/11/2026 20:22 — IN UNA CHAT LUNGA IL CAMBIO DI CHAT ASPETTAVA LA SCHEDA CONTESTO. Dalla chat più nuova si passa a
 *   quella da 277 giri col pannello di destra su «Contesto», e non si riesce a cambiare di nuovo finché «Cosa occupa la finestra» non
 *   ha caricato (5-10 s).
 * Misurato (server di prova, sessioni vere da 50, 277 e 1000 giri; rapporto RAPPORTO-CAMBIO-CHAT-CONTESTO-2026-11-04.md): il server
 *   finisce la storia in 18-153 ms e le letture del pannello in ≤ 30 ms; il tempo è nella PAGINA. Il browser consegna il flusso SSE a
 *   blocchi di rete, e ogni blocco (migliaia di eventi) si processava tutto in UN compito (`source.onmessage` → `elabora`): compiti
 *   lunghi in fila fino a `talos.fine-rigiocata`, che è anche il momento in cui la scheda chiede `/last-request`. Un clic su un'altra
 *   chat aspettava la fine del compito in corso; con una storia pesante, quasi tutta la storia.
 * ⇒ La storia si processa a FETTE (`collegaEventiSessione`): un tetto di tempo per fetta, poi si cede il filo; un cambio di chat fra
 *   due fette butta il resto (generazione). Come Hermes, che carica la storia a finestre e scarta con `isCurrent()` la risposta di una
 *   sessione lasciata (`apps/desktop/src/app/chat/history-window.ts:86-145`); web.dev «Optimize long tasks» (19/12/2024: cedere il
 *   filo a scadenza, non a ogni pezzo, così l'input passa prima del pezzo dopo).
 * Server finto: ogni richiesta non-GET si ferma. Le forme dei giri sono quelle del flusso del server (sessione di prova da 50 giri).
 */
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const MODELLO = 'prova/modello-senza-catalogo';
const GIRI = 277;
const T0 = Date.parse('2026-11-04T19:36:00.000Z');
const risposta = (n) => [
  `## Giro ${n}`, '',
  `Ho letto \`file-${n}.md\` e il comando ha risposto. ${'Ecco cosa ne ricavo, con qualche dettaglio in più per avere un testo lungo come in una sessione vera. '.repeat(6)}`, '',
  ...Array.from({ length: 6 }, (_, i) => `- punto ${i + 1} del giro ${n}: **${i * n}** righe controllate, \`passo_${i}\` a posto`), '',
  '| file | righe | esito |', '|---|---|---|', ...Array.from({ length: 4 }, (_, i) => `| file-${n}-${i}.md | ${i * 10 + n} | ok |`), '',
  '```js', ...Array.from({ length: 8 }, (_, i) => `const passo${n}_${i} = (x) => x * ${i} + ${n};`), '```',
].join('\n');
const giro = (n) => [
  { type: 'RunStarted', threadId: 't', runId: `r-${n}`, input: { consegna: `Giro ${n}, leggi il file e lancia il comando`, ...(n > 1 ? { seguito: true } : {}) }, timestamp: T0 + n * 60_000 },
  { type: 'TextMessageStart', messageId: `a-${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `a-${n}`, delta: `Leggo il file e lancio un comando per il giro ${n}.` },
  { type: 'ToolCallStart', toolCallId: `l-${n}`, toolCallName: 'leggi', avviatoA: T0 + n * 60_000 + 30 },
  { type: 'ToolCallArgs', toolCallId: `l-${n}`, delta: JSON.stringify({ percorso: `file-${n}.md` }) },
  { type: 'ToolCallStart', toolCallId: `c-${n}`, toolCallName: 'shell', avviatoA: T0 + n * 60_000 + 31 },
  { type: 'ToolCallArgs', toolCallId: `c-${n}`, delta: JSON.stringify({ comando: `echo giro ${n}` }) },
  { type: 'TextMessageEnd', messageId: `a-${n}` },
  { type: 'ToolCallResult', messageId: `rl-${n}`, toolCallId: `l-${n}`, content: `# File ${n}\n${`Riga di contenuto del file ${n} con testo che occupa spazio nella finestra del contesto.\n`.repeat(50)}`, role: 'tool', isError: false },
  { type: 'ToolCallResult', messageId: `rc-${n}`, toolCallId: `c-${n}`, content: `exit 0\ngiro ${n}`, role: 'tool', isError: false, comando: `echo giro ${n}`, exitCode: 0 },
  { type: 'TextMessageStart', messageId: `b-${n}`, role: 'assistant' },
  { type: 'TextMessageContent', messageId: `b-${n}`, delta: risposta(n) },
  { type: 'TextMessageEnd', messageId: `b-${n}` },
  { type: 'StateDelta', delta: [{ op: 'replace', path: '/usage', value: { prompt_tokens: 12_000 + n * 100, completion_tokens: 400, cached_tokens: 0, giri: n } }] },
  { type: 'RunFinished', threadId: 't', runId: `r-${n}`, outcome: { type: 'success' } },
];
const flusso = (eventi) => `retry: 3600000\n${[...eventi, CONFINE].map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`;
const LUNGA = Array.from({ length: GIRI }, (_, i) => giro(i + 1)).flat().map((e, i) => ({ ...e, _sequenza: i + 1 }));
const ALTRA = [
  { type: 'RunStarted', threadId: 'u', runId: 'u-1', input: { consegna: 'La chat corta' }, timestamp: T0 },
  { type: 'TextMessageStart', messageId: 'u-a', role: 'assistant' },
  { type: 'TextMessageContent', messageId: 'u-a', delta: 'Risposta della chat corta.' },
  { type: 'TextMessageEnd', messageId: 'u-a' },
  { type: 'RunFinished', threadId: 'u', runId: 'u-1', outcome: { type: 'success' } },
].map((e, i) => ({ ...e, _sequenza: i + 1 }));

async function apri(page, tema, { conClic = true } = {}) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: tema, reducedMotion: 'reduce' });
  await page.addInitScript(({ colorMode, modello, conClic }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ version: 1, appearance: { colorMode, uiLanguage: 'it' } }));
    /* Il clic della persona sull'altra chat, a storia GIÀ cominciata: appena la chat lunga comincia ad arrivare parte un battito
       (`setTimeout` a catena, un compito come un clic vero, che passa solo quando il filo è libero); al primo battito che trova
       della storia già processata si cambia chat. Si misura il buco più lungo fra due battiti (quanto un clic avrebbe aspettato) e
       quanta storia è passata prima del cambio: una fetta, non un blocco di rete intero (con un tetto della fetta troppo largo, o
       senza scadenza nel ciclo, la prima fetta si mangiava tutto ciò che era arrivato). */
    const Vero = window.EventSource;
    window.__cambio = {};
    window.EventSource = class extends Vero {
      constructor(url, opzioni) {
        super(url, opzioni);
        if (!conClic || !String(url).includes('/sessions/cc-lunga/')) return;
        this.addEventListener('message', () => {
          if (window.__cambio.messoInFila) return;
          window.__cambio.messoInFila = performance.now();
          window.__cambio.bucoMax = 0;
          let prima = performance.now();
          const battito = () => {
            const ora = performance.now();
            window.__cambio.bucoMax = Math.max(window.__cambio.bucoMax, ora - prima);
            prima = ora;
            const rs = window.__talosHarnessUiRuntime.realSessionState;
            if (rs.sequenzeViste.size === 0 && rs.inRigiocata !== false) { setTimeout(battito, 0); return; }
            Object.assign(window.__cambio, { partito: ora, lungaFinita: rs.inRigiocata === false, eventiLungaPrima: rs.sequenzeViste.size });
            window.__talosHarnessUiRuntime.passaASessione('cc-altra', 'workspace', 'Chat corta', modello, { conclusa: true, modello });
          };
          setTimeout(battito, 0);
        });
      }
    };
  }, { colorMode: tema, modello: MODELLO, conClic });
  const contatore = { nonGet: 0 };
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    if (p === '/api/v1/sessions/cc-lunga/events') return route.fulfill({ contentType: 'text/event-stream', body: flusso(LUNGA) });
    if (p === '/api/v1/sessions/cc-altra/events' || p === '/api/v1/sessions/cc-partenza/events') return route.fulfill({ contentType: 'text/event-stream', body: flusso(ALTRA) });
    if (req.method() !== 'GET') { contatore.nonGet += 1; return route.abort(); }
    return route.continue();
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 10_000 });
  // come l'owner: si parte da una chat corta, col pannello di destra sulla scheda Contesto
  await page.evaluate((modello) => { window.__talosHarnessUiRuntime.passaASessione('cc-partenza', 'workspace', 'Partenza', modello, { conclusa: true, modello }); }, MODELLO);
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.id === 'cc-partenza' && window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  const inVista = await page.locator('#railTabs').evaluate((n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.left < window.innerWidth; }).catch(() => false);
  if (!inVista) await page.locator('.talos-screen:not([hidden]) [data-azione="dettagli"]').first().click();
  await page.locator('#railTabs [data-rail="contesto"]').click();
  return contatore;
}

const apriLunga = (page) => page.evaluate((modello) => { window.__talosHarnessUiRuntime.passaASessione('cc-lunga', 'workspace', 'Chat lunga', modello, { conclusa: true, modello }); }, MODELLO);

test('CAMBIO-CHAT-RIGIOCATA — mentre la chat da 277 giri rigioca la sua storia, il clic su un\'altra chat passa subito e la storia rimasta si butta', async ({ page }) => {
  const c = await apri(page, 'dark');
  await apriLunga(page);
  await page.waitForFunction(() => window.__cambio.partito, null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.id === 'cc-altra' && window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 30_000 });
  const cambio = await page.evaluate(() => window.__cambio);
  const attesa = cambio.bucoMax;
  console.log(`[cambio-chat] buco più lungo del filo prima del cambio ${Math.round(attesa)} ms (dalla storia al cambio ${Math.round(cambio.partito - cambio.messoInFila)} ms); eventi della chat lunga processati prima: ${cambio.eventiLungaPrima} su ${LUNGA.length}`);
  expect(cambio.lungaFinita, 'il clic passa mentre la chat lunga sta ancora rigiocando, non dopo').toBe(false);
  expect(cambio.eventiLungaPrima, 'prima del clic passa almeno una fetta della storia').toBeGreaterThan(0);
  expect(cambio.eventiLungaPrima, 'prima del clic passa una fetta della storia, non un blocco di rete intero').toBeLessThan(LUNGA.length / 10);
  expect(attesa, 'il clic aspetta al più una fetta').toBeLessThan(150);
  // la chat corta è a schermo, e niente della lunga ci è finito dentro dopo il cambio
  await expect(page.locator('#conversation')).toContainText('Risposta della chat corta.');
  await expect(page.locator('#conversation')).not.toContainText('Giro 277');
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.sequenzeViste.size)).toBe(ALTRA.length);
  expect(c.nonGet).toBe(0);
});

test('CAMBIO-CHAT-RIGIOCATA-INTERA — senza cambi la storia a fette arriva intera e in ordine; la scheda Contesto dice coi secondi che sta leggendo', async ({ page }) => {
  await apri(page, 'light', { conClic: false });
  await apriLunga(page);
  // durante la storia la scheda Contesto ha la sua riga «in corso», che conta i secondi
  await expect(page.locator('#railContesto [data-chiave="storia-in-corso"] [data-dal]')).toBeVisible({ timeout: 10_000 });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false, null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__talosHarnessUiRuntime.realSessionState.sequenzeViste.size)).toBe(LUNGA.length);
  await expect(page.locator('#conversation')).toContainText('Giro 277');
  await expect(page.locator('#railContesto [data-chiave="storia-in-corso"]')).toHaveCount(0);
});
