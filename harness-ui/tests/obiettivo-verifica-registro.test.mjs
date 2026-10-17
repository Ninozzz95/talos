/*
 * ⭐⭐⭐ /goal, fase G3 — LE PROVE DEL CONTRATTO NEL REGISTRO VERO (giornale su disco). Owner 14/10/2026 sera: 3 rossi di fila ⇒
 *   pausa col motivo; «non verificabile» non consuma; le prove girano solo nella cartella della conversazione, col cancello dei
 *   permessi del motore. Le regole pure hanno le loro prove (`obiettivo-verifica.test.mjs`); qui il cablaggio: che cosa arriva sul
 *   giornale, che cosa sente chi ascolta, che cosa succede ai gesti che arrivano mentre le prove girano. Una prova (G3-REG-08) passa
 *   dal kernel VERO: esecuzione e permessi dell'attrezzo shell.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { attendiScritture } from '../src/session-store.mjs';
import { TENTATIVI_MASSIMI } from '../src/obiettivo/verifica.mjs';
import { ascolta, conStore, conversazioneFerma, passo, registroAGiri, riavvia, righeObiettivo } from './aiuto/banco-obiettivo.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const forma = (r) => ({ code: r.code, reason: r.reason });
/** Aspetta una condizione, con un tetto: una prova che aspetta per sempre non dice niente (si appende). */
async function aspetta(condizione, cosa) {
  for (let i = 0; i < 2000; i += 1) { if (condizione()) return; await passo(); }
  assert.fail(`mai successo: ${cosa}`);
}
const comando = (riga) => ({ testo: `runs ${riga}`, verifica: { tipo: 'comando', comando: riga } });
const sempreSi = async () => ({ consentito: true });

function progetto(t) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-g3-reg-'));
  t.after(() => rimuoviCartellaDiProva(radice));
  return radice;
}
/** Un registro le cui conversazioni lavorano in `cartella`, con un esecutore finto che risponde come dice `risposte` (in fila). */
function banco(cartellaStore, cartella, risposte = [], opzioni = {}) {
  const chiamate = [];
  const b = registroAGiri(cartellaStore, {
    preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }),
    permessoDelMotoreFn: sempreSi,
    programmaTrovatoFn: async () => true,
    eseguiComandoDellaProvaFn: async (riga, dove, o) => {
      chiamate.push({ riga, dove, o });
      const r = typeof risposte === 'function' ? await risposte(riga, o) : (risposte.shift() ?? { codice: 0 });
      return r;
    },
    ...opzioni,
  });
  return { ...b, chiamate };
}

test('G3-REG-01 — tre rossi di fila sullo stesso criterio ⇒ l\'obiettivo va IN PAUSA e dice quale; il giornale e chi ascolta lo sanno; riprendere ridà i tentativi', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, () => ({ codice: 1, enforcement: 'none' }));
  const sessionId = await conversazioneFerma(b);
  const annunci = ascolta(b.registro, sessionId);
  const impostato = await b.registro.impostaObiettivo(sessionId, 'fix the login loop', { criteri: [comando('npm test'), comando('npm run lint')] });
  assert.equal(impostato.ok, true, JSON.stringify(impostato));
  for (let i = 1; i <= TENTATIVI_MASSIMI; i += 1) {
    const esito = await b.registro.verificaObiettivo(sessionId);
    assert.equal(esito.ok, true, JSON.stringify(esito));
    assert.deepEqual(esito.verifica.verdetti.map((v) => v.esito), ['rosso', 'rosso']);
    assert.equal(esito.obiettivo.stato, i < TENTATIVI_MASSIMI ? 'attivo' : 'in-pausa', `verifica ${i}`);
  }
  const fermo = b.registro.statoObiettivo(sessionId).obiettivo;
  assert.deepEqual(fermo.motivo, { tipo: 'prove-rosse', dettaglio: 'c1, c2' });
  assert.equal(b.chiamate.length, 6);
  assert.equal(b.chiamate[0].dove, cartella, 'le prove girano nella cartella della conversazione');
  await attendiScritture({ cartellaStore });
  const righe = righeObiettivo(cartellaStore, sessionId);
  assert.equal(righe.at(-1).obiettivo.motivo.tipo, 'prove-rosse');
  assert.deepEqual(Object.values(righe.at(-1).obiettivo.verifica.tentativi), [3, 3]);
  assert.equal(annunci.at(-1).obiettivo.stato, 'in-pausa');
  // la persona riprende: i tentativi ripartono da zero (senza, il primo rosso rimetterebbe subito in pausa)
  const ripreso = await b.registro.riprendiObiettivo(sessionId);
  assert.equal(ripreso.obiettivo.stato, 'attivo');
  assert.deepEqual(ripreso.obiettivo.verifica.tentativi, {});
  const dopo = await b.registro.verificaObiettivo(sessionId);
  assert.equal(dopo.obiettivo.stato, 'attivo', 'un rosso dopo la ripresa è il primo, non il quarto');
  assert.deepEqual(dopo.criteriAlTetto, []);
  // e sopravvive al riavvio, col resoconto dell'ultima verifica
  const secondo = await riavvia(cartellaStore);
  assert.deepEqual(secondo.registro.statoObiettivo(sessionId).obiettivo.verifica.riepilogo, { verdi: 0, rossi: 2, nonVerificabili: 0, daGiudicare: 0 });
}));

