/*
 * F1 (24/09/2026) — le funzioni PURE della compattazione desktop, provate una per una e nel verso contrario.
 * Sono le stesse che l'onda 2 chiamerà dal registro: qui non c'è adapter, kernel, rete o disco.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CARATTERI_MINIMI_RIDUCIBILI, ESITO_DOPPIONE, MARCATORE_ACCORCIATO,
  MARCATORE_INDICE, MARCATORE_RIASSUNTO, SCHEMA_RECORD_COMPATTAZIONE, TETTO_TOKEN_DEFAULT, VARIABILE_TETTO_TOKEN,
  accorciaTesto, applicaRecord, budgetCoda, calcolaSoglie, riduciCodaSottoPressione, classificaErroreFornitore, costruisciProiezione, costruisciRichiestaDiRiassunto,
  creaRecord, decidiCompattazione, dividiPerCompattazione, eRecordValido, indiceMeccanico, leggiTettoToken, leggiTettoEsplicito,
  misuraOccupazione, reasoningPerRiassunto, riattaccaEffimeri, staccaEffimeri, valutaRispostaDiRiassunto,
} from '../src/kernel/compattazione-desktop.mjs';

const sys = (content) => ({ role: 'system', content });
const user = (content) => ({ role: 'user', content });
const chiamata = (id, name, args) => ({ role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });
const esito = (id, content) => ({ role: 'tool', tool_call_id: id, content });
const testo = (content) => ({ role: 'assistant', content });

test('CTX-PURE-CAP — il tetto viene dall ambiente, intero positivo, tutto il resto è il default', () => {
  assert.equal(leggiTettoToken({}), TETTO_TOKEN_DEFAULT);
  assert.equal(leggiTettoToken({ [VARIABILE_TETTO_TOKEN]: '150000' }), 150_000);
  assert.equal(leggiTettoToken({ [VARIABILE_TETTO_TOKEN]: ' 42 ' }), 42);
  for (const brutto of ['0', '-5', 'abc', '1.5', '', '   ', '1e3']) assert.equal(leggiTettoToken({ [VARIABILE_TETTO_TOKEN]: brutto }), TETTO_TOKEN_DEFAULT, JSON.stringify(brutto));
  assert.equal(leggiTettoEsplicito({}), null);
  assert.equal(leggiTettoEsplicito({ [VARIABILE_TETTO_TOKEN]: '150000' }), 150_000);
  for (const brutto of ['0', '-5', 'abc', '1.5', '', '   ', '1e3']) assert.equal(leggiTettoEsplicito({ [VARIABILE_TETTO_TOKEN]: brutto }), null, JSON.stringify(brutto));
});

test('CTX-PURE-THRESHOLDS — il minore fra tetto e 0,75 finestra; emergenza 0,90 finestra o tetto × 1,2', () => {
  assert.deepEqual(calcolaSoglie({ tettoToken: 200_000, finestraToken: null }), { soglia: 200_000, warningTokens: 160_000, emergenza: 240_000, fonte: 'tetto', tettoToken: 200_000, finestraToken: null });
  assert.deepEqual(calcolaSoglie({ tettoToken: 200_000, finestraToken: 1_000_000 }), { soglia: 200_000, warningTokens: 160_000, emergenza: 900_000, fonte: 'tetto', tettoToken: 200_000, finestraToken: 1_000_000 });
  assert.deepEqual(calcolaSoglie({ tettoToken: 200_000, finestraToken: 128_000 }), { soglia: 96_000, warningTokens: 76_800, emergenza: 115_200, fonte: 'finestra', tettoToken: 200_000, finestraToken: 128_000 });
  assert.equal(calcolaSoglie({ tettoToken: -1, finestraToken: 0 }).soglia, TETTO_TOKEN_DEFAULT, 'valori invalidi → default');
});

test('CTX-WINDOW-VERIFIED-MATH — il default storico non limita una finestra verificata', () => {
  const verificata = calcolaSoglie({ finestraToken: 1_000_000 });
  assert.equal(verificata.soglia, 750_000);
  assert.equal(verificata.emergenza, 900_000);
  assert.equal(verificata.warningTokens, 600_000);
  assert.equal(decidiCompattazione({ token: 163_901, soglia: verificata.soglia, emergenza: verificata.emergenza }).scatta, false);
  assert.equal(calcolaSoglie({ finestraToken: 262_144 }).soglia, 196_608, 'la route più stretta governa il trigger');
  assert.equal(calcolaSoglie({ tettoToken: 150_000, finestraToken: 1_000_000 }).soglia, 150_000, 'un limite esplicito più basso prevale');
  assert.equal(calcolaSoglie({ finestraToken: null }).soglia, 200_000, 'la finestra ignota resta prudenziale');
});

test('CTX-PURE-MEASURE — il numero del fornitore più la stima dei messaggi aggiunti; senza ancora, stima dichiarata', () => {
  const lista = [sys('a'.repeat(400)), user('b'.repeat(400)), testo('c'.repeat(400))];
  assert.deepEqual(misuraOccupazione({ ancora: null, messaggi: lista }), { token: 300, misura: 'stimato' });
  assert.deepEqual(misuraOccupazione({ ancora: { promptTokens: 5_000, lunghezza: 2 }, messaggi: lista }), { token: 5_100, misura: 'fornitore' });
  assert.deepEqual(misuraOccupazione({ ancora: { promptTokens: 5_000, lunghezza: 9 }, messaggi: lista }), { token: 300, misura: 'stimato' }, 'ancora più lunga della lista (appena compattata) → si stima');
  assert.deepEqual(misuraOccupazione({ ancora: { promptTokens: 0, lunghezza: 1 }, messaggi: lista }).misura, 'stimato');
  // Numeri impossibili del fornitore: sotto un quarto della stima di allora, o sopra la finestra ⇒ si stima.
  assert.deepEqual(misuraOccupazione({ ancora: { promptTokens: 1, lunghezza: 2, stima: 200 }, messaggi: lista }), { token: 300, misura: 'stimato' });
  assert.deepEqual(misuraOccupazione({ ancora: { promptTokens: 60, lunghezza: 2, stima: 200 }, messaggi: lista }), { token: 160, misura: 'fornitore' });
  assert.deepEqual(misuraOccupazione({ ancora: { promptTokens: 5_000, lunghezza: 2, stima: 200 }, messaggi: lista, finestraToken: 4_000 }), { token: 300, misura: 'stimato' });
});

test('CTX-PURE-DECIDE — soglia, emergenza, e i due esaurimenti', () => {
  assert.deepEqual(decidiCompattazione({ token: 100, soglia: 200, emergenza: 240 }), { scatta: false, motivo: null });
  assert.deepEqual(decidiCompattazione({ token: 200, soglia: 200, emergenza: 240 }), { scatta: true, motivo: 'soglia' });
  assert.deepEqual(decidiCompattazione({ token: 200, soglia: 200, emergenza: 240, tentativiEsauriti: true }), { scatta: false, motivo: null });
  assert.deepEqual(decidiCompattazione({ token: 240, soglia: 200, emergenza: 240, tentativiEsauriti: true }), { scatta: true, motivo: 'emergenza' });
  assert.deepEqual(decidiCompattazione({ token: 240, soglia: 200, emergenza: 240, tentativiEsauriti: true, emergenzaEsaurita: true }), { scatta: false, motivo: null });
  assert.deepEqual(decidiCompattazione({ token: NaN, soglia: 200, emergenza: 240 }), { scatta: false, motivo: null });
});

test('CTX-PURE-EPHEMERAL — i system in coda si staccano e si riattaccano; quelli in testa restano', () => {
  const piano = sys('Modalità Piano attiva.');
  const lista = [sys('agente'), sys('preambolo'), user('ciao'), testo('ok'), piano];
  const { messaggi, effimeri } = staccaEffimeri(lista);
  assert.deepEqual(effimeri, [piano]);
  assert.deepEqual(messaggi, lista.slice(0, 4));
  assert.deepEqual(riattaccaEffimeri(messaggi, effimeri), lista);
  assert.deepEqual(staccaEffimeri([sys('a'), sys('b'), user('c')]).effimeri, [], 'nessun effimero se l ultimo non è system');
  assert.deepEqual(staccaEffimeri([sys('a'), sys('b')]).effimeri, [], 'solo system = testa, non effimeri');
  assert.deepEqual(staccaEffimeri(null), { messaggi: [], effimeri: [] });
});

function storiaDiEsempio() {
  return [
    sys('agente'), sys('preambolo'),
    user('richiesta 1'),
    chiamata('c1', 'leggi', { percorso: 'src/a.mjs' }), esito('c1', 'contenuto a'),
    testo('fatto 1'),
    user('richiesta 2'),
    chiamata('c2', 'scrivi', { percorso: 'src/b.mjs' }), esito('c2', 'scritto sha 0a1b2c3d4e'),
    chiamata('c3', 'prova', {}), esito('c3', 'Error: test rosso\nok'),
    testo('fatto 2'),
    user('richiesta 3'),
    chiamata('c4', 'elenca', { percorso: '.' }), esito('c4', 'a b'),
    user('richiesta 4'),
    chiamata('c5', 'leggi', { percorso: 'src/c.mjs' }), esito('c5', 'contenuto c'),
    testo('fatto 4'),
  ];
}

test('CTX-PURE-SPLIT — testa = tutti i system; coda = ultimi 2 scambi mai spezzati; ultime 3 richiesta della persona letterali', () => {
  const lista = storiaDiEsempio();
  const parti = dividiPerCompattazione(lista);
  assert.equal(parti.testa.length, 2);
  assert.equal(parti.tagliabile, true);
  // 24/09 (review): uno scambio comincia a una richiesta della persona o a una chiamata di attrezzo. Dalla fine:
  // `chiamata c5` (1), «richiesta 4» (2) ⇒ la coda comincia a «richiesta 4», intera; delle 3 richieste letterali una è
  // già in coda ⇒ dal mezzo restano «richiesta 2» e «richiesta 3».
  assert.equal(parti.coda[0].content, 'richiesta 4');
  assert.ok(parti.coda.some((m) => m.tool_calls?.[0]?.id === 'c5') && parti.coda.some((m) => m.role === 'tool' && m.tool_call_id === 'c5'));
  assert.deepEqual(parti.richiesteLetterali.map((m) => m.content), ['richiesta 2', 'richiesta 3']);
  assert.ok(!parti.mezzo.some((m) => m.role === 'system'));
  // Nessun `tool` orfano in coda: tutti i tool della coda hanno il loro tool_calls nella coda.
  const aperti = new Set(parti.coda.flatMap((m) => (m.tool_calls ?? []).map((c) => c.id)));
  assert.ok(parti.coda.filter((m) => m.role === 'tool').every((m) => aperti.has(m.tool_call_id)));
});

test('CTX-PURE-SPLIT-TOOL-BOUNDARY — il taglio cade sempre all inizio di uno scambio (richiesta o chiamata): nessuna chiamata spezzata', () => {
  const lista = [sys('s'), user('u'), chiamata('x', 'leggi', { percorso: 'a' }), esito('x', '1'), esito('x', '2'), testo('t'), chiamata('y', 'leggi', { percorso: 'b' }), esito('y', '3')];
  // Una sola richiesta e scambiChiusi=3 ⇒ il taglio resta a 0: tutta la storia è coda, niente da riassumere.
  const parti = dividiPerCompattazione(lista, { scambiChiusi: 3 });
  assert.equal(parti.coda[0].role, 'user');
  assert.equal(parti.tagliabile, false, 'resta solo la richiesta: niente da riassumere');
  // Con due richieste e scambiChiusi=2 (chiamata y = 1, u2 = 2), la coda parte da «u2» e contiene la sua chiamata E il suo esito.
  const due = [sys('s'), user('u1'), chiamata('x', 'leggi', {}), esito('x', '1'), testo('t'), user('u2'), chiamata('y', 'leggi', {}), esito('y', '3')];
  const p2 = dividiPerCompattazione(due, { scambiChiusi: 2 });
  assert.equal(p2.coda[0].content, 'u2');
  assert.ok(p2.coda.some((m) => m.tool_calls?.[0]?.id === 'y') && p2.coda.some((m) => m.role === 'tool' && m.tool_call_id === 'y'));
});

test('CTX-PURE-SPLIT-NOTHING — una storia corta non è tagliabile', () => {
  assert.equal(dividiPerCompattazione([sys('s'), user('u')]).tagliabile, false);
  assert.equal(dividiPerCompattazione([sys('s'), user('u'), chiamata('a', 'leggi', {}), esito('a', 'x'), testo('t')]).tagliabile, false);
  assert.equal(dividiPerCompattazione([]).tagliabile, false);
});

test('CTX-PURE-INDEX — percorsi dagli argomenti, impronte, errori, ≤5 file riletti, fusione col precedente', () => {
  const parti = dividiPerCompattazione(storiaDiEsempio());
  const indice = indiceMeccanico(parti.mezzo);
  assert.ok(indice.percorsi.includes('src/a.mjs') && indice.percorsi.includes('src/b.mjs') && indice.percorsi.includes('.'));
  assert.deepEqual(indice.impronte, ['0a1b2c3d4e']);
  assert.deepEqual(indice.errori, ['Error: test rosso ← prova'], 'l errore porta l attrezzo che l ha prodotto (27/09)');
  assert.deepEqual(indice.fileRiletti, ['src/b.mjs', 'src/a.mjs'], 'ultimi letti/scritti, dal più recente');
  assert.ok(indice.testo.startsWith(MARCATORE_INDICE));
  assert.ok(!indice.impronte.includes('c1'), 'gli id delle chiamate non sono impronte');
  const fuso = indiceMeccanico([chiamata('z', 'leggi', { percorso: 'src/z.mjs' })], { precedente: indice });
  assert.deepEqual(fuso.fileRiletti, ['src/z.mjs', 'src/b.mjs', 'src/a.mjs']);
  assert.ok(fuso.errori.some((e) => e.startsWith('Error: test rosso')));
  const molti = indiceMeccanico(Array.from({ length: 8 }, (_, i) => chiamata(`k${i}`, 'leggi', { percorso: `f${i}.txt` })));
  assert.equal(molti.fileRiletti.length, 5);
  assert.equal(molti.fileRiletti[0], 'f7.txt');
});

test('CTX-PURE-INDEX-PROVENANCE — ogni impronta porta l attrezzo e il comando che l ha prodotta (banco GLM 27/09, M6)', () => {
  /* Il caso vero del trascritto 4c3e1649: l'md5 esce da un comando LUNGO, a metà; l'assistente poi lo ripete. */
  const comando = 'false; echo "rc_false=$?"; nosuchcmd_xyz 2>/dev/null; echo "rc_notfound=$?"; echo ---; seq 1 20000 | md5sum; echo ---; curl -s -o /dev/null';
  const lista = [
    user('audit'),
    chiamata('s1', 'shell', { comando }),
    esito('s1', 'exit 0\nrc_false=0\n---\ne071f707df7bbeee2a6a1eb48011ddd0  -\n---'),
    testo('L md5 è e071f707df7bbeee2a6a1eb48011ddd0 e il commit 3f2a9c1b.'),
    chiamata('l1', 'leggi', { percorso: 'src/a.mjs' }),
    esito('l1', 'hash 0a1b2c3d4e'),
  ];
  const indice = indiceMeccanico(lista);
  assert.deepEqual(indice.impronte, ['e071f707df7bbeee2a6a1eb48011ddd0', '3f2a9c1b', '0a1b2c3d4e']);
  assert.equal(indice.origini.e071f707df7bbeee2a6a1eb48011ddd0, `shell «${comando}»`, 'la prima comparsa vince: il comando, non il testo che la ripete');
  assert.equal(indice.origini['3f2a9c1b'], 'assistant text');
  assert.equal(indice.origini['0a1b2c3d4e'], 'leggi «src/a.mjs»');
  assert.ok(indice.testo.includes('seq 1 20000 | md5sum'), 'il comando è nel testo dell indice');
  assert.ok(indice.testo.includes(`  · shell «${comando}»: e071f707df7bbeee2a6a1eb48011ddd0`), indice.testo);
  /* Un comando oltre il tetto si tronca con «…» e resta su una riga. */
  const lungo = indiceMeccanico([chiamata('x', 'shell', { comando: `echo ${'a'.repeat(400)}\nsha256sum f` }), esito('x', 'ab12cd34ef')]);
  assert.equal(lungo.origini.ab12cd34ef.length, 'shell «»'.length + 240);
  assert.ok(lungo.origini.ab12cd34ef.endsWith('…»') && !lungo.origini.ab12cd34ef.includes('\n'));
  /* Un esito senza la sua chiamata nel mezzo resta dichiarato, non inventato. */
  assert.equal(indiceMeccanico([esito('orfano', 'deadbeef1')]).origini.deadbeef1, 'tool result');
  /* Fusione: la provenienza sopravvive al record e alla compattazione dopo; un record VECCHIO (senza origini) lo dice. */
  const record = creaRecord({ coveredThrough: 1, riassunto: [], indice });
  const fuso = indiceMeccanico([chiamata('z', 'leggi', { percorso: 'b' })], { precedente: record.indice });
  assert.equal(fuso.origini.e071f707df7bbeee2a6a1eb48011ddd0, `shell «${comando}»`);
  const vecchio = indiceMeccanico([], { precedente: { percorsi: [], impronte: ['cafe1234'], errori: [], fileRiletti: [] } });
  assert.ok(vecchio.testo.includes('origin not recorded (earlier compaction): cafe1234'), vecchio.testo);
  /* Senza impronte la riga resta quella di sempre. */
  assert.ok(indiceMeccanico([user('x')]).testo.includes('- Fingerprints found in the results: (none)'));
});

