/** R5b exit frames at 60×30 (r5b-surfaces.ts): themes, /status, /help, /undo, fuzzy @, export, rename, copy, retry, history; behind the refusing sink. */
import {registerR5bSurfaces} from './r5b-surfaces.ts';
import {startRefusingSink} from './sink.ts';

registerR5bSurfaces('s23',{cols:60,rows:30},await startRefusingSink());
