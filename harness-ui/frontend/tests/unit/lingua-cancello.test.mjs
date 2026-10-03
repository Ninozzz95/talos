/*
 * ⛔⛔ IL CANCELLO DELLA LINGUA (owner 03/10/2026): «ogni singola parola nella app deve essere sia in inglese che in italiano, non
 *   negoziabile» e «ci deve essere una guardia/cancello per questa cosa». Ledger `.claude/LEDGER-I18N-2026-10-03.md`.
 *
 * Gli strati qui (il terzo, la pseudo-lingua sul 4174, è una prova del browser):
 *   1. il DIZIONARIO: ogni area ha le stesse chiavi in italiano e in inglese, nessuna voce vuota, gli stessi segnaposto; ogni
 *      chiave usata nel codice esiste;
 *   2. NIENTE TESTO FISSO A SCHERMO: il cricchetto confronta i conteggi di oggi con `scripts/cancello/lingua-soglie.json`.
 *      Una soglia si abbassa dopo una migrazione e non si alza mai; un file nuovo ha soglia zero.
 * ⛔ Ogni strato si prova anche AL CONTRARIO: un cancello che non diventa mai rosso non è un cancello.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from '../../../tests/aiuto/rimuovi-cartella-di-prova.mjs';
import { AREE, TESTI } from '../../src/i18n/testi/index.js';
import { elenco, impostaLingua, linguaDaIndirizzo, t } from '../../src/components/lingua.js';
import { eFraseItaliana, frasiItalianeNelSorgente, testiFissiNelSorgente, eTestoDaTradurre } from '../../scripts/cancello/testi-a-schermo.mjs';
import { chiamateDelDizionario, chiaviDelModelloHtml, chiaviLetteraliNelSorgente, confrontaConSoglie, conteggiDiOggi, differenzeItalianeDelModello, fileDelFrontend, FILE_SOGLIE, RADICE_FRONTEND, testiDelModelloHtml } from '../../scripts/cancello/lingua-conteggi.mjs';

const segnaposto = (testo) => [...String(testo).matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((m) => m[1]).sort();

test('LINGUA-1: ogni area ha le stesse chiavi in italiano e in inglese, nessuna vuota, gli stessi segnaposto', () => {
  assert.ok(Object.keys(AREE).length > 0, 'almeno un\'area registrata');
  for (const [area, voci] of Object.entries(AREE)) {
    const it = Object.keys(voci.it || {}).sort();
    const en = Object.keys(voci.en || {}).sort();
    assert.deepEqual(it.filter((k) => !en.includes(k)), [], `${area}: chiavi senza inglese`);
    assert.deepEqual(en.filter((k) => !it.includes(k)), [], `${area}: chiavi senza italiano`);
    for (const k of it) {
      for (const lingua of ['it', 'en']) {
        const v = voci[lingua][k];
        assert.ok(typeof v === 'string' && v.trim() !== '', `${area}.${k} (${lingua}) è vuota`);
      }
      assert.deepEqual(segnaposto(voci.it[k]), segnaposto(voci.en[k]), `${area}.${k}: segnaposto diversi fra le lingue`);
    }
  }
});

test('LINGUA-1-USATE: ogni chiave stabile scritta nel codice esiste nel dizionario', () => {
  const { chiaviUsate } = conteggiDiOggi();
  const mancanti = chiaviUsate.filter(({ chiave }) => TESTI.en[chiave] === undefined).map(({ file, chiave }) => `${file}: ${chiave}`);
  assert.deepEqual(mancanti, []);
});

test('LINGUA-1-LETTERALI: ogni letterale a forma di chiave di un\'area esiste nel dizionario, anche fuori da t()', () => {
  const aree = new Set(Object.keys(AREE));
  const mancanti = [];
  let viste = 0;
  for (const f of fileDelFrontend()) {
    for (const chiave of chiaviLetteraliNelSorgente(readFileSync(f, 'utf8'), f, aree)) {
      viste += 1;
      if (TESTI.it[chiave] === undefined || TESTI.en[chiave] === undefined) mancanti.push(`${f.replace(/\\/gu, '/').split('/src/')[1]}: ${chiave}`);
    }
  }
  assert.ok(viste > 1000, 'il controllo guarda davvero qualcosa');
  assert.deepEqual(mancanti, [], 'chiavi che uscirebbero grezze a schermo');
  // AL CONTRARIO: una chiave inventata passata da un aiuto si vede; una stringa che non è di un'area no
  const prova = chiaviLetteraliNelSorgente("node('p', '', 'home.chiaveInventata'); const f = 'index.html'; x('talos.evento');", 'x.ts', aree);
  assert.deepEqual(prova.filter((k) => TESTI.it[k] === undefined), ['home.chiaveInventata']);
});

test('LINGUA-2-CRICCHETTO: nessun conteggio sale sopra la sua soglia (un file nuovo nasce tradotto)', () => {
  const soglie = JSON.parse(readFileSync(FILE_SOGLIE, 'utf8'));
  const { superati, migliorati } = confrontaConSoglie(conteggiDiOggi(), soglie);
  if (migliorati.length) console.log(`soglie da abbassare (node scripts/cancello/lingua-conteggi.mjs --scrivi):\n  ${migliorati.join('\n  ')}`);
  assert.deepEqual(superati, [], 'testi nuovi senza dizionario: passali da t() con la voce italiana e quella inglese');
});

test('LINGUA-2-CRICCHETTO AL CONTRARIO: un testo in più, un file nuovo, una frase vecchia in più, il modello HTML, sono rossi', () => {
  const soglie = { testiFissi: { 'a.js': 2 }, frasiVecchie: { 'a.js': 1 }, html: { testi: 5, attributi: 1 } };
  assert.deepEqual(confrontaConSoglie({ testiFissi: { 'a.js': 2 }, frasiVecchie: { 'a.js': 1 }, html: { testi: 5, attributi: 1 } }, soglie).superati, []);
  assert.equal(confrontaConSoglie({ testiFissi: { 'a.js': 3 }, frasiVecchie: {}, html: { testi: 5, attributi: 1 } }, soglie).superati.length, 1);
  assert.equal(confrontaConSoglie({ testiFissi: { 'nuovo.js': 1 }, frasiVecchie: {}, html: { testi: 5, attributi: 1 } }, soglie).superati.length, 1);
  assert.equal(confrontaConSoglie({ testiFissi: {}, frasiVecchie: { 'a.js': 2 }, html: { testi: 5, attributi: 1 } }, soglie).superati.length, 1);
  assert.equal(confrontaConSoglie({ testiFissi: {}, frasiVecchie: {}, html: { testi: 6, attributi: 2 } }, soglie).superati.length, 2);
  assert.deepEqual(confrontaConSoglie({ testiFissi: { 'a.js': 1 }, frasiVecchie: {}, html: { testi: 5, attributi: 1 } }, soglie).migliorati,
    ['testiFissi: a.js 2 → 1', 'frasiVecchie: a.js 1 → 0']);
});

test('LINGUA-2-SCANNER: i punti dove un testo va a schermo senza dizionario si trovano', () => {
  const trovati = testiFissiNelSorgente([
    "el.textContent = 'Chiudi';",
    "nodo.title = aperto ? 'Apri il pannello' : t('chat.chiudi');",
    "b.setAttribute('aria-label', 'Apri il menu');",
    "toast('Salvato', `Il file ${nome} è stato salvato`);",
    "const x = el(doc, 'span', 'talos-badge', 'Ciao mondo');",
    "const y = textElement('p', 'nota', 'Nessun risultato');",
    "mostraAvviso({ titolo: 'Attenzione', classe: 'talos-x' });",
    "campo.placeholder = 'Cerca…' + suffisso;",
  ].join('\n'));
  assert.deepEqual(trovati.map((r) => r.testo), ['Chiudi', 'Apri il pannello', 'Apri il menu', 'Salvato', 'Il file … è stato salvato', 'Ciao mondo', 'Nessun risultato', 'Attenzione', 'Cerca…']);
});

test('LINGUA-2-SCANNER: un template che è un elenco di classi non è un testo; uno che è una frase sì', () => {
  const trovati = testiFissiNelSorgente([
    "const p = el(d, 'span', `talos-dot talos-dot--sm talos-dot--${tono}`);",
    "el.textContent = `Elimina ${n} file`;",
    "el.textContent = `${n} risultati`;",
    "doc.title = `TALOS · ${vista}`;",
    "el.textContent = `${secondi} s`;",
  ].join('\n'));
  assert.deepEqual(trovati.map((r) => r.testo), ['Elimina … file', '… risultati']);
});

test('LINGUA-2-SCANNER AL CONTRARIO: chiavi, classi, nomi propri, simboli e attributi tecnici non sono testi da tradurre', () => {
  const trovati = testiFissiNelSorgente([
    "el.textContent = t('chat.chiudi');",
    "el.textContent = tn('chat.unFile', 'chat.molti', n);",
    "el.className = 'talos-badge talos-badge--sm';",
    "const y = el(doc, 'span', 'talos-badge talos-badge--sm');",
    "brand.textContent = 'GitHub';",
    "piu.textContent = '…';",
    "conto.textContent = String(n);",
    "el.setAttribute('data-stato', 'in corso');",
    "el.textContent = '';",
  ].join('\n'));
  assert.deepEqual(trovati, []);
  assert.equal(eTestoDaTradurre('talos-button talos-button--ghost'), false);
  assert.equal(eTestoDaTradurre('Apri'), true);
});

test('LINGUA-1-CHIAMATE: una frase italiana passata a t() è una chiave vecchia; una chiave stabile si riconosce', () => {
  const { chiavi, vecchie } = chiamateDelDizionario("t('kernel.contenutoSospetto.segno'); t('Chiudi le altre'); tn('{n} file', '{n} file', 2); x('Ciao a tutti');");
  assert.deepEqual(chiavi, ['kernel.contenutoSospetto.segno']);
  assert.equal(vecchie, 3);
});

test('LINGUA-T: chiave stabile in inglese e in italiano, riserva inglese, pseudo-lingua marcata, elenco nella lingua', () => {
  impostaLingua('en');
  assert.equal(t('kernel.contenutoSospetto.segno'), 'Suspicious content');
  assert.equal(t('kernel.luogo.file', { nome: 'a.md' }), 'the file “a.md”');
  assert.equal(elenco(['a', 'b', 'c']), 'a, b, and c');
  impostaLingua('it');
  assert.equal(t('kernel.contenutoSospetto.segno'), 'Contenuto sospetto');
  assert.equal(elenco(['a', 'b', 'c']), 'a, b e c');
  impostaLingua('qps');
  assert.equal(t('kernel.luogo.file', { nome: 'a.md' }), '⟦thé fílé “a.md”⟧', 'il nome del file resta com\'è');
  assert.match(t('Chiudi le altre'), /^⟦.*⟧$/u, 'anche una frase vecchia passata da t() è marcata');
  assert.equal(t('Frase vecchia che non ha l’inglese'), 'Frase vecchia che non ha l’inglese', 'AL CONTRARIO: senza traduzione resta in chiaro, e lo strato 3 la vede');
  impostaLingua('it');
});

test('LINGUA-2B: le frasi italiane scritte nel codice si trovano anche quando arrivano a schermo da una variabile', () => {
  const trovate = frasiItalianeNelSorgente([
    "export const SPIEGA = { cosa: 'Il giro si è fermato.', perche: 'Non è andato storto niente.' };",
    "throw new Error('Questa sessione non esiste più');",
    "const riga = `Elimina ${n} file dalla cartella`;",
  ].join('\n'));
  assert.deepEqual(trovate.map((r) => r.testo), ['Il giro si è fermato.', 'Non è andato storto niente.', 'Questa sessione non esiste più', 'Elimina … file dalla cartella']);
});

test('LINGUA-2B AL CONTRARIO: chiavi del dizionario, console, import e inglese con «non-» non contano', () => {
  const trovate = frasiItalianeNelSorgente([
    "import { x } from './una cartella con spazi/file.js';",
    "el.textContent = t('Chiudi le altre schede della sessione');",
    "console.warn('non riesco a leggere il file della sessione');",
    "const msg = 'must be a non-negative integer';",
    "const k = 'in-corso';",
    "const s = 'Open the file in a new tab';",
  ].join('\n'));
  assert.deepEqual(trovate, []);
  assert.equal(eFraseItaliana('Nessuna sessione'), true);
  assert.equal(eFraseItaliana('No session'), false);
});

/* 03/10/2026: un elenco di classi BEM e un letterale dichiarato (`/* lingua: <perché> *\/`) non sono testo a schermo. AL CONTRARIO:
   una dichiarazione SENZA perché non vale, una dichiarazione su un'ALTRA riga non copre questa, e una frase con un trattino resta. */
