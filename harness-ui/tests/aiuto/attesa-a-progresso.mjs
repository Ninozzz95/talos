/*
 * ⛔ 01/10/2026 — L'ATTESA A PROGRESSO, IN UN POSTO SOLO. Stamattina (`a4f781e13`) WF-FAILURE-LIKE-HERMES della CI pubblica
 *   cadeva dopo 3 s a orologio mentre il run scriveva ancora: sul disco del runner Windows ogni scrittura durevole del giornale
 *   costa centinaia di millisecondi, e un «3 secondi» misurava il DISCO, non lo scheduler. Curato in
 *   `workflow-scheduler-loop.test.mjs`; la sera la PR pubblica #45 (desktop 0.1.20) ha fatto cadere WF-RUN-PAUSE-DRAINS
 *   (`workflow-run-controls.test.mjs`, 10,8 s, `run.status` mai «succeeded») con la STESSA attesa, copiata in altri quattro file.
 *   Owner: «Fix the 4 files first, then tag».
 * ⇒ La scadenza conta il tempo SENZA progresso: si sposta ogni volta che `progresso()` cambia. Un run fermo cade dopo `ms` come
 *   prima; uno lento ma vivo no. `TETTO_ATTESA_MS` impedisce l'attesa infinita di un run che scrive senza mai arrivare. Come le cure
 *   dei flake «wall-clock progress deadline» (abi-jey/nagents#12, tqbf/selfdrivingwiki#1288, letti il 01/10/2026).
 * ⇒ `creaAttesaAProgresso` dà il progresso senza conoscere lo store: i byte e l'ultima modifica delle cartelle dati che il banco
 *   registra con `segui` (giornale, stato, sessioni). Ogni scrittura li sposta.
 * ⛔ Un'attesa che per contratto deve essere RAPIDA (es. «un client che se ne va libera subito la sottoscrizione») passa
 *   `{ progresso: false }`: lì il tempo fisso è la cosa provata, e allungarlo col progresso la renderebbe cieca.
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export const TETTO_ATTESA_MS = 60_000;

export async function aspettaCheAProgresso(condizione, ms = 3_000, progresso = null, tetto = TETTO_ATTESA_MS) {
  const inizio = Date.now();
  let fine = inizio + ms;
  let visto = progresso ? await progresso() : null;
  let prossimaMisura = Date.now() + 50;
  while (Date.now() < fine && Date.now() - inizio < tetto) {
    if (await condizione()) return true;
    await new Promise((r) => setTimeout(r, 5));
    if (progresso && Date.now() >= prossimaMisura) {
      prossimaMisura = Date.now() + 50;
      const ora = await progresso();
      if (ora !== visto) { visto = ora; fine = Date.now() + ms; }
    }
  }
  return Boolean(await condizione());
}

async function misura(cartella) {
  let byte = 0;
  let ultima = 0;
  let voci;
  try { voci = await readdir(cartella, { withFileTypes: true }); } catch { return { byte, ultima }; }
  for (const voce of voci) {
    const percorso = join(cartella, voce.name);
    if (voce.isDirectory()) {
      const sotto = await misura(percorso);
      byte += sotto.byte; ultima = Math.max(ultima, sotto.ultima);
    } else {
      try { const s = await stat(percorso); byte += s.size; ultima = Math.max(ultima, s.mtimeMs); } catch { /* sparito fra readdir e stat */ }
    }
  }
  return { byte, ultima };
}

/** `segui(cartella)` registra una cartella dati del banco (e la restituisce); `aspettaChe` misura il progresso su quelle. */
export function creaAttesaAProgresso({ ms: predefinito = 3_000, tetto = TETTO_ATTESA_MS } = {}) {
  const cartelle = new Set();
  const progresso = async () => {
    let byte = 0;
    let ultima = 0;
    for (const cartella of cartelle) {
      const m = await misura(cartella);
      byte += m.byte; ultima = Math.max(ultima, m.ultima);
    }
    return `${byte}:${ultima}`;
  };
  return {
    segui(cartella) { cartelle.add(cartella); return cartella; },
    aspettaChe(condizione, ms = predefinito, { progresso: conProgresso = true } = {}) {
      return aspettaCheAProgresso(condizione, ms, conProgresso && cartelle.size > 0 ? progresso : null, tetto);
    },
  };
}