test('CTX-PURE-INDEX-OUR-ERRORS — l indice riconosce gli errori dei NOSTRI attrezzi (`error: ENOENT…`, `exit N [sandbox`) con la provenienza (banco GLM 27/09, M7)', () => {
  const lista = [
    chiamata('l1', 'leggi', { percorso: '/tmp/audit-solo-tmp.txt' }),
    esito('l1', "error: ENOENT: no such file or directory, open 'C:\\tmp\\audit-solo-tmp.txt'"),
    chiamata('s1', 'shell', { comando: 'cd tasktest && node test_totale.mjs' }),
    esito('s1', 'exit 1 [sandbox: wsl2]\nAssertionError: atteso [### ]'),
    chiamata('s2', 'shell', { comando: 'echo ok' }),
    esito('s2', 'exit 0 [sandbox: wsl2]\nok'),
    chiamata('s3', 'shell', { comando: 'ls' }),
    esito('s3', 'exit 12 [sandbox: none]\n"AAA" non è riconosciuto'),
    testo('✗ la prova è rossa'),
  ];
  const indice = indiceMeccanico(lista);
  assert.deepEqual(indice.errori, [
    "error: ENOENT: no such file or directory, open 'C:\\tmp\\audit-solo-tmp.txt' ← leggi «/tmp/audit-solo-tmp.txt»",
    'exit 1 [sandbox: wsl2] ← shell «cd tasktest && node test_totale.mjs»',
    'AssertionError: atteso [### ] ← shell «cd tasktest && node test_totale.mjs»',
    'exit 12 [sandbox: none] ← shell «ls»',
    '✗ la prova è rossa',
  ]);
  assert.ok(!indice.testo.includes('exit 0'), 'un exit 0 non è un errore');
  assert.ok(indice.testo.includes('- Errors seen: error: ENOENT'), indice.testo);
  /* al tetto di 20 esce il più vecchio, come per le impronte; un errore identico non si duplica */
  const molti = indiceMeccanico(Array.from({ length: 25 }, (_, i) => [chiamata(`e${i}`, 'shell', { comando: `cmd${i}` }), esito(`e${i}`, `exit 1 [sandbox: wsl2]`)]).flat());
  assert.equal(molti.errori.length, 20);
  assert.equal(molti.errori[0], 'exit 1 [sandbox: wsl2] ← shell «cmd5»');
  assert.equal(molti.errori.at(-1), 'exit 1 [sandbox: wsl2] ← shell «cmd24»');
  const doppio = indiceMeccanico([chiamata('d', 'shell', { comando: 'cmd24' }), esito('d', 'exit 1 [sandbox: wsl2]')], { precedente: molti });
  assert.equal(doppio.errori.length, 20);
});

