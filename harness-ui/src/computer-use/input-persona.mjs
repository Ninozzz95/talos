/*
 * Il sensore della mano della persona per il computer use del PC (cura «finestra bloccata», punto 3: owner 15/11 11:48, «stop se la
 * persona muove mouse o tastiera»; giudice v1945).
 *
 * Fonte: `GetLastInputInfo` di Windows (`guardia.mjs:11`, «fonte 1»): l'ora dell'ultimo input di mouse, tastiera o tocco della sessione.
 * Microsoft Learn, «GetLastInputInfo function (winuser.h)» e «LASTINPUTINFO»: `dwTime` è il tick (`GetTickCount`) dell'ultimo input, a
 * 32 bit, quindi l'inattività è `GetTickCount() - dwTime` in aritmetica senza segno (giro dei 49,7 giorni compreso).
 * ⚠ Non distingue l'input iniettato: conta anche quello di `SendInput`. I flag che lo distinguerebbero (`LLMHF_INJECTED`,
 *   `LLKHF_INJECTED`) esistono solo dentro un hook di basso livello (`WH_MOUSE_LL` / `WH_KEYBOARD_LL`, Microsoft Learn «MSLLHOOKSTRUCT»),
 *   che cua-driver non installa (cercato il 16/11 nella scorta `cua-0cdcec94`: nessun `SetWindowsHookEx`). La distinzione la fa quindi
 *   l'attrezzo per TEMPO (`attrezzo.mjs`, `manoAdesso`): input dentro un'azione dell'aiutante = dell'aiutante. La strada piena (un hook
 *   nell'aiutante nativo che conta solo gli eventi senza il flag iniettato) è scritta nel rapporto della cura: qui non si inventa.
 *
 * Come: un solo PowerShell nascosto per processo, acceso al primo compito e spento dopo `MS_INATTIVO` senza domande o alla chiusura del
 * server (stdin chiuso ⇒ il ciclo del figlio finisce). Il C# si compila una volta (`Add-Type`); poi ogni domanda è una riga su stdin e una
 * riga su stdout (l'inattività in millisecondi). Ambiente del figlio ripulito come quello dell'aiutante (`aiutante-mcp.mjs`,
 * `ambientePulito`). Un sensore che non parte, non risponde in tempo o risponde storto dice `null`: nessuna mano inventata.
 */
import { spawn as spawnReale } from 'node:child_process';
import { ambientePulito } from './aiutante-mcp.mjs';
import { percorsoPowershell } from '../taskkill-di-sistema.mjs';

export const MS_INATTIVO = 5 * 60_000;
const MS_RISPOSTA = 1_000;
const MS_AVVIO = 15_000;

/* Il C# che legge l'inattività: niente virgolette doppie fuori dal testo C#, che sta in una here-string a virgolette singole. */
const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -TypeDefinition @'",
  'using System; using System.Runtime.InteropServices;',
  'public static class TalosUltimoInput {',
  '  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }',
  '  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO p);',
  '  [DllImport("kernel32.dll")] static extern uint GetTickCount();',
  '  public static long Inattivo() { var l = new LASTINPUTINFO(); l.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));',
  '    if (!GetLastInputInfo(ref l)) return -1; return (long)unchecked(GetTickCount() - l.dwTime); }',
  '}',
  "'@",
  "[Console]::Out.WriteLine('pronto')",
  'while ($null -ne [Console]::In.ReadLine()) { [Console]::Out.WriteLine([TalosUltimoInput]::Inattivo()) }',
].join('\n');

/**
 * Dalla riga del figlio all'ora dell'ultimo input (ms dell'epoca), o null. Pura: la provano le prove senza Windows.
 * @param {string} riga @param {number} adesso
 */
export function ultimoInputDaRiga(riga, adesso) {
  const t = String(riga ?? '').trim();
  if (!/^\d{1,10}$/u.test(t) || !Number.isFinite(adesso)) return null;
  const inattivo = Number(t);
  return inattivo <= 0xffffffff ? adesso - inattivo : null;
}

/**
 * @param {{ spawn?: Function, piattaforma?: string, adesso?: () => number, ambiente?: object }} [p]
 * @returns {{ ultimoInput: () => Promise<number|null>, chiudi: () => void }}
 */
export function creaSensoreInput({ spawn = spawnReale, piattaforma = process.platform, adesso = () => Date.now(), ambiente = process.env } = {}) {
  let figlio = null; let pronto = null; let resto = ''; let attese = []; let timer = null;
  const chiudi = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const f = figlio; figlio = null; pronto = null; resto = '';
    for (const a of attese.splice(0)) a(null);
    if (f) { try { f.stdin?.end(); } catch { /* già chiuso */ } try { f.kill(); } catch { /* già uscito */ } }
  };
  const rinvia = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(chiudi, MS_INATTIVO);
    timer.unref?.();
  };
  const accendi = () => {
    if (pronto) return pronto;
    pronto = new Promise((ok) => {
      let f;
      try {
        // revisore A della 0.2.3: per percorso intero, mai per nome (un powershell.exe piantato prima di System32 nel PATH girava al
        // suo posto e spegneva lo stop alla mano), come gli altri lanci di PowerShell del server (`taskkill-di-sistema.mjs`, G-R5)
        f = spawn(percorsoPowershell(ambiente?.SystemRoot), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', SCRIPT],
          { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'], env: ambientePulito(ambiente) });
      } catch { ok(false); return; }
      figlio = f;
      const tAvvio = setTimeout(() => { ok(false); chiudi(); }, MS_AVVIO);
      tAvvio.unref?.();
      f.on('error', () => { clearTimeout(tAvvio); ok(false); if (figlio === f) chiudi(); });
      f.on('exit', () => { clearTimeout(tAvvio); ok(false); if (figlio === f) chiudi(); });
      f.stdout.setEncoding('utf8');
      f.stdout.on('data', (pezzo) => {
        if (figlio !== f) return; // un figlio già spento: la sua riga in ritardo non va al figlio nuovo
        resto += pezzo;
        let k;
        while ((k = resto.indexOf('\n')) >= 0) {
          const riga = resto.slice(0, k).replace(/\r$/u, ''); resto = resto.slice(k + 1);
          if (riga === 'pronto') { clearTimeout(tAvvio); ok(true); continue; }
          const a = attese.shift();
          if (a) a(ultimoInputDaRiga(riga, adesso()));
        }
      });
    });
    return pronto;
  };
  const ultimoInput = async () => {
    if (piattaforma !== 'win32') return null;
    rinvia();
    if (!(await accendi()) || !figlio) return null;
    const f = figlio;
    return new Promise((ok) => {
      let fatto = false;
      const fine = (v) => { if (!fatto) { fatto = true; clearTimeout(t); ok(v); } };
      // in ritardo, la riga andrebbe alla domanda dopo: si spegne il figlio e la prossima domanda lo riaccende
      const t = setTimeout(() => { attese = attese.filter((x) => x !== fine); fine(null); chiudi(); }, MS_RISPOSTA);
      attese.push(fine);
      try { f.stdin.write('?\n'); } catch { fine(null); }
    });
  };
  return { ultimoInput, chiudi };
}
