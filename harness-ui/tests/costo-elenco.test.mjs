import test from 'node:test';
import assert from 'node:assert/strict';
import { costoDelTesto, costoElenco, contatoreDaContextEngine, stimaRegolaQuattroCaratteri, TARATURA_STIMA, LISTINO_22_08 } from '../src/costo-elenco.mjs';

/* Un contatore FINTO, dichiarato tale: serve solo a provare che il modulo rispetta ciò che il
   contatore dice di sé. ⛔ Non è un secondo stimatore — non viene mai usato per produrre numeri
   che qualcuno leggerà come costo vero. */
const contatoreFinto = (mappa, { metodo = 'contato', fonte = 'contatore finto di prova' } = {}) => {
  const porta = testo => {
    if (!mappa.has(testo)) throw Object.assign(new Error('testo non previsto dalla fixture'), { code: 'FIXTURE_MANCANTE' });
    return mappa.get(testo);
  };
  porta.metodo = metodo;
  porta.fonte = fonte;
  return porta;
};

const elencoFinto = (quanti, prefisso = 'src/modulo') => Array.from({ length: quanti }, (_, i) => `${prefisso}-${i}/file-${i}.mjs`).join('\n');

test('COSTO-ELENCO-01 lo stesso testo dà lo stesso numero due volte di fila, stimato o contato', () => {
  const testo = elencoFinto(120);
  const primo = costoDelTesto(testo);
  const secondo = costoDelTesto(testo);
  assert.equal(primo.token, secondo.token);
  assert.deepEqual(primo, secondo);
  const contatore = contatoreFinto(new Map([[testo, 1234]]));
  assert.equal(costoDelTesto(testo, { contatore }).token, 1234);
  assert.equal(costoDelTesto(testo, { contatore }).token, 1234);
});

test('COSTO-ELENCO-02 il metodo è dichiarato: con un contatore vero è contato, senza è stimato', () => {
  const testo = elencoFinto(10);
  const senza = costoDelTesto(testo);
  assert.equal(senza.metodo, 'stimato');
  assert.match(senza.confidenza, /byte UTF-8/u);
  assert.match(senza.confidenza, /Non è un conteggio/u);
  assert.ok(senza.margineToken > 0, 'una stima dichiara il proprio margine');

  const con = costoDelTesto(testo, { contatore: contatoreFinto(new Map([[testo, 77]])) });
  assert.equal(con.metodo, 'contato');
  assert.equal(con.token, 77);
  assert.equal(con.margineToken, 0, 'un conteggio non porta un margine di stima');
  assert.match(con.confidenza, /ha tokenizzato questo testo/u);
});

test('COSTO-ELENCO-03 AL CONTRARIO: una stima non può travestirsi da misura', () => {
  const testo = elencoFinto(5);
  // ⛔ Chiedere "contato" senza contatore: si ferma, non stima di nascosto.
  assert.throws(() => costoDelTesto(testo, { metodo: 'contato' }), { code: 'COSTO_CONTATORE_ASSENTE' });
  // ⛔ Un contatore che si dichiara "stimato" resta stimato anche passando di qui.
  const eredita = costoDelTesto(testo, { contatore: contatoreFinto(new Map([[testo, 50]]), { metodo: 'stimato', fonte: 'ripiego euristico' }) });
  assert.equal(eredita.metodo, 'stimato');
  assert.equal(eredita.token, 50);
  assert.match(eredita.confidenza, /non lo trasforma in una misura/u);
  assert.ok(eredita.margineToken > 0);
  // ⛔ Un conteggio non valido non ripiega in silenzio su una stima: fallisce.
  for (const rotto of [Number.NaN, 12.5, -1, '900', null]) {
    const porta = () => rotto;
    porta.fonte = 'contatore rotto';
    assert.throws(() => costoDelTesto(testo, { contatore: porta }), { code: 'COSTO_CONTEGGIO_INVALIDO' }, `conteggio rotto accettato: ${String(rotto)}`);
  }
  // ⛔ Un contatore asincrono passato per errore darebbe una Promise letta come numero: si ferma.
  const asincrono = async () => 10;
  assert.throws(() => costoDelTesto(testo, { contatore: asincrono }), { code: 'COSTO_CONTATORE_ASINCRONO' });
  // ⛔ Forzare "stimato" con un contatore in mano resta stimato: il metodo lo decide chi chiama.
  assert.equal(costoDelTesto(testo, { metodo: 'stimato', contatore: contatoreFinto(new Map([[testo, 50]])) }).metodo, 'stimato');
});

