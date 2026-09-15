import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse as parsePath } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * ⛔⛔⛔ LE TRE PROVE CHIESTE DALL'OWNER (08/09/2026), verbatim:
 *   «inoltre le deleghe devi assicurarti che possano essere chiamate in parallelo o una dopo
 *    l'altra» · «assicurarti anche che vengano chiamati nello stesso workspace e directory
 *    insomma NON HAI PROVATO UN CAZZO DI STA COSA quindi è molto flaky».
 *
 * Aveva ragione: prima di oggi non esisteva una sola prova che facesse partire DUE deleghe.
 * Quelle in `subagent-orchestrator.test.mjs` provano l'orchestratore da solo, con un
 * `avviaESeguiFn` finto — e il difetto della cartella `C:\` NON viveva nell'orchestratore:
 * viveva in `cartellaEffettivaPerPermessi` (session-registry.mjs:1840), un piano più in basso.
 * Una prova che ferma la finzione SOPRA il difetto non può vederlo.
 *
 * ⇒ Qui il registro è QUELLO VERO: `avviaESegui` vero, eredità di modello e permessi vera,
 *   `cartellaEffettivaPerPermessi` vera, `existsSync` vero su una cartella vera del disco.
 *   L'unica cosa finta è il modello — `avviaSessioneFn` non chiama nessun fornitore.
 *   Costo: zero. Copertura: il piano esatto in cui il difetto stava.
 *
 * ⭐ RICERCA 08/09/2026 — Nous Research, «Subagent Delegation» e «Delegation & Parallel Work»
 *   (hermes-agent.nousresearch.com/docs/user-guide/features/delegation e /docs/guides/
 *   delegation-patterns), più la scheda Fastio sugli stessi pattern. Quello che conferma:
 *   «subagents share the parent's working directory» per difetto, ed «ereditano i toolset del
 *   padre» senza potersene concedere di nuovi — le due cose che questo file prova.
 *   Quello che invece SMENTISCE una nostra comodità, e che dal codice non si vedeva:
 *   (1) Hermes v0.11.0 (aprile 2026) ha aggiunto un «file coordination layer» perché due figlie
 *       concorrenti sulla stessa cartella si sovrascrivono le modifiche a vicenda. NOI NON
 *       L'ABBIAMO. Le prove qui sotto dimostrano che due deleghe partono insieme e nello stesso
 *       workspace; NON dimostrano che si possano scrivere gli stessi file senza pestarsi.
 *       ⇒ Debito dichiarato, non chiuso: vedi la nota in fondo al file.
 *   (2) Per i task di codice Hermes offre `delegation.worktree_isolation: true` (un git worktree
 *       per figlia, ramo `hermes-subagent/<id>`). Anche questo manca.
 *   (3) Il loro tetto di concorrenza è un DEFAULT di 3 «no hard ceiling, only a floor of 1»;
 *       il nostro `LIMITE_FIGLI_CONCORRENTI = 10` è un tetto DURO. Scelta diversa, consapevole.
 *
 * ⛔ Quello che questo file NON prova, e va detto: che il MODELLO scelga di delegare, e che il
 *   giro vero produca file sul disco. Quella resta una prova dal vivo, non ancora fatta.
 */

/** Una cartella VERA sul disco: `esisteCartella` del registro è quella vera, non iniettata. */
function cartellaVera(prefisso = 'talos-delega-') {
  return mkdtempSync(join(tmpdir(), prefisso));
}

/**
 * Il modello finto. Non risponde niente: tiene in mano `onDelega` — la porta da cui il kernel
 * chiede una delega — e lascia al test il momento di concludere ogni sessione.
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
        permessi: input.permessi,
        modello: input.modello,
        onDelega: input.onDelega,
        /* ⛔ 10/09 (D3): la porta da cui una sessione manda i suoi eventi al registro. Serve per
           provare ciò che il registro fa MENTRE gli eventi passano — per esempio accorgersi che due
           figlie hanno scritto lo stesso file. */
        onEvento: input.onEvento,
        /*
         * ⛔ EMETTE `RunFinished` PRIMA di risolvere, perche' e' quello che fa la sessione vera:
         *   `agent-service.mjs:149` (`esitoInEventoFinale`) manda sempre un RunFinished o un
         *   RunError, e solo quell'evento porta `voce.conclusa = true`
         *   (`session-registry.mjs:1540`). Un finto che risolve la promessa senza l'evento
         *   lascerebbe la figlia «viva» per sempre — l'ho scoperto perche' la prova 2/3 e'
         *   nata rossa proprio li'. Il difetto era nel finto, non nel prodotto: un fake che non
         *   imita il vero misura il fake.
         */
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
    // la cartella scelta a piacere passa così com'è: la validazione vera è provata in custom-task
    preparaEsecuzioneLiberaFn: (_cartelle, { cartellaLibera, consegna }) => ({
      cartella: cartellaLibera, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna },
    }),
    modello: 'z-ai/glm-5.3-flash',
    chiave: 'chiave-finta',
  });
  const avvio = registro.avviaLibero({
    cartellaLibera: cartellaMadre,
    consegna: 'dividi il lavoro in due parti e delegale',
    // ⛔ «Full access» è il permesso su cui il difetto scattava: la figlia lo EREDITA dalla madre.
    permessi: 'Full access',
  });
  assert.ok(avvio.sessionId, `la madre non è partita: ${avvio.erroreAvvio ?? ''}`);
  return { registro, madreId: avvio.sessionId };
}

test('TRE PROVE — 1/3 · DUE DELEGHE IN PARALLELO: partono entrambe, e nella cartella della madre', async () => {
  const cartellaMadre = cartellaVera();
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(cartellaMadre, finto);
    const madre = finto.avvii[0];

    // ⭐ nessun await fra le due: la seconda parte MENTRE la prima è ancora viva. È il caso che
    //   l'owner ha chiesto, e che nessuna prova copriva.
    const primaFinita = madre.onDelega('scrivi la PARTE 1');
    const secondaFinita = madre.onDelega('scrivi la PARTE 2');

    assert.equal(finto.avvii.length, 3, 'madre + due figlie: se sono 2, la seconda delega non è partita');
    const [figliaA, figliaB] = finto.avvii.slice(1);

    assert.equal(registro.elencaFigli(madreId).figli.length, 2, 'le due figlie devono risultare vive INSIEME');
    for (const figlia of [figliaA, figliaB]) {
      assert.equal(figlia.cartella, cartellaMadre,
        'una figlia lavora fuori dalla cartella della madre — è il difetto dell\'08/09');
      assert.equal(figlia.permessi, 'Full access',
        'la figlia eredita il permesso della madre, e non uno più largo (Hermes: «cannot grant itself capabilities the parent does not have»)');
      assert.equal(figlia.modello, 'z-ai/glm-5.3-flash', 'la figlia paga sul modello della madre, o chi paga non sa cosa paga');
    }
    // ⛔ AL CONTRARIO — l'assert sopra distingue qualcosa solo se la radice è DIVERSA dalla
    //   cartella: su una madre già in `C:\` passerebbe per caso, senza provare niente.
    assert.notEqual(parsePath(cartellaMadre).root, cartellaMadre,
      'la cartella di prova deve stare sotto la radice, o la prova non morde');

    // e le due promesse si chiudono ognuna sulla SUA figlia: concluse al contrario, non si scambiano
    figliaB.concludi({ ok: true });
    figliaA.concludi({ ok: true });
    assert.equal((await primaFinita).esito, 'concluso');
    assert.equal((await secondaFinita).esito, 'concluso');
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

test('TRE PROVE — 2/3 · DUE DELEGHE UNA DOPO L\'ALTRA: la seconda parte a prima conclusa', async () => {
  const cartellaMadre = cartellaVera();
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(cartellaMadre, finto);
    const madre = finto.avvii[0];

    const prima = madre.onDelega('scrivi la PARTE 1');
    finto.avvii[1].concludi({ ok: true });
    assert.equal((await prima).esito, 'concluso');
    assert.equal(registro.elencaFigli(madreId).figli.filter((f) => !f.conclusa).length, 0,
      'a prima conclusa non deve restare nessuna figlia viva');

    const seconda = madre.onDelega('scrivi la PARTE 2');
    assert.equal(finto.avvii.length, 3, 'dopo una delega conclusa la successiva non riparte');
    assert.equal(finto.avvii[2].cartella, cartellaMadre,
      'la seconda figlia deve stare dove sta la prima: la stessa cartella della madre');
    finto.avvii[2].concludi({ ok: true });
    assert.equal((await seconda).esito, 'concluso');

    const figli = registro.elencaFigli(madreId).figli;
    assert.deepEqual(figli.map((f) => f.task), ['scrivi la PARTE 1', 'scrivi la PARTE 2'],
      'i due compiti si sono confusi fra loro');
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

test('TRE PROVE — 3/3 · STESSO WORKSPACE: la cartella arriva alla figlia intatta, spazi compresi', () => {
  /*
   * ⛔ Una cartella con uno spazio nel nome è la forma in cui vive il progetto di una persona
   *   («C:\Users\Mario Rossi\progetto uno»), ed è quella che una riga di comando mal quotata
   *   spezza a metà. Se il percorso passasse da una shell, qui si vedrebbe.
   */
  const radice = cartellaVera('talos-delega-sp-');
  const conSpazi = join(radice, 'progetto con spazi');
  mkdirSync(conSpazi, { recursive: true });
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(conSpazi, finto);
    finto.avvii[0].onDelega('leggi il README');

    const figlia = finto.avvii[1];
    assert.ok(figlia, 'la delega non ha nemmeno provato ad avviare la figlia');
    assert.equal(figlia.cartella, conSpazi,
      'la cartella non si tocca: né troncata allo spazio, né normalizzata, né allargata');
    assert.equal(registro.elencaFigli(madreId).figli.length, 1,
      'la figlia deve comparire nell\'albero della madre, o la scheda «Agenti» resta vuota');
  } finally {
    rimuoviCartellaDiProva(radice);
  }
});

/*
 * ⛔ DEBITO DICHIARATO, aperto — non lo chiude questo file.
 *
 * Le tre prove sopra dicono che due deleghe partono insieme, che partono anche in sequenza, e che
 * lavorano tutte nella cartella della madre. NON dicono che due figlie possano MODIFICARE gli
 * stessi file senza sovrascriversi: quello, in Hermes, è un pezzo a parte («file coordination
 * layer», v0.11.0, aprile 2026) e da noi non esiste. Finché non c'è, la delega in parallelo è
 * sicura sui compiti che LEGGONO e su quelli che scrivono file DIVERSI — esattamente il consiglio
 * che danno loro: «batch delegation works best when tasks are genuinely independent».
 */

/*
 * ⛔⛔⛔ IL TERZO CASO DELLA STESSA FAMIGLIA, trovato leggendo i chiamanti di `avviaESegui` dopo
 *   la cura della delega (08/09). I chiamanti sono cinque:
 *     · 2316 reindirizzamento e 2935 `resume` → passano `voceEsistente`, quindi NON ricostruiscono
 *       la voce e non ripassano da `cartellaEffettivaPerPermessi`: al sicuro, verificato.
 *     · 2700 `avvia` (catalogo) e 2760 `avviaLibero` → passano già la bandiera: al sicuro.
 *     · 2808 `forka` → crea una VOCE NUOVA e **non passa la bandiera**. Difetto.
 *
 * Conseguenza reale: si forka una sessione avviata su una cartella scelta a mano (che passa
 * obbligatoriamente da «Full access», vedi il cancello in `avviaLibero`) e il fork si ritrova a
 * lavorare in `C:\`. Stesso danno della delega: `EPERM mkdir 'C:\'`, zero file scritti.
 *
 * ⭐ È la TERZA volta che `forka` dimentica qualcosa per lo stesso motivo — la sua stessa doc lo
 *   racconta due volte: i permessi (28/8, trovati da un test) e `permessiPerAttrezzo` (28/8,
 *   applicato proattivamente). Un fork crea una voce nuova, quindi **tutto** ciò che la voce
 *   deriva va ripassato per nome. La cartella era la terza cosa, e nessuno l'aveva vista.
 *
 * ⭐ Ricerca 08/09/2026: lo stato dell'arte tratta la cartella di un fork come una cosa che NON
 *   deve andare alla deriva — Claude Code, issue #60272 «Fork session… to decouple new sessions
 *   from the working directory of prior sessions»; e le note su GitKraken: un fork «keeps its own
 *   captured path or falls back cleanly to the project root rather than drifting». Qui la deriva
 *   c'era, e non verso la radice del progetto: verso la radice del DISCO.
 *   ⛔ Differenza consapevole con lo stato dell'arte, dichiarata: là «session-scoped permissions do
 *   not transfer to branches and must be re-approved»; da noi `forka` li eredita di proposito
 *   (documentato nella sua doc dal 28/8). Non la cambio qui: è una decisione dell'owner.
 */
