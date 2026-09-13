import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse as parsePath } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import {
  creaSubagentOrchestrator,
  esisteCartella,
  formaDelPercorso,
  percorsoDellaFigliaUsabile,
} from '../src/subagent-orchestrator.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔⛔ BC-03, terza apertura (13/09/2026) — «la delega ai sotto-agenti: la scheda Agenti resta
 *   vuota, e il percorso passato al figlio è nella forma di un ALTRO sistema operativo».
 *
 * ⭐ COSA HO ACCERTATO PRIMA DI CURARE, perché metà delle corsie della Fase 1 sono nate su una
 *   premessa falsa e questa non doveva essere la terza:
 *
 *   (a) «La scheda Agenti resta vuota» — sul SERVER non c'era più niente da curare. Il rapporto
 *       `.claude/RAPPORTO-AGENTI-SCHEDA-2026-09-11.md` §0 lo dice misurato: la rotta rispondeva
 *       il vero, la diagnosi consegnata chiedeva l'id della FIGLIA invece che quello della madre.
 *       La cura dell'11/09 è viva nel frontend (`inspector.js:413 schedaAgentiDaRileggere` +
 *       `legacy/app.js:16431`), cioè FUORI da questa corsia. ⇒ Qui non si rifà: si mette sotto
 *       prova la cosa che quel rapporto dichiarava NON verificata — la scheda con una figlia VIVA.
 *
 *   (b) «Il percorso è nella forma di un altro sistema operativo» — QUESTA REGGE, ed è peggio di
 *       come era scritta. Il rifiuto c'era (`esisteCartella`), ma non guarda la FORMA: guarda il
 *       disco. Misurato su questa macchina il 13/09/2026 (Windows 11, Node v24.18.0) chiamando la
 *       funzione VERA del prodotto:
 *
 *           esisteCartella('/tmp')   → true      (il disco risponde per C:\tmp)
 *           esisteCartella('/Users') → true      (il disco risponde per C:\Users)
 *           esisteCartella('src')    → true      (relativo: risolto sulla cartella del SERVER)
 *           esisteCartella('/mnt/c/Users')   → false   ← fermato PER CASO: C:\mnt non esiste qui
 *           esisteCartella('/home/user/app') → false   ← fermato PER CASO: C:\home non esiste qui
 *
 *       ⇒ Le due forme che il difetto dell'08/09 nominava venivano fermate solo perché quelle
 *         cartelle non esistono su QUESTA macchina; tre forme storte passavano in silenzio e la
 *         figlia partiva dove nessuno l'aveva mandata. Una guardia che dipende da quali cartelle
 *         ha il disco non è una guardia: è una coincidenza.
 *
 * ⛔ SU QUANTE COSE GUARDA QUESTA MISURA — dichiarato, perché «verde» senza un numero non dice
 *   niente: 11 prove, che è il numero che stampa il runner. (Diceva «12» e le enumerava male:
 *   corretto rileggendo l'uscita invece di ricontare a mente. Un conteggio più largo della cosa
 *   che misura inganna chi legge, ed è lo stesso difetto che questo file va a cercare altrove.)
 *     · 5 sulla forma del percorso — le tre accettate in silenzio + le due fermate per caso;
 *     · 1 su come si legge la forma (dalla radice, non da un sistema operativo scritto in un if);
 *     · 2 al contrario — la cartella buona (omessa e ripetuta) e quella con uno spazio nel nome;
 *     · 1 sul contenuto del rifiuto (nomina la cartella giusta);
 *     · 1 sul giro intero col registro VERO: tre deleghe su tre dopo un tentativo storto;
 *     · 1 sulla scheda con la figlia VIVA.
 *
 * ⛔ QUELLO CHE QUESTO FILE NON PROVA: che il MODELLO scelga di delegare, e che un giro vero a
 *   pagamento produca file sul disco. Resta una prova dal vivo, non fatta qui.
 */

/** Una cartella VERA sul disco, quindi nella forma vera di questo sistema. */
function cartellaVera(prefisso = 'talos-forma-') {
  return mkdtempSync(join(tmpdir(), prefisso));
}

function vocePadre(cartella) {
  return { cartella, profonditaDelega: 0, conclusa: false, padreId: null, modello: 'z-ai/glm-5.3-flash', reasoning: 'high', permessi: 'Full access' };
}

