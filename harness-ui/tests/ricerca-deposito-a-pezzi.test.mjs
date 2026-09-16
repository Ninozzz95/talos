import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { creaResearchOrchestrator, componiRapportoRicerca } from '../src/research-orchestrator.mjs';
import { creaRicerca, leggiRicerca, aggiornaRicerca, elencaRicerche, leggiGiornale, percorsoGiornale, percorsoRapporto } from '../src/research-store.mjs';
import { talosResearchParseReport } from '../src/research/report.mjs';
import { LIMITE_PARTE_RAPPORTO_BYTE, rileggiPartiRapporto } from '../src/research/deposito-a-pezzi.mjs';
import { talosLavora, ATTREZZI_OPENAI, ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

const id = 'bc49';
const domanda = 'Come evolvono gli harness?';
const fonte = { url: 'https://esempio.invalid/a', titolo: 'Fonte', letta: true };
const affermazione = { testo: 'Il dato è verificabile.', fonte: fonte.url, passaggio: 'Il dato è verificabile.' };
const pezzo = (indice, testo = '', ultima = false, affermazioni = [], fonti = []) => ({ testo, affermazioni, fonti, parte: { indice, ultima } });
const parti = [pezzo(1, '# Rapporto\r\n\r\nCaffè ☕ 日本語', false, [affermazione], [fonte]), pezzo(2, '\n\n## Fonti\n- https://esempio.invalid/a\n', true)];
const unico = { testo: parti.map(p => p.testo).join(''), affermazioni: [affermazione], fonti: [fonte] };

async function banco(t, extra = {}) {
  const cartella = await mkdtemp(join(tmpdir(), 'bc49-test-'));
  t.after(async () => {
    assert.ok(resolve(cartella).startsWith(resolve(tmpdir()) + '\\') || resolve(cartella).startsWith(resolve(tmpdir()) + '/'));
    await rimuoviCartellaDiProvaAttesa(cartella);
  });
  const avviati = [], sessioni = new Map();
  const opzioni = {
    sessioni, avviaESeguiFn: spec => { avviati.push(spec); return { sessionId: spec.sessionId }; },
    randomUUIDFn: () => id, clock: () => new Date('2026-09-12T14:00:00Z'), ripresaAutomatica: false,
    creaRicercaFn: creaRicerca, leggiRicercaFn: leggiRicerca, aggiornaRicercaFn: aggiornaRicerca,
    elencaRicercheFn: elencaRicerche, salvaVoceLibreriaFn: async () => 'lib-bc49',
    leggiVoceLibreriaFn: async () => null, eliminaVoceLibreriaFn: async () => {},
    ...extra,
  };
  const orch = creaResearchOrchestrator(opzioni);
  await orch.avvia({ cartella, question: domanda, depth: 'deep', modello: 'autore' });
  const deposita = p => orch.componiRapporto({ cartella, id, domanda, ...p });
  return { cartella, orch, deposita, avviati, sessioni, opzioni };
}

test('BC49: parti ordinate, prosa Unicode e prove producono lo stesso rapporto del deposito unico', async t => {
  const b = await banco(t);
  const atteso = await b.deposita(unico);
  const prima = await b.deposita(parti[0]);
  assert.equal(prima.parziale, true);
  assert.equal(prima.prossimaParte, 2);
  await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
  const ultima = await b.deposita(parti[1]);
  assert.equal(ultima.ok, true);
  assert.equal(ultima.documento, atteso.documento);
  assert.equal(await readFile(percorsoRapporto(b.cartella, id), 'utf8'), atteso.documento);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.deepEqual(j.eventi.filter(e => e.kind === 'deposit_part').map(e => e.indice), [1, 2]);
});

test('BC49: parte ripetuta anche concorrente è idempotente; contenuto diverso allo stesso indice viene rifiutato', async t => {
  const b = await banco(t);
  const risposte = await Promise.all([b.deposita(parti[0]), b.deposita(structuredClone(parti[0]))]);
  assert.ok(risposte.every(r => r.ok && r.prossimaParte === 2));
  assert.equal((await b.deposita({ ...parti[0], testo: 'diverso' })).ok, false);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(j.eventi.filter(e => e.kind === 'deposit_part').length, 1);
  const alterato = structuredClone(j.eventi);
  alterato.find(e => e.kind === 'deposit_part').contenuto.testo = 'manomesso';
  assert.throws(() => rileggiPartiRapporto(alterato), /impronta|integrità/i);
});

test('BC49: buco, ultimo prematuro, campo malformato e parte sovradimensionata non committano', async t => {
  const b = await banco(t);
  for (const p of [parti[1], pezzo(0), pezzo(1, '☕'.repeat(LIMITE_PARTE_RAPPORTO_BYTE)), { ...parti[0], parte: null }, { ...parti[0], fonti: {} }]) {
    assert.equal((await b.deposita(p)).ok, false);
  }
  assert.equal((await leggiGiornale({ cartella: b.cartella, id })).eventi.filter(e => e.kind === 'deposit_part').length, 0);
});

for (const conversazione of [false, true]) test(`BC49: caduta e ripresa ${conversazione ? 'con' : 'senza'} conversazione ripartono dalla parte dopo l'ultima committata`, async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  await aggiornaRicerca({ cartella: b.cartella, id, terminata: 'failed', motivoErrore: { classe: 'timeout-fornitore', transitorio: true } });
  b.sessioni.set(id, { cartella: b.cartella, taskId: 'ricerca', task: b.avviati[0].task, conclusa: true, messaggiFinali: conversazione ? [{ role: 'assistant', content: 'Interrotta.' }] : null });
  const dopoRiavvio = creaResearchOrchestrator(b.opzioni);
  assert.equal((await dopoRiavvio.riprendi({ cartella: b.cartella, id })).ok, true);
  const consegna = b.avviati.at(-1).messaggiIniziali.at(-1).content;
  assert.match(consegna, /prossima parte.*2/i);
  assert.match(consegna, /non rigenerare/i);
  const ultima = await dopoRiavvio.componiRapporto({ cartella: b.cartella, id, domanda, ...parti[1] });
  assert.equal(ultima.ok, true);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.deepEqual(j.eventi.filter(e => e.kind === 'deposit_part').map(e => e.indice), [1, 2]);
});

