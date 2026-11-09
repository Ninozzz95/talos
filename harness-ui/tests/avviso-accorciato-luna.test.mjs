/*
 * 05/11/2026 — cura della compattazione per Luna 6, voci M1 e M2 (forma `FORMA-CURA-COMPATTAZIONE-LUNA-2026-11-05.md` §2b e §3; OK di
 * CLI, Performance e Mobile, §8; M2 nella forma corretta da Performance: nota in coda, decisione 194). REV-M2-PIEGA (revisione avversaria
 * del 05/11): la nota nasce `system` e la piega della 194 la avvolge in <talos-note>; le prove qui sotto leggono quella forma.
 * Reperto del banco del 04/11 (C9, sessione 8edf6c33, chatgpt gpt-6-luna, dati finti): le letture di report1..6 arrivavano al modello
 * accorciate a 1.924 caratteri, e il solo segno del taglio stava DENTRO la busta dei dati, a metà testo («[… 20,515 characters
 * omitted …]»). Luna rispondeva coi codici che vedeva, come se il file fosse intero.
 * ⇒ M1: una riga del sistema PRIMA della busta dice quali righe mancano e quanti caratteri; M2: una nota in coda alla richiesta elenca
 *   i risultati accorciati della richiesta in corso. Solo in ciò che parte verso il modello: storia, evento `tool-esito`, export e
 *   /resume restano identici (condizione 1 della CLI: la sua riga di lettura vuole la busta e «[TALOS read lines …]» in testa).
 * Fonti: Codex `utils/output-truncation/src/lib.rs:38-41` (l'avviso PRIMA del contenuto); Hermes `context_compressor.py:258-297`,
 *   `:836`, `:1947` (avviso fuori dai dati; il segnaposto dice nome, percorso e caratteri); Claude, context editing (il risultato tolto
 *   lo si dice al modello).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { MARCATORE_ACCORCIATO, VARIABILE_TETTO_TOKEN, accorciaTesto, riduciCodaSottoPressione } from '../src/kernel/compattazione-desktop.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs';

const banco = JSON.parse(readFileSync(new URL('./fixtures/banco-luna-c9-letture.json', import.meta.url), 'utf8'));
const modulo = await import('../src/kernel/avviso-accorciato.mjs').catch(() => ({}));

const AVVISO = /^\[TALOS: this result was shortened to fit the context\. Lines (\d+)–(\d+) of this output \(about ([\d,]+) characters\) are NOT shown below\. The full output is kept: read those lines again with leggi offset\/limit, or search them with cerca\. Do not treat the visible part as the whole file\.\]$/u;
const percorsoLetto = (testo) => /from="leggi ([^"]+)"/u.exec(testo)?.[1] ?? null;

/* L'oracolo, scritto in un altro modo dal codice: le righe di DATI (dopo l'apertura della busta, numerate dal file, cioè dalla prima
   riga della lettura) il cui contenuto tocca la parte tolta `[inizio, lunghezza - fine)`. */
