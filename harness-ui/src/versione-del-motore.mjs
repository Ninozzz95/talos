/*
 * ⭐ Which engine is this server really using? (01/11/2026, `FORMA-VERSIONE-DEL-MOTORE-2026-11-01.md` in the engine handoff folder.)
 *
 * The defect: the owner's 4174 ran llama.cpp b10517 of August while the package ships b11669. `config.mjs` falls back in silence on the
 * folder it finds, and `GET /api/v1/runtime` only said «vulkan»: every worktree with an old `.local-runtime` measured another engine.
 *
 * Read before writing: Hermes takes `build_info` from `/props` (`hermes_cli/local_runtime/detect.py:48`) and keeps a manifest with the
 * `--version` it saw (`binaries.py:131`). `/props` needs a running engine (`tools/server/server-context.cpp:5691`), so this asks
 * `--version`, which also works with no model loaded. Measured on 01/11: b10517, b11669 and b11960 all print the line on STDERR, and
 * `createLlamaBinaryProbe` returns stdout and stderr together.
 *
 * Conditions of the sessions, all binding:
 *   - Performance: never on the way of a turn. `versione()` is synchronous and answers with what it knows; the read goes on in the
 *     background with a 2 s ceiling, because an antivirus can hold the first start of an .exe. The read is tied to path, size and date.
 *   - Desktop: `diverso` always tells the truth, also for a binary set by hand: `diverso: true` with `manuale: true`, never a false.
 *   - Mobile: where the binary does not exist (the phone), «unknown» with no probe, no error and no wait.
 */
import { statSync } from 'node:fs';
import { MOTORE_FISSATO } from './motore-fissato.mjs';

const RIGA_VERSIONE = /^version:\s+\S+\s+\(build\s+(\d+),\s+commit\s+([0-9a-f]{7,40})\)/mu;
const TETTO_LETTURA_MS = 2_000;
const RIPROVA_DOPO_MS = 60_000;

/** `version: 0.7.0-dev (build 11669, commit 620d2225c)` ⇒ `{ build, commit }`; anything else is `null`, «I don't know». */
export function leggiRigaVersione(testo) {
  if (typeof testo !== 'string') return null;
  const riga = RIGA_VERSIONE.exec(testo);
  return riga ? { build: Number(riga[1]), commit: riga[2] } : null;
}

/** `true`/`false` from what was read, `null` when nothing was read. The binary prints a short commit, the pin holds the whole one. */
export function confrontaConLaFissata(letta, fissata) {
  if (!letta) return null;
  return letta.build !== fissata.build || !fissata.commit.startsWith(letta.commit);
}

/** The line for the engine log, only when the engine is not the pinned one. */
export function rigaDelRegistro({ build, commit, fissata, diverso, manuale }) {
  if (diverso !== true) return null;
  return `[talos] engine build ${build} (commit ${commit}), ${manuale ? 'set by hand; ' : ''}package pins ${fissata.build}\n`;
}

export function createVersioneDelMotore({ sonda, manuale = false, fissata = MOTORE_FISSATO, stat = statSync, tettoMs = TETTO_LETTURA_MS,
  riprovaDopoMs = RIPROVA_DOPO_MS, now = Date.now, onLetta = null } = {}) {
  const letture = new Map();

  function foto(letta) {
    return { build: letta?.build ?? null, commit: letta?.commit ?? null, fissata: { build: fissata.build, commit: fissata.commit },
      diverso: confrontaConLaFissata(letta ?? null, fissata), manuale };
  }

  function impronta(percorso) {
    try {
      const { size, mtimeMs } = stat(percorso);
      return `${size}|${mtimeMs}`;
    } catch { return null; }
  }

  function leggi(percorso, chiave) {
    const voce = { chiave, letta: null, provataIl: now() };
    letture.set(percorso, voce);
    setImmediate(async () => {
      let letta = null;
      try { letta = leggiRigaVersione(await sonda(percorso, ['--version'], tettoMs)); } catch { /* unknown, never an error */ }
      voce.letta = letta; // an answer for a file that has changed lands on a record nobody reads any more
      if (letta && letture.get(percorso) === voce) {
        try { onLetta?.(foto(letta)); } catch { /* observer isolation */ }
      }
    });
  }

  /** Synchronous on purpose: whoever asks gets what is known now, and the read, if one is due, goes on behind. */
  function versione(percorso) {
    if (typeof percorso !== 'string' || percorso === '') return foto(null);
    const chiave = impronta(percorso);
    if (chiave === null) return foto(null);
    const voce = letture.get(percorso);
    if (voce?.chiave !== chiave || (!voce.letta && now() - voce.provataIl >= riprovaDopoMs)) {
      leggi(percorso, chiave);
      return foto(null);
    }
    return foto(voce.letta);
  }

  return Object.freeze({ versione });
}
