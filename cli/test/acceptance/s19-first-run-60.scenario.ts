/** R4 exit frames at 60×30 (r4-first-run.ts): empty folder with no provider, AGENTS.md, no key; behind the refusing sink. */
import {registerFirstRun} from './r4-first-run.ts';
import {startRefusingSink} from './sink.ts';

registerFirstRun('s19',{cols:60,rows:30},await startRefusingSink());
