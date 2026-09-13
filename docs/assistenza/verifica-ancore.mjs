/*
 * ⛔⛔⛔ IL CANCELLO DELLE ANCORE — ogni affermazione di queste pagine, ricontata nel codice.
 *
 * Perché esiste. Queste pagine diventano le risposte che TALOS dà alle persone: una pagina che
 * descrive una cosa inesistente è PEGGIO di una pagina mancante, perché il prodotto la reciterà
 * come vera CITANDO LA FONTE. Un errore qui non resta un errore: diventa una bugia col timbro.
 *
 * ════ COSA HA TROVATO IL TERZO GIRO (13/09/2026), e perché questo file è stato rifatto ════
 *
 * Le prime due stesure del cancello erano VERDI su pagine sbagliate. Le quattro cause, tutte
 * riprodotte con una mutazione PRIMA di essere curate:
 *
 *  (1) ⛔ TUTTE le guardie negative erano INERTI CONTRO L'A-CAPO. Una guardia negativa dice
 *      «questa frase sbagliata NON deve stare nella pagina», e la cercava nel testo GREZZO. Ma il
 *      markdown è incolonnato a 80 caratteri: la stessa frase, spezzata da un a-capo, non si
 *      trovava — e la guardia diceva OK su una pagina che la conteneva. Una guardia che il
 *      riempimento del testo disarma non è una guardia.
 *      ⇒ Qui OGNI confronto con una pagina passa da `normalizza()`: a-capo, asterischi del
 *        grassetto e apostrofi tipografici tolti da ENTRAMBI i lati del confronto.
 *
 *  (2) ⛔ Il controllo sui blocchi del preambolo MISURAVA UN COMMENTO — cioè commetteva la colpa
 *      esatta che era stato scritto per curare. Cercava «QUATTRO BLOCCHI» e i numeri `1.`…`4.`
 *      dentro l'intestazione JSDoc di `contesto-del-progetto.mjs`: righe che cominciano per ` * `.
 *      Riscritto il commento, il prodotto non cambia e il cancello cambia colore: stava misurando
 *      la descrizione, non la cosa.
 *      ⇒ Adesso conta il PRODOTTO: le tre `pezzi.push(` del codice vivo (blocchi 2-3-4), le tre
 *        chiavi dell'oggetto `blocchi` restituito, e nel kernel il blocco 1 messo davanti.
 *
 *  (3) ⛔ Un controllo SI SCRIVEVA DA SOLO LA FRASE da cercare. Per `deleghe.md` ricostruiva
 *      «limite di 10 figli concorrenti raggiunto» dai due numeri e verificava che stesse nella
 *      pagina — senza mai guardare se quella frase esistesse nel codice. Cambiata la frase nel
 *      sorgente, la pagina restava sbagliata e il cancello verde: misurava sé stesso.
 *      ⇒ Adesso il MODELLO della frase si estrae dal sorgente, e solo dopo si rende coi numeri veri.
 *
 *  (4) ⛔ Diversi controlli CONTAVANO LE VOCI SENZA GUARDARE I NOMI. Rinominata una chiave, il
 *      conteggio restava uguale e il cancello restava verde, mentre la pagina nominava una voce
 *      che non esiste più.
 *      ⇒ Adesso, dove la riga della pagina NOMINA delle cose, il cancello pretende i NOMI.
 *
 * ════ LE REGOLE CHE QUESTO FILE SI DÀ ════
 *
 *  (a) ⛔ OGNI CONTROLLO DICE SU QUANTE COSE HA GUARDATO. Un cancello che stampa «OK» senza dire
 *      quante cose ha letto è indistinguibile da uno che non ha letto niente. Ogni controllo
 *      torna un `misurato`, e il totale si stampa in fondo.
 *
 *  (b) ⛔ UN FILE CHE NON SI LEGGE È UN ROSSO, MAI UN VERDE. Nessun `catch` che degrada in
 *      silenzio: se il sorgente non c'è, il controllo fallisce dicendo quale file mancava.
 *
 *  (c) ⛔ SI GUARDA IL PRODOTTO, NON IL COMMENTO CHE LO RACCONTA. `fuoriDaiCommenti()` esiste per
 *      questo, e dopo il difetto (2) si usa OVUNQUE l'affermazione riguardi ciò che il prodotto FA.
 *
 *  (d) ⛔ UN'ANCORA DEVE MISURARE CIÒ CHE LA SUA RIGA AFFERMA. Se la riga afferma un ORDINE, il
 *      cancello confronta l'ordine; se afferma dei NOMI, confronta i nomi. Contare non basta.
 *
 * ════ COME SI PROVA CHE MORDE ════
 *
 *   node docs/assistenza/verifica-ancore.mjs                 (radice = questo repository)
 *   node docs/assistenza/verifica-ancore.mjs <altra-radice>  (per provarlo NEL VERSO CHE FALLISCE)
 *
 * ⛔ La prova a rovescio non si fa mutando il codice di produzione: si copia l'albero altrove, si
 *   rompe la premessa nella COPIA e si punta il cancello lì. Vedere il rosso è parte del lavoro:
 *   una prova che passa sia col difetto sia senza non è una prova.
 * ⛔ E la copia comprende ANCHE queste pagine: con `<altra-radice>` il cancello legge le pagine da
 *   `<altra-radice>/docs/assistenza`. Prima non lo faceva — leggeva sempre le pagine vere — e per
 *   questo NESSUNA guardia negativa era mai stata provata nel verso che fallisce. Era il buco da
 *   cui è passato il difetto (1).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = resolve(process.argv[2] || join(QUI, '..', '..'));
/* ⛔ Le pagine seguono la radice: è ciò che rende provabili le guardie NEGATIVE (difetto 1). */
const PAGINE = process.argv[2] ? join(RADICE, 'docs', 'assistenza') : QUI;

const esiti = [];

/** Il sorgente di un file del prodotto. ⛔ Se manca, si LANCIA: un file illeggibile non è un verde. */
function codice(relativo) {
  const p = join(RADICE, relativo);
  if (!existsSync(p)) throw new Error(`sorgente assente: ${relativo} (cercato in ${p})`);
  return readFileSync(p, 'utf8');
}

/**
 * Il sorgente SENZA i commenti: blocchi e righe `//`.
 * ⛔ È la funzione che impedisce di misurare la descrizione di com'erano le cose invece delle cose.
 *   Grezza di proposito — toglie anche qualche stringa che contiene `//` — perché un falso NEGATIVO
 *   qui costa una riscrittura dell'ancora, un falso POSITIVO costa una bugia.
 */