/** L'orchestratore col DISCO VERO: `cartellaEsisteFn` non è iniettata, è quella di produzione. */
function orchestratoreColDiscoVero(cartellaMadre) {
  const sessioni = new Map([['madre', vocePadre(cartellaMadre)]]);
  const avvii = [];
  const orch = creaSubagentOrchestrator({
    sessioni,
    avviaESeguiFn: (opzioni) => {
      avvii.push(opzioni);
      opzioni.onConclusioneFn({ ok: true, esito: { detto: 'fatto', comeFinita: 'concluso' } });
      return { sessionId: `figlia-${avvii.length}` };
    },
  });
  return { orch, avvii, sessioni };
}

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * A · LE CINQUE FORME STORTE — tre passavano in silenzio, due erano fermate per caso
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/*
 * ⛔ Ogni caso porta con sé la PROVA CHE LA PROVA MORDE: si asserisce prima quanto rispondeva la
 *   vecchia guardia (`esisteCartella`, ancora nel prodotto e ancora giusta per il suo mestiere).
 *   Dove rispondeva `true`, il rifiuto di oggi NON può venire dal disco — viene dalla forma.
 */
const FORME_STORTE = [
  { percorso: '/tmp', accettataPrima: true, perche: 'su Windows «/» è ancorato all\'unità corrente: il disco risponde per C:\\tmp' },
  { percorso: '/Users', accettataPrima: true, perche: 'idem: C:\\Users esiste, quindi la vecchia guardia diceva sì' },
  { percorso: 'src', accettataPrima: true, perche: 'relativo: risolto sulla cartella del SERVER, non su quella della madre' },
  { percorso: '/mnt/c/Users', accettataPrima: false, perche: 'la forma WSL del difetto dell\'08/09: fermata solo perché C:\\mnt non esiste QUI' },
  { percorso: '/home/user/app', accettataPrima: false, perche: 'la forma POSIX vista nella foto dell\'owner: fermata solo perché C:\\home non esiste QUI' },
];

for (const caso of FORME_STORTE) {
  test(`⛔⛔⛔ FORMA — «${caso.percorso}» è rifiutata, e nessun figlio parte (${caso.perche})`, async () => {
    const cartellaMadre = cartellaVera();
    try {
      assert.equal(esisteCartella(caso.percorso), caso.accettataPrima,
        `la premessa di questa prova è cambiata: ${caso.percorso} risponde diversamente al disco di quanto misurato il 13/09`);

      const { orch, avvii } = orchestratoreColDiscoVero(cartellaMadre);
      const esito = await orch.delegaSottoTask({ sessionPadreId: 'madre', task: 'scrivi la parte 1', cartella: caso.percorso });

      assert.equal(esito.esito, 'rifiutato');
      assert.equal(avvii.length, 0, 'nessuna figlia deve partire in una cartella che nessuno ha scelto');
      assert.match(esito.motivo, /Ometti la cartella|non è un percorso assoluto/);
    } finally {
      rimuoviCartellaDiProva(cartellaMadre);
    }
  });
}

test('⭐ la forma si legge dalla RADICE, non dal sistema operativo scritto in un if', () => {
  /*
   * ⛔ Il metro è la cartella della MADRE, che una persona ha scelto e che è vera per costruzione:
   *   così la regola si tara da sé e non c'è una riga che nomini un sistema operativo. Su una
   *   macchina POSIX la madre avrebbe forma `radice-sola` e `/mnt/c/x` sarebbe legittimo.
   */
  assert.equal(formaDelPercorso('C:\\progetto'), 'unita');
  assert.equal(formaDelPercorso('C:/progetto'), 'unita');
  assert.equal(formaDelPercorso('/mnt/c/progetto'), 'radice-sola');
  assert.equal(formaDelPercorso('src'), 'relativo');
  assert.equal(formaDelPercorso('C:progetto'), 'unita-senza-radice');
  assert.equal(formaDelPercorso('\\\\server\\condivisa\\progetto'), 'rete');
  assert.equal(formaDelPercorso(''), 'assente');
  assert.equal(formaDelPercorso(null), 'assente');

  // AL CONTRARIO: con una madre POSIX, un percorso POSIX è quello GIUSTO e non si rifiuta
  assert.equal(percorsoDellaFigliaUsabile('/mnt/c/progetto', '/casa/progetto').ok, true,
    'la regola non deve nominare Windows: deve confrontare le forme');
  // e con una madre Windows lo stesso percorso è quello sbagliato
  assert.equal(percorsoDellaFigliaUsabile('/mnt/c/progetto', 'C:\\progetto').ok, false);
});

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * B · AL CONTRARIO — ciò che DEVE passare continua a passare
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