test('COSTO-ELENCO-04 testo vuoto: zero token, non NaN e non uno', () => {
  const vuoto = costoDelTesto('');
  assert.equal(vuoto.token, 0);
  assert.equal(Number.isNaN(vuoto.token), false);
  assert.notEqual(vuoto.token, 1);
  assert.equal(vuoto.margineToken, 0, 'zero token non porta un margine inventato');
  assert.equal(vuoto.byte, 0);
  const elenco = costoElenco('', { finestra: 16384, giri: 24 });
  assert.equal(elenco.token, 0);
  assert.equal(elenco.costoSuNGiri, 0);
  assert.equal(elenco.conCache.dollari, 0);
  assert.equal(elenco.conCache.dollariSenzaCache, 0);
  assert.equal(elenco.conCache.fattoreRisparmio, null, 'nessun fattore di risparmio su zero dollari');
  assert.equal(elenco.percentualeFinestra, 0);
});

test('COSTO-ELENCO-05 finestra assente o zero: nessuna percentuale inventata', () => {
  const testo = elencoFinto(200);
  for (const finestra of [undefined, null, 0, -1, 1.5, '16384', Number.NaN]) {
    const esito = costoElenco(testo, { finestra });
    assert.equal(esito.percentualeFinestra, null, `percentuale inventata con finestra ${String(finestra)}`);
    assert.equal(esito.finestraNota, false);
    assert.equal(esito.tokenLiberiNellaFinestra, null);
    assert.equal(esito.oltreLaFinestra, null);
    assert.notEqual(esito.percentualeFinestra, 0);
    assert.notEqual(esito.percentualeFinestra, 100);
    assert.ok(esito.token > 0, 'il costo in token resta noto anche senza finestra');
  }
});

test('COSTO-ELENCO-06 con una finestra vera la percentuale e lo spazio residuo sono reali', () => {
  const testo = elencoFinto(676);
  const esito = costoElenco(testo, { finestra: 16384 });
  assert.equal(esito.finestraNota, true);
  assert.equal(esito.percentualeFinestra, Number((esito.token / 16384 * 100).toFixed(2)));
  assert.equal(esito.tokenLiberiNellaFinestra, 16384 - esito.token);
  assert.equal(esito.oltreLaFinestra, false);
  const stretta = costoElenco(testo, { finestra: 100 });
  assert.equal(stretta.oltreLaFinestra, true);
  assert.ok(stretta.tokenLiberiNellaFinestra < 0, 'lo sforamento si vede, non si azzera');
});

test('COSTO-ELENCO-07 la cache su 24 giri cambia il conto, e la differenza è dichiarata', () => {
  const testo = elencoFinto(676);
  const ventiquattro = costoElenco(testo, { finestra: 200000, giri: 24 });
  assert.equal(ventiquattro.conCache.attiva, true);
  assert.equal(ventiquattro.conCache.giriPieni, 2);
  assert.equal(ventiquattro.conCache.giriScontati, 22);
  assert.notEqual(ventiquattro.conCache.dollari, ventiquattro.conCache.dollariSenzaCache);
  assert.ok(ventiquattro.conCache.dollari < ventiquattro.conCache.dollariSenzaCache);
  assert.ok(ventiquattro.conCache.risparmioDollari > 0);
  // La differenza è DETTA, non lasciata da dedurre.
  assert.match(ventiquattro.conCache.avvertenza, /si pagano PIENI/u);
  assert.match(ventiquattro.conCache.listino, /input_cache_read/u);
  // 2 giri pieni + 22 a un sesto ⇒ risparmio atteso: 24/(2+22/6) = 4,17×
  assert.equal(ventiquattro.conCache.fattoreRisparmio, Number((24 / (2 + 22 / 6)).toFixed(3)));
});

