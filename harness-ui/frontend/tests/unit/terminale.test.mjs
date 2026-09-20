import test from 'node:test';
import assert from 'node:assert/strict';
import { titoloScheda, nomeShell, prossimaAttivaDopoChiusura, cicla, nomeSchedaValido, SCHEDE_MASSIME, accorciaPercorso, codaDelPiede, TESTI } from '../../src/components/terminale.js';

// 06/09 B1 — le schede del Terminale: nomi, fuoco alla chiusura, ciclo, tetto.

test('TERMINALE-NOMI: la shell dichiarata dal server dà il nome; le omonime si numerano; il nome scelto vince', () => {
  assert.equal(nomeShell('git-bash'), 'Git Bash');
  assert.equal(nomeShell('cmd-fallback'), 'cmd.exe');
  assert.equal(nomeShell('posix-shell', '/usr/bin/zsh'), 'zsh');
  assert.equal(nomeShell(undefined), 'shell');
  const a = { terminalId: 'a', origine: 'tu', shell: 'git-bash' };
  const b = { terminalId: 'b', origine: 'tu', shell: 'git-bash' };
  const c = { terminalId: 'c', origine: 'tu', shell: 'git-bash', titolo: 'build' };
  assert.equal(titoloScheda(a, [a, b, c]), 'tu · Git Bash');
  assert.equal(titoloScheda(b, [a, b, c]), 'tu · Git Bash 2');
  assert.equal(titoloScheda(c, [a, b, c]), 'build');
  assert.equal(titoloScheda({ terminalId: 'g', origine: 'agente', giro: 7 }), 'agente · giro 7');
});

test('TERMINALE-CHIUSURA: il fuoco passa alla vicina che prende il posto, poi alla precedente, poi a nessuna (Hermes closeTerminal)', () => {
  assert.equal(prossimaAttivaDopoChiusura(['a', 'b', 'c'], 1), 'c');
  assert.equal(prossimaAttivaDopoChiusura(['a', 'b', 'c'], 2), 'b');
  assert.equal(prossimaAttivaDopoChiusura(['a'], 0), null);
});

test('TERMINALE-CICLO: frecce cicliche; con una scheda sola resta lì', () => {
  assert.equal(cicla(['a', 'b', 'c'], 'c', 1), 'a');
  assert.equal(cicla(['a', 'b', 'c'], 'a', -1), 'c');
  assert.equal(cicla(['a'], 'a', 1), 'a');
  assert.equal(cicla([], null, 1), null);
});

test('TERMINALE-NOME-VALIDO e tetto: vuoto no, 41 caratteri no; il tetto è quello del server (8)', () => {
  assert.equal(nomeSchedaValido('  '), false);
  assert.equal(nomeSchedaValido('x'.repeat(41)), false);
  assert.equal(nomeSchedaValido('build'), true);
  assert.equal(SCHEDE_MASSIME, 8);
});

/*
 * ⛔ 07/9, visto in una foto: nel piede del Terminale il percorso era tagliato in CODA, e spariva
 *   proprio il nome della cartella dove i comandi girano. Si taglia nel mezzo, come fa un editor.
 */
test('IL PERCORSO SI TAGLIA NEL MEZZO: restano la radice e la cartella vera', () => {
  // ⛔ i separatori si scrivono con `String.raw`: scritti a mano, un `\U` o un `\a` diventa un
  //    escape JS e la fixture arriva alla funzione SENZA separatori — la prova misurerebbe altro.
  const lungo = String.raw`C:\Users\esempio\AppData\Local\Temp\claude\C--Users-esempio-Desktop\af5c3844\scratchpad\progetto-5`;
  const corto = accorciaPercorso(lungo);
  assert.ok(corto.length <= 46, `troppo lungo: ${corto.length}`);
  // ⛔ niente String.raw che finisce con un separatore: un backslash prima del backtick sfugge il
  //    backtick stesso e il file non compila più. Qui i separatori si scrivono raddoppiati.
  assert.ok(corto.startsWith('C:\\Users\\'), `la radice dice di che disco e di chi è: ${corto}`);
  assert.ok(corto.endsWith('\\progetto-5'), `la coda è la cartella dove i comandi girano: ${corto}`);
  assert.match(corto, /…/, 'e si vede che in mezzo manca qualcosa');
  /* ⛔ e il taglio cade su un CONFINE: ogni cartella che resta dopo l'ellissi è un nome intero del
     percorso di partenza, non un moncone come «hpad». Non si guarda il carattere dopo l'ellissi —
     lì c'è giustamente l'inizio di un nome — ma i nomi stessi. */
  const segmenti = corto.split('…')[1].split(/[\\/]/).filter(Boolean);
  const veri = new Set(lungo.split(/[\\/]/));
  for (const s of segmenti) assert.ok(veri.has(s), `«${s}» non è una cartella vera: ${corto}`);
});

test('AL CONTRARIO — un percorso che ci sta non si tocca', () => {
  const corto = String.raw`C:\lavoro\talos`;
  assert.equal(accorciaPercorso(corto), corto);
  assert.equal(accorciaPercorso(''), '');
  assert.equal(accorciaPercorso(null), '');
});

/*
 * BC-68, 17/09 — la coda del piede. La regola è del 07/09 e viveva dentro `renderizza`, dove
 * nessuna prova poteva chiamarla; la scheda della coda la dava per rotta e la misura del 17/09 dice
 * di no. Estratta e provata, così il prossimo giro non può romperla in silenzio.
 */
test('PIEDE-CODA: dove c’è un percorso, la frase generica NON si aggiunge', () => {
  assert.equal(codaDelPiede({ dettaglio: String.raw`C:\progetti\AVM` }), '');
  assert.equal(codaDelPiede({ dettaglio: '' }), TESTI.nota, 'senza percorso la spiegazione ha senso e resta');
  assert.equal(codaDelPiede({}), TESTI.nota);
  assert.equal(codaDelPiede(), TESTI.nota);
});

test('PIEDE-CODA al contrario: una nota esplicita comanda, anche vuota', () => {
  assert.equal(codaDelPiede({ nota: 'Premi Nuovo per aprire una shell in questa cartella.', dettaglio: String.raw`C:\x` }), 'Premi Nuovo per aprire una shell in questa cartella.');
  /* ⛔ La stringa vuota è una SCELTA di chi chiama, non un valore mancante: `??` la rispetta,
     `||` l'avrebbe scambiata per «non passata» e avrebbe rimesso la frase generica accanto al
     percorso — cioè esattamente il difetto che questa regola esiste per impedire. */
  assert.equal(codaDelPiede({ nota: '', dettaglio: '' }), '');
});
