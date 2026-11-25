import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio, registraRiga } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { comandoUtenteFinito, comandoUtenteIniziato, eventoPerEsitoTool, toolCallArgs, toolCallStart } from '../src/agui-events.mjs';
import { CARTELLA_AFFITTI } from '../src/session-lease.mjs';

/*
 * 14/11/2026 — QUINTO GIRO DELL'AFFITTO, «la riga tardiva non si perde» (owner 13:10, giudice v1869-v1871). Una ricarica ha sostituito
 *   la voce di una chat (l'altro TALOS ci ha scritto); poi arriva un evento TARDIVO da una chiusura che tiene ancora la voce VECCHIA:
 *   l'`onEvento` del giro (`session-registry.mjs`, `input.onEvento` del giro del modello) o quello del `!` (`broadcast(voce, evento)`).
 *   Prima: l'evento prendeva il numero della voce vecchia, sotto le righe che l'altro aveva scritto prima della ricarica; il recinto lo
 *   rifiutava e la riga non arrivava mai al disco, senza che nessuno la vedesse (giro 4, VS-01: 1 persa su 1; dal vivo, due processi
 *   server veri: 20 perse su 20 corse). Ora la riga si ADOTTA in coda dalla voce di adesso: prende il numero sopra ogni numero già
 *   dato, arriva a chi ascolta e alla memoria, e il diario cresce solo in coda (forma «mai riscrivere» del giro 3).
 *   Casi: (turno) l'evento dopo la ricarica; (durante) l'evento mentre la ricarica è in corso; (comando) il `!` che finisce dopo la
 *   ricarica; (sopra) il numero vecchio è già sopra il disco: prima si scriveva ma nessuno lo vedeva e il giro dopo si scontrava col suo
 *   numero; (trattenuta) la scrittura dell'evento numerato dalla voce vecchia arriva allo store DOPO la ricarica.
 *   Solo cartelle del TEMP (finto, nella coda); mai tolte da qui.
 */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const chiave = (e) => `${e.type}|${e.messageId ?? ''}|${e.runId ?? ''}|${e.toolCallId ?? ''}|${e.comandoId ?? ''}|${e.delta ?? ''}|${e.name ?? ''}|${e.value?.id ?? ''}`;
const giornale = (store, id) => join(store, `${id}.jsonl`);
const righeScritte = (store, id) => readFileSync(giornale(store, id), 'utf8').split('\n').filter(Boolean).map((t) => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
const massimoScritto = (store, id) => Math.max(0, ...righeScritte(store, id).map((r) => r._sequenza).filter(Number.isSafeInteger));
/* l'altro TALOS prende la chat (il file d'affitto di un'altra istanza viva, come `affitto-archivio.test.mjs`) */
const affittoDellAltro = (store, id) => {
  mkdirSync(join(store, CARTELLA_AFFITTI), { recursive: true });
  writeFileSync(join(store, CARTELLA_AFFITTI, `${id}.json`), JSON.stringify({ istanza: '99999999-9999-4999-8999-999999999999', pid: process.pid, host: hostname(), avviatoIl: '2026-11-14T08:00:00.000Z', presoIl: '2026-11-14T08:01:00.000Z', etichetta: 'the other TALOS' }));
};
const scriveAltrove = (store, id, ids) => {
  let n = massimoScritto(store, id);
  appendFileSync(giornale(store, id), ids.map((x) => `${JSON.stringify({ type: 'CUSTOM', name: 'talos.nota-altrove', value: { id: x }, _sequenza: ++n })}\n`).join(''));
};
const doppiDi = (numeri) => numeri.filter((n, i) => numeri.indexOf(n) !== i);

/* il comando `!` finto: gli stessi eventi di `eseguiComandoDiretto` (`agent-service.mjs`), il risultato quando la prova lo libera */
function comandoFinto(stato) {
  return async ({ comando, onEvento }) => {
    const n = (stato.comandi += 1);
    const toolCallId = `cmd-${n}`;
    const comandoId = `cid-${n}`;
    onEvento(comandoUtenteIniziato({ comandoId, comando }));
    onEvento(toolCallStart({ toolCallId, toolCallName: 'shell' }));
    onEvento(toolCallArgs({ toolCallId, delta: JSON.stringify({ comando }) }));
    if (n === 1 && stato.cancello) await stato.cancello;
    const finali = [
      eventoPerEsitoTool({ messageId: `esito-${n}`, toolCallId, content: `fatto ${n}`, stdout: `fatto ${n}`, stderr: '', exitCode: 0 }),
      comandoUtenteFinito({ comandoId, codice: 0, enforcement: 'nessuno' }),
    ];
    for (const e of finali) { stato.tardivi.push(e); onEvento(e); } // segnata prima: il guasto finto la riconosce alla scrittura
    stato.finito?.(n);
    return { ok: true, codice: 0, enforcement: 'nessuno', cartellaFinale: null, comando, testo: `fatto ${n}` };
  };
}

function registroDi(store, stato) {
  return createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'rt' }, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'm', chiave: 'k',
    ...(stato?.eseguiComandoDirettoFn ? { eseguiComandoDirettoFn: stato.eseguiComandoDirettoFn } : {}),
    ...(stato?.registraRigaFn ? { registraRigaFn: stato.registraRigaFn } : {}),
    avviaSessioneFn: async (input) => {
      if (!stato) return { ok: true, esito: { detto: 'x', comeFinita: 'concluso' } };
      while (!stato.sessionId) await pausa(5);
      stato.giri += 1;
      const g = stato.giri;
      stato.onEvento = input.onEvento; // la chiusura del giro resta in mano a chi l'ha avuta
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${g}` });
      input.onEvento({ type: 'TextMessageStart', messageId: `m${g}`, role: 'assistant' });
      await attendiScritture({ cartellaStore: stato.store, sessionId: stato.sessionId });
      for (let i = 0; i < 3; i += 1) {
        /* l'altro scrive DENTRO il primo giro (come VS e REVAFF3-N29): la voce lo adotta e la chat si segna «da ricaricare» appena è ferma */
        if (g === 1 && i === 1 && stato.altroDurante) scriveAltrove(stato.store, stato.sessionId, ['durante-1', 'durante-2']);
        input.onEvento({ type: 'TextMessageContent', messageId: `m${g}`, delta: `g${g}p${i} ` });
        await attendiScritture({ cartellaStore: stato.store, sessionId: stato.sessionId });
      }
      input.onEvento({ type: 'TextMessageEnd', messageId: `m${g}` });
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${g}`, outcome: { type: 'success' }, result: { detto: 'Fatto.' } });
      stato.fineGiro?.(g);
      return { ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'scrivi' }, { role: 'assistant', content: 'Fatto.' }] } };
    },
  });
}

