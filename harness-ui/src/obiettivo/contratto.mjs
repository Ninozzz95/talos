/*
 * ⭐⭐⭐ /goal, fase G2 (piano approvato dall'owner il 14/10/2026) — IL CONTRATTO: che cosa vuol dire «fatto», scritto in modo
 *   che il SISTEMA lo possa provare. Qui c'è la sola forma, pura: convalida, impronta, confronto fra due contratti. Chi lo
 *   propone (il modello), chi lo conferma (la persona, con una carta) e chi esegue le prove (G3) stanno altrove.
 *
 * Un contratto è un elenco di CRITERI, ognuno col suo modo di verifica:
 *   · `comando`  — un comando e il codice d'uscita atteso (di serie 0);
 *   · `file`     — un fatto su un file del progetto: esiste, non esiste, contiene, non contiene;
 *   · `giudizio` — ciò che un comando non sa dire: lo valuterà un giudice sulle ricevute e sulle differenze (G5).
 *
 * Da chi vengono le regole (letto NEL CODICE il 12-14/10/2026, ledger `LEDGER-GOAL-LOOP-ENGINEERING-2026-10-12.md`):
 *   · Hermes `hermes_cli/goals.py:239-258` — un modello trasforma l'obiettivo in un contratto, ma a cinque campi di TESTO LIBERO
 *     («verification: the specific test / command / artifact that PROVES the outcome»): la prova resta una frase per l'agente,
 *     a meno che la persona non la riscriva a mano come cancello (`:343-355`, `GoalGate`).
 *   · dsh-goalloop `lib/core.js:13-37` — criteri tipizzati (`check:` + `expected: exit=0 | <op>N | maximize | judged`), scritti a
 *     mano; `:186-191` un criterio malformato RIFIUTA tutto il contratto.
 *   · Hermes `agent/verification_evidence.py:213-231` — l'esito di un comando prova qualcosa solo se è ATTRIBUIBILE: pipe, `||`
 *     e `&` lo nascondono; solo l'ultima sequenza dopo un `;` lo riporta; una catena `&&` prova i suoi membri solo se riesce.
 *   · opencode-goal-plugin `src/goal-plan.ts:54-136` — togliere un pezzo di ciò che era stato pianificato chiede un atto
 *     esplicito («removing planned scope requires concrete revisit evidence»).
 * Che cosa ne facciamo: i criteri sono tipizzati COME dsh-goalloop ma proposti da un modello COME Hermes; la regola
 *   dell'esito attribuibile si applica QUI, alla nascita del contratto, perché la prova la eseguirà il sistema e un comando
 *   che finisce in `|| true` sarebbe un criterio sempre verde; e togliere o cambiare un criterio si distingue dall'aggiungerne
 *   uno (`confrontaContratti`), perché ridefinire il successo a lavoro avviato è il modo più facile di «finire».
 *
 * ⛔ Chi non riesce a valutare NEGA: un comando che non si riesce a leggere (virgolette aperte) non è «probabilmente a posto»,
 *   è rifiutato; un criterio storto rifiuta l'intero contratto, mai «teniamo gli altri».
 */
import { canonicalHash } from '../workflow/canonical-json.mjs';

export const SCHEMA_CONTRATTO = 'talos.obiettivo.contratto.v1';

/** Quanti criteri al più. Hermes ne ha cinque campi, gli esempi di dsh-goalloop tre righe: venti è un tetto contro una
 *  proposta fuori controllo, non un invito. */
export const CRITERI_MASSIMI = 20;
export const TESTO_CRITERIO_MASSIMO = 300;
export const COMANDO_MASSIMO = 1000;
export const PERCORSO_MASSIMO = 300;
export const TESTO_CERCATO_MASSIMO = 300;

export const TIPI_DI_VERIFICA = Object.freeze(['comando', 'file', 'giudizio']);
export const FATTI_SUI_FILE = Object.freeze(['esiste', 'non-esiste', 'contiene', 'non-contiene']);

