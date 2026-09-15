/*
 * ⭐⭐⭐ BC-15 — «Migliora il prompt», il pannello del composer.
 *
 * Le parti pure si provano da sole; il pannello si monta su un DOM finto, come fanno già
 * `tests/unit/blocco-codice.test.mjs` e `tests/unit/browser-vivo.test.mjs` (questo repo non
 * carica jsdom nelle unit — verificato l'11/09: `import('jsdom')` fallisce).
 *
 * ⛔ Ogni comportamento è provato ANCHE AL VERSO CONTRARIO: che col composer vuoto NON si
 *   chiami il modello, che una risposta senza testo NON diventi un esito, che una risposta
 *   in ritardo NON scavalchi quella nuova, e che nel file non ci sia un solo colore scritto a
 *   mano — un `#fff` qui sarebbe un lampo bianco su un'app scura.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  PROFONDITA,
  PROFONDITA_PREDEFINITA,
  anteprimaOriginale,
  descriviProfondita,
  etichettaModello,
  messaggioErrore,
  montaMiglioraPrompt,
  riassumiEsito,
} from '../../src/components/migliora-prompt.js';

/* ------------------------------------------------------------------ DOM finto */

function nodoFinto(tag) {
  const attributi = new Map();
  const nodo = {
    tag,
    figli: [],
    ascolti: [],
    dataset: {},
    style: new Proxy({ cssText: '' }, {}),
    hidden: false,
    disabled: false,
    id: '',
    type: '',
    className: '',
    fuoco: 0,
    testoProprio: null,
    get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
    set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; },
    setAttribute: (k, v) => attributi.set(k, String(v)),
    getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
    append: (...x) => nodo.figli.push(...x),
    replaceChildren: (...x) => { nodo.figli = [...x]; nodo.testoProprio = null; },
    remove: () => { nodo.rimosso = true; },
    focus: () => { nodo.fuoco += 1; },
    addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
    lancia: (t, e = {}) => nodo.ascolti.filter((a) => a.t === t).forEach((a) => a.m({ type: t, preventDefault() {}, ...e })),
    /** Cerca in profondità per chiave di `dataset`: il finto non ha querySelector. */
    perDato: (chiave) => (Object.hasOwn(nodo.dataset, chiave) ? nodo : nodo.figli.map((f) => f.perDato?.(chiave)).find(Boolean) || null),
    tuttiPerDato: (chiave) => [
      ...(Object.hasOwn(nodo.dataset, chiave) ? [nodo] : []),
      ...nodo.figli.flatMap((f) => f.tuttiPerDato?.(chiave) ?? []),
    ],
  };
  return nodo;
}
const documentoFinto = () => ({ createElement: (tag) => nodoFinto(tag) });

function monta(opzioni = {}) {
  const chiamate = [];
  const applicati = [];
  const copiati = [];
  const pannello = montaMiglioraPrompt({
    document: documentoFinto(),
    modello: 'z-ai/glm-5.3-flash',
    leggiPrompt: () => 'scrivi il test',
    applica: (scelta) => applicati.push(scelta),
    copiaTesto: async (testo) => { copiati.push(testo); },
    chiedi: async (richiesta) => {
      chiamate.push(richiesta);
      return { promptMigliorato: 'Obiettivo: scrivere il test.', sintesi: 'Obiettivo esplicito.', principi: ['obiettivo esplicito'], modello: 'z-ai/glm-5.3-flash', profondita: richiesta.profondita, promptOriginale: richiesta.prompt };
    },
    ...opzioni,
  });
  return { pannello, chiamate, applicati, copiati };
}

/* ------------------------------------------------------------------ parti pure */

test('MIGLIORA-PROFONDITA: tre livelli, non un cursore — e il predefinito è l\'equilibrato', () => {
  assert.deepEqual(PROFONDITA.map((v) => v.valore), ['concisa', 'equilibrata', 'estesa']);
  assert.equal(PROFONDITA_PREDEFINITA, 'equilibrata');
  assert.equal(descriviProfondita('estesa').nome, 'Estesa');
  // AL CONTRARIO: un valore che non esiste non rompe niente, ricade sul caso normale
  assert.equal(descriviProfondita('fortissima').valore, 'equilibrata');
  assert.equal(descriviProfondita(undefined).valore, 'equilibrata');
  // ogni livello dice cosa cambia: una riga vuota qui sarebbe una scelta senza conseguenze dichiarate
  for (const voce of PROFONDITA) assert.ok(voce.spiega.length > 20, `${voce.valore} deve spiegarsi`);
});

