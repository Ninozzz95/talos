import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/*
 * ⛔⛔⛔ 11/09/2026 — LAYOUT THRASHING NELL'APERTURA DI UNA SESSIONE LUNGA.
 *
 * Misurato sul banco (porta libera, copia dello store, mai il 4174), sessione da 34.026 righe e
 * 19.482 nodi in chat, Chrome vero con i tre flag anti-throttling, mediana di 3 giri:
 *
 *   fine del replay      2.722 ms → 997 ms      main thread bloccato  2.645 ms → 882 ms
 *   primo frame stabile  2.867 ms → 1.092 ms    fotogramma peggiore   2.177 ms → 730 ms
 *
 * a schermo ESATTAMENTE lo stesso contenuto (916.907 caratteri, stessa impronta, 213 righe
 * attrezzo, 614 blocchi di codice, 43 collassabili).
 *
 * Le tre cure hanno un principio solo — «non toccare il DOM a ogni delta, non leggere il layout a
 * ogni evento: una volta per FOTOGRAMMA» (web.dev «Avoid large, complex layouts and layout
 * thrashing», agg. 07/05/2025; webperf.tips «Layout Thrashing and Forced Reflows», 11/12/2022;
 * Paul Irish «What forces layout/reflow», agg. 09/09/2026 — lette l'11/09/2026).
 *
 * ⛔ Questo file è un CANCELLO sul sorgente, e ogni prova gira anche AL CONTRARIO: la stessa
 *   asserzione viene rifatta su una copia GUASTA del sorgente (la forma di ieri, rimessa a mano) e
 *   deve fallire. Un cancello che passa sia sul codice curato sia su quello malato non è un
 *   cancello.
 */

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
const senzaCommenti = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const NUDO = senzaCommenti(APP);

// Gli handle cancellabili hanno ampliato il custode: un limite di caratteri
// troncava safety/handoff e produceva falsi negativi. Leggere la funzione intera.
const corpoCustode = (s) => {
  const corpo = s.match(/^  function mantieniFondoDuranteRipristino\([^]*?^  }/m)?.[0];
  assert.ok(corpo, 'il confine della funzione custode deve esistere');
  return corpo;
};

/** Il corpo di una funzione o di un `case`, dal segnale dato fino a `lunghezza` caratteri. */
const attorno = (sorgente, segnale, lunghezza = 2600) => {
  const i = sorgente.indexOf(segnale);
  assert.notEqual(i, -1, `segnale non trovato nel sorgente: ${segnale}`);
  return sorgente.slice(i, i + lunghezza);
};

/*
 * ⛔ `case 'ToolCallArgs'` compare DUE volte nel file: la prima è l'esportazione in markdown di
 *   una conversazione (`toolBuffer`), la seconda è `handleRealEvent`. È il secondo che ci
 *   interessa — il primo è stato preso per buono in una prima stesura di questo cancello, e
 *   diceva il falso su tutt'altra funzione.
 */
const attornoUltimo = (sorgente, segnale, lunghezza = 2600) => {
  const i = sorgente.lastIndexOf(segnale);
  assert.notEqual(i, -1, `segnale non trovato nel sorgente: ${segnale}`);
  return sorgente.slice(i, i + lunghezza);
};

/** Ogni prova gira anche sul sorgente GUASTO: lì deve fallire, o non sta guardando niente. */
const morde = (controllo, guasto) => {
  assert.throws(() => controllo(guasto), assert.AssertionError,
    'il controllo passa anche sul sorgente GUASTO: non morde');
};

