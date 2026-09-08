import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse as parsePath } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';

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
    rmSync(cartellaMadre, { recursive: true, force: true });
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
    rmSync(cartellaMadre, { recursive: true, force: true });
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
    rmSync(radice, { recursive: true, force: true });
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
    rmSync(cartellaMadre, { recursive: true, force: true });
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
    rmSync(progetto, { recursive: true, force: true });
  }
});
