/*
 * ⛔ 0.6.8 (stress test of 0.6.7, F-E-001, S0, reproduced on the published 0.6.7): on Windows a program called by its bare name is
 *   looked for in the CHILD's working directory before PATH, unless the process that launches it has
 *   NoDefaultCurrentDirectoryInExePath (CreateProcess, reproduced by libuv; nodejs/node#46264). The kernel runs `git log -3` by name
 *   with cwd = the project when a session opens (scheda-di-lavoro.mjs), and the CLI runs git by name for checkpoints: a `git.exe`
 *   planted in a cloned project ran ON THE HOST at a plain `talos -p`, in an untrusted folder too, with no tool call. The desktop
 *   sets the variable first thing in its server (harness-ui/src/difesa-ricerca-programmi.mjs); the CLI never did.
 * ⇒ Imported FIRST by main.ts, before any module that could spawn while it loads, and inherited by every child (cmd.exe honours it
 *   too). Only bare names are affected: `.\program` still means that file. Outside Windows the variable has no effect.
 */
export const EXE_SEARCH_DEFENCE='NoDefaultCurrentDirectoryInExePath';
export function armExeSearchDefence(env:NodeJS.ProcessEnv=process.env):string{
  if(!env[EXE_SEARCH_DEFENCE])env[EXE_SEARCH_DEFENCE]='1';
  return env[EXE_SEARCH_DEFENCE]!;
}
armExeSearchDefence();