function fuoriDaiCommenti(sorgente) {
  return sorgente
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((riga) => riga.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

/** Il sorgente di un file del prodotto, SENZA i commenti. Vedi regola (c). */
function vivo(relativo) {
  return fuoriDaiCommenti(codice(relativo));
}

/** Il testo grezzo di una pagina di assistenza. */
function paginaGrezza(nome) {
  const p = join(PAGINE, nome);
  if (!existsSync(p)) throw new Error(`pagina assente: ${nome}`);
  return readFileSync(p, 'utf8');
}

/**
 * La forma in cui pagine e frasi del codice si confrontano.
 * ⛔ Cinque cose tolte, e ognuna ha fatto danno:
 *   · gli A-CAPO del riempimento — una frase spezzata a 80 caratteri non si trovava (difetto 1);
 *   · il MARCATORE DI CITAZIONE `> ` del markdown — quasi tutte le righe «Verificato in» stanno
 *     dentro una citazione, e una frase che ci va a capo dentro diventa «cartelle`, > `ricerca`»:
 *     il confronto falliva su una pagina GIUSTA. Trovato da questo stesso cancello, alla prima
 *     corsa dopo la riscrittura, su `doctor.md`;
 *   · gli ESCAPE del markdown — la pagina scrive `` Mod \` `` per mostrare un apice inverso, e il
 *     codice ha `mod \``: senza togliere la barra, due cose identiche non si somigliavano.
 *     Trovato allo stesso modo, su `scorciatoie.md`;
 *   · gli ASTERISCHI del grassetto — «le azioni sono **sei**» non conteneva «le azioni sono sei»;
 *   · gli APOSTROFI TIPOGRAFICI — il codice scrive «un’immagine», le pagine spesso «un'immagine»,
 *     e un confronto letterale falliva su una pagina GIUSTA.
 * ⇒ Si normalizzano ENTRAMBI i lati, sempre. Normalizzare un lato solo è come non normalizzare.
 * ⛔ L'ORDINE conta: il marcatore `> ` si toglie PRIMA di collassare gli spazi, altrimenti è già
 *   finito in mezzo alla frase e non si riconosce più come marcatore.
 */
function normalizza(testo) {
  return String(testo)
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/\\(?=[`*_])/g, '')
    .replace(/\*+/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Il testo di una pagina, NORMALIZZATO. È la forma in cui si confronta sempre. */
function pagina(nome) {
  return normalizza(paginaGrezza(nome));
}

/**
 * La PROSA di una pagina: tutto tranne le citazioni `>` — cioè tranne i riquadri «Verificato in»
 * e le note «⛔ Correzione del …».
 *
 * ⛔ Serve alle guardie NEGATIVE, e il motivo l'ha trovato questo cancello da solo. Appena la
 *   normalizzazione ha cominciato a funzionare davvero (difetto 1), la guardia di `browser.md` è
 *   diventata ROSSA: la frase inventata «Questo sito non consente di essere aperto qui» ERA nella
 *   pagina — ma soltanto dentro la nota che RACCONTA di averla tolta.
 * ⇒ Una guardia negativa che legge anche la nota di correzione accusa la pagina proprio
 *   dell'errore che la pagina documenta di aver corretto: l'unico modo di farla tacere sarebbe
 *   cancellare la memoria della correzione, che è il contrario di ciò che vogliamo.
 * ⇒ Quindi: le guardie negative guardano la PROSA (quello che la pagina AFFERMA), le guardie
 *   positive guardano tutta la pagina (comprese le ancore, che stanno nelle citazioni).
 */
function prosa(nome) {
  return normalizza(
    paginaGrezza(nome).split('\n').filter((r) => !/^\s*>/.test(r)).join('\n'),
  );
}

/** `ago` sta nel `pagliaio`? Entrambi normalizzati. È l'UNICO modo in cui questo file cerca. */
function contiene(pagliaio, ago) {
  return normalizza(pagliaio).includes(normalizza(ago));
}

/**
 * Un controllo. `fn` deve tornare `{ ok, misurato, dettaglio }`:
 *  · `ok`        l'affermazione regge?
 *  · `misurato`  SU QUANTE COSE ha guardato (righe, voci, occorrenze, nomi). Mai omesso.
 *  · `dettaglio` che cosa ha visto, in italiano.
 */
function controllo(nome, fn) {
  try {
    const r = fn();
    if (typeof r.misurato !== 'number') throw new Error('il controllo non dichiara quante cose ha guardato');
    esiti.push({ nome, ...r });
  } catch (errore) {
    esiti.push({ nome, ok: false, misurato: 0, dettaglio: `errore: ${errore.message}` });
  }
}

/** I nomi che la pagina NON nomina. Il cuore dei controlli sui NOMI (difetto 4). */
function nonNominati(testoPagina, nomi) {
  return nomi.filter((n) => !contiene(testoPagina, n));
}

/* ═══════════ 1 — la funzione citata da review.md deve ESISTERE ═══════════ */
controllo('review.md cita una funzione che esiste', () => {
  const src = vivo('harness-ui/frontend/src/components/review.js');
  const p = paginaGrezza('review.md');
  const citate = [...p.matchAll(/`(nascondi[A-Za-z0-9]*)\(/g)].map((m) => m[1]);
  const mancanti = citate.filter((n) => !new RegExp(`function\\s+${n}\\b`).test(src));
  return {
    ok: citate.length > 0 && mancanti.length === 0,
    misurato: citate.length,
    dettaglio: citate.length === 0
      ? 'nessun nome di funzione citato nella pagina'
      : `nomi citati: ${citate.join(', ')} · mancanti nel codice vivo: ${mancanti.length ? mancanti.join(', ') : 'nessuno'}`,
  };
});

/* ═══════════ 2 — QUANTI blocchi ha il preambolo, contati nel PRODOTTO ═══════════ */
controllo('memoria.md conta i blocchi del preambolo dal CODICE VIVO, non dal commento', () => {
  /*
   * ⛔ Questo è il controllo che prima misurava un COMMENTO (difetto 2). Le quattro parti del
   *   preambolo non si contano più leggendo il titolo del file: si contano dove il preambolo
   *   viene davvero COSTRUITO.
   *   · blocchi 2-3-4 = le tre `pezzi.push()` di `contesto-del-progetto.mjs`, e le tre chiavi
   *     dell'oggetto `blocchi` che quella funzione restituisce;
   *   · blocco 1 = `ISTRUZIONI`, che il kernel mette come primo messaggio di sistema, col
   *     preambolo spinto SUBITO DOPO.
   *   Riscrivere l'intestazione del file non cambia più niente qui; toglierne un blocco sì.
   */
  const composto = vivo('harness-ui/src/contesto-del-progetto.mjs');
  const spinte = [...composto.matchAll(/pezzi\.push\(/g)].length;
  const taglio = composto.indexOf('blocchi: {');
  if (taglio < 0) throw new Error('l oggetto `blocchi` non è nel codice vivo di contesto-del-progetto.mjs');
  const chiavi = [...composto.slice(taglio, taglio + 2500).matchAll(/^\s{6}([a-z]+):/gm)].map((m) => m[1]);
  const kernel = vivo('harness-ui/src/kernel/talosHarness.mjs');
  const primo = /role: 'system', content: ISTRUZIONI/.test(kernel);
  const subitoDopo = /messaggi\.push\(\{ role: 'system', content: contestoDelProgetto \}\)/.test(kernel);
  const p = pagina('memoria.md');
  const diceQuattro = contiene(p, 'preambolo è fatto di quattro blocchi');
  const diceTre = contiene(p, 'preambolo è fatto di tre blocchi');
  const attese = ['scheda', 'istruzioni', 'mappa'];
  const chiaviGiuste = chiavi.length === 3 && attese.every((c) => chiavi.includes(c));
  return {
    ok: spinte === 3 && chiaviGiuste && primo && subitoDopo && diceQuattro && !diceTre,
    misurato: spinte + chiavi.length + 1,
    dettaglio: `blocchi composti da contesto-del-progetto: ${spinte} (chiavi restituite: ${chiavi.join(' · ')}) · il kernel mette ISTRUZIONI per primo: ${primo} · e il preambolo subito dopo: ${subitoDopo} ⇒ ${spinte + 1} blocchi · la pagina dice quattro: ${diceQuattro}, dice tre: ${diceTre}`,
  };
});

/* ═══════════ 3 — le parole dello stato, in TUTTI i punti della pagina ═══════════ */
controllo('ricerca-approfondita.md usa le parole di STATI_RICERCA ovunque', () => {
  const src = codice('harness-ui/frontend/src/components/ricerca-dettaglio.js');
  /* ⛔ Si legge SOLO il blocco `STATI_RICERCA`: un `parola:` cercato in tutto il file ne
     raccoglieva 39 — verdetti delle fonti, nomi di schede — e si chiamava lo stesso «le parole di
     STATI_RICERCA»: un nome più largo della cosa misurata. */
  const blocco = src.match(/export const STATI_RICERCA = new Map\(\[([\s\S]*?)\n\]\);/);
  if (!blocco) throw new Error('`STATI_RICERCA` non trovato in ricerca-dettaglio.js');
  const parole = [...blocco[1].matchAll(/parola:\s*'([^']+)'/g)].map((m) => m[1]);
  const chiaviInterne = [...blocco[1].matchAll(/\['([a-z-]+)',\s*\{/g)].map((m) => m[1]);
  const p = pagina('ricerca-approfondita.md');
  const mancanti = nonNominati(p, parole);
  /* ⛔ E una chiave INTERNA non può essere spacciata per la parola a schermo: è il difetto da cui
     nasce questo controllo (la chiave `bloccata-dal-permesso` scritta dove va «Bloccata»). Può
     comparire — ma solo se la pagina dichiara, da qualche parte, che è una chiave interna. */
  const inPagina = chiaviInterne.filter((k) => contiene(p, k));
  const dichiarate = contiene(p, 'chiave interna');
  const spacciate = dichiarate ? [] : inPagina;
  return {
    ok: parole.length === 8 && mancanti.length === 0 && spacciate.length === 0,
    misurato: parole.length + chiaviInterne.length,
    dettaglio: `parole di stato: ${parole.length} (${parole.join(' · ')}) · non nominate dalla pagina: ${mancanti.length ? mancanti.join(', ') : 'nessuna'} · chiavi interne citate: ${inPagina.length ? inPagina.join(', ') : 'nessuna'} · la pagina le dichiara come chiavi interne: ${dichiarate}`,
  };
});

/* ═══════════ 4 — le azioni della Libreria: quante, e COME SI CHIAMANO ═══════════ */
controllo('libreria.md conta E NOMINA le azioni del menu vivo', () => {
  const src = vivo('harness-ui/frontend/src/components/libreria.js');
  const blocco = src.match(/const vociMenu\s*=\s*\[([\s\S]*?)\]\.filter/);
  if (!blocco) throw new Error('`vociMenu` non trovato nel codice vivo di libreria.js');
  const chiavi = [...blocco[1].matchAll(/chiave:\s*'([^']+)'/g)].map((m) => m[1]);
  /* ⛔ I NOMI, non solo il conteggio (difetto 4): rinominare «Rinomina» in «Cambia nome» lasciava
     il conteggio a sei e il cancello verde, con la pagina a promettere una voce inesistente. */
  const etichette = [...blocco[1].matchAll(/etichetta:\s*'([^']+)'/g)].map((m) => m[1]);
  const p = pagina('libreria.md');
  const mancanti = nonNominati(p, etichette);
  const diceSei = contiene(p, 'le azioni sono sei');
  const vecchia = contiene(p, 'ci sono cinque azioni');
  /* ⛔ L'ORDINE, non solo i nomi — trovato dalla revisione avversariale del 13/09/2026.
     La pagina non dice soltanto QUALI sono le sei voci: dice «Nell'ordine del menu: Apri,
     Scarica, Rinomina, Mostra nella cartella, Copia percorso, Elimina». Scambiando due righe
     di `vociMenu` i nomi restavano sei e tutti presenti, e il cancello restava VERDE mentre la
     pagina prometteva a schermo un ordine che il menu non ha piu'. È la regola (d) di questo
     file — «se la riga afferma un ORDINE, si confronta l'ordine» — applicata dove mancava. */
  const ordinePagina = contiene(p, `Nell'ordine del menu: ${etichette.join(', ')}`);
  return {
    ok: chiavi.length === 6 && etichette.length === 6 && mancanti.length === 0 && diceSei && !vecchia
      && ordinePagina,
    misurato: chiavi.length + etichette.length,
    dettaglio: `voci: ${chiavi.length} (${chiavi.join(' · ')}) · etichette non nominate dalla pagina: ${mancanti.length ? mancanti.join(' | ') : 'nessuna'} · dice sei: ${diceSei} · la pagina le elenca in QUESTO ordine: ${ordinePagina} · vecchia frase «cinque azioni affiancate»: ${vecchia}`,
  };
});

/* ═══════════ 5 — l'ORDINE dei passi del primo avvio, non il loro NUMERO ═══════════ */
controllo('che-cos-e-talos.md misura l ORDINE dei passi del primo avvio', () => {
  const markup = codice('harness-ui/frontend/index.template.html');
  const inizio = markup.indexOf('id="veloIntro"');
  if (inizio < 0) throw new Error('il velo #veloIntro non è nel markup');
  const seg = markup.slice(inizio, inizio + 9000);
  const passi = [...seg.matchAll(/data-intro-passo="(\d)"[\s\S]{0,200}?<\/button>/g)].map((m) => ({
    n: Number(m[1]),
    testo: m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  }));
  const atteso = ['Cartella', 'Modello', 'Permessi', 'Fine'];
  const ordinati = passi.sort((a, b) => a.n - b.n);
  const ordineGiusto = ordinati.length === 4 && atteso.every((e, i) => ordinati[i]?.testo.includes(e));
  /* ⛔ E la stessa sequenza dev'essere FATTA RISPETTARE da `passoConsentito`: senza questo il
     markup potrebbe dire una cosa e il codice lasciarne passare un'altra. */
  const intro = vivo('harness-ui/frontend/src/components/intro.js');
  const fa = /n > 0 && !cartella/.test(intro) && /n > 1 && !modello/.test(intro) && /n === 3 && \(!politica/.test(intro);
  const p = pagina('che-cos-e-talos.md');
  /* ⛔ L'ancora non deve più appoggiarsi a `PASSI = 4`, che sopravvive a un riordino. */
  const ancoraVecchia = contiene(p, 'Verificato in `harness-ui/frontend/src/components/intro.js` (`PASSI = 4`');
  const diceOrdine = contiene(p, '1. Cartella') && contiene(p, '2. Modello')
    && contiene(p, '3. Permessi') && contiene(p, '4. Fine');
  return {
    ok: ordineGiusto && fa && diceOrdine && !ancoraVecchia,
    misurato: ordinati.length,
    dettaglio: `passi nel velo: ${ordinati.map((x) => x.testo).join(' | ')} · ordine atteso: ${ordineGiusto} · passoConsentito lo impone: ${fa} · la pagina li elenca nell ordine: ${diceOrdine} · ancora vecchia su PASSI=4: ${ancoraVecchia}`,
  };
});

/* ═══════════ 6 — allegati: i tetti e le quattro vie, PER NOME ═══════════ */
controllo('allegati.md — i tetti e le quattro vie, per nome', () => {
  const src = vivo('harness-ui/frontend/src/components/allegati.js');
  const vie = [...src.matchAll(/etichetta:\s*'([^']+)'/g)].map((m) => m[1]);
  const quanti = src.match(/quanti:\s*(\d+)/)?.[1];
  const caratteri = src.match(/caratteriPerAllegato:\s*([\d_]+)/)?.[1];
  const p = pagina('allegati.md');
  const mancanti = nonNominati(p, vie);
  return {
    ok: quanti === '10' && caratteri === '200_000' && vie.length === 4 && mancanti.length === 0
      && contiene(p, '10 allegati') && contiene(p, '200.000 caratteri'),
    misurato: vie.length + 2,
    dettaglio: `vie: ${vie.join(' · ')} · non nominate dalla pagina: ${mancanti.length ? mancanti.join(', ') : 'nessuna'} · quanti=${quanti} · caratteri=${caratteri}`,
  };
});

/* ═══════════ 7 — deleghe: le frasi si PRENDONO DAL SORGENTE, non si inventano ═══════════ */
controllo('deleghe.md — le due frasi di rifiuto vengono DAL CODICE', () => {
  /*
   * ⛔ Difetto (3): qui il controllo si scriveva da solo le due frasi partendo dai numeri, e non
   *   guardava MAI il sorgente. Cambiata la frase nel prodotto, la pagina restava sbagliata e il
   *   cancello verde. Adesso si estrae il MODELLO dal sorgente e solo dopo lo si rende.
   */
  const src = vivo('harness-ui/src/subagent-orchestrator.mjs');
  const figli = src.match(/LIMITE_FIGLI_CONCORRENTI\s*=\s*(\d+)/)?.[1];
  const prof = src.match(/LIMITE_PROFONDITA_DELEGA\s*=\s*(\d+)/)?.[1];
  if (!figli || !prof) throw new Error('i due limiti non sono nel codice vivo di subagent-orchestrator.mjs');
  const tutti = [...src.matchAll(/motivo:\s*`([^`]+)`/g)].map((m) => m[1]);
  /*
   * ⛔ SOLO i modelli che nominano i due limiti. Alla prima corsa questo controllo pretendeva
   *   nella pagina TUTTI i `motivo:` del file — compreso «la cartella ${dove} non esiste su
   *   questo computer», che non c'entra niente con la delega. Era un filtro PIÙ LARGO della cosa
   *   che il suo nome dichiarava: lo stesso difetto che questo file rimprovera altrove.
   */
  const modelli = tutti.filter((m) => m.includes('${LIMITE_'));
  if (modelli.length !== 2) throw new Error(`attesi due modelli di frase che nominano i limiti, trovati ${modelli.length} su ${tutti.length} \`motivo:\` nel file`);
  /* Il modello del sorgente, reso coi valori veri: è la frase che il server manda davvero. */
  const rese = modelli.map((m) => m
    .replace(/\$\{LIMITE_FIGLI_CONCORRENTI\}/g, figli)
    .replace(/\$\{LIMITE_PROFONDITA_DELEGA\}/g, prof));
  const p = pagina('deleghe.md');
  const mancanti = rese.filter((f) => !contiene(p, f));
  return {
    ok: figli === '10' && prof === '2' && mancanti.length === 0,
    misurato: rese.length + 2,
    dettaglio: `limiti ${figli}/${prof} · frasi PRESE DAL SORGENTE: ${rese.map((f) => `«${f}»`).join(' · ')} · non presenti nella pagina: ${mancanti.length ? mancanti.join(' | ') : 'nessuna'}`,
  };
});

/* ═══════════ 8 — officina: otto capacità, i loro NOMI e i loro rischi ═══════════ */
controllo('officina-attrezzi.md — otto capacità, per nome e per rischio', () => {
  const src = vivo('harness-ui/src/forge-contract.mjs');
  const voci = [...src.matchAll(/'([a-z]+\.[a-zA-Z]+)':\s*\{[^}]*risk:\s*'(R[123])'/g)].map((m) => ({ id: m[1], r: m[2] }));
  const p = pagina('officina-attrezzi.md');
  /* ⛔ I NOMI e i RISCHI, non il conteggio: rinominare `memory.search` lasciava otto voci. */
  const mancanti = voci.filter((v) => !contiene(p, v.id));
  const coppieRotte = voci.filter((v) => !contiene(p, `\`${v.id}\` ${v.r}`));
  const memoriaR2 = voci.find((v) => v.id === 'memory.search')?.r === 'R2';
  return {
    ok: voci.length === 8 && mancanti.length === 0 && memoriaR2 && coppieRotte.length === 0
      && contiene(p, 'capacità disponibili oggi sono otto'),
    misurato: voci.length * 2,
    dettaglio: `capacità: ${voci.length} (${voci.map((v) => `${v.id}=${v.r}`).join(' · ')}) · non nominate dalla pagina: ${mancanti.length ? mancanti.map((v) => v.id).join(', ') : 'nessuna'} · coppie id+rischio non ritrovate: ${coppieRotte.length ? coppieRotte.map((v) => `${v.id} ${v.r}`).join(', ') : 'nessuna'} · memory.search vale R2: ${memoriaR2}`,
  };
});

/* ═══════════ 9 — le TRE vie di scrittura che restano aperte, PER NOME ═══════════ */
controllo('permessi-per-attrezzo.md — le tre vie di scrittura, per nome', () => {
  const src = vivo('harness-ui/frontend/src/components/permessi.js');
  const blocco = src.match(/SCRIVONO_LO_STESSO\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
  if (!blocco) throw new Error('`SCRIVONO_LO_STESSO` non trovato nel codice vivo');
  const chiavi = [...blocco[1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
  /* ⛔ La pagina non nomina le chiavi tecniche: nomina le tre DESCRIZIONI. Sono quelle che si
     confrontano — è ciò che la persona legge, ed è ciò che la riga della pagina afferma. */
  const descrizioni = [...blocco[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  const p = pagina('permessi-per-attrezzo.md');
  const mancanti = nonNominati(p, descrizioni);
  return {
    ok: chiavi.length === 3 && descrizioni.length === 3 && mancanti.length === 0
      && contiene(p, 'tre attrezzi possono lasciare un file'),
    misurato: chiavi.length + descrizioni.length,
    dettaglio: `attrezzi: ${chiavi.join(' · ')} · descrizioni non nominate dalla pagina: ${mancanti.length ? mancanti.join(' | ') : 'nessuna'}`,
  };
});

/* ═══════════ 10 — scorciatoie: quante, quante ristrette, e le COMBINAZIONI ═══════════ */
controllo('scorciatoie.md — quante sono, quali tasti, e quante valgono solo in chat o in sessione', () => {
  const src = vivo('harness-ui/frontend/src/components/scorciatoie.js');
  const righe = [...src.matchAll(/\{\s*id:\s*'[^']+',\s*combo:\s*'([^']+)',\s*area:\s*'([^']+)'/g)];
  const combo = righe.map((m) => m[1]);
  const ristrette = righe.filter((m) => m[2] !== 'Ovunque').length;
  const p = pagina('scorciatoie.md');
  /* ⛔ Le COMBINAZIONI, non solo il numero: la pagina promette tasti precisi, e una scorciatoia
     scritta è una promessa — o funziona, o non si scrive (è la regola che ha fatto la pagina). */
  const mancanti = combo.filter((c) => !contiene(p, c.replace(/^mod /, 'Mod ')));
  return {
    ok: righe.length === 7 && ristrette === 3 && mancanti.length === 0
      && contiene(p, 'Sono sette') && contiene(p, 'tre delle sette'),
    misurato: righe.length + combo.length,
    dettaglio: `scorciatoie: ${righe.length} (${combo.join(' · ')}) · non «Ovunque»: ${ristrette} · combinazioni non nominate dalla pagina: ${mancanti.length ? mancanti.join(', ') : 'nessuna'}`,
  };
});

/* ═══════════ 11 — il tetto delle schede del terminale ═══════════ */
controllo('terminale.md — il tetto delle schede', () => {
  const src = vivo('harness-ui/frontend/src/components/terminale.js');
  const max = src.match(/SCHEDE_MASSIME\s*=\s*(\d+)/)?.[1];
  const p = pagina('terminale.md');
  const dice = contiene(p, 'massimo di otto schede');
  return {
    ok: max === '8' && dice,
    misurato: 1,
    dettaglio: `SCHEDE_MASSIME = ${max}, letto nel CODICE VIVO · la pagina dice otto: ${dice}`,
  };
});

/* ═══════════ 12 — impostazioni: dieci sezioni, due famiglie, e i NOMI delle sezioni ═══════════ */
controllo('impostazioni.md — dieci sezioni in due famiglie, per nome', () => {
  const markup = codice('harness-ui/frontend/index.template.html');
  const tab = [...new Set([...markup.matchAll(/data-settings-tab="([a-z-]+)"/g)].map((m) => m[1]))];
  const gruppi = [...new Set([...markup.matchAll(/data-settings-gruppo="([a-z]+)"/g)].map((m) => m[1]))];
  const p = pagina('impostazioni.md');
  /* ⛔ I NOMI UMANI delle dieci sezioni: il conteggio dei `data-settings-tab` sopravvive a una
     sezione rinominata, e la pagina resterebbe a promettere una voce che non c'è più. */
  const titoli = ['Aspetto e movimento', 'Chat e composer', 'Strumenti agente e permessi',
    'Memoria e contesto', 'Sicurezza e privacy', 'Laboratorio modelli', 'Provider e accessi',
    'Costi e consumo', 'File e workspace', 'Account, Doctor e backup'];
  const fuoriDalMarkup = titoli.filter((t) => !contiene(markup, t));
  const fuoriDallaPagina = nonNominati(p, titoli);
  return {
    ok: tab.length === 10 && gruppi.length === 2 && fuoriDalMarkup.length === 0
      && fuoriDallaPagina.length === 0 && contiene(p, 'in dieci sezioni divise in due famiglie'),
    misurato: tab.length + titoli.length,
    dettaglio: `sezioni: ${tab.length} (${tab.join(' · ')}) · famiglie: ${gruppi.join(' · ')} · titoli non nel markup: ${fuoriDalMarkup.length ? fuoriDalMarkup.join(' | ') : 'nessuno'} · titoli non nella pagina: ${fuoriDallaPagina.length ? fuoriDallaPagina.join(' | ') : 'nessuno'}`,
  };
});

/* ═══════════ 13 — board: le dieci colonne, NEL LORO ORDINE ═══════════ */
controllo('board.md — le dieci colonne, nel loro ordine', () => {
  const markup = codice('harness-ui/frontend/index.template.html');
  const thead = markup.match(/<thead><tr><th scope="col">Sessione<\/th>([\s\S]{0,900}?)<\/tr><\/thead>/);
  if (!thead) throw new Error('la testata della Board non è nel markup');
  const colonne = ['Sessione', ...[...thead[1].matchAll(/>([A-ZÀ-Ù][^<]{1,20})<\/th>/g)].map((m) => m[1].trim())];
  const p = pagina('board.md');
  const attese = ['Sessione', 'Stato', 'Modello', 'Giri', 'Token', 'Cache', 'Primo token', 'Chiusa per', 'Costo', 'Avviata'];
  const ordineGiusto = attese.every((c, i) => colonne[i] === c);
  /* ⛔ E la pagina deve dichiararle NELLO STESSO ORDINE: è ciò che la sua riga afferma. Contarle
     soltanto lascerebbe verde una pagina che le elenca in un ordine diverso da quello a schermo. */
  const sequenza = attese.join(' · ');
  const ordinePagina = contiene(p, sequenza);
  const costoNascosto = /hidden data-richiede="fase3">Costo/.test(markup);
  return {
    ok: colonne.length === 10 && ordineGiusto && costoNascosto && ordinePagina && contiene(p, 'sono dieci'),
    misurato: colonne.length,
    dettaglio: `colonne nel markup: ${colonne.join(' · ')} · ordine atteso: ${ordineGiusto} · lo stesso ordine è scritto nella pagina: ${ordinePagina} · «Costo» nascosta: ${costoNascosto}`,
  };
});

/* ═══════════ 14 — estensioni: i quattro agganci e i quattro posti, PER NOME ═══════════ */
controllo('estensioni.md — i quattro agganci e i quattro posti, per nome', () => {
  const src = vivo('harness-ui/frontend/src/components/estensioni.js');
  const eventiBlocco = src.match(/const EVENTI=\{([^}]*)\}/);
  const originiBlocco = src.match(/const ORIGINI=\{([^}]*)\}/);
  if (!eventiBlocco || !originiBlocco) throw new Error('`EVENTI` o `ORIGINI` non trovati nel codice vivo');
  const etichetteEventi = [...eventiBlocco[1].matchAll(/:'([^']+)'/g)].map((m) => m[1]);
  const chiaviEventi = [...eventiBlocco[1].matchAll(/([a-z_]+):'/g)].map((m) => m[1]);
  const origini = [...originiBlocco[1].matchAll(/:'([^']+)'/g)].map((m) => m[1]);
  const validi = (vivo('harness-ui/src/hook-registry.mjs').match(/EVENTI_VALIDI = new Set\(\[([^\]]+)\]/)?.[1] || '')
    .split(',').map((s) => s.replace(/'/g, '').trim()).filter(Boolean);
  const p = pagina('estensioni.md');
  const originiMancanti = nonNominati(p, origini);
  /* ⛔ Il server deve accettare ESATTAMENTE quei quattro eventi, PER NOME: un conteggio uguale con
     un nome diverso è la forma precisa del difetto (4). */
  const disallineati = chiaviEventi.filter((k) => !validi.includes(k));
  return {
    ok: etichetteEventi.length === 4 && origini.length === 4 && originiMancanti.length === 0
      && validi.length === 4 && disallineati.length === 0 && contiene(p, 'Gli agganci possibili sono quattro'),
    misurato: etichetteEventi.length + origini.length + validi.length,
    dettaglio: `eventi: ${chiaviEventi.join(' · ')} · origini: ${origini.join(' · ')} · non nominate dalla pagina: ${originiMancanti.length ? originiMancanti.join(', ') : 'nessuna'} · EVENTI_VALIDI del server: ${validi.join(' · ')} · eventi che il server NON accetta: ${disallineati.length ? disallineati.join(', ') : 'nessuno'}`,
  };
});

/* ═══════════ 15 — conversazioni: le parole degli stati, come sono scritte ═══════════ */
controllo('conversazioni.md — le parole degli stati, come sono scritte', () => {
  const src = vivo('harness-ui/frontend/src/components/session-item.js');
  const blocco = src.match(/const ETICHETTE = Object\.freeze\(\{([\s\S]*?)\}\);/);
  if (!blocco) throw new Error('`ETICHETTE` non trovato nel codice vivo di session-item.js');
  const parole = [...blocco[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  const p = pagina('conversazioni.md');
  const mancanti = nonNominati(p, parole);
  return {
    ok: parole.length === 8 && mancanti.length === 0,
    misurato: parole.length,
    dettaglio: `stati nel codice vivo: ${parole.length} (${parole.join(' · ')}) · non nominati dalla pagina: ${mancanti.length ? mancanti.join(', ') : 'nessuno'}`,
  };
});

/* ═══════════ 16 — contesto della chat: i nove nomi della compattazione ═══════════ */
controllo('contesto-della-chat.md — i nove nomi della compattazione', () => {
  const src = vivo('harness-ui/frontend/src/components/context-compactor.js');
  const blocco = src.match(/const JOB_LABELS = \{([^}]*)\}/);
  if (!blocco) throw new Error('`JOB_LABELS` non trovato nel codice vivo');
  const nomi = [...blocco[1].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  const p = pagina('contesto-della-chat.md');
  const mancanti = nonNominati(p, nomi);
  return {
    ok: nomi.length === 9 && mancanti.length === 0,
    misurato: nomi.length,
    dettaglio: `nomi: ${nomi.length} (${nomi.join(' · ')}) · non nominati dalla pagina: ${mancanti.length ? mancanti.join(', ') : 'nessuno'}`,
  };
});

/* ═══════════ 17 — doctor: undici controlli, NELLO STESSO ORDINE della pagina ═══════════ */
controllo('doctor.md — gli undici controlli, e nel loro ordine', () => {
  const src = vivo('harness-ui/frontend/src/components/doctor.js');
  const ids = [...new Set([...src.matchAll(/add\('([a-z-]+)','([^']+)'/g)].map((m) => m[1]))];
  const p = pagina('doctor.md');
  /* ⛔ La pagina afferma un ORDINE («nello stesso ordine in cui sono elencati qui sopra»): allora
     si confronta l'ORDINE, non il numero. Contarli soltanto lasciava verde un elenco rimescolato. */
  const sequenza = ids.map((i) => `\`${i}\``).join(', ');
  const ordineGiusto = contiene(p, sequenza);
  /* ⛔ La frase non si ricopia a mano nel controllo: si estrae dal codice e si pretende nella
     pagina. Una frase scritta due volte diverge, e la copia nel cancello mentirebbe per prima. */
  const daCodice = src.match(/'(Configurata\. La validità[^']+)'/)?.[1];
  if (!daCodice) throw new Error('la frase del controllo sulla chiave non è più in doctor.js');
  const frase = contiene(p, daCodice);
  return {
    ok: ids.length === 11 && ordineGiusto && frase,
    misurato: ids.length,
    dettaglio: `controlli: ${ids.length} (${ids.join(' · ')}) · la pagina li elenca in QUESTO ordine: ${ordineGiusto} · la frase sulla chiave, presa dal codice, è nella pagina: ${frase}`,
  };
});

/* ═══════════ 18 — browser: la frase del sito che non si lascia aprire ═══════════ */
controllo('browser.md — la frase del sito che non si lascia aprire', () => {
  const src = codice('harness-ui/frontend/src/components/browser.js');
  const frase = 'Il sito non consente di essere mostrato dentro TALOS';
  const p = pagina('browser.md');
  /* ⛔ Guardia NEGATIVA, adesso normalizzata: prima la frase inventata sfuggiva se un a-capo la
     spezzava a metà — cioè proprio nel caso in cui stava davvero nella pagina (difetto 1).
     ⛔ E si cerca nella PROSA, non in tutta la pagina: la nota «Correzione del 13/09/2026» CITA
     quella frase per dire che è stata tolta, e una guardia che leggesse anche lì resterebbe rossa
     per sempre — o costringerebbe a cancellare la memoria della correzione. Vedi `prosa()`. */
  const inventata = contiene(prosa('browser.md'), 'Questo sito non consente di essere aperto qui');
  return {
    ok: src.includes(frase) && contiene(p, frase) && !inventata,
    misurato: 2,
    dettaglio: `frase nel codice: ${src.includes(frase)} · nella pagina: ${contiene(p, frase)} · vecchia frase inventata ancora presente: ${inventata}`,
  };
});

/* ═══════════ 19 — ricerca web: le cinque fonti più lo spegnimento ═══════════ */
controllo('ricerca-web.md — le cinque fonti, per nome, più lo spegnimento', () => {
  const src = vivo('harness-ui/frontend/src/components/fonte-ricerca.js');
  const ids = src.match(/const IDS=\[([^\]]+)\]/)?.[1].split(',').map((s) => s.replace(/'/g, '').trim()) || [];
  const p = pagina('ricerca-web.md');
  const mancanti = ids.filter((i) => !contiene(p, i));
  return {
    ok: ids.length === 5 && mancanti.length === 0
      && contiene(p, 'E una sesta scelta, che non è una fonte') && contiene(p, 'Ricerca web disattivata'),
    misurato: ids.length,
    dettaglio: `fonti: ${ids.join(' · ')} · non nominate dalla pagina: ${mancanti.length ? mancanti.join(', ') : 'nessuna'}`,
  };
});

/* ═══════════ 20 — contesto del progetto: il tetto e l'ORDINE dei candidati ═══════════ */
controllo('contesto-del-progetto.md — il tetto in byte e l ORDINE dei candidati', () => {
  const src = vivo('harness-ui/src/istruzioni-di-progetto.mjs');
  const tetto = src.match(/TETTO_BYTE_PREDEFINITO\s*=\s*([\d_]+)/)?.[1];
  const candidati = src.match(/NOMI_CANDIDATI\s*=\s*Object\.freeze\(\[([^\]]+)\]/)?.[1] || '';
  const nomi = candidati.split(',').map((s) => s.replace(/'/g, '').trim()).filter(Boolean);
  const p = pagina('contesto-del-progetto.md');
  /* ⛔ L'ORDINE, non l'insieme: la riga della pagina afferma «AGENTS.md poi CLAUDE.md», e un
     insieme uguale in ordine invertito la renderebbe falsa lasciando il cancello verde. */
  const ordineCodice = nomi[0] === 'AGENTS.md' && nomi[1] === 'CLAUDE.md';
  const ordinePagina = contiene(p, "ordine `AGENTS.md` poi `CLAUDE.md`");
  return {
    ok: tetto === '24_000' && nomi.length === 2 && ordineCodice && ordinePagina
      && contiene(p, 'tetto in byte: 24.000'),
    misurato: nomi.length + 1,
    dettaglio: `tetto=${tetto} · candidati nel codice: ${nomi.join(' → ')} · ordine AGENTS→CLAUDE nel codice: ${ordineCodice} · lo stesso ordine nella pagina: ${ordinePagina}`,
  };
});

/* ═══════════ 21 — artefatti: i formati, e la CSP VERA della risposta ═══════════ */
controllo('artefatti-e-immagini.md — i formati e la CSP vera dell artefatto', () => {
  const src = vivo('harness-ui/src/generated-image-store.mjs');
  const blocco = src.match(/GENERATED_IMAGE_MIME_TYPES = Object\.freeze\(\{([\s\S]*?)\}\)/);
  if (!blocco) throw new Error('`GENERATED_IMAGE_MIME_TYPES` non trovato nel codice vivo');
  const est = [...blocco[1].matchAll(/:\s*'([a-z0-9]+)'/g)].map((m) => m[1]);
  /*
   * ⛔ La CSP dell'artefatto. La pagina affermava `default-src 'none'; sandbox`, che in
   *   `http-app.mjs` ESISTE — ma su ALTRE rotte (gli allegati scaricati, `Content-Disposition:
   *   attachment`). La risposta dell'ARTEFATTO porta una CSP diversa e più permissiva, perché un
   *   artefatto deve poter eseguire il proprio script. Cercare la prima CSP del file era
   *   esattamente «trovare una stringa che assomiglia» invece di misurare la cosa.
   *   ⇒ Si legge la CSP DENTRO il ramo che serve l'artefatto, a partire da `leggiArtefattoFn`.
   */
  const http = codice('harness-ui/src/http-app.mjs');
  const taglio = http.indexOf('const html = leggiArtefattoFn(id);');
  if (taglio < 0) throw new Error('il ramo che serve l artefatto non è in http-app.mjs');
  const csp = http.slice(taglio, taglio + 3000).match(/'Content-Security-Policy':\s*"([^"]+)"/)?.[1];
  if (!csp) throw new Error('la CSP della risposta dell artefatto non è stata trovata');
  const p = pagina('artefatti-e-immagini.md');
  const cspNellaPagina = contiene(p, csp);
  const cspSbagliata = contiene(p, "gli header `default-src 'none'; sandbox` in");
  return {
    ok: est.length === 5 && contiene(p, 'PNG, JPEG, WebP, GIF e AVIF') && cspNellaPagina && !cspSbagliata,
    misurato: est.length + 1,
    dettaglio: `estensioni: ${est.join(' · ')} · CSP VERA dell artefatto: «${csp}» · citata così nella pagina: ${cspNellaPagina} · vecchia CSP sbagliata ancora citata: ${cspSbagliata}`,
  };
});

/* ═══════════ 22 — nessuna pagina cita una funzione che non esiste ═══════════ */
controllo('nessuna pagina cita una funzione che non esiste', () => {
  /*
   * ⛔ Il controllo più largo, nato dal difetto della citazione inventata: si prendono TUTTI i
   *   nomi in `nomeFunzione()` citati fra apici inversi in TUTTE le pagine e li si cerca nel
   *   codice VIVO dei file che quelle stesse pagine nominano. Un nome che non si trova da nessuna
   *   parte è una bugia in attesa di essere ripetuta dal centro assistenza.
   */
  const nomi = readdirSync(PAGINE).filter((f) => f.endsWith('.md'));
  let citazioni = 0;
  const rotte = [];
  for (const nome of nomi) {
    const testo = paginaGrezza(nome);
    const file = [...new Set([...testo.matchAll(/`(harness-ui\/[A-Za-z0-9_/.-]+\.(?:mjs|js|html))`?/g)].map((m) => m[1]))];
    const sorgenti = file.filter((f) => existsSync(join(RADICE, f))).map((f) => vivo(f)).join('\n');
    if (!sorgenti) continue;
    for (const m of testo.matchAll(/`([a-z][A-Za-z0-9]{3,})\(/g)) {
      citazioni += 1;
      const fn = m[1];
      if (!new RegExp(`\\b${fn}\\b`).test(sorgenti)) rotte.push(`${nome}: ${fn}()`);
    }
  }
  return {
    ok: rotte.length === 0,
    misurato: citazioni,
    dettaglio: `funzioni citate e ricontrollate: ${citazioni} · non trovate nel codice vivo: ${rotte.length ? rotte.join(' | ') : 'nessuna'}`,
  };
});

/* ═══════════ 23 — ogni «Verificato in file:riga» punta a una riga CHE ESISTE ═══════════ */
controllo('ogni citazione `file:riga` punta a un file e a una riga che esistono', () => {
  /*
   * ⛔ Nato dal terzo giro: tre pagine citavano numeri di riga che nel file non ci sono più
   *   (`http-app.mjs:2527`, `libreria.js:259`, `istruzioni-di-progetto.mjs:168`). Un numero di
   *   riga sbagliato non è un dettaglio: è la prova che nessuno è andato a guardare.
   *   ⛔ Questo controllo NON dice se quella riga afferma la cosa giusta — lo fanno i controlli
   *     qui sopra, uno per affermazione. Dice se quella riga ESISTE, che è il minimo, e si
   *     dichiara per quello che è invece di far credere di aver letto il contenuto.
   */
  const nomi = readdirSync(PAGINE).filter((f) => f.endsWith('.md'));
  let citazioni = 0;
  const fuori = [];
  for (const nome of nomi) {
    const testo = paginaGrezza(nome);
    for (const m of testo.matchAll(/`(harness-ui\/[A-Za-z0-9_/.-]+\.(?:mjs|js|html)):(\d+)(?:-(\d+))?`/g)) {
      citazioni += 1;
      const [, rel, da, a] = m;
      const p = join(RADICE, rel);
      if (!existsSync(p)) { fuori.push(`${nome}: ${rel} non esiste`); continue; }
      const righe = readFileSync(p, 'utf8').split('\n').length;
      const ultima = Number(a || da);
      if (ultima > righe) fuori.push(`${nome}: ${rel}:${ultima} ma il file ha ${righe} righe`);
    }
  }
  return {
    ok: fuori.length === 0,
    misurato: citazioni,
    dettaglio: `citazioni con numero di riga: ${citazioni} · fuori dal file: ${fuori.length ? fuori.join(' | ') : 'nessuna'}`,
  };
});

/* ═══════════ 24 — un'ancora «`simbolo` (righe N-M)» deve trovare il simbolo LÌ ═══════════ */
controllo('ogni ancora `simbolo` (righe N-M) trova il simbolo in QUELLE righe', () => {
  /*
   * ⛔ Nato dalla REVISIONE AVVERSARIALE del 13/09/2026, da una mutazione che passava inosservata.
   *   Il controllo 23 guarda le citazioni scritte `file.js:290` e dice soltanto che quella riga
   *   ESISTE. Ma in queste pagine la forma più comune è un'ALTRA — «l'elenco `vociMenu` (righe
   *   268-275)» — e non la guardava nessuno: infilate tre righe in cima a `libreria.js`, tutte le
   *   ancore di quella pagina puntavano al posto sbagliato e il cancello restava VERDE.
   *   Un numero di riga che scivola è il modo in cui una pagina verificata marcisce DA SOLA,
   *   senza che nessuno l'abbia toccata: è esattamente ciò che queste ancore esistono per impedire.
   *
   * ⛔ Si guarda SOLO la forma stretta: un simbolo fra apici inversi e il suo numero sulla STESSA
   *   riga del markdown. La forma «frase» («…» seguita da un numero di riga) è stata provata e
   *   SCARTATA con la misura in mano: su 5 citazioni ne accusava 2 su pagine GIUSTE, perché
   *   pareggiava una frase col primo numero che trovava dopo, anche quando i due appartenevano a
   *   due clausole diverse. Il caso che l'ha decisa: «col fuoco su «Annulla» (riga 318)» — la 318
   *   è la riga che SPOSTA IL FUOCO, e la parola «Annulla» sta alla 293 e alla 297. L'ancora è
   *   giusta, il controllo sarebbe stato falso.
   *   ⇒ Un filtro più largo del suo nome è il difetto che questo file rimprovera altrove: qui si
   *     dichiara la copertura invece di allargarla fino a mentire.
   */
  const forma = /`([A-Za-z_$][A-Za-z0-9_.$]*)`(?:\(\))?[^\n`]{0,40}?(?:\((?:righe|riga) (\d+)(?:-(\d+))?\)|all[ae] (?:righe|riga) (\d+)(?:-(\d+))?)/g;
  const nomi = readdirSync(PAGINE).filter((f) => f.endsWith('.md'));
  let citazioni = 0;
  const rotte = [];
  for (const nome of nomi) {
    const testo = paginaGrezza(nome);
    const file = [...new Set([...testo.matchAll(/`(harness-ui\/[A-Za-z0-9_/.-]+\.(?:mjs|js|html))/g)].map((m) => m[1]))]
      .filter((f) => existsSync(join(RADICE, f)));
    if (!file.length) continue;
    const righeDi = file.map((f) => [f, readFileSync(join(RADICE, f), 'utf8').split('\n')]);
    for (const m of testo.matchAll(forma)) {
      const simbolo = m[1];
      const da = Number(m[2] || m[4]);
      const a = Number(m[3] || m[5] || da);
      if (!da) continue;
      citazioni += 1;
      const ago = normalizza(simbolo);
      let dove = null;
      let altrove = null;
      for (const [f, righe] of righeDi) {
        if (normalizza(righe.slice(da - 1, a).join('\n')).includes(ago)) { dove = f; break; }
        if (!altrove && normalizza(righe.join('\n')).includes(ago)) altrove = f;
      }
      if (!dove) {
        rotte.push(`${nome}: \`${simbolo}\` dichiarato a ${da}${a !== da ? `-${a}` : ''} ${altrove ? `ma in ${altrove} sta ALTROVE` : 'e non si trova in nessun file che la pagina nomina'}`);
      }
    }
  }
  /* ⛔ Zero citazioni non è un verde: vorrebbe dire che la forma non si riconosce più. */
  return {
    ok: citazioni > 0 && rotte.length === 0,
    misurato: citazioni,
    dettaglio: `ancore «\`simbolo\` (righe N-M)»: ${citazioni} · che NON trovano il simbolo in quelle righe: ${rotte.length ? rotte.join(' | ') : 'nessuna'}`,
  };
});

/* ═══════════ il referto ═══════════ */
let rossi = 0;
let cose = 0;
for (const e of esiti) {
  cose += e.misurato;
  if (!e.ok) rossi += 1;
  console.log(`${e.ok ? 'OK  ' : 'ROSSO'} ${e.nome}\n      guardate ${e.misurato} cose · ${e.dettaglio}`);
}
console.log(`\n${esiti.length} controlli · ${cose} cose guardate in totale · ${rossi} rossi`);
console.log(`radice del codice: ${RADICE}`);
console.log(`pagine lette da:   ${PAGINE}`);
process.exit(rossi === 0 ? 0 : 1);
