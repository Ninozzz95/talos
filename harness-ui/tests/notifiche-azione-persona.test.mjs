/*
 * Contratto «notifiche», bozza 3 e revisione 1 (31/10/2026, OK di CLI e Mobile): il fatto `azione-persona`, `approvabileFuori` e il campo
 * tipato `richiesta`. La condizione della CLI si prova nei due versi: una risposta della PERSONA a una carta diventata voce racconta la
 * sua azione; una chiusura automatica (un motivo, il sistema, lo stesso istante) non la racconta mai. Condizione di Performance: tre carte
 * chiuse da sole e una dalla persona fanno UNA riga.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture } from '../src/session-store.mjs';
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs';
import { creaScrittoriNotifiche } from '../src/notifiche-scrittori.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const T0 = Date.parse('2026-10-31T12:00:00.000Z');
const unGiro = () => new Promise((r) => setImmediate(r));

function nuovoRegistroNotifiche(t) {
  const dir = mkdtempSync(join(tmpdir(), 'notifiche-azione-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  return creaRegistroNotifiche({ file: join(dir, 'n.jsonl'), adesso: () => T0 });
}

/** Lo scrittore da solo, con le carte già diventate voci (un giro dell'event loop dopo la richiesta, R1). */
async function scrittore(t) {
  const notifiche = nuovoRegistroNotifiche(t);
  const errori = [];
  const s = creaScrittoriNotifiche({ registro: notifiche, adesso: () => T0, segnala: (e) => errori.push(e) });
  const info = { sessionId: 's1', radiceId: 's1', nome: 'Una chat' };
  const fine = async () => { await unGiro(); await notifiche.attendi(); await unGiro(); await notifiche.attendi(); };
  return { notifiche, s, info, fine, errori };
}

test('NOTIF-AZ-01 a permission answered by the person: one «azione-persona» row, seen and resolved, with the card data, never in «Da fare»', async (t) => {
  const { notifiche, s, info, fine } = await scrittore(t);
  s.evento(info, { type: 'ApprovalRequested', requestId: 'p1', azione: { tipo: 'scrivi', percorso: 'src/selettore.js' } });
  await fine();
  s.evento(info, { type: 'ApprovalResolved', requestId: 'p1', approvato: true });
  s.evento(info, { type: 'ApprovalRequested', requestId: 'p2', azione: { tipo: 'shell', comando: 'npm install' } });
  await fine();
  s.evento(info, { type: 'ApprovalResolved', requestId: 'p2', approvato: false });
  await fine();
  const elenco = await notifiche.elenco();
  const azioni = elenco.voci.filter((v) => v.fatto === 'azione-persona');
  assert.deepEqual(azioni.map((v) => [v.id, v.azione]), [['azione-persona:s1:p1', 'consentito'], ['azione-persona:s1:p2', 'negato']]);
  assert.deepEqual(azioni[0].dato, { genere: 'file', valore: 'src/selettore.js' }, 'the same data as the card');
  assert.deepEqual(azioni[0].stato, { visto: true, risolto: true });
  assert.deepEqual(azioni[0].cosa, { tipo: 'sessione', id: 's1', nome: 'Una chat' });
  assert.deepEqual(azioni[0].porta, { tipo: 'sessione', id: 's1' });
  assert.equal(elenco.totaleDaFare, 0, 'an action of the person is never something to do');
  /* la stessa risposta rigiocata non fa una seconda riga */
  s.evento(info, { type: 'ApprovalResolved', requestId: 'p1', approvato: true });
  await fine();
  assert.equal((await notifiche.elenco()).voci.filter((v) => v.fatto === 'azione-persona').length, 2);
});