function righeNascosteAttese(originale, { inizio = 1200, fine = 400 } = {}) {
  const righe = originale.split('\n');
  const apertura = righe.findIndex((r) => r.startsWith('<<<TALOS_DATA id='));
  const primaRiga = Number(/^\[TALOS read lines (\d+)-/u.exec(originale)?.[1] ?? 1);
  const toccate = [];
  let pos = 0;
  righe.forEach((r, i) => {
    const da = pos; const a = pos + r.length; pos = a + 1;
    if (i > apertura && !r.startsWith('<<<END_TALOS_DATA') && r.length > 0 && da < originale.length - fine && a > inizio) toccate.push(primaRiga + i - apertura - 1);
  });
  return [Math.min(...toccate), Math.max(...toccate)];
}

const coda = () => banco.messaggi.map((m) => structuredClone(m));

test('M1-01 (C9, red before the cure): every shortened read starts with the system line, BEFORE the data envelope, with lines A–B and N from the text', () => {
  const prima = coda();
  const intatta = structuredClone(prima);
  const { coda: fuori } = riduciCodaSottoPressione(prima, { budgetToken: 1 });
  const lette = prima.map((m, i) => ({ m, i })).filter(({ m }) => m.role === 'tool' && m.content.length >= 2000);
  assert.equal(lette.length, 4, 'premise: the four C9 reads (report1 twice, report2, report3)');
  for (const { m, i } of lette) {
    const corto = fuori[i].content;
    const [riga, ...resto] = corto.split('\n');
    const avviso = AVVISO.exec(riga);
    assert.ok(avviso, `the first line is the notice: ${JSON.stringify(riga.slice(0, 160))}`);
    const dopo = resto.join('\n');
    assert.ok(dopo.startsWith('<<<TALOS_DATA id=') || dopo.startsWith('[TALOS read lines '), 'right after the notice: the envelope, or the read header the CLI expects, unchanged');
    assert.equal(dopo, accorciaTesto(m.content), 'below the notice the shortened text is the same as before the cure, in-data marker included (`giaAccorciata` reads it)');
    assert.ok(dopo.includes(MARCATORE_ACCORCIATO));
    assert.deepEqual([Number(avviso[1]), Number(avviso[2])], righeNascosteAttese(m.content), `lines A–B are the file lines the cut touches (${percorsoLetto(m.content)})`);
    /* decisione 245 (registro riga 392; commit f47c96e3a): il segno nei dati è neutro, «characters trimmed by TALOS; the full text is kept» */
    const nelDato = /\[… ([\d,]+) characters trimmed by TALOS; the full text is kept/u.exec(dopo)?.[1];
    assert.equal(avviso[3], nelDato, 'N is the number of characters the in-data marker says');
  }
  assert.deepEqual(prima, intatta, 'the input list is not changed: the history stays whole (decision 3)');
});

test('M1-02 (C9): two projections in a row give the same bytes, and a projection of a projection changes nothing', () => {
  const a = riduciCodaSottoPressione(coda(), { budgetToken: 1 }).coda;
  const b = riduciCodaSottoPressione(coda(), { budgetToken: 1 }).coda;
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const ancora = riduciCodaSottoPressione(a, { budgetToken: 1 }).coda;
  for (const [i, m] of a.entries()) if (m.role === 'tool') assert.equal(ancora[i].content, m.content, 'an already shortened result is not shortened again, and gets no second notice');
});

test('M1-03 (the other way): a short result and the call arguments get no notice', () => {
  const corta = [{ role: 'user', content: 'leggi' }, { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'a.txt', contenuto: 'x'.repeat(9000) }) } }] },
    { role: 'tool', tool_call_id: 'c1', content: banco.messaggi[1 + 1].content.slice(0, 1500) }];
  const { coda: fuori } = riduciCodaSottoPressione(corta, { budgetToken: 1 });
  assert.equal(fuori[2].content, corta[2].content, 'under 2,000 characters a result is not touched');
  assert.ok(!fuori[1].tool_calls[0].function.arguments.includes('[TALOS: this result'), 'arguments are shortened inside the JSON, with no notice');
});

test('M1-04: a read that starts further down the file counts FILE lines (offset from «[TALOS read lines X-…]»); an output with no envelope counts its own lines', () => {
  const daMeta = { ...banco.messaggi[4], content: banco.messaggi[4].content.replace('[TALOS read lines 1-197 of 197 in', '[TALOS read lines 51-247 of 400 in') };
  const senzaBusta = { role: 'tool', tool_call_id: 'c9', content: Array.from({ length: 300 }, (_, i) => `step ${String(i + 1).padStart(4, '0')} ok, nothing to report here`).join('\n') };
  const lista = [banco.messaggi[0], banco.messaggi[3], daMeta, { role: 'assistant', content: null, tool_calls: [{ id: 'c9', type: 'function', function: { name: 'shell', arguments: '{"comando":"npm test"}' } }] }, senzaBusta];
  const { coda: fuori } = riduciCodaSottoPressione(lista, { budgetToken: 1 });
  for (const i of [2, 4]) {
    const avviso = AVVISO.exec(fuori[i].content.split('\n')[0]);
    assert.ok(avviso, `message ${i} has the notice`);
    assert.deepEqual([Number(avviso[1]), Number(avviso[2])], righeNascosteAttese(lista[i].content), `message ${i}: lines A–B`);
  }
  const [, a] = AVVISO.exec(fuori[2].content.split('\n')[0]);
  const [, aDaUno] = AVVISO.exec(riduciCodaSottoPressione(coda(), { budgetToken: 1 }).coda[4].content.split('\n')[0]);
  assert.equal(Number(a), Number(aDaUno) + 50, 'the same cut, 50 lines further down the file');
});