test('CTX-PURE-INDEX-RECENT-HASHES — al tetto di 20 escono le impronte più VECCHIE, anche quelle del record precedente (mille giri 27/09)', () => {
  const impronta = (i) => `${(i * 2654435761 >>> 0).toString(16).padStart(8, '0')}abcdef${String(i).padStart(2, '0')}`;
  const giro = (i) => [chiamata(`c${i}`, 'shell', { comando: `sha256sum f${i}` }), esito(`c${i}`, `${impronta(i)}  f${i}`)];
  const prima = indiceMeccanico(Array.from({ length: 15 }, (_, i) => giro(i)).flat());
  assert.equal(prima.impronte.length, 15);
  /* la compattazione dopo porta 10 impronte nuove: restano le 20 più recenti, le 5 più vecchie del precedente escono */
  const dopo = indiceMeccanico(Array.from({ length: 10 }, (_, i) => giro(15 + i)).flat(), { precedente: prima });
  assert.equal(dopo.impronte.length, 20);
  assert.deepEqual(dopo.impronte, Array.from({ length: 20 }, (_, i) => impronta(5 + i)), 'le ultime 20 in ordine cronologico');
  assert.ok(!dopo.impronte.includes(impronta(0)) && !(impronta(0) in dopo.origini), 'la più vecchia è uscita con la sua provenienza');
  assert.equal(dopo.origini[impronta(24)], 'shell «sha256sum f24»', 'la più recente ha la sua provenienza');
  /* verso contrario: un'impronta già presente non si duplica né sposta niente */
  const ripetuta = indiceMeccanico(giro(24), { precedente: dopo });
  assert.deepEqual(ripetuta.impronte, dopo.impronte);
});

