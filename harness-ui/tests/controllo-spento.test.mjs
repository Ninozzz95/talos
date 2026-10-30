/*
 * CONTRATTO-CONTROLLO-SPENTO (owner 29/10/2026 notte, «una volta per chat»; OK di CLI e Mobile). Quando il cancello delle scritture non
 * sa giudicare («ignoto» col motivo: sul telefono manca il compilatore) la scrittura passa come sempre, ma si dice UNA volta per chat:
 * l'evento `controllo-spento` (codice chiuso, motivo, percorso relativo) e una frase in fondo al risultato di quella scrittura. Lo stesso
 * motivo non si ripete; una scrittura giudicata davvero lo azzera; il «già detto» viaggia fra i giri (e nel giornale, lato registro).
 */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { talosLavora, premessaDellaScrittura, CODICI_CONTROLLO_SPENTO } from '../src/kernel/talosHarness.mjs';

function cartellaDiProva(t) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-controllo-spento-'));
  t.after(() => rimuoviCartellaDiProva(cartella));
  return cartella;
}
function sportello(...risposte) {
  let indice = 0;
  return async () => {
    const scelta = risposte[Math.min(indice, risposte.length - 1)];
    indice += 1;
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' };
  };
}
const FINE = { role: 'assistant', content: 'fatto', tool_calls: [] };
const scrivi = (percorso, contenuto, id) => ({ role: 'assistant', content: '', tool_calls: [{ id, function: { name: 'scrivi', arguments: JSON.stringify({ percorso, contenuto }) } }] });
const esitiDelTool = (esito) => esito.messaggiFinali.filter((m) => m.role === 'tool').map((m) => m.content);
const IGNOTO = async () => ({ stato: 'ignoto', perche: 'the semantic guard could not run (Cannot find package typescript)', codice: 'compilatore-assente', fatto: {} });

async function giro(cartella, chiamate, opzioni = {}) {
  const eventi = [];
  const esito = await talosLavora({
    cartella, task: { consegna: 'prova' }, modello: 'x', chiave: 'y',
    fetchDiRete: sportello(...chiamate, FINE),
    onGiro: (e) => { if (e.tipo === 'controllo-spento') eventi.push(e); },
    ...opzioni,
  });
  return { esito, eventi, risultati: esitiDelTool(esito) };
}

test('CSP-01 due scritture con lo stesso motivo: UN evento e UNA frase, sulla prima; la scrittura avviene comunque', async (t) => {
  const cartella = cartellaDiProva(t);
  const { esito, eventi, risultati } = await giro(cartella, [scrivi('src/a.ts', 'export const a = 1;\n', 'c1'), scrivi('src/b.ts', 'export const b = 2;\n', 'c2')], { cancelloDelleScritture: IGNOTO });
  assert.equal(eventi.length, 1);
  assert.deepEqual({ codice: eventi[0].codice, percorso: eventi[0].percorso }, { codice: 'compilatore-assente', percorso: 'src/a.ts' });
  assert.match(risultati[0], /^written: [\s\S]*\n\nNote: the reference check is unavailable here \(the semantic guard could not run \(Cannot find package typescript\)\)/u);
  assert.doesNotMatch(risultati[1], /reference check is unavailable/u, 'la seconda non lo ripete');
  assert.equal(readFileSync(join(cartella, 'src', 'b.ts'), 'utf8'), 'export const b = 2;\n', '«ignoto» non blocca');
  assert.equal(esito.controlloSpentoDetto, 'the semantic guard could not run (Cannot find package typescript)'.slice(0, 80));
});

test('CSP-02 il «già detto» che arriva dal registro (ripresa, riavvio) non fa ripetere niente', async (t) => {
  const cartella = cartellaDiProva(t);
  const detto = 'the semantic guard could not run (Cannot find package typescript)'.slice(0, 80);
  const { eventi, risultati } = await giro(cartella, [scrivi('src/a.ts', 'export const a = 1;\n', 'c1')], { cancelloDelleScritture: IGNOTO, controlloSpentoDetto: detto });
  assert.equal(eventi.length, 0);
  assert.doesNotMatch(risultati[0], /reference check is unavailable/u);
});

test('CSP-03 una scrittura giudicata davvero azzera; il guasto che torna si dice di nuovo. Un motivo diverso si dice subito', async (t) => {
  const cartella = cartellaDiProva(t);
  let n = 0;
  const alterno = async () => {
    n += 1;
    if (n === 2) return { stato: 'presente', fatto: {} };
    if (n === 4) return { stato: 'ignoto', perche: 'the semantic guard could not run (Maximum call stack size exceeded)', codice: 'errore-interno', fatto: {} };
    return IGNOTO();
  };
  const { eventi, esito } = await giro(cartella, [1, 2, 3, 4].map((i) => scrivi(`src/f${i}.ts`, `export const f${i} = ${i};\n`, `c${i}`)), { cancelloDelleScritture: alterno });
  assert.deepEqual(eventi.map((e) => [e.percorso, e.codice]), [['src/f1.ts', 'compilatore-assente'], ['src/f3.ts', 'compilatore-assente'], ['src/f4.ts', 'errore-interno']]);
  assert.match(esito.controlloSpentoDetto, /Maximum call stack/u);
});