const FORMA_DELL_ID = /^c[1-9][0-9]{0,2}$/u;
const ID_MASSIMO = 999;
const numeroDellId = (id) => Number(String(id).slice(1));
/** Il primo numero libero PER SEMPRE: quello salvato nel contratto (`prossimoId`) o, per un contratto di prima, il massimo + 1. */
function primoLibero(contratto) {
  if (!contratto) return 1;
  const dalleId = Math.max(0, ...(contratto.criteri ?? []).map((criterio) => numeroDellId(criterio.id))) + 1;
  return Number.isSafeInteger(contratto.prossimoId) ? Math.max(contratto.prossimoId, dalleId) : dalleId;
}
/* ⛔ REV-GOAL-03 (owner 14/10/2026, «campi ignoti portati avanti»): di un criterio questa versione conosce `id`, `testo` e
   `verifica`; i controlli guardano solo questi. Un campo che una versione più nuova ha aggiunto non rende il contratto illeggibile. */
const CAMPI_NOTI_DELLA_VERIFICA = Object.freeze(['tipo', 'comando', 'uscita', 'percorso', 'fatto', 'testo']);
/* REV2-GOAL-04: anche dentro `verifica` contano solo i campi noti (un campo di una versione più nuova lì dentro non è un cambio). */
const verificaNota = (verifica) => (verifica && typeof verifica === 'object' && !Array.isArray(verifica)
  ? Object.fromEntries(CAMPI_NOTI_DELLA_VERIFICA.filter((campo) => Object.hasOwn(verifica, campo)).map((campo) => [campo, verifica[campo]]))
  : verifica);
const noti = (criterio) => ({ id: criterio.id, testo: criterio.testo, verifica: verificaNota(criterio.verifica) });
const lunghezza = (testo) => [...testo].length;

/** Un rifiuto: il motivo (identificatore stabile) e, quando c'è, QUALE criterio e che cosa di lui. */
const no = (motivo, extra = {}) => ({ ok: false, motivo, ...extra });

/** Un testo che si può salvare e impronta: stringa ben formata (niente surrogati isolati), senza NUL. */
function testoPulito(valore, massimo) {
  if (typeof valore !== 'string') return null;
  const pulito = valore.trim();
  if (pulito === '' || lunghezza(pulito) > massimo || !pulito.isWellFormed() || pulito.includes('\u0000')) return null;
  return pulito;
}

/**
 * Se il codice d'uscita di un comando dice davvero com'è andato CIÒ CHE IL COMANDO NOMINA.
 * Si guardano i soli operatori FUORI dalle virgolette (semplici e doppie; la barra rovesciata NON è una via di fuga: nei
 * percorsi di Windows è un carattere come gli altri, e trattarla da fuga farebbe «chiudere» una stringa che non chiude).
 *   · `|`, `|&`, `||`  — nascondono l'esito di ciò che sta prima ⇒ no;
 *   · `;` e l'a capo   — riporta solo l'ultimo ⇒ no (un `;` in fondo, senza niente dopo, non separa niente);
 *   · `&`              — in fondo o in mezzo manda in sottofondo (o, in cmd, mette in fila) ⇒ no; in TESTA a un pezzo è
 *                        l'operatore di chiamata di PowerShell (`& "C:\tool.exe" x`) ⇒ sì; dentro una ridirezione (`2>&1`,
 *                        `&>`) non è un operatore;
 *   · `&&`             — la catena riesce solo se riescono tutti ⇒ sì quando si aspetta 0, no quando si aspetta un errore
 *                        (non si saprebbe quale membro è fallito).
 * @param {string} comando
 * @param {{ uscita?: number }} [atteso]
 * @returns {{ok:true}|{ok:false, operatore:string}|{ok:false, perche:'virgolette'|'piu-righe'}} `operatore` è il SIMBOLO che
 *   nasconde l'esito (va a schermo così com'è, in ogni lingua); `perche` dice gli altri due casi: una virgoletta mai chiusa
 *   (il comando non si legge) e un comando su più righe (riporta solo l'ultima)
 */
