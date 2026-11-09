import test from 'node:test';
import assert from 'node:assert/strict';
import { VIE_ALLEGATO, TETTI_ALLEGATI, allegatoPesante, frasiTetti, stimaTokenTesto, stimaTokenImmagine, famigliaModello, etichettaCosto, costoAllegato, costoTotale, nomeBreveAllegato } from '../../src/components/allegati.js';

// 06/09 — B4/B6/B7/B9: il «+» allega e basta, e ogni allegato dichiara quanto contesto costa.

test('ALLEGATI-VIE: le quattro vie del «+», nell’ordine, tutte con nome e aiuto (B6)', () => {
  assert.equal(VIE_ALLEGATO.length, 4);
  assert.deepEqual(VIE_ALLEGATO.map((v) => v.id), ['workspace', 'disco', 'immagine', 'schermata']);
  for (const v of VIE_ALLEGATO) assert.ok(v.etichetta && v.aiuto && v.icona, `via incompleta: ${v.id}`);
});

test('ALLEGATI-TESTO: ~4 caratteri per token, e niente numeri inventati sul vuoto', () => {
  assert.equal(stimaTokenTesto(4000), 1000);
  assert.equal(stimaTokenTesto(1), 1);
  // AL CONTRARIO: su niente non si stima niente
  assert.equal(stimaTokenTesto(0), 0);
  assert.equal(stimaTokenTesto(-10), 0);
  assert.equal(stimaTokenTesto('molti'), 0);
  assert.equal(stimaTokenTesto(undefined), 0);
});

test('ALLEGATI-IMMAGINE: ogni famiglia conta a modo suo, e Claude ha un tetto', () => {
  // Claude: larghezza × altezza / 750 → 1000×1000 ≈ 1334
  assert.equal(stimaTokenImmagine(1000, 1000, 'claude'), 1334);
  // e oltre il tetto non sale
  assert.equal(stimaTokenImmagine(4000, 4000, 'claude'), 1568);
  // OpenAI: 85 di base + 170 per riquadro da 512 px → 1024×1024 = 4 riquadri
  assert.equal(stimaTokenImmagine(1024, 1024, 'openai'), 85 + 170 * 4);
  // Gemini: riquadri da 768 px a 258 token
  assert.equal(stimaTokenImmagine(768, 768, 'gemini'), 258);
  assert.equal(stimaTokenImmagine(1000, 800, 'gemini'), 258 * 4);
  // AL CONTRARIO: misure assurde non producono un numero
  assert.equal(stimaTokenImmagine(0, 500, 'claude'), 0);
  assert.equal(stimaTokenImmagine('x', 'y', 'claude'), 0);
});

test('ALLEGATI-FAMIGLIA: la si ricava dall’identificatore, e nel dubbio si sceglie il conto prudente', () => {
  assert.equal(famigliaModello('claude-opus-5'), 'claude');
  assert.equal(famigliaModello('openai/gpt-5.2'), 'openai');
  assert.equal(famigliaModello('google/gemini-3.8-flash'), 'gemini');
  assert.equal(famigliaModello('z-ai/glm-5.3-flash'), 'claude');
  assert.equal(famigliaModello(''), 'claude');
});

test('ALLEGATI-ETICHETTA: la tilde dice che è una stima, non una misura', () => {
  assert.equal(etichettaCosto(340), '~340 token');
  assert.equal(etichettaCosto(1334), '~1,3k token');
  assert.equal(etichettaCosto(24000), '~24k token');
  // AL CONTRARIO: zero non si scrive, si tace
  assert.equal(etichettaCosto(0), '');
  assert.equal(etichettaCosto(null), '');
});

test('ALLEGATI-COSTO: un allegato e la somma di tutti', () => {
  const file = { tipo: 'testo', caratteri: 8000 };
  const foto = { tipo: 'immagine', larghezza: 1000, altezza: 1000 };
  assert.equal(costoAllegato(file, 'claude-opus-5').token, 2000);
  assert.equal(costoAllegato(foto, 'claude-opus-5').token, 1334);
  assert.equal(costoAllegato(foto, 'openai/gpt-5.2').token, 85 + 170 * 4);
  assert.equal(costoTotale([file, foto], 'claude-opus-5').token, 3334);
  assert.equal(costoTotale([file, foto], 'claude-opus-5').etichetta, '~3,3k token');
  // AL CONTRARIO: nessun allegato, nessuna riga
  assert.equal(costoTotale([], 'claude-opus-5').etichetta, '');
  assert.equal(costoAllegato(null, 'claude-opus-5').token, 0);
});

test('ALLEGATI-NOME: si accorcia il nome, mai l’estensione', () => {
  assert.equal(nomeBreveAllegato('C:/progetti/app/src/session-registry.mjs'), 'session-registry.mjs');
  assert.equal(nomeBreveAllegato('/a/b/un-nome-molto-molto-lungo-davvero.mjs'), 'un-nome-molto-molto-lun….mjs');
  assert.ok(nomeBreveAllegato('/a/b/un-nome-molto-molto-lungo-davvero.mjs').endsWith('.mjs'));
  assert.equal(nomeBreveAllegato(''), '');
});

