import assert from 'node:assert/strict';
import { test as testNode, after as afterNode } from 'node:test';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
/*
 * 13/09, primo giro del job di release sui runner: il banco confronta il codice di oggi con il
 * commit 4cd01f80 «pre-C» via `git show`, che esiste solo nella storia del repo di sviluppo. Nel
 * monorepo pubblico (storia appiattita) i test si dichiarano saltati col motivo, mai rossi.
 */
let SALTA = false;
try {
  execFileSync('git', ['cat-file', '-e', '4cd01f803af46b70dff0f7445af9ca66962382c4^{commit}'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), stdio: 'ignore', windowsHide: true });
} catch { SALTA = 'il banco confronta col commit 4cd01f80 del repo di sviluppo, assente in questo clone (albero pubblico)'; }
let banco = {};
if (!SALTA) {
  try {
    await import('./fixtures/bc48-cbis-dipendenze.mjs');
    banco = await import('./fixtures/bc48-cbis-banco.mjs');
  } catch (errore) { SALTA = 'banco BC48-C-bis non caricabile qui: ' + String(errore?.message || errore).slice(0, 160); }
}
const { eseguiBanco, confrontaCorpi } = banco;
const { createOwnerRuntimeAdapter } = await import('../src/runtime-owner-adapter.mjs');
const test = (nome, opzioni, fn) => (typeof opzioni === 'function'
  ? testNode(nome, { skip: SALTA }, opzioni)
  : testNode(nome, { ...(opzioni ?? {}), skip: opzioni?.skip || SALTA }, fn));
// L'involucro copre il solo `test`: i ganci del runner si riportano a mano.
test.after = afterNode;

// Misure HTTP del 12/09/2026, Node 24.18.0, fixture AGENTS.md di 11.776/18.000
// byte. Questi sono byte UTF-8 del JSON, non token GLM. Offset contati da zero.
const MINIMO_PREFISSO = 13_242;
const MINIMO_PREFISSO_LUNGO = 19_533;
const misure = [];
function verificaPrefisso(misura, minimo = MINIMO_PREFISSO) {
  assert.ok(misura.confronto.byteUtf8 >= minimo,
    'Prefisso anticipato: ' + misura.confronto.byteUtf8 + ' byte; minimo misurato ' + minimo);
  const [prima, dopo] = misura.corpi.map(JSON.parse);
  assert.deepEqual(dopo.messages.slice(0, prima.messages.length), prima.messages);
  assert.deepEqual(Object.keys(dopo), Object.keys(prima));
  for (const campo of Object.keys(prima).filter(c => c !== 'messages')) assert.deepEqual(dopo[campo], prima[campo], campo);
  assert.equal(misura.confronto.prima, ']');
  assert.equal(misura.confronto.dopo, ',');
}

for (const ordine of ['C', 'pre-C']) {
  test('BC48-CBIS-RIPRESA-' + ordine + ': almeno 13242 byte identici dopo POST resume', async () => {
    const misura = await eseguiBanco({ ordine });
    verificaPrefisso(misura);
    assert.equal(misura.preamboli[0], misura.preamboli[1], 'senza ascoltatore attivo resta il contesto nella cache locale');
    assert.equal(misura.invalidazioni, 0);
    assert.equal(JSON.parse(misura.corpi[1]).messages.length, 5);
    misure.push(misura);
  });

  test('BC48-CBIS-RICOSTRUZIONE-' + ordine + ': nuovo contesto soltanto in coda', async () => {
    const misura = await eseguiBanco({ ordine, ricostruisci: true });
    verificaPrefisso(misura);
    assert.notEqual(misura.preamboli[0], misura.preamboli[1]);
    assert.match(misura.preamboli[1], /1 file non salvati/);
    const dopo = JSON.parse(misura.corpi[1]);
    assert.equal(dopo.messages.length, 6);
    assert.match(dopo.messages.at(-1).content, /^Aggiornamento del contesto del progetto:/);
    assert.ok(dopo.messages.at(-1).content.endsWith(misura.preamboli[1]));
    misure.push(misura);
  });
}

test('BC48-CBIS-ORDINI: C cambia il corpo ma non allunga il prefisso di una ripresa', () => {
  const [conC, preC] = ['C', 'pre-C'].map(ordine => misure.find(m => m.ordine === ordine && !m.ricostruisci));
  assert.notEqual(conC.corpi[0], preC.corpi[0]);
  assert.match(JSON.parse(conC.corpi[0]).messages[1].content, /^Istruzioni di questo progetto/);
  assert.match(JSON.parse(preC.corpi[0]).messages[1].content, /^Scheda di lavoro/);
  assert.equal(conC.confronto.byteUtf8, preC.confronto.byteUtf8);
  // Controllo sui preamboli ricostruiti, distinto dalla storia della ripresa.
  const [ricC, ricPre] = ['C', 'pre-C'].map(ordine => misure.find(m => m.ordine === ordine && m.ricostruisci));
  assert.ok(confrontaCorpi(...ricC.preamboli).byteUtf8 > confrontaCorpi(...ricPre.preamboli).byteUtf8);
});

