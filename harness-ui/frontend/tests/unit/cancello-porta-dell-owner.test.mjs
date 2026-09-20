import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

/*
 * ⭐⭐⭐ BC-74 (17/09/2026) — NESSUNO SCRIPT PUNTA AL 4174 PER RIPIEGO.
 *
 * Il 4174 è il server VIVO dell'owner. La regola di casa è vecchia («le sonde non toccano il
 * 4174»), ma viveva nella memoria di chi lanciava: tre script la violavano con un `|| 4174`, e il
 * 17/09 uno di quei tre l'ho lanciato io senza sapere dove puntasse — ha aperto i veli sulle
 * sessioni vere dell'owner.
 *
 * ⛔ Perché una prova sui SORGENTI e non sul comportamento: il difetto è il RIPIEGO, cioè ciò che
 *   succede quando nessuno dice niente. Provarlo eseguendo vorrebbe dire lanciare gli script — e
 *   se il ripiego c'è ancora, la prova stessa andrebbe a bussare al 4174. Una prova che per
 *   misurare il danno lo fa non è una prova.
 * ⛔ Non vieta il numero: vieta il RIPIEGO. `4174` può comparire in un commento, in un messaggio
 *   d'errore o in un confronto che lo RIFIUTA (`if (porta === 4174) muori(...)`, il precedente di
 *   `cancello.mjs`). Quello che non può comparire è `qualcosa || 'http://…4174…'`.
 */

const QUI = fileURLToPath(new URL('.', import.meta.url));
const RADICE_FRONTEND = join(QUI, '..', '..');
const RADICE_HARNESS = join(RADICE_FRONTEND, '..');

/** Ogni `.mjs` sotto una cartella di script, ricorsivo. */
function scriptSotto(cartella) {
  const trovati = [];
  const visita = (dove) => {
    for (const voce of readdirSync(dove)) {
      const percorso = join(dove, voce);
      if (voce === 'node_modules' || voce === 'dist') continue;
      if (statSync(percorso).isDirectory()) { visita(percorso); continue; }
      if (percorso.endsWith('.mjs')) trovati.push(percorso);
    }
  };
  visita(cartella);
  return trovati;
}

/** Un RIPIEGO è un `||`/`??` seguito da un indirizzo che contiene la porta dell'owner. */
const RIPIEGO = /(\|\||\?\?)\s*['"`][^'"`]*:4174/u;

test('BC-74 — nessuno script sceglie il 4174 da solo: senza indirizzo si rifiuta di partire', () => {
  const script = [...scriptSotto(join(RADICE_HARNESS, 'scripts')), ...scriptSotto(join(RADICE_FRONTEND, 'scripts'))];
  assert.ok(script.length >= 10, `⛔ il cancello non sta guardando niente: ${script.length} script trovati`);
  const colpevoli = script.filter((percorso) => RIPIEGO.test(readFileSync(percorso, 'utf8')));
  assert.deepEqual(colpevoli.map((p) => p.replace(RADICE_HARNESS, '')), [],
    '⛔ un ripiego sul 4174 fa bussare al server vivo dell\'owner chiunque lanci lo script senza leggerlo');
});

test('BC-74, al contrario — il cancello MORDE su un ripiego, e NON su un rifiuto esplicito', () => {
  /*
   * ⛔ Una prova che non può fallire non sta provando: qui si mostra al cancello un ripiego finto
   *   (deve accusarlo) e il modo giusto di nominare la porta (non deve accusarlo). Senza questa
   *   coppia, una regex sbagliata resterebbe verde per sempre.
   */
  assert.ok(RIPIEGO.test("const BASE = process.env.X || 'http://127.0.0.1:4174/';"), 'un ripiego va accusato');
  assert.ok(RIPIEGO.test('const BASE = arg ?? "http://localhost:4174";'), 'anche con ?? e le doppie virgolette');
  assert.equal(RIPIEGO.test("if (porta === 4174) muori('la porta scelta è la 4174, che è dell\\'owner');"), false, 'un rifiuto esplicito è il comportamento VOLUTO');
  assert.equal(RIPIEGO.test("console.error('⛔ Il 4174 è il server vivo dell\\'owner: va scritto per nome.');"), false, 'e nominarlo in un messaggio non è puntarci');
});

test('BC-74 — i tre script della corsia PO-27 dicono cosa fare e si fermano con un codice diverso da zero', () => {
  for (const percorso of [
    join(RADICE_FRONTEND, 'scripts', 'cancello', 'veli-sani.mjs'),
    join(RADICE_HARNESS, 'scripts', 'qa-visual-pipeline.mjs'),
    join(RADICE_FRONTEND, 'scripts', 'diagnose-interaction-lag.mjs'),
  ]) {
    const testo = readFileSync(percorso, 'utf8');
    assert.match(testo, /process\.exit\(2\)/u, `⛔ ${percorso}: senza indirizzo deve fermarsi, non proseguire`);
    assert.match(testo, /va scritto per nome/u, `⛔ ${percorso}: e deve DIRE come si fa, non solo rifiutare`);
  }
});
