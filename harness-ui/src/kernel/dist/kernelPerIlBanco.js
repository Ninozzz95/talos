import { mkdir, writeFile, readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { collegamentoVersoLaRete } from "../file-namespace-contract.mjs";
function discoNode(o) {
  /*
   * ⛔ 08/09/2026 — MISURATO, non dedotto: su Windows `"C:"` non è la radice del disco, è il
   * percorso relativo al drive, cioè la DIRECTORY CORRENTE del processo.
   *   readdir("C:")   → 34 voci: .automations .hooks-trust .local-models …  (cioè harness-ui/)
   *   readdir("C:\\")  → 47 voci: $RECYCLE.BIN AMD .cache …               (la radice vera)
   * Lo `replace` qui sotto toglieva la barra finale — giusto per `…/progetto/` → `…/progetto`,
   * sbagliato per `C:\\` → `C:` — e una sessione con la radice come workspace finiva a leggere la
   * cartella del server. Trovato mentre curavo le sessioni delegate che giravano in `C:\\`:
   * quelle chiedevano `cerca` e ricevevano i 13 file del server, senza che niente lo dicesse.
   *
   * ⛔ Il difetto NON è in `join`, che normalizza `join("C:", x)` in `C:\\x`: è nel ramo di
   * `dentro()` col percorso vuoto, che restituisce la radice grezza senza passare da `join`.
   * (La prima ipotesi accusava `join`: la misura l'ha scagionato.)
   */
  const spogliata = o.radice.replace(/[\\/]+$/, "");
  const radice = /^[A-Za-z]:$/.test(spogliata) ? spogliata + "\\" : spogliata;
  // Un percorso assoluto identifica il file richiesto, non un figlio della radice.
  // Le autorizzazioni appartengono al kernel chiamante, prima della scrittura.
  const dentro = (percorso) => percorso ? resolve(radice, percorso) : radice;
  return {
    /* R-28 (29/10/2026): la chiave della cartella, perché `fontiDaDisco` possa ricordare ciò che ha già letto (vedi `lettureRicordate`) */
    chiave: resolve(radice),
    async elenca(cartella) {
      const voci = await readdir(dentro(cartella), { withFileTypes: true });
      return Promise.all(voci.map(async (v) => {
        /* ⛔ 02/10/2026 (revisione Codex, rilievo 2; owner «Li seguo senza aprirli»): un collegamento che porta a un computer di
           rete non si attraversa — niente `stat` (lo seguirebbe, e su Windows aprirlo manda le credenziali NTLM). Si legge solo
           il collegamento (`readlink`, locale) e la voce esce marcata `rete: true`: chi cammina la salta. */
        if (v.isSymbolicLink() && await collegamentoVersoLaRete(join(dentro(cartella), v.name))) return { nome: v.name, cartella: false, byte: 0, rete: true };
        const cartellaVera = v.isDirectory();
        let byte = 0;
        let mtimeMs = null;
        if (!cartellaVera) {
          try {
            const s = await stat(join(dentro(cartella), v.name));
            byte = s.size;
            mtimeMs = s.mtimeMs;
          } catch {
            byte = 0;
          }
        }
        return { nome: v.name, cartella: cartellaVera, byte, mtimeMs };
      }));
    },
    async leggi(percorso) {
      return readFile(dentro(percorso), "utf8");
    },
    /*
     * ⛔⛔⛔ BC-11, 11/09/2026 — `modalita` E' IL TERZO ARGOMENTO, ED E' OPZIONALE APPOSTA.
     *
     * `'nuovo'` (assente, o qualunque altro valore) e' il comportamento di sempre, byte per byte:
     * `writeFile` con il flag implicito `'w'`. `'accoda'` aggiunge in coda con il flag `'a'`.
     *
     * ⛔ MAI leggi-concatena-riscrivi: perderebbe in silenzio la scrittura di chiunque sia passato
     *   in mezzo. Node.js `fs` (letto 11/09/2026): su Windows `flock` non esiste, e una `write` con
     *   flag `'a'` e' la via per un'aggiunta atomica per singola chiamata. E' la stessa scelta gia'
     *   presa in `harness-ui/src/workspace-files.mjs` per `document_create`.
     *
     * ⛔ Un percorso VUOTO non e' piu' la radice, ed e' il bug EISDIR di BC-11 chiuso alla fonte:
     *   `dentro('')` torna la radice — legittimo per `elenca('')`, mai per una SCRITTURA, dove
     *   produceva `EISDIR: illegal operation on a directory` su una cartella. Il kernel lo ferma
     *   gia' prima con un messaggio che nomina il campo mancante; questa e' la seconda rete, per
     *   chiunque altro usi `discoNode` (il banco incluso).
     *
     * ⛔⛔ Questo file e' un BUNDLE rigenerato dal repo del kernel dell'owner: una rigenerazione che
     *   non porti anche questa modifica farebbe sparire l'aggiunta MENTRE lo schema di `scrivi`
     *   continua a prometterla — una bugia allo strumento, la cosa peggiore fra tutte. Per questo
     *   `harness-ui/tests/scrivi-percorso-e-modalita.test.mjs` prova `discoNode` DIRETTAMENTE: se il
     *   terzo argomento sparisce, la suite diventa rossa invece di mentire in silenzio.
     */
    async scrivi(percorso, testo, modalita = "nuovo") {
      if (!percorso) throw new Error("scrivi: percorso vuoto — una scrittura senza nome di file finirebbe sulla radice della sessione");
      await mkdir(dirname(dentro(percorso)), { recursive: true });
      await writeFile(dentro(percorso), testo, modalita === "accoda" ? { encoding: "utf8", flag: "a" } : "utf8");
    }
  };
}
const ESTENSIONI_SORGENTE = Object.freeze([".mjs", ".js", ".cjs", ".jsx", ".ts", ".tsx", ".mts", ".cts"]);
let compilatore = null;
async function caricaCompilatore() {
  if (!compilatore) {
    try {
      compilatore = (await import("typescript")).default ?? await import("typescript");
    } catch (e) {
      /* CONTRATTO-CONTROLLO-SPENTO (29/10/2026): sul telefono il pacchetto non porta il compilatore; il codice lo dice a chi lo mostra */
      throw Object.assign(e instanceof Error ? e : new Error(String(e)), { codiceCancello: "compilatore-assente" });
    }
  }
  return compilatore;
}
function estensioneDi(nome) {
  const punto = nome.lastIndexOf(".");
  return punto < 0 ? "" : nome.slice(punto).toLowerCase();
}
function genereDi(ts, nomeFile) {
  switch (estensioneDi(nomeFile)) {
    case ".ts":
    case ".mts":
    case ".cts":
      return ts.ScriptKind.TS;
    case ".tsx":
      return ts.ScriptKind.TSX;
    case ".jsx":
      return ts.ScriptKind.JSX;
    default:
      return ts.ScriptKind.JS;
  }
}
async function dichiaratiIn(testo, nomeFile) {
  if (!ESTENSIONI_SORGENTE.includes(estensioneDi(nomeFile))) {
    return {
      copertura: "nonSupportato",
      nomi: /* @__PURE__ */ new Set(),
      perche: `estensione ${estensioneDi(nomeFile) || "(nessuna)"}`
    };
  }
  const ts = await caricaCompilatore();
  return dichiaratiConCompilatore(ts, testo, nomeFile);
}
function dichiaratiConCompilatore(ts, testo, nomeFile) {
  if (!ESTENSIONI_SORGENTE.includes(estensioneDi(nomeFile))) {
    return { copertura: "nonSupportato", nomi: /* @__PURE__ */ new Set(), perche: `estensione ${estensioneDi(nomeFile)}` };
  }
  const sorgente = ts.createSourceFile(
    nomeFile,
    testo,
    ts.ScriptTarget.Latest,
    true,
    genereDi(ts, nomeFile)
  );
  const rotture = sorgente.parseDiagnostics ?? [];
  if (rotture.length > 0) {
    return {
      copertura: "sorgenteInvalida",
      nomi: /* @__PURE__ */ new Set(),
      perche: `${rotture.length} errori di sintassi`
    };
  }
  const genere = genereDi(ts, nomeFile);
  if (genere === ts.ScriptKind.JS || genere === ts.ScriptKind.JSX) {
    const soloTypeScript = contieneCostruttiTypeScript(ts, sorgente);
    if (soloTypeScript) {
      return { copertura: "sorgenteInvalida", nomi: /* @__PURE__ */ new Set(), perche: "costrutti TypeScript in un file JavaScript" };
    }
  }
  return { copertura: "completa", nomi: raccogliDichiarazioni(ts, sorgente) };
}
function tipoAnnotato(ts, nodo) {
  const forse = nodo.type;
  return forse !== void 0 && typeof forse === "object" && forse !== null && ts.isTypeNode(forse);
}
function contieneCostruttiTypeScript(ts, sorgente) {
  let trovato = false;
  const visita = (nodo) => {
    if (trovato) return;
    if (ts.isInterfaceDeclaration(nodo) || ts.isTypeAliasDeclaration(nodo) || ts.isEnumDeclaration(nodo) || ts.isModuleDeclaration(nodo) || ts.isAsExpression(nodo) || ts.isTypeAssertionExpression(nodo) || ts.isNonNullExpression(nodo) || ts.isTypeParameterDeclaration(nodo) || tipoAnnotato(ts, nodo)) {
      trovato = true;
      return;
    }
    ts.forEachChild(nodo, visita);
  };
  ts.forEachChild(sorgente, visita);
  return trovato;
}
function raccogliDichiarazioni(ts, sorgente) {
  const nomi = /* @__PURE__ */ new Set();
  const prendi = (nodo) => {
    if (!nodo) return;
    if (ts.isIdentifier(nodo)) {
      nomi.add(nodo.text);
      return;
    }
    if (ts.isObjectBindingPattern(nodo) || ts.isArrayBindingPattern(nodo)) {
      for (const el of nodo.elements) {
        if (!ts.isOmittedExpression(el)) prendi(el.name);
      }
    }
  };
  const visita = (nodo) => {
    if (ts.isFunctionDeclaration(nodo) || ts.isClassDeclaration(nodo)) prendi(nodo.name);
    else if (ts.isVariableDeclaration(nodo)) prendi(nodo.name);
    else if (ts.isTypeAliasDeclaration(nodo) || ts.isInterfaceDeclaration(nodo) || ts.isEnumDeclaration(nodo) || ts.isModuleDeclaration(nodo)) prendi(nodo.name);
    else if (ts.isMethodDeclaration(nodo) || ts.isPropertyDeclaration(nodo)) prendi(nodo.name);
    else if (ts.isExportSpecifier(nodo)) prendi(nodo.name);
    else if (ts.isImportSpecifier(nodo)) prendi(nodo.name);
    else if (ts.isImportClause(nodo)) prendi(nodo.name);
    else if (ts.isNamespaceImport(nodo)) prendi(nodo.name);
    ts.forEachChild(nodo, visita);
  };
  ts.forEachChild(sorgente, visita);
  return nomi;
}
const ILLEGGIBILE = "sorgenteInvalida";
async function costruisciCatalogo(sorgenti, opzioni) {
  const precedente = opzioni?.precedente;
  const perFile = /* @__PURE__ */ new Map();
  const perNome = /* @__PURE__ */ new Map();
  const testi = /* @__PURE__ */ new Map();
  for (const { percorso, testo } of sorgenti) {
    const gia = precedente?.perFile.get(percorso);
    if (gia && precedente.testi.get(percorso) === testo) {
      perFile.set(percorso, gia);
      for (const nome of gia.nomi) {
        const dove = perNome.get(nome);
        if (dove) dove.push(percorso);
        else perNome.set(nome, [percorso]);
      }
      testi.set(percorso, testo);
      continue;
    }
    if (testo === null) {
      perFile.set(percorso, { copertura: ILLEGGIBILE, nomi: /* @__PURE__ */ new Set() });
      testi.set(percorso, null);
      continue;
    }
    const esito = await dichiaratiIn(testo, percorso);
    perFile.set(percorso, { copertura: esito.copertura, nomi: esito.nomi });
    testi.set(percorso, testo);
    for (const nome of esito.nomi) {
      const dove = perNome.get(nome);
      if (dove) dove.push(percorso);
      else perNome.set(nome, [percorso]);
    }
  }
  return { perFile, perNome, testi, elenco: opzioni?.elenco ?? "completo" };
}
function ambitoEUnFile(ambito) {
  return !ambito.endsWith("/") && /\.[a-z0-9]+$/i.test(ambito);
}
function dentroAmbito(percorso, ambito) {
  if (ambitoEUnFile(ambito)) return percorso === ambito;
  const cartella = ambito.endsWith("/") ? ambito : `${ambito}/`;
  return percorso.startsWith(cartella);
}
function risolviSimbolo(catalogo, nome, ambito) {
  const fatto = { famiglia: "symbol-declared", nome, ambito };
  const parziale = catalogo.elenco === "completo" ? null : catalogo.elenco.troncato;
  const file = [...catalogo.perFile.keys()].filter((p) => dentroAmbito(p, ambito));
  if (file.length === 0) {
    if (parziale) return { stato: "ignoto", perche: `the workspace listing is incomplete (${parziale}), so nothing can be ruled out in ${ambito}`, fatto };
    if (ambitoEUnFile(ambito)) {
      return { stato: "assente", perche: `"${nome}" is not declared in ${ambito} (the file does not exist)`, copertura: "completa", fatto };
    }
    return { stato: "ignoto", perche: `nothing is known about ${ambito}`, fatto };
  }
  const testimoni = (catalogo.perNome.get(nome) ?? []).filter((p) => dentroAmbito(p, ambito));
  if (testimoni.length > 0) return { stato: "presente", fatto: { ...fatto, ambito: testimoni[0] } };
  const scoperti = file.filter((f) => catalogo.perFile.get(f).copertura !== "completa");
  if (scoperti.length > 0) {
    const perche = catalogo.perFile.get(scoperti[0]).copertura;
    return {
      stato: "ignoto",
      perche: `${scoperti.length} file(s) in ${ambito} could not be read (${perche}), starting with ${scoperti[0]}`,
      fatto
    };
  }
  if (parziale) {
    return {
      stato: "ignoto",
      perche: `every listed file in ${ambito} was read, but the listing itself is incomplete (${parziale})`,
      fatto
    };
  }
  const copertura = "completa";
  return { stato: "assente", perche: `"${nome}" is not declared anywhere in ${ambito}`, copertura, fatto };
}
const CARTELLE_SALTATE = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".svelte-kit",
  ".next",
  ".nuxt",
  ".cache",
  ".gradle",
  ".idea",
  ".vscode",
  "android",
  "ios",
  "target",
  "vendor",
  "__pycache__"
]);
const TETTO_BYTE = 8 * 1024 * 1024;
const TETTO_FILE = 1500;
/*
 * R-28 (29/10/2026 notte; misura della Performance su una copia di harness-ui, 1.414 file JavaScript: un file_edit su un .mjs costava
 *   270-400 ms senza che il compilatore partisse mai, quasi tutto lettura dei file e due espressioni regolari su ogni sorgente). Ogni
 *   scrittura rileggeva TUTTO lo spazio di lavoro. Ora `leggiSpazio` ricorda il testo di ogni file per (dimensione, data di modifica)
 *   e rilegge solo ciò che è cambiato: la visita delle cartelle con `stat` resta, la lettura no.
 * ⛔ La regola di git per i file «racy» (Documentation/technical/racy-git.txt): un file la cui data di modifica cade troppo vicino
 *   alla lettura può essere stato riscritto dopo senza cambiare data né dimensione ⇒ quel file si rilegge sempre. «Troppo vicino» è
 *   3 secondi, non 1 (revisione della CLI, 29/10/2026): FAT32 ed exFAT (chiavette, schede SD usate come cartella di lavoro) tengono
 *   la data a passi di 2 secondi arrotondati in basso, e le condivisioni di rete o `\\wsl.localhost` possono avere l'orologio un
 *   po' indietro rispetto al nostro. Il limite che resta è quello di `git status`: un file riscritto con la STESSA dimensione e la
 *   data rimessa a mano INDIETRO.
 * Solo per i dischi che dicono la loro cartella (`discoNode`); due cartelle al più; tutto si svuota dopo 10 minuti senza letture
 * (timer `unref`: un processo breve esce lo stesso). Al più `TETTO_BYTE` per cartella, quindi ~16 MB in tutto.
 */
