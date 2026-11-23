/** R5b exit frames at 120×40 (r5b-surfaces.ts): themes, /status, /help, /undo, fuzzy @, export, rename, copy, retry, history; behind the refusing sink. */
import {registerR5bSurfaces} from './r5b-surfaces.ts';
import {startRefusingSink} from './sink.ts';

registerR5bSurfaces('s24',{cols:120,rows:40},await startRefusingSink());