test('CSP-04 al contrario: presente e assente non dicono niente; «assente» resta un rifiuto con la frase di sempre', async (t) => {
  const cartella = cartellaDiProva(t);
  const assente = async () => ({ stato: 'assente', perche: 'the change introduces 1 unresolved reference(s): Cannot find name \'x\'', fatto: {} });
  const { eventi, risultati, esito } = await giro(cartella, [scrivi('src/a.ts', 'export const a = x;\n', 'c1')], { cancelloDelleScritture: assente });
  assert.equal(eventi.length, 0);
  assert.match(risultati[0], /^REFUSED\. the change introduces/u);
  assert.doesNotMatch(risultati[0], /reference check is unavailable/u);
  assert.equal(esito.controlloSpentoDetto, null);
});

test('CSP-05 un percorso fuori dal progetto non va nell\'evento; il codice sconosciuto diventa errore-interno', async (t) => {
  const cartella = cartellaDiProva(t);
  const fuori = join(tmpdir(), `talos-fuori-${process.pid}.ts`);
  const strano = async () => ({ stato: 'ignoto', perche: 'qualcosa', codice: 'inventato', fatto: {} });
  const { eventi } = await giro(cartella, [scrivi(fuori, 'export const z = 1;\n', 'c1')], { cancelloDelleScritture: strano, permessi: 'Full access' });
  assert.equal(eventi.length, 1, "anche fuori dal progetto si dice, solo senza percorso");
  assert.equal(Object.hasOwn(eventi[0], 'percorso'), false, 'un percorso assoluto fuori dal progetto non entra in un evento durevole');
  assert.equal(eventi[0].codice, 'errore-interno');
  rimuoviCartellaDiProva(fuori);
});

test('CSP-06 premessaDellaScrittura: il codice viaggia col motivo; senza motivo niente codice', async (t) => {
  const cartella = cartellaDiProva(t);
  const conCodice = await premessaDellaScrittura(cartella, 'src/x.ts', 'export const z = 1;\n', { cancello: IGNOTO });
  assert.deepEqual([conCodice.stato, conCodice.codice], ['ignoto', 'compilatore-assente']);
  assert.ok(CODICI_CONTROLLO_SPENTO.includes(conCodice.codice));
  const senza = await premessaDellaScrittura(cartella, 'src/y.ts', 'export const y = 1;\n', { cancello: async () => ({ stato: 'ignoto', fatto: {} }) });
  assert.equal(Object.hasOwn(senza, 'codice'), false);
});

test('CSP-07 il codice nasce dove il cancello si rompe: libreria, compilatore, e tutto il resto errore-interno', async (t) => {
  const cartella = cartellaDiProva(t);
  const rotto = (codiceCancello) => async () => { throw Object.assign(new Error('rotto'), codiceCancello ? { codiceCancello } : {}); };
  for (const [codiceCancello, atteso] of [['libreria-assente', 'libreria-assente'], ['compilatore-assente', 'compilatore-assente'], ['inventato', 'errore-interno'], [null, 'errore-interno']]) {
    const p = await premessaDellaScrittura(cartella, 'src/x.ts', 'export const z = 1;\n', { cancello: rotto(codiceCancello) });
    assert.deepEqual([p.stato, p.perche, p.codice], ['ignoto', 'rotto', atteso], `codiceCancello=${codiceCancello}`);
  }
});

test('CSP-08 la chiave è il motivo tagliato a 80: un motivo lungo già detto (come lo ridà il registro) non si ripete; uno che differisce solo oltre l\'80 nemmeno', async (t) => {
  const cartella = cartellaDiProva(t);
  const lungo = `the semantic guard could not run (${'Cannot find module node_modules/typescript/lib/typescript.js '.repeat(3)})`;
  assert.ok(lungo.length > 120, 'premessa: il motivo supera gli 80 caratteri');
  const spento = (perche) => async () => ({ stato: 'ignoto', perche, codice: 'compilatore-assente', fatto: {} });
  const ripreso = await giro(cartella, [scrivi('src/a.ts', 'export const a = 1;\n', 'c1')], { cancelloDelleScritture: spento(lungo), controlloSpentoDetto: lungo.slice(0, 80) });
  assert.equal(ripreso.eventi.length, 0, 'già detto (la chiave salvata è tagliata a 80)');
  assert.equal(ripreso.esito.controlloSpentoDetto.length, 80);
  const coda = await giro(cartella, [scrivi('src/b.ts', 'export const b = 1;\n', 'c1')], { cancelloDelleScritture: spento(`${lungo} (altro)`), controlloSpentoDetto: lungo.slice(0, 80) });
  assert.equal(coda.eventi.length, 0, 'stesso guasto con un dettaglio diverso in coda: non si ripete');
});
