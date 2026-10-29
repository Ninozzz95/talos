/*
 * ⭐ Owner 27/10/2026: «fai in modo che nella tab browser si possano visualizzare i server locali di npm run dev allo stato dell'arte».
 *   Decisioni (tre consigliate): riga in chat + striscia nel Browser, nessuna apertura da sola; il server si riconosce dall'USCITA dei
 *   comandi E dalle PORTE IN ASCOLTO dei processi della conversazione, incrociate; e un attrezzo perché il modello guardi la pagina.
 *   Ricerca e piano: `.claude/RICERCA-BROWSER-SERVER-LOCALI-2026-10-27.md` (repository del desktop).
 *
 * Questo file, prima parte: il LETTORE DELL'USCITA, puro. Le regole sono quelle di VS Code `UrlFinder`
 *   (src/vs/workbench/contrib/remote/browser/urlFinder.ts, ramo main, letto il 27/10/2026):
 *   · via le sequenze ANSI prima di cercare (`removeAnsiEscapeCodes`);
 *   · l'uscita si raccoglie per 500 ms (`dataDebounceTimeout = 500`) e un lotto oltre 10.000 caratteri si salta
 *     (`maxDataLength = 10000`: un'uscita a raffica — un gioco, un'animazione — non porta indirizzi utili);
 *   · indirizzo locale `\b\w{0,20}(?::\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{2,5})[…]*`, porta dall'URL o da
 *     `(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})`, 1-65535; un host che non è 0.0.0.0 né 127.0.0.1 diventa `localhost`;
 *   · il ripiego di Python `HTTP on (127.0.0.1|0.0.0.0) port N` quando l'altra non trova niente;
 *   · «Debugger listening on» non è un server (VS Code lo esclude con `data.startsWith` tranne la 9229; qui per RIGA, e sempre: in un
 *     lotto di 500 ms la riga del debugger può non essere la prima).
 *   Il nostro in più: il NOME del framework dai suoi banner (Vite, Next, Astro, CRA, webpack, Python, Django, Flask, Rails, …), che
 *   VS Code non dà e Cursor riconosce solo per Vite/Next/CRA. La porta VERA la dirà poi l'incrocio con le porte in ascolto (Vite che
 *   passa alla 5174 stampa la 5174, ma un server che non stampa niente si vede solo da lì).
 */

import { readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { creaLettorePersistente, MARCATORE_VALIDO, tabellaDaRighe } from './risorse-processi.mjs';
import { percorsoPowershell, percorsoWsl } from './taskkill-di-sistema.mjs';

const ANSI = /[\u001b\u009b][[\]()#;?]*(?:(?:(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007|(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~])/gu;
/** Toglie i colori e i movimenti del cursore (la stessa famiglia di `strip-ansi`). */
export function togliAnsi(testo) {
  return String(testo ?? '').replace(ANSI, '');
}

const URL_LOCALE = /\b\w{0,20}(?::\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{2,5})[\w\-.~:/?#[\]@!$&()*+,;=]*/gimu;
const PORTA_LOCALE = /(localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{1,5})/u;
const PYTHON = /HTTP\son\s(127\.0\.0\.1|0\.0\.0\.0)\sport\s(\d+)/u;

const portaValida = (n) => Number.isInteger(n) && n > 0 && n <= 65535;

/**
 * Gli indirizzi locali in un pezzo d'uscita già senza ANSI: `[{ host, porta }]`, senza doppioni, nell'ordine in cui compaiono.
 * `host` è `localhost`, `127.0.0.1` o `0.0.0.0` (come VS Code).
 */
export function trovaIndirizziLocali(testo) {
  const trovati = [];
  const visti = new Set();
  const aggiungi = (host, porta) => {
    const chiave = `${host}:${porta}`;
    if (visti.has(chiave)) return;
    visti.add(chiave);
    trovati.push({ host, porta });
  };
  for (const riga of String(testo ?? '').split(/\r?\n/u)) {
    const delDebugger = riga.trimStart().startsWith('Debugger listening on');
    for (const m of riga.matchAll(URL_LOCALE)) {
      let url;
      try { url = new URL(m[0]); } catch { continue; }
      let porta = Number.parseInt(url.port, 10);
      if (Number.isNaN(porta)) {
        const p = PORTA_LOCALE.exec(m[0]);
        porta = p ? Number.parseInt(p[2], 10) : Number.NaN;
      }
      if (!portaValida(porta)) continue;
      /* VS Code tiene la 9229 del debugger (la inoltra come porta); qui no: un debugger non è una pagina da aprire nel Browser */
      if (delDebugger) continue;
      const host = url.hostname === '0.0.0.0' || url.hostname === '127.0.0.1' ? url.hostname : 'localhost';
      aggiungi(host, porta);
    }
  }
  if (trovati.length === 0) {
    const py = PYTHON.exec(String(testo ?? ''));
    if (py) {
      const porta = Number.parseInt(py[2], 10);
      if (portaValida(porta)) aggiungi(py[1], porta);
    }
  }
  return trovati;
}

/*
 * I banner dei framework. Testo VERO dei loro avvii (non inventato):
 *   Vite «VITE v5.4.0  ready in 312 ms» / «➜  Local:   http://localhost:5173/»; Next «▲ Next.js 15.0.0» / «- Local: http://localhost:3000»;
 *   Astro «astro  v4.16.0 ready in 210 ms»; Create React App «You can now view <app> in the browser.»; webpack-dev-server
 *   «Project is running at:»; SvelteKit e Nuxt passano da Vite/Nitro («Nuxt 3.13.0 with Nitro»); Python http.server «Serving HTTP on»;
 *   Django «Starting development server at»; Flask «* Running on http://»; Rails/Puma «Puma starting» e «Listening on http://»;
 *   Angular «Angular Live Development Server is listening on»; Remix «[remix-serve]»; Storybook «Storybook … started».
 * Il primo che compare vince; l'ordine qui sotto mette prima i più specifici (Nuxt prima di Vite, SvelteKit prima di Vite).
 */
const BANNER = Object.freeze([
  ['Nuxt', /\bNuxt\s+v?\d/u],
  ['SvelteKit', /\bsveltekit\b|@sveltejs\/kit/iu],
  ['Astro', /\bastro\s+v\d/iu],
  ['Storybook', /\bStorybook\b.*\bstarted\b/iu],
  ['Next.js', /▲\s*Next\.js|\bNext\.js\s+\d/u],
  ['Vite', /\bVITE\s+v\d|\bvite\s+v\d/u],
  ['Angular', /Angular Live Development Server/u],
  ['Remix', /\[remix-serve\]/u],
  ['Create React App', /You can now view .+ in the browser/u],
  ['webpack', /\bProject is running at\b|webpack-dev-server/iu],
  ['Django', /Starting development server at/u],
  ['Flask', /\bServing Flask app\b/u],
  ['Rails', /\bPuma starting\b|\bRails \d+\.\d+/u],
  ['Python', /Serving HTTP on/u],
]);

/** Il nome del framework dal suo banner, o `null`. */
export function frameworkDaUscita(testo) {
  const t = String(testo ?? '');
  for (const [nome, re] of BANNER) if (re.test(t)) return nome;
  return null;
}

export const ATTESA_LOTTO_MS = 500;
export const TETTO_LOTTO_CARATTERI = 10_000;

/**
 * Il lettore di un flusso d'uscita: `scrivi(pezzo)` a ogni pezzo; dopo `attesaMs` di calma il lotto si legge e, se ci sono indirizzi,
 * `onTrovato({ indirizzi, framework })`. Un lotto oltre `tettoCaratteri` si butta intero (VS Code). Il framework visto in un lotto
 * vale anche per i lotti dopo dello stesso flusso (Vite stampa il banner e l'indirizzo in due righe che possono cadere in lotti diversi).
 * `chiudi()` legge subito ciò che resta.
 */
export function creaLettoreUscita({ onTrovato, attesaMs = ATTESA_LOTTO_MS, tettoCaratteri = TETTO_LOTTO_CARATTERI,
  programma = (fn, ms) => setTimeout(fn, ms), annulla = (t) => clearTimeout(t) } = {}) {
  let pezzi = [];
  let lunghezza = 0;
  let timer = null;
  let framework = null;
  let chiuso = false;
  const leggi = () => {
    timer = null;
    const lotto = pezzi;
    const quanti = lunghezza;
    pezzi = [];
    lunghezza = 0;
    if (quanti === 0 || quanti > tettoCaratteri) return;
    const testo = togliAnsi(lotto.join(''));
    framework = frameworkDaUscita(testo) ?? framework;
    const indirizzi = trovaIndirizziLocali(testo);
    if (indirizzi.length && typeof onTrovato === 'function') onTrovato({ indirizzi, framework });
  };
  return {
    scrivi(pezzo) {
      if (chiuso) return;
      const s = typeof pezzo === 'string' ? pezzo : Buffer.isBuffer(pezzo) || pezzo instanceof Uint8Array ? Buffer.from(pezzo).toString('utf8') : '';
      if (!s) return;
      pezzi.push(s);
      lunghezza += s.length;
      if (timer !== null) annulla(timer);
      timer = programma(leggi, attesaMs);
    },
    chiudi() {
      if (chiuso) return;
      chiuso = true;
      if (timer !== null) annulla(timer);
      leggi();
    },
    get framework() { return framework; },
  };
}

/* ===================================================================================================================================
 * Seconda parte: le PORTE IN ASCOLTO dei processi della conversazione, e la prova che il server risponde.
 *   Prende anche i server che non stampano l'indirizzo, e la porta VERA quando Vite passa alla successiva (il difetto segnalato su
 *   Claude Code, issue 60552: la porta fissa nella configurazione). Nessun concorrente letto incrocia le due fonti.
 *   · Windows: le connessioni TCP in ascolto (OwningProcess) unite all'albero dei processi (`Win32_Process`, come
 *     `risorse-processi.mjs`); un PowerShell PERSISTENTE che legge a richiesta (lo stesso `creaLettorePersistente`).
 *     ⛔ 29/10/2026: NON `-State Listen` da solo. Su questa macchina il socket in ascolto di node riporta lo stato 0 (misurato: il 4174
 *     sembrava spento con `-State Listen`, `aggiorna-4174.ps1` 00db7aee3), e SL-PORTE-05 era rossa per questo. Si riconosce dalla
 *     forma: porta remota 0, indirizzo remoto 0.0.0.0 o ::, e non «Bound» (legato e mai messo in ascolto); `Listen` vale sempre.
 *   · WSL: i processi col marcatore `TALOS_CMD_ID` (lo mette il kernel in testa allo script, e ogni discendente lo eredita) e i loro
 *     socket (`/proc/<pid>/fd` → `socket:[inode]`), incrociati con `/proc/net/tcp{,6}` in stato 0A (LISTEN): proc(5).
 * =================================================================================================================================== */

const FINE_PORTE = 'FINE';
/* Una riga «leggi» ⇒ un JSON { p: [[pid, ppid, 0, 0, natoMs], …], l: [[porta, pid], …] } e poi FINE */
export const COPIONE_PORTE_WINDOWS = `$ErrorActionPreference = 'SilentlyContinue'
while ($null -ne ($r = [Console]::In.ReadLine())) {
  $p = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | ForEach-Object {
    ,@([long]$_.ProcessId, [long]$_.ParentProcessId, 0, 0, $(if ($_.CreationDate) { [long]($_.CreationDate.ToFileTimeUtc() / 10000) } else { 0 }))
  })
  $l = @(Get-NetTCPConnection | Where-Object { $_.State -eq 'Listen' -or ($_.RemotePort -eq 0 -and $_.RemoteAddress -in @('0.0.0.0', '::') -and $_.State -ne 'Bound') } | ForEach-Object { ,@([long]$_.LocalPort, [long]$_.OwningProcess) })
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject @{ p = $p; l = $l } -Compress -Depth 4))
  [Console]::Out.WriteLine('${FINE_PORTE}')
  [Console]::Out.Flush()
}`;
/* WSL: «S <marcatore> <inode>» per ogni socket di un processo marcato, «L <porta esadecimale> <inode>» per ogni socket in ascolto */
export const COPIONE_PORTE_WSL = `while read -r _; do
for d in /proc/[0-9]*; do
  m=$(grep -az '^TALOS_CMD_ID=' "$d/environ" 2>/dev/null | tr -d '\\000')
  [ -n "$m" ] || continue
  for f in "$d"/fd/*; do
    l=$(readlink "$f" 2>/dev/null)
    case "$l" in socket:\\[*\\]) i=\${l#socket:[}; printf 'S %s %s\\n' "\${m#TALOS_CMD_ID=}" "\${i%]}";; esac
  done
done
cat /proc/net/tcp /proc/net/tcp6 2>/dev/null | awk '$4 == "0A" { n = split($2, a, ":"); print "L " a[n] " " $10 }'
echo ${FINE_PORTE}
done`;

/** I PID dell'albero di `radice` (lei compresa), senza i PID riusati; vuoto se la radice non c'è più. */
export function pidDellAlbero(tabella, radice) {
  if (!tabella.get(radice)) return new Set();
  const figli = new Map();
  for (const [pid, r] of tabella) {
    if (pid === r.ppid) continue;
    if (!figli.has(r.ppid)) figli.set(r.ppid, []);
    figli.get(r.ppid).push(pid);
  }
  const visti = new Set([radice]);
  const coda = [radice];
  while (coda.length) {
    const pid = coda.shift();
    const r = tabella.get(pid);
    for (const f of figli.get(pid) ?? []) {
      if (visti.has(f)) continue;
      const rf = tabella.get(f);
      if (r.nato && rf.nato && rf.nato < r.nato) continue; // PID riusato
      visti.add(f); coda.push(f);
    }
  }
  return visti;
}

/** Windows: dalle righe del lettore, per ogni radice le porte in ascolto del suo albero (ordinate, senza doppioni); `null` = finita. */
export function porteWindowsPerRadice(dati, radici) {
  const tabella = tabellaDaRighe(dati?.p);
  const ascolti = (Array.isArray(dati?.l) ? dati.l : []).map((r) => [Number(r?.[0]), Number(r?.[1])])
    .filter(([porta, pid]) => portaValida(porta) && Number.isSafeInteger(pid) && pid > 0);
  const esito = new Map();
  for (const radice of radici) {
    const albero = pidDellAlbero(tabella, radice);
    esito.set(radice, albero.size ? [...new Set(ascolti.filter(([, pid]) => albero.has(pid)).map(([porta]) => porta))].sort((a, b) => a - b) : null);
  }
  return esito;
}

/** WSL: dalle righe del lettore, `marcatore → porte in ascolto` (ordinate, senza doppioni). */
export function porteWslPerMarcatore(righe) {
  const inodeDi = new Map();
  const ascolto = new Map();
  for (const riga of Array.isArray(righe) ? righe : []) {
    const [tipo, a, b] = String(riga).trim().split(/\s+/u);
    if (tipo === 'S' && MARCATORE_VALIDO.test(a ?? '') && /^\d+$/u.test(b ?? '')) inodeDi.set(b, a);
    else if (tipo === 'L' && /^[0-9A-Fa-f]{1,4}$/u.test(a ?? '') && /^\d+$/u.test(b ?? '')) {
      const porta = Number.parseInt(a, 16);
      if (portaValida(porta)) ascolto.set(b, porta);
    }
  }
  const esito = new Map();
  for (const [inode, porta] of ascolto) {
    const marcatore = inodeDi.get(inode);
    if (!marcatore) continue;
    if (!esito.has(marcatore)) esito.set(marcatore, new Set());
    esito.get(marcatore).add(porta);
  }
  return new Map([...esito].map(([m, s]) => [m, [...s].sort((x, y) => x - y)]));
}

/**
 * Linux: le porte in ascolto dell'albero di ogni radice, lette da `/proc` dentro il processo (nessun programma lanciato). Le regole sono
 *   quelle di VS Code (`src/vs/workbench/api/node/extHostTunnelService.ts`, ramo main, letto il 29/10/2026): `/proc/net/tcp` e `tcp6`,
 *   solo lo stato `0A` (in ascolto), la porta è la parte esadecimale dopo i due punti dell'indirizzo locale, l'inode è la decima colonna
 *   in decimale; il processo che tiene il socket si trova dai link `socket:[inode]` in `/proc/<pid>/fd`. Il nostro in più: si guarda
 *   solo l'albero della conversazione (VS Code guarda tutti i processi), e i PID riusati restano fuori come su Windows.
 * ⛔ Se `/proc/net/tcp` non si legge si LANCIA: chi chiama non inventa porte. È il caso di Android, dove dal 10 SELinux lo nega alle app.
 * @returns {Map<number, number[]|null>} `null` = la radice non c'è più
 */
export function porteLinuxPerRadice({ readdirSync: leggiCartella, readFileSync: leggiFile, readlinkSync: leggiLink }, radici) {
  const ascolto = new Map(); // inode → porta
  let letto = false;
  for (const nome of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let testo;
    try { testo = leggiFile(nome, 'utf8'); letto = true; } catch { continue; }
    for (const riga of String(testo).split('\n').slice(1)) {
      const c = riga.trim().split(/\s+/u);
      if (c.length < 10 || c[3] !== '0A' || !/^\d+$/u.test(c[9]) || c[9] === '0') continue;
      const esadecimale = c[1].split(':').pop();
      if (!/^[0-9A-Fa-f]{1,4}$/u.test(esadecimale ?? '')) continue;
      const porta = Number.parseInt(esadecimale, 16);
      if (portaValida(porta)) ascolto.set(c[9], porta);
    }
  }
  if (!letto) throw new Error('/proc/net/tcp is not readable');
  const righe = [];
  for (const nome of leggiCartella('/proc')) {
    if (!/^\d+$/u.test(nome)) continue;
    let stat;
    try { stat = String(leggiFile(`/proc/${nome}/stat`, 'utf8')); } catch { continue; }
    const chiusa = stat.lastIndexOf(')'); // il nome del comando può contenere spazi e parentesi
    if (chiusa < 0) continue;
    const campi = stat.slice(chiusa + 2).split(' ');
    righe.push([Number(nome), Number(campi[1]), 0, 0, Number(campi[19])]);
  }
  const tabella = tabellaDaRighe(righe);
  const esito = new Map();
  for (const radice of radici) {
    const albero = pidDellAlbero(tabella, radice);
    if (!albero.size) { esito.set(radice, null); continue; }
    const porte = new Set();
    for (const pid of albero) {
      let fd;
      try { fd = leggiCartella(`/proc/${pid}/fd`); } catch { continue; } // finito nel frattempo, o non nostro
      for (const voce of fd) {
        let link;
        try { link = String(leggiLink(`/proc/${pid}/fd/${voce}`)); } catch { continue; }
        const inode = /^socket:\[(\d+)\]$/u.exec(link)?.[1];
        if (inode && ascolto.has(inode)) porte.add(ascolto.get(inode));
      }
    }
    esito.set(radice, [...porte].sort((a, b) => a - b));
  }
  return esito;
}

/**
 * Il lettore delle porte esiste qui? Windows sempre; Linux solo se `/proc/net/tcp` si legge davvero (un contenitore blindato può
 * negarlo, e allora pretendere la porta spegnerebbe ogni server «pronto»); altrove no.
 */
export function lettorePorteDisponibile({ piattaforma = process.platform, readFileSync: leggiFile = readFileSync } = {}) {
  if (piattaforma === 'win32') return true;
  if (piattaforma !== 'linux') return false;
  for (const nome of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try { leggiFile(nome, 'utf8'); return true; } catch { /* l'altro */ }
  }
  return false;
}

/**
 * Il lettore delle porte: `leggi({ pid: [radici], wsl: [{distro, marcatore}] })` ⇒ `{ perPid: Map<pid, porte[]|null>, perMarcatore:
 * Map<'distro:marcatore', porte[]> }`. `null` = il processo non c'è più. Un guasto di lettura non inventa porte (la chiave manca).
 */
export function creaLettorePorte({ piattaforma = process.platform, spawnFn, spentoDopoMs = 30_000, attesaMassimaMs = 8_000,
  impostaTimer = setTimeout, cancellaTimer = clearTimeout, fsProc = { readdirSync, readFileSync, readlinkSync } } = {}) {
  const lettori = new Map();
  const opzioni = { spentoDopoMs, attesaMassimaMs, impostaTimer, cancellaTimer };
  const lettore = (chiave, avvia) => {
    if (!lettori.has(chiave)) lettori.set(chiave, creaLettorePersistente({ ...opzioni, avvia }));
    return lettori.get(chiave);
  };
  return {
    async leggi({ pid = [], wsl = [] } = {}) {
      const radici = [...new Set(pid.filter((p) => Number.isSafeInteger(p) && p > 0))];
      const perPid = new Map();
      const perMarcatore = new Map();
      if (radici.length && piattaforma === 'win32' && typeof spawnFn === 'function') {
        try {
          const righe = await lettore('windows', () => spawnFn(percorsoPowershell(process.env.SystemRoot),
            ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(COPIONE_PORTE_WINDOWS, 'utf16le').toString('base64')], { windowsHide: true })).leggi();
          for (const [radice, porte] of porteWindowsPerRadice(JSON.parse(righe.join('')), radici)) perPid.set(radice, porte);
        } catch { /* nessuna porta inventata */ }
      }
      if (radici.length && piattaforma === 'linux') {
        try { for (const [radice, porte] of porteLinuxPerRadice(fsProc, radici)) perPid.set(radice, porte); } catch { /* nessuna porta inventata */ }
      }
      const marcati = wsl.filter((v) => typeof v?.distro === 'string' && /^[A-Za-z0-9._-]{1,64}$/u.test(v.distro) && MARCATORE_VALIDO.test(v?.marcatore ?? ''));
      if (marcati.length && piattaforma === 'win32' && typeof spawnFn === 'function') {
        for (const distro of new Set(marcati.map((v) => v.distro))) {
          try {
            const righe = await lettore(`wsl:${distro}`, () => spawnFn(percorsoWsl(process.env.SystemRoot), ['-d', distro, '-u', 'root', '--exec', 'sh', '-c', COPIONE_PORTE_WSL], { windowsHide: true })).leggi();
            const porte = porteWslPerMarcatore(righe);
            for (const v of marcati.filter((x) => x.distro === distro)) perMarcatore.set(`${distro}:${v.marcatore}`, porte.get(v.marcatore) ?? []);
          } catch { /* nessuna porta inventata */ }
        }
      }
      return { perPid, perMarcatore };
    },
    chiudi() { for (const l of lettori.values()) l.spegni(); lettori.clear(); },
  };
}

/**
 * «Pronto» solo se la porta risponde a una GET su loopback (qualunque stato HTTP: anche un 404 è un server vivo). Prima 127.0.0.1 poi
 * ::1 (Vite 5 su Node 18+ ascolta su `localhost`, che può essere solo IPv6). Mai un indirizzo che non sia di questo computer.
 * @returns {Promise<string|null>} l'origine che ha risposto (`http://127.0.0.1:5173`), o null
 */
export async function rispondeLaPorta(porta, { fetchFn = globalThis.fetch, attesaMs = 1_500 } = {}) {
  if (!portaValida(porta) || typeof fetchFn !== 'function') return null;
  for (const origine of [`http://127.0.0.1:${porta}`, `http://[::1]:${porta}`]) {
    const ferma = new AbortController();
    const t = setTimeout(() => ferma.abort(), attesaMs);
    t.unref?.();
    try {
      const r = await fetchFn(`${origine}/`, { method: 'GET', redirect: 'manual', signal: ferma.signal });
      try { await r?.body?.cancel?.(); } catch { /* il corpo non serve */ }
      if (r && Number.isInteger(r.status)) return origine;
    } catch { /* non risponde su questa famiglia: si prova l'altra */ } finally { clearTimeout(t); }
  }
  return null;
}

/* ===================================================================================================================================
 * Terza parte: il SORVEGLIANTE di una conversazione — incrocia le due fonti e decide «pronto» e «fermato».
 *   · dall'uscita arriva l'indirizzo e il nome del framework (`dallUscita`); dalle porte in ascolto la porta VERA (`campiona`);
 *   · un server è «pronto» solo quando la porta risponde (`rispondeLaPorta`): prima, non si annuncia niente (niente rumore);
 *   · «fermato» quando il processo è finito o la porta non è più in ascolto né risponde;
 *   · un indirizzo letto nell'uscita che non è MAI diventato pronto, mentre le porte del suo processo sono note e non lo contengono,
 *     si toglie in silenzio: è la porta che Vite ha lasciato per la successiva (stampa la 5174, ma un banner vecchio può dire 5173).
 *   `onCambio(sessionId, server)` solo sui cambi che la persona vede: nuovo pronto, pronto → fermato, framework scoperto dopo.
 * =================================================================================================================================== */

/* Un comando si riconosce per il suo `toolCallId` (lo stesso per l'uscita e per `pidDeiComandi`); senza, per PID o marcatore WSL. */
const chiaveProcesso = (p) => (typeof p?.toolCallId === 'string' && p.toolCallId ? `tc:${p.toolCallId}` : Number.isSafeInteger(p?.pid) ? `pid:${p.pid}` : p?.wsl ? `wsl:${p.wsl.distro}:${p.wsl.marcatore}` : null);

/**
 * @param {object} opzioni
 * @param {{ leggi: Function }} opzioni.lettorePorte  `creaLettorePorte()`
 * @param {Function} [opzioni.sonda]  `(porta) => Promise<origine|null>`, di serie `rispondeLaPorta`
 * @param {Function} [opzioni.onCambio]  `(sessionId, server) => void`
 * @param {Function} [opzioni.ora]
 */
/*
 * Revisione avversaria del blocco 20 (R1): un indirizzo STAMPATO non basta. `echo http://localhost:4174` (o un grep di un file) rendeva
 *   «pronto della conversazione» il server di TALOS stesso o quello di un'altra conversazione, e il modello poteva aprirlo con
 *   `local_page`. Con `richiediPorta` (di serie dove il lettore delle porte esiste: Windows, e WSL attraverso Windows) una porta passa a
 *   «pronto» solo quando il lettore dice che la ascolta un processo della conversazione (`daPorta`); l'uscita resta il segnale che la fa
 *   cercare prima. Come VS Code, che tiene separati il rilevamento dai processi e quello dall'uscita (note di VS Code Remote 1.54).
 *   ⛔ Dove il lettore non c'è resta il comportamento di prima: dichiarato. Dal 29/10/2026 c'è anche su Linux (`porteLinuxPerRadice`,
 *   `/proc`); resta fuori Android, dove `/proc/net/tcp` è negato alle app.
 */
export function creaSorveglianteServerLocali({ lettorePorte, sonda = rispondeLaPorta, onCambio = () => {}, ora = () => Date.now(),
  richiediPorta = lettorePorteDisponibile() } = {}) {
  const perSessione = new Map(); // sessionId → Map<porta, server>
  const tabella = (sessionId) => {
    if (!perSessione.has(sessionId)) perSessione.set(sessionId, new Map());
    return perSessione.get(sessionId);
  };
  const pubblico = (s) => ({ porta: s.porta, origine: s.origine, framework: s.framework, comando: s.comando, toolCallId: s.toolCallId, stato: s.stato,
    fonti: [s.daUscita ? 'uscita' : null, s.daPorta ? 'porta' : null].filter(Boolean), aggiornatoAlle: s.aggiornatoAlle });
  const annuncia = (sessionId, s) => { s.aggiornatoAlle = ora(); try { onCambio(sessionId, pubblico(s)); } catch { /* chi ascolta non ferma il sorvegliante */ } };
  const prova = async (sessionId, s) => {
    if (s.provando) return;
    s.provando = true;
    try {
      const origine = await sonda(s.porta);
      if (tabella(sessionId).get(s.porta) !== s) return; // tolto nel frattempo
      if (origine && s.stato !== 'pronto' && (!richiediPorta || s.daPorta)) { s.stato = 'pronto'; s.origine = origine; annuncia(sessionId, s); }
    } finally { s.provando = false; }
  };
  const inserisci = (sessionId, porta, { processo, comando, framework, daUscita = false, daPorta = false }) => {
    const t = tabella(sessionId);
    let s = t.get(porta);
    if (!s || s.stato === 'fermato') {
      s = { porta, origine: null, framework: null, comando: null, toolCallId: typeof processo?.toolCallId === 'string' ? processo.toolCallId : null,
        stato: 'in-avvio', processo: chiaveProcesso(processo), daUscita: false, daPorta: false, aggiornatoAlle: ora() };
      t.set(porta, s);
    }
    if (daUscita) s.daUscita = true;
    if (daPorta) s.daPorta = true;
    if (comando && !s.comando) s.comando = String(comando).slice(0, 200);
    if (framework && s.framework !== framework) {
      s.framework = framework;
      if (s.stato === 'pronto') annuncia(sessionId, s);
    }
    return s;
  };

  return {
    /** Indirizzi letti nell'uscita di un processo della conversazione (dal lettore dell'uscita). */
    dallUscita(sessionId, processo, { indirizzi = [], framework = null } = {}, comando = null) {
      for (const { porta } of indirizzi) {
        if (!portaValida(porta)) continue;
        void prova(sessionId, inserisci(sessionId, porta, { processo, comando, framework, daUscita: true }));
      }
    },
    /**
     * Un giro di misura: `processi` sono i comandi VIVI della conversazione `[{ pid } | { wsl: {distro, marcatore} }, comando]`.
     * Si chiama solo mentre la conversazione ne ha (niente lavoro a vuoto).
     */
    async campiona(sessionId, processi = []) {
      const vivi = processi.filter((p) => chiaveProcesso(p));
      const { perPid, perMarcatore } = await lettorePorte.leggi({
        pid: vivi.filter((p) => Number.isSafeInteger(p.pid)).map((p) => p.pid),
        wsl: vivi.filter((p) => p.wsl).map((p) => p.wsl),
      });
      const porteDi = new Map(); // chiave processo → porte[] | null (finito) ; assente = non si sa
      for (const p of vivi) {
        const k = chiaveProcesso(p);
        if (Number.isSafeInteger(p.pid) && perPid.has(p.pid)) porteDi.set(k, perPid.get(p.pid));
        else if (p.wsl && perMarcatore.has(`${p.wsl.distro}:${p.wsl.marcatore}`)) porteDi.set(k, perMarcatore.get(`${p.wsl.distro}:${p.wsl.marcatore}`));
      }
      const inAscolto = new Set();
      for (const p of vivi) {
        const porte = porteDi.get(chiaveProcesso(p));
        for (const porta of porte ?? []) {
          inAscolto.add(porta);
          void prova(sessionId, inserisci(sessionId, porta, { processo: p, comando: p.comando, daPorta: true }));
        }
      }
      const t = tabella(sessionId);
      const conosciuti = new Set(vivi.map(chiaveProcesso));
      for (const s of [...t.values()]) {
        if (s.stato === 'fermato' || inAscolto.has(s.porta)) continue;
        const delMio = s.processo && porteDi.has(s.processo);
        const finito = s.processo && (!conosciuti.has(s.processo) || porteDi.get(s.processo) === null);
        if (s.stato !== 'pronto') {
          // mai stato pronto: se il suo processo è finito o le sue porte note non lo contengono, era un indirizzo vecchio
          if (finito || delMio) t.delete(s.porta);
          continue;
        }
        if (finito || delMio || !(await sonda(s.porta))) { s.stato = 'fermato'; annuncia(sessionId, s); }
      }
    },
    /** I server della conversazione, pronti e fermati, per la striscia del Browser e per l'attrezzo del modello. */
    elenco(sessionId) {
      return [...(perSessione.get(sessionId)?.values() ?? [])].filter((s) => s.stato !== 'in-avvio').map(pubblico).sort((a, b) => a.porta - b.porta);
    },
    /** Le porte che il modello può guardare: solo quelle PRONTE di questa conversazione. */
    portaDellaSessione(sessionId, porta) {
      return perSessione.get(sessionId)?.get(porta)?.stato === 'pronto';
    },
    dimentica(sessionId) { perSessione.delete(sessionId); },
    /** Le conversazioni con un server non ancora fermato: vanno campionate anche quando il comando è finito, per dire «fermato». */
    sessioniAttive() { return [...perSessione].filter(([, t]) => [...t.values()].some((s) => s.stato !== 'fermato')).map(([id]) => id); },
  };
}