async function rigaTardiva(t, { forma }) {
  const errori = [];
  const suErrore = (e) => { errori.push(`${e?.code ?? ''} ${e?.message ?? e}`.slice(0, 160)); };
  process.on('unhandledRejection', suErrore);
  t.after(() => process.off('unhandledRejection', suErrore));
  const avvisi = [];
  const avvisoOriginale = console.warn;
  console.warn = (...a) => { avvisi.push(a.map(String).join(' ').slice(0, 200)); };
  t.after(() => { console.warn = avvisoOriginale; });
  const store = mkdtempSync(join(tmpdir(), 'rt-'));
  const lavoro = mkdtempSync(join(tmpdir(), 'rtl-'));
  attivaAffittiArchivio(store, { etichetta: 'rt', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const stato = { store, sessionId: null, onEvento: null, giri: 0, comandi: 0, tardivi: [], altroDurante: !forma.startsWith('comando') };
  let fineGiro1;
  const giro1 = new Promise((ok) => { fineGiro1 = ok; });
  stato.fineGiro = (g) => { if (g === 1) fineGiro1(); };
  let liberaComando;
  if (forma.startsWith('comando') || forma.startsWith('due-ricariche')) {
    if (forma.startsWith('comando')) stato.cancello = new Promise((ok) => { liberaComando = ok; });
    stato.eseguiComandoDirettoFn = comandoFinto(stato);
  }
  /* (trattenuta) la scrittura dell'evento tardivo resta in mano alla prova finché la ricarica non è finita */
  let liberaScrittura;
  const scritturaLibera = new Promise((ok) => { liberaScrittura = ok; });
  if (forma.includes('trattenuta') || forma.includes('guasto')) {
    stato.registraRigaFn = async (argomenti, ...resto) => {
      /* (guasto) il disco rifiuta la riga tardiva per un motivo che non è l'altro TALOS */
      if (stato.guasto && (argomenti?.record?.name === 'talos.tardivo' || stato.tardivi.some((e) => argomenti?.record && chiave(e) === chiave(argomenti.record)))) throw Object.assign(new Error('disk failure (injected by the test)'), { code: 'EIO' });
      if (argomenti?.record?.name !== 'talos.tardivo' || !forma.includes('trattenuta')) return registraRiga(argomenti, ...resto);
      await scritturaLibera;
      const esito = await registraRiga(argomenti, ...resto);
      /* la memoria SUBITO dopo l adozione del recinto, prima che l avviso «scritta altrove» faccia rileggere la chat dal disco */
      stato.memoriaSubito = (stato.registro?.esporta(stato.sessionId)?.eventi ?? []).map((e) => chiave(e));
      return esito;
    };
  }
  const registro = registroDi(store, stato);
  stato.registro = registro;
  t.after(() => registro.chiudi({ attesaMassimaMs: 1000 }));
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'scrivi', permessi: 'Full access' });
  const consegne = new Map(); // chiave → quante volte è arrivata a chi ascolta
  const pagina = { visti: new Set(), nascoste: [] };
  const cli = { cursore: 0, nascoste: [] };
  const vistoCol = new Map();
  let avvisiVisibili = 0;
  let noteAltroveDopoIlRilascio = 0; // «un altro TALOS ha scritto qui» dopo che la scrittura trattenuta è arrivata allo store
  registro.iscriviti(sessionId, (e) => {
    if (e?.type === 'RunError' && e.messageChiave === 'server.sessionPersistence.lateLineNotSaved') avvisiVisibili += 1;
    if (e?.type === 'CUSTOM' && e.name === 'talos.riga-in-attesa' && e.value?.messageChiave === 'server.sessionPersistence.lateLineWaiting') avvisiVisibili += 1; // settimo giro: nota informativa
    if (e?.name === 'talos.journal-riparato' && stato.rilasciata) noteAltroveDopoIlRilascio += 1;
    if (!Number.isSafeInteger(e._sequenza)) return;
    const c = chiave(e);
    consegne.set(c, (consegne.get(c) ?? 0) + 1);
    if (!vistoCol.has(c)) vistoCol.set(c, e._sequenza);
    if (pagina.visti.has(e._sequenza)) pagina.nascoste.push(c); else pagina.visti.add(e._sequenza);
    if (e._sequenza <= cli.cursore) cli.nascoste.push(c); else cli.cursore = e._sequenza;
  }, 0);
  stato.sessionId = sessionId;
  await giro1;
  await registro.attendiAssestamento(sessionId);
  await attendiScritture({ cartellaStore: store, sessionId });
  const tardivi = [];
  const emetti = (id) => { const e = { type: 'CUSTOM', name: 'talos.tardivo', value: { id } }; tardivi.push(e); return stato.onEvento(e); };
  let allineata = null;
  let durante = null;
  let secondaRicarica = null; // (due-ricariche) la seconda ricarica sostituisce davvero la voce
  if (forma === 'turno') {
    scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
    allineata = await registro.allineaSessione(sessionId);
    scriveAltrove(store, sessionId, ['dopo-1', 'dopo-2']);
    await emetti('tardivo-1');
  } else if (forma.startsWith('durante')) {
    scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
    const inCorso = registro.allineaSessione(sessionId);
    /* la ricarica toglie la voce e la rimette dopo la lettura: l'evento arriva in mezzo */
    for (let i = 0; i < 200000 && registro.esiste(sessionId); i += 1) await Promise.resolve();
    durante = registro.esiste(sessionId) === false;
    const scritta = emetti('tardivo-1');
    allineata = await inCorso;
    if (forma !== 'durante-trattenuta-sola') scriveAltrove(store, sessionId, ['dopo-1', 'dopo-2']);
    /* (durante-trattenuta) la scrittura arriva allo store solo dopo la lettura della ricarica: se l'evento avesse preso il numero della voce
       vecchia, quel numero l'avrebbe già una riga dell'altro letta dalla ricarica */
    stato.rilasciata = true;
    liberaScrittura();
    await scritta;
  } else if (forma.startsWith('due-ricariche')) {
    scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
    allineata = await registro.allineaSessione(sessionId); // prima ricarica
    scriveAltrove(store, sessionId, ['mezzo-1', 'mezzo-2']);
    let finito1;
    const comando1 = new Promise((ok) => { finito1 = ok; });
    stato.finito = (n) => { if (n === 1) finito1(); };
    /* un `!` (ora sulla voce della prima ricarica): la sua prima riga trova la coda dell'altro, e la chat si ricarica una seconda volta */
    assert.equal(registro.shell(sessionId, 'echo corto').erroreAvvio, undefined, 'the ! starts');
    await comando1;
    await attendiScritture({ cartellaStore: store, sessionId });
    for (let i = 0; i < 200 && !(registro.esiste(sessionId) && registro.esporta(sessionId)?.eventi?.some((e) => e.value?.id === 'mezzo-1')); i += 1) await pausa(5);
    secondaRicarica = (await registro.allineaSessione(sessionId))?.ricaricata === true; // la coda dell'altro adottata dal `!` chiede di rileggere
    scriveAltrove(store, sessionId, ['dopo-1', 'dopo-2']);
    await emetti('tardivo-1'); // dalla chiusura del giro: la voce di DUE ricariche fa
    if (forma === 'due-ricariche-2') await emetti('tardivo-2');
  } else if (forma === 'comando' || forma === 'comando-tenuta' || forma === 'comando-guasto') {
    let finito2;
    const comando2 = new Promise((ok) => { finito2 = ok; });
    stato.finito = (n) => { if (n === 2) finito2(); };
    assert.equal(registro.shell(sessionId, 'npm run lungo').erroreAvvio, undefined, 'the long ! starts');
    await attendiScritture({ cartellaStore: store, sessionId });
    scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
    /* un secondo `!`: la sua prima riga trova la coda dell'altro, la adotta, e la chat (ferma: il giro è finito) si ricarica */
    assert.equal(registro.shell(sessionId, 'echo corto').erroreAvvio, undefined, 'the short ! starts');
    await comando2;
    await attendiScritture({ cartellaStore: store, sessionId });
    for (let i = 0; i < 100 && !registro.esporta(sessionId)?.eventi?.some((e) => e.value?.id === 'prima-1'); i += 1) await pausa(10);
    allineata = { ricaricata: true };
    if (forma === 'comando') scriveAltrove(store, sessionId, ['dopo-1', 'dopo-2']);
    else if (forma === 'comando-guasto') stato.guasto = true; // (comando-guasto) il disco rifiuta le righe finali del `!`
    else affittoDellAltro(store, sessionId); // (comando-tenuta) l'altro tiene la chat quando il `!` finisce
    liberaComando();
    for (let i = 0; i < 200 && stato.tardivi.length < 4; i += 1) await pausa(5);
  } else if (forma === 'sopra') {
    allineata = await registro.allineaSessione(sessionId); // la voce aveva adottato le righe dell'altro: la ricarica le rilegge
    await emetti('tardivo-1');
    await attendiScritture({ cartellaStore: store, sessionId });
    assert.equal(registro.resume(sessionId, 'ancora').erroreAvvio, undefined, 'turn 2 starts');
    for (let i = 0; i < 200 && stato.giri < 2; i += 1) await pausa(5);
    await registro.attendiAssestamento(sessionId);
  } else if (forma === 'tenuta' || forma === 'guasto') {
    scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
    allineata = await registro.allineaSessione(sessionId);
    if (forma === 'tenuta') affittoDellAltro(store, sessionId); // l'altro TALOS tiene la chat proprio quando arrivano gli eventi tardivi
    else stato.guasto = true; // (guasto) il disco rifiuta le righe tardive
    await emetti('tardivo-1');
    await emetti('tardivo-2');
  } else if (forma === 'trattenuta' || forma === 'trattenuta-sola' || forma === 'trattenuta-due') {
    scriveAltrove(store, sessionId, ['prima-1', 'prima-2', 'prima-3']);
    const scritte = [emetti('tardivo-1')];
    if (forma === 'trattenuta-due') scritte.push(emetti('tardivo-2')); // (trattenuta-due) due righe numerate dalla voce vecchia, tutte e due in volo
    allineata = await registro.allineaSessione(sessionId);
    /* (trattenuta-sola) nessuna riga dell'altro dopo la ricarica: il recinto rifiuta solo per il numero già usato */
    if (forma !== 'trattenuta-sola') scriveAltrove(store, sessionId, ['dopo-1', 'dopo-2']);
    stato.rilasciata = true;
    liberaScrittura();
    await Promise.all(scritte);
    if (forma === 'trattenuta-due' || forma === 'trattenuta') {
      /* (trattenuta, trattenuta-due) un secondo giro dopo l'adozione: i suoi numeri vengono dalla voce di adesso, sopra le righe tardive adottate */
      await attendiScritture({ cartellaStore: store, sessionId });
      for (let i = 0; i < 400 && !registro.esiste(sessionId); i += 1) await pausa(5);
      assert.equal(registro.resume(sessionId, 'ancora').erroreAvvio, undefined, 'turn 2 starts');
      for (let i = 0; i < 200 && stato.giri < 2; i += 1) await pausa(5);
      await registro.attendiAssestamento(sessionId);
    }
  }
  await pausa(20); // il `setImmediate` dell'avviso
  await attendiScritture({ cartellaStore: store, sessionId });
  await registro.attendiAssestamento(sessionId).catch(() => {});
  await attendiScritture({ cartellaStore: store, sessionId });
  for (let i = 0; i < 400 && !registro.esiste(sessionId); i += 1) await pausa(5); // una ricarica in volo (l avviso «scritta altrove») toglie la voce per un attimo
  /* chi si ricollega col suo ultimo numero (la pagina dopo uno schermo spento, la CLI): ritrova ciò che dal vivo aveva nascosto */
  const riaggancio = new Set();
  registro.iscriviti(sessionId, (e) => { if (Number.isSafeInteger(e._sequenza)) riaggancio.add(chiave(e)); }, cli.cursore);
  const nostre = forma === 'comando' ? stato.tardivi : forma === 'comando-tenuta' || forma === 'comando-guasto' ? stato.tardivi.slice(-2) : tardivi; // (comando-tenuta) le due righe finali del primo `!`, le tardive
  const memoria = (registro.esporta(sessionId)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza));
  const inMemoria = new Map();
  for (const e of memoria) inMemoria.set(chiave(e), (inMemoria.get(chiave(e)) ?? 0) + 1);
  const numeriInMemoria = new Map(memoria.map((e) => [chiave(e), e._sequenza]));
  const scritte = righeScritte(store, sessionId).filter((r) => typeof r.type === 'string');
  const sulDisco = new Map();
  for (const r of scritte) sulDisco.set(chiave(r), (sulDisco.get(chiave(r)) ?? 0) + 1);
  await registro.chiudi({ attesaMassimaMs: 1000 });
  const nuovo = registroDi(store, null);
  t.after(() => nuovo.chiudi({ attesaMassimaMs: 1000 }));
  await nuovo.ripristina();
  const dopo = (nuovo.esporta(sessionId)?.eventi ?? []).filter((e) => Number.isSafeInteger(e._sequenza));
  const dopoPerChiave = new Map(dopo.map((e) => [chiave(e), e._sequenza]));
  const conti = {
    forma, ricaricata: allineata?.ricaricata === true, durante, secondaRicarica, errori, avvisi: avvisi.filter((a) => /late line|riga tardiva/u.test(a)), avvisiVisibili,
    tardiviSulDisco: nostre.map((e) => sulDisco.get(chiave(e)) ?? 0),
    tardiviDalVivo: nostre.map((e) => consegne.get(chiave(e)) ?? 0),
    tardiviInMemoria: nostre.map((e) => inMemoria.get(chiave(e)) ?? 0),
    tardiviNumeroMemoriaDopo: nostre.map((e) => [numeriInMemoria.get(chiave(e)) ?? null, dopoPerChiave.get(chiave(e)) ?? null]),
    tardiviNumeroVistoDopo: nostre.map((e) => [vistoCol.get(chiave(e)) ?? null, dopoPerChiave.get(chiave(e)) ?? null]),
    tardiviGrezzoMemoria: nostre.map((e) => [numeriInMemoria.get(chiave(e)) ?? null, scritte.find((r) => chiave(r) === chiave(e))?._sequenza ?? null]), // il numero SCRITTO nella riga
    paginaNascoste: pagina.nascoste, cliNascoste: cli.nascoste,
    nascosteNonRitrovate: [...new Set(pagina.nascoste)].filter((c) => !riaggancio.has(c)),
    tardiviRiagganciati: nostre.filter((e) => riaggancio.has(chiave(e))).length,
    memoriaDoppi: doppiDi(memoria.map((e) => e._sequenza)).length,
    dopoDoppi: doppiDi(dopo.map((e) => e._sequenza)).length,
    righeDoppieSulDisco: [...sulDisco].filter(([, n]) => n > 1).map(([c]) => c),
    /* le righe dell altro che il recinto adotta per la riga tardiva: a chi ascolta una volta, e nella memoria della voce di adesso subito */
    noteAltroveDopoIlRilascio,
    altroDopoDalVivo: ['dopo-1', 'dopo-2'].map((x) => [...consegne].filter(([c]) => c.endsWith(`|talos.nota-altrove|${x}`)).reduce((n, [, k]) => n + k, 0)),
    altroDopoInMemoriaSubito: stato.memoriaSubito ? ['dopo-1', 'dopo-2'].map((x) => stato.memoriaSubito.filter((c) => c.endsWith(`|talos.nota-altrove|${x}`)).length) : null,
    altroPerso: ['prima-1', 'prima-2', 'prima-3', 'mezzo-1', 'mezzo-2', 'dopo-1', 'dopo-2', 'durante-1', 'durante-2'].filter((x) => scritte.some((r) => r.value?.id === x) && !dopo.some((e) => e.value?.id === x)),
    giro2SulDisco: ['sopra', 'trattenuta', 'trattenuta-due'].includes(forma) ? [['RunStarted', 'runId', 'r2'], ['TextMessageEnd', 'messageId', 'm2'], ['RunFinished', 'runId', 'r2']].map(([tipo, campo, valore]) => scritte.some((r) => r.type === tipo && r[campo] === valore)) : null,
    giro2Numeri: ['sopra', 'trattenuta', 'trattenuta-due'].includes(forma) ? scritte.filter((r) => r.runId === 'r2' || r.messageId === 'm2').map((r) => dopoPerChiave.get(chiave(r)) ?? null) : null,
    giro2VistoDopo: forma === 'trattenuta' || forma === 'trattenuta-due' ? scritte.filter((r) => r.runId === 'r2' || r.messageId === 'm2').map((r) => [vistoCol.get(chiave(r)) ?? null, dopoPerChiave.get(chiave(r)) ?? null]) : null,
  };
  t.diagnostic(`CONTI ${JSON.stringify(conti)}`);
  return conti;
}

