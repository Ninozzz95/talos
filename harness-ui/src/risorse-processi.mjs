/*
 * ⭐ C1 (owner 10/10/2026) — CPU E MEMORIA DEI COMANDI DELLA SCHEDA «PROCESSI», misurate da noi, SOLO a scheda aperta.
 *
 * Decisioni dell'owner (AskUserQuestion): «Misurarle noi, solo a scheda aperta», e poi «Anche WSL, adesso». La prima è nata da una
 *   scoperta nel codice dei concorrenti: Codex dichiara `cpu_percent` e `rss_kb` per ogni terminale in sottofondo
 *   (`app-server-protocol/src/protocol/v2/thread.rs:1222-1230`) ma li riempie SEMPRE a `None` (`app-server/src/request_processors/
 *   thread_processor.rs:2393-2395`); Hermes li misura con `psutil` solo nel cruscotto del plugin kanban (`plugins/kanban/dashboard/
 *   plugin_api.py:956-964`). La seconda da una misura sulle sessioni vere dell'owner: nella più attiva 253 esiti su 253 dicono
 *   `[sandbox: wsl2 …]` — i comandi girano in WSL, e una misura solo di Windows avrebbe detto «—» quasi sempre.
 *
 * Come si misura:
 *   · Windows (i comandi lanciati da `eseguiSuWindows`): il PID della SHELL (`shell: true`), e si somma l'ALBERO dei discendenti. `wmic`
 *     è rimosso da Windows 11 nel 2026 (Microsoft, KB5067470): `Get-CimInstance Win32_Process`. Un PowerShell NUOVO a ogni campione
 *     costa 1,3-1,6 s (misurato il 10/10/2026, quasi tutto avvio): ce n'è UNO che resta aperto e legge su richiesta — 31-75 ms a
 *     campione, 276 processi in 13,7 KB. Un «figlio» nato prima della radice è un PID riusato: si esclude.
 *   · WSL (i comandi in Linux): da Windows il PID sarebbe quello di `wsl.exe`, che non dice niente del comando. Il kernel mette in
 *     testa allo script `export TALOS_CMD_ID='<marcatore>'` (un UUID suo, non un testo del modello), che ogni discendente EREDITA; un
 *     `sh` dentro la distro (uno per distro, anche lui persistente, come root per leggere `/proc/<pid>/environ` di tutti: un
 *     processo passato a un altro utente, `sudo`, non si leggerebbe. ⛔ Non è un'elevazione: `wsl -u root` non chiede password,
 *     quindi non dà niente che l'utente di Windows non abbia già — review N2 del 10/10, scritto perché nessuno lo «corregga») somma i processi col marcatore — 72-100 ms a
 *     campione (misurato il 10/10/2026 su Ubuntu). Più solido dell'albero: segue anche i processi che cambiano padre.
 *   · Linux ospite: `/proc` direttamente. Anche Android (lane mobile, 15/10/2026: r4 dentro l'app, `process.platform === 'android'`,
 *     e `metodo: null` sul Pad): lo stesso `/proc`, dove l'app vede i suoi processi — il comando e i suoi figli sono suoi.
 *   · Altrove: niente misura, e l'interfaccia dice «—».
 * La CPU è la differenza fra due campioni dei tempi, normalizzata sui core come Gestione attività (0-100 %); al primo campione non
 *   c'è ancora (`null`). Ogni lettore persistente si spegne da solo dopo `spentoDopoMs` senza richieste: con la scheda chiusa non gira
 *   niente. Una lettura fallita non inventa numeri.
 */
import { spawn as spawnReale } from 'node:child_process';
import { readdirSync as readdirReale, readFileSync as readFileReale, readlinkSync as readlinkReale } from 'node:fs';
import { availableParallelism, cpus } from 'node:os';
import { percorsoPowershell, percorsoWsl } from './taskkill-di-sistema.mjs';