test('ALLEGATI-TETTI: i tetti sono dati, e la frase che li dichiara li legge da lì (B8)', () => {
  assert.equal(TETTI_ALLEGATI.quanti, 10);
  assert.ok(TETTI_ALLEGATI.caratteriPerAllegato >= 100_000);
  const frase = frasiTetti();
  assert.match(frase, /Fino a 10 allegati/);
  assert.match(frase, /200k caratteri/);
  // un file oltre il tetto si segnala, ma non si rifiuta
  assert.equal(allegatoPesante({ tipo: 'testo', caratteri: 250_000 }), true);
  assert.equal(allegatoPesante({ tipo: 'testo', caratteri: 1000 }), false);
  // AL CONTRARIO: un'immagine non si misura in caratteri, e il vuoto non è pesante
  assert.equal(allegatoPesante({ tipo: 'immagine', larghezza: 4000, altezza: 4000 }), false);
  assert.equal(allegatoPesante(null), false);
});

// D28 del collaudo del 02/11: il selettore prendeva un file solo. Ora ne prende molti, e quelli che superano il tetto restano fuori, contati.
test('ALLEGATI-SCELTI: entrano i primi che stanno nel tetto, contando quelli già allegati e quelli in caricamento; gli altri si contano', async () => {
  const { sceltiNelTetto } = await import('../../src/components/allegati.js');
  const dodici = Array.from({ length: 12 }, (_, i) => `f${i}`);
  assert.deepEqual(sceltiNelTetto(dodici, { dentro: 0 }), { entrano: dodici.slice(0, TETTI_ALLEGATI.quanti), fuori: 2 });
  assert.deepEqual(sceltiNelTetto(dodici.slice(0, 3), { dentro: 7 }), { entrano: ['f0', 'f1', 'f2'], fuori: 0 }, 'esattamente fino al tetto');
  assert.deepEqual(sceltiNelTetto(dodici.slice(0, 4), { dentro: 7 }), { entrano: ['f0', 'f1', 'f2'], fuori: 1 });
  assert.deepEqual(sceltiNelTetto(['a', 'b'], { dentro: TETTI_ALLEGATI.quanti }), { entrano: [], fuori: 2 }, 'tetto già pieno');
  assert.deepEqual(sceltiNelTetto(['a'], { dentro: 99 }), { entrano: [], fuori: 1 }, 'mai un numero negativo');
  assert.deepEqual(sceltiNelTetto([], { dentro: 0 }), { entrano: [], fuori: 0 });
  assert.deepEqual(sceltiNelTetto(['a', 'b', 'c'], { dentro: 0, tetto: 2 }), { entrano: ['a', 'b'], fuori: 1 });
  assert.deepEqual(sceltiNelTetto(['a'], {}), { entrano: ['a'], fuori: 0 }, 'senza conto vale zero');
});