const lettureRicordate = /* @__PURE__ */ new Map();
let svegliaLetture = null;
const ATTESA_DATA_INCERTA_MS = 3e3;
function lettureDellaCartella(chiave) {
  if (typeof chiave !== "string" || !chiave) return null;
  let tabella = lettureRicordate.get(chiave);
  if (tabella) lettureRicordate.delete(chiave);
  else tabella = /* @__PURE__ */ new Map();
  lettureRicordate.set(chiave, tabella);
  while (lettureRicordate.size > 2) lettureRicordate.delete(lettureRicordate.keys().next().value);
  if (svegliaLetture) clearTimeout(svegliaLetture);
  svegliaLetture = setTimeout(() => { lettureRicordate.clear(); svegliaLetture = null; }, 10 * 60 * 1e3);
  svegliaLetture.unref?.();
  return tabella;
}
function dimenticaLetture() {
  lettureRicordate.clear();
  if (svegliaLetture) clearTimeout(svegliaLetture);
  svegliaLetture = null;
}
function fontiDaDisco(disco, opzioni = {}) {
  const tettoByte = opzioni.tettoByte ?? TETTO_BYTE;
  const tettoFile = opzioni.tettoFile ?? TETTO_FILE;
  const salta = opzioni.salta ?? CARTELLE_SALTATE;
  let ultimoLetto = /* @__PURE__ */ new Map();
  return {
    async leggiSpazio() {
      const sorgenti = [];
      let byte = 0;
      let elenco = "completo";
      const ricordate = lettureDellaCartella(disco.chiave);
      const viste = /* @__PURE__ */ new Set();
      const scendi = async (cartella) => {
        if (elenco !== "completo") return;
        let voci;
        try {
          voci = await disco.elenca(cartella);
        } catch (e) {
          elenco = { troncato: `"${cartella || "."}" could not be listed (${messaggio(e)})` };
          return;
        }
        for (const voce of voci) {
          if (elenco !== "completo") return;
          if (voce.rete) continue; // 02/10/2026: un collegamento verso un computer di rete non si legge (vedi `disco.elenca`)
          const percorso = cartella ? `${cartella}/${voce.nome}` : voce.nome;
          if (voce.cartella) {
            if (salta.has(voce.nome)) continue;
            await scendi(percorso);
            continue;
          }
          if (!ESTENSIONI_SORGENTE.includes(estensioneDi(percorso))) continue;
          if (sorgenti.length >= tettoFile) {
            elenco = { troncato: `the workspace has more than ${tettoFile} source files` };
            return;
          }
          if (byte + voce.byte > tettoByte) {
            elenco = { troncato: `the workspace is larger than ${Math.round(tettoByte / 1024 / 1024)} MB of source` };
            return;
          }
          byte += voce.byte;
          const nota = ricordate?.get(percorso);
          viste.add(percorso);
          if (nota && Number.isFinite(voce.mtimeMs) && nota.byte === voce.byte && nota.mtimeMs === voce.mtimeMs && voce.mtimeMs < nota.lettoAlle - ATTESA_DATA_INCERTA_MS) {
            sorgenti.push({ percorso, testo: nota.testo });
            continue;
          }
          const lettoAlle = Date.now();
          try {
            const testo = await disco.leggi(percorso);
            sorgenti.push({ percorso, testo });
            if (ricordate && Number.isFinite(voce.mtimeMs)) ricordate.set(percorso, { byte: voce.byte, mtimeMs: voce.mtimeMs, lettoAlle, testo });
          } catch {
            sorgenti.push({ percorso, testo: null });
            ricordate?.delete(percorso);
          }
        }
      };
      await scendi("");
      if (ricordate && elenco === "completo") for (const p of ricordate.keys()) if (!viste.has(p)) ricordate.delete(p);
      ultimoLetto = new Map(sorgenti.map((s) => [s.percorso, s.testo]));
      return { sorgenti, elenco };
    },
    async scrivi(sorgenti) {
      for (const { percorso, testo } of sorgenti) {
        if (testo === null) continue;
        if (ultimoLetto.get(percorso) === testo) continue;
        await disco.scrivi(percorso, testo);
      }
    }
  };
}
function messaggio(e) {
  return e instanceof Error ? e.message : String(e);
}
const CODICI_RIFERIMENTO_MANCANTE = Object.freeze(/* @__PURE__ */ new Set([
  2304,
  // Cannot find name 'X'
  2305,
  // Module 'Y' has no exported member 'X'  ← trovato da un test, non a memoria
  2307,
  // Cannot find module 'X'
  2339,
  // Property 'X' does not exist on type 'Y'
  2551,
  // Property 'X' does not exist on type 'Y'. Did you mean 'Z'?
  2552,
  // Cannot find name 'X'. Did you mean 'Y'?
  2503,
  // Cannot find namespace 'X'
  2724
  // 'Y' has no exported member named 'X'. Did you mean 'Z'?
]));
function improntaDi(ts, d) {
  return {
    codice: d.code,
    file: d.file?.fileName ?? null,
    messaggio: ts.flattenDiagnosticMessageText(d.messageText, " ").trim()
  };
}
const SEPARATORE = String.fromCharCode(31);
const chiaveDi = (i) => `${i.codice}${SEPARATORE}${i.file ?? ""}${SEPARATORE}${i.messaggio}`;
function introdotte(prima, dopo) {
  const conto = /* @__PURE__ */ new Map();
  for (const d of prima) {
    const k = chiaveDi(d);
    conto.set(k, (conto.get(k) ?? 0) + 1);
  }
  const nuove = [];
  for (const d of dopo) {
    const k = chiaveDi(d);
    const restano = conto.get(k) ?? 0;
    if (restano > 0) conto.set(k, restano - 1);
    else nuove.push(d);
  }
  return nuove;
}
function hostInMemoria(ts, file, libreria) {
  const trova = (f) => file.get(f) ?? libreria?.file.get(f);
  return {
    fileExists: (f) => trova(f) !== void 0,
    readFile: (f) => trova(f),
    getSourceFile: (f, target) => {
      const testo = trova(f);
      return testo === void 0 ? void 0 : ts.createSourceFile(f, testo, target, true, genereDi(ts, f));
    },
    getDefaultLibFileName: () => libreria?.predefinita ?? "/lib.d.ts",
    /*
     * ⛔ Il compilatore chiede le librerie per nome NUDO: senza una
     * posizione vuota, i riferimenti `/// <reference lib="..." />` dentro i
     * file di libreria non si risolvono, e si torna al falso positivo.
     */
    getDefaultLibLocation: () => "",
    writeFile: () => {
    },
    getCurrentDirectory: () => "/",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n"
  };
}
const SOPPRESSIONI = /@ts-(ignore|expect-error|nocheck)\b/g;
/*
 * R-28 (29/10/2026 notte): le due domande che il cancello fa a OGNI sorgente (quante soppressioni, chiede il controllo?) costavano due
 *   espressioni regolari su tutto lo spazio a ogni scrittura (~65 ms su 1.400 file). Le risposte si ricordano per percorso finché il
 *   testo è lo stesso: fra il prima e il dopo cambia un file solo, e fra due scritture quasi niente.
 */