const FINE = 'FINE';
/*
 * ⭐ P-05 (pannello v2, owner 29/10/2026) — le PORTE IN ASCOLTO dell'albero di un comando, nello stesso campione della CPU, per il
 *   chip «localhost:5173 · Apri nel Browser» della scheda Processi. Windows: `Get-NetTCPConnection` (Microsoft Learn, letto il
 *   29/10/2026), filtrato su `OwningProcess` ⇒ `[[pid, porta], …]` sulla riga «PORTE».
 * ⛔ `-State Listen` su questa macchina ha MENTITO (memoria del 29/10 «riavviato = il PID nuovo sulla porta»): misurato il 29/10,
 *   78 socket in ascolto riportano `State` = 0 (vuoto) e nessuno «Listen»; il 4174 dell'owner è fra loro. Si prende quindi lo
 *   stato 2 (Listen) OPPURE lo stato 0 con il remoto «0.0.0.0»/«::» e porta remota 0. ⛔ AL CONTRARIO: i socket «Bound» (100) e
 *   «Closed» (1) hanno anche loro il remoto 0.0.0.0 e porta 0, e NON sono in ascolto: lo stato li esclude. ⛔⛔ E un CLIENT
 *   connesso lascia qui un fantasma: stato 0, locale 0.0.0.0 sulla SUA porta d'uscita, accanto alla sua riga «Established» (misurato
 *   il 29/10 dalla prova P05-04, che era rossa). ⇒ Uno stato 0 su 0.0.0.0/:: vale solo se lo stesso PID non ha una connessione
 *   stabilita su quella porta; uno stato 0 su un indirizzo preciso (127.0.0.1: il 4174) vale sempre. Limite dichiarato: un server
 *   legato a 0.0.0.0 CON connessioni aperte non mostra la porta (nessun numero inventato, mai uno sbagliato). Prove P05-* in
 *   `c1-risorse-processi.test.mjs`). Linux: `/proc/net/tcp{,6}` stato `0A` e gli inode dei socket in `/proc/<pid>/fd`.
 *   WSL: non misurato (le porte di una distro non sono del PID di Windows) ⇒ `null`, nessun numero inventato.
 */
const PORTE = 'PORTE';
/* Windows: una riga «leggi» ⇒ una riga JSON [[pid, ppid, workingSetByte, tempoCpu100ns, natoMs], …] e poi FINE */
const COPIONE_WINDOWS = `$ErrorActionPreference = 'SilentlyContinue'
while ($null -ne ($r = [Console]::In.ReadLine())) {
  $righe = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,KernelModeTime,UserModeTime,CreationDate | ForEach-Object {
    ,@([long]$_.ProcessId, [long]$_.ParentProcessId, [long]$_.WorkingSetSize, ([long]$_.KernelModeTime + [long]$_.UserModeTime), $(if ($_.CreationDate) { [long]($_.CreationDate.ToFileTimeUtc() / 10000) } else { 0 }))
  })
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $righe -Compress -Depth 3))
  $tutte = @(Get-NetTCPConnection -ErrorAction SilentlyContinue)
  $stabilite = @{}; foreach ($c in $tutte) { if ([int]$c.State -eq 5) { $stabilite["$($c.OwningProcess):$($c.LocalPort)"] = 1 } }
  $porte = @($tutte | Where-Object { $_.RemotePort -eq 0 -and ([int]$_.State -eq 2 -or ([int]$_.State -eq 0 -and ($_.RemoteAddress -eq '0.0.0.0' -or $_.RemoteAddress -eq '::') -and (($_.LocalAddress -ne '0.0.0.0' -and $_.LocalAddress -ne '::') -or -not $stabilite.ContainsKey("$($_.OwningProcess):$($_.LocalPort)")))) } | ForEach-Object { ,@([long]$_.OwningProcess, [long]$_.LocalPort) })
  [Console]::Out.WriteLine('${PORTE} ' + (ConvertTo-Json -InputObject $porte -Compress -Depth 3))
  [Console]::Out.WriteLine('${FINE}')
  [Console]::Out.Flush()
}`;
/* WSL: una riga ⇒ «<marcatore> <campi di /proc/<pid>/stat dopo il nome>» per ogni processo marcato, e poi FINE. Due fork a processo
   (grep -z legge l'ambiente separato da NUL; `read` è interno alla shell). */
export const COPIONE_WSL = `while read -r _; do
for d in /proc/[0-9]*; do
  m=$(grep -az '^TALOS_CMD_ID=' "$d/environ" 2>/dev/null | tr -d '\\000')
  [ -n "$m" ] || continue
  read -r s < "$d/stat" 2>/dev/null || continue
  printf '%s %s\\n' "\${m#TALOS_CMD_ID=}" "\${s##*) }"
done
echo ${FINE}
done`;
export const MARCATORE_VALIDO = /^[A-Za-z0-9_-]{1,100}$/u;