test('G3-REG-02 — AL CONTRARIO: «non verificabile» non consuma tentativi (cinque comandi mancanti e l\'obiettivo resta attivo); un verde azzera il conto', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const risposte = [];
  const b = banco(cartellaStore, cartella, () => risposte.shift());
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('pytest')] });
  for (let i = 0; i < 5; i += 1) {
    risposte.push({ codice: 127, enforcement: 'wsl2' });
    const esito = await b.registro.verificaObiettivo(sessionId);
    assert.deepEqual(esito.verifica.verdetti[0].motivo, { tipo: 'command-not-found' });
    assert.equal(esito.obiettivo.stato, 'attivo');
  }
  risposte.push({ codice: 1, enforcement: 'wsl2' }, { codice: 1, enforcement: 'wsl2' }, { codice: 0, enforcement: 'wsl2' }, { codice: 1, enforcement: 'wsl2' });
  for (let i = 0; i < 4; i += 1) await b.registro.verificaObiettivo(sessionId);
  const o = b.registro.statoObiettivo(sessionId).obiettivo;
  assert.equal(o.stato, 'attivo', 'due rossi, un verde, un rosso: mai tre DI FILA');
  assert.deepEqual(Object.values(o.verifica.tentativi), [1]);
  // su Windows il codice 1 col programma che non c'è è «non verificabile» (cmd esce 1, misurato il 14/10)
  const w = banco(cartellaStore, cartella, () => ({ codice: 1, enforcement: 'none' }), { programmaTrovatoFn: async () => false });
  const sw = await conversazioneFerma(w);
  await w.registro.impostaObiettivo(sw, 'goal', { criteri: [comando('pytest')] });
  const ew = await w.registro.verificaObiettivo(sw);
  assert.deepEqual(ew.verifica.verdetti[0].motivo, { tipo: process.platform === 'win32' ? 'command-not-found' : 'exit-code' });
}));