test('MIGLIORA-ANTEPRIMA: l\'originale si riconosce, non si rilegge — e non si spezza a metà parola', () => {
  assert.equal(anteprimaOriginale('  ciao   come   stai  '), 'ciao come stai');
  const lungo = 'parola '.repeat(60).trim();
  const corto = anteprimaOriginale(lungo, 50);
  assert.ok(corto.length <= 51, `atteso al più 51 caratteri, ricevuti ${corto.length}`);
  assert.ok(corto.endsWith('…'));
  assert.ok(!corto.includes('paro…'), 'il taglio cade su uno spazio, non dentro una parola');
  // AL CONTRARIO: niente stringa, niente anteprima — e nessuna eccezione
  assert.equal(anteprimaOriginale(null), '');
  assert.equal(anteprimaOriginale(42), '');
});

test('MIGLIORA-ESITO: senza testo riscritto NON c\'è esito, e i principi si fermano a otto', () => {
  assert.equal(riassumiEsito(null), null);
  assert.equal(riassumiEsito({ promptMigliorato: '   ' }), null, 'uno spazio non è una riscrittura');
  assert.equal(riassumiEsito({ sintesi: 'ho migliorato tutto' }), null, 'la sintesi da sola non basta');
  const letto = riassumiEsito({
    promptMigliorato: '  Obiettivo: x.  ', sintesi: ' resa esplicita ',
    principi: ['uno', '', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'],
    modello: 'm/uno', profondita: 'estesa',
  });
  assert.equal(letto.promptMigliorato, 'Obiettivo: x.');
  assert.equal(letto.sintesi, 'resa esplicita');
  assert.equal(letto.principi.length, 8);
  assert.ok(!letto.principi.includes(''));
  assert.equal(letto.profondita, 'estesa');
});

test('MIGLIORA-ERRORI: tre guasti diversi, tre frasi diverse — ognuna dice il gesto da fare', () => {
  const chiave = messaggioErrore({ code: 'PROVIDER_KEY_REQUIRED' });
  const motore = messaggioErrore({ code: 'RUNTIME_NOT_AVAILABLE' });
  const formato = messaggioErrore({ code: 'PROVIDER_RUNTIME_UNAVAILABLE' });
  assert.equal(new Set([chiave, motore, formato]).size, 3, 'tre guasti diversi non condividono un messaggio');
  assert.match(chiave, /Provider/u);
  assert.match(motore, /Laboratorio modelli/u);
  assert.match(formato, /Riprova/u);
  // AL CONTRARIO: un codice mai visto non produce un messaggio vuoto né il nome tecnico a schermo
  const ignoto = messaggioErrore({ code: 'QUALCOSA_DI_NUOVO' });
  assert.ok(ignoto.length > 10);
  assert.ok(!ignoto.includes('QUALCOSA_DI_NUOVO'));
});

test('MIGLIORA-NOME: a schermo il nome umano del modello, mai la targa del runtime (H22)', () => {
  assert.equal(etichettaModello('z-ai/glm-5.3-flash'), 'glm-5.3-flash');
  assert.equal(etichettaModello(''), 'il modello di questa chat');
  assert.ok(!etichettaModello('local:unsloth-Qwen3-8-27B-GGUF-4ca720788d1e-Qwen3-8-27B-UD-Q4-K-M-gguf').includes('4ca720788d1e'));
});

/* ------------------------------------------------------------------ il pannello */

test('MIGLIORA-APRE: si apre sulla domanda, col livello equilibrato scelto e il modello dichiarato', () => {
  const { pannello } = monta();
  pannello.apri();
  assert.equal(pannello.stato().fase, 'scelta');
  assert.equal(pannello.elemento.hidden, false);
  const linguette = pannello.elemento.tuttiPerDato('miglioraProfondita');
  assert.equal(linguette.length, 3);
  assert.deepEqual(linguette.map((l) => l.getAttribute('aria-selected')), ['false', 'true', 'false']);
  assert.match(pannello.elemento.perDato('miglioraProvenienza').textContent, /glm-5\.3-flash/u);
  assert.match(pannello.elemento.perDato('miglioraSpiegazione').textContent, /briefing chiaro/u);
});

test('MIGLIORA-LIVELLO: scegliere «Estesa» sposta la selezione e cambia la riga che spiega', () => {
  const { pannello } = monta();
  pannello.apri();
  pannello.elemento.tuttiPerDato('miglioraProfondita')[2].lancia('click');
  assert.equal(pannello.stato().profondita, 'estesa');
  assert.deepEqual(pannello.elemento.tuttiPerDato('miglioraProfondita').map((l) => l.getAttribute('aria-selected')), ['false', 'false', 'true']);
  assert.match(pannello.elemento.perDato('miglioraSpiegazione').textContent, /criteri di accettazione/u);
});

test('MIGLIORA-GIRO: chiede col testo del composer ADESSO e col livello scelto, poi mostra prima e dopo', async () => {
  const { pannello, chiamate } = monta({ leggiPrompt: () => '  scrivi il test  ' });
  pannello.apri();
  pannello.elemento.tuttiPerDato('miglioraProfondita')[0].lancia('click');
  pannello.elemento.perDato('miglioraAvvia').lancia('click');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chiamate, [{ prompt: 'scrivi il test', profondita: 'concisa' }]);
  assert.equal(pannello.stato().fase, 'esito');
  assert.equal(pannello.elemento.perDato('miglioraPrima').textContent, 'scrivi il test');
  assert.equal(pannello.elemento.perDato('miglioraDopo').textContent, 'Obiettivo: scrivere il test.');
  assert.match(pannello.elemento.perDato('miglioraSintesi').textContent, /Cosa è cambiato/u);
  assert.equal(pannello.elemento.perDato('miglioraPrincipi').figli.length, 1);
});