test('LINGUA-2B-ECCEZIONI: classi BEM e letterali dichiarati col loro perché', () => {
  const trovate = frasiItalianeNelSorgente([
    "const a = el('span', 'talos-agente__ora talos-mono talos-muted');",
    "const b = ['concluso', /* lingua: valore del protocollo del kernel, mai a schermo */ 'non concluso'];",
    "const c = /* lingua: */ 'non concluso senza perché';",
    "/* lingua: valore del protocollo */",
    "const d = 1; const e = 'non concluso su un’altra riga';",
    "const f = 'il server-side non risponde';",
  ].join('\n'));
  assert.deepEqual(trovate.map((r) => r.testo), ['non concluso senza perché', 'non concluso su un’altra riga', 'il server-side non risponde']);
  assert.equal(eFraseItaliana('talos-file-risultato__dove talos-muted'), false);
  assert.equal(eFraseItaliana('talos-muted dove'), true, 'un pezzo senza trattino è una parola: conta');
});

test('LINGUA-2B-CRICCHETTO AL CONTRARIO: una frase italiana in più in un file è rossa', () => {
  const soglie = { testiFissi: {}, frasiVecchie: {}, frasiItaliane: { 'a.js': 3 }, html: { testi: 0, attributi: 0 } };
  assert.equal(confrontaConSoglie({ testiFissi: {}, frasiVecchie: {}, frasiItaliane: { 'a.js': 4 }, html: { testi: 0, attributi: 0 } }, soglie).superati.length, 1);
  assert.equal(confrontaConSoglie({ testiFissi: {}, frasiVecchie: {}, frasiItaliane: { 'a.js': 3 }, html: { testi: 0, attributi: 0 } }, soglie).superati.length, 0);
});

