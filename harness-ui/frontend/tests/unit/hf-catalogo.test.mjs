import test from 'node:test';
import assert from 'node:assert/strict';
import { conteggio, gruppiVarianti, quantDaNome, descriviStima, datiRepoHf, bitPerPeso, ordinaVarianti, varianteConsigliata, glossaQuant, eSenzaQuantizzazione } from '../../src/components/hf-catalogo.js';
import { RISULTATI_HF, DETTAGLIO_HF, STIMA_HF } from '../../lab/fixtures/hf-catalogo.js';

// 06/09 B6.9 — le parole del mockup escono dai dati del monolite; i set multi-file stanno insieme.

test('HF-VARIANTI: i file -0000N-of-0000M stanno in un gruppo, un set incompleto lo dice, README non è una variante', () => {
  const g = gruppiVarianti(DETTAGLIO_HF.files);
  assert.deepEqual(g.map((x) => x.quant), ['Q4_K_M', 'Q8_0', 'F16']);
  const multi = gruppiVarianti([{ path: 'm-Q4-00001-of-00003.gguf', sizeBytes: 10, sha256: 'a' }, { path: 'm-Q4-00002-of-00003.gguf', sizeBytes: 10, sha256: 'a' }]);
  assert.equal(multi.length, 1);
  assert.equal(multi[0].incompleto, true);
  assert.equal(multi[0].attesi, 3);
  assert.equal(quantDaNome('Qwen3-8B-IQ4_XS.gguf'), 'IQ4_XS');
});

test('HF-STIMA: entra · al limite · oltre la memoria · non misurato', () => {
  assert.equal(descriviStima(STIMA_HF.get('Qwen3-8B-Q4_K_M.gguf')).testo, '~8,1 GB di memoria · entra');
  assert.equal(descriviStima(STIMA_HF.get('Qwen3-8B-F16.gguf')).testo, '~19,3 GB · oltre la memoria allocabile');
  assert.equal(descriviStima({ state: 'tight', memory: { requiredBytes: 17.8 * 1024 ** 3 } }).testo, '~17,8 GB di memoria · al limite');
  assert.equal(descriviStima({ state: 'blocked', reason: 'storage' }, 5.2 * 1024 ** 3).testo, "5,2 GB · non c'è spazio sul disco");
  assert.equal(descriviStima(null, 5.2 * 1024 ** 3).testo, '5,2 GB da scaricare · non ancora misurato');
  assert.equal(descriviStima({ inCorso: true }).testo, 'Misuro su questo PC…');
});

