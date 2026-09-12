import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as APIRegistro from '../src/provider-registry.mjs';
import { fileURLToPath } from 'node:url';

import {
  ID_CATALOGO_IN_UI,
  ID_CON_CREDENZIALE,
  ID_DESTINAZIONE_CHAT,
  ID_FORNITORI,
  ID_NATIVI_SDK,
  ProviderRegistryError,
  REGISTRO_FORNITORI,
  fornitore,
  verificaRegistro,
} from '../src/provider-registry.mjs';
import { PROVIDER_DEFINITIONS, PROVIDER_IDS } from '../src/provider-credential-store.mjs';
import { CATALOGHI_DIRETTI, ESITI_SONDA, SONDE_PROVIDER, createProviderProbe } from '../src/provider-probe.mjs';
import { FONTI_MODELLO, risolviDestinazioneModello } from '../src/model-destination.mjs';
import { modelloRichiestaValido } from '../src/config.mjs';
import { createOpenAiCompatibleRuntime } from '../src/openai-compatible-runtime.mjs';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { PROVIDER_DIRETTI } from '../frontend/src/components/fonti-modelli.js';

/*
 * ⛔⛔⛔ IL CONTRATTO DI PARITÀ — 12/09/2026, P-A.
 *
 * ## Perché questo test esiste, e perché senza di lui P-A non è una cura
 *
 * L'inventario del 12/09 ha contato **tredici elenchi paralleli** degli stessi sette nomi di
 * fornitore, in tredici forme diverse, e nessun controllo che li tenesse insieme. Due bugie erano
 * già visibili: `deepseek` marcato «in preparazione» mentre il router lo instradava da sempre, e
 * `lmstudio` sondato, caricabile e scaricabile ma assente da `FONTI_MODELLO` — cioè non sceglibile
 * in chat, con il 90% del lavoro già fatto.
 *
 * ⛔ Unificarli in un registro NON basta. Il giorno in cui qualcuno aggiunge un fornitore di
 *   fretta, riscriverà il nome «giusto qui, solo per adesso», e i tredici elenchi ricominciano.
 *   È esattamente ciò che Hermes racconta di aver vissuto (`hermes_cli/provider_catalog.py:35`),
 *   ed è la stessa forma della lezione del 02/09 sulle NOVE copie della viewport: la cura non è
 *   unificare, è **un cancello che fallisce quando si divergono**.
 *
 * ## Le due metà, sempre
 *
 * Ogni prova qui sotto ha il suo **verso contrario** (regola 5-bis): non basta che il cancello
 * veda la parità dove c'è, deve **respingere** un fornitore finto aggiunto da una parte sola. Un
 * cancello inerte supera la prova «tutto combacia» esattamente come uno vero — è la lezione
 * `il-cancello-semantico-era-spento-da-sempre` (27/8).
 */

const RADICE = new URL('../', import.meta.url);
const leggi = (relativo) => readFileSync(fileURLToPath(new URL(relativo, RADICE)), 'utf8');

// Proiezione indipendente di https://models.dev/api.json, GET 12/09/2026.
// SHA-256 completo: f8c50427f9a7e5bd44ec1079a3db1899781b486e2b4e4da5f462ac6789ce19ee.
// Solo fatti id/tool_call; non si costruisce la fixture a partire dal registro sotto prova.
const RISERVE_PUBBLICHE = {
  // P-I: proiezione indipendente del GET pubblico del 12/09/2026, impronta nella fixture.
  ...Object.fromEntries(Object.entries(JSON.parse(leggi('tests/fixtures/provider-pi-models-dev-2026-09-12.json')).fornitori)
    .map(([id, p]) => [id, Object.fromEntries(Object.entries(p.models).map(([id, m]) => [id, m.tool_call]))])),
  // P-J — proiezione indipendente del catalogo pubblico, fonte/data/impronta nella fixture.
  ...Object.fromEntries(Object.entries(JSON.parse(leggi('tests/fixtures/provider-pj-models-dev-2026-09-12.json')).fornitori)
    .map(([id, p]) => [id, Object.fromEntries(Object.entries(p.models).map(([id, m]) => [id, m.tool_call]))])),
  // P-G: proiezione indipendente del GET, stessa impronta pubblica del 12/09/2026.
  ...Object.fromEntries(Object.entries(JSON.parse(leggi('tests/fixtures/provider-pg-models-dev-2026-09-12.json')).fornitori)
    .map(([id, p]) => [id, Object.fromEntries(Object.entries(p.models).map(([id, m]) => [id, m.tool_call]))])),
  openai: { 'gpt-5-nano': true, 'gpt-5-mini': true },
  deepseek: { 'deepseek-flash': true, 'deepseek-v4-pro': true },
  zai: { 'glm-4.7-flash': true, 'glm-4.7': true },
  anthropic: { 'claude-haiku-4-5-20251001': true, 'claude-sonnet-5': true },
  google: { 'gemini-2.5-flash-lite': true, 'gemini-3.1-flash-lite': true },
  openrouter: { 'liquid/lfm-2.5-2.6b:free': true, 'openai/gpt-5-nano': true },
};