test('COSTO-ELENCO-07b ⛔ con due soli giri la cache non ha ancora preso, e il modulo lo dice', () => {
  const testo = elencoFinto(676);
  for (const giri of [1, 2]) {
    const esito = costoElenco(testo, { giri });
    assert.equal(esito.conCache.attiva, false);
    assert.equal(esito.conCache.dollari, esito.conCache.dollariSenzaCache, `con ${giri} giri la cache non può risparmiare niente`);
    assert.equal(esito.conCache.risparmioDollari, 0);
    assert.equal(esito.conCache.fattoreRisparmio, 1);
    assert.match(esito.conCache.avvertenza, /non ha ancora preso/u);
    assert.match(esito.conCache.avvertenza, /esito sbagliato/u);
  }
  // ⛔ Il terzo giro è quello che cambia tutto: la prova che il confine è dove diciamo.
  const due = costoElenco(testo, { giri: 2 }).conCache;
  const tre = costoElenco(testo, { giri: 3 }).conCache;
  assert.equal(tre.attiva, true);
  assert.equal(tre.giriScontati, 1);
  assert.ok(tre.risparmioDollari > due.risparmioDollari);
});

test('COSTO-ELENCO-07c i dollari riproducono la misura del 22/08 sui 16.811 token', () => {
  // Giro pieno: 16.811 × $0,06/M = $0,001011 (misurato quel giorno).
  // ⛔ Il $0,001011 riportato quel giorno è arrotondato: il prodotto esatto è $0,00100866 (0,23% sotto).
  const pieno = LISTINO_22_08.promptDollariPerMilione * 16811 / 1e6;
  assert.ok(Math.abs(pieno - 0.001011) / 0.001011 < 0.005, `giro pieno ${pieno}`);
  /* Giro in cache: $0,000172 misurato. Ricostruito col meccanismo vero — 16.768 token PRESI dalla
     cache e 43 rimasti fuori — il conto torna a $0,00017026, cioè l'1,0% sotto il valore
     pubblicato (che è arrotondato a tre cifre). */
  const ricostruito = (16768 * LISTINO_22_08.cacheReadDollariPerMilione + 43 * LISTINO_22_08.promptDollariPerMilione) / 1e6;
  assert.ok(Math.abs(ricostruito - 0.000172) / 0.000172 < 0.015, `ricostruzione della misura ${ricostruito}`);
  /* ⛔ Il modulo semplifica: dà per cacheggiato TUTTO il prefisso, quindi $0,00016811 — il 2,3% sotto
     il misurato, perché quei 43 token fuori cache non li conta. Lo scarto è dichiarato qui, non
     nascosto: la semplificazione sottostima la spesa, mai il risparmio. */
  const inCache = LISTINO_22_08.cacheReadDollariPerMilione * 16811 / 1e6;
  assert.ok(inCache < ricostruito, 'la semplificazione sta SOTTO la misura, e lo sappiamo');
  assert.ok(Math.abs(inCache - 0.000172) / 0.000172 < 0.03, `giro in cache ${inCache}`);
  assert.ok(Math.abs(pieno / inCache - 6) < 0.001, 'il listino dà esattamente un sesto');
  // E lo stesso conto passa dal modulo: 3 giri = 2 pieni + 1 in cache.
  const contatore = contatoreFinto(new Map([['prefisso', 16811]]));
  const tre = costoElenco('prefisso', { giri: 3, contatore }).conCache;
  assert.equal(tre.dollari, Number((2 * pieno + inCache).toFixed(10)));
});