test('HF-RIGA: autore del modello contro conversione della community; accesso richiesto', () => {
  const q = datiRepoHf(RISULTATI_HF[0]);
  assert.equal(q.titolo, 'Qwen / Qwen3-8B-GGUF');
  assert.equal(q.sub1, 'Conversazione e codice · 3 file compatibili');
  assert.equal(q.sub2, 'Licenza Apache 2.0');
  assert.deepEqual(q.badge, { testo: 'Autore del modello', tono: 'info' });
  const g = datiRepoHf(RISULTATI_HF[1]);
  assert.equal(g.sub1, 'Conversione della community · 2 file');
  assert.equal(g.sub2, 'Verifica le condizioni prima del download');
  assert.deepEqual(g.badge, { testo: 'Accesso richiesto', tono: 'warning' });
  const b = datiRepoHf({ repo: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF', gated: false });
  assert.equal(b.sub1, 'Conversione della community');
  assert.equal(b.badge, null);
  assert.equal(conteggio(412_000), '412 k');
  assert.equal(conteggio(-1), null);
});

/*
 * 06/09 — il ridisegno della scheda Hugging Face, bocciata dall'owner.
 * Le regole provate qui vengono dalle fonti citate nel cappello del componente:
 * la tabella «Quantization Types» di HuggingFace (bit per peso) e la riga di
 * Hermes Agent «below 4-bit the quality loss is too severe» (pavimento).
 *
 * ⛔ Ogni regola è provata ANCHE AL VERSO CONTRARIO: non basta che la variante
 * giusta venga consigliata, deve NON venire consigliata quella sbagliata.
 */
test('HF-QUALITÀ: i bit per peso sono quelli dichiarati da HuggingFace, e una sigla ignota NON vale zero', () => {
  assert.equal(bitPerPeso('Q6_K'), 6.5625);
  assert.equal(bitPerPeso('IQ4_XS'), 4.25);
  assert.equal(bitPerPeso('Q2_K'), 2.625);
  assert.equal(bitPerPeso('IQ1_S'), 1.56);
  assert.equal(bitPerPeso('BF16'), 16);
  // dentro la famiglia il suffisso ordina, ma non esce mai dalla banda della famiglia
  assert.ok(bitPerPeso('Q4_K_M') > bitPerPeso('Q4_K_S'));
  assert.ok(bitPerPeso('Q4_K_M') < bitPerPeso('Q5_K_S'));
  // ⛔ verso contrario: una sigla che non so leggere torna null, MAI 0 (0 la manderebbe in cima all'elenco)
  assert.equal(bitPerPeso('PIPPO'), null);
  assert.equal(bitPerPeso(''), null);
  assert.equal(bitPerPeso(undefined), null);
});

test('HF-ORDINE: le varianti scendono per qualità, e quella illeggibile va in FONDO', () => {
  const g = (quant) => ({ chiave: quant, quant, bytes: 1, file: [{}], incompleto: false, senzaHash: false });
  const ordinate = ordinaVarianti([g('Q2_K'), g('BF16'), g('Q4_K_M'), g('ZZZ'), g('Q8_0')]);
  assert.deepEqual(ordinate.map((x) => x.quant), ['BF16', 'Q8_0', 'Q4_K_M', 'Q2_K', 'ZZZ']);
  // ⛔ il difetto che ha fatto bocciare la schermata: l'ordine dell'API era alfabetico
  const alfabetico = [g('BF16'), g('IQ4_NL'), g('Q2_K'), g('Q3_K_M')];
  assert.notDeepEqual(ordinaVarianti(alfabetico).map((x) => x.quant), ['IQ4_NL', 'Q2_K', 'Q3_K_M', 'BF16']);
  assert.equal(ordinaVarianti(alfabetico)[0].quant, 'BF16');
});

test('HF-CONSIGLIO: la più fedele che ENTRA davvero; mai i pesi pieni, mai sotto i 4 bit', () => {
  const gruppi = gruppiVarianti(DETTAGLIO_HF.files);
  const c = varianteConsigliata(gruppi, STIMA_HF);
  // F16 è più fedele di Q8_0 ma è «blocked» E sono pesi pieni: si consiglia Q8_0
  assert.equal(c.gruppo.quant, 'Q8_0');
  assert.equal(c.motivo, 'misura');
  // ⛔ verso contrario 1: i pesi pieni non si consigliano NEPPURE quando ci starebbero
  const tuttoEntra = new Map([...STIMA_HF].map(([k, v]) => [k, { ...v, state: 'compatible' }]));
  assert.equal(varianteConsigliata(gruppi, tuttoEntra).gruppo.quant, 'Q8_0');
  // ⛔ verso contrario 2: se NIENTE ci sta, non si consiglia niente invece di consigliare il più piccolo
  const nienteEntra = new Map([...STIMA_HF].map(([k, v]) => [k, { ...v, state: 'blocked' }]));
  assert.equal(varianteConsigliata(gruppi, nienteEntra), null);
  // se solo «al limite», si dice che è al limite e non lo si spaccia per «entra»
  const soloLimite = new Map([...STIMA_HF].map(([k, v]) => [k, { ...v, state: 'tight' }]));
  assert.equal(varianteConsigliata(gruppi, soloLimite).motivo, 'limite');
});

test('HF-CONSIGLIO: il pavimento dei 4 bit di Hermes, e il ripiego quando non c’è misura', () => {
  const g = (quant, extra = {}) => ({ chiave: quant, quant, bytes: 1, file: [{}], incompleto: false, senzaHash: false, ...extra });
  // ⛔ sotto i 4 bit non si consiglia mai, anche se è l'unica cosa che entrerebbe
  const soloPiccole = [g('Q2_K'), g('IQ3_S'), g('IQ1_S')];
  const stimaTutteOk = new Map(soloPiccole.map((x) => [x.chiave, { state: 'compatible' }]));
  assert.equal(varianteConsigliata(soloPiccole, stimaTutteOk), null);
  // senza misura si ripiega sulla banda Q4-Q5, e il motivo lo DICHIARA
  const senzaMisura = varianteConsigliata([g('BF16'), g('Q8_0'), g('Q5_K_M'), g('Q4_K_M'), g('Q2_K')], new Map());
  assert.equal(senzaMisura.gruppo.quant, 'Q5_K_M');
  assert.equal(senzaMisura.motivo, 'convenzione');
  // ⛔ un set incompleto o senza impronta non si consiglia: non si scaricherebbe comunque
  const rotte = [g('Q5_K_M', { incompleto: true }), g('Q4_K_M', { senzaHash: true }), g('Q4_K_S')];
  assert.equal(varianteConsigliata(rotte, new Map()).gruppo.quant, 'Q4_K_S');
});

test('HF-GLOSSA: ogni sigla ha la sua riga in italiano; una sconosciuta non inventa niente', () => {
  assert.equal(glossaQuant('Q4_K_M'), '4 bit · il compromesso più usato');
  assert.equal(glossaQuant('IQ4_XS'), '4 bit compressi · più piccolo di Q4, un filo più lento');
  assert.equal(glossaQuant('BF16'), 'pesi pieni a metà precisione · per convertire');
  assert.equal(glossaQuant('IQ1_S'), '1 bit · sperimentale, spesso inservibile');
  // ⛔ verso contrario: niente glossa inventata per una sigla che non conosco
  assert.equal(glossaQuant('PIPPO'), null);
  assert.equal(eSenzaQuantizzazione('F16'), true);
  assert.equal(eSenzaQuantizzazione('Q8_0'), false);
});

/*
 * 06/09, i due difetti che i test unitari NON avevano visto e ha trovato il
 * giro dal vivo sul 4178. Restano qui come regressione.
 */
test('HF-SENZA-RUNTIME: «unknown» non è una misura — il consiglio non deve sparire', () => {
  const gruppi = gruppiVarianti(DETTAGLIO_HF.files);
  // Su una macchina senza servizio locale `/fit-estimate` risponde 503 e ogni variante torna unknown.
  const nessunRuntime = new Map(gruppi.map((g) => [g.chiave, { state: 'unknown', reason: 'measurement' }]));
  const c = varianteConsigliata(gruppi, nessunRuntime);
  // ⛔ prima tornava null e restava preselezionato BF16, cioè il difetto che stavo curando
  assert.notEqual(c, null);
  assert.equal(c.gruppo.quant, 'Q4_K_M');
  assert.equal(c.motivo, 'convenzione');
  // ⛔ verso contrario: un verdetto VERO che dice «non ci sta» resta un verdetto, e allora niente consiglio
  const bloccate = new Map(gruppi.map((g) => [g.chiave, { state: 'blocked', reason: 'memory' }]));
  assert.equal(varianteConsigliata(gruppi, bloccate), null);
});

test('HF-NOMI-VERI: le quantizzazioni dinamiche di Unsloth (UD-) si leggono', () => {
  assert.equal(quantDaNome('Qwen3-Coder-30B-A3B-Instruct-UD-TQ1_0.gguf'), 'TQ1_0');
  assert.equal(quantDaNome('Qwen3-Coder-30B-A3B-Instruct-UD-Q4_K_XL.gguf'), 'Q4_K_XL');
  assert.equal(glossaQuant(quantDaNome('modello-UD-TQ1_0.gguf')), '1 bit · sperimentale, spesso inservibile');
  assert.ok(bitPerPeso(quantDaNome('modello-UD-Q4_K_XL.gguf')) > bitPerPeso('Q4_K_M'));
  // ⛔ verso contrario: un nome senza sigla non inventa una quantizzazione
  assert.equal(quantDaNome('modello-strano.gguf'), 'modello-strano');
  assert.equal(glossaQuant(quantDaNome('modello-strano.gguf')), null);
});

test('HF-STIMA-IGNOTA: senza misura la riga dice quanto PESA, non ripete «non misurabile»', () => {
  const senza = descriviStima({ state: 'unknown', reason: 'measurement' }, 20.2 * 1024 ** 3);
  assert.equal(senza.testo, '20,2 GB da scaricare · memoria non misurata');
  // ⛔ verso contrario: il perché non si ripete su ogni riga, lo dice il callout una volta sola
  assert.ok(!/servizio locale|non misurabile su questa macchina/.test(senza.testo));
  assert.equal(descriviStima({ state: 'unknown' }).testo, 'memoria non misurata');
});