test('LINGUA-3-INDIRIZZO: la pseudo-lingua si accende solo con #lingua=qps, mai con un altro valore', () => {
  assert.equal(linguaDaIndirizzo('#lingua=qps'), 'qps');
  assert.equal(linguaDaIndirizzo('#open-workspace=abc&lingua=qps'), 'qps', 'convive coi parametri del lanciatore');
  assert.equal(linguaDaIndirizzo('#lingua=it'), null, 'AL CONTRARIO: una lingua vera non passa di qui');
  assert.equal(linguaDaIndirizzo('#lingua=QPS'), null);
  assert.equal(linguaDaIndirizzo(''), null);
  assert.equal(linguaDaIndirizzo(undefined), null);
});

test('LINGUA-2-TS: il cancello legge anche i file TypeScript, come TypeScript', () => {
  /* 03/10/2026: 153 frasi italiane in 7 file `.ts` (registry.ts: «Libreria e documenti», «Progetti»…) restavano fuori. */
  const nomi = fileDelFrontend().map((f) => f.replace(/\\/gu, '/'));
  assert.ok(nomi.some((f) => f.endsWith('src/services/commands/registry.ts')), 'i .ts si contano');
  const finta = mkdtempSync(join(tmpdir(), 'talos-lingua-ts-'));
  try {
    mkdirSync(join(finta, 'src'));
    for (const n of ['a.js', 'b.ts', 'c.tsx', 'd.d.ts']) writeFileSync(join(finta, 'src', n), '');
    assert.deepEqual(fileDelFrontend(finta).map((f) => basename(f)), ['a.js', 'b.ts', 'c.tsx'], 'le dichiarazioni .d.ts no');
  } finally { rimuoviCartellaDiProva(finta); }
  const sorgente = [
    "interface Voce { etichetta: string; peso: number }",
    "const vuoto: string = <string>'Nessun risultato trovato';", // un cast angolare: letto come JS, l'albero si spezza
    "export function titolo(v: Voce): string { return v.peso > 0 ? 'Apri la cartella del progetto' : v.etichetta; }",
  ].join('\n');
  assert.deepEqual(frasiItalianeNelSorgente(sorgente, 'x.ts').map((r) => r.testo), ['Nessun risultato trovato', 'Apri la cartella del progetto']);
  const registro = readFileSync(new URL('../../src/services/commands/registry.ts', import.meta.url), 'utf8');
  assert.equal(conteggiDiOggi().frasiItaliane['src/services/commands/registry.ts'] ?? 0, frasiItalianeNelSorgente(registro, 'registry.ts').length,
    'il conteggio del cricchetto per un .ts è quello del rilevatore');
});