/** Le righe grezze in una tabella `pid → { ppid, memoria, cpu100ns, nato }`. Righe malformate si saltano. */
export function tabellaDaRighe(righe) {
  const tabella = new Map();
  for (const r of Array.isArray(righe) ? righe : []) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const [pid, ppid, memoria, cpu100ns, nato] = r.map(Number);
    if (!Number.isSafeInteger(pid) || pid <= 0) continue;
    tabella.set(pid, { ppid: Number.isSafeInteger(ppid) ? ppid : 0, memoria: Number.isFinite(memoria) && memoria >= 0 ? memoria : 0,
      cpu100ns: Number.isFinite(cpu100ns) && cpu100ns >= 0 ? cpu100ns : 0, nato: Number.isFinite(nato) ? nato : 0 });
  }
  return tabella;
}

/**
 * L'albero di `radice` nella tabella: la radice e i suoi discendenti, senza i PID riusati (un figlio nato prima del padre non è suo).
 * @returns {{ processi:number, memoria:number, cpu100ns:number }|null} `null` se la radice non c'è più
 */
export function sommaAlbero(tabella, radice) {
  const visti = pidDellAlbero(tabella, radice);
  if (!visti) return null;
  let memoria = 0, cpu100ns = 0;
  for (const pid of visti) { const r = tabella.get(pid); memoria += r.memoria; cpu100ns += r.cpu100ns; }
  return { processi: visti.size, memoria, cpu100ns };
}

/** I PID dell'albero di `radice` (lei e i discendenti, senza i PID riusati), o `null` se la radice non c'è più. */
export function pidDellAlbero(tabella, radice) {
  if (!tabella.get(radice)) return null;
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
      if (r.nato && rf.nato && rf.nato < r.nato) continue; // PID riusato: nato prima del suo «padre»
      visti.add(f); coda.push(f);
    }
  }
  return visti;
}

/** La riga «PORTE [[pid, porta], …]» del lettore di Windows in `pid → Set(porte)`. Una riga illeggibile = nessuna porta nota (null). */
export function portePerPid(riga) {
  if (typeof riga !== 'string' || !riga.startsWith(`${PORTE} `)) return null;
  let coppie;
  try { coppie = JSON.parse(riga.slice(PORTE.length + 1)); } catch { return null; }
  /* ConvertTo-Json di una sola coppia la appiattisce in [pid, porta]: si rimette in lista */
  if (Array.isArray(coppie) && coppie.length === 2 && coppie.every((x) => typeof x === 'number')) coppie = [coppie];
  const mappa = new Map();
  for (const c of Array.isArray(coppie) ? coppie : []) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const [pid, porta] = c.map(Number);
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(porta) || porta <= 0 || porta > 65535) continue;
    if (!mappa.has(pid)) mappa.set(pid, new Set());
    mappa.get(pid).add(porta);
  }
  return mappa;
}

/** Linux: le porte in ascolto (stato `0A`) di `/proc/net/tcp{,6}` e i PID che ne tengono il socket, solo per i PID chiesti. */
export function portePerPidDaProc(pids, { readFileSync, readdirSync, readlinkSync }) {
  const perInode = new Map();
  let letti = 0;
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let testo = '';
    try { testo = readFileSync(file, 'utf8'); letti += 1; } catch { continue; }
    for (const riga of testo.split('\n').slice(1)) {
      const c = riga.trim().split(/\s+/u);
      if (c.length < 10 || c[3] !== '0A') continue;
      const porta = Number.parseInt(c[1].split(':')[1] ?? '', 16);
      if (Number.isSafeInteger(porta) && porta > 0) perInode.set(c[9], porta);
    }
  }
  if (!letti) return null; // nessuna tabella leggibile: porte NON misurate (null), non «nessuna porta»
  const mappa = new Map();
  if (!perInode.size) return mappa;
  for (const pid of pids) {
    let fd = [];
    try { fd = readdirSync(`/proc/${pid}/fd`); } catch { continue; }
    for (const n of fd) {
      let dove = '';
      try { dove = readlinkSync(`/proc/${pid}/fd/${n}`); } catch { continue; }
      const m = /^socket:\[(\d+)\]$/u.exec(dove);
      if (!m || !perInode.has(m[1])) continue;
      if (!mappa.has(pid)) mappa.set(pid, new Set());
      mappa.get(pid).add(perInode.get(m[1]));
    }
  }
  return mappa;
}

/**
 * Le righe del lettore WSL sommate per marcatore: `marcatore → { processi, memoria, cpu100ns }`. I campi dopo il nome sono quelli di
 * proc(5) dal 3 in poi: [0] state … [11] utime, [12] stime, [21] rss (tick a 100 Hz, pagine da 4 KiB).
 */