test('COSTO-ELENCO-08 ⛔ accenti, emoji e ideogrammi: la regola dei 4 caratteri è falsa, e la stima non crolla', () => {
  const otto = '中文字符测试内容'; // 8 ideogrammi
  assert.equal([...otto].length, 8);
  assert.equal(Buffer.byteLength(otto, 'utf8'), 24, 'ogni ideogramma sta in 3 byte UTF-8');
  /* Misura citabile (cl100k_base, Token Optimization Guide, letta 10/09/2026): 8 caratteri cinesi
     costano 11 token, contro 5 token per 16 caratteri inglesi. */
  const veroMisurato = 11;
  const regola = stimaRegolaQuattroCaratteri(otto);
  assert.equal(regola, 2);
  assert.ok(veroMisurato / regola > 5, `la regola dei 4 caratteri sbaglia di ${veroMisurato / regola}×, non di poco`);
  const nostra = costoDelTesto(otto);
  assert.ok(nostra.token > regola * 3, 'la stima a byte sta almeno 3 volte sopra la regola dei caratteri');
  assert.ok(veroMisurato / nostra.token < 2, `la stima a byte resta entro 2× dal vero (${nostra.token} contro ${veroMisurato})`);
  assert.equal(nostra.nonLatino, true);
  assert.match(nostra.confidenza, /PAVIMENTO/u);

  // Emoji: 4 byte l'una, e in UTF-16 sono due unità di codice — nessuna delle due è un token.
  const emoji = '🚀🚀🚀🚀';
  const misuraEmoji = costoDelTesto(emoji);
  assert.equal(misuraEmoji.caratteri, 4);
  assert.equal(misuraEmoji.unitaDiCodice, 8, 'contare .length sulle emoji conta il doppio dei caratteri');
  assert.equal(misuraEmoji.byte, 16);
  assert.ok(Number.isSafeInteger(misuraEmoji.token) && misuraEmoji.token > 0, 'niente NaN, niente zero');
  assert.ok(misuraEmoji.token > stimaRegolaQuattroCaratteri(emoji));

  // Accenti italiani: 2 byte l'uno. Stesso numero di caratteri, costo diverso — la regola non lo vede.
  const conAccenti = 'perché però città più così è';
  const senzaAccenti = 'perche pero citta piu cosi e';
  assert.equal([...conAccenti].length, [...senzaAccenti].length);
  assert.equal(stimaRegolaQuattroCaratteri(conAccenti), stimaRegolaQuattroCaratteri(senzaAccenti));
  assert.ok(costoDelTesto(conAccenti).byte > costoDelTesto(senzaAccenti).byte);
  assert.ok(costoDelTesto(conAccenti).token >= costoDelTesto(senzaAccenti).token, 'gli accenti costano di più, e la stima a byte se ne accorge');
  assert.equal(costoDelTesto(senzaAccenti).nonLatino, false);
  assert.equal(costoDelTesto(senzaAccenti).confidenza.includes('PAVIMENTO'), false, 'nessun avviso non latino su testo ASCII');
});

test('COSTO-ELENCO-08b ⛔ un elenco di percorsi è fitto di separatori, e la stima lo dichiara un pavimento', () => {
  const elenco = elencoFinto(677);
  const misura = costoDelTesto(elenco);
  assert.equal(misura.punteggiaturaDensa, true, 'un elenco di percorsi è denso di "/", "-" e "."');
  assert.ok(misura.quotaSeparatori > 0.1);
  assert.match(misura.confidenza, /PAVIMENTO/u);
  assert.match(misura.confidenza, /separatori/u);
  // Prosa italiana: stessa lingua, nessuna bandiera — la bandiera distingue davvero due forme di testo.
  const prosa = 'Questo è un testo di prosa italiana, scritto per la prova, senza percorsi di file dentro. '.repeat(10);
  const misuraProsa = costoDelTesto(prosa);
  assert.equal(misuraProsa.punteggiaturaDensa, false);
  assert.equal(misuraProsa.confidenza.includes('separatori'), false);
  // ⛔ La bandiera NON tocca il numero: nessun coefficiente inventato è entrato nel conto.
  assert.equal(misura.token, Math.ceil(misura.byte / TARATURA_STIMA.bytePerToken));
});