export function esitoAttribuibile(comando, { uscita = 0 } = {}) {
  let virgoletta = null;
  let inizioPezzo = true; // finora, in questo pezzo, solo spazi
  for (let i = 0; i < comando.length; i += 1) {
    const c = comando[i];
    /* ⛔ REV-GOAL-02 (revisione del bugfixer, 14/10/2026): `$(…)` e il backtick eseguono un comando DENTRO un altro e ne buttano
       l'esito (`echo $(npm test)` esce 0). In bash valgono anche dentro le virgolette doppie (`test -n "$(npm test || true)"`):
       si negano ovunque tranne dentro le semplici. Il backtick è anche la fuga di PowerShell (REV-GOAL-01): negato, copre
       tutte e due. */
    if (virgoletta !== "'" && (c === '`' || (c === '$' && comando[i + 1] === '('))) return { ok: false, operatore: c === '`' ? '`' : '$(' };
    if (virgoletta) { if (c === virgoletta) virgoletta = null; continue; }
    if (c === '"' || c === "'") {
      /* ⛔ REV-GOAL-01: fuori dalle virgolette, una virgoletta preceduta dal carattere di fuga di una shell (`\"` in bash, `^"` in
         cmd; quella di PowerShell è il backtick, già negato sopra) per QUELLA shell è un carattere, non un'apertura — e
         l'operatore che segue è vivo. Misurato sulle tre shell vere della macchina (bugfixer). Il comando non si legge allo
         stesso modo in ogni shell: chi non riesce a valutare nega. */
      if (comando[i - 1] === '\\' || comando[i - 1] === '^') return { ok: false, perche: 'virgolette' };
      virgoletta = c; inizioPezzo = false; continue;
    }
    if (c === '\n' || c === '\r' || c === ';') {
      if (comando.slice(i + 1).trim() === '') break; // in fondo: non separa niente
      return c === ';' ? { ok: false, operatore: ';' } : { ok: false, perche: 'piu-righe' };
    }
    if (c === '|') return { ok: false, operatore: comando[i + 1] === '|' ? '||' : comando[i + 1] === '&' ? '|&' : '|' };
    if (c === '&') {
      if (comando[i + 1] === '&') {
        if (uscita !== 0) return { ok: false, operatore: '&&' };
        i += 1; inizioPezzo = true; continue;
      }
      const prima = comando[i - 1]; const dopo = comando[i + 1];
      if (prima === '>' || prima === '<') { inizioPezzo = false; continue; } // ridirezione: 2>&1, >&2
      /* ⛔ REV-GOAL-01b: `&>` è una ridirezione in bash, ma in cmd `&` SEPARA e `>nul` ridirige il comando dopo, che decide
         l'uscita. Ambiguo fra le shell ⇒ no. */
      if (dopo === '>') return { ok: false, operatore: '&>' };
      if (inizioPezzo) { inizioPezzo = false; continue; } // operatore di chiamata di PowerShell
      return { ok: false, operatore: '&' };
    }
    if (c !== ' ' && c !== '\t') inizioPezzo = false;
  }
  if (virgoletta) return { ok: false, perche: 'virgolette' };
  const annidata = shellAnnidata(comando);
  return annidata ? { ok: false, operatore: annidata } : { ok: true };
}

/*
 * ⛔ REV-GOAL-02 — una shell che esegue una STRINGA (`bash -c "npm test || true"`, `cmd /c "npm test & exit 0"`,
 *   `powershell -Command "npm test; exit 0"`): gli operatori stanno dentro le virgolette, dove questo lettore non guarda, ma la
 *   shell figlia li esegue tutti. Si nega la forma intera (il programma e la sua opzione), non si prova a leggere la stringa:
 *   le regole di quotatura annidata sono diverse in ogni shell, e chi non riesce a valutare nega. Uno script per nome
 *   (`bash ./prova.sh`, `pwsh -File x.ps1`) resta ammesso: l'esito è quello dello script.
 */
