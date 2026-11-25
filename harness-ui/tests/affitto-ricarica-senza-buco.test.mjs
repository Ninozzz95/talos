import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attendiScritture, attivaAffittiArchivio, disattivaAffittiArchivio, elencaSessioniPersistite } from '../src/session-store.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { createHttpApp } from '../src/http-app.mjs';
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs';
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs';
import { creaOperazioni } from '../src/remoto/operazioni.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * 21/11/2026 (candidata PC 0.2.5, unione del salvataggio delle chat, difetto 4 = S3-05 di `remoto-riallinea-sessione.test.mjs`).
 *   Causa misurata: col salvataggio delle chat, una riga rifatta sopra la coda di un altro processo fa rileggere la chat dal disco appena
 *   il giro di qui finisce (`avvisaScritturaAltrove` ⇒ `ricaricaDalDisco`). La ricarica toglie la voce dal registro finché il ripristino
 *   non la rimette: in quei millisecondi la chat NON ESISTEVA per chi la cercava — `esporta` dava null (S3-05), `esiste` falso, e il
 *   telefono che la apriva proprio allora riceveva «Session not found» (`remoto/operazioni.mjs`, `session.events`). Ora, finché la
 *   ricarica è in volo, chi legge trova la voce di prima (come Hermes: la copia nuova si prepara a parte e prende il posto della
 *   vecchia, chi legge vede la vecchia o la nuova, mai un buco): `esporta` e `statoPerIlBattito` la danno, `inRicarica` lo dice, e
 *   l'apertura dal telefono aspetta invece di rifiutare. `esiste` resta com'era (falso durante la ricarica): le prove dell'affitto la
 *   usano per vedere la ricarica in volo. La finestra qui si tiene aperta di proposito: il ripristino della
 *   ricarica aspetta un cancello della prova (`elencaSessioniPersistiteFn`), quindi niente dipende dai tempi.
 */
const cartellaTemp = (t) => { const c = mkdtempSync(join(tmpdir(), 'talos-rsb-')); t.after(() => rimuoviCartellaDiProva(c)); return c; };
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const finche = async (vero, tettoMs = 10_000) => { const fine = Date.now() + tettoMs; while (!vero() && Date.now() < fine) await pausa(5); };

async function banco(t) {
  const store = cartellaTemp(t);
  const lavoro = cartellaTemp(t);
  const affitti = attivaAffittiArchivio(store, { etichetta: 'this test', battitoMs: 0, rilascioDopoMs: 0 });
  t.after(() => disattivaAffittiArchivio(store));
  const avvii = [];
  const cancello = { chiuso: false, apri: null, entrate: 0 };
  const registro = createSessionRegistry({
    cartellaStore: store, affittoFraProcessi: { etichetta: 'this test' }, guardaWorkspaceFn: () => () => {},
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1;
      let chiudi;
      const attesa = new Promise((r) => { chiudi = r; });
      avvii.push({ concludi: (detto) => { input.onEvento({ type: 'RunFinished', threadId: `t${indice}`, runId: `r${indice}`, outcome: { type: 'success' }, result: { detto } }); chiudi({ ok: true, esito: { detto, comeFinita: 'concluso' } }); } });
      input.onEvento({ type: 'RunStarted', threadId: `t${indice}`, runId: `r${indice}` });
      return attesa;
    },
    /* il ripristino della ricarica passa di qui: col cancello chiuso aspetta, e la chat resta «in ricarica» quanto serve alla prova */
    async elencaSessioniPersistiteFn(opzioni) {
      if (cancello.chiuso) { cancello.entrate += 1; await new Promise((r) => { cancello.apri = r; }); }
      if (cancello.lancia || cancello.lanciaSempre) { cancello.lancia = false; throw Object.assign(new Error('EIO: the reload read failed (test)'), { code: 'EIO' }); }
      return elencaSessioniPersistite(opzioni);
    },
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } }),
    modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
  });
  t.after(() => { cancello.apri?.(); return registro.chiudi({ attesaMassimaMs: 1_000 }); });
  const { sessionId } = registro.avviaLibero({ cartellaLibera: lavoro, consegna: 'lavora', permessi: 'Full access' });
  await finche(() => avvii.length === 1);
  assert.equal(avvii.length, 1, 'bench: the fake model turn started');
  await attendiScritture({ cartellaStore: store });
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro });
  const operazioni = creaOperazioni({ chiama: creaChiamataInterna({ httpApp, porta: 4999 }), sessionRegistry: registro, iscriviConRigiocata, ogni: () => null, smetti: () => {} });
  return { store, affitti, avvii, cancello, registro, sessionId, operazioni };
}
function telefono() {
  const ricevuti = [];
  const contesto = { dispositivo: { id: 'pad-rsb', nome: 'Pad' }, iscrizioni: new Map(),
    iscrivi(sub, chiudi) { contesto.iscrizioni.set(sub, chiudi); return (data) => { ricevuti.push(data); return Promise.resolve(); }; } };
  return { contesto, ricevuti };
}
/* il caso di S3-05: giro vivo qui, l'affitto se ne va, un altro processo scrive in coda; il giro finisce ⇒ la riga di fine si rifà sopra
   la coda dell'altro e la chat si rilegge dal disco. Col cancello chiuso la ricarica resta in volo. */
async function inRicarica(t) {
  const b = await banco(t);
  b.affitti.rilascia(b.sessionId);
  appendFileSync(join(b.store, `${b.sessionId}.jsonl`), `${JSON.stringify({ tipo: 'nota-altrove', n: 1 })}\n`);
  assert.equal(b.affitti.cambiatoAltrove(b.sessionId), true, 'premise: changed elsewhere');
  b.cancello.chiuso = true;
  b.avvii[0].concludi('Finito qui.');
  await finche(() => b.cancello.entrate > 0);
  assert.equal(b.cancello.entrate, 1, 'premise: the reload from disk started (written elsewhere, turn over)');
  return b;
}