test('MIGLIORA-DECISIONE: «Sostituisci» e «Aggiungi sotto» consegnano il testo e chiudono', async () => {
  for (const [chiave, modo] of [['miglioraSostituisci', 'sostituisci'], ['miglioraAggiungi', 'aggiungi']]) {
    const { pannello, applicati } = monta();
    pannello.apri();
    pannello.elemento.perDato('miglioraAvvia').lancia('click');
    await new Promise((r) => setTimeout(r, 0));
    pannello.elemento.perDato(chiave).lancia('click');
    assert.deepEqual(applicati, [{ modo, testo: 'Obiettivo: scrivere il test.' }]);
    assert.equal(pannello.elemento.hidden, true, 'deciso vuol dire chiuso: il pannello non resta lì a invitare a rifarlo');
  }
});

test('MIGLIORA-COPIA: copia il prompt migliorato esatto, lascia aperto il pannello e lo annuncia', async () => {
  const { pannello, applicati, copiati } = monta();
  pannello.apri();
  pannello.elemento.perDato('miglioraAvvia').lancia('click');
  await new Promise((r) => setTimeout(r, 0));

  pannello.elemento.perDato('miglioraCopia').lancia('click');
  await new Promise((r) => setTimeout(r, 0));

  assert.deepEqual(copiati, ['Obiettivo: scrivere il test.']);
  assert.deepEqual(applicati, [], 'copiare non modifica il composer');
  assert.equal(pannello.elemento.hidden, false, 'il risultato resta disponibile dopo la copia');
  assert.equal(pannello.elemento.perDato('miglioraCopiaStato').textContent, 'Copiato');
});

test('MIGLIORA-ANNULLA: chiude senza consegnare niente, e riaprendo si riparte dalla domanda', async () => {
  const { pannello, applicati } = monta();
  pannello.apri();
  pannello.elemento.perDato('miglioraAvvia').lancia('click');
  await new Promise((r) => setTimeout(r, 0));
  pannello.elemento.perDato('miglioraAnnulla').lancia('click');
  assert.deepEqual(applicati, []);
  pannello.apri();
  assert.equal(pannello.stato().fase, 'scelta', 'una riapertura non eredita l\'esito di prima');
  assert.equal(pannello.stato().esito, null);
});

