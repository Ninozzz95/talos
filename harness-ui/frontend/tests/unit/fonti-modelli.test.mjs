import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDER_DIRETTI, eFonteDiretta, fontiDelSelettore, modelliDellaFonte, fraseVuotoDiretto,
  descrizioneModelloSelettore, aggiornaTestoModelloSelettore,
} from '../../src/components/fonti-modelli.js';

/*
 * BC-12. La striscia delle schede è la cosa che l'owner guarda per decidere DOVE cercare: se un
 * conteggio è falso, o se «non ho la chiave» e «non ha modelli» si leggono uguale, la striscia
 * costa un giro a vuoto invece di risparmiarlo. Ogni prova ha il verso giusto e quello contrario.
 */

const modelli = (provider, n) => Array.from({ length: n }, (_, i) => ({ id: `${provider}:m${i}`, nome: `m${i}`, provider }));

test('PI-UI-01 — Kimi, MiniMax e Qwen: nomi umani, conteggi e visibilità solo dopo collegamento', () => {
  const attesi = { kimi: 'Kimi', minimax: 'MiniMax', qwen: 'Qwen' };
  const vuote = fontiDelSelettore({});
  for (const [id, nome] of Object.entries(attesi)) {
    assert.equal(PROVIDER_DIRETTI.filter(p => p.id === id).length, 1);
    assert.equal(PROVIDER_DIRETTI.find(p => p.id === id).etichetta, nome);
    assert.equal(eFonteDiretta(id), true);
    assert.equal(vuote.some(f => f.id === id), false);
    const diretti = { [id]: modelli(id, 2) };
    const fonte = fontiDelSelettore({ diretti }).find(f => f.id === id);
    assert.equal(fonte.etichetta, nome);
    assert.equal(fonte.conto, 2);
    assert.equal(modelliDellaFonte(id, { diretti }), diretti[id]);
    assert.ok(fraseVuotoDiretto(id).includes(nome));
  }
});

test('⛔ LA RICHIESTA DELL’OWNER: ogni fornitore è una scheda di PRIMO livello', () => {
  const fonti = fontiDelSelettore({
    openrouter: modelli('openrouter', 444),
    locali: modelli('locale', 2),
    diretti: { anthropic: modelli('anthropic', 11), gemini: modelli('gemini', 31), openai: modelli('openai', 71), lmstudio: modelli('lmstudio', 3) },
  });
  // BC50-01: questi cataloghi producono sei fonti; non è un limite del selettore.
  assert.deepEqual(fonti.map((f) => f.id), ['openrouter', 'locali', 'anthropic', 'gemini', 'openai', 'lmstudio']);
  assert.deepEqual(fonti.map((f) => f.etichetta), ['OpenRouter', 'Locali', 'Anthropic', 'Gemini', 'OpenAI', 'LM Studio']);
  assert.deepEqual(fonti.map((f) => f.conto), [444, 2, 11, 31, 71, 3], 'ogni scheda porta il SUO conteggio, non la somma');
  // ⛔ AL CONTRARIO: la scheda ombrello non deve esistere più da nessuna parte.
  assert.equal(fonti.some((f) => f.id === 'diretti'), false);
  assert.equal(eFonteDiretta('diretti'), false);
  /* ⛔ L'elenco vero lo presidia `tests/provider-registry-parita.test.mjs` contro il registro del
     server: qui si prova la STRISCIA, non chi ci sta dentro. */
  /* P-G (12/09): undici fornitori «una riga ciascuno» in coda ai sei di prima; l'ordine dei sei non cambia.
     BC-50: oltre sei la striscia scorre; nessun fornitore collegato viene omesso. */
  const ids = PROVIDER_DIRETTI.map((p) => p.id);
  assert.deepEqual(ids.slice(0, 6), ['anthropic', 'gemini', 'openai', 'lmstudio', 'zai', 'deepseek']);
  for (const nuovo of ['groq', 'cerebras', 'mistral', 'together', 'fireworks', 'deepinfra', 'novita', 'nebius', 'xai', 'ollama-cloud', 'huggingface']) assert.ok(ids.includes(nuovo), `manca ${nuovo}`);
  assert.ok(PROVIDER_DIRETTI.slice(6).every((p) => p.soloSeCollegato === true), 'i fornitori nuovi compaiono solo con la chiave collegata');
});

