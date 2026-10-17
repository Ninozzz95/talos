/*
 * ⭐ /goal G6 (owner 15/10/2026, «chat nuova ferma») — `/goal <testo>` in una chat NUOVA: la conversazione nasce SENZA giro
 * (`avviaLibero({ferma:true})`, il ramo `senzaGiro` del fork «prima del giro»), l'obiettivo si imposta lì e il primo giro lo avvia la
 * persona dalla carta. Come Hermes desktop (`resolve-target-session.ts`: solo una chat nuova crea la sessione, prima dell'obiettivo).
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { conStore, passo, registroAGiri, riavvia } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

test('FERMA-01 — `ferma:true` apre la conversazione senza giro né modello; l\'obiettivo si imposta; il primo giro parte solo col messaggio della persona', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-ferma-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const esito = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'fai passare i test', ferma: true });
  assert.ok(esito.sessionId, JSON.stringify(esito));
  await passo();
  assert.equal(b.giri.length, 0, 'nessun giro: niente parte finché la persona non avvia');
  const voceElenco = () => b.registro.elenca().find((v) => v.sessionId === esito.sessionId);
  assert.equal(voceElenco()?.primoMessaggioAtteso, true, 'l’elenco la dice «in attesa del primo messaggio»');
  const impostato = await b.registro.impostaObiettivo(esito.sessionId, 'fai passare i test');
  assert.equal(impostato.ok, true, JSON.stringify(impostato));
  const ripresa = b.registro.resume(esito.sessionId, 'fai passare i test');
  await passo();
  assert.equal(b.giri.length, 1, `«Avvia»: il primo giro — resume: ${JSON.stringify(ripresa)}`);
  assert.equal(b.giri[0].input.testoDellaPersona, 'fai passare i test', 'il messaggio è della persona');
  assert.equal(b.giri[0].input.messaggiIniziali, undefined, 'il primo giro parte FRESCO: il kernel costruisce sistema e messaggio');
  assert.equal(b.giri[0].input.task.consegna, 'fai passare i test');
  assert.notEqual(b.giri[0].input.task.seguito, true, 'è il primo messaggio, non un seguito');
  // dopo il primo giro è una conversazione come le altre: il secondo messaggio è una ripresa con la storia
  b.giri[0].concludi([{ role: 'system', content: 's' }, { role: 'user', content: 'fai passare i test' }, { role: 'assistant', content: 'ok' }]);
  await passo(); await passo();
  b.registro.togliObiettivo(esito.sessionId);
  await passo();
  b.registro.resume(esito.sessionId, 'e adesso?');
  await passo();
  assert.equal(b.giri.length, 2);
  assert.equal(b.giri[1].input.messaggiIniziali.length, 4, 'la seconda è una ripresa vera, con la storia del primo giro');
  assert.equal(voceElenco()?.primoMessaggioAtteso, undefined, 'AL CONTRARIO: dopo il primo giro il segno non c’è più');
}));

test('FERMA-03 — il segno sta sul DISCO: dopo un riavvio del server la chat ferma si avvia ancora col primo messaggio; AL CONTRARIO una voce di coda o un avviso non la aprono', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-ferma-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const { sessionId } = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'fai passare i test', ferma: true });
  await passo();
  const dopo = await riavvia(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const avviso = dopo.registro.resume(sessionId, 'checks failed', [], { notificaObiettivo: { obiettivoId: 'ob-11111111', riepilogo: null } });
  assert.ok(avviso?.erroreAvvio, 'un avviso del /goal non apre una chat ferma');
  assert.equal(dopo.giri.length, 0);
  const avviata = dopo.registro.resume(sessionId, 'fai passare i test');
  assert.equal(avviata?.erroreAvvio, undefined, JSON.stringify(avviata));
  await passo();
  assert.equal(dopo.giri.length, 1);
  assert.equal(dopo.giri[0].input.messaggiIniziali, undefined);
}));

test('FERMA-02 AL CONTRARIO — senza `ferma` la chat parte come sempre; `ferma` non vale per una figlia (la porta è avviaLibero)', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-ferma-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash' });
  const esito = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'ciao' });
  await passo();
  assert.ok(esito.sessionId);
  assert.equal(b.giri.length, 1, 'una chat normale parte subito');
}));

test('FERMA-04 (15/10, visto dal vivo) — senza la chiave del fornitore la chat ferma NON nasce, come una chat normale, col motivo e il nome del fornitore; AL CONTRARIO con la chiave nasce', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-g6-ferma-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  let chiave = null;
  const prontoFn = () => (chiave ? { pronto: true, fornitore: 'OpenRouter' }
    : { pronto: false, fornitore: 'OpenRouter', codice: 'CONFIG_INVALID', messaggio: 'The OpenRouter key is missing: connect it from Providers and access.', motivo: 'provider-key-missing-named' });
  const b = registroAGiri(cartellaStore, { modello: 'z-ai/glm-5.3-flash', prontoFn });
  const prima = b.registro.elenca().length;
  const senza = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'fai passare i test', ferma: true });
  assert.equal(senza.code, 'CONFIG_INVALID', JSON.stringify(senza));
  assert.equal(senza.reason, 'provider-key-missing-named');
  assert.deepEqual(senza.params, { provider: 'OpenRouter' });
  assert.equal(b.registro.elenca().length, prima, 'nessuna conversazione nata: niente obiettivo «attivo» che non può girare');
  const normale = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'ciao' });
  assert.equal(normale.reason, senza.reason, 'la chat normale dice la stessa cosa');
  chiave = 'k';
  const con = b.registro.avviaLibero({ cartellaLibera: cartella, consegna: 'fai passare i test', ferma: true });
  assert.ok(con.sessionId, JSON.stringify(con));
  await passo();
  assert.equal(b.giri.length, 0, 'con la chiave nasce ferma, senza giro');
}));
