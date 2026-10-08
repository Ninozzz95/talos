/*
 * K4a (03/10/2026, owner: «ogni singola parola nella app deve essere sia in inglese che in italiano») — il contratto dei testi
 * che il server manda alla persona come DATI: la frase INGLESE (riserva per la CLI), `<campo>Chiave` (una chiave dell'area
 * `server` del dizionario dell'interfaccia) e `<campo>Params` (i valori). Qui si prova che le tre cose dicano la STESSA frase:
 *   1. ogni chiave che il server nomina esiste nel dizionario, in italiano e in inglese (e il dizionario non ha voci morte);
 *   2. la voce inglese, coi valori dentro, è IDENTICA alla frase inglese del server (parola per parola);
 *   3. i segnaposto della voce italiana sono gli stessi della voce inglese.
 * ⛔ L'altra metà — l'interfaccia che sceglie la voce — sta in `frontend/tests/unit/k4a-testo-server.test.mjs`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import server from '../frontend/src/i18n/testi/server.js';
import { diagnosi } from '../src/doctor.mjs';
import { createProviderProbe } from '../src/provider-probe.mjs';
import { createProviderCredentialStore } from '../src/provider-credential-store.mjs';
import { REGISTRO_FORNITORI } from '../src/provider-registry.mjs';
import { createSearchSourceStore } from '../src/search-source-store.mjs';

/* K4b (03/10/2026): anche il registro (Capability, motivi delle metriche) e `server.mjs` (Doctor) nominano chiavi `server.…`. */
const FILE_DEL_SERVER = ['doctor', 'provider-registry', 'provider-probe', 'search-source-store', 'gh-service', 'session-registry', '../server', 'path-policy', 'provider-auth-cloud', 'acp-agent', 'research-orchestrator', 'research-store', 'session-store', 'research/verification', 'runtime-owner-adapter', 'provider-retry', 'generation-idle', 'openai-compatible-runtime', 'plugin-registry', 'browser-vivo', 'native-provider-adapter', 'workspace-search'];
const sorgente = (nome) => readFileSync(new URL(`../src/${nome}.mjs`, import.meta.url), 'utf8');

