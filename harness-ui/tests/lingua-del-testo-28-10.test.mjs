// Owner 28/10/2026 sera («Libreria ELD nell'app»): la lingua dei messaggi SCRITTI la riconosce il server, solo quando è sicura.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LETTERE_MINIME, MARGINE_MINIMO, decidiLingua, linguaDelTesto, testoDaRiconoscere, _dimenticaRilevatore } from '../src/lingua-del-testo.mjs';

test('LINGUA-TESTO-01 — le frasi di una chat si riconoscono: persiano, italiano, inglese, tedesco, arabo, cinese, russo (una frase russa corta ha il margine stretto con l\'ucraino e resta senza nota)', async () => {
  const casi = [['fa', 'سلام، حالت چطوره؟'], ['fa', 'پایتخت ایتالیا کجاست؟'], ['it', 'leggi il file src/app.js e dimmi perché il test fallisce'],
    ['en', 'why does this function return null?'], ['de', 'Hallo, wie geht es dir?'], ['ar', 'هل يمكنك قراءة هذا الملف؟'],
    ['zh', '请帮我修复这个错误'], ['ru', 'Привет! Мне нужна помощь: прочитай этот файл и объясни, почему тест не проходит.']];
  for (const [atteso, frase] of casi) assert.equal(await linguaDelTesto(frase), atteso, frase);
});

test('LINGUA-TESTO-02 — il caso dell\'owner: «سلام، حالت چطوره؟» è persiano anche se ELD da solo dice arabo (le lettere persiane decidono)', () => {
  const finto = { detect: () => ({ language: 'ar', isReliable: () => true, getScores: () => ({ ar: 0.82, fa: 0.818 }) }) };
  assert.equal(decidiLingua('سلام، حالت چطوره؟', finto), 'fa');
  /* l'urdu e il curdo sorani usano anche lettere persiane: non passano dalla scorciatoia, decide il riconoscitore (qui non sicuro) */
  assert.equal(decidiLingua('آپ کیسے ہیں؟ یہ فائل پڑھیں', finto), null, 'urdu');
  assert.equal(decidiLingua('ڕۆژباش، چۆنی؟ ئەم پەڕگەیە بخوێنەوە', finto), null, 'curdo sorani');
});

test('LINGUA-TESTO-03 — AL CONTRARIO: niente lingua quando non è sicura (margine stretto, messaggio corto, non affidabile), mai una sbagliata', async () => {
  const conMargine = (m) => ({ detect: () => ({ language: 'da', isReliable: () => true, getScores: () => ({ da: 0.8, no: 0.8 - m }) }) });
  assert.equal(decidiLingua('Kan du lese denne filen?', conMargine(MARGINE_MINIMO - 0.001)), null, 'norvegese/danese troppo vicini: nessuna nota');
  assert.equal(decidiLingua('Kan du lese denne filen?', conMargine(MARGINE_MINIMO)), 'da');
  assert.equal(decidiLingua('ciao a tutti voi', { detect: () => ({ language: 'it', isReliable: () => false, getScores: () => ({ it: 0.9 }) }) }), null);
  for (const corto of ['ok', 'yes', 'npm test', 'vai']) assert.equal(await linguaDelTesto(corto), null, corto);
  assert.ok('vai'.length < LETTERE_MINIME);
  const sicurissimo = { detect: () => ({ language: 'it', isReliable: () => true, getScores: () => ({ it: 0.99, en: 0.1 }) }) };
  assert.equal(decidiLingua('vai ok', sicurissimo), null, 'sotto le lettere minime nemmeno un riconoscitore sicuro decide');
  assert.equal(decidiLingua('vai avanti pure', sicurissimo), 'it');
});

test('LINGUA-TESTO-04 — il codice, il codice in linea e gli indirizzi non contano: un messaggio italiano con un blocco di codice resta italiano', async () => {
  const messaggio = 'puoi sistemare questo errore nel file?\n```js\nconst result = await fetch(url).then((response) => response.json())\nconsole.log(result)\n```\nvedi https://example.com/docs/api-reference';
  assert.equal(testoDaRiconoscere(messaggio), 'puoi sistemare questo errore nel file? vedi');
  assert.equal(await linguaDelTesto(messaggio), 'it');
});

test('LINGUA-TESTO-05 — senza il pacchetto (chi importa il modulo senza `eld`) non si rompe niente: niente lingua, salvo le lettere persiane', async () => {
  _dimenticaRilevatore();
  const senza = { importaEld: async () => { throw new Error('Cannot find package eld'); } };
  assert.equal(await linguaDelTesto('why does this function return null?', senza), null);
  assert.equal(await linguaDelTesto('سلام، حالت چطوره؟', senza), 'fa');
  _dimenticaRilevatore();
});