const SHELL_POSIX = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish', 'ash', '$shell', '${shell}']);
const SHELL_CMD = new Set(['cmd', '%comspec%', '$env:comspec']);
const SHELL_POWERSHELL = new Set(['powershell', 'pwsh']);
/* Uno script per nome: l'esito è il suo. */
const FILE_DI_SCRIPT = /\.(?:sh|bash|zsh|ksh|fish|ps1|psm1)$/iu;
/** I pezzi di un comando separati dagli spazi FUORI dalle virgolette, senza le virgolette. G3 lo usa per il nome del programma. */
export function pezziFuoriDalleVirgolette(comando) {
  const pezzi = [];
  let corrente = ''; let virgoletta = null; let dentro = false;
  for (const c of comando) {
    if (virgoletta) { if (c === virgoletta) virgoletta = null; else corrente += c; continue; }
    if (c === '"' || c === "'") { virgoletta = c; dentro = true; continue; }
    if (c === ' ' || c === '\t') { if (corrente !== '' || dentro) pezzi.push(corrente); corrente = ''; dentro = false; continue; }
    corrente += c;
  }
  if (corrente !== '' || dentro) pezzi.push(corrente);
  return pezzi;
}
/*
 * ⛔ REV2-GOAL-01 (seconda revisione del bugfixer, 14/10/2026): guardare solo il pezzo SUBITO dopo il nome della shell lasciava
 *   passare 15 forme (`pwsh -NoProfile -Command`, `bash -x -c`, `cmd /d /c`, `cmd /c"…"`, `powershell "…"`, `bash <<<`, `npx -c`,
 *   `$SHELL -c`, `%ComSpec% /c`…), otto misurate verdi su un comando fallito. Ora si ammette solo ciò che si sa leggere:
 *   · una shell POSIX solo se esegue uno SCRIPT per nome (il primo argomento non-opzione è un `.sh`…); altrimenti legge una
 *     stringa (`-c`, anche dopo altre opzioni) o l'ingresso (`bash <<<`), e si nega;
 *   · PowerShell solo con `-File <script>` (il primo argomento libero di Windows PowerShell È `-Command`);
 *   · cmd (anche per variabile, `%ComSpec%`) esegue sempre una stringa: si nega;
 *   · `npx -c` e `npm exec -c|--call` eseguono una stringa in una shell: si negano.
 */
/* ⛔ G3-REV-06/08 (riverifiche del bugfixer, 14/10): le parole di cmd che lanciano un ALTRO comando. `start` torna SUBITO con 0
   (misurato: `start /b node -e "process.exit(1)"` → 0, anche con `/wait /b`), come un `&` in coda detto con una parola; `call`,
   `if`, `for` e la parentesi possono portarsi dietro uno `start` (`call start /b …`, `(start /b …)`, `if 1==1 start /b …`: tutti
   VERDI dal kernel vero). Questo lettore non segue il comando dentro di loro: in posizione di comando si negano tutte. Il `^` è la
   fuga di cmd (`s^tart` è `start`) e `@` spegne solo l'eco: si tolgono prima di confrontare.
   ⛔ G3-REV-12 (terza riverifica, 14/10): cmd accetta l'opzione ATTACCATA (`start/b`, come `dir/w`): si confronta anche la parola
   prima della `/`. E `conhost` (`conhost.exe --headless npm test`) lancia un altro comando e torna 0: misurato dal kernel vero. */
const LANCIANO_UN_ALTRO = new Set(['start', 'call', 'if', 'for', 'conhost']);
/* I pezzi FUORI dalle virgolette, con `&&` separato anche quando è attaccato (`npm test&&start x`): dopo un `&&` comincia un
   comando. ⛔ Dentro le virgolette `&&` è testo (`echo "build&&start"`, G3-REV-12 S5: era un falso rifiuto). */
