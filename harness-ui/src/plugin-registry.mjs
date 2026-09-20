/**
 * plugin-registry.mjs — FASE G del piano `elegant-spinning-dongarra.md`
 * (29/8): un plugin dichiara hook e/o tool locali in UN manifesto,
 * dentro il workspace — `.harness-ui-plugins/<nome>/plugin.json`,
 * stessa convenzione di hook/MCP/skill.
 *
 * ⛔⛔⛔ Ricerca fatta PRIMA di scrivere (vedi il piano madre, FASE G):
 * un approccio marketplace-centrico (verificato empiricamente altrove)
 * è una scelta deliberatamente NON seguita qui, per coerenza con
 * hook/MCP/skill (tutte per-workspace, mai un registro esterno). Un
 * altro approccio noto fa una scansione statica pre-attivazione, ma la
 * sua stessa documentazione di sicurezza ammette che uno scanner di
 * pattern non costituisce un vero confine — è un avviso, non un
 * blocco. Questo file segue la stessa distinzione: `scansionaPatternSospetti`
 * produce AVVISI, mai un blocco automatico — il confine vero resta il
 * trust hash-vincolato, identico a hook-registry.mjs/mcp-registry.mjs.
 *
 * ⛔⛔ Hash su TUTTO il manifesto, non per componente (a differenza dei
 * server MCP, dove ogni server ha il proprio trust): un plugin è
 * un'unità, cambiare una riga di `plugin.json` invalida l'intero
 * plugin, mai un aggiornamento parziale sotto un trust vecchio.
 *
 * ⛔⛔⛔ CLI-REQ-02 (17/09/2026) — E L'UNITÀ È IL PACCHETTO, NON IL MANIFESTO. Il paragrafo qui
 * sopra restava vero e insufficiente: il manifesto non fa niente, quello che gira è il file che
 * il manifesto NOMINA (`plugin-session.mjs:76-100`, `eseguiComandoPlugin`), e quel file non
 * entrava nell'impronta. Un plugin approvato una volta continuava a girare dopo che il suo codice
 * era stato sostituito — un `git pull`, un cambio di ramo, il commit di un altro — senza che
 * nessuno riapprovasse niente. Misurato dalla corsia della CLI il 17/09/2026 ESEGUENDO il codice
 * su questi stessi due file: dopo lo scambio di `run.js` l'hash ricalcolato era byte per byte
 * identico e `verificaTrustPlugin` rispondeva `true`. Riprodotto qui in
 * `tests/plugin-trust-intero-pacchetto.test.mjs` prima della cura.
 * ⇒ Adesso `hash` è l'impronta di TUTTI i file del pacchetto: la fiducia copre ciò che il plugin
 * esegue, non solo ciò che dichiara.
 */
import { createHash } from 'node:crypto';
import { createReadStream, promises as fsp } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { EVENTI_VALIDI } from './hook-registry.mjs';
import { parseProcessCommand } from './process-policy.mjs';

export class PluginRegistryError extends Error {
  constructor(message, code = 'PLUGIN_INVALID') {
    super(message);
    this.name = 'PluginRegistryError';
    this.code = code;
  }
}

const NOME_CARTELLA_PLUGIN = '.harness-ui-plugins';
const NOME_FILE_MANIFESTO = 'plugin.json';

/**
 * ⛔ CLI-REQ-02 — il tetto sul numero di file di UN pacchetto, e fallisce CHIUSO.
 *
 * Senza tetto, un pacchetto che si porta dentro `node_modules` trasformerebbe il controllo della
 * fiducia in uno stallo a ogni avvio di sessione (`agent-service.mjs:700`) e a ogni apertura del
 * pannello. Troncare la camminata invece di rifiutarla riaprirebbe lo stesso buco più in fondo,
 * quindi il tetto RIFIUTA: `PLUGIN_PACKAGE_TOO_LARGE`, mai un'impronta parziale.
 *
 * Il numero è lo stesso della corsia della CLI, perché i due archivi di fiducia devono rifiutare
 * le stesse cose. ⛔ Citazione precisa, perché nel primo giro era approssimativa: la costante si
 * chiama `PLUGIN_PACKAGE_MAX_FILES` e sta in `cli/src/security/project-resource-inventory.ts`,
 * letta al commit `154a7296` con `git show` — NON nel loro documento di consegna, che parla di
 * «10,000 files» e del codice `RESOURCE_PACKAGE_TOO_LARGE` senza nominare la costante.
 * Nel commento di quel file, e solo lì, stanno anche i numeri di prestazione: su Windows 11 e
 * Node 24.18 con cache calda, ~98 ms di camminata più ~370 ms di impronta per 10.000 file a
 * concorrenza 32, e una morte per EMFILE senza il limite di concorrenza.
 * ⛔ Quei numeri sono LORO, non rimisurati qui.
 */
export const MAX_FILE_PACCHETTO_PLUGIN = 10_000;

/** Quanti file si leggono in parallelo. Stesso valore della CLI, per la stessa ragione (EMFILE). */
const CONCORRENZA_IMPRONTA = 32;

/**
 * ⛔ CLI-REQ-02 — la versione dello SCHEMA scritto nell'archivio di fiducia.
 *
 * Serve a distinguere due cose che senza di lei sono indistinguibili, e che vogliono due frasi
 * diverse a schermo: «questo plugin non l'hai mai approvato / il suo contenuto è cambiato» e
 * «questo plugin l'avevi approvato con la regola vecchia, che guardava solo il manifesto».
 * Senza il marcatore, il costo accettato di questa richiesta — ogni approvazione esistente
 * decade — arriverebbe alla persona con l'aspetto esatto di una manomissione.
 */
export const SCHEMA_TRUST_PLUGIN = 2;

/**
 * ⭐ Pura, nessun blocco — un array di stringhe-avviso, vuoto se nulla
 * sembra sospetto. Pattern letterali OVVI, non un tentativo di
 * copertura esaustiva (stesso principio anti-denylist del resto del
 * progetto: questo NON sostituisce il trust, lo accompagna). Un
 * comando che non matcha nessun pattern non è "sicuro" — è solo
 * "niente di ovvio trovato", distinzione dichiarata a chi legge gli
 * avvisi, non solo a chi legge questo commento.
 */
