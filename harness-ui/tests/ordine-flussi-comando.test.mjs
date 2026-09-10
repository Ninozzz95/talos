import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';

/*
 * ⛔⛔ D-10C — stdout e stderr erano fusi E RIORDINATI.
 *
 * Misurato il 10/09: `console.log('FUORI-1'); console.error('ERRORE-1'); console.log('FUORI-2')`
 * usciva come «FUORI-1\nFUORI-2\n\nERRORE-1». Non un caso limite: due array separati, concatenati
 * alla fine, non sanno in che ordine sono arrivati. E quando si legge un errore, sapere DOPO QUALE
 * RIGA è comparso è metà dell'informazione.
 *
 * Ricerca 10/09/2026 (nodejs/node issue #9214; l'opzione `all` di execa, che «interleaves stdout and
 * stderr by creating a mixed stream»): l'ordine si preserva facendo passare i due flussi per LO
 * STESSO collo mentre arrivano.
 *
 * ⛔ Questa prova NON importa il kernel (è un file da 370 KB con dipendenze pesanti): riproduce lo
 *   stesso identico schema di raccolta e prova che l'ordine regge. È il caso del debito, verbatim.
 */

/** Lo schema che il kernel usa ora: due array per il contratto, uno solo per l'ordine. */
function raccogli(processo) {
  return new Promise((risolvi) => {
    const pezziFuori = [];
    const pezziErrori = [];
    const pezziInsieme = [];
    processo.stdout?.on('data', (d) => { pezziFuori.push(d); pezziInsieme.push(d); });
    processo.stderr?.on('data', (d) => { pezziErrori.push(d); pezziInsieme.push(d); });
    processo.on('close', (codice) => risolvi({
      codice,
      fuori: Buffer.concat(pezziFuori).toString('utf8'),
      errori: Buffer.concat(pezziErrori).toString('utf8'),
      insieme: Buffer.concat(pezziInsieme).toString('utf8'),
    }));
  });
}

/* Scrive in ordine e ASPETTA che ogni riga sia uscita: senza, si misurerebbe il buffer, non l'ordine. */
const SCRIPT = `
const scrivi = (flusso, testo) => new Promise((ok) => flusso.write(testo + '\\n', ok));
await scrivi(process.stdout, 'FUORI-1');
await scrivi(process.stderr, 'ERRORE-1');
await scrivi(process.stdout, 'FUORI-2');
`;

test('D-10C: l’ordine cronologico fra stdout e stderr è preservato', async () => {
  const p = spawn(process.execPath, ['--input-type=module', '-e', SCRIPT], { windowsHide: true });
  const esito = await raccogli(p);

  const righe = esito.insieme.split('\n').map((r) => r.trim()).filter(Boolean);
  assert.deepEqual(righe, ['FUORI-1', 'ERRORE-1', 'FUORI-2'],
    `⛔ l'errore deve stare DOVE è comparso, fra le due righe di output. Trovato: ${JSON.stringify(esito.insieme)}`);
});

/* ⛔ Il contratto di prima non cambia: chi legge `fuori`/`errori` vede esattamente quello che vedeva. */
test('D-10C: `fuori` ed `errori` restano separati e completi, come prima', async () => {
  const p = spawn(process.execPath, ['--input-type=module', '-e', SCRIPT], { windowsHide: true });
  const esito = await raccogli(p);

  assert.deepEqual(esito.fuori.split('\n').filter(Boolean), ['FUORI-1', 'FUORI-2']);
  assert.deepEqual(esito.errori.split('\n').filter(Boolean), ['ERRORE-1']);
  /* E l'insieme contiene esattamente gli stessi byte, né uno in più né uno in meno. */
  assert.equal(esito.insieme.length, esito.fuori.length + esito.errori.length);
});

test('D-10C, AL CONTRARIO: un comando che scrive solo su stdout non cambia di una virgola', async () => {
  const p = spawn(process.execPath, ['-e', "process.stdout.write('solo output\\n')"], { windowsHide: true });
  const esito = await raccogli(p);
  assert.equal(esito.insieme, esito.fuori);
  assert.equal(esito.errori, '');
});

test('D-10C, AL CONTRARIO: un comando muto non inventa un insieme', async () => {
  const p = spawn(process.execPath, ['-e', '0'], { windowsHide: true });
  const esito = await raccogli(p);
  assert.equal(esito.insieme, '');
  assert.equal(esito.codice, 0);
});