const en = (chiave) => server.en[chiave.replace(/^server\./u, '')];
const it = (chiave) => server.it[chiave.replace(/^server\./u, '')];
const segnaposto = (testo) => [...String(testo).matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((m) => m[1]).sort();
/** La voce inglese con i valori dentro; un parametro `<nome>Chiave` dice che il valore `<nome>` è a sua volta una voce inglese. */
function riempi(chiave, params) {
  const voce = en(chiave) ?? (Number.isFinite(Number(params?.n)) ? (Number(params.n) === 1 ? en(`${chiave}One`) : en(`${chiave}Many`)) : undefined);
  assert.ok(voce !== undefined, `${chiave}: nessuna voce inglese`);
  const valori = { ...(params ?? {}) };
  for (const nome of Object.keys(valori)) if (nome.endsWith('Chiave')) { const base = nome.slice(0, -'Chiave'.length); delete valori[nome]; valori[base] = en(params[nome]); assert.ok(valori[base] !== undefined, `${params[nome]}: nessuna voce inglese`); }
  return voce.replace(/\{([a-zA-Z0-9_]+)\}/gu, (tutto, nome) => (nome in valori ? String(valori[nome]) : tutto));
}
/** Il campo `campo` di un oggetto del server: la frase inglese deve essere la voce inglese coi valori. */
function uguale(oggetto, campo, dove) {
  const chiave = oggetto[`${campo}Chiave`];
  assert.equal(typeof chiave, 'string', `${dove}: manca ${campo}Chiave`);
  assert.equal(riempi(chiave, oggetto[`${campo}Params`]), oggetto[campo], `${dove}: ${chiave}`);
}

test('K4A-S01 — le due lingue del dizionario `server` hanno le stesse chiavi, nessuna voce vuota, gli stessi segnaposto', () => {
  assert.deepEqual(Object.keys(server.it).sort(), Object.keys(server.en).sort());
  for (const chiave of Object.keys(server.en)) {
    assert.ok(server.en[chiave].trim() && server.it[chiave].trim(), chiave);
    assert.deepEqual(segnaposto(server.it[chiave]), segnaposto(server.en[chiave]), chiave);
  }
});

test('K4A-S02 — ogni chiave `server.…` che i file del server nominano esiste nel dizionario; e il dizionario non ha voci che nessuno nomina', () => {
  const nominate = new Set();
  for (const file of FILE_DEL_SERVER) for (const m of sorgente(file).matchAll(/'(server\.[A-Za-z][A-Za-z0-9.]*)'/gu)) nominate.add(m[1]);
  /* le chiavi che il frontend legge da sé: il nome dei quattro fornitori e lo stato di esecuzione */
  const delFrontend = readFileSync(new URL('../frontend/src/components/testo-server.js', import.meta.url), 'utf8');
  for (const m of delFrontend.matchAll(/'(server\.[A-Za-z][A-Za-z0-9.]*)'/gu)) nominate.add(m[1]);
  /* K4b (03/10/2026): le quattro frasi di `server.mjs` (Doctor) passano `dettaglioChiave`, e il file è nell'elenco qui sopra:
     l'eccezione «pronte solo per server.mjs» non serve più. */
  const nelDizionario = new Set(Object.keys(server.en).map((k) => `server.${k}`));
  const base = (chiave) => chiave.replace(/(One|Many)$/u, '');
  for (const chiave of nominate) {
    assert.ok(nelDizionario.has(chiave) || (nelDizionario.has(`${chiave}One`) && nelDizionario.has(`${chiave}Many`)), `${chiave}: nominata dal server e assente dal dizionario`);
  }
  for (const chiave of nelDizionario) {
    assert.ok(nominate.has(chiave) || nominate.has(base(chiave)), `${chiave}: voce morta, nessuno la nomina`);
  }
});

test('K4A-S03 — Doctor: ogni dettaglio inglese è la voce inglese coi suoi valori (tutti i rami)', async () => {
  const comune = { chiaveConfigurata: true, eseguiComandoSandboxatoFn: async () => ({ enforcement: 'desktop' }), spawnSyncFn: () => ({ status: 0 }) };
  const fonti = (voci) => voci.map(([id, label, labelChiave]) => ({ id, label, ...(labelChiave ? { labelChiave } : {}), keyless: id === 'duckduckgo', keyConfigured: false }));
  const casi = [
    { labsAccesi: ['uno', 'due'] }, { labsAccesi: [] },
    { scratch: { percorso: null } }, { scratch: { percorso: 'C:/t', esiste: false } },
    { scratch: { percorso: 'C:/t', esiste: true, voci: 1, byte: 5 } }, { scratch: { percorso: 'C:/t', esiste: true, voci: 3, byte: 7 } },
    { negozioSessioni: { modalitaIntestazione: 'link' } }, { negozioSessioni: { modalitaIntestazione: 'senza-link' } }, { negozioSessioni: { modalitaIntestazione: null } },
    { cartelleProgetto: [] }, { cartelleProgetto: [{ id: 'a' }] }, { cartelleProgetto: [{ id: 'a' }, { id: 'b' }] },
    { ownerRuntime: { configurato: true, pronto: true } }, { catalogoTask: { disponibile: true } },
    { sessioniPersistenza: { corrotte: [], ultimaLettura: { ripristinate: 2, totali: 2 } } },
    { sessioniPersistenza: { corrotte: ['x'], scartate: [{ sessionId: 'x', motivo: 'corrotta' }], ultimaLettura: { ripristinate: 1, totali: 2 } } },
    { ricercaWeb: { source: 'duckduckgo', readiness: 'pronta', fonti: fonti([['duckduckgo', 'DuckDuckGo (no key)', 'server.search.label.duckduckgo']]) } },
    { ricercaWeb: { source: 'tavily', readiness: 'pronta', fonti: fonti([['tavily', 'Tavily']]) } },
    { ricercaWeb: { source: 'off', readiness: 'spenta', fonti: [] } },
    { ricercaWeb: { source: 'tavily', readiness: 'chiave-mancante', fonti: fonti([['tavily', 'Tavily']]) } },
    { ricercaWeb: { source: 'searxng', readiness: 'indirizzo-mancante', fonti: fonti([['searxng', 'SearXNG (your instance)', 'server.search.label.searxng']]) } },
    { ricercaWeb: { source: 'custom', readiness: 'pronta', fonti: fonti([['custom', 'Custom endpoint', 'server.search.label.custom']]) } },
  ];
  let controllati = 0;
  for (const [i, caso] of casi.entries()) {
    const risultato = await diagnosi({ ...comune, ...caso });
    for (const [nome, sezione] of Object.entries(risultato)) {
      if (!sezione || typeof sezione !== 'object' || Array.isArray(sezione)) continue;
      for (const campo of ['dettaglio', 'etichetta']) {
        if (typeof sezione[campo] === 'string' && sezione[`${campo}Chiave`]) { uguale(sezione, campo, `caso ${i} ${nome}`); controllati += 1; }
      }
    }
  }
  assert.ok(controllati >= casi.length, `controllati ${controllati}`);
  /* AL CONTRARIO: la voce che non coincide col testo del server è un rosso (la prova morde) */
  assert.throws(() => uguale({ dettaglio: 'Labs on: none!', dettaglioChiave: 'server.doctor.labs.none' }, 'dettaglio', 'finto'), /Labs on: none/);
});

test('K4A-S04 — fonti di ricerca: il nome inglese e la sua chiave dicono la stessa cosa; l\'italiano è quello di prima', () => {
  const pubblico = createSearchSourceStore({ keyring: null, file: null }).listPublic();
  const attesi = { duckduckgo: 'DuckDuckGo (senza chiave)', searxng: 'SearXNG (istanza tua)', custom: 'Endpoint personalizzato' };
  let conChiave = 0;
  for (const fonte of pubblico.fonti) {
    if (fonte.labelChiave) { uguale(fonte, 'label', fonte.id); conChiave += 1; assert.equal(it(fonte.labelChiave), attesi[fonte.id], fonte.id); }
    else assert.equal(attesi[fonte.id], undefined, `${fonte.id}: un nome italiano senza chiave`);
  }
  assert.equal(conChiave, 3);
});

test('K4A-S05 — fornitori: le tre note delle schede cloud e i quattro nomi con una parola italiana hanno la loro chiave', () => {
  for (const id of ['azure', 'bedrock', 'vertex']) {
    const cloud = REGISTRO_FORNITORI[id].cloud;
    uguale(cloud, 'nota', id);
  }
  assert.equal(it('server.provider.cloudNote.azure'), 'Scegli il nome della distribuzione presente nella tua risorsa. Un modello nel catalogo non è una distribuzione.');
  const nomi = Object.values(REGISTRO_FORNITORI).filter((r) => r.etichettaChiave);
  assert.deepEqual(nomi.map((r) => r.id).sort(), ['esterno', 'local', 'minimax-anthropic', 'zai-anthropic']);
  /* l'etichetta che il registro porta ancora è quella italiana di prima: la voce italiana la dice uguale */
  for (const r of nomi) assert.equal(it(r.etichettaChiave), r.etichetta, r.id);
});

/* La sonda, guidata con una rete finta: ogni `motivo` inglese è la voce inglese coi suoi valori. */
const risposta = (stato, corpo) => async () => Response.json(corpo, { status: stato });
const sonda = (id, { chiave = 'k', fetchImpl, runtime = { endpoint: 'https://provider.test/v1', timeoutSeconds: 12 } } = {}) => createProviderProbe({ leggiChiave: () => chiave, leggiRuntime: () => runtime, fetchImpl });

test('K4A-S06 — sonda: ogni motivo inglese della prova è la voce inglese coi valori', async () => {
  const casi = [
    ['openai', { fetchImpl: risposta(200, { data: [{ id: 'gpt-5' }, { id: 'gpt-5-mini' }] }) }, 'server.probe.catalogReached'],
    ['openai', { fetchImpl: risposta(401, {}) }, 'server.probe.credentialRejected'],
    ['openai', { fetchImpl: risposta(404, {}) }, 'server.probe.listNotFound'],
    ['openai', { fetchImpl: risposta(500, {}) }, 'server.probe.httpStatus'],
    ['openai', { chiave: null, fetchImpl: () => assert.fail('senza chiave non si chiama') }, 'server.probe.noKeySaved'],
    ['openai', { fetchImpl: async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); } }, 'server.probe.noResponse'],
    ['openai', { fetchImpl: async () => { throw new TypeError('fetch failed', { cause: new Error('redirect mode is set to error') }); } }, 'server.probe.redirected'],
    ['openai', { fetchImpl: async () => { throw new TypeError('fetch failed'); } }, 'server.probe.unreachable'],
    ['ollama', { chiave: null, fetchImpl: risposta(403, {}) }, 'server.probe.accessDeniedServer'],
    ['ollama', { chiave: null, fetchImpl: risposta(401, {}) }, 'server.probe.endpointNeedsAuth'],
    ['groq', { fetchImpl: risposta(200, { object: 'list' }) }, 'server.probe.noValidList'],
  ];
  for (const [id, opzioni, chiaveAttesa] of casi) {
    const esito = await sonda(id, opzioni).prova(id);
    assert.equal(esito.motivoChiave, chiaveAttesa, `${id} ${chiaveAttesa}: ${esito.motivo}`);
    uguale(esito, 'motivo', `${id} ${chiaveAttesa}`);
  }
  /* Z.AI Anthropic: nessun elenco da provare senza consenso — il nome ha una parola italiana, quindi porta la sua chiave */
  const zai = await sonda('zai-anthropic', { fetchImpl: () => assert.fail('Z.AI non genera senza consenso') }).prova('zai-anthropic');
  assert.equal(zai.motivoChiave, 'server.probe.noDocumentedList');
  assert.equal(zai.motivoParams.providerChiave, 'server.provider.label.zaiAnthropic');
  assert.equal(riempi(zai.motivoChiave, zai.motivoParams), 'Z.AI (Anthropic port): a model list to check the key is not documented. The minimal test needs a generation limited to one token and may use credit or quota; it has to be requested explicitly.');
  /* la richiesta minima, col consenso: i quattro esiti */
  const minima = async (corpo, stato = 200) => sonda('deepinfra', { fetchImpl: risposta(stato, corpo) }).prova('deepinfra', { consentiGenerazione: true });
  const valida = await minima({ choices: [{ message: { content: 'x' } }], usage: { prompt_tokens: 3 } });
  assert.equal(valida.motivoChiave, 'server.probe.minimalOk'); uguale(valida, 'motivo', 'minimalOk');
  const dichiara = await minima({ error: { message: 'invalid' }, choices: [{}] });
  assert.equal(dichiara.motivoChiave, 'server.probe.minimalErrorDeclared'); uguale(dichiara, 'motivo', 'minimalErrorDeclared');
  const malformata = await minima({ qualcosa: 1 });
  assert.equal(malformata.motivoChiave, 'server.probe.minimalNoValidMessage'); uguale(malformata, 'motivo', 'minimalNoValidMessage');
  const nonTrovato = await minima({}, 404);
  assert.equal(nonTrovato.motivoChiave, 'server.probe.minimalModelNotFound'); uguale(nonTrovato, 'motivo', 'minimalModelNotFound');
});