function pezziConLeCatene(comando) {
  const pezzi = [];
  let corrente = ''; let virgoletta = null; let dentro = false;
  const chiudi = () => { if (corrente !== '' || dentro) pezzi.push(corrente); corrente = ''; dentro = false; };
  for (let i = 0; i < comando.length; i += 1) {
    const c = comando[i];
    if (virgoletta) { if (c === virgoletta) virgoletta = null; else corrente += c; continue; }
    if (c === '"' || c === "'") { virgoletta = c; dentro = true; continue; }
    /* ⛔ G3-REV-14 (quarta riverifica, 14/10): cmd separa la parola del comando anche con `,` e `=` (`start,/b`, `start=/b`,
       `call,start`: VERDI dall'esecutore vero) — fuori dalle virgolette chiudono il pezzo come lo spazio */
    if (c === ' ' || c === '\t' || c === ',' || c === '=') { chiudi(); continue; }
    if (c === '&' && comando[i + 1] === '&') { chiudi(); pezzi.push('&&'); i += 1; continue; }
    corrente += c;
  }
  chiudi();
  return pezzi;
}
function shellAnnidata(comando) {
  /* ⛔ G3-REV-16 (quinta riverifica, 14/10): un `@` STACCATO (`@ start /b …`) è solo l'eco spento del comando che segue — non
     un comando: un pezzo di soli `@` non conta, e il comando dopo resta in posizione di comando */
  const pezzi = pezziConLeCatene(comando).filter((p) => !/^@+$/u.test(p));
  for (let i = 0; i < pezzi.length; i += 1) {
    const nome = pezzi[i].replaceAll('\\', '/').split('/').pop().toLowerCase().replace(/\.exe$/u, '');
    /* G3-REV-16: anche la parte PRIMA della prima `/` — `cmd/c "…"` è `cmd` con l'opzione attaccata, non un file `c` */
    const primo = pezzi[i].split('/')[0].toLowerCase().replace(/\.exe$/u, '');
    const resto = pezzi.slice(i + 1);
    /* in posizione di comando: in testa, dopo un `&&`, o dopo l'operatore di chiamata `&` di PowerShell (`& start x`) */
    if (i === 0 || pezzi[i - 1] === '&&' || (i === 1 && pezzi[0] === '&')) {
      const parola = pezzi[i].replaceAll('^', '').replace(/^@+/u, '');
      if (parola.startsWith('(')) return '(';
      const comandoCmd = parola.toLowerCase().replace(/\.exe$/u, '');
      const primaDellOpzione = comandoCmd.split('/')[0].replace(/\.exe$/u, ''); // `start/b` ⇒ `start`
      const base = comandoCmd.replaceAll('\\', '/').split('/').pop().replace(/\.exe$/u, ''); // `C:\Windows\System32\conhost.exe`
      /* G3-REV-16 (segnalato): cmd chiude il nome del comando anche a `.` e `(` — `start./b`, `start(/b` restavano appesi fino
         al tempo massimo e aprivano una finestra. Il nome è la corsa iniziale di lettere, cifre, `_` e `-`. */
      const nomeDiCmd = (/^[a-z0-9_-]+/u.exec(comandoCmd) ?? [''])[0];
      for (const candidato of [comandoCmd, primaDellOpzione, base, nomeDiCmd]) if (LANCIANO_UN_ALTRO.has(candidato)) return candidato;
    }
    if ((nome === 'npx' || (nome === 'npm' && resto[0] === 'exec')) && resto.some((p) => p === '-c' || p === '--call' || p.startsWith('--call='))) return `${nome} -c`;
    if (SHELL_CMD.has(nome) || SHELL_CMD.has(primo)) return pezzi[i];
    if (SHELL_POWERSHELL.has(nome) || SHELL_POWERSHELL.has(primo)) { // `powershell/c …`: cmd separa il nome anche alla `/`
      const file = resto.findIndex((p) => /^-f(?:ile)?$/iu.test(p));
      if (file === -1 || !FILE_DI_SCRIPT.test(resto[file + 1] ?? '')) return pezzi[i];
      continue;
    }
    if (SHELL_POSIX.has(nome)) {
      const primoLibero = resto.find((p) => !p.startsWith('-'));
      if (!primoLibero || !FILE_DI_SCRIPT.test(primoLibero)) return pezzi[i];
    }
  }
  return null;
}

