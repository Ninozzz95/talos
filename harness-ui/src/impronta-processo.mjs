/*
 * ⛔ Owner, 17/10/2026 («Adottarli come Hermes, con "Ferma"») — L'IMPRONTA D'AVVIO DI UN PROCESSO, contro il riuso dei PID.
 *
 * Un comando messo in sottofondo sopravvive a una morte di colpo del server (SIGKILL, force-stop di Android, crash; su Windows anche
 *   `taskkill /F` del padre: misurato il 17/10 da Nino1, il `ping` resta vivo figlio della sua shell). Al riavvio la riga diceva «Non più
 *   seguito» e nessuno lo poteva fermare. Per riprenderlo bisogna sapere che il numero è ancora QUEL processo: i PID si riusano.
 *
 * Come Hermes (`tools/process_registry.py:552` `host_start_time`; `gateway/status.py:469-501` `_get_process_start_time`;
 *   `tools/process_registry_checkpoint.py:86-92`: un PID vivo con un'ora d'avvio diversa non si adotta e non si segnala):
 *   · Linux e Android: il campo 22 di `/proc/<pid>/stat` (tick dall'avvio della macchina). ⭐ Più di Hermes, in due punti:
 *     - si legge DOPO l'ultima `)`, perché il nome del comando può contenere spazi e parentesi (Hermes fa `split()[21]`, che con un
 *       nome come `my prog` legge il campo sbagliato) — è la stessa lettura di `risorse-processi.mjs`;
 *     - si aggiunge l'identità dell'avvio della macchina (`/proc/sys/kernel/random/boot_id`), quando si legge: i tick ripartono a
 *       ogni accensione, e una riga sul giornale sopravvive a un riavvio della macchina. Se non si legge vale «-»: due letture sulla
 *       stessa macchina danno sempre la stessa forma, e una forma diversa vuol dire solo «non coincide» (il verso sicuro).
 *   · Windows: l'ora di creazione del processo (`Win32_Process.CreationDate`, in tick da 100 ns), che è assoluta. ⛔ Node non la
 *     espone e `wmic` non c'è più su Windows 11 (KB5067470, già misurato per `risorse-processi.mjs`): un PowerShell che costa ~1 s
 *     (misurato il 17/10/2026: 947-1.233 ms, quasi tutto avvio). Per questo si chiede SOLO quando serve: alla partenza in sottofondo
 *     (fuori dal percorso del comando, che ha già risposto) e al riavvio solo per i PID ancora VIVI — un PID morto si riconosce con
 *     `process.kill(pid, 0)`, che non costa niente, e non chiede nessuna impronta.
 *   · Altrove (macOS): nessuna impronta ⇒ nessuna adozione. Un processo che non si sa riconoscere non si tocca.
 */
import { spawn as spawnReale } from 'node:child_process';
import { readFileSync as readFileReale } from 'node:fs';

const PID_VALIDO = (pid) => Number.isSafeInteger(pid) && pid > 0;

/**
 * L'impronta di un processo dal testo di `/proc/<pid>/stat`. I campi dopo l'ultima `)` partono dal 3 (state): [2] è il gruppo (5),
 * [19] l'ora d'avvio in tick (22). ⇒ `{ impronta, gruppo }` o `null` se il testo non ha la forma attesa.
 */
export function improntaDaStat(testo, bootId = '-') {
  const chiusa = String(testo ?? '').lastIndexOf(')');
  if (chiusa < 0) return null;
  const campi = String(testo).slice(chiusa + 2).trim().split(/\s+/u);
  const gruppo = Number(campi[2]);
  const avvio = campi[19];
  if (!/^\d+$/u.test(avvio ?? '')) return null;
  return { impronta: `proc:${bootId}:${avvio}`, gruppo: PID_VALIDO(gruppo) ? gruppo : null };
}