export function scansionaPatternSospetti(comando) {
  const testo = String(comando ?? '');
  const avvisi = [];
  if (/\brm\s+-rf\s+\/(?:\s|$)/.test(testo) || /\bdel\s+\/[sq]\b/i.test(testo)) {
    avvisi.push('cancellazione ricorsiva di una radice del filesystem');
  }
  if (/curl\s[^|]*\|\s*(sh|bash)\b/.test(testo) || /wget\s[^|]*\|\s*(sh|bash)\b/.test(testo)) {
    avvisi.push('scarica ed esegue uno script remoto in un solo passo (curl/wget | sh)');
  }
  if (/\b[A-Z_]*(API_KEY|SECRET|TOKEN|PASSWORD)\b/.test(testo) && /\b(curl|wget|nc\s|ncat)\b/.test(testo)) {
    avvisi.push('legge una credenziale e la manda in rete nello stesso comando');
  }
  if (/\bnc\s+-[a-z]*e\b|\/dev\/tcp\//.test(testo)) {
    avvisi.push('pattern di reverse shell (nc -e / /dev/tcp)');
  }
  return avvisi;
}

/**
 * ⛔⛔⛔ CLI-REQ-02 — l'elenco dei file di UN pacchetto, ordinato e senza collegamenti.
 *
 * ⛔ Ogni collegamento è RIFIUTATO, mai seguito e mai saltato: sono la stessa falla vista dai due
 * lati. Seguirlo lascerebbe la camminata uscire dal pacchetto e mettere nell'impronta file che il
 * pacchetto non contiene; saltarlo lascerebbe FUORI dall'impronta un file che il plugin può
 * caricare lo stesso. Nessuna delle due si tollera.
 *
 * ⛔ Su Windows conta la GIUNZIONE, non solo il symlink POSIX. MISURATO su questa macchina
 * (Windows 11, Node v24.18.0, 17/09/2026): una giunzione creata con
 * `symlink(bersaglio, percorso, 'junction')` viene vista da `readdir(withFileTypes)` come
 * `isSymbolicLink() === true` e `isDirectory() === false` — libuv riporta entrambi i tipi di punto
 * di re-parse come `UV_DIRENT_LINK` (nodejs/node#12737, nodejs/node#30646, letti il 17/09/2026).
 * ⇒ `isSymbolicLink()` copre le giunzioni, e la sonda lo conferma invece di dedurlo. Nella stessa
 * misura un symlink vero ('dir'/'file') è fallito con EPERM senza privilegi: la giunzione è
 * proprio la forma che un utente qualunque riesce a creare qui.
 *
 * Una voce che non è né file, né cartella, né collegamento (una pipe, un socket) si salta: non è
 * codice che un plugin possa caricare, e non ha un contenuto stabile da imprimere.
 *
 * ⛔ Residuo dichiarato: se `.harness-ui-plugins/` STESSA fosse una giunzione, questa funzione
 * imprimerebbe comunque per intero i pacchetti che ci sono dentro — cambia da dove vengono, non
 * che cosa copre la fiducia. La CLI rifiuta anche quel caso; qui costerebbe una `lstat` in più su
 * una strada che non passa dalle dipendenze iniettabili, e non è ciò che questa richiesta chiede.
 */
async function elencaFileDelPacchetto(radice, { readdirFn, maxFile }) {
  const percorsi = [];
  async function scendi(cartella) {
    for (const voce of await readdirFn(cartella, { withFileTypes: true })) {
      const percorso = join(cartella, voce.name);
      if (voce.isSymbolicLink()) {
        throw new PluginRegistryError(
          `Il pacchetto del plugin contiene un collegamento (${voce.name}): un collegamento porterebbe la fiducia fuori dal pacchetto`,
          'PLUGIN_PACKAGE_SYMLINK_UNSUPPORTED',
        );
      }
      if (voce.isDirectory()) { await scendi(percorso); continue; }
      if (!voce.isFile()) continue;
      if (percorsi.length >= maxFile) {
        throw new PluginRegistryError(
          `Il pacchetto del plugin supera ${maxFile} file: la fiducia non può coprirlo`,
          'PLUGIN_PACKAGE_TOO_LARGE',
        );
      }
      percorsi.push(percorso);
    }
  }
  await scendi(radice);
  /*
   * ⛔ Percorsi RELATIVI alla radice del pacchetto e con `/`, così due copie identiche in due
   * cartelle danno la stessa impronta (è il criterio già provato in
   * `plugin-registry.test.mjs:75-89`) e Windows non ordina diversamente da POSIX — `/` (0x2F) e
   * `\` (0x5C) si ordinano fra loro in modo diverso. ⛔ Confronto per unità di codice, MAI
   * `localeCompare`: quello dipende dalla lingua della macchina, e un'impronta che cambia con la
   * lingua non è un'impronta.
   */
  return percorsi
    .map((percorso) => ({ percorso, relativo: relative(radice, percorso).split(sep).join('/') }))
    .sort((a, b) => (a.relativo < b.relativo ? -1 : a.relativo > b.relativo ? 1 : 0));
}

/**
 * ⛔⛔⛔ A4 del secondo giro — L'IMPRONTA DI UN FILE SI CALCOLA A FLUSSO.
 *
 * La prima versione leggeva ogni file INTERO con `readFile` e teneva tutti i Buffer vivi insieme
 * per poterli ripiegare in ordine. Il revisore l'ha misurato: **RSS da 134 a 786 MB** con 12 file
 * da 64 MB. Non era un caso di laboratorio — un pacchetto che si porta dentro un modello, un
 * archivio o un video ci arriva da solo.
 *
 * ⛔ Ricerca prima di scrivere, 17/09/2026: lo stato dell'arte per l'impronta di file grandi in
 * Node è `createReadStream` + `hash.update(pezzo)` a pezzi, MAI `readFile`, proprio perché la
 * memoria non deve crescere con la dimensione del file (nodejs.org/api/crypto.html; guida
 * «Generating checksum hashes in node.js», wellingguzman.com/notes/node-checksum). ⇒ Qui la
 * memoria è limitata dal PEZZO, non dal file: di ogni file resta solo il suo digest, 32 byte.
 *
 * ⛔ I tetti di byte restano, e servono a un'altra cosa: il TEMPO. Con il flusso la memoria è già
 * al sicuro, ma imprimere gigabyte a ogni avvio di sessione (`agent-service.mjs:701`) e a ogni
 * apertura del pannello resterebbe uno stallo. Falliscono CHIUSI, come il tetto sui file: mai
 * un'impronta parziale.
 */