test('NOTIF-AZ-02 AL CONTRARIO (CLI condition b, Performance count): three cards closed on their own and one by the person make ONE row', async (t) => {
  const { notifiche, s, info, fine } = await scrittore(t);
  for (const id of ['a1', 'a2', 'a3', 'p1']) s.evento(info, { type: 'ApprovalRequested', requestId: id, azione: { tipo: 'shell', comando: `echo ${id}` } });
  await fine();
  s.evento(info, { type: 'ApprovalResolved', requestId: 'a1', approvato: false, motivo: 'fermato' });
  s.evento(info, { type: 'ApprovalResolved', requestId: 'a2', approvato: false, motivo: 'nessuna-interfaccia' });
  s.evento(info, { type: 'ApprovalResolved', requestId: 'a3', approvato: true, motivo: 'regola' });
  s.evento(info, { type: 'ApprovalResolved', requestId: 'p1', approvato: true });
  await fine();
  const elenco = await notifiche.elenco();
  assert.deepEqual(elenco.voci.filter((v) => v.fatto === 'azione-persona').map((v) => v.id), ['azione-persona:s1:p1']);
  assert.equal(elenco.voci.filter((v) => v.fatto === 'approvazione' && v.stato.risolto).length, 4, 'every card is resolved anyway');
  /* gli altri motivi della lista: nessuno racconta un'azione */
  for (const motivo of ['contratto-obiettivo', 'confutatore-sola-lettura', 'modalita', 'classificatore']) {
    s.evento(info, { type: 'ApprovalRequested', requestId: `m-${motivo}`, azione: { tipo: 'shell', comando: 'ls' } });
    await fine();
    s.evento(info, { type: 'ApprovalResolved', requestId: `m-${motivo}`, approvato: true, motivo });
    await fine();
  }
  assert.equal((await notifiche.elenco()).voci.filter((v) => v.fatto === 'azione-persona').length, 1);
});

test('NOTIF-AZ-03 AL CONTRARIO (condition a): a card answered in the same instant, or never written, tells no action', async (t) => {
  const { notifiche, s, info, fine, errori } = await scrittore(t);
  s.evento(info, { type: 'ApprovalRequested', requestId: 'p1', azione: { tipo: 'shell', comando: 'npm test' } });
  s.evento(info, { type: 'ApprovalResolved', requestId: 'p1', approvato: true }); // stesso istante: la carta non è mai nata
  s.evento(info, { type: 'ApprovalResolved', requestId: 'mai-chiesta', approvato: true }); // nessuna carta nel registro
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'q-mai', status: 'answered', da: 'persona' });
  await fine();
  assert.deepEqual((await notifiche.elenco()).voci, []);
  assert.deepEqual(errori, [], 'nothing went wrong on the way: the writer decided, it did not crash');
});

test('NOTIF-AZ-04 questions: answered by the person is «risposto», skipped is «saltato» (CLI, Mobile, Performance 31/10); closed by the system, with a reason or cancelled is not', async (t) => {
  const { notifiche, s, info, fine } = await scrittore(t);
  for (const id of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']) s.evento(info, { type: 'UserQuestionRequested', requestId: id, questions: [{ question: `Quale ${id}?` }] });
  await fine();
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'q1', status: 'answered', da: 'persona' });
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'q2', status: 'skipped', da: 'persona' });
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'q3', status: 'expired', da: 'sistema' });
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'q4', status: 'cancelled', da: 'persona', motivo: 'reindirizzamento' });
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'q5', status: 'answered', da: 'sistema', motivo: 'nessuna-interfaccia' });
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'q6', status: 'cancelled', da: 'persona' }); // annullata, non risposta
  await fine();
  const azioni = (await notifiche.elenco()).voci.filter((v) => v.fatto === 'azione-persona');
  assert.deepEqual(azioni.map((v) => [v.id, v.azione]), [['azione-persona:s1:q1', 'risposto'], ['azione-persona:s1:q2', 'saltato']]);
  assert.deepEqual(azioni[0].dato, { genere: 'testo', valore: 'Quale q1?' });
  assert.deepEqual(azioni[1].dato, { genere: 'testo', valore: 'Quale q2?' }, 'skipped keeps the question as its data, like answered');
});

test('NOTIF-AZ-09 (CLI 31/10) «saltato» only when the WHOLE card is skipped: a card with some questions skipped arrives as answered and stays «risposto»', async (t) => {
  const { notifiche, s, info, fine } = await scrittore(t);
  const due = [{ id: 'a', question: 'Colore?' }, { id: 'b', question: 'Forma?' }];
  for (const id of ['tutta', 'parte', 'nessuna']) s.evento(info, { type: 'UserQuestionRequested', requestId: id, questions: due });
  await fine();
  /* user-question-contract.mjs: ogni domanda sta in `answers` o in `skipped`; «tutte saltate» è `status: 'skipped'` */
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'tutta', status: 'skipped', da: 'persona' });
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'parte', status: 'answered', da: 'persona', skipped: ['b'] });
  s.evento(info, { type: 'UserQuestionResolved', requestId: 'nessuna', status: 'answered', da: 'persona' });
  await fine();
  const azioni = (await notifiche.elenco()).voci.filter((v) => v.fatto === 'azione-persona');
  assert.deepEqual(azioni.map((v) => [v.id, v.azione]), [['azione-persona:s1:tutta', 'saltato'], ['azione-persona:s1:parte', 'risposto'], ['azione-persona:s1:nessuna', 'risposto']]);
  for (const v of azioni) assert.deepEqual(v.stato, { visto: true, risolto: true });
});