test('CTX-PURE-SUMMARY-REQUEST — nessun attrezzo, budget dichiarato, riassunto precedente senza il suo indice', () => {
  const parti = dividiPerCompattazione(storiaDiEsempio());
  const richiesta = costruisciRichiestaDiRiassunto(parti);
  const ultimo = richiesta.at(-1);
  assert.equal(ultimo.role, 'user');
  assert.match(ultimo.content, /CONTEXT COMPACTION/);
  assert.match(ultimo.content, /at most 1200 words/);
  assert.match(ultimo.content, /Do not call any tool/);
  assert.doesNotMatch(ultimo.content, /MERGE it/);
  const precedente = user(`${MARCATORE_RIASSUNTO}\n\nvecchio riassunto\n\n${MARCATORE_INDICE}\n- Paths touched: x`);
  const conPrecedente = costruisciRichiestaDiRiassunto({ testa: parti.testa, mezzo: [precedente, ...parti.mezzo] });
  assert.match(conPrecedente.at(-1).content, /MERGE it/);
  const passato = conPrecedente.find((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO));
  assert.equal(passato.content, `${MARCATORE_RIASSUNTO}\n\nvecchio riassunto`, 'l indice non passa dal riassuntore');
});

test('CTX-PURE-EVALUATE — testo finito sì; attrezzo, troncato, vuoto no', () => {
  assert.deepEqual(valutaRispostaDiRiassunto({ scelta: { content: ' ok ' }, finishReason: 'stop' }), { ok: true, riassunto: 'ok', motivo: null });
  assert.deepEqual(valutaRispostaDiRiassunto({ scelta: { content: 'ok' } }), { ok: true, riassunto: 'ok', motivo: null });
  assert.equal(valutaRispostaDiRiassunto({ scelta: { content: 'ok', tool_calls: [{ id: 'x' }] }, finishReason: 'tool_calls' }).motivo, 'attrezzo');
  assert.equal(valutaRispostaDiRiassunto({ scelta: { content: 'ok' }, finishReason: 'length' }).motivo, 'troncato');
  assert.equal(valutaRispostaDiRiassunto({ scelta: { content: '   ' }, finishReason: 'stop' }).motivo, 'vuoto');
  assert.equal(valutaRispostaDiRiassunto({}).motivo, 'vuoto');
});

