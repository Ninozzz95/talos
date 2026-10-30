/*
 * Riverifica avversaria del blocco 14 (28/10/2026), la lingua: RIV14B-L1 (rapporto `RIVERIFICA-BLOCCO-14-2026-10-28.md`), dalla prova del revisore.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { linguaDelTesto } from '../src/lingua-del-testo.mjs';

/* RIV14B-L1 — la lingua: un messaggio italiano con un errore inglese incollato DOPO i due punti (il modo più comune di chiedere aiuto)
   è ancora «inglese» per il riconoscitore, e il modello riceve «reply in English». Sulla sonda del revisore: 9 su 10. */
test('RIV14B-L1 — un italiano che incolla un errore inglese dopo i due punti non riceve una lingua sbagliata', async () => {
  const casi = [
    "il build dice: Type 'string' is not assignable to type 'number' in the return statement",
    'errore in console: Failed to load resource: the server responded with a status of 404 not found',
    'npm install fallisce con: unable to resolve dependency tree because of conflicting peer dependencies',
    'git mi risponde: Updates were rejected because the tip of your current branch is behind its remote counterpart',
    'nel log vedo: Error connecting to database, retrying in five seconds, giving up after three attempts',
    'traduci in italiano: «Сохранить всё и закрыть окно приложения сейчас же»',
  ];
  const sbagliate = [];
  for (const frase of casi) { const detta = await linguaDelTesto(frase); if (detta !== null && detta !== 'it') sbagliate.push(`${detta}: ${frase.slice(0, 50)}`); }
  assert.deepEqual(sbagliate, []);
});

test('RIV14B-L1b — senza due punti, un passo CITATO in un altro alfabeto non decide la lingua; e una cornice troppo corta («ok:») non decide niente', async () => {
  const citato = await linguaDelTesto('come si dice «Сохранить всё и закрыть окно приложения» in italiano? spiegamelo bene per favore');
  assert.ok(citato === null || citato === 'it', `citato: ${citato}`);
  assert.equal(await linguaDelTesto('ok: leggi il file src/app.js e dimmi perché il test fallisce sempre'), 'it', 'due lettere prima dei due punti non sono una cornice');
});

test('RIV14B-L1c — una lunga citazione inglese dentro una frase italiana, senza due punti, non fa «inglese» (le tre forme di virgolette)', async () => {
  for (const frase of ['cosa significa "The quick brown fox jumps over the lazy dog every single morning before breakfast" in pratica?',
    'spiegami «Everything you need to know about the release schedule is written in the document below» per favore',
    'che vuol dire “The server could not process your request because the payload was too large” esattamente?']) {
    const detta = await linguaDelTesto(frase);
    assert.ok(detta === null || detta === 'it', `${detta}: ${frase.slice(0, 40)}`);
  }
});

/* Dal Mobile, 28/10/2026: i due punti di un indirizzo, di un percorso o di un orario non chiudono una cornice. Prima della cura «check this out
   https://… e dimmi…» non riceveva nessuna lingua (la «cornice» era «check this out https»). */
test('RIV14B-L1d — i due punti di un indirizzo, di un percorso o di un orario non sono una cornice; quelli veri, seguiti da uno spazio, sì', async () => {
  for (const frase of ['check this out https://github.com/thesysdev/openui e dimmi se secondo te vale la pena usarlo nel nostro progetto',
    'see https://example.com/docs/guida e spiegami come funziona la configurazione del server passo per passo',
    'domani alle 12:30 ho una riunione, preparami una scaletta con i punti principali da discutere col cliente',
    /* una cornice inglese davanti a due punti NON seguiti da uno spazio: percorso e orario */
    String.raw`please open C:\Users\nino\progetto e controlla perché la compilazione fallisce sempre al secondo passo`,
    'meeting at 12:30 domani, preparami una scaletta con i punti principali da discutere col cliente nuovo',
    /* due punti seguiti da uno spazio, ma DENTRO il codice: non sono la voce di chi scrive */
    'check `port: 8080` nel file di configurazione e spiegami perché il server parte sempre sulla porta sbagliata',
    'run this ```\nconst x = { a: 1 }\n``` e spiegami perché il risultato è sempre diverso da quello che mi aspetto']) {
    assert.equal(await linguaDelTesto(frase), 'it', frase.slice(0, 40));
  }
  /* al contrario: la cornice vera resta, anche con un indirizzo DOPO i suoi due punti */
  assert.equal(await linguaDelTesto('il server risponde: Failed to load resource https://example.com/api the server responded with a status of 404 not found'), null);
});
