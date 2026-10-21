/*
 * L1 del motore locale (owner 20/10/2026): il `<think>` dentro il testo. Misurato sulla sessione vera `e00ae242`
 * (LFM2.5-24B-A2B, llama-server b10517): ragionamento nativo separato, POI un secondo `<think>…</think>` nel testo, a
 * pezzi. Le prove RN-0x vanno nei due versi: ciò che è ragionamento esce dal testo; il testo legittimo passa IDENTICO
 * byte per byte (vincoli della CLI, 20/10: solo in apertura, mai nel codice, un blocco mai chiuso torna testo).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { creaFiltroRagionamentoNelTesto, separaRagionamentoNelTesto } from '../src/kernel/ragionamento-nel-testo.mjs';
import { chiamaConRitenta, consumaFlussoSSE } from '../src/kernel/talosHarness.mjs';

function rispostaStreaming(eventi) {
  const completi = eventi.includes('[DONE]') ? eventi : [...eventi, '[DONE]'];
  const bytes = new TextEncoder().encode(completi.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join(''));
  return { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) };
}
const pezzi = (lista) => {
  const filtro = creaFiltroRagionamentoNelTesto();
  let testo = '';
  let ragionamento = '';
  for (const p of lista) { const r = filtro.scrivi(p); testo += r.testo; ragionamento += r.ragionamento; }
  const coda = filtro.chiudi();
  return { testo: testo + coda.testo, ragionamento, nonChiuso: coda.nonChiuso };
};
// Ogni taglio possibile del testo in due pezzi: un tag spezzato fra due delta non deve cambiare l'esito.
const ogniTaglio = (testo, verifica) => { for (let i = 0; i <= testo.length; i += 1) verifica(pezzi([testo.slice(0, i), testo.slice(i)]), i); };

const DELTA_DELLA_SESSIONE = ['<think>', 'The', ' user', ' said', ' "ciao".', '</think>', 'Ciao!', ' 👋', ' Come posso aiutarti?'];

describe('RN — il ragionamento scritto dentro il testo', () => {
  it('RN-01 i delta veri della sessione e00ae242: il testo è la sola risposta, il blocco è ragionamento', () => {
    const r = pezzi(DELTA_DELLA_SESSIONE);
    assert.equal(r.testo, 'Ciao! 👋 Come posso aiutarti?');
    assert.equal(r.ragionamento, 'The user said "ciao".');
  });

  it('RN-02 un tag spezzato in qualunque punto fra due delta dà lo stesso esito', () => {
    const intero = '\n\n<THINK>pensiero</THINK>\n\nRisposta.';
    ogniTaglio(intero, (r, i) => {
      assert.equal(r.testo, '\n\n\n\nRisposta.', `taglio a ${i}`);
      assert.equal(r.ragionamento, 'pensiero', `taglio a ${i}`);
    });
  });

  it('RN-03 due blocchi di fila in apertura escono tutti e due; dopo il testo il filtro è spento', () => {
    const r = pezzi(['<think>a</think><thinking>b</thinking>Fatto. <think>c</think>']);
    assert.equal(r.testo, 'Fatto. <think>c</think>');
    assert.equal(r.ragionamento, 'ab');
  });

  // ── AL CONTRARIO: testo legittimo, identico byte per byte (vincoli 1, 2, 3 della CLI) ──
  const LEGITTIMI = [
    'Il tag `<think>` apre il ragionamento, `</think>` lo chiude.',
    'Ecco l\'XML:\n<reasoning>\n  <step>1</step>\n</reasoning>\n',
    '```xml\n<think>dentro un blocco di codice</think>\n```\nFine.',
    '```\n<think>codice mai chiuso',
    '<thinker>non è un tag del ragionamento</thinker>',
    '<th',
    '<html><body><think>x</think></body></html>',
    'Prima riga.\n<think>dopo un a capo, ma non in apertura</think>\nFine.',
    '',
    '   ',
  ];
  for (const [n, testo] of LEGITTIMI.entries()) {
    it(`RN-04.${n} al contrario: ${JSON.stringify(testo).slice(0, 40)} passa identico, in ogni taglio`, () => {
      ogniTaglio(testo, (r, i) => {
        assert.equal(r.testo, testo, `taglio a ${i}`);
        assert.equal(r.ragionamento, '', `taglio a ${i}`);
      });
    });
  }

  it('RN-05 al contrario: un <think> in apertura MAI chiuso torna testo per intero, col suo tag (vincolo 3)', () => {
    const testo = '<think>il modello è stato tagliato a metà';
    ogniTaglio(testo, (r, i) => {
      assert.equal(r.testo, testo, `taglio a ${i}`);
      assert.equal(r.nonChiuso, true, `taglio a ${i}`);
    });
    assert.deepEqual(separaRagionamentoNelTesto(testo), { testo, ragionamento: '', nonChiuso: true });
  });

  it('RN-06 il testo intero (non in streaming) usa lo stesso filtro', () => {
    assert.deepEqual(separaRagionamentoNelTesto('<think>p</think>R'), { testo: 'R', ragionamento: 'p', nonChiuso: false });
    assert.deepEqual(separaRagionamentoNelTesto(null), { testo: null, ragionamento: '', nonChiuso: false });
  });
});

describe('RN — il kernel (consumaFlussoSSE)', () => {
  it('RN-07 col ragionamento NATIVO già arrivato, il secondo blocco nel testo si toglie e non si somma', async () => {
    const visti = [];
    const { scelta } = await consumaFlussoSSE(rispostaStreaming([
      { choices: [{ delta: { reasoning_content: 'Primo pensiero.' } }] },
      ...DELTA_DELLA_SESSIONE.map((content) => ({ choices: [{ delta: { content } }] })),
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]), (e) => visti.push(e));
    assert.equal(scelta.content, 'Ciao! 👋 Come posso aiutarti?');
    assert.equal(scelta.reasoning_content, 'Primo pensiero.');
    assert.ok(!visti.some((v) => v.tipo === 'testo' && /think/iu.test(v.delta)), 'nessun <think> a schermo');
  });

  it('RN-08 SENZA ragionamento nativo, il blocco nel testo va al riquadro del ragionamento', async () => {
    const visti = [];
    const { scelta } = await consumaFlussoSSE(rispostaStreaming([
      ...DELTA_DELLA_SESSIONE.map((content) => ({ choices: [{ delta: { content } }] })),
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]), (e) => visti.push(e));
    assert.equal(scelta.content, 'Ciao! 👋 Come posso aiutarti?');
    assert.equal(scelta.reasoning_content, 'The user said "ciao".');
    assert.equal(visti.filter((v) => v.tipo === 'ragionamento').map((v) => v.delta).join(''), 'The user said "ciao".');
  });

  it('RN-09 al contrario: un blocco mai chiuso torna testo, e non resta contato come ragionamento', async () => {
    const { scelta } = await consumaFlussoSSE(rispostaStreaming([
      { choices: [{ delta: { content: '<think>tagliato' } }] },
      { choices: [{ delta: { content: ' a metà' } }] },
      { choices: [{ delta: {}, finish_reason: 'length' }] },
    ]), () => {});
    assert.equal(scelta.content, '<think>tagliato a metà');
    assert.equal(scelta.reasoning_content, undefined);
  });

  it('RN-10 al contrario: un testo normale passa identico, delta per delta', async () => {
    const visti = [];
    const parti = ['Uso `<think>`', ' nel prompt.\n', '<think>non in apertura</think>'];
    const { scelta } = await consumaFlussoSSE(rispostaStreaming([
      ...parti.map((content) => ({ choices: [{ delta: { content } }] })),
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]), (e) => visti.push(e));
    assert.equal(scelta.content, parti.join(''));
    assert.deepEqual(visti.map((v) => v.delta), parti);
  });

  it('RN-11 il messaggio intero di llama-server (nessun delta) passa dallo stesso filtro', async () => {
    const { scelta } = await consumaFlussoSSE(rispostaStreaming([
      { choices: [{ message: { role: 'assistant', content: '<think>p</think>R' }, finish_reason: 'stop' }] },
    ]), () => {});
    assert.equal(scelta.content, 'R');
    assert.equal(scelta.reasoning_content, 'p');
  });

  it('RN-12 la risposta NON in streaming (r.json, la strada del banco) passa dallo stesso filtro, nei due versi', async () => {
    const rete = (content) => async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    const a = await chiamaConRitenta({ modello: 'x', chiave: 'y', messaggi: [], attrezzi: [], fetchDiRete: rete('<think>p</think>R'), dormi: async () => {}, caso: () => 0 });
    assert.equal(a.scelta.content, 'R');
    assert.equal(a.scelta.reasoning_content, 'p');
    const legittimo = 'Scrivi `<think>` nel template.\n<think>non in apertura</think>';
    const b = await chiamaConRitenta({ modello: 'x', chiave: 'y', messaggi: [], attrezzi: [], fetchDiRete: rete(legittimo), dormi: async () => {}, caso: () => 0 });
    assert.equal(b.scelta.content, legittimo);
    assert.equal(b.scelta.reasoning_content, undefined);
  });
});

/* Revisione avversaria del 20/10 su 105fbfb78: i casi che l'hanno fatta ROSSA, ora regressioni. */
describe('RN — dalla revisione avversaria', () => {
  it('RN-13 (D1) «İ» dentro il blocco non sposta il taglio: il testo resta intero, nei due percorsi e in ogni taglio', () => {
    assert.deepEqual(separaRagionamentoNelTesto('<think>İstanbul</think>Answer'), { testo: 'Answer', ragionamento: 'İstanbul', nonChiuso: false });
    ogniTaglio('<think>Ankara, İzmir, İİİ</think>OK', (r, i) => {
      assert.equal(r.testo, 'OK', `taglio a ${i}`);
      assert.equal(r.ragionamento, 'Ankara, İzmir, İİİ', `taglio a ${i}`);
    });
    // al contrario: una «İ» nel testo legittimo, anche accanto a qualcosa che somiglia a un tag, passa identica
    for (const testo of ['İ<think>x</think>', '<İthink>x</think>', 'İstanbul', '<thinK>segno Kelvin, non una k</think>Fine.']) ogniTaglio(testo, (r, i) => assert.equal(r.testo, testo, `${testo} taglio a ${i}`));
  });

  it('RN-14 (D2) una risposta fatta SOLO di pensiero e a capo è vuota, non una bolla bianca; senza blocchi lo spazio resta com\'era', async () => {
    assert.equal(pezzi(['<think>p</think>', '\n\n']).testo, '');
    assert.equal(pezzi(['\n', '<think>a</think>\n<think>b</think>\n']).testo, '');
    assert.equal(pezzi(['<think>p</think>\n\nCiao']).testo, '\n\nCiao', 'con testo vero dopo, lo spazio esce davanti a lui');
    const { scelta } = await consumaFlussoSSE(rispostaStreaming([
      { choices: [{ delta: { content: '<think>solo pensiero</think>' } }] },
      { choices: [{ delta: { content: '\n\n' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]), () => {});
    assert.equal(scelta.content, null, 'vuota: decide la scala della risposta vuota di talosLavora');
  });

  it('RN-15 (D4) il frammento rimesso in storia dopo un flusso interrotto non porta il <think> del messaggio intero', async () => {
    const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ message: { role: 'assistant', content: '<think>segreto</think>Ciao' } }] })}\n\n`);
    const troncata = { ok: true, status: 200, body: new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } }) };
    await assert.rejects(consumaFlussoSSE(troncata, () => {}), (e) => { assert.equal(e.parziale?.content, 'Ciao'); return true; });
  });

  it('RN-16 (D6/D7) il ragionamento finale è il nativo se c\'è stato, in qualunque ordine; un blocco mai chiuso non resta anche lì', async () => {
    const prima = await consumaFlussoSSE(rispostaStreaming([
      { choices: [{ delta: { content: '<think>A</think>' } }] },
      { choices: [{ delta: { reasoning_content: 'B' } }] },
      { choices: [{ delta: { content: 'R' }, finish_reason: 'stop' }] },
    ]), () => {});
    assert.equal(prima.scelta.reasoning_content, 'B');
    assert.equal(prima.scelta.content, 'R');
    const aMeta = await consumaFlussoSSE(rispostaStreaming([
      { choices: [{ delta: { content: '<think>prima ' } }] },
      { choices: [{ delta: { reasoning_content: 'N' } }] },
      { choices: [{ delta: { content: 'dopo' }, finish_reason: 'length' }] },
    ]), () => {});
    assert.equal(aMeta.scelta.reasoning_content, 'N');
    assert.equal(aMeta.scelta.content, '<think>prima dopo');
  });
});
