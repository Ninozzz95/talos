/*
 * L'aiutante nativo del computer use, visto dal server (passo 5 del piano, decisione 129; forma FORMA-ATTREZZO-COLLEGAMENTO §3).
 *
 * - Parte SOLO dopo aver controllato l'impronta del `.exe` (sha256 dei byte) contro quella fissata qui: impronta diversa, file assente o
 *   impronta non ancora fissata ⇒ nessun processo, e l'attrezzo risponde «not available on this computer». È così che «mai il binario
 *   originale» si tiene: l'originale (con telemetria e aggiornamenti) ha un'altra impronta.
 * - Client MCP su stdio (JSON-RPC a righe), come `native/aiutante-nativo/prova-dal-vivo.mjs:46-70`, col ciclo di vita della specifica
 *   MCP 2025-06-18 (modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle, letta il 04/11/2026): `initialize`, poi
 *   `notifications/initialized`; ogni richiesta ha un tetto e, scaduta o annullata, `notifications/cancelled`; la chiusura su stdio è
 *   «closing the input stream … waiting for the server to exit … SIGTERM … SIGKILL».
 * - Uno per macchina (`aiutantePerMacchina`, uno per percorso nel processo del server); si spegne dopo 5 minuti senza compiti e alla
 *   chiusura dell'app (`chiudiTuttiGliAiutanti`).
 * - Ambiente del figlio ripulito: mai le chiavi dei fornitori a un binario di terzi. Hermes fa lo stesso:
 *   `tools/computer_use/permissions.py:39-49` («cua-driver is a third-party binary — it must never inherit provider API keys») e
 *   `cua_backend.py:175-184` (`sanitized_cua_driver_env`). Qui con una lista di chiavi AMMESSE, non di chiavi tolte: la chiave di un
 *   fornitore nuovo resta fuori senza che nessuno se ne ricordi.
 */
import { spawn as spawnReale } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile as readFileReale } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/**
 * Il testo che il modello riceve quando l'aiutante non c'è o non è quello giusto (forma §3). Cancello S2 (b) del Tester, 05/11/2026: il
 * modello leggeva «not available» e diceva alla persona «attiva il computer use», che non ha un interruttore. Il testo è intero e si dà
 * da solo: dice che non c'è niente da accendere, cosa dire, e di non riprovare.
 */
export const NON_DISPONIBILE = 'computer_use is not available on this computer: this TALOS install has no working PC helper, and there is '
  + 'no setting the person can turn on. Do not tell the person to enable computer use. Tell them plainly that TALOS cannot use the screen '
  + 'here, then do the task another way or stop. Do not retry.';
/**
 * L'impronta del binario POTATO di rilascio: lo sha256 dei byte del `.exe`, che `native/aiutante-nativo/costruisci.mjs:168` scrive nel
 * rapporto JSON di `--uscita` (il campo `sha256` dentro `binario`). Questa è la build del 05/11/2026 (pin 0cdcec94bc99, `-j 2`, 54.299.071 byte),
 * rimisurata con `sha256sum` sul file. Si fissa con un commit, mai da un file accanto al `.exe` (chi può cambiare il `.exe` può
 * cambiare anche quello); un `.exe` ricostruito con altri byte non parte finché qui non c'è la sua impronta.
 */
export const IMPRONTA_AIUTANTE_PC = '592abc5c72494fb8afa203acb075032a6e2eedc932c9e4fa0ef21a8e0dc35f8e';
export const MS_INATTIVO = 5 * 60_000;
const MS_RISPOSTA = 20_000;
const MS_USCITA = 2_000;
const SHA256 = /^[a-f0-9]{64}$/u;

/** Le sole variabili d'ambiente che il figlio riceve (Windows ne vuole alcune per avviarsi e per le cartelle dell'utente). */
export const AMBIENTE_AMMESSO = Object.freeze(['SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'SystemDrive', 'SYSTEMDRIVE', 'PATH', 'Path',
  'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA', 'ProgramData', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME',
  'HOMEDRIVE', 'HOMEPATH', 'OS', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'ComSpec', 'COMSPEC']);
export function ambientePulito(ambiente = process.env) {
  const fuori = {};
  for (const k of AMBIENTE_AMMESSO) if (typeof ambiente?.[k] === 'string') fuori[k] = ambiente[k];
  return { ...fuori, DO_NOT_TRACK: '1', CUA_TELEMETRY: '0' }; // come prova-dal-vivo.mjs:47
}

/**
 * Dove sta il binario. Nell'app installata il guscio passa `TALOS_AIUTANTE_PC` (`desktop/runtime.mjs`, `resources/aiutante-pc/`), e vale
 * solo un percorso assoluto; altrimenti è dove la build potata lo mette (`costruisci.mjs:166`):
 * `%LOCALAPPDATA%\tb\potato-target\release\cua-driver.exe`. In tutti e due i casi l'impronta resta il cancello.
 */