test('BC48-CBIS-MARCATORE: watcher vero, 18 KB e almeno 19533 byte dopo la cura', async () => {
  const misura = await eseguiBanco({ osservaWorkspace: true, byteIstruzioni: 18_000 });
  verificaPrefisso(misura, MINIMO_PREFISSO_LUNGO);
  assert.ok(misura.invalidazioni > 0);
  assert.notEqual(misura.preamboli[0], misura.preamboli[1]);
  assert.match(JSON.parse(misura.corpi[1]).messages.at(-1).content, /^Aggiornamento del contesto del progetto:/);
  assert.equal(typeof misura.messaggiFinali[1].content, 'string', 'storia canonica integra');
  misure.push(misura);
});

test('BC48-CBIS-WATCHER: 11,5 KiB, modifica rilevata e preambolo iniziale intatto', async () => {
  const misura = await eseguiBanco({ osservaWorkspace: true });
  verificaPrefisso(misura);
  assert.ok(misura.invalidazioni > 0);
  assert.notEqual(misura.preamboli[0], misura.preamboli[1]);
  assert.match(JSON.parse(misura.corpi[1]).messages.at(-1).content, /^Aggiornamento del contesto del progetto:/);
  misure.push(misura);
});

test('BC48-CBIS-NEGATIVO: variazione anticipata ricevuta dal fornitore rifiutata', async () => {
  const misura = await eseguiBanco({ mutaRichiesta: (raw, indice) => {
    if (indice === 0) return raw;
    const corpo = JSON.parse(raw);
    corpo.messages[0].content = '[istante che cambia] ' + corpo.messages[0].content;
    return JSON.stringify(corpo);
  } });
  assert.throws(() => verificaPrefisso(misura), /Prefisso anticipato/);
});

test('BC48-CBIS-NEGATIVO-MARCATORE: il cambio array/stringa non supera il cancello', () => {
  const misura = misure.find(m => m.osservaWorkspace);
  const primo = JSON.parse(misura.corpi[0]);
  primo.messages[1].content = [{ type: 'text', text: primo.messages[1].content, cache_control: { type: 'ephemeral', ttl: '1h' } }];
  const corpi = [JSON.stringify(primo), misura.corpi[1]];
  assert.equal(confrontaCorpi(...corpi).byteUtf8, 443);
  assert.throws(() => verificaPrefisso({ corpi, confronto: confrontaCorpi(...corpi) }, MINIMO_PREFISSO_LUNGO), /Prefisso anticipato/);
});

test('BC48-CBIS-PERIMETRO: conserva altri modelli, immagini e blocchi estesi', async t => {
  const marcato = { type: 'text', text: 'Preambolo stabile', cache_control: { type: 'ephemeral', ttl: '1h' } };
  const casi = [
    ['GLM con marcatore', 'z-ai/glm-5.3-flash', 'system', [marcato], 'Preambolo stabile'],
    ['GLM senza marcatore', 'z-ai/glm-5.3-flash', 'system', [{ type: 'text', text: 'Intatto' }]],
    ['GLM contenuto misto', 'z-ai/glm-5.3-flash', 'system', [marcato, { type: 'image_url', image_url: { url: 'https://example.invalid/finta.png' } }]],
    ['GLM blocco esteso', 'z-ai/glm-5.3-flash', 'system', [{ ...marcato, dettaglio: 'da preservare' }]],
    ['GLM direttiva estesa', 'z-ai/glm-5.3-flash', 'system', [{ ...marcato, cache_control: { ...marcato.cache_control, scope: 'da preservare' } }]],
    ['GLM messaggio utente', 'z-ai/glm-5.3-flash', 'user', [marcato]],
    ['OpenRouter Claude', 'anthropic/claude-sonnet-4.6', 'system', [marcato]],
    ['Z.AI diretto', 'zai:glm-5.3', 'system', [marcato]],
  ];
  for (const [nome, model, role, content, atteso] of casi) await t.test(nome, async () => {
    let ricevuto;
    const corpo = { model, messages: [{ role, content }], tools: [], stream: true };
    const originale = JSON.stringify(corpo);
    const adapter = createOwnerRuntimeAdapter({ importFn: async () => ({
      talosLavora: input => input.fetchDiRete('https://openrouter.ai/api/v1/chat/completions', { body: originale }),
    }) });
    // Nessuna rete: questa prova controlla solo il perimetro dell'adapter.
    await adapter.talosLavora({ fetchDiRete: async (_url, init) => { ricevuto = init.body; return Response.json({}); } });
    if (atteso === undefined) assert.equal(ricevuto, originale);
    else assert.deepEqual(JSON.parse(ricevuto), { ...corpo, messages: [{ role, content: atteso }] });
    assert.equal(JSON.stringify(corpo), originale, 'nessuna mutazione del chiamante');
  });
});

test.after(() => {
  if (process.env.BC48_SALVA !== '1') return;
  for (const misura of misure.filter(m => !m.ricostruisci && (!m.osservaWorkspace || m.progetto.byteIstruzioni === 18_000))) {
    const prefisso = misura.osservaWorkspace ? 'marcatore-dopo-' : misura.ordine === 'pre-C' ? 'pre-c-' : '';
    for (const [i, raw] of misura.corpi.entries()) writeFileSync(new URL('../.claude/bc48-cbis-' + prefisso + 'turno-' + (i + 1) + '.json', import.meta.url), raw);
  }
  writeFileSync(new URL('../.claude/bc48-cbis-misure.json', import.meta.url), JSON.stringify(misure, null, 2) + '\n');
});