function verificaNormale(grezza) {
  if (!grezza || typeof grezza !== 'object' || Array.isArray(grezza)) return no('criterion-check-missing');
  if (!TIPI_DI_VERIFICA.includes(grezza.tipo)) return no('criterion-check-unknown');
  if (grezza.tipo === 'giudizio') return { ok: true, verifica: { tipo: 'giudizio' } };
  if (grezza.tipo === 'comando') {
    const comando = testoPulito(grezza.comando, COMANDO_MASSIMO);
    if (comando === null) return no('criterion-command-invalid');
    const uscita = grezza.uscita ?? 0;
    if (!Number.isSafeInteger(uscita) || uscita < 0 || uscita > 255) return no('criterion-exit-code-invalid');
    const attribuibile = esitoAttribuibile(comando, { uscita });
    if (!attribuibile.ok) {
      if (attribuibile.perche === 'virgolette') return no('criterion-command-unreadable');
      if (attribuibile.perche === 'piu-righe') return no('criterion-command-multiline');
      return no('criterion-command-not-attributable', { operatore: attribuibile.operatore });
    }
    return { ok: true, verifica: { tipo: 'comando', comando, uscita } };
  }
  // file
  const grezzo = testoPulito(grezza.percorso, PERCORSO_MASSIMO);
  if (grezzo === null) return no('criterion-path-invalid');
  const percorso = grezzo.replaceAll('\\', '/');
  // dentro il progetto: niente radice, niente lettera di unità, niente risalite. Chi esegue (G3) lo ricontrolla sul disco vero.
  if (percorso.startsWith('/') || /^[A-Za-z]:/u.test(percorso) || percorso.split('/').some((pezzo) => pezzo === '..' || pezzo === '')) return no('criterion-path-outside');
  if (!FATTI_SUI_FILE.includes(grezza.fatto)) return no('criterion-file-fact-unknown');
  const cerca = grezza.fatto === 'contiene' || grezza.fatto === 'non-contiene';
  if (!cerca) return Object.hasOwn(grezza, 'testo') ? no('criterion-file-text-not-allowed') : { ok: true, verifica: { tipo: 'file', percorso, fatto: grezza.fatto } };
  if (typeof grezza.testo !== 'string' || grezza.testo === '' || lunghezza(grezza.testo) > TESTO_CERCATO_MASSIMO
    || !grezza.testo.isWellFormed() || grezza.testo.includes('\u0000')) return no('criterion-file-text-invalid');
  return { ok: true, verifica: { tipo: 'file', percorso, fatto: grezza.fatto, testo: grezza.testo } }; // il testo cercato NON si taglia ai bordi: gli spazi contano
}

/**
 * Da un elenco di criteri com'è arrivato (dal modello, dalla persona) al contratto in forma, con la sua impronta.
 * ⛔ Un criterio storto rifiuta TUTTO, e il rifiuto dice quale (`posizione`, da 1) e perché.
 * I criteri senza `id` ne ricevono uno (`c1`, `c2`…, il primo libero); un `id` dato si tiene: è ciò che lega un criterio alla
 * sua storia quando il contratto cambia.
 * @param {{ criteri: unknown }} grezzo
 * @returns {{ok:true, contratto:{schema:string, criteri:Array<object>, impronta:string}}|{ok:false, motivo:string, posizione?:number, operatore?:string}}
 */