test('BC50-01 — 8, 12 e 19 fonti restano ordinate, distinte e raggiungibili senza tetto fittizio', () => {
  for (const numero of [8, 12, 19]) {
    const collegati = PROVIDER_DIRETTI.slice(0, numero - 2);
    const diretti = Object.fromEntries(collegati.map((p, i) => [p.id, modelli(p.id, i + 1)]));
    const fonti = fontiDelSelettore({ openrouter: [], locali: [], diretti });
    assert.equal(fonti.length, numero);
    assert.deepEqual(fonti.map(f => f.id), ['openrouter', 'locali', ...collegati.map(p => p.id)]);
    assert.equal(new Set(fonti.map(f => f.id)).size, numero);
    for (const [i, fonte] of fonti.slice(2).entries()) {
      assert.equal(fonte.collegato, true);
      assert.equal(fonte.conto, i + 1);
      assert.equal(modelliDellaFonte(fonte.id, { diretti }), diretti[fonte.id]);
    }
  }
});

test('PF-UI-01 — riserva riconoscibile nelle schede reali, ritorno al catalogo senza etichetta', () => {
  const riserva = [{ id: 'deepseek:modello', nome: 'Nome umano', catalogo: { fonte: 'riserva' } }];
  const dati = { openrouter: riserva, diretti: { deepseek: riserva } };
  for (const id of ['openrouter', 'deepseek']) {
    assert.match(fontiDelSelettore(dati).find(f => f.id === id).etichetta, /elenco di riserva/);
    assert.equal(modelliDellaFonte(id, dati)[0].id, riserva[0].id);
  }
  const su = fontiDelSelettore({ openrouter: [{ nome: 'Vivo' }], diretti: { deepseek: [{ nome: 'Vivo' }] } });
  assert.equal(su.find(f => f.id === 'openrouter').etichetta, 'OpenRouter');
  assert.equal(su.find(f => f.id === 'deepseek').etichetta, 'DeepSeek');
});

test('PF-UI-02 — motivo umano datato, nessun prezzo, contesto o età di copia inventati', () => {
  const testo = descrizioneModelloSelettore({ catalogo: { fonte: 'riserva', dataRiserva: '2026-09-12',
    motivo: 'catalogo non raggiungibile: elenco di riserva del 12/09/2026' }, capacita: { toolCall: true } });
  assert.match(testo, /elenco di riserva del 12\/09\/2026/);
  assert.match(testo, /Catalogo non raggiungibile/);
  assert.match(testo, /Strumenti: sì/);
  assert.doesNotMatch(testo, /models\.dev|fallback|0 USD|secondi|Copia salvata|Data del catalogo non disponibile/);
});

test('PF-UI-03 — il renderer usa testo sicuro anche per i motivi di riserva', () => {
  const mount = { ownerDocument: { createElement: tag => ({ tag, textContent: '' }) }, replaceChildren(...nodes) { this.nodes = nodes; } };
  aggiornaTestoModelloSelettore(mount, { nome: 'Nome umano', catalogo: { fonte: 'riserva',
    dataRiserva: '2026-09-12', motivo: '<script>segreto-tecnico</script>' } });
  assert.match(mount.nodes[1].textContent, /elenco di riserva/);
  assert.doesNotMatch(mount.nodes[1].textContent, /script|segreto-tecnico/);
});