test('BC49: JSON mozzato in coda non inghiotte la parte rispedita dopo il riavvio', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  const path = percorsoGiornale(b.cartella, id);
  await writeFile(path, '{"kind":"deposit_part","indice":2', { flag: 'a' });
  assert.equal((await b.deposita(parti[1])).ok, true);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(j.righeSaltate, 1);
  assert.equal(rileggiPartiRapporto(j.eventi).parti.length, 2);
});

test('BC49: ultimo vuoto sigilla, ripetizione finale dopo riavvio riusa documento e giudizio', async t => {
  const b = await banco(t);
  await b.deposita({ ...parti[0], testo: unico.testo });
  const chiusura = pezzo(2, '', true);
  const finito = await b.deposita(chiusura);
  assert.equal(finito.ok, true);
  const prima = await leggiGiornale({ cartella: b.cartella, id });
  const nuovo = creaResearchOrchestrator(b.opzioni);
  const ripetuto = await nuovo.componiRapporto({ cartella: b.cartella, id, domanda, ...chiusura });
  assert.equal(ripetuto.documento, finito.documento);
  const dopo = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(dopo.eventi.length, prima.eventi.length);
  assert.equal((await b.deposita(pezzo(3, 'aggiunta', true))).ok, false);
});

test('BC49: scrittura del giornale fallita non conferma né pubblica una parte', async t => {
  let guasta = false;
  const { accodaEvento } = await import('../src/research-store.mjs');
  const b = await banco(t, { accodaEventoFn: a => { if (guasta) throw new Error('disco pieno'); return accodaEvento(a); } });
  guasta = true;
  await assert.rejects(b.deposita(parti[0]), /disco pieno/);
  await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
  assert.equal((await leggiGiornale({ cartella: b.cartella, id })).eventi.filter(e => e.kind === 'deposit_part').length, 0);
});