function verificaRiservePubbliche(registro, catalogo) {
  for (const r of Object.values(registro)) {
    if (!r.destinazioneChat || r.catalogo.fonte !== 'fornitore') continue;
    for (const m of r.modelliDiRiserva) {
      assert.ok(Object.hasOwn(catalogo[r.modelsDevId] ?? {}, m.id), `${r.id}/${m.id}: assente dal catalogo pubblico`);
      assert.equal(catalogo[r.modelsDevId][m.id], true, `${r.id}/${m.id}: strumenti non dichiarati dal catalogo pubblico`);
    }
  }
}

test('PF-PAR-01 — riserve non vuote per ogni chat remota; locali e download dichiarano null', () => {
  for (const r of Object.values(REGISTRO_FORNITORI)) {
    if (r.destinazioneChat && r.catalogo.fonte === 'fornitore') {
      assert.ok(r.modelliDiRiserva?.length > 0, r.id);
      assert.ok(Object.isFrozen(r.modelliDiRiserva));
      for (const m of r.modelliDiRiserva) {
        assert.ok(Object.isFrozen(m));
        assert.equal(m.toolCalling, true);
        assert.match(m.fonte, /^https:\/\//u);
        assert.equal(m.data, '2026-09-12');
      }
    } else {
      assert.equal(r.modelliDiRiserva, null, r.id);
      assert.equal(r.modelloAusiliario, null, r.id);
    }
  }
});

test('PF-PAR-02 — campi obbligatori: assenza, vuoto, duplicati e ausiliario fuori lista vengono respinti', () => {
  const base = REGISTRO_FORNITORI.deepseek;
  for (const campo of ['modelliDiRiserva', 'modelloAusiliario']) {
    const r = { ...base }; delete r[campo];
    assert.throws(() => verificaRegistro({ deepseek: r }), ProviderRegistryError);
  }
  for (const modifica of [
    { modelliDiRiserva: [] }, { modelliDiRiserva: null }, { modelloAusiliario: 'inventato' },
    { modelliDiRiserva: [base.modelliDiRiserva?.[0], base.modelliDiRiserva?.[0]] },
    { modelliDiRiserva: [{ ...base.modelliDiRiserva?.[0], toolCalling: false }] },
    { modelliDiRiserva: [{ ...base.modelliDiRiserva?.[0], fonte: '' }] },
  ]) assert.throws(() => verificaRegistro({ deepseek: { ...base, ...modifica } }), ProviderRegistryError);
  assert.equal(verificaRegistro({ deepseek: { ...base, modelloAusiliario: null } }), true, 'null esplicito ammesso');
});

test('PF-PAR-03 — lettore ausiliario puro: id upstream esatti, null dichiarati e id sconosciuti', () => {
  assert.equal(typeof APIRegistro.modelloAusiliarioPer, 'function');
  const attesi = {
    openai: 'gpt-5-nano', deepseek: 'deepseek-flash', zai: 'glm-4.7-flash',
    anthropic: 'claude-haiku-4-5-20251001', gemini: 'gemini-2.5-flash-lite',
    openrouter: 'liquid/lfm-2.5-2.6b:free', ollama: null, lmstudio: null, local: null, huggingface: null,
  };
  for (const [id, modello] of Object.entries(attesi)) assert.equal(APIRegistro.modelloAusiliarioPer(id), modello, id);
  for (const id of ['inesistente', '__proto__', 'constructor', null, undefined]) assert.equal(APIRegistro.modelloAusiliarioPer(id), null);
});

test('PF-PAR-04 — parità pubblica nei due versi: nome inventato e modello senza strumenti falliscono', () => {
  verificaRiservePubbliche(REGISTRO_FORNITORI, RISERVE_PUBBLICHE);
  const base = REGISTRO_FORNITORI.deepseek;
  assert.throws(() => verificaRiservePubbliche({ deepseek: { ...base,
    modelliDiRiserva: [{ ...base.modelliDiRiserva?.[0], id: 'modello-inventato-pf' }],
  } }, RISERVE_PUBBLICHE), /assente dal catalogo pubblico/);
  assert.throws(() => verificaRiservePubbliche(REGISTRO_FORNITORI, {
    ...RISERVE_PUBBLICHE, deepseek: { ...RISERVE_PUBBLICHE.deepseek, 'deepseek-flash': false },
  }), /strumenti non dichiarati/);
});

test('PF-PAR-05 — cancello sul JSON pubblico completo acquisito senza chiavi', {
  skip: !process.env.TALOS_PF_CATALOGO_PUBBLICO,
}, () => {
  const pubblico = JSON.parse(readFileSync(process.env.TALOS_PF_CATALOGO_PUBBLICO, 'utf8'));
  const capacita = Object.fromEntries(Object.entries(pubblico).map(([id, p]) => [id,
    Object.fromEntries(Object.entries(p.models).map(([id, m]) => [id, m.tool_call])),
  ]));
  verificaRiservePubbliche(REGISTRO_FORNITORI, capacita);
  const openrouter = JSON.parse(readFileSync(process.env.TALOS_PF_OPENROUTER_PUBBLICO, 'utf8'));
  for (const m of REGISTRO_FORNITORI.openrouter.modelliDiRiserva) {
    const pubblico = openrouter.data.find(p => p.id === m.id);
    assert.ok(pubblico?.supported_parameters?.includes('tools'), `${m.id}: strumenti assenti da OpenRouter`);
  }
  const ausiliario = openrouter.data.find(m => m.id === APIRegistro.modelloAusiliarioPer('openrouter'));
  assert.equal(ausiliario.pricing.prompt, '0');
  assert.equal(ausiliario.pricing.completion, '0');
});

test('PF-PAR-06 — la riserva restituita non modifica il registro; locali e ignoti restano null', () => {
  const r = APIRegistro.catalogoDiRiservaPer('deepseek');
  r.modelli[0].nome = 'Alterato';
  r.modelli[0].catalogo.fonte = 'inventata';
  const nuovo = APIRegistro.catalogoDiRiservaPer('deepseek');
  assert.equal(nuovo.modelli[0].nome, 'DeepSeek V4.1 Flash');
  assert.equal(nuovo.modelli[0].catalogo.fonte, 'riserva');
  assert.ok(REGISTRO_FORNITORI.deepseek.modelliDiRiserva.every(m => Object.isFrozen(m)));
  for (const id of ['ollama', 'lmstudio', 'local', '__proto__']) assert.equal(APIRegistro.catalogoDiRiservaPer(id), null);
});

/** Gli insiemi, confrontati come insiemi e non come array: l'ordine è una scelta visiva. */
function stessiId(effettivi, attesi, dove) {
  assert.deepEqual([...effettivi].sort(), [...attesi].sort(), `${dove}: gli id non combaciano con il registro`);
}

// ── 1. Il registro si regge da solo, e rifiuta ciò che non sa dire ────────────────────────────

test('REG-01 — ogni record è dicibile: wire, auth, tre stati, e l\'indirizzo di chi deve bussare', () => {
  assert.equal(verificaRegistro(), true);
  assert.equal(ID_FORNITORI.length, Object.keys(REGISTRO_FORNITORI).length);
  for (const id of ID_FORNITORI) assert.equal(fornitore(id).id, id);
  assert.equal(fornitore('non-esiste'), null, 'un id sconosciuto torna null, mai un ripiego inventato');
});

test('REG-02 (verso contrario) — un record malfatto LANCIA, non degrada in silenzio', () => {
  const base = REGISTRO_FORNITORI.deepseek;
  const casi = [
    ['wire inventato', { ...base, wire: 'grpc-magico' }],
    ['destinazione di chat senza wire', { ...base, wire: null }],
    ['auth sconosciuta', { ...base, auth: { ...base.auth, tipo: 'telepatia' } }],
    ['capacità come booleano', { ...base, toolCalling: true }],
    ['id diverso dalla chiave', { ...base, id: 'altro' }],
    ['destinazione senza endpoint', { ...base, endpoint: { chat: null, modelli: null } }],
    ['cache senza dichiarazione del totale', { ...base, cache: { ...base.cache, inclusiNelTotale: 'forse' } }],
    ['sonda attiva senza indirizzo', { ...base, sonda: { ...base.sonda, percorso: null, urlAssoluto: null } }],
  ];
  for (const [perché, record] of casi) {
    assert.throws(() => verificaRegistro({ deepseek: record }), ProviderRegistryError, `doveva rifiutare: ${perché}`);
  }
  /* ⛔ E la metà che conta: un record SANO non deve far scattare nessuno di quei controlli. */
  assert.equal(verificaRegistro({ deepseek: base }), true);
});

// ── 2. Le superfici del server ────────────────────────────────────────────────────────────────

test('PAR-01 — portachiavi: gli id e ogni campo pubblico vengono dal record', () => {
  stessiId(PROVIDER_IDS, ID_CON_CREDENZIALE, 'PROVIDER_IDS');
  for (const id of PROVIDER_IDS) {
    const record = REGISTRO_FORNITORI[id];
    const definizione = PROVIDER_DEFINITIONS[id];
    assert.equal(definizione.label, record.etichetta, `${id}: etichetta`);
    assert.deepEqual(definizione.keyEnv, record.auth.nomeVariabile, `${id}: variabili della chiave`);
    assert.equal(definizione.defaultEndpoint, record.baseUrl, `${id}: indirizzo predefinito`);
    assert.equal(definizione.supportsEndpoint, record.indirizzoModificabile === true, `${id}: indirizzo modificabile`);
    assert.equal(definizione.requiresKey, record.chiaveObbligatoria === true, `${id}: chiave obbligatoria`);
    assert.equal(definizione.execution, record.esecuzione, `${id}: esecuzione`);
    assert.equal(definizione.supportsOAuth, Boolean(record.oauth), `${id}: accesso`);
  }
  /*
   * ⛔ La bugia che P-A chiude, provata come fatto: DeepSeek è instradato, quindi è «collegato».
   *   Lo stato NON è più una stringa scritta a mano in un secondo elenco — lo dice il record, ed
   *   è coerente con il fatto che `FONTI_MODELLO` lo contenga.
   */
  assert.equal(PROVIDER_DEFINITIONS.deepseek.execution, 'collegato');
  assert.ok(FONTI_MODELLO.includes('deepseek'));
});

test('PAR-02 — sonde: una per ogni fornitore con credenziale, e nessuna in più', () => {
  stessiId(Object.keys(SONDE_PROVIDER), ID_CON_CREDENZIALE, 'SONDE_PROVIDER');
  for (const id of ID_CON_CREDENZIALE) {
    const record = REGISTRO_FORNITORI[id];
    assert.equal(SONDE_PROVIDER[id].auth, record.sonda.auth, `${id}: schema di autenticazione della sonda`);
    assert.equal(SONDE_PROVIDER[id].percorso ?? null, record.sonda.urlAssoluto ? null : record.sonda.percorso, `${id}: percorso della sonda`);
    assert.equal(SONDE_PROVIDER[id].urlAssoluto ?? null, record.sonda.urlAssoluto ?? null, `${id}: url assoluto della sonda`);
  }
  /* I cataloghi «diretti» sono quelli con una scheda propria E un catalogo servito dal fornitore. */
  stessiId(CATALOGHI_DIRETTI, ID_CATALOGO_IN_UI.filter((id) => REGISTRO_FORNITORI[id].catalogo.fonte === 'fornitore'), 'CATALOGHI_DIRETTI');
});

test('PAR-03 — destinazioni di chat: il prefisso, il router e la regex dicono la stessa cosa', () => {
  stessiId(FONTI_MODELLO, ID_DESTINAZIONE_CHAT, 'FONTI_MODELLO');
  const deps = {
    leggiChiave: () => 'k',
    leggiRuntime: (fonte) => ({ endpoint: REGISTRO_FORNITORI[fonte]?.baseUrl ?? 'https://esempio.test/v1' }),
    localePronto: () => true,
  };
  for (const id of ID_DESTINAZIONE_CHAT) {
    /* ⛔ 1) il router la riconosce… */
    const destinazione = risolviDestinazioneModello(`${id}:modello-x`, deps);
    assert.equal(destinazione.fonte, id, `${id}: il router non riconosce la fonte`);
    assert.equal(destinazione.modelloRemoto, 'modello-x', `${id}: il prefisso non deve uscire verso il fornitore`);
    /* ⛔ 2) …e la regex della richiesta la lascia passare. Erano due verità separate, e una
       fonte ammessa dal router ma non dalla regex moriva con un 400 prima di arrivarci. */
    assert.equal(modelloRichiestaValido(`${id}:modello-x`), true, `${id}: respinto da FORMATO_MODELLO_RICHIESTA`);
  }
  /*
   * ⛔ VERSO CONTRARIO, e dice una cosa precisa: un prefisso che il registro NON dichiara non
   *   diventa un fornitore nuovo. La regex della richiesta lo respinge (400, prima di arrivare al
   *   router), e il router lo tratta per quello che è — un id OpenRouter che per caso contiene i
   *   due punti, esattamente come `~deepseek/deepseek-v4-flash:free`. ⛔ Dirottarlo su un provider
   *   inventato sarebbe il difetto: `separaFonteModello` esiste per non farlo.
   */
  assert.equal(modelloRichiestaValido('fornitore-finto:modello-x'), false);
  const nonDirottato = risolviDestinazioneModello('fornitore-finto:modello-x', deps);
  assert.equal(nonDirottato.fonte, 'openrouter');
  assert.equal(nonDirottato.modelloRemoto, 'fornitore-finto:modello-x', 'un prefisso sconosciuto resta parte del nome del modello');
});

test('PAR-04 — motori locali e SDK nativi: due liste che erano scritte a mano in cinque posti', () => {
  const runtime = createOpenAiCompatibleRuntime({ fetchImpl: async () => new Response('{}') });
  const localiAttesi = ID_FORNITORI.filter((id) => REGISTRO_FORNITORI[id].catalogo.fonte === 'runtime-locale' && REGISTRO_FORNITORI[id].wire === 'openai-chat');
  for (const id of localiAttesi) assert.doesNotThrow(() => runtime.detect(id), `${id}: il runtime locale non lo conosce`);
  assert.ok(localiAttesi.includes('lmstudio'), 'P-C: LM Studio deve essere un motore locale su wire OpenAI');
  /* ⛔ Verso contrario: un motore che il registro non dichiara non esiste per il runtime. */
  assert.rejects(runtime.listModels('motore-finto'), { code: 'RUNTIME_INVALID' });

  // P-J — cinque fornitori, sempre tre SDK: entrambe le nuove porte riusano Anthropic.
  stessiId(ID_NATIVI_SDK, ['openai', 'anthropic', 'gemini', 'zai-anthropic', 'minimax-anthropic'], 'ID_NATIVI_SDK');
  assert.rejects(
    nativeProviderResponse({ provider: 'deepseek', model: 'x', apiKey: 'k', body: { messages: [] } }),
    /Provider nativo non riconosciuto/u,
    'un fornitore non dichiarato nativo non deve poter costruire un client SDK',
  );
});

// ── 3. Le superfici del browser — l'elenco che NON può importare il registro ───────────────────

test('PAR-05 — le schede del selettore modelli combaciano col registro (copia dichiarata)', () => {
  stessiId(PROVIDER_DIRETTI.map((p) => p.id), ID_CATALOGO_IN_UI, 'PROVIDER_DIRETTI');
  for (const voce of PROVIDER_DIRETTI) {
    const record = REGISTRO_FORNITORI[voce.id];
    assert.ok(record, `${voce.id}: scheda di un fornitore che il registro non conosce`);
    assert.equal(voce.senzaChiave === true, record.chiaveObbligatoria === false, `${voce.id}: «senza chiave» deve dire ciò che dice il record`);
  }
  /*
   * ⛔ L'etichetta della scheda può essere più corta di quella del pannello («Gemini» contro
   *   «Google Gemini»): quello è un fatto di spazio, non una seconda verità. Ma deve restare
   *   RICONOSCIBILE — cioè una sottostringa di quella dichiarata — o due nomi diversi per lo
   *   stesso fornitore finiscono a schermo nella stessa app.
   */
  for (const voce of PROVIDER_DIRETTI) {
    assert.ok(REGISTRO_FORNITORI[voce.id].etichetta.includes(voce.etichetta), `${voce.id}: etichetta della scheda estranea a quella del registro`);
  }
});

test('PAR-06 — il <select> dei fornitori nel template porta gli stessi nomi del registro', () => {
  const html = leggi('frontend/index.template.html');
  const select = /<select class="talos-select" id="providerLab">(.*?)<\/select>/su.exec(html);
  assert.ok(select, 'il selettore dei fornitori non è più nel template: se è stato tolto, si toglie anche questa prova');
  /*
   * ⛔ Si confrontano i `value`, cioè gli ID, non le etichette: il testo visibile di un selettore è
   *   una scelta di spazio («Ollama» invece di «Ollama Local») e non deve diventare un contratto —
   *   ma l'insieme dei fornitori sì. Gli `value` sono stati aggiunti il 12/09 proprio per questo:
   *   senza, l'unica cosa confrontabile era il testo, e il cancello avrebbe imposto parole a una
   *   superficie visiva invece di presidiare un elenco.
   */
  const opzioni = [...select[1].matchAll(/<option value="([^"]+)"/gu)].map((m) => m[1]);
  stessiId(opzioni, ID_CON_CREDENZIALE, '<select id="providerLab">');
});

// ── 4. Nessuna copia rimasta indietro ─────────────────────────────────────────────────────────

test('PAR-07 — i tredici elenchi non esistono più: nessun file li riscrive a mano', () => {
  /*
   * ⛔ Questa è la prova che i nomi non sono tornati in due posti. Ogni riga è un elenco VERO che
   *   esisteva il 12/09 (inventario §3b, con file:riga) e che il registro ha assorbito: se
   *   riappare, qualcuno ha ricominciato — e lo si scopre qui, non fra sei mesi da un difetto.
   */
  const proibiti = [
    ['src/provider-credential-store.mjs', "'openai', 'deepseek', 'anthropic'"],
    ['src/provider-probe.mjs', "['openai', 'anthropic', 'gemini']"],
    ['src/model-destination.mjs', "['openrouter', 'deepseek', 'ollama', 'local']"],
    ['src/model-destination.mjs', "['anthropic', 'gemini', 'openai']"],
    ['src/config.mjs', "'local|ollama|openai|deepseek|openrouter|anthropic|gemini'"],
    ['src/openai-compatible-runtime.mjs', "ollama: { baseUrl:"],
    ['src/context-provider-adapter.mjs', "['openai', 'anthropic', 'gemini']"],
    ['src/context-token-counters.mjs', "['openai', 'anthropic', 'gemini']"],
    ['src/context-token-counters.mjs', "openai: 'https://api.openai.com/v1'"],
    ['src/http-app.mjs', '(openai|anthropic|gemini)'],
  ];
  for (const [file, testo] of proibiti) {
    const sorgente = leggi(file);
    /* ⛔ I commenti raccontano che cosa c'era: si guarda il CODICE, non la memoria del codice. */
    const senzaCommenti = sorgente.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
    assert.ok(!senzaCommenti.includes(testo), `${file}: è tornato un elenco di fornitori scritto a mano — «${testo}»`);
  }
});

// ── 5. La sonda, nei due versi ────────────────────────────────────────────────────────────────

test('SONDA-01 (verso contrario) — chi dichiara di non essere sondabile NON viene chiamato', async () => {
  let chiamate = 0;
  const fetchImpl = async () => { chiamate += 1; return Response.json({ data: [{ id: 'm' }] }); };
  const deps = { leggiChiave: () => 'chiave-buona', leggiRuntime: () => ({ endpoint: 'https://esempio.test/v1', timeoutSeconds: 5 }), fetchImpl };

  /*
   * ⛔ Nessuno dei nostri dichiara oggi `sonda.attiva: false`, e va detto: la prova gira su una
   *   tabella iniettata, perche lo stato deve esistere PRIMA del fornitore che lo usera. Senza,
   *   quel giorno la sonda direbbe «credenziale rifiutata» su una chiave valida — che e il
   *   difetto esatto contro cui questa sonda e nata.
   */
  const spento = createProviderProbe({ ...deps, sonde: { finto: { percorso: '/models', auth: 'bearer', attiva: false, conta: () => null } } });
  const esitoSpento = await spento.prova('finto');
  assert.equal(esitoSpento.esito, 'non-sondabile');
  assert.equal(esitoSpento.modelli, null);
  assert.equal(chiamate, 0, 'un fornitore non sondabile non deve produrre NESSUNA richiesta');
  assert.ok(ESITI_SONDA.includes(esitoSpento.esito), 'l’esito deve essere uno di quelli che la UI sa disegnare');

  /* ⛔ E la meta che conta: acceso, la sonda chiama davvero e dice «collegato». */
  const acceso = createProviderProbe({ ...deps, sonde: { finto: { percorso: '/models', auth: 'bearer', attiva: true, conta: (c) => c?.data?.length } } });
  const esitoAcceso = await acceso.prova('finto');
  assert.equal(esitoAcceso.esito, 'collegato');
  assert.equal(esitoAcceso.modelli, 1);
  assert.equal(chiamate, 1);

  // P-J — la porta Z.AI dichiara ora il caso previsto; nessuna esclusione implicita.
  for (const id of ID_CON_CREDENZIALE) assert.equal(SONDE_PROVIDER[id].attiva, REGISTRO_FORNITORI[id].sonda.attiva !== false, `${id}: stato della sonda diverso dal registro`);
  const prima = chiamate;
  assert.equal((await createProviderProbe(deps).prova('zai-anthropic')).esito, 'non-sondabile');
  assert.equal(chiamate, prima);
});

test('PAR-08 (verso contrario) — un fornitore aggiunto al registro e a NESSUN altro posto fa rosso', () => {
  /*
   * ⛔⛔ LA PROVA CHE IL CANCELLO MORDE. Le nove prove qui sopra dicono «oggi combaciano»: un
   *   cancello inerte direbbe la stessa identica cosa, perché non guarderebbe niente. Qui si
   *   aggiunge un fornitore finto SOLO al registro — cioè si riproduce esattamente il gesto che
   *   l'inventario ha visto fare tredici volte — e si pretende che ogni superficie protesti.
   *
   *   È la lezione `il-cancello-semantico-era-spento-da-sempre` (27/8): ogni test provava solo che
   *   una scrittura LEGITTIMA passasse, mai che una illegittima venisse respinta, e il cancello è
   *   rimasto inerte per intere campagne senza che nessuno se ne accorgesse.
   */
  const finto = { ...REGISTRO_FORNITORI.deepseek, id: 'fornitore-finto', etichetta: 'Fornitore Finto' };
  const registroGonfiato = { ...REGISTRO_FORNITORI, 'fornitore-finto': finto };

  /* Il registro gonfiato è valido di per sé: il difetto non è nel record, è nel resto che non lo sa. */
  assert.equal(verificaRegistro(registroGonfiato), true);

  const conCredenziale = Object.values(registroGonfiato).filter((r) => r.credenziale === true).map((r) => r.id);
  const perChat = Object.values(registroGonfiato).filter((r) => r.destinazioneChat === true).map((r) => r.id);

  for (const [dove, effettivi, attesi] of [
    ['portachiavi', PROVIDER_IDS, conCredenziale],
    ['sonde', Object.keys(SONDE_PROVIDER), conCredenziale],
    ['destinazioni di chat', FONTI_MODELLO, perChat],
    ['schede del selettore', PROVIDER_DIRETTI.map((p) => p.id), [...ID_CATALOGO_IN_UI, 'fornitore-finto']],
    ['<select> del template', [...leggi('frontend/index.template.html').matchAll(/<option value="([^"]+)"/gu)].map((m) => m[1]), conCredenziale],
  ]) {
    assert.throws(() => stessiId(effettivi, attesi, dove), assert.AssertionError, `${dove}: il cancello NON ha visto il fornitore aggiunto da una parte sola`);
  }

  /* ⛔ E la regex della richiesta, che è l'altra metà: il finto non passa finché non è nel registro VERO. */
  assert.equal(modelloRichiestaValido('fornitore-finto:modello-x'), false);
});
