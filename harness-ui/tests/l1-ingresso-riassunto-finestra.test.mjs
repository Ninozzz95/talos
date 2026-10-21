/*
 * L1 del motore locale (owner 20/10/2026, «riassunto a pezzi»): l'ingresso del riassuntore entra nella FINESTRA del modello.
 * Prova dal vivo 7432bdf4 (LFM2.5 a 65.536): il riassunto di sfondo non aveva limite, «The conversation (79599 tokens) does not
 * fit in the local model's window (65536 tokens)». Ora, come Hermes (`context_compressor.py:3433-3440`): messaggi lunghi a inizio
 * + fine, poi il totale entro la finestra a 2 caratteri per token; il secondo tentativo ne usa la metà.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CARATTERI_INGRESSO_RIASSUNTO, CARATTERI_MESSAGGIO_RIASSUNTO, MARCATORE_ACCORCIATO, MARCATORE_INGRESSO_TAGLIATO,
  caratteriIngressoPerFinestra, ingressoRiassuntoPerFinestra, limitaIngressoRiassunto,
} from '../src/kernel/compattazione-desktop.mjs';

const totale = (lista) => lista.reduce((s, m) => s + String(m.content ?? '').length, 0);
const ISTRUZIONE = { role: 'user', content: `Summarize. ${'x'.repeat(8_000)}` };

test('L1F-01 il tetto in caratteri segue la finestra: 64K ⇒ ~125.000, 16K ⇒ ~26.600; finestra ignota ⇒ i 160.000 di sempre', () => {
  assert.equal(caratteriIngressoPerFinestra({ finestraToken: 65_536, maxOutputTokens: 2_048 }), (65_536 - 2_048 - 1_024) * 2);
  assert.equal(caratteriIngressoPerFinestra({ finestraToken: 16_384, maxOutputTokens: 2_048 }), (16_384 - 2_048 - 1_024) * 2);
  assert.equal(caratteriIngressoPerFinestra({ finestraToken: null }), CARATTERI_INGRESSO_RIASSUNTO);
  assert.equal(caratteriIngressoPerFinestra({ finestraToken: 1_000_000, maxOutputTokens: 2_048 }), CARATTERI_INGRESSO_RIASSUNTO, 'mai oltre il tetto di sempre');
});

test('L1F-02 il caso della prova dal vivo: 20 letture di file da 10.000 caratteri in una finestra da 65.536 entrano, con i loro inizi e fini', () => {
  const sistema = { role: 'system', content: 'S'.repeat(9_000) };
  // coppie vere chiamata/esito, come nella sessione (un esito senza la sua chiamata sarebbe un orfano: vedi L1F-08)
  const letture = Array.from({ length: 20 }, (_, i) => [
    { role: 'assistant', content: '', tool_calls: [{ id: `l${i}`, type: 'function', function: { name: 'leggi', arguments: `{"percorso":"modulo${i}.js"}` } }] },
    { role: 'tool', tool_call_id: `l${i}`, content: `INIZIO-${i} ${'r'.repeat(10_000)} FINE-${i}` },
  ]).flat();
  const fuori = ingressoRiassuntoPerFinestra([sistema, ...letture, ISTRUZIONE], { finestraToken: 65_536, maxOutputTokens: 2_048 });
  assert.ok(totale(fuori) <= caratteriIngressoPerFinestra({ finestraToken: 65_536, maxOutputTokens: 2_048 }) + 2_000, `totale ${totale(fuori)}`);
  assert.equal(fuori[0], sistema, 'il sistema resta intero');
  assert.equal(fuori.at(-1), ISTRUZIONE, 'l\'istruzione finale resta intera');
  const accorciate = fuori.filter((m) => String(m.content).includes(MARCATORE_ACCORCIATO));
  assert.ok(accorciate.length >= 10, 'le letture lunghe sono accorciate, non buttate');
  for (const m of accorciate) {
    assert.match(m.content, /^INIZIO-\d+/u); assert.match(m.content, /FINE-\d+$/u);
    assert.ok(m.content.length < CARATTERI_MESSAGGIO_RIASSUNTO + 400);
  }
});

test('L1F-03 il secondo tentativo usa la metà dell\'ingresso', () => {
  const molti = Array.from({ length: 60 }, (_, i) => ({ role: 'tool', content: `L${i} ${'r'.repeat(5_000)}` }));
  const intero = ingressoRiassuntoPerFinestra([...molti, ISTRUZIONE], { finestraToken: 65_536, maxOutputTokens: 2_048 });
  const meta = ingressoRiassuntoPerFinestra([...molti, ISTRUZIONE], { finestraToken: 65_536, maxOutputTokens: 2_048, frazione: 0.5 });
  assert.ok(totale(meta) <= totale(intero) / 2 + ISTRUZIONE.content.length + MARCATORE_INGRESSO_TAGLIATO.length + 6_000, `${totale(meta)} contro ${totale(intero)}`);
  assert.ok(meta.some((m) => m.content === MARCATORE_INGRESSO_TAGLIATO), 'il mezzo omesso è dichiarato');
});

test('L1F-04 al contrario: una richiesta piccola passa IDENTICA, oggetto per oggetto; con la finestra ignota vale il tetto di sempre', () => {
  const piccola = [{ role: 'system', content: 'regole' }, { role: 'user', content: 'ciao' }, { role: 'assistant', content: 'r'.repeat(5_999) }, { role: 'user', content: 'Summarize.' }];
  const fuori = ingressoRiassuntoPerFinestra(piccola, { finestraToken: 65_536, maxOutputTokens: 2_048 });
  assert.equal(fuori.length, piccola.length);
  fuori.forEach((m, i) => assert.equal(m, piccola[i]));
  const grande = [{ role: 'user', content: 'a'.repeat(300_000) }, { role: 'user', content: 'Summarize.' }];
  assert.ok(totale(ingressoRiassuntoPerFinestra(grande, {})) <= CARATTERI_INGRESSO_RIASSUNTO + 6_000);
});

test('L1F-05 (condizione della CLI, Voci 208 e 210) sotto il tetto la richiesta è IDENTICA byte per byte; sopra il tetto il taglio avviene come prima ma non spezza coppie', () => {
  // sotto il tetto, finestra ignota o nota: identica
  const lunga = [{ role: 'system', content: 'regole' }, { role: 'tool', content: `IMPORTANTE ${'r'.repeat(20_000)} FINE` }, { role: 'user', content: 'Summarize.' }];
  assert.equal(ingressoRiassuntoPerFinestra(lunga, {}), lunga, 'finestra ignota, sotto il tetto: la stessa richiesta');
  assert.equal(JSON.stringify(ingressoRiassuntoPerFinestra(lunga, {})), JSON.stringify(limitaIngressoRiassunto(lunga)));
  const conFinestra = ingressoRiassuntoPerFinestra(lunga, { finestraToken: 1_000_000, maxOutputTokens: 2_048 });
  assert.equal(conFinestra, lunga, 'finestra nota, ci sta: la stessa richiesta');
  assert.ok(!conFinestra.some((m) => String(m.content).includes(MARCATORE_ACCORCIATO)), 'il risultato lungo non è stato tagliato');
  // sopra il tetto con la finestra ignota: nessun messaggio ACCORCIATO (come prima), il mezzo omesso, nessuna coppia spezzata
  const molte = [{ role: 'system', content: 'S' }];
  for (let i = 0; i < 70; i += 1) {
    molte.push({ role: 'assistant', content: '', tool_calls: [{ id: `k${i}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] });
    molte.push({ role: 'tool', tool_call_id: `k${i}`, content: 'q'.repeat(3_000) });
  }
  molte.push({ role: 'user', content: 'Summarize.' });
  const fuori = ingressoRiassuntoPerFinestra(molte, {});
  assert.ok(fuori.some((m) => m.content === MARCATORE_INGRESSO_TAGLIATO), 'sopra il tetto il taglio avviene');
  assert.ok(!fuori.some((m) => String(m.content ?? '').includes(MARCATORE_ACCORCIATO)), 'con la finestra ignota nessun messaggio si accorcia');
  assert.deepEqual(orfani(fuori), []);
});

test('L1F-06 (quinta revisione V1, V2) gli argomenti delle chiamate e i content ad array pesano e si accorciano; le immagini diventano un segnaposto', () => {
  const scrittura = { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'grande.js', contenuto: `INIZIO ${'z'.repeat(300_000)} FINE` }) } }] };
  const allegato = { role: 'user', content: [{ type: 'text', text: `ALLEGATO ${'t'.repeat(200_000)} CODA` }, { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(500_000)}` } }] };
  const fuori = ingressoRiassuntoPerFinestra([{ role: 'system', content: 'regole' }, scrittura, allegato, ISTRUZIONE], { finestraToken: 65_536, maxOutputTokens: 2_048 });
  const peso = JSON.stringify(fuori).length;
  assert.ok(peso < caratteriIngressoPerFinestra({ finestraToken: 65_536, maxOutputTokens: 2_048 }) + 6_000, `peso vero ${peso}`);
  const argomenti = JSON.parse(fuori[1].tool_calls[0].function.arguments);
  assert.equal(argomenti.percorso, 'grande.js', 'il JSON degli argomenti resta valido, coi campi corti interi');
  assert.match(argomenti.contenuto, /^INIZIO/u); assert.match(argomenti.contenuto, /FINE$/u);
  assert.ok(fuori[2].content.some((p) => p.text === '[image omitted from the summary input]'), 'l\'immagine è un segnaposto');
  assert.ok(fuori[2].content.every((p) => !p.image_url), 'nessuna immagine nell\'ingresso del riassuntore');
  // al contrario: se tutto ci sta, argomenti e allegati restano com'erano
  const piccoli = [{ role: 'assistant', content: '', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'scrivi', arguments: '{"percorso":"a.js","contenuto":"x"}' } }] },
    { role: 'user', content: [{ type: 'text', text: 'ciao' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }, ISTRUZIONE];
  assert.equal(ingressoRiassuntoPerFinestra(piccoli, { finestraToken: 65_536, maxOutputTokens: 2_048 }), piccoli);
});

test('L1F-07 (quinta revisione V1, V2) ogni peso conta DA SOLO: argomenti, testo allegato, e tante chiamate medie che il limite totale deve pesare', () => {
  const pesoVero = (lista) => JSON.stringify(lista).length;
  const tetto = caratteriIngressoPerFinestra({ finestraToken: 65_536, maxOutputTokens: 2_048 });
  const opzioni = { finestraToken: 65_536, maxOutputTokens: 2_048 };
  // A: solo una scrittura grande
  const a = ingressoRiassuntoPerFinestra([{ role: 'assistant', content: '', tool_calls: [{ id: 'c', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ contenuto: 'z'.repeat(300_000) }) } }] }, ISTRUZIONE], opzioni);
  assert.ok(pesoVero(a) < tetto + 6_000, `A: ${pesoVero(a)}`);
  // B: solo un allegato di testo
  const b = ingressoRiassuntoPerFinestra([{ role: 'user', content: [{ type: 'text', text: 't'.repeat(200_000) }] }, ISTRUZIONE], opzioni);
  assert.ok(pesoVero(b) < tetto + 6_000, `B: ${pesoVero(b)}`);
  // C: 40 chiamate da ~5.900 caratteri (sotto la soglia di accorciamento): le pesa il limite del totale
  const medie = Array.from({ length: 40 }, (_, i) => ({ role: 'assistant', content: '', tool_calls: [{ id: `m${i}`, type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ contenuto: 'm'.repeat(5_900) }) } }] }));
  const c = ingressoRiassuntoPerFinestra([...medie, ISTRUZIONE], opzioni);
  assert.ok(pesoVero(c) < tetto + 12_000, `C: ${pesoVero(c)}`);
  assert.ok(c.some((m) => m.content === MARCATORE_INGRESSO_TAGLIATO), 'C: il mezzo omesso è dichiarato');
});

/** Nessun esito senza la sua chiamata prima, nessuna chiamata senza tutti i suoi esiti dopo. */
function orfani(lista) {
  const problemi = [];
  const aperte = new Map();
  for (const m of lista) {
    if (m?.role === 'assistant' && Array.isArray(m.tool_calls)) for (const c of m.tool_calls) aperte.set(c.id, true);
    if (m?.role === 'tool') { if (!aperte.has(m.tool_call_id)) problemi.push(`esito orfano ${m.tool_call_id}`); else aperte.delete(m.tool_call_id); }
  }
  for (const id of aperte.keys()) problemi.push(`chiamata senza esito ${id}`);
  return problemi;
}