async function giroKernel(cartella, argomenti, compositore, livelloAccesso = 'ricerca') {
  const richieste = [], eventi = [];
  await talosLavora({
    cartella, task: { consegna: 'Deposita il rapporto.', ricercaId: id, ricercaDomanda: domanda },
    modello: 'x', chiave: 'y', livelloAccesso, strumentiEstesi: ['research_deposit'],
    componiRapportoRicercaFn: compositore, onGiro: e => eventi.push(e),
    fetchDiRete: async (_url, opzioni) => {
      richieste.push(JSON.parse(opzioni.body));
      const message = richieste.length === 1
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_bc49', function: { name: 'research_deposit', arguments: JSON.stringify(argomenti) } }] }
        : { role: 'assistant', content: 'Pronto.', tool_calls: [] };
      return { ok: true, status: 200, json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }), text: async () => '' };
    },
  });
  return { risposta: richieste.at(-1).messages.find(m => m.role === 'tool')?.content, eventi };
}

test('BC49: kernel conferma la parte senza rapporto incompleto; assenza adattatore e guasto falliscono chiusi', async t => {
  const b = await banco(t);
  const r = await giroKernel(b.cartella, parti[0], a => b.deposita(a));
  assert.match(r.risposta, /parte 1.*registrata/i);
  await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
  for (const fn of [undefined, async () => { throw new Error('disco pieno'); }]) {
    const rifiuto = await giroKernel(b.cartella, parti[1], fn);
    assert.match(rifiuto.risposta, /REFUSED/);
    await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
  }
});

test('BC49: permesso negato non chiama il compositore e non scrive il giornale', async t => {
  const b = await banco(t);
  let chiamate = 0;
  await giroKernel(b.cartella, parti[0], async () => { chiamate++; return { ok: true }; }, 'lettura');
  assert.equal(chiamate, 0);
});

test('BC49: deposito unico del banco resta byte per byte, anche senza adattatore', async t => {
  const b = await banco(t);
  const testo = '  # Rapporto\r\n\r\nCaffè ☕\n\n## Fonti\nhttps://esempio.invalid/a\n  ';
  const r = await giroKernel(b.cartella, { testo }, undefined);
  assert.equal(await readFile(percorsoRapporto(b.cartella, id), 'utf8'), testo);
  assert.match(r.risposta, /^deposited:/);
});