function bootIdDi(readFileSync) {
  try {
    const b = String(readFileSync('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
    return /^[0-9a-f-]{8,64}$/iu.test(b) ? b : '-';
  } catch { return '-'; }
}

/** Linux e Android: `/proc`. ⇒ `Map(pid → { impronta, gruppo } | null)`; `null` = non si legge (morto, o di un altro utente). */
export function leggiImpronteProc(pids, { readFileSync = readFileReale } = {}) {
  const boot = bootIdDi(readFileSync);
  const mappa = new Map();
  for (const pid of pids) {
    let testo;
    try { testo = readFileSync(`/proc/${pid}/stat`, 'utf8'); } catch { mappa.set(pid, null); continue; }
    mappa.set(pid, improntaDaStat(testo, boot));
  }
  return mappa;
}

/*
 * ⛔⛔ Windows, MISURATO il 17/10/2026 dal bugfixer (`scratchpad/orfano-win-misura.mjs`): un padre Node lancia `ping -n 60` con
 *   `shell: true` (le opzioni del kernel su win32) e muore di colpo (`TerminateProcess` e `taskkill /F`, tre prove su tre): la SHELL
 *   (`cmd.exe`, il PID che il kernel conosce) muore con lui, il `PING.EXE` resta vivo col padre morto. ⇒ Su Windows l'impronta della
 *   sola shell non serve a niente: si fotografa l'ALBERO (la shell e i suoi discendenti, con la loro ora di creazione), e al riavvio
 *   si riconoscono i membri ancora vivi. `taskkill /T` su un membro vivo prende anche i suoi figli.
 *   ⛔ Limite dichiarato: un processo nato DOPO la fotografia sotto un padre già morto non c'è (la fotografia si fa appena il comando
 *     va in sottofondo, ~1 s dopo per il PowerShell).
 */
/** Il copione PowerShell: una riga «<pid> <ppid> <CreationDate in tick FILETIME>» per ogni processo. Una sola lettura per tutto. */
export const COPIONE_TABELLA_WINDOWS = `$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,CreationDate | ForEach-Object {
  if ($_.CreationDate) { [Console]::Out.WriteLine(([string]$_.ProcessId) + ' ' + ([string]$_.ParentProcessId) + ' ' + ([string]$_.CreationDate.ToFileTimeUtc())) }
}`;

/** Le righe del copione in una tabella `pid → { ppid, tick }` (`tick` come BigInt: 18 cifre non stanno in un Number). */
export function tabellaDaRigheWindows(testo) {
  const tabella = new Map();
  for (const riga of String(testo ?? '').split(/\r?\n/u)) {
    const m = /^(\d+) (\d+) (\d+)$/u.exec(riga.trim());
    if (!m) continue;
    tabella.set(Number(m[1]), { ppid: Number(m[2]), tick: BigInt(m[3]) });
  }
  return tabella;
}

/** L'albero di `radice` nella tabella: la radice e i discendenti, senza i PID riusati (un figlio nato prima del padre non è suo). */
export function alberoDaTabella(tabella, radice) {
  if (!tabella.get(radice)) return [];
  const figli = new Map();
  for (const [pid, r] of tabella) {
    if (pid === r.ppid) continue;
    if (!figli.has(r.ppid)) figli.set(r.ppid, []);
    figli.get(r.ppid).push(pid);
  }
  const membri = [];
  const visti = new Set([radice]);
  const coda = [radice];
  while (coda.length) {
    const pid = coda.shift();
    const r = tabella.get(pid);
    membri.push({ pid, impronta: `win:${r.tick}` });
    for (const f of figli.get(pid) ?? []) {
      if (visti.has(f) || tabella.get(f).tick < r.tick) continue;
      visti.add(f); coda.push(f);
    }
  }
  return membri;
}

async function leggiTabellaWindows({ spawnFn = spawnReale, attesaMassimaMs = 15_000 } = {}) {
  return new Promise((risolvi) => {
    let figlio;
    try {
      figlio = spawnFn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(COPIONE_TABELLA_WINDOWS, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch { risolvi(null); return; }
    let uscita = '';
    let finito = false;
    const fine = (tabella) => { if (finito) return; finito = true; clearTimeout(t); risolvi(tabella); };
    const t = setTimeout(() => { try { figlio.kill(); } catch { /* già uscito */ } fine(null); }, attesaMassimaMs);
    t.unref?.();
    figlio.stdout?.setEncoding?.('utf8');
    figlio.stdout?.on('data', (pezzo) => { uscita += pezzo; });
    figlio.on?.('error', () => fine(null));
    figlio.on?.('close', () => { const tab = tabellaDaRigheWindows(uscita); fine(tab.size ? tab : null); });
  });
}

/**
 * Le impronte di più PID in UNA lettura (su Windows un PowerShell solo per tutti).
 * @returns {Promise<Map<number, {impronta:string, gruppo:number|null}|null>>}
 */
export async function leggiImpronte(pids, { piattaforma = process.platform, spawnFn = spawnReale, readFileSync = readFileReale, attesaMassimaMs = 15_000 } = {}) {
  const validi = [...new Set((Array.isArray(pids) ? pids : []).filter(PID_VALIDO))];
  if (!validi.length) return new Map();
  if (piattaforma === 'linux' || piattaforma === 'android') return leggiImpronteProc(validi, { readFileSync });
  if (piattaforma !== 'win32') return new Map(validi.map((p) => [p, null]));
  const tabella = await leggiTabellaWindows({ spawnFn, attesaMassimaMs });
  return new Map(validi.map((p) => [p, tabella?.get(p) ? { impronta: `win:${tabella.get(p).tick}`, gruppo: null } : null]));
}

/**
 * Ciò che si ricorda di un comando che va in sottofondo: i suoi MEMBRI (POSIX: il solo processo, il gruppo lo copre; Windows: l'albero),
 * il gruppo POSIX, e le impronte di altri PID letti nella stessa volta (chi lo segue). `null` se la radice non si legge.
 * @returns {Promise<{membri:{pid:number, impronta:string}[], gruppo:number|null, altri:Map<number, {impronta:string}|null>}|null>}
 */
export async function leggiAlbero(radice, { conImpronteDi = [], piattaforma = process.platform, spawnFn = spawnReale, readFileSync = readFileReale, attesaMassimaMs = 15_000 } = {}) {
  if (!PID_VALIDO(radice)) return null;
  const altriPid = [...new Set(conImpronteDi.filter(PID_VALIDO))];
  if (piattaforma === 'win32') {
    const tabella = await leggiTabellaWindows({ spawnFn, attesaMassimaMs });
    const membri = tabella ? alberoDaTabella(tabella, radice) : [];
    const altri = new Map(altriPid.map((p) => [p, tabella?.get(p) ? { impronta: `win:${tabella.get(p).tick}`, gruppo: null } : null]));
    return membri.length ? { membri, gruppo: null, altri } : null;
  }
  const mappa = await leggiImpronte([radice, ...altriPid], { piattaforma, spawnFn, readFileSync, attesaMassimaMs });
  const r = mappa.get(radice);
  if (!r) return null;
  return { membri: [{ pid: radice, impronta: r.impronta }], gruppo: r.gruppo ?? null, altri: new Map(altriPid.map((p) => [p, mappa.get(p) ?? null])) };
}

/** C'è un processo con questo PID? (`kill(pid, 0)`: su Windows Node lo supporta per sapere se esiste.) EPERM = c'è, ma non è nostro. */
export function esisteProcesso(pid, { killFn = (p, s) => process.kill(p, s) } = {}) {
  if (!PID_VALIDO(pid)) return false;
  try { killFn(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

/** C'è ancora qualcuno nel gruppo? (POSIX: un pgid non si riusa finché il gruppo ha un membro.) */
export function esisteGruppo(gruppo, { killFn = (p, s) => process.kill(p, s) } = {}) {
  if (!PID_VALIDO(gruppo)) return false;
  try { killFn(-gruppo, 0); return true; } catch (e) { return e?.code === 'EPERM'; }
}

/**
 * Windows: ferma l'albero di un processo ripreso (`taskkill /T /F`, come lo Stop di sempre: `uccidiAlberoDelProcesso` del kernel). Chi
 * chiama ha appena riprovato l'identità del PID con l'impronta. ⇒ `true` se taskkill dice di averlo fatto.
 */
export function fermaAlberoWindows(pid, { spawnFn = spawnReale } = {}) {
  return new Promise((risolvi) => {
    if (!PID_VALIDO(pid)) { risolvi(false); return; }
    let boia;
    try { boia = spawnFn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { risolvi(false); return; }
    boia.on?.('error', () => risolvi(false));
    boia.on?.('close', (codice) => risolvi(codice === 0));
  });
}

/** POSIX: un segnale al gruppo (`-gruppo`) o al solo PID. ⇒ `true` se è partito. */
export function segnalaProcesso(bersaglio, segnale, { gruppo = false, killFn = (p, s) => process.kill(p, s) } = {}) {
  if (!PID_VALIDO(bersaglio)) return false;
  try { killFn(gruppo ? -bersaglio : bersaglio, segnale); return true; } catch { return false; }
}
