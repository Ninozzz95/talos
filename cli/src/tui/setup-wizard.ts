/*
 * P17 (owner, 2026-09-25: "mini procedura guidata semplicissima al fresh install"; decisions of 2026-09-26). The first launch
 * chains the windows that already exist: trust (the screen before anything loads) → provider → key or local engine → model,
 * one window at a time; since stage 7.10d they are the tabs of one sheet. Enter goes on, Esc closes, Ctrl+C quits, and what was
 * done stays saved.
 * Only the missing steps run: a key already usable (from the environment too) or a local engine that answers skips them; a
 * credential that exists but is benched is explained by the first frame's line, not asked again (Hermes #113720).
 * Read on 2026-09-26: Claude Code (welcome, theme, login, security notes, terminal setup, trust), Codex (welcome, auth,
 * trust), Hermes (provider + model through the same picker as `hermes model`, skippable, `hermes setup` to redo), Pi (theme
 * and analytics, providers later), OpenCode (no wizard), Gemini CLI (theme, then auth). `/setup` redoes it (Hermes'
 * `hermes setup`). Without an interactive terminal it never runs (clig.dev: "never require a prompt").
 */
import {t} from '../i18n/index.ts';

/* Stage 7.10d (owner 03/10 «stesso foglio anche al primo avvio»): the steps are the tabs of the setup sheet
   (panel/setup-sheet.ts); the «Step N of 4» line of each window went with the windows. */
export type SetupStart={start:false}|{start:true;from:'provider'|'key'|'model'};
/**
 * Whether the first launch runs the setup, and from which step. `providerUsable`: the chosen provider has a key usable now
 * (from the environment too) or needs none; `keyBenched`: it has a key that does not work now (explained, not asked again).
 */
export function setupStart(input:{firstLaunch:boolean;providerChosen:boolean;providerUsable:boolean;keyBenched:boolean;modelChosen:boolean}):SetupStart{
  if(!input.firstLaunch)return{start:false};
  if(!input.providerChosen)return{start:true,from:'provider'};
  if(input.keyBenched)return{start:false};
  if(!input.providerUsable)return{start:true,from:'key'};
  if(!input.modelChosen)return{start:true,from:'model'};
  return{start:false};
}

/** What the setup says when it ends: ready with the model, or where to pick it up again. */
export function setupEndLines(outcome:{ready:true;model:string}|{ready:false}):string[]{
  if(!outcome.ready)return[t('firstrun.setup.skipped')];
  return[t('firstrun.setup.ready',{model:outcome.model}),t('firstrun.setup.readyHints')];
}