test('G3-REG-03 — i rifiuti: senza obiettivo, senza criteri, mentre un giro lavora, due verifiche insieme; un sotto-agente non ha obiettivo', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  let sblocca;
  const b = banco(cartellaStore, cartella, () => new Promise((r) => { sblocca = () => r({ codice: 0 }); }));
  const sessionId = await conversazioneFerma(b);
  assert.deepEqual(forma(await b.registro.verificaObiettivo(sessionId)), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-not-set' });
  await b.registro.impostaObiettivo(sessionId, 'goal without criteria');
  assert.deepEqual(forma(await b.registro.verificaObiettivo(sessionId)), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-no-contract' });
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  const prima = b.registro.verificaObiettivo(sessionId);
  await passo();
  assert.deepEqual(forma(await b.registro.verificaObiettivo(sessionId)), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-check-running' });
  await aspetta(() => sblocca, "il comando della prima verifica parte");
  sblocca();
  assert.equal((await prima).ok, true);
  // un giro che lavora: niente prove (leggerebbero file a metà)
  const giriPrima = b.giri.length;
  const ripresa = b.registro.resume(sessionId, 'continua');
  assert.equal(ripresa?.erroreAvvio, undefined, JSON.stringify(ripresa));
  await passo();
  assert.equal(b.giri.length, giriPrima + 1, 'il giro è partito');
  assert.deepEqual(forma(await b.registro.verificaObiettivo(sessionId)), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-check-while-working' });
  b.giri.at(-1).concludi([{ role: 'assistant', content: 'r2' }]);
  await passo();
  assert.equal(b.registro.statoObiettivo(sessionId).obiettivo.verifica.verdetti.length, 1, 'il rifiuto non ha scritto niente');
  assert.deepEqual(forma(await b.registro.verificaObiettivo('non-esiste')), { code: 'NOT_FOUND', reason: 'session-not-found' });
}));

test('G3-REG-04 — i gesti NON aspettano le prove: Pausa risponde subito; Togli ferma le prove e il loro esito non si scrive; un contratto cambiato a metà butta l\'esito', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const appesi = [];
  const b = banco(cartellaStore, cartella, (riga, o) => new Promise((r) => {
    appesi.push(r);
    o.segnaleStop?.addEventListener('abort', () => r({ codice: 130, fermatoSuRichiesta: true }));
  }));
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  const inCorso = b.registro.verificaObiettivo(sessionId);
  await passo();
  const pausa = await Promise.race([b.registro.pausaObiettivo(sessionId), new Promise((r) => setTimeout(() => r('APPESO'), 1000))]);
  assert.notEqual(pausa, 'APPESO', 'la Pausa non aspetta le prove');
  assert.equal(pausa.obiettivo.stato, 'in-pausa');
  await aspetta(() => appesi.length > 0, "un comando appeso");
  appesi.shift()({ codice: 1 });
  const registrata = await inCorso;
  assert.equal(registrata.ok, true, 'una verifica su un obiettivo in pausa si registra (lo stesso obiettivo, lo stesso contratto)');
  assert.equal(registrata.obiettivo.stato, 'in-pausa');
  // Togli durante le prove: il comando riceve lo Stop, l'esito non si scrive
  await b.registro.riprendiObiettivo(sessionId);
  const seconda = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.chiamate.length >= 2, "il comando della seconda verifica parte");
  await b.registro.togliObiettivo(sessionId);
  assert.deepEqual(forma(await seconda), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-changed-during-check' });
  assert.equal(b.registro.statoObiettivo(sessionId).obiettivo, null);
  assert.equal(b.chiamate.at(-1).o.segnaleStop.aborted, true, 'il comando ha ricevuto lo Stop');
  appesi.length = 0; // quello fermato si è già risolto da sé
  // il contratto cambia mentre le prove girano: l'esito parla di prove che non ci sono più
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  const terza = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.chiamate.length >= 3, 'il comando della terza verifica parte');
  await b.registro.aggiungiCriteriObiettivo(sessionId, [comando('npm run lint')]);
  appesi.shift()({ codice: 0 });
  assert.deepEqual(forma(await terza), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-changed-during-check' });
  assert.equal('verifica' in b.registro.statoObiettivo(sessionId).obiettivo, false);
  /* ⛔ mutante sopravvissuto (14/10): l'obiettivo SOSTITUITO da uno nuovo con gli STESSI criteri ha la stessa impronta di
     contratto. Solo l'`id` dell'obiettivo dice che l'esito parla di un altro: non si salva sul nuovo. */
  appesi.length = 0;
  const quarta = b.registro.verificaObiettivo(sessionId);
  await aspetta(() => b.chiamate.length >= 4, 'il comando della quarta verifica parte');
  const vecchioId = b.registro.statoObiettivo(sessionId).obiettivo.id;
  const vecchiaImpronta = b.registro.statoObiettivo(sessionId).obiettivo.contratto.impronta;
  const nuovo = await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test'), comando('npm run lint')] });
  assert.notEqual(nuovo.obiettivo.id, vecchioId);
  assert.equal(nuovo.obiettivo.contratto.impronta, vecchiaImpronta, 'lo stesso contratto: solo l\'id distingue i due obiettivi');
  assert.deepEqual(forma(await quarta), { code: 'GOAL_STATE_CONFLICT', reason: 'goal-changed-during-check' });
  assert.equal('verifica' in b.registro.statoObiettivo(sessionId).obiettivo, false, 'il nuovo obiettivo non eredita l\'esito del vecchio');
}));