test('CTX-PURE-PROJECTION-AND-RECORD — proiezione = testa + richieste letterali + un messaggio + coda; applicaRecord la rifà', () => {
  const grezza = storiaDiEsempio();
  const parti = dividiPerCompattazione(grezza);
  const proiezione = costruisciProiezione({ testa: parti.testa, richiesteLetterali: parti.richiesteLetterali, riassunto: 'RIASSUNTO', indice: 'INDICE', coda: parti.coda });
  assert.equal(proiezione[0].role, 'system');
  assert.equal(proiezione[1].role, 'system');
  assert.equal(proiezione[2].content, 'richiesta 2');
  const marcato = proiezione.find((m) => typeof m.content === 'string' && m.content.startsWith(MARCATORE_RIASSUNTO));
  assert.match(marcato.content, /RIASSUNTO\n\nINDICE$/);
  assert.equal(proiezione.length, 2 + parti.richiesteLetterali.length + 1 + parti.coda.length);
  const record = creaRecord({ coveredThrough: grezza.length, riassunto: proiezione, tokenPrima: 9_000, tokenDopo: 3_000, misura: 'fornitore', at: '2026-09-24T10:00:00.000Z', modello: 'm', indice: { percorsi: ['a'] } });
  assert.equal(record.schema, SCHEMA_RECORD_COMPATTAZIONE);
  assert.ok(eRecordValido(record));
  assert.deepEqual(record.indice, { percorsi: ['a'], impronte: [], origini: {}, errori: [], fileRiletti: [] });
  const cresciuta = [...grezza, user('nuova'), testo('risposta')];
  assert.deepEqual(applicaRecord(cresciuta, record), [...proiezione, user('nuova'), testo('risposta')]);
  assert.deepEqual(applicaRecord(grezza.slice(0, 5), record), grezza.slice(0, 5), 'record più lungo della storia → storia grezza');
  assert.deepEqual(applicaRecord(grezza, { schema: 'altro' }), grezza, 'record invalido → storia grezza');
  assert.throws(() => creaRecord({ coveredThrough: -1, riassunto: [] }), TypeError);
  assert.throws(() => creaRecord({ coveredThrough: 1, riassunto: 'no' }), TypeError);
  assert.equal(creaRecord({ coveredThrough: 0, riassunto: [], misura: 'boh' }).misura, 'stimato');
});