test('MIGLIORA-VUOTO: col composer vuoto NON si chiama il modello — si dice cosa fare', async () => {
  const { pannello, chiamate } = monta({ leggiPrompt: () => '   ' });
  pannello.apri();
  pannello.elemento.perDato('miglioraAvvia').lancia('click');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(chiamate, [], 'non si spende una chiamata per un testo che non c\'è');
  assert.equal(pannello.stato().fase, 'errore');
  assert.match(pannello.elemento.perDato('miglioraErrore').textContent, /composer/u);
});

test('MIGLIORA-GUASTO: un errore della rotta diventa la sua frase, con «Riprova» che richiama', async () => {
  let tentativi = 0;
  const { pannello } = monta({
    chiedi: async () => {
      tentativi += 1;
      if (tentativi === 1) { const e = new Error('no'); e.code = 'PROVIDER_KEY_REQUIRED'; throw e; }
      return { promptMigliorato: 'Obiettivo: x.', sintesi: '', principi: [], modello: 'm/uno', profondita: 'equilibrata', promptOriginale: 'scrivi il test' };
    },
  });
  pannello.apri();
  pannello.elemento.perDato('miglioraAvvia').lancia('click');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pannello.stato().fase, 'errore');
  assert.match(pannello.elemento.perDato('miglioraErrore').textContent, /Provider/u);
  pannello.elemento.perDato('miglioraRiprova').lancia('click');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pannello.stato().fase, 'esito');
  assert.equal(tentativi, 2);
});

test('MIGLIORA-VUOTA: VERSO CONTRARIO — una risposta senza testo riscritto NON diventa un esito', async () => {
  const { pannello } = monta({ chiedi: async () => ({ sintesi: 'ho migliorato tutto', principi: ['bello'] }) });
  pannello.apri();
  pannello.elemento.perDato('miglioraAvvia').lancia('click');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pannello.stato().fase, 'errore');
  assert.equal(pannello.stato().esito, null);
});

test('MIGLIORA-RITARDO: VERSO CONTRARIO — una risposta in ritardo non scavalca quella nuova', async () => {
  const attese = [];
  const { pannello } = monta({
    chiedi: () => new Promise((risolvi) => { attese.push(risolvi); }),
  });
  pannello.apri();
  pannello.elemento.perDato('miglioraAvvia').lancia('click'); // primo giro
  pannello.elemento.perDato('miglioraAvvia').lancia('click'); // secondo giro, prima che il primo risponda
  assert.equal(attese.length, 2);
  attese[1]({ promptMigliorato: 'la NUOVA', principi: [], sintesi: '', modello: 'm/uno', profondita: 'equilibrata', promptOriginale: 'scrivi il test' });
  await new Promise((r) => setTimeout(r, 0));
  attese[0]({ promptMigliorato: 'la VECCHIA', principi: [], sintesi: '', modello: 'm/uno', profondita: 'equilibrata', promptOriginale: 'scrivi il test' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(pannello.elemento.perDato('miglioraDopo').textContent, 'la NUOVA', 'la risposta vecchia non arriva a schermo');
});

test('MIGLIORA-ESC: Escape chiude il pannello', () => {
  let chiusure = 0;
  const { pannello } = monta({ onChiudi: () => { chiusure += 1; } });
  pannello.apri();
  pannello.elemento.lancia('keydown', { key: 'Escape' });
  assert.equal(pannello.elemento.hidden, true);
  assert.equal(chiusure, 1);
});

test('MIGLIORA-TEMI: nessun colore scritto a mano — tutto passa dai token, quindi chiaro E scuro', async () => {
  const sorgente = await readFile(fileURLToPath(new URL('../../src/components/migliora-prompt.js', import.meta.url)), 'utf8');
  const codice = sorgente.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '');
  const colori = codice.match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/giu) ?? [];
  assert.deepEqual(colori, [], `colori scritti a mano nel componente: ${colori.join(', ')}`);
  assert.ok(codice.includes('var(--talos-card)'), 'il fondo viene dal tema');
  assert.ok(codice.includes('var(--talos-danger)'), 'anche l\'errore viene dal tema');
});