test('ALLEGATI-SCELTI-FILI: il selettore chiede più file; selettore, incolla e trascina passano dal tetto e dicono quanti restano fuori, in due lingue', async () => {
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const zona = app.slice(app.indexOf('function scegliAllegato(via)'), app.indexOf('/** Un file scelto, incollato o trascinato'));
  assert.match(zona, /input\.multiple = true;/u);
  assert.match(zona, /const scelti = fileNelTetto\(input\.files\);[\s\S]*for \(const file of scelti\) \{[\s\S]*await allegaFile\(file\);/u);
  assert.match(app, /for \(const f of fileNelTetto\(file\)\) void allegaFile\(f\);/u, 'incolla');
  assert.match(app, /for \(const f of fileNelTetto\(evento\.dataTransfer\?\.files\)\) void allegaFile\(f\);/u, 'trascina');
  /* nessuna strada resta fuori dal tetto */
  assert.doesNotMatch(app, /for \(const f(?:ile)? of (?:file|\[\.\.\.\((?:input|evento\.dataTransfer\?)\.files.*?\]\))\) (?:void|await) allegaFile/u);
  const { impostaLingua, tn } = await import('../../src/components/lingua.js');
  impostaLingua('en');
  assert.equal(tn('app.attachments.leftOutOne', 'app.attachments.leftOutMany', 1, { massimo: 10 }), '1 file left out: the limit is 10 per message.');
  assert.equal(tn('app.attachments.leftOutOne', 'app.attachments.leftOutMany', 2, { massimo: 10 }), '2 files left out: the limit is 10 per message.');
  impostaLingua('it');
  assert.equal(tn('app.attachments.leftOutOne', 'app.attachments.leftOutMany', 1, { massimo: 10 }), '1 file è rimasto fuori: il massimo è 10 per messaggio.');
  assert.equal(tn('app.attachments.leftOutOne', 'app.attachments.leftOutMany', 3, { massimo: 10 }), '3 file sono rimasti fuori: il massimo è 10 per messaggio.');
});

/*
 * N8 della seconda revisione (S4). Due buchi del tetto dei file scelti:
 *   · il taglio si faceva PRIMA dei controlli di `allegaFile`: dodici file con tre GIF ⇒ tre scartati, due «fuori», sette allegati, e l'avviso diceva «il massimo è 10»;
 *   · il selettore carica uno alla volta: durante un caricamento lungo un trascinamento contava solo il caricamento in corso, non la coda, e tornavano gli avvisi uno per file.
 *   Ora un file che verrà scartato non occupa un posto (e arriva comunque ad `allegaFile`, che dice perché), e la coda del selettore è PRENOTATA.
 */
test('ALLEGATI-N8-01 un file che verrà scartato non occupa un posto; la regola dello scarto è una sola', async () => {
  const { sceltiNelTetto, scartoDelFile } = await import('../../src/components/allegati.js');
  const MB = 1024 * 1024;
  const file = (nome, type, size = 10) => ({ name: nome, type, size });
  assert.deepEqual(scartoDelFile(file('a.gif', 'image/gif')), ['app.attachments.imageFormat', 'app.attachments.imageFormatBody']);
  assert.deepEqual(scartoDelFile(file('a.png', 'image/png', 5 * MB + 1)), ['app.attachments.imageTooLarge', 'app.attachments.imageTooLargeBody']);
  assert.deepEqual(scartoDelFile(file('a.zip', 'application/zip', 100 * MB + 1)), ['app.attachments.fileTooLarge', 'app.attachments.fileTooLargeBody']);
  for (const buono of [file('a.png', 'image/png', 5 * MB), file('a.jpg', 'image/jpeg'), file('a.webp', 'image/webp'), file('a.zip', 'application/zip', 100 * MB), file('a.txt', '')]) assert.equal(scartoDelFile(buono), null, buono.name);
  const dodici = [...Array.from({ length: 9 }, (_, i) => file(`f${i}.txt`, 'text/plain')), file('g1.gif', 'image/gif'), file('g2.gif', 'image/gif'), file('f9.txt', 'text/plain'), file('f10.txt', 'text/plain'), file('g3.gif', 'image/gif')];
  const { entrano, fuori } = sceltiNelTetto(dodici, { dentro: 0, valido: (f) => !scartoDelFile(f) });
  assert.equal(entrano.filter((f) => !scartoDelFile(f)).length, 10, 'dieci buoni entrano');
  assert.equal(entrano.filter((f) => scartoDelFile(f)).length, 3, 'le tre GIF arrivano ad allegaFile, che dice perché, ma non occupano posti');
  assert.equal(fuori, 1, 'resta fuori solo l undicesimo buono');
  assert.deepEqual(entrano.map((f) => f.name), [...Array.from({ length: 9 }, (_, i) => `f${i}.txt`), 'g1.gif', 'g2.gif', 'f9.txt', 'g3.gif'], 'l ordine della scelta resta');
  /* senza `valido` tutto vale, come prima */
  assert.deepEqual(sceltiNelTetto(['a', 'b', 'c'], { dentro: 0, tetto: 2 }), { entrano: ['a', 'b'], fuori: 1 });
});

test('ALLEGATI-N8-02 la coda del selettore è prenotata: un trascinamento durante una scelta lunga conta anche i file che aspettano', async () => {
  const { creaPrenotazioni } = await import('../../src/components/allegati.js');
  const p = creaPrenotazioni();
  assert.equal(p.quante('bozza-a'), 0);
  p.prenota('bozza-a', 4);
  p.prenota('bozza-b', 2);
  assert.deepEqual([p.quante('bozza-a'), p.quante('bozza-b')], [4, 2], 'ogni bozza la sua coda');
  p.prenota('bozza-a', -1);
  assert.equal(p.quante('bozza-a'), 3);
  p.prenota('bozza-a', -9);
  assert.equal(p.quante('bozza-a'), 0, 'mai sotto zero');
  assert.equal(p.quante(null), 0);
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
  const zona = app.slice(app.indexOf('function scegliAllegato(via)'), app.indexOf('/** Un file scelto, incollato o trascinato'));
  assert.match(zona, /prenotazioniAllegati\.quante\(chiave\)/u, 'il tetto conta la coda prenotata');
  assert.match(zona, /valido: \(f\) => !scartoDelFile\(f\)/u);
  assert.match(zona, /prenotazioniAllegati\.prenota\(chiave, restano\);/u);
  assert.match(zona, /finally \{ if \(restano > 0\) prenotazioniAllegati\.prenota\(chiave, -restano\); \}/u);
  assert.match(app, /const scarto = scartoDelFile\(file\);\s*\n\s*if \(scarto\) \{ toast\(tr\(scarto\[0\]\), tr\(scarto\[1\]\)\); return; \}/u, 'allegaFile usa la stessa regola');
});