test('M1-05 (edges of the cut): a cut that starts on a newline, blank lines before the kept tail, and a kept tail shorter than the closing line still name only the data lines that lose text', () => {
  const dati = Array.from({ length: 40 }, (_, i) => `line ${String(i + 1).padStart(4, '0')} of the report, code R-${1000 + i}`);
  const lettura = (righe) => `[TALOS read lines 1-${righe.length} of ${righe.length} in a.txt]\n<<<TALOS_DATA id=0123456789ab from="leggi a.txt">>>\n${righe.join('\n')}\n<<<END_TALOS_DATA id=0123456789ab>>>`;
  const righeDi = (avviso) => { const m = AVVISO.exec(avviso); return [Number(m[1]), Number(m[2])]; };
  // 1. the visible part ends exactly at the end of line 10: its newline is the first removed character, line 10 is whole
  const t1 = lettura(dati);
  const inizio1 = t1.indexOf('\n', t1.indexOf('line 0010'));
  assert.deepEqual(righeDi(modulo.avvisoAccorciato(t1, { inizio: inizio1, fine: 400 })), righeNascosteAttese(t1, { inizio: inizio1, fine: 400 }));
  assert.equal(righeDi(modulo.avvisoAccorciato(t1, { inizio: inizio1, fine: 400 }))[0], 11, 'line 10 is fully visible');
  // 2. blank lines just before the kept tail: the last line that loses text is the last data line before them
  const conVuote = [...dati.slice(0, 30), '', '', ...dati.slice(30)];
  const t2 = lettura(conVuote);
  const fine2 = t2.length - t2.indexOf('line 0031');
  const inizio2 = t2.indexOf('line 0020');
  assert.deepEqual(righeDi(modulo.avvisoAccorciato(t2, { inizio: inizio2, fine: fine2 })), righeNascosteAttese(t2, { inizio: inizio2, fine: fine2 }));
  assert.equal(righeDi(modulo.avvisoAccorciato(t2, { inizio: inizio2, fine: fine2 }))[1], 30, 'the blank lines are not the last line that loses text');
  // 3. a kept tail of 10 characters: the closing line of the envelope is cut, but it is not a line of the file
  const t3 = lettura(dati);
  assert.deepEqual(righeDi(modulo.avvisoAccorciato(t3, { inizio: 1200, fine: 10 })), righeNascosteAttese(t3, { inizio: 1200, fine: 10 }));
  assert.equal(righeDi(modulo.avvisoAccorciato(t3, { inizio: 1200, fine: 10 }))[1], 40, 'the last line of the file, not the closing line');
  // 4. an output that only PRINTS an envelope after its own lines is not a read: it counts its own lines (line 0010 is output line 13)
  const t4 = ['$ cat dump.txt', 'dump of the last run', '<<<TALOS_DATA id=0123456789ab from="leggi a.txt">>>', ...dati].join('\n');
  assert.equal(righeDi(modulo.avvisoAccorciato(t4, { inizio: t4.indexOf('line 0010') + 3, fine: 400 }))[0], 13);
});

/* M2 ------------------------------------------------------------------------------------------------------------------------- */

/* REV-M2-PIEGA (05/11): il testo della nota, che nasce `system` (la piega della decisione 194 la avvolge in <talos-note>) */
const nota = (voci, k) => `[TALOS context note: to fit the context window, ${k} ${k === 1 ? 'result of the current request is' : 'results of the current request are'} shortened: ${voci}. Before answering, read again or search what you need. If something cannot be recovered, say clearly which part is missing.]`;
const voceDi = (contenuto) => { const [, a, b] = AVVISO.exec(contenuto.split('\n')[0]); return `${percorsoLetto(contenuto)} (lines ${a}–${b} not shown)`; };