/* la ricarica finita, detto dal registro: `allineaSessione` aspetta la ricarica in volo (la voce manca da `sessioni`), poi risponde */
async function fineRicarica(b) {
  const esito = await b.registro.allineaSessione(b.sessionId, { scrivere: false });
  assert.notEqual(esito?.stato, 'assente', `after the reload the chat is there: ${JSON.stringify(esito)}`);
}

test('RSB-01 (red before the cure): while the chat is being reread from disk it is still THERE for who reads: inRicarica, esporta, statoPerIlBattito', async (t) => {
  const b = await inRicarica(t);
  assert.equal(b.registro.esiste(b.sessionId), false, 'premise: the entry is out of the session map for the reload');
  assert.equal(b.registro.inRicarica?.(b.sessionId), true, 'the registry says the chat is being reread (it exists)');
  const esportata = b.registro.esporta(b.sessionId);
  assert.ok(esportata, 'the export during the reload is the entry of before, never null');
  assert.equal(esportata.eventi.filter((e) => e.type === 'RunFinished').length, 1, 'the entry of before, with its live end');
  assert.deepEqual(b.registro.statoPerIlBattito(b.sessionId)?.lavora, false, 'the heartbeat still sees the chat, stopped');
  b.cancello.chiuso = false;
  b.cancello.apri();
  await fineRicarica(b);
  assert.equal(b.registro.esiste(b.sessionId), true, 'after the reload: the chat is there');
  assert.equal(b.registro.esporta(b.sessionId).eventi.filter((e) => e.type === 'RunFinished').length, 1, 'after the reload: one end, read from disk');
});

test('RSB-02 (red before the cure): a phone that opens the chat DURING the reload is never told «Session not found»; it gets the replay once the reload is done', async (t) => {
  const b = await inRicarica(t);
  const tel = telefono();
  const apertura = b.operazioni.esegui('session.events', { sessionId: b.sessionId, sub: 's', after: 0 }, tel.contesto);
  let esito = null;
  apertura.then((v) => { esito = { ok: v }; }, (e) => { esito = { errore: e?.code ?? String(e) }; });
  await pausa(20);
  assert.equal(esito?.errore, undefined, `no refusal while the reload is in flight: ${JSON.stringify(esito)}`);
  b.cancello.chiuso = false;
  b.cancello.apri();
  assert.deepEqual(await apertura, { sub: 's', after: 0 });
  assert.ok(tel.ricevuti.some((e) => e?.type === 'RunFinished'), 'the replay carries the end of the turn');
  assert.ok(tel.ricevuti.some((e) => e?.name === 'talos.fine-rigiocata'), 'the replay ended');
});

test('RSB-03: once the reload is done, the old entry is gone from every reader (no stale copy left behind)', async (t) => {
  const b = await inRicarica(t);
  const prima = b.registro.esporta(b.sessionId);
  b.cancello.chiuso = false;
  b.cancello.apri();
  await fineRicarica(b);
  const dopo = b.registro.esporta(b.sessionId);
  assert.ok(dopo, 'the chat is there after the reload');
  assert.notEqual(dopo.eventi, prima?.eventi, 'the export reads the NEW entry, not the one kept for the reload');
});

test('RSB-04 a reload that fails puts the chat back; deleting it afterwards leaves no copy behind: the deleted chat no longer exists for any reader', async (t) => {
  const b = await inRicarica(t);
  const errori = console.error; console.error = () => {}; t.after(() => { console.error = errori; });
  b.cancello.lancia = true;
  b.cancello.chiuso = false;
  b.cancello.apri();
  await fineRicarica(b);
  assert.equal(b.registro.esiste(b.sessionId), true, 'the chat is back after the failed reload');
  const eliminata = await b.registro.elimina(b.sessionId);
  assert.equal(eliminata?.ok, true, `deleted: ${JSON.stringify(eliminata)}`);
  assert.equal(b.registro.esiste(b.sessionId), false, 'a deleted chat does not exist');
  assert.equal(b.registro.inRicarica(b.sessionId), false, 'nor is it being reread');
  assert.equal(b.registro.esporta(b.sessionId), null, 'and has nothing to export');
  assert.equal(b.registro.statoPerIlBattito(b.sessionId), null, 'nor a heartbeat');
});

test('RSB-04b every reload fails (the disk stays unreadable): the chat stays as it was, and once deleted it no longer exists for any reader', async (t) => {
  const b = await inRicarica(t);
  const errori = console.error; console.error = () => {}; t.after(() => { console.error = errori; });
  b.cancello.lanciaSempre = true;
  b.cancello.chiuso = false;
  b.cancello.apri();
  await b.registro.allineaSessione(b.sessionId, { scrivere: false }).catch(() => null); // aspetta la ricarica in volo (fallita) e ne tenta un'altra, fallita anche lei
  assert.equal(b.registro.esiste(b.sessionId), true, 'the chat is still there');
  assert.ok(b.registro.esporta(b.sessionId), 'with its history');
  const eliminata = await b.registro.elimina(b.sessionId);
  assert.equal(eliminata?.ok, true, `deleted: ${JSON.stringify(eliminata)}`);
  assert.equal(b.registro.esiste(b.sessionId), false, 'a deleted chat does not exist');
  assert.equal(b.registro.inRicarica(b.sessionId), false, 'nor is it being reread');
  assert.equal(b.registro.esporta(b.sessionId), null, 'and has nothing to export');
});