test('LINGUA-2-FRAMMENTI: il cancello misura anche i frammenti del modello (frammenti.html), con un cricchetto suo', () => {
  /* 03/10/2026: «Prova tutti» e «Modello attivo condiviso con Chat:» arrivavano in inglese da `src/legacy/frammenti.html`, che il
     cancello non leggeva. Adesso il conteggio c'è e ha la sua soglia. */
  const oggi = conteggiDiOggi();
  assert.ok(oggi.htmlFrammenti && Number.isSafeInteger(oggi.htmlFrammenti.testi), 'i frammenti si contano');
  const sorgente = readFileSync(new URL('../../src/legacy/frammenti.html', import.meta.url), 'utf8');
  /* 03/10/2026, corsia S1: «Prova tutti» ha la sua chiave e i frammenti sono a zero. AL CONTRARIO: tolta la chiave, il testo torna
     nel conteggio — il cancello lo vede ancora. */
  const senzaChiave = sorgente.replace(/ data-t="[^"]*"(?=[^>]*>Prova tutti<)/u, '');
  assert.notEqual(senzaChiave, sorgente, '«Prova tutti» ha un data-t da togliere');
  assert.ok(testiDelModelloHtml(senzaChiave).testi > testiDelModelloHtml(sorgente).testi, 'senza chiave «Prova tutti» si conta di nuovo');
  const soglie = { testiFissi: {}, frasiVecchie: {}, frasiItaliane: {}, html: { testi: 0, attributi: 0 }, htmlFrammenti: { testi: 3, attributi: 1 } };
  const base = { testiFissi: {}, frasiVecchie: {}, frasiItaliane: {}, html: { testi: 0, attributi: 0 } };
  assert.deepEqual(confrontaConSoglie({ ...base, htmlFrammenti: { testi: 3, attributi: 1 } }, soglie).superati, []);
  assert.equal(confrontaConSoglie({ ...base, htmlFrammenti: { testi: 4, attributi: 1 } }, soglie).superati.length, 1, 'AL CONTRARIO: un testo in più è rosso');
  assert.deepEqual(confrontaConSoglie({ ...base, htmlFrammenti: { testi: 2, attributi: 1 } }, soglie).migliorati, ['htmlFrammenti.testi: 3 → 2']);
});

