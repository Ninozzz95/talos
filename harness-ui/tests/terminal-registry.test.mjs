import assert from 'node:assert/strict';
import test from 'node:test';

import { creaRegistroSchedeTerminale, SCHEDE_MASSIME_PER_SESSIONE } from '../src/terminal-registry.mjs';

/**
 * ⭐ Stesso principio di pty-terminal.test.mjs e terminal-ws.test.mjs: mai una
 * PTY vera qui dentro. Le sessioni sono una mappa scritta a mano dal test, così
 * "la sessione non esiste" è un fatto che il test controlla riga per riga
 * invece di dedurlo da un doppio più grande.
 */
function registroPerTest(overrides = {}) {
  const sessioni = new Map(Object.entries(overrides.sessioni ?? { 'sess-1': 'C:/lavoro/uno', 'sess-2': 'C:/lavoro/due' }));
  const ptyChiuse = [];
  const ptyVive = new Set(overrides.ptyVive ?? []);
  let contatore = 0;
  const registro = creaRegistroSchedeTerminale({
    cartellaDiSessione: (id) => sessioni.get(id) ?? null,
    chiudiPtyFn: (terminalId) => { ptyChiuse.push(terminalId); ptyVive.delete(terminalId); },
    statoPtyFn: (terminalId) => (ptyVive.has(terminalId) ? { viva: true } : null),
    cartellaStandaloneLegacy: overrides.cartellaStandaloneLegacy ?? null,
    schedeMassimePerSessione: overrides.schedeMassimePerSessione ?? SCHEDE_MASSIME_PER_SESSIONE,
    generaId: overrides.generaId ?? (() => { contatore += 1; return `term-${contatore}`; }),
    clock: () => new Date('2026-09-05T10:00:00.000Z'),
  });
  return { registro, sessioni, ptyChiuse, ptyVive };
}

test('⭐⭐⭐ COMPATIBILITÀ — la PRIMA scheda di una sessione ha terminalId === sessionId (il monolite congelato continua a funzionare)', () => {
  const { registro } = registroPerTest();
  const scheda = registro.crea({ sessionId: 'sess-1' });
  assert.equal(scheda.terminalId, 'sess-1', 'public/app.js si collega con ?id=<sessionId>: la prima scheda DEVE combaciare');
  assert.equal(scheda.cartella, 'C:/lavoro/uno');
  assert.equal(scheda.origine, 'prima-scheda');
});

test('⭐⭐⭐ IL CRITERIO DELLA RIGA — la seconda scheda ha un id NUOVO, scelto dal server, e resta nella stessa sessione/cartella', () => {
  const { registro } = registroPerTest();
  const prima = registro.crea({ sessionId: 'sess-1' });
  const seconda = registro.crea({ sessionId: 'sess-1' });
  assert.notEqual(seconda.terminalId, prima.terminalId, 'due schede della stessa sessione non condividono l\'id — e quindi nemmeno la PTY');
  assert.equal(seconda.sessionId, 'sess-1');
  assert.equal(seconda.cartella, 'C:/lavoro/uno');
  assert.equal(seconda.origine, 'rotta');
});

test('⛔⛔⛔ AL CONTRARIO — creare una scheda per una sessione che NON esiste: NOT_FOUND, e nessuna scheda nasce (mai la prima cartella di progetto)', () => {
  const { registro } = registroPerTest();
  const esito = registro.crea({ sessionId: 'sessione-inventata' });
  assert.equal(esito.code, 'NOT_FOUND');
  assert.equal(registro._schede.size, 0, 'il fallback su cartelleProgetto[0] non esiste più: da una sessione ignota non nasce NIENTE');
});

test('⛔⛔ AL CONTRARIO — sessionId assente o vuoto: QUERY_INVALID, nessuna scheda', () => {
  const { registro } = registroPerTest();
  assert.equal(registro.crea({}).code, 'QUERY_INVALID');
  assert.equal(registro.crea({ sessionId: '' }).code, 'QUERY_INVALID');
  assert.equal(registro.crea({ sessionId: 42 }).code, 'QUERY_INVALID');
  assert.equal(registro._schede.size, 0);
});