test('BC49: inventario e campi TALOS-BANCO invariati, eccetto le esenzioni DICHIARATE qui sotto (deposito, i tre attrezzi paginati, l\'attrezzo di modifica e il lotto di library_delete)', () => {
  for (const [attrezzi, impronta] of [[ATTREZZI_OPENAI, '38d65a3f445bf470c5f79ace0b662ae1eaf619b22cbfabbe885676ee5c5bfd4b'], [ATTREZZI_ESTESI_OPENAI, '3b1ec130170b4e761cdcc27ced49228ddb6fd8296017ec22a9f4a272152845d4']]) {
    /* ⛔ PO-12 (13/09/2026) — TERZA esenzione, e la piu' forte delle tre: l'attrezzo NUOVO
     * (`file_edit`) si toglie INTERO dalla copia prima di misurare. Cosi' le due impronte qui
     * sopra NON sono state ristampate — sono le stesse identiche di ieri, e il fatto che
     * combacino ancora e' la prova misurata che dei 43 attrezzi precedenti non e' cambiato un
     * byte: ne' un nome, ne' una descrizione, ne' un campo.
     * ⛔ Prima di toglierlo si asserisce CHE COSA e': se un domani cambiassero i suoi campi o
     *   diventasse obbligatorio `replace_all`, questa prova cade invece di tacere — che e'
     *   esattamente il motivo per cui il cancello esiste.
     * ⛔ E si asserisce che sia ESTESO e non BASE: la lista base e' il metro del banco (sette
     *   nomi, ~505 token), e spostarlo li' dentro cambierebbe il preambolo di ogni campagna.
     *   Anche questo e' un modo in cui il cancello puo' diventare rosso, ed e' voluto. */
    const modifica = attrezzi.map((t) => t.function ?? t).find((f) => f.name === 'file_edit');
    if (attrezzi === ATTREZZI_OPENAI) {
      assert.equal(modifica, undefined, 'file_edit deve restare un attrezzo ESTESO: la lista base del banco non si allunga');
    }
    else {
      assert.ok(modifica, 'file_edit e\' sparito dagli attrezzi estesi: il modello non ha piu\' un attrezzo di modifica');
      const schemaModifica = modifica.parameters ?? modifica.input_schema;
      assert.deepEqual(Object.keys(schemaModifica.properties).sort(), ['new_string', 'old_string', 'percorso', 'replace_all']);
      assert.deepEqual([...schemaModifica.required].sort(), ['new_string', 'old_string', 'percorso']);
      assert.equal(schemaModifica.required.includes('replace_all'), false, 'replace_all deve restare OPZIONALE: il default e\' il match unico');
    }
    const copia = structuredClone(attrezzi).filter((t) => (t.function ?? t).name !== 'file_edit');
    for (const t of copia) {
      const f = t.function ?? t;
      if (f.name === 'research_deposit') {
        const schema = f.parameters ?? f.input_schema;
        assert.ok(schema.properties.parte);
        assert.equal(schema.required.includes('parte'), false);
        delete schema.properties.parte;
        delete f.description;
      }
      /* ⛔ BC-10 (13/09/2026) — esenzione AGGIUNTA, e il motivo conta piu' del codice.
       * La cura di BC-10 ha dato ai due attrezzi della Libreria un campo OPZIONALE di sblocco e ha
       * riscritto le loro descrizioni, quindi l'impronta dell'inventario e' cambiata per davvero.
       * Ristampare l'impronta e basta avrebbe SPENTO questa guardia: da quel momento avrebbe detto
       * «tutto invariato» qualunque cosa cambiasse.
       * ⇒ Si esenta solo cio' che e' cambiato APPOSTA, asserendo prima che il campo esista e che sia
       * opzionale: se un domani diventasse obbligatorio, o sparisse, questa prova cade.
       * ⇒ L'impronta nuova non e' indovinata: applicando questa stessa esenzione all'inventario del
       * commit precedente e a quello di oggi, le due impronte COINCIDONO — prova misurata che
       * nient'altro e' cambiato. La descrizione e' prosa per il modello, non il contratto del banco. */
      if (f.name === 'library_list' || f.name === 'library_search') {
        const schema = f.parameters ?? f.input_schema;
        assert.ok(schema.properties.browse_every_page, `${f.name}: manca il campo di sblocco`);
        assert.equal((schema.required ?? []).includes('browse_every_page'), false, `${f.name}: il campo di sblocco NON deve essere obbligatorio`);
        delete schema.properties.browse_every_page;
        delete f.description;
      }
      /* FASE 3 (15/09/2026) — research_list e' il terzo attrezzo realmente paginato.
       * Riceve lo stesso sblocco esplicito dei due attrezzi Libreria; il campo resta
       * opzionale e viene tolto soltanto dalla copia usata da questo censimento storico. */
      if (f.name === 'research_list') {
        const schema = f.parameters ?? f.input_schema;
        assert.ok(schema.properties.browse_every_page, 'research_list: manca il campo di sblocco');
        assert.equal((schema.required ?? []).includes('browse_every_page'), false, 'research_list: il campo di sblocco NON deve essere obbligatorio');
        assert.match(f.description, /first page reports the total/i, 'research_list: la descrizione deve spiegare il tetto al modello');
        delete schema.properties.browse_every_page;
        f.description = 'List the deep researches run on this project, with how each one ended and how far it got. Use this whenever the user asks about their researches — what they investigated, which ones are still running, which failed. Do NOT use library_list for that: research reports are saved as Library files, so library_list finds them mixed in with every other document and cannot say whether a research finished, was paused, or failed.';
      }
      /* ⭐ LOTTI (16/09/2026) — quarta esenzione: `library_delete` guadagna il campo OPZIONALE
       * `ids` per cancellare piu' file della Libreria in UNA chiamata (tetto 100), e la
       * description lo spiega al modello. Come per BC-10: si asserisce CHE COSA e' — `ids`
       * esiste, NON e' obbligatorio e `id` lo resta — poi si toglie dalla copia insieme alla
       * descrizione, cosi' l'impronta copre tutto il resto dell'inventario e la prosa non parla.
       * ⇒ Prova misurata: applicando questa STESSA esenzione all'inventario di main (senza
       *   lotti) l'impronta estesa COINCIDE (3b1ec130… su entrambi) — nient'altro e' cambiato:
       *   ne' un nome, ne' un campo, ne' un obbligatorio. E la lista base non si tocca:
       *   `library_delete` non c'e' nella base, e la sua impronta 38d65a3f… resta quella. */
      if (f.name === 'library_delete') {
        const schema = f.parameters ?? f.input_schema;
        assert.ok(schema.properties.ids, 'library_delete: manca il campo `ids` dei lotti');
        assert.equal((schema.required ?? []).includes('ids'), false, 'library_delete: `ids` NON deve essere obbligatorio');
        assert.deepEqual([...schema.required].sort(), ['id'], 'library_delete: `id` deve restare l\'unico obbligatorio');
        delete schema.properties.ids;
        delete f.description;
      }
    }
    assert.equal(createHash('sha256').update(JSON.stringify(copia)).digest('hex'), impronta);
  }
});