/* 03/10/2026, corsia S1: il modello HTML si legge con una pila. Un `data-t` con chiave stabile copre il PRIMO testo del suo
   elemento e basta; `data-t-attr` copre gli attributi nominati. AL CONTRARIO: un `data-t` con una frase vecchia non copre, il
   testo dopo un figlio resta contato, un attributo non nominato resta contato, una chiave inventata è rossa in LINGUA-1-USATE. */
test('LINGUA-MODELLO-CHIAVI: data-t e data-t-attr escono dal conteggio solo con una chiave stabile', () => {
  const senza = '<!doctype html><section><h2>Nuova sessione</h2><button title="Apri il pannello">Apri <b>2</b> schede</button><img alt="Il logo di TALOS"></section>';
  assert.deepEqual(testiDelModelloHtml(senza), { testi: 3, attributi: 2 });
  const con = '<!doctype html><section><h2 data-t="modello.home.titolo">Nuova sessione</h2>'
    + '<button data-t="modello.home.apri" data-t-attr="[title]modello.home.apriTitolo" title="Apri il pannello">Apri <b>2</b> schede</button>'
    + '<img alt="Il logo di TALOS"><p data-t="Frase vecchia come chiave">Frase vecchia come chiave</p></section>';
  assert.deepEqual(testiDelModelloHtml(con), { testi: 2, attributi: 1 }, '«schede» (dopo il figlio) e la frase vecchia restano; resta l’alt non nominato');
  assert.deepEqual(chiaviDelModelloHtml(con), ['modello.home.titolo', 'modello.home.apri', 'modello.home.apriTitolo']);
  const mancanti = chiaviDelModelloHtml(con).filter((k) => TESTI.en[k] === undefined);
  assert.deepEqual(mancanti, ['modello.home.titolo', 'modello.home.apri', 'modello.home.apriTitolo'], 'chiavi inventate: LINGUA-1-USATE le vede');
});

