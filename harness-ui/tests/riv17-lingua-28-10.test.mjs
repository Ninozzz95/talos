/*
 * Revisione avversaria del blocco 17 (28/10/2026), la lingua: R17-1 e R17-2 (rapporto `REVISIONE-BLOCCO-17-2026-10-28.md`), dai casi del revisore.
 * Il verso giusto dell'errore resta quello del modulo: meglio nessuna nota che una nota sbagliata.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { linguaDelTesto } from '../src/lingua-del-testo.mjs';

const P = 'the build failed because the configuration file could not be parsed and the compiler stopped with an unexpected token in the main module';

/* R17-1 — un italiano che incolla un errore inglese riceveva ancora «reply in English»: cornice corta, gergo, grassetto, domanda dopo */
test('RIV17-L1 — la voce della persona corta, in gergo, in grassetto o DOPO l\'errore incollato non lascia «inglese»', async () => {
  const casi = [
    `Aiuto: ${P}`,
    `Ecco: ${P}`,
    `Aiuto:\n${P}`,
    `fixa il build: ${P}`,
    `ok fixa questo: ${P}`,
    `**Errore:** Cannot find module 'react'. Require stack: ${P}`,
    `${P}\n\ncome lo risolvo?`,
    `${P}\n\nCome posso risolvere questo problema nel mio progetto? Grazie`,
  ];
  const sbagliate = [];
  for (const frase of casi) { const detta = await linguaDelTesto(frase); if (detta !== null && detta !== 'it') sbagliate.push(`${detta}: ${frase.slice(0, 40)}`); }
  assert.deepEqual(sbagliate, []);
});

test('RIV17-L1b — AL CONTRARIO: una voce corta nello stesso alfabeto non latino non toglie la lingua, e l\'ultima riga «vedi <indirizzo>» nemmeno', async () => {
  assert.equal(await linguaDelTesto('Привет! Мне нужна помощь: прочитай этот файл и объясни, почему тест не проходит.'), 'ru');
  assert.equal(await linguaDelTesto('puoi sistemare questo errore nel file?\n```js\nconst result = await fetch(url)\n```\nvedi https://example.com/docs/api-reference'), 'it');
  assert.equal(await linguaDelTesto('ok: leggi il file src/app.js e dimmi perché il test fallisce sempre'), 'it', 'due lettere prima dei due punti non sono una voce');
});

/* R17-2 — le scorciatoie del cirillico davano per sicure lingue sbagliate */
test('RIV17-C — il cirillico: la ъ russa non fa bulgaro; kazako e tagiko non diventano ucraino o russo', async () => {
  for (const [frase, vietata] of [
    ['Объясни, пожалуйста, как работает функция сортировки в моем коде', 'bg'],
    ['Сәлеметсіз бе, маған көмектесіңізші', 'uk'],
    ['Ман ин кодро дуруст кардан мехоҳам, ёрӣ диҳед', 'ru'],
  ]) {
    const detta = await linguaDelTesto(frase);
    assert.ok(detta === null || detta !== vietata, `${detta}: ${frase.slice(0, 30)}`);
    assert.notEqual(detta, vietata);
  }
});

test('RIV17-Cb — AL CONTRARIO: il bulgaro con la ъ vocale e il russo con ы restano riconosciuti', async () => {
  assert.equal(await linguaDelTesto('Не мога да разбера защо програмата ми връща грешка, когато съм в режим на отстраняване'), 'bg');
  assert.equal(await linguaDelTesto('Почему эта функция возвращает пустой массив, когда я передаю объект?'), 'ru');
});