test('M2-01 (C9, red before the cure): one system note at the TAIL lists the shortened results of the current request', () => {
  assert.equal(typeof modulo.conNotaDegliAccorciati, 'function', 'the kernel has the tail note');
  const proiezione = riduciCodaSottoPressione(coda(), { budgetToken: 1 }).coda;
  const fuori = modulo.conNotaDegliAccorciati(proiezione);
  assert.equal(fuori.length, proiezione.length + 1, 'one message more, at the tail');
  assert.deepEqual(fuori.slice(0, -1), proiezione, 'nothing before it changes: the last tool result is not touched (Performance)');
  const lette = proiezione.filter((m) => m.role === 'tool' && AVVISO.test(m.content.split('\n')[0]));
  assert.deepEqual(fuori.at(-1), { role: 'system', content: nota(lette.map((m) => voceDi(m.content)).join(', '), 4) });
  assert.match(fuori.at(-1).content, /report1\.txt \(lines \d+–\d+ not shown\), report1\.txt .*report2\.txt .*report3\.txt/u);
});

test('M2-02: at most 6 files, then "+K others"', () => {
  assert.equal(typeof modulo.conNotaDegliAccorciati, 'function');
  const base = riduciCodaSottoPressione(coda(), { budgetToken: 1 }).coda;
  const lettura = base.find((m) => m.role === 'tool' && m.content.includes('from="leggi report2.txt"'));
  const lista = [base[0]];
  for (let i = 1; i <= 8; i += 1) {
    lista.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${i}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: `r${i}.txt` }) } }] });
    lista.push({ ...lettura, tool_call_id: `c${i}`, content: lettura.content.replace('from="leggi report2.txt"', `from="leggi r${i}.txt"`) });
  }
  const testo = modulo.conNotaDegliAccorciati(lista).at(-1).content;
  const voci = Array.from({ length: 6 }, (_, j) => voceDi(lista[2 + 2 * j].content));
  assert.equal(testo, nota(`${voci.join(', ')}, +2 others`, 8));
});

test('M2-03 (the other way): no shortened result of the CURRENT request, no note — same list', () => {
  assert.equal(typeof modulo.conNotaDegliAccorciati, 'function');
  const intera = coda();
  assert.equal(modulo.conNotaDegliAccorciati(intera), intera, 'nothing shortened: the same array (no cache change for nothing)');
  const proiezione = riduciCodaSottoPressione(coda(), { budgetToken: 1 }).coda;
  const dopo = [...proiezione, { role: 'assistant', content: 'D3C26B2A' }, { role: 'user', content: 'Thanks. Now a new question.' }];
  assert.equal(modulo.conNotaDegliAccorciati(dopo), dopo, 'the shortened reads belong to a previous request');
});