const comuni = (c, { visteUnaVolta = true, numeroVistoTiene = true } = {}) => {
  assert.equal(c.ricaricata, true, 'the reload replaced the entry');
  assert.deepEqual(c.errori, [], 'no unhandled refusal');
  assert.ok(c.tardiviSulDisco.length > 0, 'late events were emitted');
  assert.deepEqual(c.tardiviSulDisco, c.tardiviSulDisco.map(() => 1), 'every late line reaches the disk, once');
  assert.deepEqual(c.tardiviInMemoria, c.tardiviInMemoria.map(() => 1), 'every late line is in the memory of the entry of now, once');
  if (visteUnaVolta) assert.deepEqual(c.tardiviDalVivo, c.tardiviDalVivo.map(() => 1), 'every late line reaches who listens, once');
  for (const [m, d] of c.tardiviNumeroMemoriaDopo) assert.equal(d, m, 'the late line keeps its number in memory after the restart');
  if (numeroVistoTiene) for (const [v, d] of c.tardiviNumeroVistoDopo) assert.equal(d, v, 'the number shown for the late line is the same after the restart');
  for (const [m, g] of c.tardiviGrezzoMemoria) assert.equal(g, m, 'the late line is written with the number it has in memory (a reader of before sees the same number)');
  assert.equal(c.memoriaDoppi, 0, 'no number twice in memory');
  assert.equal(c.dopoDoppi, 0, 'no number twice after the restart');
  assert.deepEqual(c.righeDoppieSulDisco, [], 'no line written twice');
  assert.deepEqual(c.altroPerso, [], 'no line of the other TALOS lost');
};

