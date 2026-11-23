/** R5a exit frames at 120×40 (r5a-hermes-form.ts): status row, /usage, retry, 401/403, busy line, thinking, rule deny, saved output, read cut, chrome; behind the refusing sink. */
import {registerHermesForm} from './r5a-hermes-form.ts';
import {startRefusingSink} from './sink.ts';

registerHermesForm('s22',{cols:120,rows:40},await startRefusingSink());