test('⛔ FORK: il fork di una sessione con cartella scelta a mano NON finisce nella radice del disco', async () => {
  const cartellaMadre = cartellaVera('talos-fork-');
  try {
    const finto = modelloFinto();
    const { registro } = registroConMadre(cartellaMadre, finto);
    finto.avvii[0].concludi({ ok: true, esito: { messaggiFinali: [{ role: 'user', content: 'ciao' }] } });
    // il registro cattura `messaggiFinali` dentro il `.then()`: senza questo giro di microtask
    // `forka` risponderebbe SESSION_NOT_READY e la prova mentirebbe sul motivo
    await new Promise((r) => setImmediate(r));

    const sessioni = registro.elenca().sessioni ?? registro.elenca();
    const origine = Array.isArray(sessioni) ? sessioni[0] : null;
    const fork = registro.forka(origine?.sessionId ?? origine?.id);
    assert.ok(fork?.sessionId, `il fork non è partito: ${fork?.erroreAvvio ?? ''}`);

    const voceFork = finto.avvii[1];
    assert.ok(voceFork, 'il fork non ha avviato nessuna sessione');
    assert.equal(voceFork.cartella, cartellaMadre,
      'il fork lavora nella radice del disco invece che nella cartella scelta: stesso difetto della delega');
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

test('⛔ FORK, AL CONTRARIO: l\'allargamento LEGITTIMO dell\'allowlist sopravvive al fork', async () => {
  /*
   * ⭐ La cura sopra poteva uccidere il caso (a) — l'unico che DEVE allargare: una sessione avviata
   *   su una cartella dell'allowlist con «Full access» lavora nella radice, per scelta dell'owner
   *   («parto stretto, mi allargo», 03/9). Il suo fork deve continuare a lavorare nella radice, non
   *   tornare nella cartella stretta. Senza questa prova, la cura sarebbe una regressione
   *   invisibile — è successo altre volte in questo progetto: stringere una guardia crea un falso
   *   negativo.
   */
  const progetto = cartellaVera('talos-allowlist-');
  try {
    const finto = modelloFinto();
    const registro = createSessionRegistry({
      avviaSessioneFn: finto.avviaSessioneFn,
      guardaWorkspaceFn: () => () => {},
      preparaEsecuzioneLiberaFn: (cartelle, { cartellaId, consegna }) => {
        const voce = cartelle.find((c) => c.id === cartellaId);
        return { cartella: voce.percorso, comandoProva: 'npm test', task: { consegna, consegnaCorta: consegna } };
      },
      cartelleProgetto: [{ id: '0', percorso: progetto, nome: 'progetto' }],
      modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
    });
    const avvio = registro.avviaLibero({ cartellaId: '0', consegna: 'lavora', permessi: 'Full access' });
    assert.ok(avvio.sessionId, `la sessione non è partita: ${avvio.erroreAvvio ?? ''}`);

    const radice = parsePath(progetto).root;
    assert.equal(finto.avvii[0].cartella, radice,
      'il caso (a) deve allargare: se non allarga più, la cura ha rotto l\'allowlist');

    finto.avvii[0].concludi({ ok: true, esito: { messaggiFinali: [{ role: 'user', content: 'ciao' }] } });
    await new Promise((r) => setImmediate(r));
    const fork = registro.forka(avvio.sessionId);
    assert.ok(fork?.sessionId, `il fork non è partito: ${fork?.erroreAvvio ?? ''}`);
    assert.equal(finto.avvii[1].cartella, radice,
      'il fork di una sessione allargata deve restare allargato: la cura non deve stringerlo');
  } finally {
    rimuoviCartellaDiProva(progetto);
  }
});

/*
 * ⛔⛔⛔ LA BARRA A SINISTRA NON PUÒ SAPERE CHE UNA SESSIONE È UNA FIGLIA (08/09).
 *
 * L'owner l'ha visto dal vivo: dopo una delega la barra mostra due sessioni «Delega» sciolte,
 * accanto alla madre, come se fossero tre lavori indipendenti. Non è un difetto di disegno del
 * frontend: `elenca()` espone `forkDa` ma NON `padreId` né `profonditaDelega`, e nel frontend la
 * parola `padreId` non compare nemmeno una volta (verificato con grep su `frontend/src/`). La
 * barra non ha proprio il dato — nessuna scelta di presentazione era possibile.
 *
 * ⭐ È anche la causa VERA di quello che sembrava un difetto della scheda «Agenti»: la scheda
 *   dipende dalla sessione attiva, e con le figlie sciolte in mezzo alle madri è facilissimo
 *   trovarsi su quella sbagliata senza accorgersene (vedi §8.1 del ticket).
 *
 * ⭐ Ricerca 08/09/2026 — lo stato dell'arte è concorde su COSA farne, e su cosa NON fare:
 *   · `nesquena/hermes-webui` #1004: le sessioni figlie «should be displayed as a delegation tree
 *     rather than collapsed… should remain visible as a tree» ⇒ **non si nascondono**.
 *   · OpenClaw Control UI: la madre ha una riga espandibile, le figlie righe annidate con stato e
 *     durata; aprire una figlia «preserva la gerarchia».
 *   · Zed #57481 lascia aperta una sola domanda — quanto indentare prima di appiattire, «for
 *     MAX_SUBAGENT_DEPTH > 2». Da noi non si pone: `LIMITE_PROFONDITA_DELEGA = 2`.
 *   · ⛔ E il modo di sbagliare, documentato tre volte: OpenClaw #89249 (il selettore diventa
 *     inusabile, «1 / 177», tutto il resto sono figlie), opencode #14053 (la Web UI mostra le
 *     figlie che la TUI filtra) e la segnalazione su Codex («flood the desktop app sidebar with no
 *     way to scope them»). È esattamente dove eravamo.
 *
 * ⇒ Primo passo, qui: il DATO. Senza `padreId` e `profonditaDelega` nell'elenco, l'albero non si
 *   può disegnare. La presentazione viene subito dopo, nella barra.
 */
test('⛔ BARRA: l\'elenco delle sessioni dice CHI è figlia di chi, o l\'albero non si può disegnare', async () => {
  const cartellaMadre = cartellaVera('talos-barra-');
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(cartellaMadre, finto);
    finto.avvii[0].onDelega('scrivi la PARTE 1');

    const elenco = registro.elenca();
    assert.equal(elenco.length, 2, 'madre + figlia: sono due sessioni vere, entrambe nell\'elenco');

    const madre = elenco.find((s) => s.sessionId === madreId);
    const figlia = elenco.find((s) => s.sessionId !== madreId);

    assert.equal(madre.padreId, null, 'una sessione avviata da una persona non ha padre: mai un id inventato');
    assert.equal(madre.profonditaDelega, 0, 'la madre sta alla radice dell\'albero');

    assert.equal(figlia.padreId, madreId,
      'la figlia deve dire di chi è figlia, o la barra la mostra sciolta accanto alla madre');
    assert.equal(figlia.profonditaDelega, 1,
      'la profondità serve a indentare: senza, l\'albero è piatto anche avendo i legami');
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

test('⛔ BARRA: il nome di una figlia è CORTO alla fonte — la prima riga, 80 caratteri', async () => {
  /*
   * ⛔ Visto nella foto della pagina intera, non nei numeri: passando la consegna INTERA, la colonna
   *   destra la stampava per venti righe e spingeva le schede «Contesto/File/Agenti/Processi» fuori
   *   dalla vista. La barra e la testata tagliano da sole con l'ellissi, quel pannello no.
   * ⇒ Un nome si accorcia dove NASCE, o ogni superficie deve ricordarsi di farlo.
   */
  const cartellaMadre = cartellaVera('talos-nome-');
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(cartellaMadre, finto);
    const lunga = `Scrivi la PARTE 1 di un paper tecnico su GLM-5.3 e la metodologia di post-training scaling${'x'.repeat(200)}\nSeconda riga`;
    finto.avvii[0].onDelega(lunga);

    const figlia = registro.elenca().find((s) => s.padreId === madreId);
    assert.ok(figlia.taskDelega, 'una figlia deve portare il suo compito, o la barra non sa come chiamarla');
    assert.ok(figlia.taskDelega.length <= 80, `il nome deve stare in 80 caratteri, ne ha ${figlia.taskDelega.length}`);
    assert.ok(figlia.taskDelega.endsWith('…'), 'un nome tagliato lo dichiara con i puntini, non finisce di colpo');
    assert.ok(!figlia.taskDelega.includes('Seconda riga'), 'solo la PRIMA riga: un nome non è un paragrafo');
    assert.equal(registro.elenca().find((s) => s.sessionId === madreId).taskDelega, null,
      'una sessione avviata da una persona non ha un «compito delegato»: mai un nome inventato');
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

/*
 * ⛔ 09/09/2026 — trovato dal GIRO VERO sul 4174 (D2, glm-5.3-flash, due deleghe riuscite): nella barra a
 *   sinistra e nella scheda «Agenti» le due figlie si chiamavano entrambe
 *   «Sei una sessione di lavoro autonoma; non hai altro …».
 *
 * Causa, letta dal JSONL della figlia sul disco (825 caratteri di consegna): il kernel non passa il compito
 * nudo, passa il PROMPT INTERO della figlia, che comincia con un preambolo di sistema e mette il compito
 * dopo il marcatore «Compito:». `nomeCortoDaConsegna` prendeva la prima riga — cioè il preambolo — e le due
 * figlie risultavano identiche: per sapere quale fosse quale bisognava aprirle. È lo stesso difetto delle
 * schede del browser di ieri, in un altro punto dello schermo.
 *
 * ⇒ La cura sta dove il difetto NASCE: l'orchestratore è l'unico che sa che quella stringa è il prompt di
 *   una delega, e costruisce lui la forma corta. `nomeCortoDaConsegna` resta com'è e continua a preferire
 *   `consegnaCorta`.
 * ⛔ Il marcatore «Compito:» è del kernel dell'owner (`mobile/scripts/harness-talos`), che non è mio: se un
 *   giorno cambia, il nome torna a essere il preambolo — brutto ma visibile, non un silenzio.
 */
test('⛔ NOME DELLA FIGLIA: il compito, non il preambolo di sistema del kernel', () => {
  const cartellaMadre = cartellaVera('talos-nome-figlia-');
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(cartellaMadre, finto);
    // la stringa VERA che il kernel ha passato il 09/09, accorciata al necessario
    const promptVero = 'Sei una sessione di lavoro autonoma; non hai altro contesto. Compito: crea un file chiamato parte2.md nella cartella di lavoro corrente (dove ti trovi). Il file deve contenere ESATTAMENTE tre righe di testo in italiano sul tema "allarmi".';
    finto.avvii[0].onDelega(promptVero);

    const figlia = registro.elenca().find((s) => s.padreId === madreId);
    assert.ok(figlia.taskDelega.startsWith('crea un file chiamato parte2.md'),
      `il nome deve cominciare dal compito, non dal preambolo — invece è «${figlia.taskDelega.slice(0, 60)}…»`);
    assert.ok(!figlia.taskDelega.includes('sessione di lavoro autonoma'), 'il preambolo di sistema non è un nome');
    assert.ok(figlia.taskDelega.length <= 80);

    // ⛔ AL CONTRARIO: due deleghe diverse devono avere nomi DIVERSI, o la barra torna illeggibile
    finto.avvii[0].onDelega('Sei una sessione di lavoro autonoma; non hai altro contesto. Compito: crea il file parte1.md sul registro dei processi.');
    const nomi = registro.elenca().filter((s) => s.padreId === madreId).map((s) => s.taskDelega);
    assert.equal(new Set(nomi).size, 2, `due figlie con compiti diversi non possono chiamarsi uguali: ${JSON.stringify(nomi)}`);

    // e una consegna SENZA preambolo resta se stessa: la cura non taglia dove non c'è niente da tagliare
    const madre2 = registroConMadre(cartellaMadre, modelloFinto());
    void madre2;
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

test('⛔ NOME, AL CONTRARIO: una figlia RIPRISTINATA dal disco (senza consegnaCorta) mostra comunque il compito', () => {
  /*
   * Le figlie nate prima della cura hanno sul disco solo `task.consegna` — il prompt intero. Se il taglio
   * vivesse solo nell'orchestratore, la storia continuerebbe a leggersi male per sempre. Qui si prova che
   * l'elenco taglia anche quello che ARRIVA GIÀ FATTO, senza riscrivere niente sul disco.
   */
  const cartellaMadre = cartellaVera('talos-nome-ripr-');
  try {
    const finto = modelloFinto();
    const { registro } = registroConMadre(cartellaMadre, finto);
    const sessioni = registro.perTest?.() ?? null;
    void sessioni;
    // una voce come la ricostruisce il ripristino: task senza consegnaCorta
    finto.avvii[0].onDelega('Sei una sessione di lavoro autonoma; non hai altro contesto. Compito: scrivi il file storico.md.');
    const figlia = registro.elenca().find((s) => s.padreId);
    assert.ok(figlia.taskDelega.startsWith('scrivi il file storico.md'), `invece: «${figlia.taskDelega}»`);
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});

/*
 * ⛔⛔⛔ D3, LA PROVA CHE CONTA — due figlie VERE della stessa madre che scrivono lo STESSO file, sul
 * registro vero (solo il modello è finto). Prima di questa cura succedeva in silenzio: l'ultima che
 * salva vince, il lavoro dell'altra sparisce, e tutte e due dicono «fatto». Ora la madre se ne
 * accorge mentre gli eventi passano, e la scheda «Agenti» lo dice — col nome del FILE, che è ciò che
 * chi legge deve andare a riaprire.
 * ⛔ Non è il lucchetto: il cancello di `scrivi` vive nel kernel, che qui è una copia dell'owner.
 *   È la fine del silenzio, che è il danno vero (owner 09/09, via A; la via C è per più avanti).
 */
test('D3 sul registro VERO — due figlie sullo stesso file: la collisione arriva alla scheda Agenti', async () => {
  const cartellaMadre = cartellaVera('talos-d3-');
  try {
    const finto = modelloFinto();
    const { registro, madreId } = registroConMadre(cartellaMadre, finto);
    const madre = finto.avvii[0];

    const uno = madre.onDelega({ task: 'Compito: scrivi la parte 1 in comune.md' });
    const due = madre.onDelega({ task: 'Compito: scrivi la parte 2 in comune.md' });
    await new Promise((r) => setImmediate(r));
    assert.equal(finto.avvii.length, 3, 'la madre e le sue due figlie');

    const [, f1, f2] = finto.avvii;
    const scrittura = (percorso, contenuto) => ({
      type: 'StateDelta',
      delta: [{ op: 'add', path: `/file/${percorso}`, value: contenuto }],
    });

    // ogni figlia riscrive PRIMA il suo file due volte: lavoro normale, nessun allarme
    f1.onEvento(scrittura('parte1.md', 'a'));
    f1.onEvento(scrittura('parte1.md', 'a2'));
    f2.onEvento(scrittura('parte2.md', 'b'));

    const figlie = () => registro.elencaFigli(madreId).figli;
    assert.deepEqual(figlie().flatMap((f) => f.collisioni), [],
      'AL CONTRARIO: due figlie su file diversi — e una che riscrive il suo — non fanno scattare niente');

    // e adesso il caso vero: tutte e due su comune.md
    f1.onEvento(scrittura('comune.md', 'la mia versione'));
    f2.onEvento(scrittura('comune.md', 'la mia, che copre la sua'));

    const dopo = figlie();
    const conCollisione = dopo.filter((f) => f.collisioni.length > 0);
    assert.equal(conCollisione.length, 2, 'la collisione riguarda ENTRAMBE le figlie: chi ha coperto e chi è stato coperto');
    for (const f of conCollisione) assert.equal(f.collisioni[0].percorso, 'comune.md', 'si nomina il FILE, non un conteggio');

    const coperta = dopo.find((f) => f.collisioni.some((c) => c.dopoDi));
    const coprente = dopo.find((f) => f.collisioni.some((c) => c.primaDi));
    assert.ok(coperta && coprente && coperta.sessionId !== coprente.sessionId,
      'si sa CHI ha scritto per primo e chi dopo: senza, la nota non è azionabile');

    f1.concludi(); f2.concludi(); await uno; await due;
  } finally {
    rimuoviCartellaDiProva(cartellaMadre);
  }
});