test('RT-01 (turn closure, the late event after the reload; VS-01 made explicit): the late line reaches the disk and is seen once, with a number above every number given', async (t) => {
  const c = await rigaTardiva(t, { forma: 'turno' });
  comuni(c);
  assert.deepEqual(c.paginaNascoste, [], 'the page (Set of numbers seen) hides nothing');
  assert.deepEqual(c.cliNascoste, [], 'the command line (cursor) hides nothing');
});

test('RT-02 (turn closure, the late event WHILE the reload reads the disk): it waits for the entry of now, reaches the disk and is seen once', async (t) => {
  const c = await rigaTardiva(t, { forma: 'durante' });
  assert.equal(c.durante, true, 'the late event was emitted while the entry was out for the reload');
  comuni(c);
  assert.deepEqual(c.paginaNascoste, [], 'the page hides nothing');
  assert.deepEqual(c.cliNascoste, [], 'the command line hides nothing');
});

test('RT-03 (direct command `!` that ends after a reload caused by the other TALOS): its result and its end reach the disk and are seen once', async (t) => {
  const c = await rigaTardiva(t, { forma: 'comando' });
  comuni(c);
  assert.deepEqual(c.paginaNascoste, [], 'the page hides nothing');
  assert.deepEqual(c.cliNascoste, [], 'the command line hides nothing');
});