export const MAX_BYTE_FILE_PLUGIN = 32 * 1024 * 1024;
export const MAX_BYTE_PACCHETTO_PLUGIN = 128 * 1024 * 1024;

/** L'impronta di UN file, senza mai tenerlo intero in memoria. */
async function improntaDelFile(percorso, { flussoFn, maxBytePerFile, restanti }) {
  const digest = createHash('sha256');
  let letti = 0;
  const flusso = flussoFn(percorso);
  try {
    for await (const pezzo of flusso) {
      letti += pezzo.length;
      if (letti > maxBytePerFile) {
        throw new PluginRegistryError(
          `Un file del pacchetto supera ${maxBytePerFile} byte: la fiducia non può coprirlo`,
          'PLUGIN_PACKAGE_FILE_TOO_LARGE',
        );
      }
      if (restanti.scala(pezzo.length) < 0) {
        throw new PluginRegistryError(
          `Il pacchetto del plugin supera ${restanti.tetto} byte in totale: la fiducia non può coprirlo`,
          'PLUGIN_PACKAGE_BYTES_TOO_LARGE',
        );
      }
      digest.update(pezzo);
    }
  } finally {
    /* ⛔ Un flusso abbandonato a metà tiene aperto un descrittore: si chiude sempre, anche sul rifiuto. */
    flusso.destroy?.();
  }
  return digest.digest('hex');
}

/** Le impronte dei file, al massimo `CONCORRENZA_IMPRONTA` flussi aperti insieme (guardia EMFILE). */
async function improntePerFile(voci, opzioni) {
  const impronte = new Array(voci.length);
  let cursore = 0;
  await Promise.all(Array.from({ length: Math.min(CONCORRENZA_IMPRONTA, voci.length) }, async () => {
    for (;;) {
      const indice = cursore++;
      if (indice >= voci.length) return;
      impronte[indice] = await improntaDelFile(voci[indice].percorso, opzioni);
    }
  }));
  return impronte;
}

/**
 * ⛔ L'impronta del pacchetto: `sha256` su, per ogni file nell'ordine sopra,
 * `percorsoRelativo + '\0' + sha256(byte) + '\n'`.
 *
 * ⛔⛔ IL NOME ENTRA NELL'IMPRONTA QUANTO IL CONTENUTO, e nel primo giro nessuna prova lo
 * copriva: il revisore ha tolto `voce.relativo` dal digest e **372 prove su 372 sono rimaste
 * verdi**. Senza il nome, rinominare il file che il manifesto esegue — o scambiare fra loro due
 * file del pacchetto — non cambierebbe niente. Adesso c'è una prova che rinomina `run.js` in
 * `run2.js` a contenuto identico e pretende un'impronta diversa.
 *
 * Il prefisso di dominio `talos-plugin-package-v2` fa due cose: dice a chi legge di che schema è
 * quell'esadecimale, e garantisce che un'impronta nuova non possa MAI coincidere con una vecchia
 * (quelle erano `sha256` del solo testo del manifesto). La forma è la stessa che la corsia della
 * CLI usa per ogni risorsa (`fingerprintExecutableResource` in `cli/src/security/project-trust.ts`
 * a `154a7296`, letto lì e non nel loro handoff, prefisso `talos-executable-resource-v1`); lì
 * l'archivio tiene una voce per file, qui una stringa opaca per plugin, perché è la forma che
 * `verificaTrustPlugin`/`fidaPlugin` già portano — la COPERTURA è la stessa, che è ciò che i due
 * archivi dovevano mettere d'accordo.
 *
 * ⛔ Due cose che NON entrano nell'impronta, misurate e dichiarate invece che scoperte dopo:
 *   · una cartella VUOTA (la camminata imprime i file, non le cartelle);
 *   · un FLUSSO ALTERNATIVO NTFS (`file:flusso`), che `readdir` non enumera.
 *   Nessuna delle due è sfruttabile da qui — una cartella vuota non è codice, e l'unico
 *   eseguibile consentito è `node`, che non carica un flusso alternativo come modulo — ma il
 *   limite si scrive, perché quello che non è scritto non è stato deciso.
 */
function ripiegaImpronte(voci, impronte) {
  const digest = createHash('sha256').update('talos-plugin-package-v2\0');
  voci.forEach((voce, indice) => {
    digest.update(voce.relativo).update('\0').update(impronte[indice]).update('\n');
  });
  return digest.digest('hex');
}

/**
 * ⭐⭐⭐ L'impronta di UN pacchetto, dal disco. Esportata perché serve DUE volte: al caricamento,
 * e di nuovo al momento dell'USO (A2, vedi `agent-service.mjs`).
 */
export async function improntaPacchettoPlugin({ cartella, pluginId }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const maxFile = deps.maxFilePacchetto ?? MAX_FILE_PACCHETTO_PLUGIN;
  const radice = join(cartella, NOME_CARTELLA_PLUGIN, pluginId);
  return improntaDelleVoci(await elencaFileDelPacchetto(radice, { readdirFn, maxFile }), deps);
}

/** La stessa impronta, quando la camminata è già stata fatta (il caricamento la riusa). */
async function improntaDelleVoci(voci, deps = {}) {
  const flussoFn = deps.flussoFn ?? ((percorso) => createReadStream(percorso));
  const maxBytePerFile = deps.maxBytePerFile ?? MAX_BYTE_FILE_PLUGIN;
  const tetto = deps.maxBytePacchetto ?? MAX_BYTE_PACCHETTO_PLUGIN;
  let rimasti = tetto;
  const restanti = { tetto, scala: (n) => (rimasti -= n) };
  return ripiegaImpronte(voci, await improntePerFile(voci, { flussoFn, maxBytePerFile, restanti }));
}

