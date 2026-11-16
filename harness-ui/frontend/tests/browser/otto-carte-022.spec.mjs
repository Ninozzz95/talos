import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect } from '@playwright/test';

/*
 * MISURA della cura gemella 0.2.2 giro 3, giudice v1856 punto 1. Fino al giro 5 stava solo nella cartella di lavoro dell'agente del giro 3
 * (mai committata); rimessa nel ramo dal revisore della pagina del giro 5 (giudice v1886) con i percorsi portabili: di serie scrive in
 * `artifacts/otto-carte-022/` della pagina, `OTTO_FOTO` e `OTTO_DUMP` li spostano. Ogni carta che usa `.talos-approval__automazione` (gli 8 pezzi: automazione-carta, automazioni-v2, carta-dal-testo,
 * fornitori-carta, impostazioni-dalla-chat, invio-file-chat, remoto, telefoni-chat) più la carta del connettore, a 100/150/200%, it/en,
 * chiaro/scuro: per ogni carta i rettangoli di ogni riga `.talos-kv` relativi alla carta, larghezza e altezza della carta, l'impronta della
 * foto della SOLA carta (byte per byte) e la foto intera. Il confronto prima/dopo lo fa confronta-otto.mjs.
 * Eventi copiati dalle spec del ramo: carta-valore-visibile-022 (DAL_TESTO), impostazioni e fornitori e automazione dalla spec VICINE del
 * controllore (`ctrl-gemella-022-extra.spec.mjs:23-70`, a sua volta da impostazioni-dalla-chat e automazioni-v2), automation_update e
 * automation_run da automazioni-v2.spec.mjs:389 e :402, remote_device_send_file da remoto-invio-file.spec.mjs:179, remote_control da
 * remoto-carte-ponte.spec.mjs:86, remote_phone_folder_allow da remoto-cartelle.spec.mjs:200, remote_phone_revoke da telefoni-chat.spec.mjs:152.
 * Gli orari sono fissi (null) perché le foto si confrontino byte per byte. Il connettore: l'azione VERA del nucleo dell'albero provato.
 */
const ARTEFATTI = fileURLToPath(new URL('../../artifacts/otto-carte-022/', import.meta.url));
const FOTO = path.resolve(process.env.OTTO_FOTO ?? path.join(ARTEFATTI, 'foto'));
const DUMP = path.resolve(process.env.OTTO_DUMP ?? path.join(ARTEFATTI, 'misure'));
const KERNEL = new URL('../../../src/kernel/talosHarness.mjs', import.meta.url).href;
const SESSIONE = 'carta-valore';
const CONFINE = { type: 'CUSTOM', name: 'talos.fine-rigiocata', value: null };
const INVOLUCRO = (data) => JSON.stringify({ ok: true, data, meta: { schema: 'talos.harness-ui.api.v1' } });
const NOME_LUNGO = `note_${'x'.repeat(280)}_END`;
const VIEW = { 100: [{ width: 1920, height: 1080 }, 1], 150: [{ width: 1280, height: 720 }, 1.5], 200: [{ width: 960, height: 540 }, 2] };