const domandeSulFile = /* @__PURE__ */ new Map();
function domandeDi(percorso, testo) {
  const nota = domandeSulFile.get(percorso);
  if (nota && nota.testo === testo) return nota;
  const nuova = { testo, soppressioni: testo.match(SOPPRESSIONI)?.length ?? 0, chiedeIlControllo: CHIEDE_IL_CONTROLLO.test(testo) };
  if (domandeSulFile.size >= 4 * TETTO_FILE) domandeSulFile.clear();
  domandeSulFile.set(percorso, nuova);
  return nuova;
}
function contaSoppressioni(sorgenti) {
  const per = /* @__PURE__ */ new Map();
  for (const { percorso, testo } of sorgenti) {
    if (testo === null) continue;
    const quante = domandeDi(percorso, testo).soppressioni;
    if (quante > 0) per.set(percorso, quante);
  }
  return per;
}
function soppressioniIntrodotte(prima, dopo) {
  const eranO = contaSoppressioni(prima);
  const fuori = [];
  for (const [percorso, adesso] of contaSoppressioni(dopo)) {
    const differenza = adesso - (eranO.get(percorso) ?? 0);
    if (differenza > 0) fuori.push({ percorso, quante: differenza });
  }
  return fuori;
}
/*
 * ⛔ 29/10/2026 notte (Desktop, trovato lavorando al cancello veloce): il compilatore cerca gli import col nome ASSOLUTO rispetto a
 *   `getCurrentDirectory()` ("/"): per `import { f } from "./m5"` dentro `src/nuovo.ts` chiede `/src/m5.ts`, ma la mappa teneva
 *   `src/m5.ts`. Ogni import relativo restava «Cannot find module» (2307): nei file vecchi c'era già nel «prima» e non contava, in un
 *   file NUOVO era sempre «introdotto» ⇒ il cancello rifiutava qualunque sorgente nuovo che importasse un modulo vicino. Dentro il
 *   cancello i nomi diventano assoluti. Il nome del file nell'impronta serve solo a confrontare prima e dopo dentro questo modulo (i
 *   messaggi citano lo specificatore dell'import, non il nome): resta quello interno, così lo stesso file scritto con barre diverse
 *   nel prima e nel dopo non sembra nuovo.
 */