/*
 * ⛔⛔⛔ A1 del secondo giro — IL FILE CHE IL PLUGIN ESEGUE PUÒ STARE FUORI DAL PACCHETTO.
 *
 * L'impronta sull'intero pacchetto era giusta e INSUFFICIENTE. `eseguiComandoPlugin`
 * (`plugin-session.mjs:89`) esegue con il WORKSPACE come cartella di lavoro, quindi un manifesto
 * che dichiara `node strumenti/aiuto.js` fa girare un file che nel pacchetto non c'è e quindi
 * nell'impronta nemmeno. RIPRODOTTO sul codice del primo giro, eseguendolo:
 *   impronta identica dopo lo scambio: true · ancora fidato: true
 *   prima: "aiuto-BUONO, approvato" · dopo: "aiuto-CATTIVO, mai approvato"
 * Vale uguale per gli HOOK, che passano da `hook-registry.mjs` con lo stesso `cwd`.
 * ⛔ La corsia della CLI l'aveva scritto nel suo handoff, sotto «Risk of the change», e io non
 * l'ho riportato: il commit del primo giro affermava il contrario. Questa è la correzione.
 *
 * ⛔ Ricerca prima di scrivere, 17/09/2026: il modo giusto di legare un punto d'ingresso alla sua
 * cartella è canonicalizzare e poi verificare il CONTENIMENTO con `path.relative` sul percorso
 * normalizzato, non con un confronto di prefisso (che confonde `/pkg` con `/pkg-cattivo`) né con
 * un controllo di sola estensione (che `../` scavalca) — OpenHands/software-agent-sdk #5101
 * «enforce package path containment in plugin formats», WindWang2/exp-rs #756 «Manifest entrypoint
 * escapes the plugin directory». Le stesse fonti dicono di fare il controllo DUE volte, alla
 * validazione e all'uso: la seconda metà è A2.
 *
 * ⇒ Qui: ogni argomento del comando che ha forma di percorso si risolve — prima contro il
 *   PACCHETTO, poi contro il workspace — e deve cadere DENTRO il pacchetto. Il comando si
 *   riscrive con quel percorso assoluto, così la cartella di lavoro non decide più QUALE file
 *   gira. Un comando che nomina un file fuori è RIFIUTATO al caricamento.
 *
 * ⛔ Cosa resta fuori PER NATURA, e non si addolcisce: un `require('../../x.js')` scritto DENTRO
 *   un file del pacchetto carica un file che l'impronta non copre, e nessun controllo sugli
 *   argomenti lo vede. Lo stesso vale per un interprete che carica altro per conto suo
 *   (`NODE_OPTIONS`, un file di configurazione fuori, un modulo nativo). ⇒ La fiducia copre CIÒ
 *   CHE IL MANIFESTO NOMINA e il contenuto del pacchetto, non la chiusura transitiva di ciò che
 *   quel codice decide di caricare a runtime. Chiuderla vorrebbe dire eseguire in un contenitore,
 *   che è un'altra decisione e non questa riga.
 */
const ESTENSIONI_CON_FORMA_DI_FILE = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.json', '.py', '.rb', '.pl',
  '.sh', '.bash', '.bat', '.cmd', '.ps1', '.jar', '.exe', '.wasm',
]);


/** Ha forma di percorso: contiene un separatore, oppure finisce con un'estensione da file. */
function haFormaDiPercorso(argomento) {
  if (argomento.includes('/') || argomento.includes('\\')) return true;
  const punto = argomento.lastIndexOf('.');
  return punto > 0 && ESTENSIONI_CON_FORMA_DI_FILE.has(argomento.slice(punto).toLowerCase());
}

/**
 * Il percorso assoluto dentro il pacchetto, o `null` se esce.
 *
 * ⛔ Contenimento con `relative`, non con un confronto di prefisso: `startsWith(radice)` direbbe
 *   di sì anche per una cartella sorella che comincia allo stesso modo.
 *
 * ⛔⛔ E il contenimento DA SOLO non basta: scrivendo la prova ho misurato che
 *   `node strumenti/aiuto.js` passava, perché risolto contro il pacchetto dà
 *   `<pacchetto>/strumenti/aiuto.js`, che è «dentro» — solo che lì non c'è niente, e a valle
 *   sarebbe stato il workspace a fornire il file vero. ⇒ Il percorso deve essere UNO DEI FILE
 *   CHE L'IMPRONTA HA APPENA COPERTO: `fileDelPacchetto` è l'insieme della camminata. Così
 *   «contenuto» e «coperto dalla fiducia» diventano la stessa cosa invece di due cose che si
 *   somigliano.
 *
 * Due basi, in ordine: prima il PACCHETTO (la forma corta, `run.js`), poi il workspace (la forma
 * lunga che i manifesti usano oggi, `.harness-ui-plugins/demo/run.js`). Vince la prima che cade
 * su un file davvero presente nel pacchetto.
 */
function dentroIlPacchetto(argomento, { radicePacchetto, radiceWorkspace, fileDelPacchetto }) {
  for (const base of [radicePacchetto, radiceWorkspace]) {
    const assoluto = resolve(base, argomento);
    const rel = relative(radicePacchetto, assoluto);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) continue;
    if (fileDelPacchetto.has(rel.split(sep).join('/'))) return assoluto;
  }
  return null;
}

/**
 * Riscrive il comando dichiarato in modo che ogni percorso sia ASSOLUTO e dentro il pacchetto.
 * Lancia un `PluginRegistryError` con una frase umana se qualcosa esce, o se il comando non si può
 * riscrivere senza cambiarne il significato.
 */