test('BC49: adattatore precedente che ignora parte non pubblica una sezione isolata', async t => {
  const b = await banco(t);
  const r = await giroKernel(b.cartella, parti[0], componiRapportoRicerca);
  assert.match(r.risposta, /REFUSED/);
  await assert.rejects(readFile(percorsoRapporto(b.cartella, id)), { code: 'ENOENT' });
});

test('BC49: giornale non leggibile resta un errore, mentre il lettore storico resta tollerante', async () => {
  const deps = { readFileFn: async () => { throw Object.assign(new Error('lettura negata'), { code: 'EACCES' }); } };
  assert.deepEqual((await leggiGiornale({ cartella: tmpdir(), id }, deps)).eventi, []);
  await assert.rejects(leggiGiornale({ cartella: tmpdir(), id, rigoroso: true }, deps), { code: 'EACCES' });
});

test('BC49: ordine delle chiavi JSON non cambia idempotenza; perdita di una parte interna blocca il replay', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  const diversoOrdine = { parte: { ultima: false, indice: 1 }, fonti: [fonte], affermazioni: [affermazione], testo: parti[0].testo };
  assert.equal((await b.deposita(diversoOrdine)).prossimaParte, 2);
  await b.deposita(parti[1]);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.throws(() => rileggiPartiRapporto(j.eventi.filter(e => !(e.kind === 'deposit_part' && e.indice === 1))), /manca una parte/i);
});

test('BC49: errore durante la verifica lascia ultimo checkpoint ripetibile e non raddoppia la prosa', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  const { depositaParteRapporto, consegnaPartiRapporto } = await import('../src/research/deposito-a-pezzi.mjs');
  const { accodaEvento, leggiRapporto } = await import('../src/research-store.mjs');
  await assert.rejects(depositaParteRapporto({ cartella: b.cartella, id, ...parti[1] }, {
    leggiGiornaleFn: leggiGiornale, accodaEventoFn: accodaEvento, leggiRapportoFn: leggiRapporto,
    valida: componiRapportoRicerca, clock: () => new Date(), finalizza: async () => { throw new Error('processo caduto'); },
  }), /processo caduto/);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.match(consegnaPartiRapporto(j.eventi), /ultima parte è già registrata/);
  const r = await b.deposita(parti[1]);
  assert.equal(talosResearchParseReport(r.documento).summary, unico.testo.trim());
  assert.equal((await leggiGiornale({ cartella: b.cartella, id })).eventi.filter(e => e.kind === 'deposit_part').length, 2);
});

test('BC49: rapporto finale alterato non viene sovrascritto né dichiarato identico', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]); await b.deposita(parti[1]);
  await writeFile(percorsoRapporto(b.cartella, id), 'modifica esterna');
  await assert.rejects(b.deposita(parti[1]), /impronta/);
  assert.equal(await readFile(percorsoRapporto(b.cartella, id), 'utf8'), 'modifica esterna');
});

test('BC49: una sola parte già salvata basta alla ripresa automatica BC44, una volta sola', async t => {
  const b = await banco(t, { ripresaAutomatica: true, dormiFn: async () => {} });
  await b.deposita(parti[0]);
  b.sessioni.set(id, { cartella: b.cartella, taskId: 'ricerca', task: b.avviati[0].task, conclusa: true, messaggiFinali: null });
  const caduta = { ok: false, esito: null, erroreInterno: 'Upstream idle timeout exceeded', codiceErrore: 'internal-error' };
  await b.avviati[0].onConclusioneFn(caduta);
  assert.equal(b.avviati.length, 2);
  assert.match(b.avviati[1].messaggiIniziali[0].content, /prossima parte.*2/i);
  await b.avviati[1].onConclusioneFn(caduta);
  assert.equal(b.avviati.length, 2);
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(j.eventi.filter(e => e.kind === 'run_resumed' && e.auto).length, 1);
});