test('M2-04: one result in the singular; a user message right after a tool result (an image, a kernel note) is not a new request; names from the envelope', () => {
  assert.equal(typeof modulo.conNotaDegliAccorciati, 'function');
  const proiezione = riduciCodaSottoPressione(coda(), { budgetToken: 1 }).coda;
  const una = [proiezione[0], proiezione[5], proiezione[6], { role: 'user', content: [{ type: 'text', text: 'image of the tool' }] }];
  assert.equal(modulo.conNotaDegliAccorciati(una).at(-1).content, nota(voceDi(proiezione[6].content), 1));
  const lettura = proiezione[6].content;
  const lungo = `${'cartella/'.repeat(12)}report2.txt`;
  const conFonte = (from) => [proiezione[0], proiezione[5], { ...proiezione[6], content: lettura.replace('from="leggi report2.txt"', `from=${JSON.stringify(from)}`) }];
  const [, a, b] = AVVISO.exec(lettura.split('\n')[0]);
  assert.match(modulo.conNotaDegliAccorciati(conFonte('shell')).at(-1).content, new RegExp(`shortened: shell \\(lines ${a}–${b} not shown\\)\\.`, 'u'), 'a source that is not a read keeps its name');
  const troncato = modulo.conNotaDegliAccorciati(conFonte(`leggi ${lungo}`)).at(-1).content;
  assert.ok(troncato.includes(`shortened: ${lungo.slice(0, 79)}… (lines`), 'a long path is cut to 80 characters');
  const senzaBusta = [proiezione[0], proiezione[5], { ...proiezione[6], content: lettura.replace(/\n<<<TALOS_DATA id=[0-9a-f]{12} from="leggi report2\.txt">>>/u, '\nno envelope') }];
  assert.match(modulo.conNotaDegliAccorciati(senzaBusta).at(-1).content, /shortened: a tool result \(lines/u);
});

/* Lungo il filo: il kernel vero, il fornitore finto, i file del banco ------------------------------------------------------- */

function conTetto(t, valore) {
  const prima = process.env[VARIABILE_TETTO_TOKEN];
  process.env[VARIABILE_TETTO_TOKEN] = String(valore);
  t.after(() => { if (prima === undefined) delete process.env[VARIABILE_TETTO_TOKEN]; else process.env[VARIABILE_TETTO_TOKEN] = prima; });
}

/* i dati dentro la busta: il file com'era al banco */
const datiDi = (contenuto) => /<<<TALOS_DATA id=[0-9a-f]{12}[^\n]*>>>\n([\s\S]*?)\n<<<END_TALOS_DATA/u.exec(contenuto)[1];

test('M12-FILO (C9 along the wire, red before the cure): what leaves for the model has the notice and the tail note; history, tool-esito events and saved result stay as they were', async (t) => {
  conTetto(t, 8_000);
  const cartella = mkdtempSync(join(tmpdir(), 'talos-m12-luna-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const n of [1, 2, 3]) writeFileSync(join(cartella, `report${n}.txt`), `${datiDi(banco.messaggi.find((m) => m.role === 'tool' && m.content.includes(`from="leggi report${n}.txt"`)).content)}\n`);
  const chiamate = [{ percorso: 'report1.txt' }, { percorso: 'report1.txt', offset: 1, limit: 200 }, { percorso: 'report2.txt' }, { percorso: 'report3.txt' }];
  const corpi = [];
  let lavoro = 0;
  const fetchDiRete = async (_url, init) => {
    const body = corpoSenzaMarcatori(init.body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (String(body.messages.at(-1)?.content ?? '').includes('CONTEXT COMPACTION')) throw new Error('no summary in this scene: the projection shortens the tail only');
    corpi.push(body);
    lavoro += 1;
    if (lavoro <= chiamate.length) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${lavoro}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify(chiamate[lavoro - 1]) } }] }, finish_reason: 'tool_calls' }], usage });
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'D3C26B2A' }, finish_reason: 'stop' }], usage });
  };
  const eventi = [];
  const esito = await talosLavora({ cartella, task: { consegna: banco.messaggi[0].content }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete, comandoProva: 'node -e 0', onGiro: (e) => eventi.push(e) });
  assert.equal(esito.comeFinita, 'concluso');

  const conAvviso = corpi.filter((b) => b.messages.some((m) => m.role === 'tool' && AVVISO.test(String(m.content).split('\n')[0])));
  assert.ok(conAvviso.length > 0, `M1: at least one request carries a shortened read with its notice (${corpi.length} requests)`);
  const visti = new Map();
  for (const body of conAvviso) {
    const accorciate = body.messages.filter((m) => m.role === 'tool' && AVVISO.test(String(m.content).split('\n')[0]));
    for (const m of accorciate) {
      const dopo = m.content.slice(m.content.indexOf('\n') + 1);
      assert.ok(dopo.startsWith('<<<TALOS_DATA id=') || dopo.startsWith('[TALOS read lines '), 'the notice is outside, before the envelope');
      if (visti.has(m.tool_call_id)) assert.equal(m.content, visti.get(m.tool_call_id), 'M1: the same result is byte-identical in every later request (cache)');
      visti.set(m.tool_call_id, m.content);
    }
    assert.deepEqual(body.messages.at(-1), { role: 'system', content: nota(accorciate.map((m) => voceDi(m.content)).join(', '), accorciate.length) }, 'M2: the tail note lists exactly the shortened results of this request (raw kernel: `system`; the adapters fold it)');
  }
  const salvati = esito.messaggiFinali.filter((m) => m.role === 'tool');
  assert.equal(salvati.length, chiamate.length);
  for (const m of salvati) {
    assert.ok(m.content.startsWith('<<<TALOS_DATA id=') || m.content.startsWith('[TALOS read lines '), 'the saved result starts as before');
    assert.ok(!m.content.includes('[TALOS: this result was shortened') && !m.content.includes(MARCATORE_ACCORCIATO), 'the saved result is whole, no notice');
  }
  assert.ok(!esito.messaggiFinali.some((m) => String(m.content ?? '').includes('TALOS context note')), 'the tail note is never saved in the history');
  const esiti = eventi.filter((e) => e.tipo === 'tool-esito');
  assert.equal(esiti.length, chiamate.length);
  for (const e of esiti) assert.ok(!String(e.content).includes('[TALOS: this result was shortened') && !String(e.content).includes('TALOS context note'), 'the tool-esito event (tool.completed) is unchanged');
});