test('COSTO-ELENCO-09 il contatore del Context Engine si riusa, involucro sottratto', async () => {
  const testo = elencoFinto(3);
  const chiamate = [];
  const counter = {
    async countPreparedContext({ messages }) {
      const contenuto = messages[0].content;
      chiamate.push(contenuto);
      return { inputTokens: 12 + Buffer.byteLength(contenuto, 'utf8'), method: 'provider', exact: false };
    },
  };
  const porta = await contatoreDaContextEngine({ counter, model: { provider: 'anthropic', model: 'claude-sonnet-5' }, testi: [testo] });
  assert.equal(porta.metodo, 'contato');
  assert.equal(porta.involucroToken, 12, 'la richiesta vuota misura l\'involucro');
  assert.equal(chiamate[0], '', 'la prima chiamata misura la richiesta vuota');
  assert.equal(porta(testo), Buffer.byteLength(testo, 'utf8'), 'resta il costo MARGINALE dell\'elenco');
  const esito = costoElenco(testo, { finestra: 16384, giri: 24, contatore: porta });
  assert.equal(esito.metodo, 'contato');
  assert.match(esito.fonte, /anthropic\/claude-sonnet-5/u);
  assert.match(esito.fonte, /method=provider/u);
  assert.equal(esito.margineToken, 0);
});

test('COSTO-ELENCO-10 ⛔ se il Context Engine ripiega sull\'euristica, il risultato NON dice "contato"', async () => {
  const testo = elencoFinto(3);
  const counter = { async countPreparedContext() { return { inputTokens: 500, method: 'heuristic', exact: false, estimatedMarginTokens: 75 }; } };
  const porta = await contatoreDaContextEngine({ counter, model: { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' }, testi: [testo] });
  assert.equal(porta.metodo, 'stimato');
  const esito = costoElenco(testo, { finestra: 16384, contatore: porta });
  assert.equal(esito.metodo, 'stimato');
  assert.match(esito.fonte, /method=heuristic/u);
  assert.ok(esito.margineToken > 0);
});

test('COSTO-ELENCO-11 ⛔ la porta si ferma sui testi che non ha misurato, non stima di nascosto', async () => {
  const counter = { async countPreparedContext({ messages }) { return { inputTokens: 100 + messages[0].content.length, method: 'runtime', exact: true }; } };
  const porta = await contatoreDaContextEngine({ counter, model: { provider: 'local', model: 'qwen' }, testi: ['visto'] });
  assert.equal(porta('visto'), 5);
  assert.throws(() => porta('mai visto'), { code: 'COSTO_TESTO_NON_MISURATO' });
  assert.throws(() => costoDelTesto('mai visto', { contatore: porta }), { code: 'COSTO_TESTO_NON_MISURATO' });
  await assert.rejects(() => contatoreDaContextEngine({ counter: {}, model: {}, testi: [] }), { code: 'COSTO_CONTATORE_ASSENTE' });
  await assert.rejects(() => contatoreDaContextEngine({ counter, model: {}, testi: ['ok', 42] }), { code: 'COSTO_TESTI_INVALIDI' });
});

test('COSTO-ELENCO-12 gli ingressi rotti si fermano invece di produrre un numero', () => {
  assert.throws(() => costoDelTesto(null), { code: 'COSTO_TESTO_INVALIDO' });
  assert.throws(() => costoDelTesto(['a']), { code: 'COSTO_TESTO_INVALIDO' });
  assert.throws(() => costoDelTesto('a', { metodo: 'esatto' }), { code: 'COSTO_METODO_IGNOTO' });
  assert.throws(() => costoDelTesto('a', { contatore: 42 }), { code: 'COSTO_CONTATORE_INVALIDO' });
  for (const giri of [0, -3, 2.5, '24', undefined]) {
    if (giri === undefined) continue;
    assert.throws(() => costoElenco('a', { giri }), { code: 'COSTO_GIRI_INVALIDI' }, `giri accettati: ${String(giri)}`);
  }
  assert.equal(costoElenco('a').conCache.giri, 1, 'senza giri dichiarati se ne assume uno solo');
  assert.equal(TARATURA_STIMA.bytePerToken, 3.5, 'la taratura è la stessa di context-token-counters.mjs:70');
});