test('⛔⛔⛔ AL CONTRARIO — un terminalId MAI creato dal server non si risolve: null, cioè rifiuto', () => {
  const { registro } = registroPerTest();
  assert.equal(registro.risolviPerConnessione('un-id-a-caso'), null);
  assert.equal(registro.risolviPerConnessione(''), null);
  assert.equal(registro.risolviPerConnessione(undefined), null);
  assert.equal(registro._schede.size, 0, 'un id rifiutato non deve nemmeno lasciare una voce dietro di sé');
});

test('⭐⭐⭐ un sessionId VIVO si risolve anche senza passare dalla rotta: è la porta di compatibilità del monolite (F5 sulla prima scheda)', () => {
  const { registro } = registroPerTest();
  const scheda = registro.risolviPerConnessione('sess-2');
  assert.equal(scheda.terminalId, 'sess-2');
  assert.equal(scheda.cartella, 'C:/lavoro/due');
  assert.equal(scheda.sessionId, 'sess-2');
});

test('⭐⭐⭐ la cartella si CONGELA alla creazione: se la sessione cambia workspace dopo, la scheda già aperta non si sposta', () => {
  const { registro, sessioni } = registroPerTest();
  const prima = registro.crea({ sessionId: 'sess-1' });
  sessioni.set('sess-1', 'C:/un-altro-posto');
  const risolta = registro.risolviPerConnessione(prima.terminalId);
  assert.equal(risolta.cartella, 'C:/lavoro/uno', 'la cartella non si ri-risolve a ogni connessione — è la voce del registro a comandare');
});

test('⛔⛔⛔ AL CONTRARIO — chiudere un terminale di UN\'ALTRA sessione è NOT_FOUND, e la PTY dell\'altro NON viene toccata', () => {
  const { registro, ptyChiuse } = registroPerTest();
  const altrui = registro.crea({ sessionId: 'sess-2' });
  const esito = registro.chiudi({ sessionId: 'sess-1', terminalId: altrui.terminalId });
  assert.equal(esito.code, 'NOT_FOUND', 'stesso codice di un terminale inesistente: non si regala una sonda per scoprire quali id esistono');
  assert.deepEqual(ptyChiuse, [], 'nessuna PTY chiusa: la proprietà si verifica PRIMA di agire');
  assert.equal(registro._schede.has(altrui.terminalId), true, 'la scheda altrui resta viva');
});

test('⭐⭐⭐ la chiusura esplicita di una scheda PROPRIA chiude anche la PTY vera e toglie la voce', () => {
  const { registro, ptyChiuse } = registroPerTest();
  const mia = registro.crea({ sessionId: 'sess-1' });
  const esito = registro.chiudi({ sessionId: 'sess-1', terminalId: mia.terminalId });
  assert.equal(esito.ok, true);
  assert.deepEqual(ptyChiuse, [mia.terminalId]);
  assert.equal(registro._schede.has(mia.terminalId), false);
});

test('⛔⛔ AL CONTRARIO — una scheda chiusa non si può più usare per connettersi (nessuna PTY risuscitata di nascosto)', () => {
  const { registro } = registroPerTest();
  const seconda = (registro.crea({ sessionId: 'sess-1' }), registro.crea({ sessionId: 'sess-1' }));
  registro.chiudi({ sessionId: 'sess-1', terminalId: seconda.terminalId });
  assert.equal(registro.risolviPerConnessione(seconda.terminalId), null);
});

test('⭐⭐ elenca torna SOLO le schede di quella sessione, mai quelle delle altre', () => {
  const { registro } = registroPerTest();
  registro.crea({ sessionId: 'sess-1' });
  registro.crea({ sessionId: 'sess-1' });
  registro.crea({ sessionId: 'sess-2' });
  const uno = registro.elenca('sess-1');
  assert.equal(uno.items.length, 2);
  assert.ok(uno.items.every((voce) => voce.sessionId === 'sess-1'), 'l\'elenco non deve mai nominare un terminale di un\'altra sessione');
  assert.equal(registro.elenca('sess-2').items.length, 1);
});

test('⛔⛔ AL CONTRARIO — elenca di una sessione inesistente è NOT_FOUND, non un elenco vuoto (due fatti diversi)', () => {
  const { registro } = registroPerTest();
  assert.equal(registro.elenca('sessione-inventata').code, 'NOT_FOUND');
  assert.equal(registro.elenca('').code, 'QUERY_INVALID');
});