test('RT-04 (the old number is already above the disk): the late line is seen and in memory, and the next turn does not collide with it', async (t) => {
  const c = await rigaTardiva(t, { forma: 'sopra' });
  comuni(c);
  assert.deepEqual(c.giro2SulDisco, [true, true, true], 'the next turn is written whole (start, end of message, end of turn)');
  assert.ok(c.giro2Numeri.length >= 6 && c.giro2Numeri.every((n) => n !== null), 'every line of the next turn is read back after the restart');
  assert.deepEqual(c.paginaNascoste, [], 'the page hides nothing');
  assert.deepEqual(c.cliNascoste, [], 'the command line hides nothing');
});

test('RT-05 (the write of a line numbered by the old entry reaches the store after the reload): the line is adopted at the end with a new number, never dropped, never twice', async (t) => {
  const c = await rigaTardiva(t, { forma: 'trattenuta' });
  /* chi ascoltava l'aveva già vista col numero vecchio, prima della ricarica: non si rimanda (sarebbe due volte); il numero nuovo vale in
     memoria, sul disco e dopo il riavvio, e chi si ricollega col numero vecchio lo ritrova (`rinumerate`) */
  comuni(c, { numeroVistoTiene: false });
  assert.equal(c.avvisi.length, 1, 'one line in the server log says the late line was adopted');
  assert.deepEqual(c.altroDopoDalVivo, [1, 1], 'the lines of the other adopted by the fence reach who listens, once');
  assert.deepEqual(c.altroDopoInMemoriaSubito, [1, 1], 'they are in the memory of the entry of now right after the write, before any reload');
  assert.ok(c.noteAltroveDopoIlRilascio <= 1, 'the note "another TALOS wrote here" is given once per turn at most (turn 1 already had it)');
  assert.deepEqual(c.giro2SulDisco, [true, true, true], 'the next turn is written whole (start, end of message, end of turn)');
  assert.ok(c.giro2VistoDopo.length >= 6 && c.giro2VistoDopo.every(([v, d]) => v !== null && v === d), 'every line of the next turn keeps after the restart the number it was shown with');
  assert.ok(c.giro2VistoDopo.every(([v]) => v > c.tardiviNumeroMemoriaDopo[0][0]), 'the next turn is numbered above the late line adopted');
  /* limite dichiarato: la ricarica ha letto dal disco una riga dell'altro col numero che la pagina aveva già dato alla riga tardiva, e
     dal vivo la pagina la nasconde; chi si ricollega col suo ultimo numero la ritrova, e la riga tardiva non torna una seconda volta */
  assert.deepEqual(c.nascosteNonRitrovate, [], 'a reconnect from the last number seen brings back every line hidden live');
  assert.equal(c.tardiviRiagganciati, 0, 'the reconnect does not send the late line again (seen with its old number)');
});