const nomeInterno = (p) => /^(?:\/|[A-Za-z]:[\\/])/.test(p) ? p : `/${p.replace(/\\/g, "/")}`;
async function riferimentiNonRisolti(sorgenti, libreria) {
  const ts = await caricaCompilatore();
  const file = /* @__PURE__ */ new Map();
  for (const { percorso, testo } of sorgenti) {
    if (testo === null) continue;
    if (!ESTENSIONI_SORGENTE.includes(estensioneDi(percorso))) continue;
    file.set(nomeInterno(percorso), testo);
  }
  if (file.size === 0) return [];
  const program = ts.createProgram(
    [...file.keys()],
    { noEmit: true, skipLibCheck: true, allowJs: true, checkJs: false },
    hostInMemoria(ts, file, libreria)
  );
  const fuori = [];
  for (const nome of file.keys()) {
    const sorgente = program.getSourceFile(nome);
    if (!sorgente) continue;
    for (const d of program.getSemanticDiagnostics(sorgente)) {
      if (CODICI_RIFERIMENTO_MANCANTE.has(d.code)) fuori.push(improntaDi(ts, d));
    }
  }
  return fuori;
}
/*
 * ⛔ R-28 di Performance (29/10/2026 notte; owner: «cancello veloce», strada A; contratto con la CLI, A2 e le sue cinque condizioni).
 *   Prima ogni scrittura costruiva DUE programmi TypeScript interi e ricontrollava TUTTI i file, riparsando perfino lib.es*.d.ts:
 *   2-6 s su 230 sorgenti. Ora, a esito identico (stesse impronte, stesso ordine dei file ⇒ stesso `perche`):
 *   · ogni file (librerie comprese) si analizza una volta per CONTENUTO: la chiave è nome + hash del testo, mai «stesso giro», così
 *     due agenti che scrivono insieme nella stessa cartella, una modifica della persona o un `git checkout` cambiano la chiave;
 *   · il risultato di uno stato intero (tutti i nomi + hash) si ricorda: il «prima» di una scrittura è quasi sempre il «dopo» della
 *     precedente, e non si ricalcola;
 *   · il controllo usa `createSemanticDiagnosticsBuilderProgram` sul costruttore precedente (wiki di TypeScript «Using the Compiler
 *     API»): ricontrolla solo i file cambiati e quelli che ne dipendono, gli altri tornano dalla sua memoria;
 *   · dopo 10 minuti di inattività la cache si svuota: con un timer `unref` (il server rende la memoria, `talos -p` esce subito) e
 *     comunque alla chiamata dopo;
 *   · un progetto oltre TETTO_BYTE_CANCELLO di sorgenti torna al calcolo di sempre, mai a un risultato diverso. ⛔ Il tetto è sulla
 *     MEMORIA, misurata il 29/10: un costruttore tiene ~7 MB fissi più 130-570 volte i byte del testo (100 file/17 KB → 9,6 MB,
 *     1.000/178 KB → 27,9 MB, 3.000/545 KB → 70,3 MB). 2 MiB ⇒ al più ~270 MB, e il secondo costruttore resta solo se i due
 *     insieme stanno sotto lo stesso tetto;
 *   · le chiamate si mettono in fila: il costruttore precedente non si usa da due parti insieme.
 *   `freddo: true` calcola come prima (la prova di equivalenza confronta i due).
 *   Mobile 29/10/2026: sul telefono node vive dentro il processo dell'app, con molto meno margine di un PC ⇒ su Android il tetto è
 *   512 KiB (~70 MB al più). `TALOS_CANCELLO_CACHE_KIB` lo cambia ovunque, e `0` spegne la cache (sempre il calcolo di sempre); un
 *   valore che non è un intero si ignora.
 */