test('⭐⭐ `attiva` dice se la SHELL è viva — tre stati, non due: registrata-senza-PTY non è "inesistente"', () => {
  const { registro, ptyVive } = registroPerTest();
  const scheda = registro.crea({ sessionId: 'sess-1' });
  assert.equal(registro.elenca('sess-1').items[0].attiva, false, 'scheda creata, PTY non ancora aperta');
  ptyVive.add(scheda.terminalId);
  assert.equal(registro.elenca('sess-1').items[0].attiva, true);
});

test('⛔⛔⛔ AL CONTRARIO — oltre il tetto per sessione la creazione è rifiutata (ogni PTY su Windows porta con sé un conhost)', () => {
  const { registro } = registroPerTest({ schedeMassimePerSessione: 3 });
  registro.crea({ sessionId: 'sess-1' });
  registro.crea({ sessionId: 'sess-1' });
  registro.crea({ sessionId: 'sess-1' });
  const oltre = registro.crea({ sessionId: 'sess-1' });
  assert.equal(oltre.code, 'TERMINAL_LIMIT_REACHED');
  assert.equal(registro.elenca('sess-1').items.length, 3, 'il tetto MORDE: non si crea una quarta scheda');
  assert.equal(registro.crea({ sessionId: 'sess-2' }).terminalId, 'sess-2', 'il tetto è PER SESSIONE, non globale');
});

test('⛔⛔ un generaId che collide non sovrascrive MAI una scheda viva', () => {
  const { registro } = registroPerTest({ generaId: () => 'sempre-lo-stesso' });
  registro.crea({ sessionId: 'sess-1' });
  const a = registro.crea({ sessionId: 'sess-1' });
  const b = registro.crea({ sessionId: 'sess-1' });
  assert.notEqual(a.terminalId, b.terminalId);
  assert.equal(registro.elenca('sess-1').items.length, 3);
});

test('⛔⛔⛔ DEBITO DICHIARATO — la porta standalone legacy è SPENTA di default, e accesa apre solo sulla cartella nominata a costruzione', () => {
  const spento = registroPerTest();
  assert.equal(spento.registro.risolviPerConnessione('uuid-inventato-dal-client'), null, 'default STRETTO: un id ignoto si rifiuta');

  const acceso = registroPerTest({ cartellaStandaloneLegacy: 'C:/progetto-di-default' });
  const scheda = acceso.registro.risolviPerConnessione('uuid-inventato-dal-client');
  assert.equal(scheda.cartella, 'C:/progetto-di-default');
  assert.equal(scheda.sessionId, null, 'una scheda standalone non appartiene a nessuna sessione');
  assert.equal(scheda.origine, 'standalone-legacy');
});

test('⛔⛔⛔ AL CONTRARIO — la porta legacy ha comunque un TETTO: «qualunque stringa apre una shell» non è più vero nemmeno lì', () => {
  const { registro } = registroPerTest({ cartellaStandaloneLegacy: 'C:/progetto-di-default', schedeMassimePerSessione: 2 });
  assert.ok(registro.risolviPerConnessione('a'));
  assert.ok(registro.risolviPerConnessione('b'));
  assert.equal(registro.risolviPerConnessione('c'), null, 'oltre il tetto la porta legacy si chiude');
});

test('⛔⛔⛔ AL CONTRARIO — nemmeno con la porta legacy accesa una scheda standalone può rubare la cartella di una sessione', () => {
  const { registro } = registroPerTest({ cartellaStandaloneLegacy: 'C:/progetto-di-default' });
  const standalone = registro.risolviPerConnessione('id-che-non-e-una-sessione');
  assert.equal(standalone.cartella, 'C:/progetto-di-default');
  assert.notEqual(standalone.cartella, 'C:/lavoro/uno');
  assert.notEqual(standalone.cartella, 'C:/lavoro/due');
});

test('⛔⛔ una scheda standalone non compare nell\'elenco di NESSUNA sessione', () => {
  const { registro } = registroPerTest({ cartellaStandaloneLegacy: 'C:/progetto-di-default' });
  registro.risolviPerConnessione('standalone-x');
  assert.equal(registro.elenca('sess-1').items.length, 0);
  assert.equal(registro.elenca('sess-2').items.length, 0);
});