test('⭐⭐⭐ AL CONTRARIO — la cartella VERA della madre passa, omessa o ripetuta, e la figlia ci finisce dentro', async () => {
  const cartellaMadre = cartellaVera();
  try {
    const { orch, avvii } = orchestratoreColDiscoVero(cartellaMadre);

    const omessa = await orch.delegaSottoTask({ sessionPadreId: 'madre', task: 'leggi il README' });
    assert.equal(omessa.esito, 'concluso', 'il caso NORMALE — delegare senza dire la cartella — non deve mai essere rifiutato');
    assert.equal(avvii[0].cartella, cartellaMadre);

    const ripetuta = await orch.delegaSottoTask({ sessionPadreId: 'madre', task: 'leggi il package.json', cartella: cartellaMadre });
    assert.equal(ripetuta.esito, 'concluso');
    assert.equal(avvii[1].cartella, cartellaMadre, 'la cartella non si tocca: né normalizzata, né allargata');

    // ⛔ la prova morde solo se la cartella non è già la radice del disco
    assert.notEqual(parsePath(cartellaMadre).root, cartellaMadre);
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

test('⭐⭐ AL CONTRARIO — una cartella con uno SPAZIO nel nome è una forma legittima, non una storta', async () => {
  const radice = cartellaVera('talos-forma-sp-');
  const conSpazi = mkdtempSync(join(radice, 'progetto con spazi '));
  try {
    const { orch, avvii } = orchestratoreColDiscoVero(conSpazi);
    const esito = await orch.delegaSottoTask({ sessionPadreId: 'madre', task: 'x', cartella: conSpazi });
    assert.equal(esito.esito, 'concluso', 'uno spazio non è un errore di forma: il progetto di una persona si chiama così');
    assert.equal(avvii[0].cartella, conSpazi);
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * C · IL RIFIUTO DICE QUAL È LA CARTELLA GIUSTA — è ciò che trasforma 0 su 3 in 3 su 3
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

test('⛔⛔⛔ il rifiuto PORTA la cartella della madre: un «no» muto è ciò che ha ucciso tre deleghe di fila', async () => {
  const cartellaMadre = cartellaVera();
  try {
    const { orch } = orchestratoreColDiscoVero(cartellaMadre);
    const esito = await orch.delegaSottoTask({ sessionPadreId: 'madre', task: 'x', cartella: '/mnt/c/progetto' });

    assert.equal(esito.esito, 'rifiutato');
    assert.ok(esito.motivo.includes(cartellaMadre),
      `il motivo non nomina la cartella buona, quindi il modello può solo indovinare un\'altra forma: ${esito.motivo}`);
    assert.match(esito.motivo, /Ometti la cartella/, 'e deve dire anche la via più semplice: non passarne nessuna');
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

/* ────────────────────────────────────────────────────────────────────────────────────────────
 * D · IL GIRO INTERO, COL REGISTRO VERO — tre deleghe su tre, e la scheda le mostra
 * ──────────────────────────────────────────────────────────────────────────────────────────── */

/*
 * ⛔ Qui il registro è QUELLO VERO (`avviaESegui`, eredità dei permessi, `esisteCartella` vero sul
 *   disco vero): l'unica cosa finta è il modello, che non chiama nessun fornitore. È il piano in
 *   cui il difetto di `C:\` viveva l'08/09, e una prova che si ferma sopra non può vederlo.
 */
function modelloFinto() {
  const avvii = [];
  return {
    avvii,
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1;
      const mio = `t${indice}`;
      let concludi;
      const attesa = new Promise((risolvi) => { concludi = risolvi; });
      avvii.push({
        cartella: input.cartella,
        onDelega: input.onDelega,
        concludi: (risultato = { ok: true }) => {
          input.onEvento({ type: 'RunFinished', threadId: mio, runId: `r${indice}`, outcome: { type: 'success' } });
          concludi(risultato);
        },
      });
      input.onEvento({ type: 'RunStarted', threadId: mio, runId: `r${indice}` });
      return attesa;
    },
  };
}

function registroConMadre(cartellaMadre, finto) {
  const registro = createSessionRegistry({
    avviaSessioneFn: finto.avviaSessioneFn,
    guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneLiberaFn: (_cartelle, { cartellaLibera, consegna }) => ({
      cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna },
    }),
    modello: 'z-ai/glm-5.3-flash',
    chiave: 'chiave-finta',
  });
  const avvio = registro.avviaLibero({
    cartellaLibera: cartellaMadre,
    consegna: 'dividi il lavoro in tre parti e delegale',
    permessi: 'Full access',
  });
  assert.ok(avvio.sessionId, `la madre non è partita: ${avvio.erroreAvvio ?? ''}`);
  return { registro, madreId: avvio.sessionId };
}

test('⭐⭐⭐ TRE DELEGHE SU TRE riescono dopo un tentativo storto, e la scheda «Agenti» le mostra tutte e tre', async () => {
  const cartellaMadre = cartellaVera('talos-tre-');
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(cartellaMadre, finto);
    const madre = finto.avvii[0];

    // 1. il modello inventa una forma di un altro sistema, come nella foto dell'owner
    const storta = await madre.onDelega('scrivi la PARTE 1', '/mnt/c/progetto');
    assert.equal(storta.esito, 'rifiutato');
    assert.equal(finto.avvii.length, 1, 'nessuna figlia destinata a morire deve essere partita');

    // 2. il rifiuto gli ha DETTO dove lavorare: da qui in poi tre su tre
    const cartellaSuggerita = cartellaMadre;
    assert.ok(storta.motivo.includes(cartellaSuggerita));

    const uno = madre.onDelega('scrivi la PARTE 1', cartellaSuggerita);
    const due = madre.onDelega('scrivi la PARTE 2'); // omessa: il caso normale
    const tre = madre.onDelega('scrivi la PARTE 3', cartellaSuggerita);

    assert.equal(finto.avvii.length, 4, 'madre + tre figlie: se sono meno, una delega non è partita');
    for (const figlia of finto.avvii.slice(1)) {
      assert.equal(figlia.cartella, cartellaMadre, 'una figlia lavora fuori dalla cartella della madre');
    }

    assert.equal(registro.elencaFigli(madreId).figli.length, 3,
      'la scheda «Agenti» legge questa rotta: se qui sono meno di tre, la scheda mente');

    for (const figlia of finto.avvii.slice(1)) figlia.concludi({ ok: true });
    for (const promessa of [uno, due, tre]) assert.equal((await promessa).esito, 'concluso');

    const figli = registro.elencaFigli(madreId).figli;
    assert.deepEqual(figli.map((f) => f.task), ['scrivi la PARTE 1', 'scrivi la PARTE 2', 'scrivi la PARTE 3'],
      'i tre compiti si sono confusi fra loro, o la scheda mostra tre righe uguali');
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

test('⛔⛔ LA SCHEDA CON UNA FIGLIA VIVA — è la riga che BC-18 dichiarava NON verificata', async () => {
  /*
   * ⛔ 11/09: «BC-03 era stato dichiarato chiuso con foto e test — ma il suo stesso rapporto
   *   dichiarava il buco: la scheda con una figlia VIVA non l'ho mai vista». La cura di cadenza
   *   sta nel frontend (fuori da questa corsia); la FONTE che quella cadenza rilegge è questa, e
   *   non era mai stata messa sotto prova con una figlia ancora in corso.
   */
  const cartellaMadre = cartellaVera('talos-viva-');
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(cartellaMadre, finto);

    finto.avvii[0].onDelega('Sei una sessione di lavoro autonoma; non hai altro contesto. Compito: assembla e valida un file HTML.');

    const figli = registro.elencaFigli(madreId).figli;
    assert.equal(figli.length, 1, 'con una delega VIVA la rotta deve già elencarla: è il caso della foto dell\'owner');
    assert.equal(figli[0].conclusa, false, 'una figlia viva non è conclusa');
    assert.equal(figli[0].interrotta, false, 'e non è nemmeno interrotta');
    assert.equal(figli[0].esitoDelega, null, 'nessun verdetto prima della fine: mai un esito inventato');
    assert.equal(figli[0].taskCorto, 'assembla e valida un file HTML.',
      'la scheda mostra il COMPITO, non il preambolo del kernel identico per ogni figlia');
    assert.ok(figli[0].sessionId, 'senza id la scheda non può aprire la conversazione della figlia');

    // e quando finisce, la STESSA rotta lo dice — senza aspettare un riavvio
    finto.avvii[1].concludi({ ok: true });
    const dopo = registro.elencaFigli(madreId).figli;
    assert.equal(dopo[0].conclusa, true, 'una delega finita che resta «in corso» è lo stesso difetto al rovescio');
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});