test('RIPRISTINO-01: il MutationObserver MARCA, non legge-e-scrive il layout a ogni mutazione', () => {
  const controllo = (s) => {
    const corpo = corpoCustode(s);
    // la forma di ieri — reflow sincrono forzato per ogni mutazione — non deve esistere più
    assert.doesNotMatch(corpo, /new MutationObserver\(inFondo\)/);
    assert.match(corpo, /new MutationObserver\(chiediFondo\)/);
    // e il marcatore paga la coppia lettura+scrittura una volta per fotogramma
    assert.match(corpo, /chiediFondo = \(\) => \{[\s\S]*?requestAnimationFrame\(\(\) => \{[^}]*inFondo\(\);/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace('new MutationObserver(chiediFondo)', 'new MutationObserver(inFondo)'));
});

test('RIPRISTINO-02: il fondo FINALE resta sincrono — la cura non lo affida al fotogramma', () => {
  // ⛔ il verso che conta per l'owner: «cliccando una sessione la chat deve essere già in fondo».
  // 30/09: 4200 come RIPRISTINO-03 — il custode ora segue anche l'altezza (`seguiCrescita`) e il corpo è più lungo.
  const controllo = (s) => {
    const corpo = corpoCustode(s);
    assert.match(corpo, /const scopri = \(\) => \{[^}]*inFondo\(\);[^}]*classList\.remove\('is-restoring'\);[^}]*inFondo\(\);/);
    assert.match(corpo, /scopri\(\);\s*if \(!smesso\) \{\s*frameFinale = window\.requestAnimationFrame\(\(\) => \{[^}]*inFondo\(\);/);
    assert.match(corpo, /timerFinale = window\.setTimeout\(\(\) => \{[^}]*inFondo\(\); \}, 250\);/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace("return; inFondo(); conversation.classList.remove('is-restoring');", "return; window.requestAnimationFrame(inFondo); conversation.classList.remove('is-restoring');"));
});

test('RIPRISTINO-03 (A1-R2, 07/10/2026): la rete di sicurezza non scopre MAI a tempo — solo un flusso morto la fa scoprire', () => {
  const controllo = (s) => {
    const corpo = corpoCustode(s);
    // 8 s erano tarati su «1.235 righe in ~1s»: su 34.026 righe scoprivano una cronologia a metà
    assert.doesNotMatch(corpo, /setTimeout\(\(\) => \{ if \(!smesso\) scopri\(\); \}, 8_000\)/);
    assert.match(corpo, /const reteDiSicurezza = \(\) => \{/);
    // ⛔ A1-R2: né il silenzio né il tempo scoprono (velo caduto a 8.036 ms su zero turni, misurato sul 4174): niente tetto a 20 s
    assert.doesNotMatch(corpo, /< 20_000/);
    assert.doesNotMatch(corpo, /ultimoEventoNuovo/);
    assert.match(corpo, /if \(flussoMorto\(\)\) \{ scopri\(\); seguiCrescita\(\); return; \}/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace(/const reteDiSicurezza[\s\S]*?timerSicurezza = window\.setTimeout\(reteDiSicurezza, 8_000\);/,
    'window.setTimeout(() => { if (!smesso) scopri(); }, 8_000);'));
  morde(controllo, NUDO.replace('if (flussoMorto()) { scopri(); seguiCrescita(); return; }', 'if (true) { scopri(); seguiCrescita(); return; }'));
});

test('ARGOMENTI-01: durante un replay `ToolCallArgs` NON disegna a ogni delta', () => {
  const controllo = (s) => {
    const corpo = attornoUltimo(s, "case 'ToolCallArgs': {", 900);
    assert.match(corpo, /info\.argomenti \+= evento\.delta;/);
    assert.match(corpo, /if \(state\.realSession\.deferHistoricalRendering\) \{ chiediDisegnoArgomentiAttrezzo\(info\); break; \}/);
    // ⛔ dentro il `case` non deve restare nessun disegno diretto: quello vive nella funzione
    assert.doesNotMatch(corpo, /renderizzaArgomentiAttrezzo\(/);
    assert.doesNotMatch(corpo, /JSON\.parse\(info\.argomenti\)/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace('if (state.realSession.deferHistoricalRendering) { chiediDisegnoArgomentiAttrezzo(info); break; }',
    'if (info.detail) renderizzaArgomentiAttrezzo(info.detail, info.argomenti);'));
});

test('ARGOMENTI-02: dal vivo la grana delta-per-delta resta — si coalesce SOLO il passato', () => {
  // ⛔ il verso contrario: senza replay in corso si disegna subito, come prima.
  const corpo = attornoUltimo(NUDO, "case 'ToolCallArgs': {", 900);
  assert.match(corpo, /deferHistoricalRendering\) \{ chiediDisegnoArgomentiAttrezzo\(info\); break; \}\s*\n\s*aggiornaVistaArgomentiAttrezzo\(info\);/);
});

test('ARGOMENTI-03: chi scrive dentro `info.detail` salda PRIMA il disegno differito', () => {
  /*
   * ⛔ Non è un'ottimizzazione: `renderizzaArgomentiAttrezzo` fa `replaceChildren()`. Se il disegno
   *   differito arrivasse DOPO l'append dell'uscita o dell'esito, li CANCELLEREBBE — cioè la cura
   *   della velocità si mangerebbe un pezzo di conversazione, che è peggio del difetto.
   */
  const controllo = (s) => {
    for (const ramo of ["case 'ToolCallOutput': {", "case 'ToolCallResult': {"]) {
      const corpo = attornoUltimo(s, ramo, 4200);
      const salda = corpo.indexOf('disegnaArgomentiSeInAttesa(info)');
      const scrive = corpo.search(/info\??\.detail\.(appendChild|append|replaceChildren)/);
      assert.notEqual(salda, -1, `${ramo} non salda il disegno differito`);
      assert.ok(scrive === -1 || salda < scrive, `${ramo}: si scrive in detail PRIMA di saldare`);
    }
  };
  controllo(NUDO);
  morde(controllo, NUDO.replaceAll('disegnaArgomentiSeInAttesa(info);', ''));
});

/*
 * ⛔ Cura dell uscita 0.2.2 (16/11, giudice v1966). Il giro 7 della gemella ha messo le maschere della carta sugli argomenti della riga
 *   (`argomentiDellaRiga`), e con loro è tornato il secondo JSON.parse che l 11/09 era stato tolto: `aggiornaVistaArgomentiAttrezzo`
 *   legge la stringa, poi `argomentiDellaRiga` rilegge LA STESSA stringa. Misurato con una spia sul sorgente vero, un disegno nel replay:
 *   0.2.1 = 1 JSON.parse, 0.2.2 = 2. La forma nuova: l oggetto già letto si passa ad `argomentiDellaRiga`, che lo maschera con la stessa
 *   `oscuraPerStruttura` e non lo rilegge; se la lettura è fallita (un delta a metà) la strada è quella di prima, chiusura e maschera.
 *   Le prove qui sotto fanno girare le DUE funzioni vere della pagina, estratte dal sorgente, con la carta vera.
 */
const funzioneDellaPagina = (sorgente, nome) => {
  const inizio = sorgente.indexOf(`\n  function ${nome}(`);
  assert.notEqual(inizio, -1, `manca ${nome}`);
  return sorgente.slice(inizio, sorgente.indexOf('\n  }\n', inizio) + 4);
};
const carta = await import('../../src/components/carta-dal-testo.js');

/** Un disegno degli argomenti di una riga nel replay, sul sorgente dato: quanti JSON.parse, che cosa arriva a schermo. */
function disegnaNelReplay(sorgente, argomenti, cartaUsata = carta) {
  const elemento = () => ({ children: [], className: '', textContent: '', appendChild(c) { this.children.push(c); return c; }, append(...c) { this.children.push(...c); }, replaceChildren() { this.children = []; } });
  const visti = [];
  const stub = {
    document: { createElement: elemento, createTextNode: (testo) => ({ testo }) },
    textElement: (tag, cls, testo) => ({ tag, cls, testo }),
    etichettaArgomento: (k) => k,
    tr: (k) => k,
    localeUI: () => 'en',
    riassuntoAttrezzoInCorso: (_nome, a) => { visti.push(JSON.stringify(a)); return 'riassunto'; },
    dettaglioRigaAttrezzo: (_nome, a) => { visti.push(JSON.stringify(a)); return 'dettaglio'; },
    argomentiAttrezzoInAttesa: new Set(),
    argomentiDellaRiga: cartaUsata.argomentiDellaRiga,
    leggiArgomentiDellaRiga: cartaUsata.leggiArgomentiDellaRiga,
    argomentiGrezziDellaRiga: cartaUsata.argomentiGrezziDellaRiga,
  };
  const corpo = `with (stub) { ${funzioneDellaPagina(sorgente, 'renderizzaArgomentiAttrezzo')}\n${funzioneDellaPagina(sorgente, 'aggiornaVistaArgomentiAttrezzo')}\n return aggiornaVistaArgomentiAttrezzo; }`;
  const aggiorna = new Function('stub', corpo)(stub); // eslint-disable-line no-new-func
  const info = { nome: 'scrivi', argomenti, summaryText: {}, dettaglio: {}, detail: elemento() };
  const vero = JSON.parse;
  let letture = 0;
  JSON.parse = function spia(...a) { letture += 1; return vero.apply(this, a); };
  try { aggiorna(info); } finally { JSON.parse = vero; }
  return { letture, righe: info.detail.children, schermo: JSON.stringify(info.detail.children) + visti.join(''), info };
}

test('ARGOMENTI-04: nel replay gli argomenti già letti non si rileggono — UN JSON.parse per disegno', () => {
  const argomenti = JSON.stringify({ path: 'C:/progetto/nota.txt', contenuto: 'riga uno\nriga due' });
  const controllo = (s) => {
    const { letture, righe } = disegnaNelReplay(s, argomenti);
    assert.equal(letture, 1, `un disegno degli argomenti ha fatto ${letture} JSON.parse sulla stessa stringa`);
    assert.equal(righe.length, 2, 'le righe degli argomenti si disegnano ancora');
  };
  controllo(APP);
  // il chiamante che torna a passare solo la stringa (la forma del giro 7) rilegge: deve cadere
  morde(controllo, APP.replace('const mostrati = letti.mostrati;', 'const mostrati = argomentiDellaRiga(info.argomenti);'));
});

test('ARGOMENTI-05: l oggetto già letto passa dalla maschera della carta — una password annidata resta oscurata', () => {
  const argomenti = JSON.stringify({ path: 'C:/progetto/db.json', db: { host: 'localhost', password: 'hunter2' }, api_key: 'sk-segreto-0123456789' });
  const { letture, schermo } = disegnaNelReplay(APP, argomenti);
  assert.equal(letture, 1);
  assert.doesNotMatch(schermo, /hunter2/u, 'la password annidata è arrivata a schermo in chiaro');
  assert.doesNotMatch(schermo, /sk-segreto-0123456789/u, 'la chiave è arrivata a schermo in chiaro');
  assert.match(schermo, /\[redacted\]/u);
  assert.match(schermo, /localhost/u, 'ciò che non è segreto resta leggibile');
});

test('ARGOMENTI-06: un delta a metà segue la strada di prima — si chiude per la vista e si maschera', () => {
  const argomenti = '{"path":"C:/progetto/db.json","db":{"password":"hunter2"},"conte';
  const { righe, schermo } = disegnaNelReplay(APP, argomenti);
  assert.equal(righe.length, 2, 'il JSON a metà si chiude per la vista: path e db');
  assert.doesNotMatch(schermo, /hunter2/u);
  assert.match(schermo, /\[redacted\]/u);
  assert.match(schermo, /C:\/progetto\/db\.json/u);
});

/* Giudice v1971 (16/11): dal vivo `aggiornaVistaArgomentiAttrezzo` gira a OGNI delta. Su un delta a metà erano 3 JSON.parse (il chiamante,
   poi `argomentiDellaRiga` che rileggeva la stessa stringa e la chiusa) contro 1 della 0.2.1: misurato 3,71 contro 0,81 ms per pezzo
   (50 KB in 200 pezzi, mediana di 7 corse, C:/T/cura-022-lavoro/delta). Ora UNA lettura, della stringa chiusa, con la stessa maschera. */
test('ARGOMENTI-07: un delta a metà costa UNA lettura per disegno, con la stessa chiusura e la stessa maschera', () => {
  const { letture, righe, schermo, info } = disegnaNelReplay(APP, '{"path":"C:/progetto/db.json","db":{"password":"hunter2"},"conte');
  assert.equal(letture, 1, `un delta a metà ha fatto ${letture} JSON.parse`);
  assert.equal(righe.length, 2);
  assert.doesNotMatch(schermo, /hunter2/u);
  assert.equal(info.argomentiParsati, undefined, 'un JSON chiuso per la vista non vale come argomenti veri');
  assert.deepEqual(disegnaNelReplay(APP, '{"path":"a.txt"}').info.argomentiParsati, { path: 'a.txt' }, 'intero sì');
});

test('FONDO-01: `fondoConversazioneInVista` legge il layout una volta per fotogramma, e scade', () => {
  /*
   * Profilo CPU dopo la prima cura: era diventata la prima voce con 1.343 ms di self-time, chiamata
   * da `aggiornaPiedeChatDaStato` ← `aggiornaRiassuntoBatch` (881 ms) e ← `aggiornaComposerUsage`
   * (363 ms), cioè UNA VOLTA PER EVENTO, su un albero appena mutato.
   */
  const controllo = (s) => {
    const corpo = attorno(s, 'function fondoConversazioneInVista()', 900);
    assert.match(corpo, /fondoInVistaRicordato !== null && performance\.now\(\) - fondoInVistaRicordatoA < 250/);
    assert.match(corpo, /requestAnimationFrame\(\(\) => \{ fondoInVistaRicordato = null; \}\)/);
    // ⛔ la scadenza a tempo non è ridondante: in una scheda in secondo piano il rAF non arriva
    assert.match(corpo, /fondoInVistaRicordatoA = performance\.now\(\);/);
  };
  controllo(NUDO);
  morde(controllo, NUDO.replace('window.requestAnimationFrame(() => { fondoInVistaRicordato = null; });', ''));
});

test('SPAZIO-CODA-01: lo spazio in coda resta una scrittura sola, con la sua uscita anticipata', () => {
  // la funzione non cambia forma: quello che è cambiato è QUANTE volte la si chiama
  // 26/09 (difetto 5, opzione C dell'owner): il corpo è cresciuto — la riserva ora si misura sul contenuto — e la scrittura cadeva
  // oltre i 700 caratteri guardati. L'invariante è lo stesso (una scrittura sola, con l'uscita anticipata): si guarda più lontano.
  const corpo = attorno(NUDO, 'function aggiornaSpazioCodaConversazione(', 1400);
  assert.match(corpo, /if \(spazio === spazioCodaConversazioneUltimo\) return;/);
  assert.match(corpo, /setProperty\('--stream-follow-space'/);
});

/*
 * ⛔⛔ 30/09/2026 — owner: «le sessioni lunghe, quando uno le seleziona, devono andare alla fine; e per le più pesanti uno
 *   spinner, che non faccia pensare che si sia bloccato tutto». Misurato sul 4174 (`a214dd29`): la chat si scopriva a 79 ms,
 *   prima della cronologia, e finiva 787 px sopra il fondo (578 con la rete lenta), a schermo vuoto nel frattempo. Tre cause,
 *   una guardia ciascuna.
 */
test('RIPRISTINO-06: il custode finisce con la RIGIOCATA, non con l evento terminale (vero dal clic per una conclusa)', () => {
  const controllo = (s) => {
    const corpo = corpoCustode(s);
    assert.match(corpo, /if \(generation !== state\.realSession\.generation\) \{ smetti\(\); return; \}/);
    assert.match(corpo, /if \(!state\.realSession\.inRigiocata\) \{/);
    assert.doesNotMatch(corpo, /state\.realSession\.eventoTerminaleVisto\) \{/);
  };
  controllo(NUDO);
  morde(controllo, corpoCustode(NUDO).replace('if (!state.realSession.inRigiocata) {', 'if (state.realSession.eventoTerminaleVisto) {'));
});

test('RIPRISTINO-07: una bolla RIGIOCATA non spegne il custode — il riarmo lo stacca solo fuori dalla rigiocata', () => {
  const corpo = attorno(NUDO, 'function riarmaSeguiConversazione', 500);
  assert.match(corpo, /if \(!state\.realSession\.inRigiocata\) fermaFondoRipristino\?\.\(\);/);
});

test('RIPRISTINO-08: dopo la comparsa si segue l ALTEZZA, e la cronologia si costruisce nascosta con l indicatore', () => {
  const corpo = corpoCustode(NUDO);
  assert.match(corpo, /new ResizeObserver\(chiediFondo\)/);
  assert.match(corpo, /seguiAltezza\?\.disconnect\(\);/, 'chi smette stacca anche il ResizeObserver');
  assert.match(corpo, /timerFinale = window\.setTimeout\(\(\) => \{[^}]*inFondo\(\); \}, 250\);\s*seguiCrescita\(\);/);
  const stili = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');
  assert.match(stili, /#conversation\.is-restoring\{visibility:hidden\}/, 'la regola persa nel cutover del 06/09 è di nuovo nel foglio del pacchetto');
  assert.match(stili, /\.talos-conversation:has\(> #conversation\.is-restoring\) > \.talos-caricamento-cronologia\{/);
  assert.match(NUDO, /assicuraCaricamentoCronologia\(conversation\);/);
});

/* 01/10/2026 — owner: «schermata vuota e un frame del glifo poco prima che carica, non al click della riga sessione». Il
   ritardo di 250 ms dell'indicatore lo teneva nascosto per quasi tutta l'attesa (misurato sul 4174: cronologia a ~300 ms). */
test('RIPRISTINO-09: l indicatore della cronologia si vede dal clic, senza ritardo', () => {
  const stili = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');
  const regola = stili.match(/\.talos-conversation:has\(> #conversation\.is-restoring\) > \.talos-caricamento-cronologia\{[^}]*\}/u)?.[0] ?? '';
  assert.notEqual(regola, '', 'la regola che mostra l indicatore esiste');
  assert.doesNotMatch(regola, /animation|transition-delay|visibility:hidden/, 'nessun ritardo né visibilità nascosta sull indicatore');
  assert.doesNotMatch(stili, /@keyframes talos-caricamento-ritardo/);
});

/* A1-R3b (08/10/2026, bugfixer; visto dal vivo sulla 4176 sotto il velo di DESKTOP OLD): la mini-cronologia dei giri è figlia di
   #schermoChat, ACCANTO alla conversazione, e restava visibile e cliccabile sotto «Apro la cronologia…». Si nasconde col velo. */
test('RIPRISTINO-10: col velo anche la mini-cronologia dei giri si nasconde, e nessun figlio la riaccende', () => {
  const stili = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8');
  assert.match(stili, /#schermoChat:has\(#conversation\.is-restoring\) > \.talos-cronologia\{visibility:hidden\}/);
  // al contrario: un `visibility:visible` su un figlio annullerebbe il velo per quel figlio
  assert.doesNotMatch(stili, /\.talos-cronologia[^{]*\{[^}]*visibility:visible/);
});