/*
 * ⭐⭐⭐ Le schede si dimenticano — ma solo quelle che nessuno usa.
 *
 * ⛔ Il registro delle PTY chiude le SHELL orfane in minuti; la scheda invece
 * restava per sempre, di proposito (un F5 dieci minuti dopo deve riaprire nella
 * cartella giusta, non prendere 403). Il prezzo era crescita non misurata su un
 * server acceso per settimane.
 */
test('⭐⭐⭐ una scheda ferma oltre il tetto viene dimenticata, e si DICE quale', () => {
  let ora = new Date('2026-09-05T00:00:00Z');
  const registro = creaRegistroSchedeTerminale({
    cartellaDiSessione: (id) => (id === 's1' ? 'C:/ws' : null),
    statoPtyFn: () => ({ viva: false }),
    clock: () => ora,
    orePrimaDiDimenticare: 24,
  });
  registro.risolviPerConnessione('s1');
  assert.equal(registro.misura().schede, 1);

  ora = new Date('2026-09-05T23:00:00Z');
  assert.deepEqual(registro.dimenticaLeVecchie().tolte, [], 'a 23 ore non si tocca niente');

  ora = new Date('2026-09-06T01:00:00Z');
  const esito = registro.dimenticaLeVecchie();
  assert.equal(esito.tolte.length, 1);
  assert.equal(esito.tolte[0].terminalId, 's1');
  assert.equal(esito.tolte[0].sessionId, 's1');
  assert.equal(esito.restano, 0);
});

test('⭐⭐⭐ AL CONTRARIO — una scheda con la SHELL ANCORA VIVA non si tocca mai, per vecchia che sia', () => {
  let ora = new Date('2026-09-05T00:00:00Z');
  const registro = creaRegistroSchedeTerminale({
    cartellaDiSessione: () => 'C:/ws',
    // ⛔ Buttare la scheda di una PTY viva lascerebbe un processo acceso che
    // nessuno può più raggiungere: è la perdita che questa cura dovrebbe
    // evitare, fatta dalla cura stessa.
    statoPtyFn: () => ({ viva: true }),
    clock: () => ora,
    orePrimaDiDimenticare: 1,
  });
  registro.risolviPerConnessione('s1');
  ora = new Date('2026-09-30T00:00:00Z');
  assert.deepEqual(registro.dimenticaLeVecchie().tolte, []);
  assert.equal(registro.misura().schede, 1);
});

test('⭐⭐ agganciarsi RIMANDA la scadenza: è l\'uso che tiene viva una scheda', () => {
  let ora = new Date('2026-09-05T00:00:00Z');
  const registro = creaRegistroSchedeTerminale({
    cartellaDiSessione: () => 'C:/ws',
    statoPtyFn: () => ({ viva: false }),
    clock: () => ora,
    orePrimaDiDimenticare: 24,
  });
  registro.risolviPerConnessione('s1');
  ora = new Date('2026-09-05T20:00:00Z');
  registro.risolviPerConnessione('s1');
  ora = new Date('2026-09-06T10:00:00Z'); // 14 h dall'ultimo aggancio, 34 dalla nascita
  assert.deepEqual(registro.dimenticaLeVecchie().tolte, [], 'conta l’ultimo aggancio, non la nascita');
});

test('⭐⭐ la misura si legge: quante schede, quante con la shell viva, da quanto tace la più vecchia', () => {
  let ora = new Date('2026-09-05T00:00:00Z');
  const vive = new Set(['s1']);
  const registro = creaRegistroSchedeTerminale({
    cartellaDiSessione: () => 'C:/ws',
    statoPtyFn: (id) => ({ viva: vive.has(id) }),
    clock: () => ora,
  });
  registro.risolviPerConnessione('s1');
  registro.risolviPerConnessione('s2');
  ora = new Date('2026-09-05T02:00:00Z');
  const m = registro.misura();
  assert.equal(m.schede, 2);
  assert.equal(m.conShellViva, 1);
  assert.equal(m.piuVecchiaFermaDaMs, 2 * 60 * 60 * 1000);
  assert.equal(m.orePrimaDiDimenticare, 24);
});