export function sommaPerMarcatore(righe) {
  const somme = new Map();
  for (const riga of Array.isArray(righe) ? righe : []) {
    const campi = String(riga).trim().split(/\s+/u);
    const marcatore = campi.shift();
    if (!marcatore || !MARCATORE_VALIDO.test(marcatore) || campi.length < 22) continue;
    const tick = Number(campi[11]) + Number(campi[12]);
    const rss = Number(campi[21]);
    if (!Number.isFinite(tick) || !Number.isFinite(rss)) continue;
    const s = somme.get(marcatore) ?? { processi: 0, memoria: 0, cpu100ns: 0 };
    s.processi += 1; s.memoria += rss * 4096; s.cpu100ns += tick * 100_000;
    somme.set(marcatore, s);
  }
  return somme;
}

/* Linux ospite: /proc. I tempi sono in tick (USER_HZ, 100 su ogni Linux reale) e l'rss in pagine (4 KiB). */
function righeDaProc({ readdirSync, readFileSync }) {
  const righe = [];
  for (const nome of readdirSync('/proc')) {
    if (!/^\d+$/.test(nome)) continue;
    let testo;
    try { testo = readFileSync(`/proc/${nome}/stat`, 'utf8'); } catch { continue; }
    const chiusa = testo.lastIndexOf(')'); // il nome del comando può contenere spazi e parentesi
    if (chiusa < 0) continue;
    const campi = testo.slice(chiusa + 2).split(' ');
    const ppid = Number(campi[1]);
    const tick = Number(campi[11]) + Number(campi[12]);
    const inizio = Number(campi[19]);
    const rssPagine = Number(campi[21]);
    righe.push([Number(nome), ppid, rssPagine * 4096, tick * 100_000, inizio * 10]);
  }
  return righe;
}

/**
 * I core su cui si normalizza la CPU. ⛔ Lane mobile, 15/10/2026: sul Pad `os.cpus()` restituisce una lista VUOTA (Android nasconde
 *   le CPU alle app) mentre i core sono 8 (`nproc`, `availableParallelism()`): col solo `cpus()` il divisore era 1, e un comando che
 *   tiene occupato un core diceva 99,4 % invece di ~12 %. `availableParallelism` (Node ≥ 18.14) conta i core che il processo può
 *   usare; si prende `cpus()` quando c'è, per non cambiare niente dove funzionava già.
 */
export function coreDellaMacchina({ cpusFn = cpus, parallelismoFn = availableParallelism } = {}) {
  let n = 0;
  try { n = cpusFn()?.length || 0; } catch { n = 0; }
  if (!n) { try { n = typeof parallelismoFn === 'function' ? Number(parallelismoFn()) || 0 : 0; } catch { n = 0; } }
  return Math.max(1, n);
}

/*
 * Un lettore persistente: un processo che a ogni riga sull'ingresso risponde con righe e poi «FINE». Si accende alla prima lettura, si
 * spegne dopo `spentoDopoMs` senza richieste, e una lettura che non torna entro `attesaMassimaMs` lo spegne (la prossima lo riaccende).
 */
