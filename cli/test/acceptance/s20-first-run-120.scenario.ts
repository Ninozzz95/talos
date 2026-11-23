/** R4 exit frames at 120×40 (r4-first-run.ts): empty folder with no provider, AGENTS.md, no key; behind the refusing sink. */
import {registerFirstRun} from './r4-first-run.ts';
import {startRefusingSink} from './sink.ts';

registerFirstRun('s20',{cols:120,rows:40},await startRefusingSink());