const TETTO_BYTE_CANCELLO = 2 * 1024 * 1024;
const TETTO_BYTE_CANCELLO_ANDROID = 512 * 1024;
function tettoCancello({ ambiente = process.env, piattaforma = process.platform } = {}) {
  const chiesto = String(ambiente?.TALOS_CANCELLO_CACHE_KIB ?? "").trim();
  if (/^\d{1,7}$/.test(chiesto)) return Number(chiesto) * 1024;
  return piattaforma === "android" ? TETTO_BYTE_CANCELLO_ANDROID : TETTO_BYTE_CANCELLO;
}
const INATTIVITA_CANCELLO_MS = 10 * 60 * 1e3;
const STATI_RICORDATI = 32;
const cacheCancello = { sorgenti: /* @__PURE__ */ new Map(), costruttori: [], moduli: /* @__PURE__ */ new Map(), risultati: /* @__PURE__ */ new Map(), ultimoUso: 0, libreria: null, sveglia: null };
let codaCancello = Promise.resolve();
const hashTesto = (t) => createHash("sha1").update(t).digest("hex");
/* Tutto: il compilatore E le letture del disco (le prove, e chi vuole ripartire da zero). */
function svuotaCacheCancello() {
  domandeSulFile.clear();
  dimenticaLetture();
  svuotaCompilatore();
}
/* Solo il lavoro del compilatore: una libreria diversa o 10 minuti fermi non rendono vecchio il testo letto dal disco, che ha la sua
   regola (dimensione, data) e il suo timer. Trovato dalla prova su disco vero CANC-IO-05: la prima scrittura buttava via le letture. */