test('PE-UI-01 — DeepSeek compare con una chiave collegata e conserva gli id di scelta', () => {
  assert.equal(fontiDelSelettore().some(f => f.id === 'deepseek'), false);
  const dati = { diretti: { deepseek: [{ id: 'deepseek:modello', nome: 'Modello' }] } };
  assert.equal(fontiDelSelettore(dati).find(f => f.id === 'deepseek').etichetta, 'DeepSeek');
  assert.equal(modelliDellaFonte('deepseek', dati)[0].id, 'deepseek:modello');
});

test('PE-UI-02 — contesto, prezzi di ingresso/uscita/cache e data in italiano, senza id tecnici', () => {
  const testo = descrizioneModelloSelettore({
    id: 'deepseek:id-tecnico', contextLength: 128000,
    prezzoPrompt: 0.0000012, prezzoCompletion: 0.0000034, prezzoCacheRead: 0, prezzoCacheWrite: null,
    catalogo: { aggiornatoAlle: '2026-09-12T10:00:00Z', fallbackRete: true, etaCacheMs: 7200000 },
  });
  assert.match(testo, /Contesto: 128\.000 token/);
  assert.match(testo, /Ingresso: 1,2 USD\/M token/);
  assert.match(testo, /Uscita: 3,4 USD\/M token/);
  assert.match(testo, /Rilettura: 0 USD\/M token/);
  assert.match(testo, /Memorizzazione: non disponibile/);
  assert.match(testo, /12\/09\/2026/);
  assert.match(testo, /copia salvata.*7\.200 secondi/iu);
  assert.doesNotMatch(testo, /deepseek:|id-tecnico|ctx|cache_read|models\.dev/);
});

test('PE-UI-03 — valori assenti o invalidi non si trasformano in prezzi zero', () => {
  for (const prezzoPrompt of [null, undefined, '', false, -1, NaN]) {
    assert.match(descrizioneModelloSelettore({ prezzoPrompt }), /Ingresso: non disponibile/);
  }
  const testo = descrizioneModelloSelettore({});
  assert.match(testo, /Contesto: non disponibile/);
  assert.doesNotMatch(testo, /0 USD|1970|NaN|undefined|null/);
});

test('PE-UI-04 — fasce e capacità dichiarate: nessuna capacità negativa dedotta da un dato assente', () => {
  const testo = descrizioneModelloSelettore({ capacita: { toolCall: true, reasoning: false }, prezziPerMilione: { tiers: [{ tier: { type: 'context', size: 200000 } }] } });
  assert.match(testo, /Strumenti: sì/);
  assert.match(testo, /Ragionamento: no/);
  assert.match(testo, /Prezzi variabili con il contesto/);
  assert.match(descrizioneModelloSelettore({}), /Strumenti: non disponibile/);
});

test('PE-UI-05 — renderer: testo sicuro, nome umano, id di selezione e oggetto immutati', () => {
  const mount = { ownerDocument: { createElement: tag => ({ tag, textContent: '' }) }, replaceChildren(...nodes) { this.nodes = nodes; } };
  const modello = Object.freeze({ id: 'zai:id-tecnico', nome: '<img src=x onerror=alert(1)>', prezzoPrompt: 0 });
  aggiornaTestoModelloSelettore(mount, modello);
  assert.equal(mount.nodes[0].tag, 'strong');
  assert.equal(mount.nodes[0].textContent, modello.nome);
  assert.equal(mount.nodes[1].tag, 'small');
  assert.doesNotMatch(mount.nodes[1].textContent, /id-tecnico/);
  assert.equal(modello.id, 'zai:id-tecnico');
});