test('CTX-PURE-OVERFLOW — le forme reali del contesto pieno; un 400 qualunque no', () => {
  const e = (message, stato) => Object.assign(new Error(message), { stato });
  assert.equal(classificaErroreFornitore(e("HTTP 400 dopo 1 tentativo: {\"error\":{\"code\":400,\"message\":\"This endpoint's maximum context length is 131072 tokens. However, you requested about 135349 tokens\"}}", 400)), 'contesto-pieno');
  assert.equal(classificaErroreFornitore(e('HTTP 400 dopo 1 tentativo: {"error":{"code":"context_length_exceeded"}}', 400)), 'contesto-pieno');
  assert.equal(classificaErroreFornitore(e('prompt is too long: 233153 tokens > 200000 maximum', 400)), 'contesto-pieno');
  assert.equal(classificaErroreFornitore(e('Payload too large', 413)), 'contesto-pieno');
  // 25/09/2026 sera, MiniCPM5 sul 4174: il motore locale pieno sale col SUO codice (runtime-owner-adapter.mjs) e deve comprimere
  assert.equal(classificaErroreFornitore(Object.assign(e('La conversazione (17230 token) non entra nella finestra del modello locale (16384 token).', 400), { code: 'LOCAL_CONTEXT_EXCEEDED' })), 'contesto-pieno');
  assert.equal(classificaErroreFornitore(e('HTTP 400 dopo 1 tentativo: Invalid value for tool_choice', 400)), null);
  assert.equal(classificaErroreFornitore(e('HTTP 429 dopo 4 tentativi: rate limited', 429)), null);
  assert.equal(classificaErroreFornitore(null), null);
});

