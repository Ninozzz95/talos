/**
 * s17 — R3 exit frames at 60×30 (gate §8.3): read, shell, write, edit, failing command, deny, interrupt, status words.
 */
import {registerToolFrames} from './r3-tools.ts';

registerToolFrames('s17',{cols:60,rows:30});