const CAMBIO = (chiave, nomeEn, nomeIt, ambito, prima, dopo, extra = {}) => ({ chiave, nome: { en: nomeEn, it: nomeIt, chiave: null }, ambito, dove: 'server', gruppo: null, prima, dopo, ...extra });
const CAMBI_COSTO = [
  CAMBIO('conversation.model', 'Model', 'Modello', 'conversation', 'z-ai/glm-5.3-flash', 'openai/gpt-6-luna', { prezzo: { prima: { in: 0.35, out: 1.4 }, dopo: { in: 1.25, out: 10 } } }),
  CAMBIO('conversation.reasoningEffort', 'Reasoning level', 'Livello di ragionamento', 'conversation', 'medium', 'high'),
  CAMBIO('tools.defaultCommandShell', 'Where commands run · new conversations', 'Dove girano i comandi · conversazioni nuove', 'app', 'windows', 'wsl2'),
  CAMBIO('tools.webSearchSource', 'Web search source', 'Origine della ricerca web', 'app', 'tavily', 'duckduckgo'),
];
const CATALOGO = { schema: 'talos.app-settings.catalog.v1', voci: [
  { key: 'conversation.model', section: 'conversation', scope: 'conversation', where: 'server', type: 'modello', group: 'costo', text: { en: 'Model', it: 'Modello' }, textKey: 'app.sheets.model.title', textKeys: ['app.sheets.model.title'] },
  { key: 'conversation.reasoningEffort', section: 'conversation', scope: 'conversation', where: 'server', type: 'scelta', values: ['default', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'], group: 'costo', text: { en: 'Reasoning level', it: 'Livello di ragionamento' }, textKey: 'app.modelPicker.reasoningLevel', textKeys: ['app.modelPicker.reasoningLevel'] },
  { key: 'tools.defaultCommandShell', section: 'tools', scope: 'app', where: 'server', type: 'scelta', values: ['auto', 'windows', 'wsl2'], group: null, text: { en: 'Where commands run · new conversations', it: 'Dove girano i comandi · conversazioni nuove' }, textKey: 'varie.commandsDefault.title', textKeys: ['varie.commandsDefault.title'] },
  { key: 'tools.webSearchSource', section: 'tools', scope: 'app', where: 'server', type: 'scelta', values: ['duckduckgo', 'tavily', 'brave', 'searxng', 'custom', 'off'], group: null, text: { en: 'Web search source', it: 'Origine della ricerca web' }, textKey: 'modello.frammenti.impostazioni.webSearchSource', textKeys: ['modello.frammenti.impostazioni.webSearchSource'] },
] };
const ISTRUZIONI = 'Leggi i commit di ieri e scrivimi in cinque righe cosa è cambiato.\nSe non è cambiato niente, non dirmi niente.';
const LUNGO = 'C:\\Users\\persona\\AppData\\Local\\Temp\\talos\\C--Users-persona-Desktop-progetti-esempio-harness-desktop\\0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9\\scratchpad\\prova-dal-vivo\\lavoro';
const BOZZA = { versione: 2, id: '6d825a75-d7d0-4346-80fd-462d817d2cc2', nome: 'Rapporto mattutino', istruzioni: ISTRUZIONI, cartella: LUNGO,
  modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write', coordinazione: false, pianificazione: { tipo: 'feriali', ora: '09:00' }, fusoOrario: 'Europe/Rome',
  ripeti: null, eseguite: 0, attiva: true, origine: { tipo: 'interfaccia' }, creataAlle: '2026-10-08T20:00:00.000Z', modificataAlle: '2026-10-08T20:00:00.000Z',
  ultimaEsecuzione: null, prossimaEsecuzione: '2026-10-09T07:00:00.000Z', inAttesaFinoA: null, giroInCorso: null };
const DIFF = { prima: { istruzioni: ISTRUZIONI, pianificazione: { tipo: 'feriali', ora: '09:00' }, prossimaEsecuzione: '2026-10-09T07:00:00.000Z' },
  dopo: { istruzioni: 'Come prima, ma anche le PR aperte.', pianificazione: { tipo: 'feriali', ora: '10:30' }, prossimaEsecuzione: '2026-10-09T08:30:00.000Z' } };
const CARTE = {
  'dal-testo': { tipo: 'chiamata-dal-testo', toolCallId: 'daTesto-0123456789ab-1', nome: 'create_issue', semprePersona: true,
    argomenti: { [NOME_LUNGO]: 'DELETE EVERYTHING', title: `${'a'.repeat(283)} DELETE EVERYTHING`.slice(0, 300) },
    frase: 'The model wrote this tool call as text instead of calling the tool (create_issue). TALOS rebuilt it: run it?',
    fraseChiave: 'server.approval.callFromText', fraseParams: { nome: 'create_issue' } },
  impostazioni: { tipo: 'app_settings', azione: 'set', dove: 'pc', revisione: 10012, cambi: CAMBI_COSTO, toolCallId: 'call-s1' },
  'automazione-crea': { bozza: BOZZA, tipo: 'automation_create', toolCallId: 'call-a1' },
  'automazione-modifica': { automazione: { id: 'a1', nome: 'Rapporto mattutino', fusoOrario: 'Europe/Rome' }, prima: DIFF.prima, dopo: DIFF.dopo, tipo: 'automation_update', toolCallId: 'call-a3' },
  'automazione-esegui': { automazione: { id: 'a1', nome: 'Rapporto mattutino', cartella: 'C:\\progetti\\talos', modello: 'z-ai/glm-5.3-flash', permessi: 'Workspace write', coordinazione: false },
    contesto: 'Guarda anche la PR #51.', tipo: 'automation_run', toolCallId: 'call-a4' },
  fornitori: { tipo: 'provider_exclude', fornitore: 'deepinfra', toolCallId: 'call-f1',
    cambi: [{ campo: 'persona', prima: ['novita', 'chutes'], dopo: ['novita', 'chutes', 'deepinfra'] }, { campo: 'di-serie', modello: 'openai/gpt-6-luna', prima: false, dopo: true }] },
  'invio-file': { tipo: 'remote_device_send_file', toolCallId: 'c-inv', file: { nome: 'report-q3.pdf', dimensione: 2_516_582, percorso: 'C:\\Users\\Nino\\Projects\\Sales\\report-q3.pdf' },
    telefono: { idCorto: 'tel-pad-', nome: 'Pad di Nino', inLinea: true, ultimaVoltaAlle: null }, dispositivi: 1 },
  remoto: { tipo: 'remote_control', toolCallId: 'c-b', acceso: true, ponte: null, telefoni: 0, inLinea: 0 },
  'telefono-cartella': { tipo: 'remote_phone_folder_allow', toolCallId: 'call-c1', telefono: { idCorto: 't1abcdef', nome: 'Pad di Nino', inLinea: true, ultimaVoltaAlle: null },
    cartella: { cartellaId: 'cartella-0000000000000009', nome: 'AVM', percorso: 'D:\\Projects\\AVM' } },
  'telefono-revoca': { tipo: 'remote_phone_revoke', toolCallId: 'call-r1', telefono: { idCorto: 'tel-pixe', nome: 'Pixel 9', inLinea: false, ultimaVoltaAlle: null } },
};

/** L'azione VERA del nucleo dell'albero provato per una chiamata di un connettore (prima della cura: senza argomenti). */
async function azioneDelConnettore() {
  const { talosLavora } = await import(KERNEL);
  const cartella = await mkdtemp(path.join(tmpdir(), 'otto-carte-'));
  const ARG = { title: 'Weekly issue', [NOME_LUNGO]: 'DELETE EVERYTHING', body: `${'Weekly report line. '.repeat(110)}END` };
  const risposte = [{ role: 'assistant', content: null, tool_calls: [{ id: 'call_otto_1', type: 'function', function: { name: 'mcp__github__create_issue', arguments: JSON.stringify(ARG) } }] }, { role: 'assistant', content: 'done', tool_calls: [] }];
  let n = 0; let azione = null;
  await talosLavora({
    cartella, task: { consegna: 'open the issue' }, modello: 'x', chiave: 'finta', livelloAccesso: 'scrittura-progetto',
    toolMcp: [{ name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: {} } }],
    chiamaToolMcpFn: async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
    chiediApprovazioneFn: async (a) => { if (a.tipo === 'mcp_tool') azione ??= structuredClone(a); return false; },
    fetchDiRete: async () => { const s = risposte[Math.min(n++, 1)]; return { ok: true, status: 200, json: async () => ({ choices: [{ message: s }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }; },
  });
  if (!azione) throw new Error('nessuna carta dal nucleo');
  return azione;
}
test.beforeAll(async () => { CARTE.connettore = await azioneDelConnettore(); });

async function prepara(page, modo, lingua) {
  const scritture = [];
  await page.addInitScript(({ colorMode, uiLanguage }) => {
    localStorage.setItem('talos.harness.desktop.settings.v1', JSON.stringify({ appearance: { colorMode, uiLanguage } }));
  }, { colorMode: modo, uiLanguage: lingua });
  await page.route('**/api/**', (rotta) => {
    if (rotta.request().method() === 'GET') return rotta.fallback();
    scritture.push(`${rotta.request().method()} ${new URL(rotta.request().url()).pathname}`);
    return rotta.abort();
  });
  await page.route((url) => url.pathname === '/api/v1/app-settings/catalog', (r) => r.fulfill({ contentType: 'application/json', body: INVOLUCRO(CATALOGO) }));
  await page.route((url) => url.pathname === `/api/v1/sessions/${SESSIONE}/events`, () => { /* aperto e muto */ });
  await page.goto('/');
  await page.waitForFunction(() => window.__talosHarnessUiRuntime);
  await page.locator('#talosAvvio').waitFor({ state: 'detached', timeout: 8000 });
  await page.evaluate(({ id, confine }) => {
    const r = window.__talosHarnessUiRuntime;
    r.passaASessione(id, 'workspace', 'Misura', 'openrouter:model', { conclusa: false, modello: 'openrouter:model', permessi: 'Workspace write' });
    r.handleRealEvent(confine, r.realSessionState.generation);
  }, { id: SESSIONE, confine: CONFINE });
  await page.waitForFunction(() => window.__talosHarnessUiRuntime.realSessionState.inRigiocata === false);
  await page.waitForFunction(() => !document.querySelector('#conversation')?.classList.contains('is-restoring'), null, { timeout: 5_000 });
  return scritture;
}
const manda = (page, eventi) => page.evaluate((lista) => { const r = window.__talosHarnessUiRuntime; for (const e of lista) r.handleRealEvent(e, r.realSessionState.generation); }, eventi);
const carta = (page) => page.locator('#conversation [data-c="ApprovalCard"]');
const misura = (page) => carta(page).evaluate((card) => {
  const c = card.getBoundingClientRect();
  const R = (r) => [Math.round((r.left - c.left) * 10) / 10, Math.round((r.top - c.top) * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
  return {
    carta: [Math.round(c.width * 10) / 10, Math.round(c.height * 10) / 10],
    blocchi: [...card.querySelectorAll('.talos-approval__automazione')].map((b) => ({ classi: b.className, argomenti: b.hasAttribute('data-argomenti-dal-testo'), r: R(b.getBoundingClientRect()) })),
    righe: [...card.querySelectorAll('.talos-kv')].map((riga) => {
      const k = riga.querySelector(':scope > .talos-kv__k'); const v = riga.querySelector(':scope > .talos-kv__v');
      return { testo: (k?.textContent ?? '').slice(0, 30), riga: R(riga.getBoundingClientRect()), k: k ? R(k.getBoundingClientRect()) : null, v: v ? R(v.getBoundingClientRect()) : null };
    }),
  };
});

for (const scala of ['100', '150', '200']) {
  for (const modo of ['light', 'dark']) {
    test.describe(`OTTO ${modo} ${scala}%`, () => {
      test.use({ colorScheme: modo, viewport: VIEW[scala][0], deviceScaleFactor: VIEW[scala][1], reducedMotion: 'reduce' });
      for (const nomeCarta of [...Object.keys(CARTE), 'connettore']) {
        for (const lingua of ['it', 'en']) {
          test(`OTTO ${nomeCarta} ${lingua} ${modo} ${scala}`, async ({ page }) => {
            const scritture = await prepara(page, modo, lingua);
            await manda(page, [{ type: 'ApprovalRequested', requestId: `otto-${nomeCarta}`, _sequenza: 2, azione: CARTE[nomeCarta] }]);
            await expect(carta(page)).toHaveCount(1);
            await page.mouse.move(2, 2);
            await carta(page).scrollIntoViewIfNeeded();
            await page.evaluate(() => Promise.race([
              Promise.all(document.getAnimations().filter((a) => Number.isFinite(a.effect?.getComputedTiming?.().endTime)).map((a) => a.finished.catch(() => null))),
              new Promise((ok) => setTimeout(ok, 1500)),
            ]));
            const m = await misura(page);
            const pezzo = await carta(page).screenshot({ animations: 'disabled' });
            const nome = `${nomeCarta}-${lingua}-${modo}-${scala}`;
            await mkdir(FOTO, { recursive: true }); await mkdir(DUMP, { recursive: true });
            await writeFile(path.join(FOTO, `${nome}.png`), await page.screenshot({ animations: 'disabled' }));
            await writeFile(path.join(FOTO, `${nome}-carta.png`), pezzo);
            await writeFile(path.join(DUMP, `${nome}.json`), JSON.stringify({ ...m, impronta: createHash('sha256').update(pezzo).digest('hex') }, null, 1));
            expect(scritture).toEqual([]);
          });
        }
      }
    });
  }
}