/*
 * ⛔⛔⛔⛔ A-1, TERZO TENTATIVO (17/09/2026) — LA DENYLIST NON SI CHIUDE MAI, E SI CAMBIA FORMA.
 *
 * Il giro scorso avevo messo un elenco di opzioni VIETATE. Il terzo controllo l'ha bucato in sei
 * modi, tutti misurati sul codice di allora:
 *     node -pe "require(process.cwd()+String.fromCharCode(47,…))"   PASSAVA (forma UNITA `-pe`)
 *     node --run build          PASSAVA (esegue una riga di package.json che il cancello non legge)
 *     node -                    PASSAVA (il programma legge lo script da stdin)
 *     node --input-type=module -PASSAVA
 *     node --inspect-brk run.js PASSAVA
 *     deno eval "1"             PASSAVA (un SOTTOCOMANDO non comincia per `-`)
 *     node                      PASSAVA (da solo: REPL)
 *   ⇒ Ogni buco tappato ne lascia uno che non ho pensato. Una denylist sulle opzioni di un
 *     interprete è una gara che si perde per costruzione: gli interpreti aggiungono modi di
 *     eseguire, noi no.
 *
 * ⇒ DECISIONE (coordinatore, 17/09): si passa a una GRAMMATICA AMMESSA, stretta e dichiarata.
 *   Tutto ciò che non è esattamente una di queste forme è RIFIUTATO:
 *
 *       echo <qualunque cosa>
 *       node <file coperto dall'impronta> [argomenti dello script…]
 *       <file coperto dall'impronta> [argomenti dello script…]
 *
 *   ⛔ NESSUNA opzione dell'interprete è ammessa, nemmeno quelle innocue come `--inspect-brk`:
 *     qualunque pezzo che cominci con `-` (o con `/`, che su Windows è una opzione) PRIMA del file
 *     fa rifiutare. Il giorno in cui una servisse davvero si aggiunge PER NOME a un elenco
 *     ammesso, con la sua prova — cioè si paga una decisione, invece di lasciare una porta.
 *   ⛔ Gli argomenti DOPO il file sono argomenti dello SCRIPT, non di Node: restano ammessi, con
 *     la regola di sempre (se hanno forma di percorso devono cadere su un file coperto).
 *   ⛔ Un programma che non è `node`/`echo` e non è un file coperto è RIFIUTATO anche se un domani
 *     `allowedExecutables` di `process-policy` si allargasse: questo cancello non deve dipendere
 *     da quel parametro, che è iniettabile.
 *
 * ⛔ DOVE NON ARRIVA, detto invece che lasciato credere: questo è il cancello del CARICAMENTO dei
 *   plugin. `eseguiComandoPlugin` resta generico (le sue prove usano `node -e` apposta) e gli hook
 *   STANDALONE di `.harness-ui-hooks.json` non passano di qui: per loro `node -e` è ancora
 *   ammesso. È un'altra riga, non questa.
 */
/**
 * ⛔⛔⛔ A-3, SECONDA STESURA (17/09/2026) — UNA SOLA GRAMMATICA PER L'ID, USATA DAI DUE LATI.
 *
 * La prima cura rifiutava al caricamento solo gli id con `__`, ma chi RILEGGE l'id dal nome
 * esposto pretendeva di più: la sua espressione escludeva anche gli id che cominciano con `_`.
 * ⇒ Un plugin `_sano` si caricava, veniva offerto come `plugin___sano__ping`, e ogni chiamata
 *   rispondeva «non riconosco a quale plugin appartiene». Caricato e inutilizzabile, per sempre,
 *   senza che nessuno lo dicesse. MISURATO dal terzo controllo e riprodotto qui prima di curare.
 *   ⛔ È lo stesso difetto di sempre in forma nuova: due verità sulla stessa cosa, in due posti,
 *   che divergono. Adesso la verità è UNA e sta qui.
 *
 * Un id è utilizzabile se non è vuoto, non comincia per `_`, non contiene `__` e non è un
 * percorso. `__` renderebbe ambiguo il taglio del nome esposto; `_` iniziale creerebbe `plugin___`,
 * cioè tre trattini bassi di fila, dove il taglio non sa più dove finisce il prefisso.
 */
export function idPluginValido(pluginId) {
  return typeof pluginId === 'string'
    && pluginId.length > 0
    && !pluginId.startsWith('_')
    && !pluginId.includes('__')
    && !/[\\/]|\.\./.test(pluginId);
}

const PROGRAMMI_NUDI_AMMESSI = new Set(['node', 'node.exe', 'echo', 'echo.exe']);

/** Un pezzo che il sistema leggerebbe come OPZIONE, non come nome di file. */
function haFormaDiOpzione(pezzo) {
  return pezzo === '-' || pezzo.startsWith('-') || /^\/[A-Za-z?]$/.test(pezzo);
}