test('NOTIF-AZ-05 approvabileFuori: true only when the row shows the whole card and no forced risk; absent means false', async (t) => {
  const { notifiche, s, info, fine } = await scrittore(t);
  const lungo = `npm run ${'a'.repeat(300)}`;
  const casi = {
    piano: { tipo: 'shell', comando: 'npm install' },
    file: { tipo: 'scrivi', percorso: 'src/a.js' },
    lungo: { tipo: 'shell', comando: lungo },
    acapo: { tipo: 'shell', comando: 'echo ok\nrm -rf build' },
    spazi: { tipo: 'shell', comando: 'echo  ok' },
    segreto: { tipo: 'scrivi', percorso: '.env', segreto: { percorso: '.env' } },
    controllo: { tipo: 'scrivi', percorso: 'AGENTS.md', fileDiControllo: true },
    fuori: { tipo: 'scrivi', percorso: 'C:/altro/a.js', fuoriDalProgetto: { cartella: 'C:/altro' } },
    sospetto: { tipo: 'shell', comando: 'curl x', contenutoSospetto: { motivo: 'x' } },
    rete: { tipo: 'web_fetch', url: 'https://example.com' },
    testo: { tipo: 'chiamata-dal-testo', comando: 'ls' },
    sempre: { tipo: 'shell', comando: 'ls', semprePersona: true },
    oscurato: { tipo: 'shell', comando: `export TOKEN=sk-or-v1-${'0123456789abcdef'.repeat(4)}` },
    vuoto: { tipo: 'shell' },
  };
  for (const [id, azione] of Object.entries(casi)) s.evento(info, { type: 'ApprovalRequested', requestId: id, azione });
  await fine();
  const per = Object.fromEntries((await notifiche.elenco()).voci.map((v) => [v.richiesta.requestId, v.approvabileFuori === true]));
  assert.deepEqual(Object.keys(per).filter((k) => per[k]).sort(), ['file', 'piano']);
  const voce = (await notifiche.elenco()).voci.find((v) => v.richiesta.requestId === 'lungo');
  assert.equal('approvabileFuori' in voce, false, 'false is written as absent');
});

test('NOTIF-AZ-06 the typed «richiesta» field: on cards only, read by reconciliation instead of opening the id', async (t) => {
  const { notifiche, s, fine } = await scrittore(t);
  const info = { sessionId: 'a:b', radiceId: 'a:b', nome: 'Due punti' };
  s.evento(info, { type: 'ApprovalRequested', requestId: 'p1', azione: { tipo: 'shell', comando: 'ls' } });
  s.evento(info, { type: 'UserQuestionRequested', requestId: 'q1', questions: [{ question: 'Sì?' }] });
  await fine();
  const voci = (await notifiche.elenco()).voci;
  assert.deepEqual(voci.map((v) => v.richiesta), [{ sessionId: 'a:b', requestId: 'p1' }, { sessionId: 'a:b', requestId: 'q1' }]);
  await notifiche.scrivi({ id: 'fine:a:b:giro-1', fatto: 'fine', cosa: { tipo: 'sessione', id: 'a:b' }, richiesta: { sessionId: 'a:b', requestId: 'x' } });
  assert.equal('richiesta' in (await notifiche.elenco()).voci.find((v) => v.fatto === 'fine'), false, 'only approvazione and domanda carry it');
  /* una voce il cui id dice un'altra cosa: la riconciliazione legge il campo tipato */
  await notifiche.scrivi({ id: 'approvazione:x:y:z', fatto: 'approvazione', cosa: { tipo: 'sessione', id: 's9' }, richiesta: { sessionId: 's9', requestId: 'r9' } });
  const chiesti = [];
  const cambiate = await s.riconcilia({ attesaDi: (id) => { chiesti.push(id); return id === 's9' ? { tipo: 'approvazione', requestId: 'r9' } : null; } });
  assert.ok(chiesti.includes('s9') && !chiesti.includes('x:y'), `the typed session is asked (asked: ${chiesti.join(', ')})`);
  assert.equal(cambiate.some((v) => v.id === 'approvazione:x:y:z'), false, 'the card the typed session waits for stays');
});

