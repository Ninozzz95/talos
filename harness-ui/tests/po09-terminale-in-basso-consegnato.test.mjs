import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

/*
 * ⛔⛔⛔ PO-09 — IL DIFETTO ERA DI CONSEGNA, NON DI CODICE.
 *
 * L'11/09 il pannello del terminale in basso era scritto e provato nel SORGENTE
 * (`frontend/src/legacy/app.js`, `frontend/src/styles/terminale-basso.css`,
 * `frontend/index.template.html`) e compariva ZERO volte nel pacchetto che il server consegna al
 * browser: `harness-ui/public/`. Misurato al commit `65e557d3^` — index.html 0, styles.css 0,
 * app.js 0. Per chi usava la app la funzione NON ESISTEVA, e nessun test se n'era accorto perché
 * tutti guardavano il sorgente, cioè il posto dove la cosa c'era.
 *
 * ⇒ Questo cancello guarda il PACCHETTO COSTRUITO, mai il sorgente, e sul sorgente ci va solo per
 *   chiedere «c'è di là ciò che c'è di qua?». È la forma generale del difetto: sorgente avanti,
 *   bundle indietro. Un `npm run build` dimenticato lo riaccende.
 *
 * ⛔ PROVATO NEL VERSO CHE DEVE FALLIRE, e non su una fixture inventata: puntando
 *   `TALOS_PO09_BUNDLE_DIR` alla copia vera del bundle di `65e557d3^` (quello senza la consegna)
 *   ognuna delle asserzioni qui sotto protesta. Una prova che passa sia col difetto sia senza non
 *   è una prova.
 */

const QUI = dirname(fileURLToPath(import.meta.url));
const BUNDLE = process.env.TALOS_PO09_BUNDLE_DIR || join(QUI, '..', 'public');
const SORGENTE = join(QUI, '..', 'frontend', 'src');

const leggi = (base, ...pezzi) => readFileSync(join(base, ...pezzi), 'utf8');

/*
 * I SEGNI, uno per strato: senza anche uno solo il pannello è sullo schermo a metà.
 * Ognuno dice in quale file del pacchetto deve stare e perché è lui a provare lo strato.
 */
const SEGNI = [
  ['index.html', 'id="pannelloTerminale"', 'il pannello esiste nel markup consegnato'],
  ['index.html', 'data-ospite-terminale', 'il posto dove il terminale viene ospitato'],
  ['index.html', 'data-maniglia-terminale', 'la maniglia che ne cambia l’altezza'],
  ['index.html', 'id="pillTerminale"', 'la pill del composer che lo apre'],
  ['styles.css', '.talos-terminale-basso__ospite', 'lo stile dell’ospite: senza, il terminale non ha dimensione'],
  ['styles.css', '.talos-terminale-basso__maniglia', 'lo stile della maniglia'],
  ['app.js', 'function collegaTerminaleInBasso', 'il comportamento è DEFINITO nel bundle'],
];

test('PO-09: il pannello del terminale in basso è nel PACCHETTO SERVITO, strato per strato', () => {
  const guardati = [];
  for (const [file, segno, perche] of SEGNI) {
    const testo = leggi(BUNDLE, file);
    assert.ok(
      testo.includes(segno),
      `⛔ PO-09 NON CONSEGNATA: «${segno}» manca in ${file} del pacchetto (${perche}). `
      + `Il pannello esiste nel sorgente ma non in ciò che il server dà al browser: rigenerare il bundle.`,
    );
    guardati.push(`${file}:${segno}`);
  }
  assert.equal(guardati.length, SEGNI.length);
});

test('PO-09: il comportamento è anche CHIAMATO, non solo definito', () => {
  /*
   * ⛔ Una funzione definita e mai chiamata è esattamente «esiste per noi e non per l'utente» in
   *   una forma più subdola: il segno c'è, il grep è verde, e a schermo non succede niente.
   *   Si conta: la definizione è una, quindi le occorrenze devono essere almeno due.
   */
  const app = leggi(BUNDLE, 'app.js');
  const occorrenze = app.split('collegaTerminaleInBasso').length - 1;
  assert.ok(
    occorrenze >= 2,
    `⛔ collegaTerminaleInBasso compare ${occorrenze} volta/e nel pacchetto: definita ma mai chiamata, `
    + 'quindi la pill non viene collegata a niente.',
  );
});

test('PO-09: la pill e il pannello sono LEGATI davvero (aria-controls ↔ id), non due nomi che si somigliano', () => {
  /*
   * ⛔ Non basta che i due nomi esistano: il legame è `aria-controls`, ed è quello che fa aprire il
   *   pannello al gestore generico delle disclosure. Se qualcuno rinomina l'id, i due segni
   *   restano entrambi presenti e il pannello smette di aprirsi — un difetto che il controllo
   *   qui sopra non vedrebbe.
   */
  const html = leggi(BUNDLE, 'index.html');
  const pill = /<button[^>]*id="pillTerminale"[^>]*>/.exec(html);
  assert.ok(pill, '⛔ la pill #pillTerminale non è nel pacchetto');
  const controlla = /aria-controls="([^"]+)"/.exec(pill[0]);
  assert.ok(controlla, '⛔ la pill non dichiara aria-controls: il gestore delle disclosure non saprà cosa aprire');
  assert.equal(
    controlla[1],
    'pannelloTerminale',
    '⛔ la pill punta a un pannello diverso da quello che esiste: il clic non aprirà niente',
  );
  assert.ok(new RegExp(`id="${controlla[1]}"`).test(html), `⛔ nessun elemento con id="${controlla[1]}" nel pacchetto`);
});

test('PO-09: il pacchetto non resta INDIETRO rispetto al sorgente (la forma generale del difetto)', () => {
  /*
   * ⛔ Questo è il cancello che avrebbe preso PO-09 il giorno stesso. Non chiede «c'è il
   *   pannello?»: chiede «ciò che il sorgente dichiara è arrivato di là?». Vale per la prossima
   *   funzione, non solo per questa.
   */
  const sorgenti = [
    [join(SORGENTE, 'styles', 'terminale-basso.css'), 'styles.css', ['.talos-terminale-basso__ospite', '.talos-terminale-basso__maniglia']],
    [join(SORGENTE, 'legacy', 'app.js'), 'app.js', ['function collegaTerminaleInBasso', 'talos.harness.desktop.terminale-basso.altezza']],
  ];
  let confronti = 0;
  for (const [percorsoSorgente, fileBundle, segni] of sorgenti) {
    const sorgente = readFileSync(percorsoSorgente, 'utf8');
    const bundle = leggi(BUNDLE, fileBundle);
    for (const segno of segni) {
      if (!sorgente.includes(segno)) continue; // il sorgente è cambiato: non è questo il cancello che lo giudica
      confronti += 1;
      assert.ok(
        bundle.includes(segno),
        `⛔ DERIVA SORGENTE→PACCHETTO: «${segno}» è in ${percorsoSorgente} ma non in ${fileBundle} del pacchetto servito. `
        + 'Il build non è stato rigenerato: la funzione esiste per chi legge il codice e non per chi usa la app.',
      );
    }
  }
  assert.ok(confronti >= 4, `il cancello ha confrontato solo ${confronti} segni: troppo pochi per dire qualcosa`);
});