test('RT-13 (two late lines numbered by the old entry, both writes reach the store after the reload, the other TALOS wrote after it): both adopted at the end, in order, once; the lines of the other reach who listens and the memory of now at once', async (t) => {
  const c = await rigaTardiva(t, { forma: 'trattenuta-due' });
  comuni(c, { numeroVistoTiene: false });
  assert.equal(c.tardiviSulDisco.length, 2, 'two late lines');
  assert.ok(c.tardiviNumeroMemoriaDopo[1][0] > c.tardiviNumeroMemoriaDopo[0][0], 'the second late line comes after the first');
  assert.deepEqual(c.altroDopoDalVivo, [1, 1], 'the lines of the other adopted by the fence reach who listens, once');
  assert.deepEqual(c.altroDopoInMemoriaSubito, [1, 1], 'they are in the memory of the entry of now right after the write, before any reload');
  assert.ok(c.noteAltroveDopoIlRilascio <= 1, 'the note "another TALOS wrote here" is given once per turn at most (turn 1 already had it)');
  assert.equal(c.avvisi.length, 2, 'one line in the server log for each late line adopted');
  assert.deepEqual(c.giro2SulDisco, [true, true, true], 'the next turn is written whole (start, end of message, end of turn)');
  assert.ok(c.giro2VistoDopo.length >= 6 && c.giro2VistoDopo.every(([v, d]) => v !== null && v === d), 'every line of the next turn keeps after the restart the number it was shown with');
  assert.ok(c.giro2VistoDopo.every(([v]) => v > c.tardiviNumeroMemoriaDopo[1][0]), 'the next turn is numbered above the late lines adopted');
  assert.deepEqual(c.nascosteNonRitrovate, [], 'a reconnect from the last number seen brings back every line hidden live');
});

