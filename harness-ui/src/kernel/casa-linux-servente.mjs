/*
 * ⛔⛔ Fase B «casa di esecuzione» (owner 01/10/2026) — il SERVENTE: gira dentro WSL, col Node per Linux che TALOS porta (eseguito
 *   da C:, niente installato nella distro), e fa una cosa sola: esegue le funzioni dei file DEL KERNEL STESSO sui percorsi di
 *   Linux. Nessuna seconda implementazione: è il modulo `talosHarness.mjs` di sempre, importato di qua (misurato il 01/10:
 *   l'import da /mnt/c costa ~290 ms, una volta per sessione; `leggiTestoLimitato` legge i percorsi Linux e segue i collegamenti).
 *   È la forma «locale/remoto dietro la stessa interfaccia» di Zed (server remoto alla stessa versione del client).
 *
 * Protocollo, una riga JSON per messaggio su stdin/stdout:
 *   → { id, op, args }          ← { id, ok: true, valore } | { id, ok: false, errore: { message, code, path, name } }
 *   → { annulla: id }           (lo Stop di quella richiesta: il suo AbortSignal si accende)
 *   stdin chiuso ⇒ si fermano le ricerche vive e si esce.
 * ⛔ Su stdout passano SOLO righe del protocollo: un `console.log` del kernel finirebbe nel canale, quindi si sposta su stderr.
 * Permessi, ricevute, «leggi prima di sostituire» e punti di controllo restano dal lato Windows: qui si esegue soltanto.
 */
import { createInterface } from 'node:readline';
import { userInfo } from 'node:os';
import { stat } from 'node:fs/promises';
import { writeSync } from 'node:fs';

const rg = process.argv[2];
if (rg) process.env.TALOS_RG_PATH = rg;
const scriviRiga = (oggetto) => process.stdout.write(`${JSON.stringify(oggetto)}\n`);
console.log = (...parti) => process.stderr.write(`${parti.map(String).join(' ')}\n`);

const kernel = await import('./talosHarness.mjs');
const { creaRegistroRicerche } = await import('./ricerche-in-corso.mjs');
const { pezzoConSeparatore } = await import('./accoda-con-a-capo.mjs');
const ricerche = creaRegistroRicerche();

const OPERAZIONI = Object.freeze({
  ping: async () => ({ node: process.version, pid: process.pid, utente: userInfo().username, uid: process.getuid?.() ?? null }),
  leggiTestoLimitato: ({ cartella, percorso, opzioni = {} }, segnale) => kernel.leggiTestoLimitato(cartella, percorso, { ...opzioni, segnale }),
  elenca: ({ radice, base }) => kernel.elencaDaCartella(kernel.discoNode({ radice }), base),
  cerca: ({ radice, argomenti, tempoRgMs }, segnale) => kernel.cercaNelProgetto(kernel.discoNode({ radice }), argomenti,
    { radice, segnale, ricerche, ...(Number.isFinite(tempoRgMs) ? { tempoRgMs } : {}) }),
  discoLeggi: ({ radice, percorso }) => kernel.discoNode({ radice }).leggi(percorso),
  discoScrivi: ({ radice, percorso, testo, modalita }) => kernel.discoNode({ radice }).scrivi(percorso, testo, modalita),
  discoElenca: ({ radice, cartella }) => kernel.discoNode({ radice }).elenca(cartella),
  istantanea: async ({ percorso }) => {
    try { const s = await stat(percorso); return s.isFile() ? { mtimeMs: s.mtimeMs, size: s.size } : null; } catch { return null; }
  },
  pezzoConSeparatore: ({ percorso, pezzo }) => pezzoConSeparatore(percorso, pezzo),
  fermaRicerche: async () => { ricerche.fermaTutte('fermata'); return true; },
});

const inCorso = new Map();
/* L'annuncio: il kernel è importato e stdin si legge. Prima di questa riga il client sa che nessuna richiesta è stata eseguita. */
/* SINCRONO: un annuncio rimasto in un buffer direbbe al client «non è partito» anche dopo una richiesta eseguita. */
writeSync(1, `${JSON.stringify({ pronto: true, node: process.version })}\n`);
createInterface({ input: process.stdin }).on('line', async (riga) => {
  let messaggio;
  try { messaggio = JSON.parse(riga); } catch { return; }
  if (messaggio && messaggio.annulla !== undefined) { inCorso.get(messaggio.annulla)?.abort(); return; }
  const { id, op, args } = messaggio ?? {};
  const operazione = Object.hasOwn(OPERAZIONI, op) ? OPERAZIONI[op] : null;
  if (!operazione) { scriviRiga({ id, ok: false, errore: { message: `CASA_LINUX_OPERAZIONE_IGNOTA: ${op}`, code: 'CASA_LINUX_OPERAZIONE_IGNOTA' } }); return; }
  const controllo = new AbortController();
  inCorso.set(id, controllo);
  try {
    const valore = await operazione(args ?? {}, controllo.signal);
    scriviRiga({ id, ok: true, valore: valore === undefined ? null : valore });
  } catch (errore) {
    scriviRiga({ id, ok: false, errore: { message: errore?.message ?? String(errore), code: errore?.code ?? null, path: errore?.path ?? null, name: errore?.name ?? 'Error' } });
  } finally {
    inCorso.delete(id);
  }
}).on('close', () => { ricerche.fermaTutte('fermata'); setTimeout(() => process.exit(0), 50); });