test('LINGUA-MODELLO-CHIAVI: le chiavi del modello e dei frammenti entrano in LINGUA-1-USATE', () => {
  /* Su una radice FINTA, perché il modello vero oggi non ha ancora chiavi stabili: due elenchi vuoti uguali non proverebbero
     il collegamento. */
  const finta = mkdtempSync(join(tmpdir(), 'talos-lingua-modello-'));
  try {
    mkdirSync(join(finta, 'src', 'legacy'), { recursive: true });
    writeFileSync(join(finta, 'index.template.html'), '<p data-t="modello.prova.titolo">Ciao</p>');
    writeFileSync(join(finta, 'src', 'legacy', 'frammenti.html'), '<b data-t-attr="[title]modello.prova.suggerimento" title="Apri">x</b>');
    writeFileSync(join(finta, 'src', 'a.js'), 'export const a = 1;\n');
    const dalModello = conteggiDiOggi(finta).chiaviUsate.filter(({ file }) => file === 'index.template.html' || file === 'src/legacy/frammenti.html');
    assert.deepEqual(dalModello, [{ file: 'index.template.html', chiave: 'modello.prova.titolo' }, { file: 'src/legacy/frammenti.html', chiave: 'modello.prova.suggerimento' }]);
  } finally { rimuoviCartellaDiProva(finta); }
  // e il modello vero, oggi: le sue chiavi (se ce ne sono) esistono tutte
  const vere = chiaviDelModelloHtml(readFileSync(join(RADICE_FRONTEND, 'index.template.html'), 'utf8'));
  assert.deepEqual(vere.filter((k) => TESTI.en[k] === undefined), []);
});

/* 03/10/2026, corsia S1: in italiano lo schermo NON cambia. Ogni data-t / data-t-attr del modello e dei frammenti ha come voce
   italiana esattamente il testo scritto lì. AL CONTRARIO: una voce diversa anche di una lettera, o di un'entità, è rossa. */
test('LINGUA-MODELLO-IDENTICO: in italiano ogni chiave del modello dice esattamente il testo scritto', () => {
  for (const f of ['index.template.html', join('src', 'legacy', 'frammenti.html')]) {
    assert.deepEqual(differenzeItalianeDelModello(readFileSync(join(RADICE_FRONTEND, f), 'utf8'), TESTI.it), [], f);
  }
  const html = '<p data-t="modello.prova.a">Apri  il\n pannello</p><b data-t-attr="[title]modello.prova.b" title="Tu &amp; io">x</b>';
  assert.deepEqual(differenzeItalianeDelModello(html, { 'modello.prova.a': 'Apri il pannello', 'modello.prova.b': 'Tu & io' }), []);
  assert.equal(differenzeItalianeDelModello(html, { 'modello.prova.a': 'Apri il pannelo', 'modello.prova.b': 'Tu & io' }).length, 1);
  assert.equal(differenzeItalianeDelModello(html, { 'modello.prova.a': 'Apri il pannello', 'modello.prova.b': 'Tu &amp; io' }).length, 1);
});

/* 03/10/2026, corsia S1: uno spazio rigido (`&nbsp;`) non è un testo. Il badge del Doctor era `<b>3</b>&nbsp;ok`: il nodo di testo che
   `applicaLingua` vede, con `trim()`, è «ok» e non «&nbsp;ok», e riscrivendolo con uno spazio in testa il badge si allargava. Ora lo
   spazio rigido sta fuori e la parola ha il suo `<span data-t>`. AL CONTRARIO: senza la chiave, la parola si conta; e un testo vero
   che comincia con uno spazio rigido si conta lo stesso, non sparisce dal conteggio. */
test('LINGUA-MODELLO-NBSP: uno spazio rigido da solo non è un testo, la parola accanto sì', () => {
  const coperto = '<span><b>3</b>&nbsp;<span data-t="modello.doctor.ok">ok</span></span>';
  assert.deepEqual(testiDelModelloHtml(coperto), { testi: 0, attributi: 0 });
  assert.deepEqual(differenzeItalianeDelModello(coperto, { 'modello.doctor.ok': 'ok' }), []);
  const scoperto = '<span><b>3</b>&nbsp;<span>ok</span></span>';
  assert.deepEqual(testiDelModelloHtml(scoperto), { testi: 1, attributi: 0 }, 'la parola senza chiave resta contata');
  assert.deepEqual(testiDelModelloHtml('<p>&nbsp;Apri il pannello</p>'), { testi: 1, attributi: 0 }, 'un testo vero con lo spazio rigido in testa non sparisce');
  assert.equal(differenzeItalianeDelModello('<p data-t="modello.prova.a">&nbsp;Apri il pannello</p>', { 'modello.prova.a': 'Apri il pannello' }).length, 0, 'lo spazio rigido ai bordi non fa parte della frase');
  assert.equal(differenzeItalianeDelModello('<p data-t="modello.prova.a">&nbsp;Apri il pannello</p>', { 'modello.prova.a': 'Apri  il pannello' }).length, 1, 'e una frase diversa è rossa');
});