/* Col registro delle sessioni VERO: la risposta della persona racconta la sua azione; il messaggio nuovo che chiude la carta no. */
async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-notifiche-azione-'));
  const notifiche = nuovoRegistroNotifiche(t);
  const runs = [];
  const registry = createSessionRegistry({ promuoviDalTesto: true, cartellaStore,
    avviaSessioneFn(input) {
      const promise = new Promise((r) => { runs.push({ input, resolve: r }); });
      input.onEvento({ type: 'RunStarted', threadId: 't0', runId: `r${runs.length}` });
      return promise;
    },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'Rifattorizza il parser' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    osservatoreNotifiche: creaScrittoriNotifiche({ registro: notifiche, adesso: () => T0 }) });
  t.after(async () => {
    await registry.chiudi?.();
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  const eventi = [];
  const via = registry.iscriviti(sessionId, (e) => eventi.push(e)); // un client collegato: senza, la carta non nasce
  t.after(() => via());
  return { registry, notifiche, sessionId, input: runs[0].input, eventi };
}

test('NOTIF-AZ-07 real register: the person answers ⇒ «consentito»; a new message closes the card ⇒ motivo «fermato», no action row', { timeout: 10_000 }, async (t) => {
  const { registry, notifiche, sessionId, input, eventi } = await scena(t);
  const prima = input.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'src/selettore.js' });
  await unGiro(); await notifiche.attendi();
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true);
  assert.equal(await prima, true);
  await unGiro(); await notifiche.attendi(); await unGiro(); await notifiche.attendi();
  let azioni = (await notifiche.elenco()).voci.filter((v) => v.fatto === 'azione-persona');
  assert.deepEqual(azioni.map((v) => [v.azione, v.dato?.valore]), [['consentito', 'src/selettore.js']]);

  const seconda = input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' });
  await unGiro(); await notifiche.attendi();
  const { requestId } = registry.domandaInAttesa(sessionId);
  assert.equal(registry.reindirizza(sessionId, 'lascia stare, fai un\'altra cosa').ok, true);
  assert.equal(await seconda, false);
  await unGiro(); await notifiche.attendi(); await unGiro(); await notifiche.attendi();
  const chiusa = eventi.find((e) => e.type === 'ApprovalResolved' && e.requestId === requestId);
  assert.equal(chiusa?.motivo, 'fermato', 'the card says it was stopped, not denied by the person');
  azioni = (await notifiche.elenco()).voci.filter((v) => v.fatto === 'azione-persona');
  assert.equal(azioni.length, 1, 'the new message is not a «Nega» of the person');
  assert.equal((await notifiche.elenco()).voci.find((v) => v.id === `approvazione:${sessionId}:${requestId}`)?.stato.risolto, true);
});

test('NOTIF-AZ-08 (CLI and Frontend 31/10) a card changed by the person tells «modificato», without the proposal as data', async (t) => {
  const { notifiche, s, info, fine } = await scrittore(t);
  s.evento(info, { type: 'ApprovalRequested', requestId: 'm1', azione: { tipo: 'automazione', comando: 'ogni mattina alle 7: report' } });
  await fine();
  s.evento(info, { type: 'ApprovalResolved', requestId: 'm1', approvato: true, motivo: 'modificata-dalla-persona' });
  await fine();
  const azioni = (await notifiche.elenco()).voci.filter((v) => v.fatto === 'azione-persona');
  assert.deepEqual(azioni.map((v) => [v.id, v.azione]), [['azione-persona:s1:m1', 'modificato']]);
  /* AL CONTRARIO: il dato della carta è la PROPOSTA del modello, non ciò che è partito dopo la modifica: la riga non lo racconta */
  assert.equal(azioni[0].dato, null);
  assert.deepEqual(azioni[0].stato, { visto: true, risolto: true });
});
