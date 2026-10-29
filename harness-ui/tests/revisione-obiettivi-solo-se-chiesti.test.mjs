/*
 * REVISIONE AVVERSARIA di cb0dd9b8b · 857160597 · ad7deb7ed (15/10/2026 sera, bugfixer) — «obiettivi solo se l'host li chiede»,
 * «le frasi del Plan mode dicono solo ciò che i canali offrono», «il ciclo ha la stessa porta dell'attrezzo».
 * «[REGGE]» = attaccato, ha retto. «[ROSSO]» = difetto mostrato.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { talosLavora } from '../src/kernel/talosHarness.mjs';
import { conStore, conversazioneFerma, obiettivoScrittoDaUnAltroProcesso, passo, registroAGiri } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs'; // 28/10: cache, punto 1

const cartellaLibera = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-rev-obiettivi-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const FINE = [{ role: 'system', content: 's' }, { role: 'user', content: 'go on' }, { role: 'assistant', content: 'done' }];

test('OB-REV-01 [CURATO 15/10] — in un host SENZA obiettivi (opzione spenta: la CLI, o un server con TALOS_HARNESS_UI_GOALS=0) un obiettivo NASCE lo stesso dalla porta della persona, e resta «attivo» senza che niente lo porti avanti', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { obiettiviNellaChat: false });
  const id = await conversazioneFerma(b);
  const esito = await b.registro.impostaObiettivo(id, 'make the tests pass');
  /* prima la misura, poi il giudizio: che cosa resta in mano a chi guarda */
  const stato = esito?.obiettivo?.stato ?? null;
  assert.notEqual(esito?.ok, true, `l'host non porta avanti gli obiettivi, ma impostaObiettivo risponde ok e lascia un obiettivo «${stato}» che nessun ciclo e nessun attrezzo toccherà: ${JSON.stringify(esito).slice(0, 200)}`);
}));

test('OB-REV-01b (15/10) — in un host SENZA obiettivi anche RIPRENDERE un obiettivo in pausa scritto da un altro processo si rifiuta (riprenderlo qui non porterebbe avanti niente); AL CONTRARIO un host con gli obiettivi lo riprende', async (t) => conStore(t, async (cartellaStore) => {
  for (const [acceso, atteso] of [[false, false], [true, true]]) {
    const scrittore = registroAGiri(cartellaStore);
    const sessionId = await conversazioneFerma(scrittore);
    await scrittore.registro.chiudi();
    await obiettivoScrittoDaUnAltroProcesso(cartellaStore, sessionId, 'make the tests pass', { stato: 'in-pausa', motivo: { tipo: 'riavvio' } });
    const b = registroAGiri(cartellaStore, { obiettiviNellaChat: acceso });
    await b.registro.ripristina({ soloSessioni: [sessionId], perRicarica: true });
    assert.equal(b.registro.statoObiettivo(sessionId).obiettivo?.stato, 'in-pausa', 'premessa: l obiettivo arriva in pausa');
    const esito = await b.registro.riprendiObiettivo(sessionId);
    assert.equal(esito.ok === true, atteso, `obiettivi ${acceso ? 'accesi' : 'spenti'}: ${JSON.stringify(esito).slice(0, 200)}`);
    if (!atteso) {
      assert.deepEqual([esito.code, esito.reason], ['GOAL_NOT_ALLOWED', 'goal-not-in-this-host']);
      assert.equal(b.registro.statoObiettivo(sessionId).obiettivo.stato, 'in-pausa', 'il rifiuto non tocca niente');
    }
  }
}));

test('OB-REV-02 [CURATO 15/10] — opzione ACCESA ma sessione senza interfaccia (`talos -p`, un’automazione): la porta della persona RIFIUTA l’obiettivo («nessuno davanti»); AL CONTRARIO la stessa sessione con un’interfaccia lo accetta. Il ciclo di un obiettivo scritto altrove: CICLO-NESSUNO-DAVANTI', async (t) => conStore(t, async (cartellaStore) => {
  for (const [senzaInterfaccia, atteso] of [[true, false], [false, true]]) {
    const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
    const avvio = b.registro.avviaLibero({ cartellaLibera: cartellaLibera(t), consegna: 'riassumi il README', ...(senzaInterfaccia ? { senzaInterfaccia: true } : {}) });
    assert.ok(avvio.sessionId, JSON.stringify(avvio));
    await passo();
    b.giri.at(-1).concludi(FINE);
    await passo();
    const esito = await b.registro.impostaObiettivo(avvio.sessionId, 'make the tests pass');
    assert.equal(esito.ok === true, atteso, `senzaInterfaccia=${senzaInterfaccia}: ${JSON.stringify(esito).slice(0, 200)}`);
    if (!atteso) assert.deepEqual([esito.code, esito.reason], ['GOAL_NOT_ALLOWED', 'goal-nobody-in-front']);
  }
}));