test('RT-06 (as RT-05, and the other TALOS writes nothing after the reload: the fence refuses only for the number already used): adopted at the end, never dropped, never twice', async (t) => {
  const c = await rigaTardiva(t, { forma: 'trattenuta-sola' });
  comuni(c, { numeroVistoTiene: false });
  assert.equal(c.avvisi.length, 1, 'one line in the server log says the late line was adopted');
  assert.deepEqual(c.nascosteNonRitrovate, [], 'a reconnect from the last number seen brings back every line hidden live');
  assert.equal(c.tardiviRiagganciati, 0, 'the reconnect does not send the late line again (seen with its old number)');
});

/* Se proprio non si può adottare subito: dal vivo (caso a2 dopo la cura del giro 5, 2 corse su 20) la riga tardiva arrivava mentre l'altro
   TALOS teneva ancora la chat, e lo store la rifiutava (`SESSION_LEASED`). Sesto giro (giudice v1888): la riga va nel file di attesa e
   NON si mostra con un numero che il disco non ha (l'altro lo prenderebbe); la nota «in attesa» è visibile, una per riga. L'adozione
   quando la chat si libera la provano `affitto-attesa-su-disco.test.mjs` (qui l'altro tiene la chat fino alla fine). */
test('RT-07 (the other TALOS holds the chat when two late events arrive): never silent, the lines wait on the disk without a number, one visible waiting note and one log line for each', async (t) => {
  const c = await rigaTardiva(t, { forma: 'tenuta' });
  assert.equal(c.ricaricata, true, 'the reload replaced the entry');
  assert.deepEqual(c.errori, [], 'no unhandled refusal');
  assert.deepEqual(c.tardiviDalVivo, [0, 0], 'no number shown for a line the disk does not have');
  assert.deepEqual(c.tardiviInMemoria, [0, 0], 'not in the memory of the chat until the disk has it');
  assert.deepEqual(c.tardiviSulDisco, [0, 0], 'the journal does not have them yet: the other TALOS holds the chat (this is what the note says)');
  assert.equal(c.avvisiVisibili, 2, 'one visible waiting note for each waiting line');
  assert.equal(c.avvisi.filter((a) => /late line waiting/u.test(a)).length, 2, 'one line in the server log for each waiting line');
  assert.equal(c.memoriaDoppi, 0, 'no number twice in memory');
});