export function nuovoContratto(grezzo, { prima = null } = {}) {
  const elenco = grezzo && typeof grezzo === 'object' && !Array.isArray(grezzo) ? grezzo.criteri : null;
  if (!Array.isArray(elenco) || elenco.length === 0) return no('contract-empty');
  if (elenco.length > CRITERI_MASSIMI) return no('contract-too-many-criteria');
  const usati = new Set();
  for (const [indice, criterio] of elenco.entries()) {
    if (criterio && typeof criterio === 'object' && Object.hasOwn(criterio, 'id')) {
      if (typeof criterio.id !== 'string' || !FORMA_DELL_ID.test(criterio.id)) return no('criterion-id-invalid', { posizione: indice + 1 });
      if (usati.has(criterio.id)) return no('criterion-id-duplicate', { posizione: indice + 1 });
      usati.add(criterio.id);
    }
  }
  /* ⛔ REV-GOAL-04: gli id non si riusano MAI. Il primo libero parte da ciò che il contratto di prima ha già dato (anche a un
     criterio poi tolto), non dal primo buco della lista nuova: «togli c2, aggiungi X» deve dire «c2 tolto, c4 aggiunto», e X
     non eredita la storia di c2. */
  let prossimo = primoLibero(prima); // senza un contratto di prima: il primo buco, come sempre (nessuna storia da ereditare)
  const precedenti = new Map((prima?.criteri ?? []).map((criterio) => [criterio.id, criterio]));
  const criteri = [];
  for (const [indice, criterio] of elenco.entries()) {
    const posizione = indice + 1;
    if (!criterio || typeof criterio !== 'object' || Array.isArray(criterio)) return no('criterion-invalid', { posizione });
    const testo = testoPulito(criterio.testo, TESTO_CRITERIO_MASSIMO);
    if (testo === null) return no('criterion-text-invalid', { posizione });
    const esito = verificaNormale(criterio.verifica);
    if (!esito.ok) return { ...esito, posizione };
    let id = criterio.id;
    if (id === undefined) {
      while (usati.has(`c${prossimo}`)) prossimo += 1;
      if (prossimo > ID_MASSIMO) return no('contract-too-many-criteria');
      id = `c${prossimo}`;
      usati.add(id);
      prossimo += 1;
    }
    const nuovo = { id, testo, verifica: esito.verifica };
    /* REV-GOAL-03: un criterio tenuto com'era (stessi campi noti) resta l'oggetto di prima, coi campi che questa versione non
       conosce; ciò che arriva dalla persona o dal modello entra coi soli campi noti. */
    const vecchio = precedenti.get(id);
    criteri.push(vecchio && canonicalHash(noti(vecchio)) === canonicalHash(nuovo) ? vecchio : nuovo);
  }
  const prossimoId = Math.max(prossimo, primoLibero(prima), ...criteri.map((criterio) => numeroDellId(criterio.id) + 1));
  return { ok: true, contratto: { schema: SCHEMA_CONTRATTO, criteri, impronta: improntaDeiCriteri(criteri, prossimoId), prossimoId } };
}

/** L'impronta di ciò che il contratto CHIEDE: cambia se e solo se cambia un criterio, il suo ordine o la sua verifica.
 *  Sui criteri COME SONO SCRITTI (anche i campi di una versione più nuova): è il sigillo di ciò che è sul giornale. */
function improntaDeiCriteri(criteri, prossimoId) {
  /* REV2-GOAL-06: il contatore degli id sta nel sigillo (un contratto di prima, senza contatore, ha l'impronta di sempre): un
     `prossimoId` ritoccato a mano non è più «valido» e non può far rispondere «troppi criteri» a un contratto di due. */
  return canonicalHash({ schema: SCHEMA_CONTRATTO, criteri, ...(prossimoId === undefined ? {} : { prossimoId }) });
}

/**
 * Se un contratto letto (dal giornale) è quello che dice di essere: la forma dei campi noti, e l'impronta che torna.
 * ⛔ Un contratto con l'impronta che non torna è stato cambiato senza passare di qui: non vale.
 */