test('CTX-PURE-REASONING — si abbassa, mai si alza, e non si inventa', () => {
  assert.equal(reasoningPerRiassunto(undefined), undefined);
  assert.equal(reasoningPerRiassunto(null), undefined);
  assert.deepEqual(reasoningPerRiassunto({ effort: 'high' }), { effort: 'low' });
  assert.deepEqual(reasoningPerRiassunto({ effort: 'minimal' }), { effort: 'minimal' });
  assert.deepEqual(reasoningPerRiassunto({ enabled: true }), { enabled: true });
});

/* ═══ Owner 26/09/2026, «Come Hermes»: la coda letterale sotto pressione si accorcia, non blocca la compattazione ═══ */

const stimaCaratteri = (lista) => Math.ceil(JSON.stringify(lista).length / 4);
const lungo = (lettera, n) => `INIZIO-${lettera.repeat(n)}-FINE`;

test('CTX-PURE-TAIL-SHORTEN — inizio e fine col rimando, idempotente, e sotto i riducibili non si tocca', () => {
  const testoLungo = lungo('a', 10_000);
  const corto = accorciaTesto(testoLungo);
  assert.ok(corto.startsWith('INIZIO-'), 'l inizio resta');
  assert.ok(corto.endsWith('-FINE'), 'la fine resta');
  assert.ok(corto.includes(MARCATORE_ACCORCIATO), 'il rimando dice che manca qualcosa');
  assert.ok(corto.length < 2_000, `accorciato a ${corto.length}`);
  assert.equal(accorciaTesto(corto), corto, 'un testo già accorciato torna identico');
  const breve = 'b'.repeat(CARATTERI_MINIMI_RIDUCIBILI - 1);
  assert.equal(accorciaTesto(breve), breve, 'sotto la soglia dei riducibili non si tocca');
});

test('CTX-PURE-TAIL-UNDER-BUDGET — una coda dentro il tetto morbido torna lo STESSO oggetto (nessuna cache rotta per niente)', () => {
  const coda = [chiamata('c1', 'leggi', { percorso: 'a.txt' }), esito('c1', 'x'.repeat(3_000)), testo('ok')];
  const esitoPressione = riduciCodaSottoPressione(coda, { budgetToken: 10_000, stima: stimaCaratteri });
  assert.equal(esitoPressione.coda, coda);
  assert.equal(esitoPressione.ridotti, 0);
  assert.equal(esitoPressione.alMinimo, false);
  assert.equal(esitoPressione.tetto, 15_000, 'tetto morbido = budget × 1,5');
});

