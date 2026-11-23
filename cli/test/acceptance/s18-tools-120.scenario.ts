/**
 * s18 — R3 exit frames at 120×40 (gate §8.3): read, shell, write, edit, failing command, deny, interrupt, status words.
 */
import {registerToolFrames} from './r3-tools.ts';

registerToolFrames('s18',{cols:120,rows:40});