test('G3-REG-05 — i tentativi sopravvivono a un criterio AGGIUNTO (aggiungere è libero: non deve azzerare il conto degli altri); un criterio cambiato riparte', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, cartella, (riga) => ({ codice: riga === 'npm test' ? 1 : 0 }));
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  await b.registro.verificaObiettivo(sessionId);
  await b.registro.verificaObiettivo(sessionId);
  const allargato = await b.registro.aggiungiCriteriObiettivo(sessionId, [comando('npm run lint')]);
  assert.equal(allargato.ok, true, JSON.stringify(allargato));
  assert.deepEqual(Object.values(allargato.obiettivo.verifica.tentativi), [2]);
  assert.equal('verdetti' in allargato.obiettivo.verifica, false, 'gli esiti del contratto di prima non valgono più');
  const terza = await b.registro.verificaObiettivo(sessionId);
  assert.equal(terza.obiettivo.stato, 'in-pausa', 'il terzo rosso di c1 ferma, anche col criterio nuovo');
  assert.deepEqual(terza.criteriAlTetto, ['c1']);
  // AL CONTRARIO: cambiare il comando di c1 (con la conferma) fa ripartire il SUO conto
  const ob = b.registro.statoObiettivo(sessionId).obiettivo;
  await b.registro.riprendiObiettivo(sessionId);
  await b.registro.verificaObiettivo(sessionId);
  const attuale = b.registro.statoObiettivo(sessionId).obiettivo;
  const cambiato = await b.registro.contrattoObiettivo(sessionId, [{ id: 'c1', ...comando('npm test -- --runInBand') }, { id: 'c2', ...comando('npm run lint') }], { conferma: attuale.contratto.impronta });
  assert.equal(cambiato.ok, true, JSON.stringify(cambiato));
  assert.equal(cambiato.obiettivo.verifica, undefined);
  assert.notEqual(ob.id, undefined);
}));

test('G3-REG-06 — dove le prove NON girano: la cartella sparita, la conversazione in Piano; ogni prova lo dice e nessun comando parte', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = banco(cartellaStore, join(cartella, 'sparita'));
  const sessionId = await conversazioneFerma(b);
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test'), { testo: 'readme', verifica: { tipo: 'file', percorso: 'README.md', fatto: 'esiste' } }] });
  const esito = await b.registro.verificaObiettivo(sessionId);
  assert.deepEqual(esito.verifica.verdetti.map((v) => v.motivo?.tipo), ['workspace-missing', 'workspace-missing']);
  assert.equal(b.chiamate.length, 0);
  // un FILE al posto della cartella non è una cartella
  writeFileSync(join(cartella, 'sparita'), 'x');
  assert.deepEqual((await b.registro.verificaObiettivo(sessionId)).verifica.verdetti[0].motivo, { tipo: 'workspace-missing' });
  // in Piano non si esegue niente
  const p = banco(cartellaStore, cartella);
  const sp = await conversazioneFerma(p);
  await p.registro.impostaObiettivo(sp, 'goal', { criteri: [comando('npm test')] });
  const cambio = await p.registro.aggiornaImpostazioni(sp, { modalitaOperativa: 'piano' });
  assert.equal(cambio.ok, true, JSON.stringify(cambio));
  assert.deepEqual((await p.registro.verificaObiettivo(sp)).verifica.verdetti[0].motivo, { tipo: 'plan-mode' });
  assert.equal(p.chiamate.length, 0);
}));

