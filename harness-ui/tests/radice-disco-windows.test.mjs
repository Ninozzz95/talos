import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/*
 * ⛔⛔ 08/09/2026 — SU WINDOWS `"C:"` NON È LA RADICE DEL DISCO.
 *
 * È il percorso *relativo al drive*, cioè la directory corrente del processo. Misurato su questa
 * macchina, con uno script su file (mai `node -e`: in questo progetto la shell ha già mangiato
 * gli escape e prodotto un difetto):
 *     readdir("C:")   → 34 voci: .automations .hooks-trust .local-models …   (cioè harness-ui/)
 *     readdir("C:\\")  → 47 voci: $RECYCLE.BIN AMD .cache …                  (la radice vera)
 *
 * `discoNode` toglieva la barra finale dalla radice — giusto per `…/progetto/`, sbagliato per
 * `C:\\` — e una sessione col disco come workspace leggeva la cartella del server invece della
 * radice, senza che niente lo dicesse. Trovato curando le sessioni delegate che giravano in `C:\\`:
 * chiedevano `cerca` e ricevevano i file del server.
 *
 * ⛔ Il difetto NON era in `path.join`, che normalizza `join("C:", x)` in `C:\\x`: la prima ipotesi
 *   lo accusava, e la misura l'ha scagionato. È nel ramo di `dentro()` col percorso vuoto, che
 *   restituisce la radice grezza senza passare da `join`.
 *
 * La prova legge il SORGENTE perché `discoNode` non è esportata: è una funzione interna al modulo,
 * e la sua unica porta è il disco vero — che una prova unitaria non deve toccare.
 */

const SORGENTE = new URL('../src/kernel/dist/kernelPerIlBanco.js', import.meta.url);

test('LA RADICE DI UN DRIVE tiene la sua barra: «C:» da solo è la directory corrente', async () => {
  const codice = await readFile(SORGENTE, 'utf8');
  const senzaCommenti = codice.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(
    senzaCommenti,
    /\/\^\[A-Za-z\]:\$\/\.test\(/,
    'manca la guardia sul drive nudo: senza, «C:\\» diventa «C:» e si legge la cartella del server',
  );
});

test('AL CONTRARIO — una cartella normale perde la barra finale, come prima', async () => {
  const codice = await readFile(SORGENTE, 'utf8');
  const senzaCommenti = codice.replace(/\/\*[\s\S]*?\*\//g, '');
  // lo `replace` che normalizza deve restare: la cura aggiunge un caso, non sostituisce la regola
  assert.ok(senzaCommenti.includes('o.radice.replace('),
    'la normalizzazione delle barre finali non va tolta: serve a tutte le cartelle che non sono un drive');
});

test('IL COMPORTAMENTO VERO di readdir, sulla macchina che esegue', async (t) => {
  if (process.platform !== 'win32') return t.skip('vale solo su Windows: altrove «C:» non significa niente');
  const { readdir } = await import('node:fs/promises');
  const radiceVera = await readdir('C:' + String.fromCharCode(92), { withFileTypes: true });
  const drivNudo = await readdir('C:', { withFileTypes: true });
  const nomiRadice = new Set(radiceVera.map((v) => v.name));
  const nomiNudo = drivNudo.map((v) => v.name);
  // ⛔ è il fatto che rende necessaria la cura: i due elenchi NON coincidono.
  // 13/09: sui runner GitHub la cartella corrente del processo È la radice del drive di lavoro,
  // quindi «C:» e «C:\» coincidono per costruzione: lì la premessa non si può osservare, si
  // dichiara (skip col motivo), non si finge di averla misurata.
  const coincidono = !nomiNudo.some((n) => !nomiRadice.has(n)) && nomiNudo.length === radiceVera.length;
  if (coincidono) return t.skip('«C:» e «C:\\» danno lo stesso elenco su questa macchina (cwd sulla radice del drive, tipico di un runner CI): la premessa non è osservabile qui');
  assert.ok(!coincidono);
});
