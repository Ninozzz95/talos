import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

/*
 * ⛔⛔ D-10C — stdout e stderr erano fusi E RIORDINATI.
 *
 * Misurato il 10/09: `console.log('FUORI-1'); console.error('ERRORE-1'); console.log('FUORI-2')`
 * usciva come «FUORI-1\nFUORI-2\n\nERRORE-1». Due array separati, concatenati alla fine, non sanno
 * in che ordine sono arrivati. E quando si legge un errore, sapere DOPO QUALE RIGA è comparso è metà
 * dell'informazione.
 *
 * Ricerca 10/09/2026 (nodejs/node issue #9214; l'opzione `all` di execa, che «interleaves stdout and
 * stderr by creating a mixed stream»): l'ordine si preserva facendo passare i due flussi per LO
 * STESSO collo mentre arrivano.
 *
 * ## ⛔ Che cosa questa prova garantisce, e che cosa NON può garantire
 *
 * La prima versione di questo file lanciava un processo vero e pretendeva `FUORI-1, ERRORE-1,
 * FUORI-2`. Passava da sola e **cadeva dentro la suite completa**: due pipe distinte non garantiscono
 * l'ordine di CONSEGNA al padre quando la macchina è carica — lo decide il sistema operativo, non noi.
 * Un test che pretende una cosa che il SO non promette non prova il codice: prova il carico.
 *
 * ⇒ Qui si separano le due cose. La logica che ho cambiato — «ciò che arriva prima finisce prima
 *   nell'accumulatore» — si prova in modo **deterministico**, con due sorgenti finte. Col processo
 *   vero si prova ciò che è davvero garantito: che `insieme` contenga tutto, senza perdere né
 *   duplicare un byte.
 */

/** Lo schema che il kernel usa ora: due accumulatori per il contratto, uno solo per l'ordine. */
function raccogli(processo) {
  return new Promise((risolvi) => {
    let fuori = '';
    let errori = '';
    let insieme = '';
    processo.stdout?.on('data', (d) => { fuori += d; insieme += d; });
    processo.stderr?.on('data', (d) => { errori += d; insieme += d; });
    processo.on('close', (codice) => risolvi({ codice, fuori, errori, insieme }));
  });
}

/** Due flussi finti che consegnano in un ordine che decido io: qui l'ordine è un fatto, non una gara. */
function processoFinto() {
  const p = new EventEmitter();
  p.stdout = new EventEmitter();
  p.stderr = new EventEmitter();
  return p;
}

test('D-10C: ciò che arriva prima finisce prima — la riga di errore resta al suo posto', async () => {
  const p = processoFinto();
  const atteso = raccogli(p);
  /* L'ordine di consegna, deciso qui: output, errore, output. È il caso esatto del debito. */
  p.stdout.emit('data', 'FUORI-1\n');
  p.stderr.emit('data', 'ERRORE-1\n');
  p.stdout.emit('data', 'FUORI-2\n');
  p.emit('close', 0);
  const esito = await atteso;

  assert.deepEqual(esito.insieme.split('\n').filter(Boolean), ['FUORI-1', 'ERRORE-1', 'FUORI-2'],
    `⛔ l'errore deve stare DOVE è comparso. Trovato: ${JSON.stringify(esito.insieme)}`);
  /* ⛔ E il contratto di prima non cambia di un byte: chi legge `fuori`/`errori` vede quel che vedeva. */
  assert.deepEqual(esito.fuori.split('\n').filter(Boolean), ['FUORI-1', 'FUORI-2']);
  assert.deepEqual(esito.errori.split('\n').filter(Boolean), ['ERRORE-1']);
});

test('D-10C: con molti pezzi alternati l’ordine regge, e nessun byte si perde', async () => {
  const p = processoFinto();
  const atteso = raccogli(p);
  const dati = [];
  for (let i = 0; i < 50; i += 1) {
    const flusso = i % 3 === 0 ? 'stderr' : 'stdout';
    const pezzo = `${flusso === 'stderr' ? 'E' : 'F'}${i}\n`;
    dati.push(pezzo);
    p[flusso].emit('data', pezzo);
  }
  p.emit('close', 0);
  const esito = await atteso;
  assert.equal(esito.insieme, dati.join(''), 'l’ordine di arrivo è quello, tutto e solo quello');
  assert.equal(esito.insieme.length, esito.fuori.length + esito.errori.length, 'né perso né duplicato');
});

/* ⛔ AL CONTRARIO: solo output, e l'insieme è identico — nessuna riga vuota di troppo dal vecchio `\n`. */
test('D-10C, AL CONTRARIO: solo stdout non cambia di una virgola', async () => {
  const p = processoFinto();
  const atteso = raccogli(p);
  p.stdout.emit('data', 'solo output\n');
  p.emit('close', 0);
  const esito = await atteso;
  assert.equal(esito.insieme, esito.fuori);
  assert.equal(esito.errori, '');
});

test('D-10C, AL CONTRARIO: un comando muto non inventa un insieme', async () => {
  const p = processoFinto();
  const atteso = raccogli(p);
  p.emit('close', 0);
  const esito = await atteso;
  assert.equal(esito.insieme, '');
});

/*
 * Col processo VERO si prova solo ciò che il sistema garantisce: che tutto arrivi. L'ordine fra due
 * pipe sotto carico non è nostro da promettere — vedi il blocco in testa a questo file.
 */
test('D-10C: con un processo vero, `insieme` contiene tutto ciò che i due flussi hanno prodotto', async () => {
  const script = "process.stdout.write('A\\n'); process.stderr.write('B\\n'); process.stdout.write('C\\n');";
  const p = spawn(process.execPath, ['-e', script], { windowsHide: true });
  const esito = await raccogli(p);
  for (const atteso of ['A', 'B', 'C']) assert.ok(esito.insieme.includes(atteso), `manca ${atteso}`);
  assert.equal(esito.insieme.length, esito.fuori.length + esito.errori.length);
});