/* M2 e la linea certa del rifiuto (05/11, trovata da `c-contesto-pieno-bersaglio-23-10` C-UNO-PER-GIRO-01): la nota si aggiunge in
   `invoke`, DOPO che la compattazione ha giudicato la proiezione contro la linea certa del fornitore. Senza contarla, il ritentativo
   stava a 1.879 su 1.880 e partiva a 1.959 con la nota: una richiesta che il fornitore aveva GIÀ detto di rifiutare. Il riassunto pagato
   risponde tardi, così il ramo è sempre lo stesso (senza il ritardo la prova dipende da chi arriva prima). */
test('M2-LINEA-CERTA (red before the cure): after a rejection with numbers, no request leaves above the stated maximum once the tail note is in', async (t) => {
  const { stimaTokenConversazione: stima } = await import('../src/kernel/talosHarness.mjs');
  const parole = (n) => 'parola '.repeat(n);
  const messaggi = [...Array.from({ length: 40 }, (_, i) => [{ role: 'user', content: `Domanda ${i}: ${parole(60)}` }, { role: 'assistant', content: `Risposta ${i}: ${parole(60)}` }]).flat(),
    { role: 'user', content: 'Leggi grande.txt tre volte.' }];
  const massimi = [];
  const corpi = [];
  const oltre = [];
  const fetchDiRete = async (_u, o) => {
    const corpo = corpoSenzaMarcatori(o.body);
    if (!corpo.tools?.length) {
      await new Promise((r) => setTimeout(r, 400));
      return Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: '## Riassunto\nIn breve: si parlava di parole.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
    }
    corpi.push(corpo);
    const n = corpi.length;
    const peso = stima(corpo.messages);
    for (const massimo of massimi) if (peso > massimo) oltre.push(`request ${n} (${peso}) above ${massimo}`);
    if (n === 1 || n === 4) {
      const massimo = Math.floor(peso * (n === 4 ? 0.8 : 0.75));
      massimi.push(massimo);
      return new Response(JSON.stringify({ error: { message: `prompt is too long: ${peso} tokens > ${massimo} maximum` } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const chiamata = n <= 4 ? { content: null, tool_calls: [{ id: `c${n}`, type: 'function', function: { name: 'leggi', arguments: '{"percorso":"grande.txt"}' } }] } : { content: 'fatto' };
    return Response.json({ choices: [{ index: 0, message: { role: 'assistant', ...chiamata }, finish_reason: n <= 4 ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: peso, completion_tokens: 1 } });
  };
  const cartella = mkdtempSync(join(tmpdir(), 'talos-m2-linea-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  writeFileSync(join(cartella, 'grande.txt'), 'una riga del file grande. '.repeat(400));
  const nonEntra = [];
  let errore = null;
  try {
    await talosLavora({ scartoMisurato: 0, cartella, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', task: { consegna: 'x' }, messaggiIniziali: messaggi,
      contestoDelProgetto: 'Project files:\n', fetchDiRete, permessi: 'Full access',
      onGiro: (e) => { if (e?.tipo === 'compattazione-fine' && e.motivo === 'non-entra') nonEntra.push(e); } });
  } catch (e) { errore = e; }
  assert.deepEqual(oltre, [], 'no request leaves above a maximum the provider already stated');
  assert.ok(corpi.length >= 4, `premise: the second rejection happened (${corpi.length} requests)`);
  assert.ok(corpi.slice(4).some((c) => c.messages.some((m) => m.role === 'system' && String(m.content).startsWith('[TALOS context note:'))) || nonEntra.length > 0,
    'either the retry carries the note and fits, or the turn says it does not fit');
  if (errore) assert.ok(nonEntra.length > 0, `a failed turn says why: ${errore.message}`);
});

/* Cura 324, giro 3 (decisione 330, punto d, R04 del revisore 3 e R9 del revisore 2): con la continuazione sul ragionamento la nota in
   coda degli accorciati resta PRIMA dell'assistant in coda, così il modello prosegue il suo ragionamento e la nota non lo separa dalla
   domanda. Hermes mette il prefill per ultimo (`run_agent.py:1122-1135`, `_thinking_prefill`). */
test('M12-PREFILL (cure 324 round 3, R04): with a reasoning-only empty answer after shortened reads, the tail note stays right BEFORE the prefill', async (t) => {
  conTetto(t, 8_000);
  const cartella = mkdtempSync(join(tmpdir(), 'talos-m12-prefill-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  for (const n of [1, 2, 3]) writeFileSync(join(cartella, `report${n}.txt`), `${datiDi(banco.messaggi.find((m) => m.role === 'tool' && m.content.includes(`from="leggi report${n}.txt"`)).content)}\n`);
  const chiamate = [{ percorso: 'report1.txt' }, { percorso: 'report1.txt', offset: 1, limit: 200 }, { percorso: 'report2.txt' }, { percorso: 'report3.txt' }];
  const corpi = [];
  const fetchDiRete = async (_url, init) => {
    const body = corpoSenzaMarcatori(init.body);
    const usage = { prompt_tokens: Math.ceil(JSON.stringify(body.messages).length / 4), completion_tokens: 5 };
    if (String(body.messages.at(-1)?.content ?? '').includes('CONTEXT COMPACTION')) throw new Error('no summary in this scene');
    corpi.push(body);
    const n = corpi.length;
    if (n <= chiamate.length) return Response.json({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `call_${n}`, type: 'function', function: { name: 'leggi', arguments: JSON.stringify(chiamate[n - 1]) } }] }, finish_reason: 'tool_calls' }], usage });
    if (n === chiamate.length + 1) { // in flusso, come i fornitori veri: ragionamento, `stop`, niente testo
      const sse = [{ choices: [{ delta: { reasoning_content: 'The code is in report3, line 40…' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, { choices: [], usage }];
      const testoSSE = `${sse.map((x) => `data: ${JSON.stringify(x)}\n\n`).join('')}data: [DONE]\n\n`;
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(testoSSE)); c.close(); } }));
    }
    return Response.json({ choices: [{ message: { role: 'assistant', content: 'D3C26B2A' }, finish_reason: 'stop' }], usage });
  };
  const esito = await talosLavora({ cartella, task: { consegna: banco.messaggi[0].content }, modello: 'z-ai/glm-5.3-flash', chiave: 'fixture', fetchDiRete, comandoProva: 'node -e 0', onGiro: () => {},
    onDelta: () => {} }); // in flusso: la scala della risposta vuota legge il flusso, come nel prodotto
  assert.equal(esito.comeFinita, 'concluso');
  assert.equal(corpi.length, chiamate.length + 2, 'four reads, the empty answer, the continuation');
  const continuazione = corpi.at(-1).messages;
  assert.deepEqual(continuazione.at(-1), { role: 'assistant', content: '', reasoning_content: 'The code is in report3, line 40…' }, 'the prefill is last');
  const accorciate = continuazione.filter((m) => m.role === 'tool' && AVVISO.test(String(m.content).split('\n')[0]));
  assert.ok(accorciate.length > 0, 'premise: the continuation carries shortened reads');
  assert.deepEqual(continuazione.at(-2), { role: 'system', content: nota(accorciate.map((m) => voceDi(m.content)).join(', '), accorciate.length) }, 'the tail note right before the prefill');
  assert.ok(!esito.messaggiFinali.some((m) => m.role === 'assistant' && m.reasoning_content === 'The code is in report3, line 40…' && !m.content), 'the prefill is never saved');
});