export function contrattoValido(valore) {
  if (!valore || typeof valore !== 'object' || Array.isArray(valore) || valore.schema !== SCHEMA_CONTRATTO) return false;
  if (!Array.isArray(valore.criteri) || valore.criteri.some((criterio) => !criterio || typeof criterio !== 'object' || Array.isArray(criterio))) return false;
  // REV-GOAL-03: la forma si controlla sui soli campi noti; l'impronta sigilla i criteri come sono scritti
  const rifatto = nuovoContratto({ criteri: valore.criteri }); // `nuovoContratto` legge i soli campi noti
  if (!rifatto.ok || valore.impronta !== improntaDeiCriteri(valore.criteri, valore.prossimoId)) return false;
  if (rifatto.contratto.criteri.some((criterio, indice) => canonicalHash(criterio) !== canonicalHash(notiConVerifica(valore.criteri[indice], criterio)))) return false;
  // REV-GOAL-04: il contatore, se c'è, non può tornare indietro rispetto agli id che il contratto porta
  return !Object.hasOwn(valore, 'prossimoId') || (Number.isSafeInteger(valore.prossimoId)
    && valore.prossimoId > Math.max(0, ...valore.criteri.map((criterio) => numeroDellId(criterio.id))) && valore.prossimoId <= ID_MASSIMO + 1);
}
/** I campi noti di un criterio letto, con la sua `verifica` ridotta alle chiavi che questa versione conosce (quelle del rifatto). */
function notiConVerifica(letto, rifatto) {
  const verifica = letto.verifica && typeof letto.verifica === 'object' ? Object.fromEntries(Object.keys(rifatto.verifica).map((chiave) => [chiave, letto.verifica[chiave]])) : letto.verifica;
  return { id: letto.id, testo: letto.testo, verifica };
}

/**
 * Che cosa cambia fra il contratto di prima e quello di dopo, criterio per criterio (per `id`).
 * Aggiungere un criterio chiede DI PIÙ: è libero. Toglierne uno o cambiarlo ridefinisce il successo: vuole un atto esplicito
 * della persona (`serveConferma`). ⛔ «Cambiato» non prova a capire se è più stretto o più largo: un comando diverso può
 * essere tutte e due le cose, e nel dubbio decide la persona.
 * @returns {{ aggiunti:string[], tolti:string[], cambiati:string[], serveConferma:boolean, uguale:boolean }}
 */
export function confrontaContratti(prima, dopo) {
  // REV-GOAL-03: un campo che questa versione non conosce non è un cambio che la persona possa vedere o confermare
  const prime = new Map((prima?.criteri ?? []).map((criterio) => [criterio.id, canonicalHash(noti(criterio))]));
  const dopi = new Map((dopo?.criteri ?? []).map((criterio) => [criterio.id, canonicalHash(noti(criterio))]));
  const aggiunti = [...dopi.keys()].filter((id) => !prime.has(id));
  const tolti = [...prime.keys()].filter((id) => !dopi.has(id));
  const cambiati = [...dopi.keys()].filter((id) => prime.has(id) && prime.get(id) !== dopi.get(id));
  return {
    aggiunti, tolti, cambiati,
    serveConferma: tolti.length > 0 || cambiati.length > 0,
    uguale: (prima?.impronta ?? null) === (dopo?.impronta ?? null),
  };
}

/**
 * Il contratto con dei criteri IN PIÙ, in coda: quelli di prima restano come sono, con i loro `id`.
 * @returns {{ok:true, contratto:object}|{ok:false, motivo:string, posizione?:number}} `posizione` conta fra i NUOVI, da 1
 */
export function aggiungiCriteri(contratto, nuovi) {
  if (!Array.isArray(nuovi) || nuovi.length === 0) return no('contract-empty');
  if (nuovi.some((criterio) => criterio && typeof criterio === 'object' && Object.hasOwn(criterio, 'id'))) return no('criterion-id-not-allowed');
  const esito = nuovoContratto({ criteri: [...contratto.criteri, ...nuovi] }, { prima: contratto });
  if (!esito.ok) return Number.isSafeInteger(esito.posizione) ? { ...esito, posizione: esito.posizione - contratto.criteri.length } : esito;
  return esito;
}