test('CTX-PURE-TAIL-PRESSURE-ORDER — doppioni, poi i vecchi, gli ultimi 3 intatti se basta; niente sparisce, nessun esito orfano', () => {
  const grande = lungo('g', 20_000);
  const coda = [
    user('rileggi'),
    chiamata('c1', 'leggi', { percorso: 'g.txt' }), esito('c1', grande),
    chiamata('c2', 'leggi', { percorso: 'g.txt' }), esito('c2', grande),
    chiamata('c3', 'leggi', { percorso: 'h.txt' }), esito('c3', lungo('h', 4_000)),
    testo('Letto.'),
  ];
  /* Primo caso: togliere il doppione BASTA (tetto morbido 7.500 token) ⇒ il più recente dei due resta intero. */
  const { coda: ridotta, ridotti, alMinimo } = riduciCodaSottoPressione(coda, { budgetToken: 5_000, stima: stimaCaratteri });
  assert.equal(ridotta.length, coda.length, 'nessun messaggio sparisce');
  assert.deepEqual(ridotta.map((m) => m.role), coda.map((m) => m.role), 'stessi ruoli nello stesso ordine');
  assert.deepEqual(ridotta.map((m) => m.tool_call_id ?? null), coda.map((m) => m.tool_call_id ?? null), 'ogni esito resta legato alla sua chiamata');
  assert.equal(ridotta[2].content, ESITO_DOPPIONE, 'il doppione più vecchio diventa un rimando');
  assert.equal(ridotta[4].content, grande, 'il più recente dei due resta intero, perché basta il doppione');
  assert.equal(ridotti, 1);
  assert.equal(alMinimo, false);
  assert.ok(stimaCaratteri(ridotta) <= 7_500, `rientra nel tetto morbido: ${stimaCaratteri(ridotta)}`);
  /* Secondo caso: non basta (tetto morbido 3.000) ⇒ si accorciano i vecchi, e gli ultimi 3 messaggi restano intatti. */
  const stretta = riduciCodaSottoPressione(coda, { budgetToken: 2_000, stima: stimaCaratteri });
  assert.equal(stretta.coda[2].content, ESITO_DOPPIONE);
  assert.ok(stretta.coda[4].content.includes(MARCATORE_ACCORCIATO), 'la lettura fuori dagli ultimi 3 si accorcia');
  assert.deepEqual(stretta.coda.slice(-3), coda.slice(-3), 'gli ultimi tre messaggi sono intatti');
  assert.equal(stretta.alMinimo, false);
  assert.ok(stimaCaratteri(stretta.coda) <= 3_000, `rientra: ${stimaCaratteri(stretta.coda)}`);
});

test('CTX-PURE-TAIL-LAST-RESORT — se non basta, anche il più recente si accorcia; al minimo solo se nemmeno così rientra', () => {
  const coda = [chiamata('c1', 'leggi', { percorso: 'g.txt' }), esito('c1', lungo('g', 60_000)), testo('Letto.')];
  const ridotta = riduciCodaSottoPressione(coda, { budgetToken: 1_000, stima: stimaCaratteri });
  assert.ok(ridotta.coda[1].content.includes(MARCATORE_ACCORCIATO), 'l unico esito, il più recente, si accorcia come ultima risorsa');
  assert.ok(ridotta.coda[1].content.startsWith('INIZIO-') && ridotta.coda[1].content.endsWith('-FINE'));
  assert.equal(ridotta.alMinimo, false, 'accorciato rientra: non è un pavimento');
  const bloccata = riduciCodaSottoPressione([user('z'.repeat(40_000))], { budgetToken: 1_000, stima: stimaCaratteri });
  assert.equal(bloccata.alMinimo, true, 'una richiesta della persona non si accorcia: quello è il pavimento vero');
  assert.equal(bloccata.coda[0].content.length, 40_000);
});

test('CTX-PURE-TAIL-ARGUMENTS — gli argomenti enormi si accorciano DENTRO il JSON, che resta valido', () => {
  const contenuto = lungo('w', 30_000);
  const coda = [
    chiamata('w1', 'scrivi', { percorso: 'out.txt', contenuto }), esito('w1', 'scritto'),
    testo('uno'), testo('due'), testo('tre'),
  ];
  const { coda: ridotta } = riduciCodaSottoPressione(coda, { budgetToken: 1_000, stima: stimaCaratteri });
  const args = JSON.parse(ridotta[0].tool_calls[0].function.arguments);
  assert.equal(args.percorso, 'out.txt', 'i campi corti restano identici');
  assert.ok(args.contenuto.includes(MARCATORE_ACCORCIATO));
  assert.ok(args.contenuto.startsWith('INIZIO-'));
  assert.equal(ridotta[0].tool_calls[0].id, 'w1');
});

test('CTX-PURE-TAIL-BUDGET — il budget della coda è il 20% della soglia (Hermes summary_target_ratio)', () => {
  assert.equal(budgetCoda(200_000), 40_000);
  assert.equal(budgetCoda(20_000), 4_000);
  assert.equal(budgetCoda(0), 1);
  assert.equal(budgetCoda(Number.NaN), 1);
});