function svuotaCompilatore() {
  if (cacheCancello.sveglia) clearTimeout(cacheCancello.sveglia);
  cacheCancello.sveglia = null;
  cacheCancello.sorgenti.clear();
  cacheCancello.costruttori = [];
  cacheCancello.risultati.clear();
  cacheCancello.moduli = /* @__PURE__ */ new Map();
  cacheCancello.libreria = null;
}
function statoCacheCancello() {
  return { sorgenti: cacheCancello.sorgenti.size, costruttori: cacheCancello.costruttori.length, risultati: cacheCancello.risultati.size };
}
async function riferimentiNonRisoltiVeloce(sorgenti, libreria) {
  const ts = await caricaCompilatore();
  const file = /* @__PURE__ */ new Map();
  for (const { percorso, testo } of sorgenti) {
    if (testo === null) continue;
    if (!ESTENSIONI_SORGENTE.includes(estensioneDi(percorso))) continue;
    file.set(nomeInterno(percorso), testo);
  }
  if (file.size === 0) return [];
  const tetto = tettoCancello();
  if (tetto === 0) return riferimentiNonRisolti(sorgenti, libreria);
  const ora = Date.now();
  if (ora - cacheCancello.ultimoUso > INATTIVITA_CANCELLO_MS || cacheCancello.libreria !== libreria) svuotaCompilatore();
  cacheCancello.ultimoUso = ora;
  cacheCancello.libreria = libreria;
  if (cacheCancello.sveglia) clearTimeout(cacheCancello.sveglia);
  cacheCancello.sveglia = setTimeout(svuotaCompilatore, INATTIVITA_CANCELLO_MS);
  cacheCancello.sveglia.unref?.();
  const versioni = /* @__PURE__ */ new Map();
  for (const [nome, testo] of file) versioni.set(nome, hashTesto(testo));
  const chiaveStato = hashTesto([...versioni].map(([n, v]) => `${n}\0${v}`).join("\n"));
  const ricordato = cacheCancello.risultati.get(chiaveStato);
  if (ricordato) {
    cacheCancello.risultati.delete(chiaveStato);
    cacheCancello.risultati.set(chiaveStato, ricordato);
    return ricordato.map((i) => ({ ...i }));
  }
  const host = hostInMemoria(ts, file, libreria);
  host.getSourceFile = (f, target) => {
    const testo = file.get(f) ?? libreria?.file.get(f);
    if (testo === void 0) return void 0;
    const versione = file.has(f) ? versioni.get(f) : `lib:${f}`;
    const chiave = `${f}\0${versione}`;
    let sf = cacheCancello.sorgenti.get(chiave);
    if (!sf) {
      sf = ts.createSourceFile(f, testo, target, true, genereDi(ts, f));
      sf.version = versione;
      cacheCancello.sorgenti.set(chiave, sf);
    }
    return sf;
  };
  /*
   * R-28, A3 (29/10/2026 notte; misura della Performance: su una copia di harness-ui un file_edit su un .mjs costava 270-400 ms, perché
   *   14 file TypeScript e 2 JavaScript con @ts-check tenevano acceso il compilatore e i sorgenti, quasi tutti JavaScript, superavano
   *   il tetto: ogni scrittura rifaceva il programma intero). Il programma parte SOLO da ciò che può dare una diagnosi o cambiarla:
   *   i file controllabili e gli «script» JavaScript (senza import/export: le loro dichiarazioni sono globali e un TypeScript le
   *   vede). Gli altri moduli JavaScript entrano solo se qualcuno li importa, come fa il compilatore con `allowJs`. Le diagnosi si
   *   leggono solo dai file di partenza: gli altri, con `checkJs: false`, non ne danno. La prova di equivalenza (CANC-A3-*) lo
   *   confronta col programma intero di prima, che resta il calcolo `freddo`.
   */
  const moduli = /* @__PURE__ */ new Map();
  const nomi = [];
  let controllabili = 0;
  for (const [nome, testo] of file) {
    const chiave = `${nome}\0${versioni.get(nome)}`;
    const daControllare = ESTENSIONI_TS.includes(estensioneDi(nome)) || CHIEDE_IL_CONTROLLO.test(testo);
    if (daControllare) { controllabili++; nomi.push(nome); continue; }
    let modulo = cacheCancello.moduli.get(chiave);
    if (modulo === void 0) modulo = ts.isExternalModule(ts.createSourceFile(nome, testo, ts.ScriptTarget.Latest, false, genereDi(ts, nome)));
    moduli.set(chiave, modulo);
    if (!modulo) nomi.push(nome);
  }
  cacheCancello.moduli = moduli;
  if (controllabili === 0) {
    cacheCancello.risultati.set(chiaveStato, []);
    return [];
  }
  let scelto = null;
  let migliore = 0;
  for (const c of cacheCancello.costruttori) {
    let comuni = 0;
    for (const n of nomi) if (c.nomi.has(n)) comuni++;
    if (comuni > migliore) { migliore = comuni; scelto = c; }
  }
  const vecchio = scelto && migliore * 2 >= nomi.length ? scelto.costruttore : void 0;
  const costruttore = ts.createSemanticDiagnosticsBuilderProgram(nomi, { noEmit: true, skipLibCheck: true, allowJs: true, checkJs: false }, host, vecchio);
  const program = costruttore.getProgram();
  /*
   * ⛔ Prima si consumano i file «toccati» (builder.ts: `getSemanticDiagnostics(sourceFile)` legge la cache del file senza propagare
   *   il cambiamento a chi lo importa; la propagazione avviene solo in `getSemanticDiagnosticsOfNextAffectedFile`). Senza questo giro,
   *   togliere un export da m8 lasciava a m7 la diagnosi vecchia: trovato dalla prova di equivalenza CANC-A2-01.
   */
  while (costruttore.getSemanticDiagnosticsOfNextAffectedFile()) {
  }
  const fuori = [];
  for (const nome of nomi) {
    const sorgente = program.getSourceFile(nome);
    if (!sorgente) continue;
    for (const d of costruttore.getSemanticDiagnostics(sorgente)) {
      if (CODICI_RIFERIMENTO_MANCANTE.has(d.code)) fuori.push(improntaDi(ts, d));
    }
  }
  /* il costruttore usato come base si consuma (TypeScript lo «rilascia»): al suo posto il nuovo; al più due insiemi di file (due
     cartelle), e il secondo solo se i due insiemi stanno sotto il tetto della memoria */
  /* il tetto si misura sul programma che si TIENE (i file di partenza più ciò che importano), non su tutta la cartella; oltre il
     tetto l'esito si usa e il programma no */
  let byteProgramma = 0;
  for (const sf of program.getSourceFiles()) if (file.has(sf.fileName)) byteProgramma += sf.text.length;
  const tenuti = byteProgramma <= tetto ? [{ nomi: new Set(nomi), costruttore, byte: byteProgramma }] : [];
  const altro = cacheCancello.costruttori.find((c) => c !== scelto);
  if (altro && altro.byte + (tenuti[0]?.byte ?? 0) <= tetto) tenuti.push(altro);
  cacheCancello.costruttori = tenuti;
  /* restano in memoria solo i file che i costruttori tenuti usano ancora: le versioni vecchie se ne vanno */
  const vivi = /* @__PURE__ */ new Set();
  for (const c of cacheCancello.costruttori) for (const sf of c.costruttore.getProgram().getSourceFiles()) vivi.add(`${sf.fileName}\0${sf.version}`);
  for (const k of cacheCancello.sorgenti.keys()) if (!vivi.has(k)) cacheCancello.sorgenti.delete(k);
  cacheCancello.risultati.set(chiaveStato, fuori.map((i) => ({ ...i })));
  while (cacheCancello.risultati.size > STATI_RICORDATI) cacheCancello.risultati.delete(cacheCancello.risultati.keys().next().value);
  return fuori;
}
/*
 * R-28, A0 (owner 29/10/2026 notte, «prima il salto esatto»): con `checkJs: false` il compilatore controlla solo i file TypeScript e i
 *   JavaScript che chiedono `@ts-check`; negli altri non nasce nessuna diagnosi semantica. Se né il prima né il dopo hanno un file
 *   controllabile, le due liste sono vuote per costruzione e il compilatore non serve. La prova è larga apposta (un `@ts-nocheck` o un
 *   `@ts-check` dentro una stringa contano come «controllabile»): sbagliare verso il calcolo vero costa tempo, mai l'esito.
 */
