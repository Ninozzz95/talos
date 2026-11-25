import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';

/*
 * 14/11/2026 — QUARTO GIRO DELL'AFFITTO, «note e prove» (owner 12:20, giudice v1862-v1864). La strada `voce !== attuale` di
 *   `adottaRigheAltrui` (`session-registry.mjs:5576-5591`): l'adozione arriva per una voce che una ricarica ha GIÀ sostituito. Il revisore
 *   affitto 3 di 3 l'aveva trovata scoperta (4 mutanti vivi: R3-03, R3-04, R3-08, R3-09). La si raggiunge senza toccare il prodotto e
 *   senza ganci: chi ha in mano la voce di un giro (`input.onEvento`, la stessa chiusura che il kernel tiene per tutto il giro) manda un
 *   evento TARDIVO dopo che il giro è finito e una ricarica ha sostituito la voce, mentre l'altro TALOS ha scritto dopo la ricarica. Lo
 *   store rifiuta (il recinto vede il file cresciuto), legge la coda dell'altro e chiama `dopoIlRecinto` con la voce VECCHIA.
 *   Due forme: prima della ricarica l'altro scrive (a) righe numerate, (b) una riga senza numero. Poi si misura che cosa vede chi ascolta
 *   (la pagina col suo Set, `mobile/public/harness-ui/app.js:5909-5910`; la CLI col suo cursore, `supervisor.ts:159`), la memoria del
 *   server e il riavvio. Solo cartelle del TEMP (finto, nella coda); mai tolte da qui.
 */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const chiave = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.delta ?? ''}|${e.name ?? ''}|${e.value?.id ?? ''}`;
const giornale = (store, id) => join(store, `${id}.jsonl`);
const righeScritte = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((t) => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
const massimoScritto = (store, id) => Math.max(0, ...righeScritte(store, id).map((r) => r._sequenza).filter(Number.isSafeInteger));
/* l'altro TALOS: righe sue coi numeri presi dal disco (il più alto + 1), o una riga senza numero */
const scriveAltrove = (store, id, ids, { numerate = true } = {}) => {
  let n = massimoScritto(store, id);
  appendFileSync(giornale(store, id), ids.map((x) => `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: x }, ...(numerate ? { _sequenza: ++n } : {}) })}\n`).join(''));
};
const doppiDi = (numeri) => numeri.filter((n, i) => numeri.indexOf(n) !== i);

function registroDi(store, stato) {
  return createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'vs' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    avviaSessioneFn: async (input) => {
      if (!stato) return { ok: true, esito: { detto: 'x', comeFinita: 'concluso' } };
      while (!stato.sessionId) await pausa(5);
      stato.onEvento = input.onEvento; // la chiusura del giro resta in mano a chi l'ha avuta
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      input.onEvento({ type: 'TextMessageStart', messageId: 'mio', role: 'assistant' });
      await attendiScritture({ cartellaStore: stato.store, sessionId: stato.sessionId });
      for (let i = 0; i < 3; i += 1) {
        /* l'altro scrive DENTRO il giro (come REVAFF3-N29): la coda adottata segna la chat «da ricaricare» appena è ferma */
        if (i === 1) scriveAltrove(stato.store, stato.sessionId, ['durante-1']);
        input.onEvento({ type: 'TextMessageContent', messageId: 'mio', delta: `p${i} ` });
        await attendiScritture({ cartellaStore: stato.store, sessionId: stato.sessionId });
      }
      input.onEvento({ type: 'TextMessageEnd', messageId: 'mio' });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1', outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      stato.fine();
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'scrivi' }, { role: 'assistant', content: 'Fatto.' }] } };
    },
  });
}

async function voceSostituita(t, { primaDellaRicarica = 'numerate', tardivi = 1 } = {}) {
  const errori = [];
  const suErrore = (e) => { errori.push(`${e?.code ?? ''} ${e?.message ?? e}`.slice(0, 160)); };
  process.on('unhandledRejection', suErrore);
  t.after(() => process.off('unhandledRejection', suErrore));
  const store = mkdtempSync(join(tmpdir(), 'vs-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'vsl-'));
  attivaAffittiArchivio(store, { etichetta: 'vs', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  let fine;
  const stato = { store, sessionId: null, onEvento: null, fine: null };
  const finito = new Promise((ok) => { fine = ok; });
  stato.fine = fine;
  const registro = registroDi(store, stato);
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const pagina = { visti: new Set(), nascoste: [], mostrate: new Map() };
  const cli = { cursore: 0, nascoste: [], mostrate: new Map() };
  const consegne = new Map(); // giro 5: quante volte ogni riga arriva a chi ascolta
  registro.iscriviti(sessionId, (e) => {
    if (!Number.isSafeInteger(e._sequenza)) return;
    const c = chiave(e);
    consegne.set(c, (consegne.get(c) ?? 0) + 1);
    if (pagina.visti.has(e._sequenza)) pagina.nascoste.push(c); else { pagina.visti.add(e._sequenza); if (pagina.mostrate.has(c)) pagina.nascoste.push(`TWICE ${c}`); else pagina.mostrate.set(c, e._sequenza); }
    if (e._sequenza <= cli.cursore) cli.nascoste.push(c); else { cli.cursore = e._sequenza; if (cli.mostrate.has(c)) cli.nascoste.push(`TWICE ${c}`); else cli.mostrate.set(c, e._sequenza); }
  }, 0);
  stato.sessionId = sessionId;
  await finito;
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  /* 1) l'altro scrive, 2) la ricarica sostituisce la voce, 3) l'altro scrive ancora (la coda che la voce vecchia adotterà) */
  if (primaDellaRicarica === 'numerate') scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
  else scriveAltrove(store, sessionId, ['prima-senza-numero'], { numerate: false });
  const allineata = await registro.allineaSessione(sessionId);
  scriveAltrove(store, sessionId, ['dopo-1', 'dopo-2']);
  /* 4) l'evento tardivo dalla chiusura del giro: la voce che ha in mano è quella VECCHIA */
  const eventiTardivi = [];
  for (let k = 0; k < tardivi; k += 1) {
    const evento = { type: 'CUSTOM', name: 'talos.tardivo', value: { id: `tardivo-${k + 1}` } };
    eventiTardivi.push(evento);
    await stato.onEvento(evento);
    await attendiScritture({ cartellaStore: store, sessionId });
  }
  await pausa(20); // il `setImmediate` dell'avviso
  await attendiScritture({ cartellaStore: store, sessionId });
  const memoria = (registro.esporta(sessionId)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza));
  const inMemoria = new Map(memoria.map((e) => [chiave(e), e._sequenza]));
  const numeriTardivi = eventiTardivi.map((e) => e._sequenza);
  await registro.chiudi({ attesaMassimaMs: 1000 });
  /* il riavvio: i numeri che la lettura dà a ogni riga */
  const nuovo = registroDi(store, null);
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  const dopo = (nuovo.esporta(sessionId)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza));
  const dopoPerChiave = new Map(dopo.map((e) => [chiave(e), e._sequenza]));
  const conti = {
    ricaricata: allineata?.ricaricata === true,
    adozioniSulDisco: righeScritte(store, sessionId).filter((r) => r.tipo === 'adozione').length,
    errori,
    paginaNascoste: pagina.nascoste, cliNascoste: cli.nascoste,
    paginaAdottateDalVivo: ['dopo-1', 'dopo-2'].filter((x) => [...pagina.mostrate.keys()].some((c) => c.endsWith(`|talos.nota-altrove|${x}`))).length,
    memoriaDoppi: doppiDi(memoria.map((e) => e._sequenza)).length,
    memoriaAdottate: memoria.filter((e) => e.name === 'talos.nota-altrove' && String(e.value?.id).startsWith('dopo-')).length,
    numeriTardivi,
    tardiviDopo: eventiTardivi.map((e) => dopoPerChiave.get(chiave(e)) ?? null),
    tardiviDalVivo: eventiTardivi.map((e) => consegne.get(chiave(e)) ?? 0),
    tardiviInMemoria: eventiTardivi.map((e) => memoria.filter((m) => chiave(m) === chiave(e)).length),
    numeroCambiatoPagina: [...pagina.mostrate].filter(([c, n]) => dopoPerChiave.has(c) && dopoPerChiave.get(c) !== n).map(([c]) => c),
    numeroCambiatoMemoria: [...inMemoria].filter(([c, n]) => dopoPerChiave.has(c) && dopoPerChiave.get(c) !== n).map(([c]) => c),
    dopoDoppi: doppiDi(dopo.map((e) => e._sequenza)).length,
    rigaPersaDopo: ['dopo-1', 'dopo-2'].filter((x) => !dopo.some((e) => e.value?.id === x)),
  };
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  return conti;
}

/*
 * Che cosa si chiede, e quale mutante del revisore 3 lo rompe (misurato nella copia, `C:/T/cura-aff7-lavoro/mut-R3-0*.log`):
 *   · le righe dell'altro adottate dalla voce vecchia arrivano a chi ascolta ADESSO (gli ascoltatori sono passati alla voce nuova) —
 *     R3-09 le manda agli ascoltatori della voce vecchia, vuoti dopo la ricarica: 0 arrivate su 2;
 *   · sono nella memoria della voce nuova (chi si collega dopo le ritrova) — R3-08 le mette nella voce vecchia: 0 su 2;
 *   · prendono numeri sopra OGNI numero già dato dalla voce nuova (che ha letto dal disco anche le righe dell'altro di prima della
 *     ricarica) — R3-03 parte dalla voce vecchia: 2 numeri doppi in memoria, la pagina e la CLI nascondono le 2 righe;
 *   · un evento tardivo DOPO l'adozione prende un numero sopra le righe adottate, viene scritto e tiene il suo numero dopo il riavvio —
 *     R3-04 non fa avanzare la voce vecchia: il secondo evento tardivo riusa un numero (rifiutato dal recinto, o spostato al riavvio).
 * Giro 5 (owner 14/11 13:10, «la riga tardiva non si perde»): fino al giro 4 il PRIMO evento tardivo della forma «numerate» prendeva il
 *   numero della voce vecchia, sotto le righe che l'altro aveva scritto prima della ricarica: il recinto lo rifiutava e non arrivava al
 *   disco, senza che nessuno lo vedesse. Ora si chiede per OGNI evento tardivo: scritto una volta, arrivato una volta a chi ascolta, una
 *   volta nella memoria della voce di adesso, e col numero che aveva (vedi anche `affitto-riga-tardiva.test.mjs`).
 */
for (const forma of ['numerate', 'senza-numero']) {
  for (const tardivi of [1, 2]) {
    const nome = forma === 'numerate' ? 'the other TALOS wrote numbered lines before the reload' : 'the other TALOS wrote a line without a number before the reload';
    test(`VS-0${forma === 'numerate' ? tardivi : tardivi + 2} (${nome}; ${tardivi} late event${tardivi > 1 ? 's' : ''} from the replaced entry): the adopted lines reach who listens now, live and in memory, with numbers above every number given, nothing hidden, nothing twice, nothing moved after the restart`, async (t) => {
      const c = await voceSostituita(t, { primaDellaRicarica: forma, tardivi });
      assert.equal(c.ricaricata, true, 'the reload replaced the entry');
      assert.deepEqual(c.errori, [], 'no unhandled refusal');
      assert.equal(c.paginaAdottateDalVivo, 2, 'both adopted lines reach the page live (the listeners moved to the new entry)');
      assert.equal(c.memoriaAdottate, 2, 'both adopted lines are in the memory of the new entry');
      assert.deepEqual(c.paginaNascoste, [], 'the page (Set of numbers seen) hides nothing');
      assert.deepEqual(c.cliNascoste, [], 'the command line (cursor) hides nothing');
      assert.equal(c.memoriaDoppi, 0, 'no number twice in memory');
      assert.deepEqual(c.numeroCambiatoPagina, [], 'every number shown keeps its line after the restart');
      assert.deepEqual(c.numeroCambiatoMemoria, [], 'every number in memory keeps its line after the restart');
      assert.equal(c.dopoDoppi, 0, 'no number twice after the restart');
      assert.deepEqual(c.rigaPersaDopo, [], 'no line of the other TALOS lost');
      /* gli eventi tardivi che arrivano dopo un'adozione (e tutti, nella forma senza numero) sono scritti col numero che avevano */
      for (const k of c.numeriTardivi.map((_, i) => i)) {
        assert.equal(c.tardiviDopo[k], c.numeriTardivi[k], `late event ${k + 1}: written, and its number (${c.numeriTardivi[k]}) is the same after the restart`);
        assert.equal(c.tardiviDalVivo[k], 1, `late event ${k + 1}: seen once by who listens`);
        assert.equal(c.tardiviInMemoria[k], 1, `late event ${k + 1}: once in the memory of the entry of now`);
      }
    });
  }
}