test('K4A-S07 — sonda: l\'errore «agente esterno non configurato» porta la sua chiave, e un errore altrui porta il solo testo', async () => {
  const store = createProviderCredentialStore({ env: {} });
  const probe = createProviderProbe({ leggiChiave: store.getKey, leggiRuntime: store.getRuntime, fetchImpl: () => assert.fail('nessuna rete') });
  const esito = await probe.prova('esterno');
  assert.equal(esito.esito, 'non-provabile');
  uguale(esito, 'motivo', 'agente esterno');
  assert.equal(esito.motivoChiave, 'server.probe.configureAgent');
  /* AL CONTRARIO: un errore che non ha una chiave non ne riceve una inventata */
  const sconosciuto = createProviderProbe({ leggiChiave: () => 'k', leggiRuntime: () => ({}), fetchImpl: () => assert.fail('nessuna rete') });
  const senzaIndirizzo = await sconosciuto.prova('openai');
  assert.equal(typeof senzaIndirizzo.motivo, 'string');
});

test('K4A-S08 — le voci italiane che il server mandava prima sono rimaste parola per parola (la frase di oggi)', () => {
  /* una per area: se qualcuno «migliora» l'italiano, il rosso lo dice — la regola è «ESATTAMENTE la frase di oggi» */
  assert.equal(it('server.doctor.labs.on'), 'Labs accesi: {list} (NOT_LIVE_VALIDATED finché non provati).');
  assert.equal(it('server.doctor.search.endpointMissing'), 'Serve ancora l\'indirizzo dell\'istanza {label}.');
  assert.equal(it('server.doctor.sessions.restoredSome'), '{restored} ripristinate, {discarded} scartate su {total}: {reasons}.');
  assert.equal(it('server.probe.minimalModelNotFound'), '{provider}: la prova non ha trovato il modello che usa per controllare la chiave; potrebbe non essere più disponibile. La chiave non è verificata da questa risposta.');
  assert.equal(it('server.probe.catalogReachedFirstPage'), '{provider}: catalogo raggiunto, {count} modelli visibili nella prima pagina. La generazione non è stata provata.');
  assert.equal(it('server.gh.install.checksumPublished'), 'L’impronta pubblicata da GitHub non coincide con quella attesa da TALOS: niente installazione');
  assert.equal(it('server.gh.login.exitedWith'), 'gh è uscito con {code}');
});