export function percorsoAiutantePredefinito(ambiente = process.env) {
  const dalGuscio = typeof ambiente?.TALOS_AIUTANTE_PC === 'string' ? ambiente.TALOS_AIUTANTE_PC.trim() : '';
  if (dalGuscio && isAbsolute(dalGuscio)) return dalGuscio;
  return join(String(ambiente?.LOCALAPPDATA ?? ''), 'tb', 'potato-target', 'release', 'cua-driver.exe');
}

/**
 * Cancello S2 (a) del Tester, 05/11/2026: l'aiutante si offre al modello solo se può partire — impronta fissata nella sua forma e file
 * presente. Se no il nucleo non riceve gli attrezzi, e il modello non vede un `computer_use` che risponderebbe solo «not available».
 * L'impronta dei byte si controlla comunque alla prima chiamata (`apri`): qui si guarda solo ciò che costa niente.
 */
export function aiutanteUsabile({ exe, impronta, esiste = existsSync } = {}) {
  if (typeof impronta !== 'string' || !SHA256.test(impronta)) return false;
  if (typeof exe !== 'string' || !exe) return false;
  try { return esiste(exe) === true; } catch { return false; }
}

const json = (s) => { try { return JSON.parse(s); } catch { return null; } };

/**
 * @param {{ exe: string, improntaAttesa?: string|null, avvia?: typeof spawnReale, leggi?: (p: string) => Promise<Buffer>,
 *   ambiente?: object, msInattivo?: number, msRisposta?: number }} o
 */
