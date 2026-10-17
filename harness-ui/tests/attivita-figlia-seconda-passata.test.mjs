/*
 * 13/10/2026 (bugfixer, lotto 3, SECONDA PASSATA) — le cure di `d0a397649` in `src/attivita-figlia.mjs`: le chiamate aperte tenute
 * in ordine (R4) e il bersaglio che non inganna (S3-3). `[REGGE]` = ho provato a romperlo; `[DIFETTO]` = consegnata rossa.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaAccumulatoreAttivita, riassuntoAttivitaSessione } from '../src/attivita-figlia.mjs';

const start = (id, nome = 'leggi') => ({ type: 'ToolCallStart', toolCallId: id, toolCallName: nome });
const args = (id, percorso) => ({ type: 'ToolCallArgs', toolCallId: id, delta: JSON.stringify({ percorso }) });
const fine = (id) => ({ type: 'ToolCallResult', toolCallId: id, content: 'ok' });
const corrente = (eventi) => { const a = creaAccumulatoreAttivita(); for (const e of eventi) a.aggiungi(e); const s = a.riassunto(); return [s.attrezzoCorrente, s.bersaglioCorrente]; };
const aperta = (id, nome = 'leggi') => [start(id, nome), args(id, `${id}.js`)];

test('SECONDA-R4-01 [REGGE] — le chiamate aperte in ordine: si ricade sull’ultima ancora aperta, in ogni ordine di chiusura', () => {
  const tre = [...aperta('a'), ...aperta('b', 'scrivi'), ...aperta('c')];
  assert.deepEqual(corrente(tre), ['leggi', 'c.js']);
  assert.deepEqual(corrente([...tre, fine('c')]), ['scrivi', 'b.js']);
  assert.deepEqual(corrente([...tre, fine('c'), fine('b')]), ['leggi', 'a.js']);
  assert.deepEqual(corrente([...tre, fine('a')]), ['leggi', 'c.js'], 'chiudere una che non è la corrente non la cambia');
  assert.deepEqual(corrente([...tre, fine('b'), fine('c')]), ['leggi', 'a.js'], 'b è chiusa: non ci si ricade sopra');
  assert.deepEqual(corrente([...tre, fine('a'), fine('b'), fine('c')]), [null, null]);
  /* un esito senza avvio, e un esito ripetuto, non spostano niente */
  assert.deepEqual(corrente([...tre, fine('mai-partita')]), ['leggi', 'c.js']);
  assert.deepEqual(corrente([...tre, fine('c'), fine('c')]), ['scrivi', 'b.js']);
  /* un id riusato mentre è aperto torna a essere l'ultima partita, e UN esito lo chiude */
  assert.deepEqual(corrente([...aperta('a'), ...aperta('b'), ...aperta('a')]), ['leggi', 'a.js']);
  assert.deepEqual(corrente([...aperta('a'), ...aperta('b'), ...aperta('a'), fine('a')]), ['leggi', 'b.js']);
  /* un giro che finisce (o muore) con chiamate aperte le dimentica: il giro dopo non eredita un attrezzo «in corso» */
  for (const chiusura of ['RunFinished', 'RunError']) {
    assert.deepEqual(corrente([...tre, { type: chiusura }]), [null, null]);
    assert.deepEqual(corrente([...tre, { type: chiusura }, { type: 'RunStarted' }, ...aperta('z'), fine('z')]), [null, null], `${chiusura}: dopo, niente di vecchio torna a galla`);
  }
  /* argomenti arrivati DOPO l'esito non riaprono niente */
  assert.deepEqual(corrente([start('a'), fine('a'), args('a', 'tardi.js')]), [null, null]);
});

test('SECONDA-R4-02 [REGGE] — accumulatore ed elenco intero dicono lo stesso; mille chiamate aperte e mai chiuse non costano', () => {
  const eventi = [...aperta('a'), ...aperta('b', 'scrivi'), fine('b'), ...aperta('c'), fine('a')];
  const a = creaAccumulatoreAttivita(); for (const e of eventi) a.aggiungi(e);
  assert.deepEqual(a.riassunto(), riassuntoAttivitaSessione(eventi));
  assert.equal(a.contatori().attrezzoCorrente, a.riassunto().attrezzoCorrente, 'i contatori (i record del registro) dicono lo stesso attrezzo');
  const tante = creaAccumulatoreAttivita();
  const t0 = performance.now();
  for (let i = 0; i < 1000; i += 1) for (const e of aperta(`x${i}`)) tante.aggiungi(e);
  for (let i = 999; i >= 0; i -= 1) tante.aggiungi(fine(`x${i}`));
  const ms = performance.now() - t0;
  assert.equal(tante.riassunto().attrezzoCorrente, null);
  assert.ok(ms < 2000, `1000 aperte e poi chiuse al contrario: ${Math.round(ms)} ms`);
});

test('SECONDA-BERSAGLIO-01 [REGGE] — il bersaglio in volo: oltre il tetto niente (non un pezzo), caratteri che ingannano niente', () => {
  const con = (percorso) => corrente([start('a', 'scrivi'), args('a', percorso)])[1];
  assert.equal(con('x'.repeat(1024)), 'x'.repeat(1024));
  assert.equal(con('x'.repeat(1025)), null);
  for (const cattivo of ['a\nb.js', 'a\tb.js', 'foto‮gpj.exe', 'a‏b', 'a⁦b⁩', 'a؜b', 'a\u0085b']) assert.equal(con(cattivo), null, JSON.stringify(cattivo));
  assert.equal(con('cartella con spazi/è accentato — ok.js'), 'cartella con spazi/è accentato — ok.js', 'spazi, accenti e lineette restano');
  assert.equal(con('مجلد/ملف.js'), 'مجلد/ملف.js', 'un nome in arabo NON è un inganno: resta');
});

test('SECONDA-PASSI-01 [DIFETTO] — lo STESSO percorso che il bersaglio in volo rifiuta arriva a schermo un attimo dopo, nel passo finito', () => {
  /* La cura di S3-3 vale per `bersaglioCorrente`. Ma appena la chiamata finisce lo stesso percorso entra nei `passi` (la colonna
     «Attività recenti», la riga «Ultima attività» della scheda, gli «Eventi» del dettaglio) com'è: con l'inversione di scrittura,
     con l'a capo, o TRONCATO a 1.024. Chi guarda vede «niente» mentre l'attrezzo lavora e il nome ingannevole quando ha finito. */
  const passoDi = (percorso) => { const a = creaAccumulatoreAttivita(); for (const e of [start('a', 'scrivi'), args('a', percorso), fine('a')]) a.aggiungi(e); return a.riassunto().passi.find((p) => p.tipo === 'attrezzo').percorso; };
  assert.equal(passoDi('src/ok.js'), 'src/ok.js', 'il controllo positivo: un percorso normale c’è');
  assert.equal(passoDi('foto‮gpj.exe'), null, 'inversione della scrittura');
  assert.equal(passoDi('a\nb.js'), null, 'a capo');
  assert.equal(passoDi('x'.repeat(3000)), null, 'oltre il tetto: niente, non i primi 1.024');
});
