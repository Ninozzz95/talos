import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⛔⛔⛔ BC-41 (12/09/2026) — UNA SESSIONE CONCLUSA SI RIDISEGNAVA CON DECINE DI GIRI «IN CORSO».
 *
 * MISURATO SUL BANCO (server mio sulla 4196, copia dello store dell'owner, mai la 4174), sessione
 * `bb8aeba9` — conclusa, 17 RunStarted, 9 RunFinished, 8 RunError: **34 turni, 50 tick, 16 col tono
 * `current`**, in tema chiaro e in tema scuro, a 1440×900. Il rapporto dell'11/09 ne aveva contati
 * 21 su 56 su un'altra sessione vera.
 *
 * La causa sta in una riga sola: `aggiornaTickGiro()` guarda `conversation.lastElementChild`. Dal
 * vivo l'ultimo turno È quello che ha appena finito; nel REPLAY, quando il `RunFinished` di un giro
 * arriva, in fondo alla chat c'è già il turno successivo — e il tick di quello vecchio non lo tocca
 * più nessuno.
 *
 * ⛔ Perché la prova gira sul SORGENTE di `app.js`: la cura vive dentro l'IIFE del monolite, che non
 *   si importa. Si estrae il corpo della funzione e lo si esegue davvero su un DOM finto — così
 *   questa non è una prova su una stringa, è una prova sul COMPORTAMENTO. E la metà al contrario
 *   esegue l'implementazione VECCHIA sullo stesso DOM: se non lasciasse giri accesi, questo cancello
 *   non starebbe misurando niente.
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');

/** Il corpo di una funzione dichiarata `function nome(`, fino alla graffa che la chiude. */
function corpoFunzione(sorgente, nome) {
  const inizio = sorgente.search(new RegExp(`(async )?function ${nome}\\s*\\(`));
  if (inizio === -1) return null;
  const apertura = sorgente.indexOf('{', inizio);
  let livello = 0;
  for (let i = apertura; i < sorgente.length; i += 1) {
    if (sorgente[i] === '{') livello += 1;
    else if (sorgente[i] === '}') {
      livello -= 1;
      if (livello === 0) return sorgente.slice(inizio, i + 1);
    }
  }
  return null;
}

/** Un tick finto: sa solo le due cose che la cura tocca. */
function tickFinto(tono) {
  const classi = new Set(['talos-turn-spine__tick']);
  if (tono) classi.add(`talos-turn-spine__tick--${tono}`);
  return {
    classi,
    get className() { return [...classi].join(' '); },
    classList: {
      remove: (c) => classi.delete(c),
      contains: (c) => classi.has(c),
    },
  };
}

/**
 * Una chat finta come quella del replay: N turni, ognuno con i suoi tick, e SOLO l'ultimo tick di
 * ogni turno acceso — esattamente la forma che `nellaChat`/`turnoTalosCorrente` producono.
 */
function chatFinta(turni) {
  const tutti = [];
  const elementi = turni.map((toni) => {
    const tick = toni.map(tickFinto);
    tutti.push(...tick);
    return { tick };
  });
  return {
    tutti,
    lastElementChild: elementi.at(-1) ?? null,
    querySelectorAll: (selettore) => {
      if (selettore === '.talos-turn-spine__tick--current') return tutti.filter((t) => t.classList.contains('talos-turn-spine__tick--current'));
      if (selettore === '.talos-turn-spine__tick') return tutti;
      throw new Error(`selettore non previsto dalla prova: ${selettore}`);
    },
  };
}

function accesi(chat) {
  return chat.tutti.filter((t) => t.classList.contains('talos-turn-spine__tick--current')).length;
}

/** La cura vera, estratta dal sorgente ed eseguita. */
const corpo = corpoFunzione(APP, 'spegniGiriInCorso');
const spegniGiriInCorso = corpo ? new Function(`${corpo}; return spegniGiriInCorso;`)() : null;

test('BC-41/1 — la cura esiste ed è estraibile dal monolite', () => {
  assert.ok(corpo, 'spegniGiriInCorso deve esistere in legacy/app.js');
  assert.equal(typeof spegniGiriInCorso, 'function');
});

test('BC-41/2 — su una chat di replay spegne TUTTI i giri, non solo quello in fondo', () => {
  // sei turni come quelli veri: il primo con tre giri, gli altri con uno o due; l'ultimo tick di ognuno è acceso
  const chat = chatFinta([
    [null, null, 'current'],
    ['current'],
    [null, 'current'],
    ['current'],
    [null, null, 'current'],
    ['current'],
  ]);
  assert.equal(accesi(chat), 6, 'la chat di partenza è quella misurata sul banco: un giro acceso per turno');
  const spenti = spegniGiriInCorso(chat);
  assert.equal(spenti, 6, 'la funzione dice QUANTI ne ha spenti: un numero che si può misurare, non un «fatto»');
  assert.equal(accesi(chat), 0, 'dopo un evento terminale nessun giro è in corso, in nessun turno');
});

test('BC-41/3 — un tick con un ESITO conserva il suo tono: si spegne lo stato, non la storia', () => {
  const chat = chatFinta([['danger'], ['warning'], [null, 'current']]);
  spegniGiriInCorso(chat);
  assert.equal(chat.tutti[0].className, 'talos-turn-spine__tick talos-turn-spine__tick--danger', 'un giro fallito resta fallito');
  assert.equal(chat.tutti[1].className, 'talos-turn-spine__tick talos-turn-spine__tick--warning', 'un\'approvazione resta un\'approvazione');
  assert.equal(chat.tutti[3].className, 'talos-turn-spine__tick', 'solo «in corso» se ne va');
});

test('BC-41/4 — senza conversazione non cade e non inventa', () => {
  assert.equal(spegniGiriInCorso(null), 0);
  assert.equal(spegniGiriInCorso(undefined), 0);
  assert.equal(spegniGiriInCorso(chatFinta([])), 0, 'una chat vuota ha zero giri da spegnere, non un errore');
});

test('BC-41, AL CONTRARIO — l\'implementazione VECCHIA lascia accesi 5 giri su 6 sulla stessa chat', () => {
  /* È `aggiornaTickGiro({ tono: null })` ridotta all'osso: tocca solo l'ultimo turno. */
  const vecchia = (conversation) => {
    const ultimo = conversation?.lastElementChild;
    if (!ultimo) return 0;
    const acceso = ultimo.tick.at(-1);
    const era = acceso.classList.contains('talos-turn-spine__tick--current');
    acceso.classList.remove('talos-turn-spine__tick--current');
    return era ? 1 : 0;
  };
  const chat = chatFinta([
    [null, null, 'current'],
    ['current'],
    [null, 'current'],
    ['current'],
    [null, null, 'current'],
    ['current'],
  ]);
  vecchia(chat);
  assert.equal(accesi(chat), 5, 'ERA questo il difetto: su una sessione conclusa restano giri che dichiarano un lavoro in corso');
});

test('BC-41/5 — CANCELLO: i due eventi TERMINALI la chiamano entrambi', () => {
  const runFinished = /aggiornaTickGiro\(\{ tono: null \}\);[\s\S]{0,200}?spegniGiriInCorso\(\$\('#conversation'\)\);/.test(APP);
  assert.ok(runFinished, 'a RunFinished si spengono tutti i giri, non solo l\'ultimo');
  const runError = /appendStatusNote\('', true, \{ spiegazione \}\);\s*\n\s*spegniGiriInCorso\(\$\('#conversation'\)\);/.test(APP);
  assert.ok(runError, 'anche un giro FALLITO è un giro finito: senza questa riga una sessione morta su RunError resta «in corso»');
});