export function creaAiutanteMcp({ exe, improntaAttesa = IMPRONTA_AIUTANTE_PC, avvia = spawnReale, leggi = readFileReale, ambiente = process.env,
  msInattivo = MS_INATTIVO, msRisposta = MS_RISPOSTA } = {}) {
  let figlio = null; let pronto = null; let resto = ''; let id = 0; const attese = new Map();
  let compiti = 0; let timer = null; let avvii = 0;
  let chiuso = false; // spento per sempre (chiusura dell'app): `apri` non riavvia più nulla (revisione del passo 5, difetto 7)

  const fermaTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const armaTimer = () => {
    fermaTimer();
    if (compiti > 0 || !figlio) return;
    timer = setTimeout(() => { timer = null; if (compiti === 0) spegni(); }, msInattivo);
    timer.unref?.();
  };
  // la chiusura della specifica su stdio: prima l'ingresso, poi l'attesa, poi la forza
  const spegni = () => {
    fermaTimer();
    const f = figlio; figlio = null; pronto = null; resto = '';
    for (const fine of [...attese.values()]) fine({ error: { message: 'closed' } });
    attese.clear();
    if (!f) return;
    try { f.stdin?.end(); } catch { /* già chiuso */ }
    const forza = setTimeout(() => { try { f.kill(); } catch { /* già uscito */ } }, MS_USCITA);
    forza.unref?.();
    f.once?.('exit', () => clearTimeout(forza));
  };

  /** Impronta controllata a OGNI avvio: un `.exe` cambiato fra due compiti non parte. */
  const controllaImpronta = async () => {
    if (typeof improntaAttesa !== 'string' || !SHA256.test(improntaAttesa)) return 'impronta-non-fissata';
    let byte;
    try { byte = await leggi(exe); } catch { return 'binario'; }
    const vista = createHash('sha256').update(byte).digest('hex');
    return vista === improntaAttesa ? null : 'impronta';
  };

  const scrivi = (m) => { try { if (!figlio?.stdin) return false; figlio.stdin.write(`${JSON.stringify(m)}\n`); return true; } catch { return false; } };
  const chiediRpc = (method, params, segnale) => new Promise((fine) => {
    if (!figlio) { fine({ error: { message: 'closed' } }); return; }
    id += 1; const mio = id;
    let t = null;
    const chiudiAttesa = (m) => { clearTimeout(t); segnale?.removeEventListener?.('abort', suAbort); attese.delete(mio); fine(m); };
    const annulla = (motivo) => { scrivi({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: mio, reason: motivo } }); chiudiAttesa({ error: { message: motivo } }); };
    const suAbort = () => annulla('aborted');
    t = setTimeout(() => annulla('timeout'), msRisposta);
    t.unref?.();
    attese.set(mio, chiudiAttesa);
    if (segnale?.aborted) { suAbort(); return; }
    segnale?.addEventListener?.('abort', suAbort, { once: true });
    if (!scrivi({ jsonrpc: '2.0', id: mio, method, params })) chiudiAttesa({ error: { message: 'closed' } });
  });

  const avviaFiglio = async () => {
    const motivo = await controllaImpronta();
    if (motivo) return { ok: false, motivo };
    if (chiuso) return { ok: false, motivo: 'chiuso' };
    let f;
    try {
      f = avvia(exe, ['mcp'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: ambientePulito(ambiente) });
    } catch { return { ok: false, motivo: 'avvio' }; }
    avvii += 1;
    figlio = f;
    /*
     * Revisione del passo 5, difetto 10a (04/11/2026): l'impronta si ricontrolla DOPO l'avvio, sul file che è partito. Fra il primo
     *   controllo e `spawn` il `.exe` poteva essere sostituito; ora un file diverso al secondo controllo ⇒ il figlio si uccide subito,
     *   prima di `initialize` (nessuno strumento gli arriva mai). Su Windows un `.exe` in esecuzione non si riscrive sul posto, quindi
     *   il secondo controllo legge l'immagine partita. Hermes controlla la firma del demone prima di lanciarlo
     *   (`tools/computer_use/cua_backend_daemon.py:44-62`); qui il controllo è doppio, prima e dopo.
     */
    const dopo = await controllaImpronta();
    if (dopo || chiuso) {
      try { f.kill(); } catch { /* già uscito */ }
      if (figlio === f) spegni();
      return { ok: false, motivo: dopo ?? 'chiuso' };
    }
    f.stdout?.setEncoding?.('utf8');
    f.stdout?.on('data', (d) => {
      resto += d;
      // si divide solo su \n (trappola U+2028 delle righe JSON)
      for (let i = resto.indexOf('\n'); i >= 0; i = resto.indexOf('\n')) {
        const riga = resto.slice(0, i).trim(); resto = resto.slice(i + 1);
        const m = json(riga);
        if (m && attese.has(m.id)) attese.get(m.id)(m);
      }
    });
    f.stderr?.on?.('data', () => { /* il diario dell'aiutante non entra mai nel contesto del modello */ });
    f.on?.('error', () => { if (figlio === f) spegni(); });
    f.on?.('exit', () => { if (figlio === f) spegni(); });
    const init = await chiediRpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'talos', version: '1' } });
    if (init.error || figlio !== f) { if (figlio === f) spegni(); return { ok: false, motivo: 'initialize' }; }
    scrivi({ jsonrpc: '2.0', method: 'notifications/initialized' });
    return { ok: true };
  };

  return {
    /** Avvia (se serve) dopo il controllo dell'impronta. `{ ok: true }` o `{ ok: false, motivo }`; nessun processo se l'impronta non torna. */
    async apri() {
      if (chiuso) return { ok: false, motivo: 'chiuso' };
      if (!pronto) pronto = avviaFiglio().then((r) => { if (!r.ok) pronto = null; return r; });
      const r = await pronto;
      if (r.ok) armaTimer();
      return r;
    },
    /** Uno strumento dell'aiutante: `{ ok, dati, immagine: { base64, mime } | null, errore }`. Mai un'eccezione. */
    async chiama(nome, argomenti = {}, segnale) {
      if (!figlio) return { ok: false, dati: null, immagine: null, errore: 'not-started' };
      const r = await chiediRpc('tools/call', { name: nome, arguments: argomenti }, segnale);
      const ris = r.result ?? {};
      const parti = Array.isArray(ris.content) ? ris.content : [];
      const img = parti.find((p) => p?.type === 'image' && typeof p.data === 'string');
      return {
        ok: !r.error && ris.isError !== true,
        errore: r.error?.message ?? (ris.isError ? String(parti.find((p) => p?.type === 'text')?.text ?? 'error').slice(0, 300) : null),
        dati: ris.structuredContent ?? null,
        immagine: img ? { base64: img.data, mime: typeof img.mimeType === 'string' ? img.mimeType : 'image/png' } : null,
      };
    },
    /** Un compito comincia: niente spegnimento finché non finisce. Torna la funzione che lo chiude (una volta sola). */
    compito() {
      compiti += 1; fermaTimer();
      let fatto = false;
      return () => { if (fatto) return; fatto = true; compiti = Math.max(0, compiti - 1); armaTimer(); };
    },
    chiudi: spegni,
    /** Alla chiusura dell'app: spento, e da qui ogni `apri` risponde `{ ok: false, motivo: 'chiuso' }` (un compito in volo non lo riaccende). */
    chiudiPerSempre: () => { chiuso = true; spegni(); },
    stato: () => ({ vivo: Boolean(figlio), compiti, avvii, chiuso }),
  };
}

const perMacchina = new Map();
let processoInChiusura = false;
/** Uno per macchina: lo stesso percorso dà sempre lo stesso aiutante dentro il processo del server. Dopo la chiusura dell'app, uno spento. */
export function aiutantePerMacchina(opzioni) {
  const k = String(opzioni?.exe ?? '');
  if (processoInChiusura) { const spento = creaAiutanteMcp(opzioni); spento.chiudiPerSempre(); return spento; }
  if (!perMacchina.has(k)) perMacchina.set(k, creaAiutanteMcp(opzioni));
  return perMacchina.get(k);
}
/**
 * Alla chiusura dell'app: spegne tutti gli aiutanti avviati da questo processo, per sempre (revisione del passo 5, difetto 7). Il server
 * la chiama DOPO `sessionRegistry.chiudi`; un compito ancora in volo che chiede `apri` riceve `chiuso` e non lascia un processo orfano.
 */
export function chiudiTuttiGliAiutanti() {
  processoInChiusura = true;
  for (const a of perMacchina.values()) a.chiudiPerSempre();
  perMacchina.clear();
}