/* CLI 16/10/2026 (compito 50): `talos -p` dice «nessuno davanti» PER GIRO ad `avviaLibero`, senza salvarlo. */
test('OB-PER-GIRO — avviaLibero con «nessuno davanti» per giro: l obiettivo si rifiuta come «nessuno davanti»; AL CONTRARIO la stessa sessione ripresa con la persona davanti lo accetta', async (t) => conStore(t, async (cartellaStore) => {
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const avvio = b.registro.avviaLibero({ cartellaLibera: cartellaLibera(t), consegna: 'riassumi il README', senzaInterfacciaNelGiro: true });
  assert.ok(avvio.sessionId, JSON.stringify(avvio));
  await passo();
  assert.equal(b.giri.at(-1).input.nessunoDavanti, true, 'il primo giro sa che non c e nessuno davanti');
  b.giri.at(-1).concludi(FINE);
  await passo();
  const rifiutato = await b.registro.impostaObiettivo(avvio.sessionId, 'make the tests pass');
  assert.deepEqual([rifiutato.code, rifiutato.reason], ['GOAL_NOT_ALLOWED', 'goal-nobody-in-front']);
  assert.equal(b.registro.resume(avvio.sessionId, 'continua', [], { senzaInterfacciaNelGiro: false }).erroreAvvio, undefined);
  await passo();
  b.giri.at(-1).concludi(FINE);
  await passo();
  const accettato = await b.registro.impostaObiettivo(avvio.sessionId, 'make the tests pass');
  assert.equal(accettato.ok, true, JSON.stringify(accettato).slice(0, 200));
}));

/* Il kernel VERO coi canali che il registro dà davvero a una sessione senza interfaccia in Piano: si prendono dall'ingresso del giro */
async function notaDelPiano(t, { senzaInterfaccia }) {
  const b = registroAGiri(t.__store, {});
  const avvio = b.registro.avviaLibero({ cartellaLibera: cartellaLibera(t), consegna: 'pianifica', modalitaOperativa: 'piano', ...(senzaInterfaccia ? { senzaInterfaccia: true } : {}) });
  assert.ok(avvio.sessionId, JSON.stringify(avvio));
  await passo();
  const ingresso = b.giri.at(-1).input;
  const corpi = [];
  await talosLavora({
    cartella: cartellaLibera(t), task: { consegna: 'pianifica' }, modello: 'x', chiave: 'y', onDelta: () => {},
    modalitaOperativa: ingresso.modalitaOperativa, strumentiEstesi: ingresso.strumentiEstesi, chiediDomandaFn: ingresso.chiediDomandaFn,
    ...(typeof ingresso.presentaPianoFn === 'function' ? { presentaPianoFn: ingresso.presentaPianoFn } : {}),
    ...(ingresso.nessunoDavanti === true ? { nessunoDavanti: true } : {}), // OB-REV-03 (15/10): il segno del registro, se c'è
    fetchDiRete: async (_u, r = {}) => { try { corpi.push(corpoSenzaMarcatori(r.body ?? '{}')); } catch { /* */ } return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'); },
  });
  b.giri.at(-1).concludi([]);
  const offerti = (corpi[0]?.tools ?? []).map((x) => x.function?.name);
  return { sistema: (corpi[0]?.messages ?? []).filter((m) => m.role === 'system').map((m) => m.content).join(' | '), offerti, ingresso };
}

test('OB-REV-03 [CURATO 15/10, era S5] — Piano in una sessione SENZA INTERFACCIA, coi canali veri del registro: la nota dice «Nobody can approve» e insieme «use ask_user_question», cioè chiede a una persona che il commit stesso dice non esserci', async (t) => conStore(t, async (cartellaStore) => {
  t.__store = cartellaStore;
  const { sistema, offerti, ingresso } = await notaDelPiano(t, { senzaInterfaccia: true });
  assert.equal(ingresso.modalitaOperativa, 'piano', 'premessa: la sessione è in Piano');
  assert.match(sistema, /Plan mode is on\./u, 'premessa: la nota del Piano c\'è');
  assert.match(sistema, /Nobody can approve a plan in this session/u, 'la metà del commit: nessuno approva');
  assert.ok(offerti.includes('ask_user_question'), `il registro offre ancora la domanda (si chiude da sola con l'ipotesi prudente): ${offerti.join(', ')}`);
  assert.doesNotMatch(sistema, /use ask_user_question/u, 'senza nessuno davanti la nota non dovrebbe mandare il modello a chiedere: la risposta è sempre «nobody can answer»');
  assert.doesNotMatch(sistema, /The tool pauses for an answer/u, 'OB-REV-03: nemmeno la nota delle domande promette una risposta che non arriverà');
  assert.match(sistema, /state it in the plan with the options and the one you assumed/u);
}));

test('OB-REV-04 [REGGE] — AL CONTRARIO: la stessa sessione in Piano CON un\'interfaccia chiede e fa approvare, come prima', async (t) => conStore(t, async (cartellaStore) => {
  t.__store = cartellaStore;
  const { sistema, offerti } = await notaDelPiano(t, { senzaInterfaccia: false });
  assert.match(sistema, /use ask_user_question/u);
  assert.match(sistema, /The tool pauses for an answer/u, 'AL CONTRARIO: con qualcuno davanti la nota delle domande resta');
  assert.match(sistema, /call present_plan with the full plan in Markdown: it is the only way to get it approved\./u);
  assert.ok(offerti.includes('present_plan'), offerti.join(', '));
}));