test('BC49: L9 giudica le prove assemblate soltanto alla chiusura; ricevuta finale e deposito unico coincidono', async t => {
  let giudizi = 0;
  const b = await banco(t, {
    chiediAlModelloFn: async prompt => { giudizi++; return prompt.prompt.includes('Il passaggio, DA SOLO, sostiene') ? 'SI — il passaggio lo dice.' : 'NO — nessuna prova contraria.'; },
    modelliGiudiceFn: () => [{ id: 'altro/giudice', provider: 'openrouter', model: 'altro/giudice' }],
  });
  await b.orch.raccoltaDellaRicerca(id).around({ kind: 'extract', url: fonte.url, provider: 'naviga' }, async () => ({ stato: 200, url: fonte.url, corpo: affermazione.passaggio }));
  await giroKernel(b.cartella, parti[0], a => b.deposita(a));
  assert.equal(giudizi, 0);
  const finale = await giroKernel(b.cartella, parti[1], a => b.deposita(a));
  assert.ok(giudizi > 0);
  const testo = await readFile(percorsoRapporto(b.cartella, id), 'utf8');
  const record = talosResearchParseReport(testo);
  assert.equal(record.judge, 'altro/giudice');
  assert.equal(record.claims[0].checks.claimSupported, 'yes');
  const numeroGiudizi = giudizi;
  const ripetuto = await giroKernel(b.cartella, parti[1], a => b.deposita(a));
  assert.equal(giudizi, numeroGiudizi);
  assert.equal(ripetuto.risposta, finale.risposta);
  const storico = await giroKernel(b.cartella, unico, a => b.deposita(a));
  assert.equal(storico.risposta, finale.risposta);
  assert.equal(await readFile(percorsoRapporto(b.cartella, id), 'utf8'), testo);
});

test('BC49: coda mozzata non assorbe il fatto di ripresa e il suo limite di tentativi', async t => {
  const b = await banco(t);
  await b.deposita(parti[0]);
  await writeFile(percorsoGiornale(b.cartella, id), '{"kind":"deposit_part","indice":2', { flag: 'a' });
  await aggiornaRicerca({ cartella: b.cartella, id, terminata: 'failed', motivoErrore: { classe: 'timeout-fornitore', transitorio: true } });
  b.sessioni.set(id, { cartella: b.cartella, taskId: 'ricerca', task: b.avviati[0].task, conclusa: true, messaggiFinali: null });
  await b.orch.riprendi({ cartella: b.cartella, id });
  const j = await leggiGiornale({ cartella: b.cartella, id });
  assert.equal(j.eventi.filter(e => e.kind === 'run_resumed').length, 1);
  assert.equal(rileggiPartiRapporto(j.eventi).prossimaParte, 2);
});

test('BC49: tetto esatto UTF-8 include prove e JSON; spazi aggiunti dal fornitore contano', async t => {
  const b = await banco(t);
  const vuoto = pezzo(1);
  const spazio = LIMITE_PARTE_RAPPORTO_BYTE - Buffer.byteLength(JSON.stringify(vuoto));
  const alTetto = pezzo(1, 'a'.repeat(spazio));
  assert.equal(Buffer.byteLength(JSON.stringify(alTetto)), LIMITE_PARTE_RAPPORTO_BYTE);
  assert.equal((await b.deposita({ ...alTetto, testo: alTetto.testo + 'a' })).ok, false);
  assert.equal((await b.deposita({ ...alTetto, byteArgomenti: LIMITE_PARTE_RAPPORTO_BYTE + 1 })).ok, false);
  assert.equal((await b.deposita(alTetto)).ok, true);
  assert.equal((await b.deposita(pezzo(2, '', false, [{ ...affermazione, passaggio: 'a'.repeat(LIMITE_PARTE_RAPPORTO_BYTE) }]))).ok, false);
});