export function comandoDentroIlPacchetto(comando, { radicePacchetto, radiceWorkspace, fileDelPacchetto, dove }) {
  let pezzi;
  try {
    pezzi = parseProcessCommand(comando);
  } catch (errore) {
    throw new PluginRegistryError(
      `${dove}: il comando non è eseguibile così com'è scritto (${errore.code ?? 'non valido'})`,
      'PLUGIN_COMANDO_NON_LEGGIBILE',
    );
  }
  if (pezzi.length === 0) {
    throw new PluginRegistryError(`${dove}: il comando è vuoto`, 'PLUGIN_COMANDO_NON_LEGGIBILE');
  }

  const rifiutaCodice = (pezzo) => {
    throw new PluginRegistryError(
      `${dove}: «${pezzo}» non è un file del plugin — il comando può eseguire solo un file della sua cartella`,
      'PLUGIN_COMANDO_ESEGUE_CODICE',
    );
  };

  const citaSeServe = (pezzo) => {
    /*
     * ⛔ A-5: si ri-cita anche senza spazi. `parseProcessCommand` RIFIUTA `& | ; < > ( )` fuori
     *   dalle virgolette, quindi un pezzo citato nel manifesto ma senza spazi — `"a&b"` — tornava
     *   fuori nudo e poi veniva rifiutato all'esecuzione: il plugin si caricava e moriva dopo.
     * ⛔ Un pezzo che va citato ma contiene `"` o `\` non si può riemettere senza cambiarne il
     *   significato (`\` è un escape DENTRO le virgolette): si RIFIUTA invece di indovinare.
     */
    const daCitare = /[\s&|;<>()]/u.test(pezzo);
    if (!daCitare) return pezzo;
    if (/["\\]/u.test(pezzo)) {
      throw new PluginRegistryError(
        `${dove}: il comando contiene un pezzo che non si può riscrivere senza cambiarne il significato`,
        'PLUGIN_COMANDO_NON_LEGGIBILE',
      );
    }
    return `"${pezzo}"`;
  };

  const dentro = (pezzo, comeProgramma) => {
    const assoluto = dentroIlPacchetto(pezzo, { radicePacchetto, radiceWorkspace, fileDelPacchetto });
    if (assoluto === null) {
      /*
       * ⛔ Due rifiuti diversi per due cose diverse, e la differenza si vede nella frase: un pezzo
       *   che HA forma di file ma sta fuori è «fuori dal pacchetto»; un pezzo che non somiglia
       *   nemmeno a un file (un'opzione, un programma che non conosciamo) è «esegue codice».
       *   Confonderli darebbe alla persona una frase che non spiega cosa cambiare.
       */
      if (comeProgramma && !haFormaDiPercorso(pezzo)) rifiutaCodice(pezzo);
      throw new PluginRegistryError(
        `${dove}: il comando nomina «${pezzo}», che non è un file della cartella del plugin`,
        'PLUGIN_COMANDO_FUORI_DAL_PACCHETTO',
      );
    }
    /*
     * ⛔ Sempre con `/`, mai con `\`: un backslash dentro le virgolette sarebbe letto come escape
     *   da `parseProcessCommand`. Node accetta le barre in avanti anche su Windows.
     */
    const conBarre = assoluto.split(sep).join('/');
    if (conBarre.includes('"')) {
      throw new PluginRegistryError(
        `${dove}: il percorso del file contiene una virgoletta e non si può citare`,
        'PLUGIN_COMANDO_NON_LEGGIBILE',
      );
    }
    return citaSeServe(conBarre);
  };

  /** Gli argomenti DELLO SCRIPT: liberi, tranne che un percorso deve cadere su un file coperto. */
  const argomentiDelloScript = (resto) => resto.map((p) => (haFormaDiPercorso(p) ? dentro(p, false) : citaSeServe(p)));

  const programma = pezzi[0];

  /* 1 · `echo …` — resta com'era: non esegue un file, e i suoi argomenti seguono la regola di sempre. */
  if (programma === 'echo' || programma === 'echo.exe') {
    return [citaSeServe(programma), ...argomentiDelloScript(pezzi.slice(1))].join(' ');
  }

  /* 2 · `node <file coperto> …` — nessuna opzione dell'interprete, nemmeno una. */
  if (PROGRAMMI_NUDI_AMMESSI.has(programma)) {
    const script = pezzi[1];
    if (script === undefined) rifiutaCodice(programma);
    if (haFormaDiOpzione(script)) rifiutaCodice(script);
    return [citaSeServe(programma), dentro(script, true), ...argomentiDelloScript(pezzi.slice(2))].join(' ');
  }

  /* 3 · un FILE COPERTO usato come programma (`./run.js`): i suoi argomenti sono suoi. */
  if (haFormaDiOpzione(programma)) rifiutaCodice(programma);
  return [dentro(programma, true), ...argomentiDelloScript(pezzi.slice(1))].join(' ');
}

/** La frase umana di un guasto del pacchetto: mai un codice, mai un percorso di sistema. */
const FRASI_GUASTO_PLUGIN = Object.freeze({
  PLUGIN_COMANDO_FUORI_DAL_PACCHETTO: 'Questo plugin vuole eseguire un file che sta fuori dalla sua cartella. Finché è così non può essere approvato, perché il controllo non potrebbe accorgersi se quel file cambiasse.',
  PLUGIN_COMANDO_ESEGUE_CODICE: 'Questo plugin vuole eseguire istruzioni scritte dentro la sua scheda, invece di un file della sua cartella. Finché è così non può essere approvato, perché il controllo non coprirebbe quello che fa davvero.',
  PLUGIN_ID_AMBIGUO: 'Il nome della cartella di questo plugin contiene «__», e con quel nome non si distingue più a quale plugin appartiene un suo strumento. Rinominala e riprova.',
  PLUGIN_COMANDO_NON_LEGGIBILE: 'Non riesco a capire con certezza quale file eseguirebbe questo plugin, quindi non lo offro.',
  PLUGIN_PACKAGE_SYMLINK_UNSUPPORTED: 'Questo plugin contiene un collegamento a un\'altra cartella. Finché c\'è non può essere approvato, perché il controllo non coprirebbe ciò che sta dall\'altra parte.',
  PLUGIN_PACKAGE_TOO_LARGE: 'Questo plugin contiene troppi file perché il controllo possa coprirli tutti.',
  PLUGIN_PACKAGE_FILE_TOO_LARGE: 'Questo plugin contiene un file troppo grande perché il controllo possa coprirlo.',
  PLUGIN_PACKAGE_BYTES_TOO_LARGE: 'Questo plugin è troppo grande perché il controllo possa coprirlo tutto.',
  PLUGIN_READ_FAILED: 'Non riesco a leggere i file di questo plugin.',
});

export function frasePerGuastoPlugin(codice) {
  return FRASI_GUASTO_PLUGIN[codice] ?? 'Questo plugin non si può offrire in questa sessione.';
}

/**
 * Legge `<cartella>/.harness-ui-plugins/*\/plugin.json`. Un progetto
 * senza plugin dichiarati è uno stato valido — mai un errore, torna
 * `{plugin: [], falliti: []}`.
 *
 * ⛔⛔ Due classi di guasto, e non è una sfumatura.
 *   · Un MANIFESTO malformato ferma ancora l'intero caricamento, come dal primo giorno: è il
 *     contratto documentato («stesso principio di caricaSkill») e le prove lo fissano.
 *   · Un guasto del PACCHETTO — un collegamento, troppi file, troppi byte, un comando che esce
 *     dalla cartella — è guasto di QUEL plugin soltanto, e finisce in `falliti` con la sua frase.
 *
 * ⛔⛔⛔ A3 del secondo giro: prima non era così, e il revisore l'ha misurato. Con una giunzione
 *   dentro `demo/` e un `sano/` perfettamente valido, il risultato era **0 tool offerti e
 *   `falliti: []`** — tutti i plugin spenti, in silenzio, per colpa di uno. Il guasto di un
 *   pacchetto non è un motivo per disarmare gli altri, e soprattutto non è un motivo per non
 *   dirlo: chi ha approvato un plugin e non lo vede più deve poter sapere perché.
 */
export async function caricaPlugin({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const maxFile = deps.maxFilePacchetto ?? MAX_FILE_PACCHETTO_PLUGIN;
  const maxBytePerFile = deps.maxBytePerFile ?? MAX_BYTE_FILE_PLUGIN;
  const maxBytePacchetto = deps.maxBytePacchetto ?? MAX_BYTE_PACCHETTO_PLUGIN;
  const flussoFn = deps.flussoFn ?? ((percorso) => createReadStream(percorso));
  const cartellaPlugin = join(cartella, NOME_CARTELLA_PLUGIN);
  let voci;
  try {
    voci = await readdirFn(cartellaPlugin, { withFileTypes: true });
  } catch (errore) {
    if (errore?.code === 'ENOENT') return { plugin: [], falliti: [] };
    throw new PluginRegistryError(`Impossibile leggere ${NOME_CARTELLA_PLUGIN}: ${errore.message}`, 'PLUGIN_READ_FAILED');
  }
  const plugin = [];
  const falliti = [];
  for (const voce of voci) {
    if (!voce.isDirectory()) continue;
    const pluginId = voce.name;
    const percorso = join(cartellaPlugin, pluginId, NOME_FILE_MANIFESTO);
    let testo;
    try {
      testo = await readFileFn(percorso, 'utf8');
    } catch (errore) {
      if (errore?.code === 'ENOENT') continue; // una sottocartella senza plugin.json non è un plugin
      throw new PluginRegistryError(`Impossibile leggere ${pluginId}/${NOME_FILE_MANIFESTO}: ${errore.message}`, 'PLUGIN_READ_FAILED');
    }
    let dati;
    try {
      dati = JSON.parse(testo);
    } catch {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} non è un JSON valido`, 'PLUGIN_MALFORMED');
    }
    if (typeof dati?.nome !== 'string' || dati.nome.length === 0) {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} manca di "nome" (stringa non vuota)`, 'PLUGIN_MALFORMED');
    }
    if (typeof dati?.descrizione !== 'string' || dati.descrizione.length === 0) {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} manca di "descrizione" (stringa non vuota)`, 'PLUGIN_MALFORMED');
    }
    const hooks = dati.hooks ?? [];
    if (!Array.isArray(hooks)) {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} ha "hooks" non valido — atteso un array (anche vuoto)`, 'PLUGIN_MALFORMED');
    }
    hooks.forEach((h, indice) => {
      if (typeof h?.id !== 'string' || h.id.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: hooks[${indice}] manca di "id"`, 'PLUGIN_MALFORMED');
      }
      if (!Array.isArray(h.eventi) || h.eventi.length === 0 || !h.eventi.every((e) => EVENTI_VALIDI.has(e))) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: hooks[${indice}] ("${h.id}") ha "eventi" non valido — atteso un array non vuoto fra ${[...EVENTI_VALIDI].join('/')}`, 'PLUGIN_MALFORMED');
      }
      if (typeof h.comando !== 'string' || h.comando.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: hooks[${indice}] ("${h.id}") manca di "comando"`, 'PLUGIN_MALFORMED');
      }
    });
    const tools = dati.tools ?? [];
    if (!Array.isArray(tools)) {
      throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO} ha "tools" non valido — atteso un array (anche vuoto)`, 'PLUGIN_MALFORMED');
    }
    tools.forEach((t, indice) => {
      if (typeof t?.nome !== 'string' || t.nome.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: tools[${indice}] manca di "nome"`, 'PLUGIN_MALFORMED');
      }
      if (typeof t.descrizione !== 'string' || t.descrizione.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: tools[${indice}] ("${t.nome}") manca di "descrizione"`, 'PLUGIN_MALFORMED');
      }
      if (typeof t.comando !== 'string' || t.comando.length === 0) {
        throw new PluginRegistryError(`${pluginId}/${NOME_FILE_MANIFESTO}: tools[${indice}] ("${t.nome}") manca di "comando"`, 'PLUGIN_MALFORMED');
      }
    });
    /*
     * ⭐ CLI-REQ-02: l'impronta è su TUTTO il pacchetto, manifesto compreso — un carattere
     * cambiato in un file qualunque invalida la fiducia, nessuna eccezione. Il manifesto non ha
     * bisogno di un trattamento a parte: è uno dei file della camminata.
     * ⛔ A1: e prima ancora si controlla che il comando NON esca dal pacchetto. Il controllo va
     *   fatto qui e non a valle, perché a valle si esegue e basta.
     */
    const radicePacchetto = join(cartellaPlugin, pluginId);
    try {
      /*
       * ⛔⛔⛔ A-3 del terzo giro (17/09/2026) — UN ID CON `__` DENTRO RENDE AMBIGUO IL NOME ESPOSTO.
       *
       * Il nome che il modello vede è `plugin__<id>__<tool>` (`plugin-session.mjs:52`), e chi deve
       * risalire all'id lo fa tagliando su `__` (`agent-service.mjs`, la riverifica di A2). Con un
       * id che contiene `__` quel taglio dà la cosa SBAGLIATA: il revisore l'ha misurato con un
       * plugin `a__b` accanto a un gemello `a` già fidato — la riverifica controllava `a` ed
       * eseguiva il tool di `a__b`, scambiato.
       * ⇒ La grammatica del nome esposto non può rappresentare un id così senza ambiguità, quindi
       *   l'id non può contenerlo. Rifiutato al CARICAMENTO con una frase, mai «smette di
       *   funzionare» in silenzio — che era l'altra metà della bocciatura.
       * ⛔ Il nome del TOOL può contenere `__` senza danno: il taglio cerca il SECONDO segmento, e
       *   quello resta l'id qualunque cosa venga dopo.
       */
      if (!idPluginValido(pluginId)) {
        throw new PluginRegistryError(
          `${pluginId}: il nome della cartella del plugin non è utilizzabile come identità`,
          'PLUGIN_ID_AMBIGUO',
        );
      }
      /* ⛔ La camminata si fa UNA volta: è la stessa che copre l'impronta e che autorizza i comandi. */
      const fileDelPacchetto = await elencaFileDelPacchetto(radicePacchetto, { readdirFn, maxFile });
      const nomiDelPacchetto = new Set(fileDelPacchetto.map((v) => v.relativo));
      const contieni = (comandoDichiarato, dove) => comandoDentroIlPacchetto(comandoDichiarato, {
        radicePacchetto, radiceWorkspace: cartella, fileDelPacchetto: nomiDelPacchetto, dove,
      });
      const toolsContenuti = tools.map((t) => ({ ...t, comando: contieni(t.comando, `tool "${t.nome}"`) }));
      const hooksContenuti = hooks.map((h) => ({ ...h, comando: contieni(h.comando, `hook "${h.id}"`) }));
      const hash = await improntaDelleVoci(fileDelPacchetto, { flussoFn, maxBytePerFile, maxBytePacchetto });
      plugin.push({
        id: pluginId, nome: dati.nome, descrizione: dati.descrizione,
        hooks: hooksContenuti, tools: toolsContenuti, hash,
      });
    } catch (errore) {
      /* ⛔ Solo i guasti DEL PACCHETTO si raccolgono: qualunque altra cosa risale, come prima. */
      if (!(errore instanceof PluginRegistryError)) throw errore;
      falliti.push({
        pluginId,
        codice: errore.code,
        messaggio: errore.message,
        frase: frasePerGuastoPlugin(errore.code),
      });
    }
  }
  plugin.sort((a, b) => a.id.localeCompare(b.id));
  falliti.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  return { plugin, falliti };
}