export function creaLettorePersistente({ avvia, spentoDopoMs, attesaMassimaMs, impostaTimer, cancellaTimer }) {
  let figlio = null, coda = '', raccolte = [], attese = [], timerSpegnimento = null;
  const spegni = () => {
    if (timerSpegnimento) { cancellaTimer(timerSpegnimento); timerSpegnimento = null; }
    const f = figlio; figlio = null; coda = ''; raccolte = [];
    for (const a of attese.splice(0)) a.rifiuta(new Error('reader stopped'));
    try { f?.stdin?.end(); } catch { /* già chiuso */ }
    try { f?.kill(); } catch { /* già uscito */ }
  };
  const accendi = () => {
    const f = avvia();
    f.stdout?.setEncoding?.('utf8');
    f.stdout?.on('data', (pezzo) => {
      coda += pezzo;
      let i;
      while ((i = coda.indexOf('\n')) >= 0) {
        const riga = coda.slice(0, i).replace(/\r$/u, ''); coda = coda.slice(i + 1);
        if (riga === FINE) { const r = raccolte; raccolte = []; attese.shift()?.risolvi(r); } else if (riga) raccolte.push(riga);
      }
    });
    f.stderr?.on('data', () => { /* l'avanzamento di PowerShell («#< CLIXML») e gli avvisi di wsl.exe: rumore */ });
    const caduto = () => { if (figlio === f) { figlio = null; raccolte = []; for (const a of attese.splice(0)) a.rifiuta(new Error('reader exited')); } };
    f.on?.('exit', caduto);
    f.on?.('error', caduto);
    f.unref?.(); f.stdin?.unref?.(); f.stdout?.unref?.(); f.stderr?.unref?.(); // il server deve poter uscire con un lettore acceso
    return f;
  };
  return {
    leggi() {
      if (timerSpegnimento) cancellaTimer(timerSpegnimento);
      timerSpegnimento = impostaTimer(spegni, spentoDopoMs);
      timerSpegnimento?.unref?.();
      return new Promise((risolvi, rifiuta) => {
        figlio ??= accendi();
        const voce = {};
        const t = impostaTimer(() => { if (attese.includes(voce)) spegni(); rifiuta(new Error('reader timed out')); }, attesaMassimaMs);
        t?.unref?.();
        voce.risolvi = (r) => { cancellaTimer(t); risolvi(r); };
        voce.rifiuta = (e) => { cancellaTimer(t); rifiuta(e); };
        attese.push(voce);
        try { figlio.stdin.write('leggi\n'); } catch (e) { voce.rifiuta(e); }
      });
    },
    spegni,
  };
}

/**
 * @param {object} [opzioni]
 * @param {string} [opzioni.piattaforma]
 * @param {number} [opzioni.spentoDopoMs] dopo quanto senza richieste un lettore persistente si spegne
 * @param {number} [opzioni.attesaMassimaMs] una lettura che non torna entro questo tempo: si spegne e si risponde senza misura
 */