test('RT-08 (a direct command `!` ends while the other TALOS holds the chat, after a reload): its result and its end wait on the disk without a number, with a visible waiting note for each', async (t) => {
  const c = await rigaTardiva(t, { forma: 'comando-tenuta' });
  assert.deepEqual(c.errori, [], 'no unhandled refusal');
  assert.deepEqual(c.tardiviDalVivo, [0, 0], 'no number shown for a line the disk does not have');
  assert.deepEqual(c.tardiviInMemoria, [0, 0], 'not in the memory of the chat until the disk has it');
  assert.deepEqual(c.tardiviSulDisco, [0, 0], 'the journal does not have them yet: the other TALOS holds the chat (this is what the note says)');
  assert.equal(c.avvisiVisibili, 2, 'one visible waiting note for each waiting line');
  assert.equal(c.avvisi.filter((a) => /late line waiting/u.test(a)).length, 2, 'one line in the server log for each waiting line');
});

test('RT-14 (two late lines refused by a disk failure, not by the other TALOS): no note saying the chat is open in another window, which would be false', async (t) => {
  const c = await rigaTardiva(t, { forma: 'guasto' });
  assert.equal(c.ricaricata, true, 'the reload replaced the entry');
  assert.deepEqual(c.errori, [], 'no unhandled refusal');
  assert.deepEqual(c.tardiviDalVivo, [1, 1], 'both late lines reach who listens, once');
  assert.deepEqual(c.tardiviSulDisco, [0, 0], 'the disk refused them');
  assert.equal(c.avvisiVisibili, 0, 'no note about another TALOS window');
  assert.equal(c.avvisi.filter((a) => /NOT saved|late line waiting/u.test(a)).length, 0, 'no log line about another TALOS process');
});

test('RT-15 (the end of a direct command `!` refused by a disk failure, after a reload): no note saying the chat is open in another window', async (t) => {
  const c = await rigaTardiva(t, { forma: 'comando-guasto' });
  assert.deepEqual(c.errori, [], 'no unhandled refusal');
  assert.deepEqual(c.tardiviDalVivo, [1, 1], 'the result and the end of the command reach who listens, once');
  assert.deepEqual(c.tardiviSulDisco, [0, 0], 'the disk refused them');
  assert.equal(c.avvisiVisibili, 0, 'no note about another TALOS window');
  assert.equal(c.avvisi.filter((a) => /NOT saved|late line waiting/u.test(a)).length, 0, 'no log line about another TALOS process');
});

test('RT-09 (the late event while the reload reads the disk, and its write reaches the store only after the reading): it waits for the entry of now, takes its number from it, is written once and seen once with that number', async (t) => {
  const c = await rigaTardiva(t, { forma: 'durante-trattenuta' });
  assert.equal(c.durante, true, 'the late event was emitted while the entry was out for the reload');
  comuni(c);
  assert.deepEqual(c.paginaNascoste, [], 'the page hides nothing');
  assert.deepEqual(c.avvisi, [], 'no adoption by the fence was needed: the number came from the entry of now');
});

test('RT-10 (as RT-09, and the other TALOS writes nothing after the reload): the late line keeps the number it was shown with', async (t) => {
  const c = await rigaTardiva(t, { forma: 'durante-trattenuta-sola' });
  assert.equal(c.durante, true, 'the late event was emitted while the entry was out for the reload');
  comuni(c);
  assert.deepEqual(c.paginaNascoste, [], 'the page hides nothing');
  assert.deepEqual(c.avvisi, [], 'no adoption by the fence was needed');
});

test('RT-11 (two reloads after the turn, then the late event from the turn closure): it reaches the entry of now, two replacements away', async (t) => {
  const c = await rigaTardiva(t, { forma: 'due-ricariche' });
  assert.equal(c.secondaRicarica, true, 'the second reload replaced the entry again');
  comuni(c);
  assert.deepEqual(c.paginaNascoste, [], 'the page hides nothing');
  assert.deepEqual(c.cliNascoste, [], 'the command line hides nothing');
});

test('RT-12 (as RT-11, with two late events): both reach the entry of now, in order, once', async (t) => {
  const c = await rigaTardiva(t, { forma: 'due-ricariche-2' });
  assert.equal(c.secondaRicarica, true, 'the second reload replaced the entry again');
  comuni(c);
  assert.ok(c.tardiviNumeroMemoriaDopo[1][0] > c.tardiviNumeroMemoriaDopo[0][0], 'the second late line comes after the first');
  assert.deepEqual(c.paginaNascoste, [], 'the page hides nothing');
});