test('L1F-08 (sesta revisione W2) il taglio non spezza mai una coppia chiamata/esito, nemmeno una chiamata multipla con gli esiti a metà', () => {
  const coppie = [];
  for (let i = 0; i < 80; i += 1) {
    if (i % 10 === 5) {
      coppie.push({ role: 'assistant', content: '', tool_calls: [{ id: `p${i}a`, type: 'function', function: { name: 'leggi', arguments: '{}' } }, { id: `p${i}b`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] });
      coppie.push({ role: 'tool', tool_call_id: `p${i}a`, content: 'r'.repeat(3_000) });
      coppie.push({ role: 'tool', tool_call_id: `p${i}b`, content: 'r'.repeat(3_000) });
    } else {
      coppie.push({ role: 'assistant', content: '', tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] });
      coppie.push({ role: 'tool', tool_call_id: `c${i}`, content: 'r'.repeat(3_000) });
    }
  }
  const richiesta = [{ role: 'system', content: 'S' }, ...coppie, ISTRUZIONE];
  for (const finestraToken of [16_384, 32_768, 65_536]) {
    for (const frazione of [1, 0.5]) {
      const fuori = ingressoRiassuntoPerFinestra(richiesta, { finestraToken, maxOutputTokens: 2_048, frazione });
      assert.ok(fuori.some((m) => m.content === MARCATORE_INGRESSO_TAGLIATO), `${finestraToken}/${frazione}: c'è stato un taglio`);
      assert.deepEqual(orfani(fuori), [], `${finestraToken}/${frazione}`);
      assert.equal(fuori.at(-1), ISTRUZIONE);
    }
  }
  // anche con la finestra ignota (CLI, Voce 210): il taglio di sempre, nessun messaggio accorciato, nessuna coppia spezzata
  const ignota = ingressoRiassuntoPerFinestra(richiesta, {});
  assert.deepEqual(orfani(ignota), []);
  assert.ok(!ignota.some((m) => String(m.content ?? '').includes(MARCATORE_ACCORCIATO)));
});
test('L1F-09 (CLI, Voce 210) il caso del BUG-5: una chiamata con più esiti a cavallo del confine non resta spezzata, con la finestra ignota e con quella nota', () => {
  // la testa del limitatore prende metà del tetto: si costruisce un gruppo di 4 esiti che scavalca quel confine
  const metà = Math.floor(CARATTERI_INGRESSO_RIASSUNTO / 2);
  const prima = [{ role: 'system', content: 'S' }, { role: 'user', content: 'p'.repeat(metà - 9_000) }];
  const gruppo = [
    { role: 'assistant', content: '', tool_calls: ['g1', 'g2', 'g3', 'g4'].map((id) => ({ id, type: 'function', function: { name: 'leggi', arguments: '{}' } })) },
    ...['g1', 'g2', 'g3', 'g4'].map((id) => ({ role: 'tool', tool_call_id: id, content: 'g'.repeat(5_000) })),
  ];
  const dopo = Array.from({ length: 40 }, (_, i) => [
    { role: 'assistant', content: '', tool_calls: [{ id: `d${i}`, type: 'function', function: { name: 'leggi', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: `d${i}`, content: 'd'.repeat(4_000) },
  ]).flat();
  const richiesta = [...prima, ...gruppo, ...dopo, { role: 'user', content: 'Summarize.' }];
  // controllo che il caso sia davvero a cavallo: col limitatore di prima il gruppo si spezza
  assert.notDeepEqual(orfani(limitaIngressoRiassunto(richiesta)), [], 'il limitatore senza coppie spezza il gruppo (il caso è quello vero)');
  for (const opzioni of [{}, { finestraToken: 65_536, maxOutputTokens: 2_048 }]) {
    const fuori = ingressoRiassuntoPerFinestra(richiesta, opzioni);
    assert.ok(fuori.some((m) => m.content === MARCATORE_INGRESSO_TAGLIATO), `${JSON.stringify(opzioni)}: c'è un taglio`);
    assert.deepEqual(orfani(fuori), [], JSON.stringify(opzioni));
  }
});