const ESTENSIONI_TS = Object.freeze([".ts", ".tsx", ".mts", ".cts"]);
const CHIEDE_IL_CONTROLLO = /@ts-check\b/;
function haFileControllabili(sorgenti) {
  for (const { percorso, testo } of sorgenti) {
    if (testo === null) continue;
    const estensione = estensioneDi(percorso);
    if (ESTENSIONI_TS.includes(estensione)) return true;
    if (ESTENSIONI_SORGENTE.includes(estensione) && domandeDi(percorso, testo).chiedeIlControllo) return true;
  }
  return false;
}
function inFilaCancello(lavoro) {
  const turno = codaCancello.then(lavoro, lavoro);
  codaCancello = turno.then(() => void 0, () => void 0);
  return turno;
}
async function cancelloSemantico(prima, dopo, libreria, { freddo = false } = {}) {
  const fatto = { famiglia: "introduced-references", nome: "modifica candidata" };
  let baseline;
  let candidato;
  try {
    if (!freddo && !haFileControllabili(prima) && !haFileControllabili(dopo)) {
      baseline = [];
      candidato = [];
    } else if (freddo) {
      baseline = await riferimentiNonRisolti(prima, libreria);
      candidato = await riferimentiNonRisolti(dopo, libreria);
    } else {
      ({ baseline, candidato } = await inFilaCancello(async () => ({
        baseline: await riferimentiNonRisoltiVeloce(prima, libreria),
        candidato: await riferimentiNonRisoltiVeloce(dopo, libreria)
      })));
    }
  } catch (errore) {
    return {
      stato: "ignoto",
      perche: `the semantic guard could not run (${errore instanceof Error ? errore.message.slice(0, 80) : "errore"})`,
      codice: errore?.codiceCancello ?? "errore-interno",
      fatto
    };
  }
  const zittite = soppressioniIntrodotte(prima, dopo);
  if (zittite.length > 0) {
    return {
      stato: "assente",
      perche: `the change adds ${zittite.reduce((s, z) => s + z.quante, 0)} new compiler-error suppression(s) (@ts-ignore / @ts-expect-error) in ${zittite.map((z) => z.percorso).join(", ")}. Silencing an error is not fixing it.`,
      copertura: "completa",
      fatto
    };
  }
  const nuove = introdotte(baseline, candidato);
  if (nuove.length === 0) return { stato: "presente", fatto };
  return {
    stato: "assente",
    perche: `the change introduces ${nuove.length} unresolved reference(s): ${nuove.slice(0, 3).map((d) => d.messaggio).join("; ")}`,
    /*
     * ⛔ `completa` perché il confronto è fatto sullo STESSO insieme di file
     * con lo STESSO compilatore: ciò che è nuovo è nuovo per costruzione.
     * Non dice che il progetto sia corretto — dice che la modifica non ha
     * aggiunto riferimenti rotti fra quelli che sappiamo vedere.
     */
    copertura: "completa",
    fatto
  };
}
const CATENA_ES2022 = Object.freeze([
  "lib.es5.d.ts",
  "lib.es2015.d.ts",
  "lib.es2016.d.ts",
  "lib.es2017.d.ts",
  "lib.es2018.d.ts",
  "lib.es2019.d.ts",
  "lib.es2020.d.ts",
  "lib.es2021.d.ts",
  "lib.es2022.d.ts",
  "lib.decorators.d.ts",
  "lib.decorators.legacy.d.ts"
]);
let inMano = null;
async function componiLibreria(leggi, nomi = CATENA_ES2022) {
  const file = /* @__PURE__ */ new Map();
  for (const nome of nomi) {
    const testo = await leggi(nome);
    if (testo !== null) file.set(nome, testo);
  }
  return { predefinita: "lib.es2022.d.ts", file };
}
async function libreriaStandard(leggi) {
  if (!inMano) inMano = await componiLibreria(leggi);
  return inMano;
}
export {
  ESTENSIONI_SORGENTE,
  cancelloSemantico,
  costruisciCatalogo,
  dichiaratiIn,
  discoNode,
  fontiDaDisco,
  libreriaStandard,
  risolviSimbolo,
  statoCacheCancello,
  svuotaCacheCancello,
  tettoCancello
};