test('G3-REG-07 — il permesso del motore decide: negato ⇒ «non verificabile» senza eseguire; un cancello che vorrebbe chiedere ⇒ «serve il tuo sì»; un cancello che lancia nega', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const casi = [
    [async () => ({ consentito: false, via: 'permesso-per-attrezzo-nega', motivo: 'off' }), 'permission-denied'],
    [async (azione, o) => { const r = await o.chiediApprovazioneFn(azione); assert.deepEqual(r.approvato, false); return { consentito: false, motivo: 'no' }; }, 'permission-needed'],
    [async () => ({ consentito: false, via: 'modalita-piano', motivo: 'plan' }), 'plan-mode'],
    [async () => { throw new Error('the engine does not expose it'); }, 'permission-needed'],
  ];
  for (const [permessoDelMotoreFn, atteso] of casi) {
    const b = banco(cartellaStore, cartella, [], { permessoDelMotoreFn });
    const sessionId = await conversazioneFerma(b);
    await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
    assert.deepEqual((await b.registro.verificaObiettivo(sessionId)).verifica.verdetti[0].motivo, { tipo: atteso });
    assert.equal(b.chiamate.length, 0, `${atteso}: niente è partito`);
  }
  // il cancello riceve l'azione della shell e le scelte della conversazione
  let visto;
  const b = banco(cartellaStore, cartella, [], { permessoDelMotoreFn: async (azione, o) => { visto = { azione, o }; return { consentito: true }; } });
  const sessionId = await conversazioneFerma(b);
  await b.registro.aggiornaImpostazioni(sessionId, { permessi: 'On request', permessiPerAttrezzo: { shell: 'chiedi' } });
  await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando('npm test')] });
  await b.registro.verificaObiettivo(sessionId);
  assert.deepEqual(visto.azione, { tipo: 'shell', comando: 'npm test' });
  assert.equal(visto.o.cartella, cartella);
  assert.equal(visto.o.permessiPerAttrezzo.shell, 'chiedi');
  assert.equal(typeof visto.o.livelloAccesso, 'string');
}));

test('G3-REG-08 — DAL KERNEL VERO: un comando che fallisce torna ROSSO con stdout e stderr marcati; uno che riesce è verde; con la shell spenta non parte', async (t) => conStore(t, async (cartellaStore) => {
  const cartella = progetto(t);
  const b = registroAGiri(cartellaStore, { preparaEsecuzioneFn: () => ({ cartella, comandoProva: 'npm test', task: { id: 'task-vero', consegna: 'c' } }) });
  const sessionId = await conversazioneFerma(b);
  const fallisce = 'node -e "console.log(\'su\'); console.error(\'giu\'); process.exit(3)"';
  const segno = 'node -e "require(\'fs\').writeFileSync(\'segno.txt\', \'x\')"';
  const impostato = await b.registro.impostaObiettivo(sessionId, 'goal', { criteri: [comando(fallisce), comando('node -e "process.exit(0)"'), comando(segno)] });
  assert.equal(impostato.ok, true, JSON.stringify(impostato));
  const esito = await b.registro.verificaObiettivo(sessionId);
  assert.equal(esito.ok, true, JSON.stringify(esito));
  const [rosso, verde, scritto] = esito.verifica.verdetti;
  assert.equal(rosso.esito, 'rosso', JSON.stringify(rosso));
  assert.equal(rosso.uscita.codice, 3);
  assert.match(rosso.uscita.coda, /\[stdout\]\nsu/u);
  assert.match(rosso.uscita.coda, /\[stderr\]\ngiu/u);
  assert.equal(verde.esito, 'verde', JSON.stringify(verde));
  assert.equal(scritto.esito, 'verde');
  assert.equal(existsSync(join(cartella, 'segno.txt')), true, 'il comando gira nella cartella della conversazione');
  // AL CONTRARIO: con l'attrezzo dei comandi spento, il cancello del motore nega e il comando NON parte
  rimuoviCartellaDiProva(join(cartella, 'segno.txt'));
  const cambio = await b.registro.aggiornaImpostazioni(sessionId, { permessiPerAttrezzo: { shell: 'nega' } });
  assert.equal(cambio.ok, true, JSON.stringify(cambio));
  const negato = await b.registro.verificaObiettivo(sessionId);
  assert.deepEqual(negato.verifica.verdetti.map((v) => v.motivo?.tipo), ['permission-denied', 'permission-denied', 'permission-denied']);
  assert.equal(existsSync(join(cartella, 'segno.txt')), false, 'niente è partito');
  if (process.platform === 'win32') {
    // e il comando che non c'è, dal vero: cmd esce 1, la prova dice «non verificabile»
    await b.registro.aggiornaImpostazioni(sessionId, { permessiPerAttrezzo: { shell: 'sempre' } });
    await b.registro.contrattoObiettivo(sessionId, [comando('comandoinesistentetalosg3 --x')], { conferma: b.registro.statoObiettivo(sessionId).obiettivo.contratto.impronta });
    const manca = await b.registro.verificaObiettivo(sessionId);
    assert.deepEqual(manca.verifica.verdetti[0].motivo, { tipo: 'command-not-found' }, JSON.stringify(manca.verifica.verdetti[0]));
  }
}));