test('PD-UI — Z.AI compare quando collegato, con nome umano e modelli selezionabili', () => {
  assert.equal(fontiDelSelettore().some(f => f.id === 'zai'), false);
  assert.equal(fontiDelSelettore({ diretti: { zai: null } }).some(f => f.id === 'zai'), false);
  const cataloghi = { diretti: { zai: [{ id: 'zai:glm-5.3-flash', nome: 'GLM-5.3-Flash' }] } };
  const fonti = fontiDelSelettore(cataloghi);
  assert.deepEqual(fonti.find(f => f.id === 'zai'), { id: 'zai', etichetta: 'Z.AI', conto: 1, collegato: true });
  assert.equal(fonti.length, 7, 'P-D aggiunge la settima fonte solo se collegata');
  assert.equal(modelliDellaFonte('zai', cataloghi)[0].id, 'zai:glm-5.3-flash');
  assert.match(fraseVuotoDiretto('zai', { diretti: { zai: null } }), /Collega la chiave Z\.AI/u);
});

test('⛔ TRE STATI, NON UNO: «non ancora letto», «chiave non collegata» e «zero modelli» si distinguono', () => {
  const nonLetto = fontiDelSelettore({ openrouter: null, locali: null, diretti: null });
  for (const fonte of nonLetto) {
    assert.equal(fonte.conto, null, 'prima di leggere non si stampa nessun numero, nemmeno zero');
    assert.equal(fonte.collegato, true, 'e non si accusa nessuno di non avere la chiave');
  }

  const letto = fontiDelSelettore({ openrouter: [], locali: [], diretti: { anthropic: null, gemini: [], openai: modelli('openai', 3) } });
  const perId = Object.fromEntries(letto.map((f) => [f.id, f]));
  assert.equal(perId.anthropic.conto, null, 'senza chiave non c’è un conteggio da dare');
  assert.equal(perId.anthropic.collegato, false);
  assert.equal(perId.gemini.conto, 0, 'letto e vuoto È zero: un fatto, non un errore');
  assert.equal(perId.gemini.collegato, true);
  assert.equal(perId.openai.conto, 3);
});

test('le frasi del vuoto dicono tre cose diverse, e ognuna dice il passo successivo', () => {
  const conChiaveVuota = { diretti: { anthropic: null, gemini: [], openai: [] }, errori: {} };
  assert.match(fraseVuotoDiretto('anthropic', conChiaveVuota), /Collega la chiave Anthropic/u);
  assert.match(fraseVuotoDiretto('gemini', conChiaveVuota), /Nessun modello Gemini/u);
  assert.match(fraseVuotoDiretto('openai', { diretti: null }), /Leggo il catalogo OpenAI/u);
  assert.match(
    fraseVuotoDiretto('gemini', { diretti: { gemini: [] }, errori: { gemini: 'Gemini: HTTP 503' } }),
    /HTTP 503/u,
    'un guasto vince su tutto: si dice qual è, non «nessun modello»',
  );
  // ⛔ AL CONTRARIO — le tre frasi non devono essere la stessa frase.
  const tutte = new Set([
    fraseVuotoDiretto('anthropic', conChiaveVuota),
    fraseVuotoDiretto('gemini', conChiaveVuota),
    fraseVuotoDiretto('openai', { diretti: null }),
  ]);
  assert.equal(tutte.size, 3);
});

test('il catalogo della scheda aperta è il suo, e «non letto» resta null (≠ elenco vuoto)', () => {
  const cataloghi = {
    openrouter: modelli('openrouter', 2),
    locali: modelli('locale', 1),
    diretti: { anthropic: modelli('anthropic', 11), gemini: null, openai: [] },
  };
  assert.equal(modelliDellaFonte('openrouter', cataloghi).length, 2);
  assert.equal(modelliDellaFonte('locali', cataloghi).length, 1);
  assert.equal(modelliDellaFonte('anthropic', cataloghi).length, 11);
  assert.equal(modelliDellaFonte('gemini', cataloghi), null, 'senza chiave non c’è elenco: null, non []');
  assert.deepEqual(modelliDellaFonte('openai', cataloghi), [], 'con la chiave e zero modelli l’elenco c’è ed è vuoto');
  assert.equal(modelliDellaFonte('diretti', cataloghi), null, 'la vecchia scheda ombrello non ha più un catalogo');
  assert.equal(modelliDellaFonte('anthropic', { diretti: null }), null);
});
