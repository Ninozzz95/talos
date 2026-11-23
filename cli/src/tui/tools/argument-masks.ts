import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {cleanKernelArguments} from '../../protocol/v2/events.ts';
import {findTalosRepoRoot} from '../../runtime/repo.ts';

/*
 * Twin repair of desktop 0.2.2, round 7 (reviewer 3 after round 6, RED 1, live at 120×40: `api key: R6S00V` and `password: R6S01V` in
 * clear in the tool row above the card that hid them). The arguments of a tool row (`tool.args`, protocol/v2/events.ts, only through the
 * key-form cleaning of the bridge) are drawn by the renderers (generic-renderer.ts, `argumentLine` in shared.ts), the activity line and
 * the tool group. Every one of them now reads them through the SAME masks as the card: the kernel's (`oscuraPerStruttura`,
 * harness-ui/src/forme-di-segreto.mjs: a secret name at any depth, in objects and lists, and the secret forms in every text and name),
 * then Gate E11 on top (`cleanKernelArguments`, the bridge's pass for the card: a name that holds a whole secret word, usage counters
 * readable). The kernel module is the one the session runs (`findTalosRepoRoot`: vendor/, or kernel/ in a bundle), loaded once.
 * A kernel older than 0.2.2 has no `oscuraPerStruttura`: then its secret forms on every text, and E11 on every name.
 * A value cut between two pieces: the row parses what arrived, with its open string and braces closed (`parseArgs`), and masks it
 * whole at every piece; a name arrives whole before its value, so a value under a secret name is masked from its first character.
 * Competitors: Hermes masks the progress row only for `browser_type` (agent/display.py:327-332) and masks secret fields at every depth
 * on its card (tools/mcp_tool_handlers.py:89-93); Claude Code masks secrets in shared conversations (CHANGELOG.md:1031).
 */
type KernelMasks={oscuraPerStruttura?:(value:unknown)=>unknown;oscuraFormeDiSegreto?:(text:string)=>string};
let kernel:KernelMasks|null=null;
try{kernel=await import(pathToFileURL(join(findTalosRepoRoot(),'harness-ui','src','forme-di-segreto.mjs')).href) as KernelMasks;}catch{kernel=null;}

/** A text of a tool row (a value that is not JSON) with the kernel's secret forms masked. */
export function maskArgumentText(text:string):string{
  return typeof kernel?.oscuraFormeDiSegreto==='function'?kernel.oscuraFormeDiSegreto(text):text;
}
/** The arguments of a tool row as the screen may show them: the kernel's masks, then E11. The tool and the model keep the real ones. */
export function maskToolArguments<T>(value:T):T{
  const structured=typeof kernel?.oscuraPerStruttura==='function';
  const kernelMasked=structured?kernel!.oscuraPerStruttura!(value):value;
  return cleanKernelArguments(kernelMasked,structured?(text:string)=>text:maskArgumentText) as T;
}
/** Whether the kernel's structural masks were found (a kernel of 0.2.2 or later); for the tests and the diagnostics. */
export function kernelArgumentMasksLoaded():boolean{return typeof kernel?.oscuraPerStruttura==='function';}