function percorsoTrust(cartellaTrust, pluginId) {
  if (typeof pluginId !== 'string' || pluginId.length === 0 || /[\\/]|\.\./.test(pluginId)) {
    throw new PluginRegistryError('pluginId non valido — un nome, non un percorso', 'PLUGIN_ID_INVALID');
  }
  return join(cartellaTrust, `${pluginId}.json`);
}

/*
 * ⛔⛔⛔ CLI-REQ-02 — LE FRASI. Owner, 17/09/2026: il costo di questa richiesta (ogni plugin già
 * approvato va riapprovato) deve arrivare alla persona come una RICHIESTA con una frase umana,
 * mai come un errore e mai con un nome tecnico. Le frasi stanno qui, in un posto solo, accanto
 * allo stato che le determina: sono la traduzione del `motivo`, e chi disegna non deve
 * reinventarle. ⛔ Il `motivo` NON si mostra a schermo: è il nome tecnico, la frase è la sua
 * faccia umana.
 */
const FRASI_TRUST_PLUGIN = Object.freeze({
  'mai-approvato': null, // niente da spiegare: è il caso normale, la UI offre «Fida» e basta.
  'regola-precedente': 'Questo plugin era stato approvato quando il controllo guardava solo la sua scheda. Adesso copre tutti i suoi file: approvalo di nuovo.',
  'contenuto-cambiato': 'Il contenuto di questo plugin è cambiato da quando l\'hai approvato.',
  fidato: null,
});