export function creaCampionatoreRisorse({
  piattaforma = process.platform,
  spawnFn = spawnReale,
  readdirSync = readdirReale,
  readFileSync = readFileReale,
  readlinkSync = readlinkReale,
  ora = () => Date.now(),
  core = coreDellaMacchina(),
  spentoDopoMs = 30_000,
  attesaMassimaMs = 8_000,
  dimenticaDopoMs = 30_000,
  impostaTimer = setTimeout,
  cancellaTimer = clearTimeout,
} = {}) {
  const metodo = piattaforma === 'win32' ? 'cim' : piattaforma === 'linux' || piattaforma === 'android' ? 'proc' : null;
  let chiuso = false;
  const precedenti = new Map(); // chiave della misura → { cpu100ns, istante }
  const lettori = new Map(); // 'windows' | `wsl:<distro>` → lettore persistente
  const opzioniLettore = { spentoDopoMs, attesaMassimaMs, impostaTimer, cancellaTimer };
  const lettoreWindows = () => {
    if (!lettori.has('windows')) lettori.set('windows', creaLettorePersistente({ ...opzioniLettore,
      /* G-R5 (block 10 review, 27/10/2026): PowerShell and WSL by their full path under SystemRoot, never by name */
      avvia: () => spawnFn(percorsoPowershell(process.env.SystemRoot), ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(COPIONE_WINDOWS, 'utf16le').toString('base64')], { windowsHide: true }) }));
    return lettori.get('windows');
  };
  const lettoreWsl = (distro) => {
    const chiave = `wsl:${distro}`;
    if (!lettori.has(chiave)) lettori.set(chiave, creaLettorePersistente({ ...opzioniLettore,
      avvia: () => spawnFn(percorsoWsl(process.env.SystemRoot), ['-d', distro, '-u', 'root', '--exec', 'sh', '-c', COPIONE_WSL], { windowsHide: true }) }));
    return lettori.get(chiave);
  };
  /* Il percento CPU fra questo campione e il precedente della stessa chiave; il primo non ce l'ha. */
  const cpuDa = (chiave, cpu100ns, adesso) => {
    const prima = precedenti.get(chiave);
    precedenti.set(chiave, { cpu100ns, istante: adesso });
    if (!prima || adesso <= prima.istante || cpu100ns < prima.cpu100ns) return null;
    const usatoMs = (cpu100ns - prima.cpu100ns) / 10_000;
    return Math.min(100, Math.round(((usatoMs / (adesso - prima.istante)) / core) * 1000) / 10);
  };

  return {
    metodo,
    /**
     * Misura i comandi vivi.
     * @param {{ pid?: number[], wsl?: {distro:string, marcatore:string}[] }} richiesta
     * @returns {Promise<{ metodo:string|null, perPid: Map<number, object|null>, perMarcatore: Map<string, object|null> }>}
     *   ogni misura è `{ cpuPercento:number|null, memoriaByte:number, processi:number }`, o `null` se non si è potuto misurare
     */
    async misura({ pid = [], wsl = [] } = {}) {
      const radici = [...new Set((Array.isArray(pid) ? pid : []).filter((p) => Number.isSafeInteger(p) && p > 0))];
      const marcati = (Array.isArray(wsl) ? wsl : []).filter((v) => typeof v?.distro === 'string' && /^[A-Za-z0-9._-]{1,64}$/u.test(v.distro) && MARCATORE_VALIDO.test(v?.marcatore ?? ''));
      const perPid = new Map(radici.map((p) => [p, null]));
      const perMarcatore = new Map(marcati.map((v) => [`${v.distro}:${v.marcatore}`, null]));
      const vive = new Set();
      const chiesti = new Set([...radici.map((p) => `pid:${p}`), ...marcati.map((v) => `wsl:${v.distro}:${v.marcatore}`)]);
      if (chiuso) return { metodo, perPid, perMarcatore };
      if (radici.length && metodo) {
        let tabella = null;
        let porte = null; // P-05: pid → Set(porte); null = non misurate (nessun numero inventato)
        try {
          if (metodo === 'cim') {
            const righe = await lettoreWindows().leggi();
            porte = portePerPid(righe.find((r) => r.startsWith(`${PORTE} `)));
            tabella = tabellaDaRighe(JSON.parse(righe.filter((r) => !r.startsWith(`${PORTE} `)).join('')));
          } else tabella = tabellaDaRighe(righeDaProc({ readdirSync, readFileSync }));
        } catch { tabella = null; } // una lettura fallita non inventa numeri: «—»
        const adesso = ora();
        const alberi = new Map(radici.map((p) => [p, tabella ? pidDellAlbero(tabella, p) : null]));
        if (tabella && metodo === 'proc') {
          try { porte = portePerPidDaProc(new Set([...alberi.values()].filter(Boolean).flatMap((v) => [...v])), { readFileSync, readdirSync, readlinkSync }); } catch { porte = null; }
        }
        for (const p of radici) {
          const albero = tabella ? sommaAlbero(tabella, p) : null;
          if (!albero) continue;
          vive.add(`pid:${p}`);
          const suePorte = porte ? [...new Set([...alberi.get(p)].flatMap((x) => [...(porte.get(x) ?? [])]))].sort((a, b) => a - b) : null;
          perPid.set(p, { cpuPercento: cpuDa(`pid:${p}`, albero.cpu100ns, adesso), memoriaByte: albero.memoria, processi: albero.processi, porte: suePorte });
        }
      }
      if (marcati.length && piattaforma === 'win32') {
        for (const distro of new Set(marcati.map((v) => v.distro))) {
          let somme = null;
          try { somme = sommaPerMarcatore(await lettoreWsl(distro).leggi()); } catch { somme = null; }
          const adesso = ora();
          for (const v of marcati.filter((x) => x.distro === distro)) {
            const s = somme?.get(v.marcatore);
            if (!s) continue;
            const chiave = `${distro}:${v.marcatore}`;
            vive.add(`wsl:${chiave}`);
            perMarcatore.set(chiave, { cpuPercento: cpuDa(`wsl:${chiave}`, s.cpu100ns, adesso), memoriaByte: s.memoria, processi: s.processi });
          }
        }
      }
      /* Review Y3 (10/10): il campionatore è UNO per server, e due finestre su sessioni diverse si alternano. Potare «ciò che questa
         richiesta non ha chiesto» cancellava la base dell'altra, e la CPU restava «—» per tutte e due. Ora si dimentica:
         - ciò che questa richiesta ha chiesto e non ha trovato (finito: un PID riusato non deve ereditare la sua base);
         - ciò che nessuno chiede da `dimenticaDopoMs`. */
      const adesso = ora();
      for (const [k, v] of [...precedenti]) if (chiesti.has(k) ? !vive.has(k) : adesso - v.istante > dimenticaDopoMs) precedenti.delete(k);
      return { metodo, perPid, perMarcatore };
    },
    /** Chiude: spegne tutti i lettori e non ne accende più. */
    chiudi() { chiuso = true; for (const l of lettori.values()) l.spegni(); lettori.clear(); },
  };
}
