import { join } from 'node:path';
import { cartellaDiProva } from './cartelle-di-prova.mjs';

/*
 * ⛔⛔ Decision 381 (judge 08/11/2026) — a test never reads or writes the GLOBAL stores kept beside the code.
 *
 * `createSessionRegistry` and `createHttpApp` default their global folders to `../.memory-store/`, `../.notes-store/`,
 * `../.tasks-store/`, `../.tool-forge-store/` and the three trust folders `../.hooks-trust/`, `../.mcp-trust/`, `../.plugin-trust/`
 * next to `src/` (src/session-registry.mjs:3153, :3166, :3233, :3266-3276, :3371; src/http-app.mjs:3643-3645). A file tracer
 * measured on 08/11 that the tests read the memories, the forged tools and the trust records of hooks, MCP servers and plugins there.
 * In a worktree those folders are empty, so a test that forgets them passes; in the folder of a running TALOS they hold the person's
 * real memories, and the memory block enters the prompt of every new session (agent-service.mjs `memorieNelPrompt`). Measured on
 * 08/11: `file-scritti-percorso-alias.test.mjs` B4 was green in the worktree and red in the candidate folder, and red again in a
 * copy with eight fake memories beside the code, with the same three lines.
 * Hermes does the same for its home: every test gets a fake HERMES_HOME with its own `memories` folder under `tmp_path`
 * (hermes-agent tests/conftest.py:305-311). Same pattern already used here by tests/archivi-personali-senza-sessione.test.mjs:24 and
 * tests/http-routes-note-attivita-memoria.test.mjs:36.
 * Every registry or app built by a test that does not choose its own folders gets these, under one temp folder of the test file
 * that `cartelle-di-prova.mjs` removes at the end of the file, one subfolder per call so no test sees another's memories. The
 * paths are only named, never created: an absent store reads as empty, as in a fresh install.
 */
let radice = null;
let n = 0;

/** The seven global folders of a fresh install, under the test's temp folder. Spread them BEFORE the test's own options. */
export function cartelleGlobaliDiProva() {
  radice ??= cartellaDiProva('talos-globali-di-prova-');
  n += 1;
  const base = join(radice, String(n));
  return {
    cartellaMemoria: join(base, 'memoria'),
    cartellaNote: join(base, 'note'),
    cartellaAttivita: join(base, 'attivita'),
    cartellaForge: join(base, 'forge'),
    cartellaTrustHook: join(base, 'fiducia-hook'),
    cartellaTrustMcp: join(base, 'fiducia-mcp'),
    cartellaTrustPlugin: join(base, 'fiducia-plugin'),
  };
}

/** Only the three that `createHttpApp` takes (src/http-app.mjs:3643-3645). */
export function cartelleGlobaliDiProvaPerApp() {
  const { cartellaMemoria, cartellaNote, cartellaAttivita } = cartelleGlobaliDiProva();
  return { cartellaMemoria, cartellaNote, cartellaAttivita };
}