/**
 * ⭐⭐⭐ CLI-REQ-02 — lo stato della fiducia di UN plugin, con il perché.
 *
 * Tre «no» che sembravano uno solo: mai approvato, approvato con la regola precedente, contenuto
 * cambiato dopo l'approvazione. Il secondo e il terzo hanno lo stesso aspetto — un plugin che
 * smette di funzionare — ma vogliono due frasi diverse: uno è un costo nostro, l'altro è una
 * manomissione possibile. Distinguerli costa il marcatore `schema` scritto da `fidaPlugin`.
 *
 * ⛔ Un archivio senza `schema` non è MAI fidato, qualunque cosa dica il suo `hash`: fallisce
 * chiuso. (Non potrebbe combaciare comunque — le impronte v2 hanno un prefisso di dominio — ma
 * la regola è scritta, non lasciata a un corollario.)
 * ⛔ Non lancia mai: un archivio assente o illeggibile è «non fidato», esattamente come prima.
 *
 * @returns {Promise<{fidato:boolean, motivo:'fidato'|'mai-approvato'|'regola-precedente'|'contenuto-cambiato', frase:string|null}>}
 */
export async function statoTrustPlugin({ cartellaTrust, pluginId, hash }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const esito = (motivo) => ({ fidato: motivo === 'fidato', motivo, frase: FRASI_TRUST_PLUGIN[motivo] });
  let testo;
  try {
    testo = await readFileFn(percorsoTrust(cartellaTrust, pluginId), 'utf8');
  } catch {
    return esito('mai-approvato');
  }
  let dati;
  try {
    dati = JSON.parse(testo);
  } catch {
    return esito('mai-approvato'); // un archivio illeggibile non autorizza e non accusa nessuno
  }
  if (dati?.schema !== SCHEMA_TRUST_PLUGIN) return esito('regola-precedente');
  return esito(dati.hash === hash ? 'fidato' : 'contenuto-cambiato');
}

/**
 * Stesso comportamento esatto di verificaTrustMcp/verificaTrust — assente = non fidato, mai un
 * errore. ⛔ CLI-REQ-02: resta un BOOLEANO e resta la porta che i cancelli usano
 * (`plugin-session.mjs:135`, `session-registry.mjs:4965`). Cambiarne il tipo in un oggetto
 * avrebbe reso fidato TUTTO, perché un oggetto è sempre vero e quei due chiamanti scrivono
 * `if (!fidato)`. Una sola verità: la calcola `statoTrustPlugin`, questa la restringe.
 */
export async function verificaTrustPlugin({ cartellaTrust, pluginId, hash }, deps = {}) {
  return (await statoTrustPlugin({ cartellaTrust, pluginId, hash }, deps)).fidato;
}

/**
 * Stesso comportamento esatto di fidaServerMcp/fidaHook — chiamata SOLO da un'azione owner esplicita.
 * ⛔ CLI-REQ-02: scrive anche `schema`, così la prossima lettura sa con quale regola è stata data
 * questa fiducia. Senza, ogni approvazione fatta prima di oggi arriverebbe alla persona con
 * l'aspetto esatto di una manomissione.
 */
export async function fidaPlugin({ cartellaTrust, pluginId, hash }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  await mkdirFn(cartellaTrust, { recursive: true });
  await writeFileFn(
    percorsoTrust(cartellaTrust, pluginId),
    JSON.stringify({ schema: SCHEMA_TRUST_PLUGIN, hash, fidatoIl: new Date().toISOString() }),
    'utf8',
  );
  return { fidato: true };
}
