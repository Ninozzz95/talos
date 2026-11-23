/*
 * 0.6.13 gate (25/10/2026): the pure half of `scripts/kernel-tests.mjs`. The kernel suite on ONE command line was about 35,455
 * characters (846 files, 27 `--test-skip-pattern` flags), over the 32,767 Windows allows (CreateProcess; libuv answers
 * UV_ENAMETOOLONG): spawnSync failed and the suite never ran. Here: how long a command line is, how the files split into batches
 * that stay under a limit, and how the batches' `ℹ` summaries add up into the one total the gate greps.
 */

/* well under 32,767: the environment and Node's own quoting must not bring a batch back to the edge */
export const COMMAND_LINE_LIMIT = 24_000;

/* an over-estimate on purpose: every argument as if quoted ("…"), plus the space before it */
export function commandLineLength(execPath, args) {
  return execPath.length + 2 + args.reduce((sum, arg) => sum + arg.length + 3, 0);
}

/* the files in order, cut where the next one would take the command line (fixed arguments included) over the limit */
export function batchFiles({execPath, fixedArgs, files, limit = COMMAND_LINE_LIMIT}) {
  const base = commandLineLength(execPath, fixedArgs);
  const batches = [];
  let current = [];
  let length = base;
  for (const file of files) {
    const cost = file.length + 3;
    if (base + cost > limit) throw new Error(`kernel tests: ${file} cannot fit on a command line of ${limit} characters, even alone`);
    if (current.length && length + cost > limit) {
      batches.push(current);
      current = [];
      length = base;
    }
    current.push(file);
    length += cost;
  }
  if (current.length) batches.push(current);
  return batches;
}

export const TOTAL_FIELDS = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];

/* the LAST value of every `ℹ <field> N` line is the batch's own summary; no `ℹ tests` line at all means no summary */
export function parseTotals(text) {
  const totals = {};
  for (const field of TOTAL_FIELDS) {
    const matches = [...text.matchAll(new RegExp(`^ℹ ${field} (\\d+)\\s*$`, 'gmu'))];
    totals[field] = matches.length ? Number(matches.at(-1)[1]) : 0;
  }
  return /^ℹ tests \d+\s*$/mu.test(text) ? totals : null;
}

export function sumTotals(list) {
  const sum = Object.fromEntries(TOTAL_FIELDS.map(field => [field, 0]));
  for (const totals of list) for (const field of TOTAL_FIELDS) sum[field] += totals[field];
  return sum;
}

/* `fail` last: the gate takes the last `ℹ fail` line of the log, and `ℹ tests`/`ℹ pass` from the same block */
export function formatTotals(totals) {
  const order = [...TOTAL_FIELDS.filter(field => field !== 'fail'), 'fail'];
  return `${order.map(field => `ℹ ${field} ${totals[field]}`).join('\n')}\n`;
}

/*
 * One batch as a child process: its output kept (for the summary) and passed on to the screen as it comes. Review 17 of 0.6.13:
 * - R17-3: `spawn` emits 'error' only for EACCES, EAGAIN, EMFILE, ENFILE and ENOENT; for the others, ENAMETOOLONG among them, it
 *   THROWS synchronously. Uncaught, the throw rejected the run: the next batches never started and no total was printed. Caught, it
 *   is a batch that could not start, like an 'error' event.
 * - R17-4(a): each stream is decoded as UTF-8 (`setEncoding`, Node stream.md: multi-byte characters are handled across chunks), so an
 *   `ℹ` (3 bytes) split between two chunks is not lost, nor the batch's summary with it.
 */
export function runBatch({spawn, execPath, args, options, stdout, stderr}) {
  return new Promise(resolve => {
    let output = '';
    let child;
    try { child = spawn(execPath, args, options); } catch (error) { resolve({status: null, error, output}); return; }
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { output += chunk; stdout.write(chunk); });
    child.stderr.on('data', chunk => { output += chunk; stderr.write(chunk); });
    child.on('error', error => resolve({status: null, error, output}));
    child.on('close', status => resolve({status, error: null, output}));
  });
}

/* every batch in turn: one that could not start or failed makes the run fail, and the next batches still run */
export async function runBatches({batches, run, log, logError}) {
  let status = 0;
  const totals = [];
  for (const [index, batch] of batches.entries()) {
    log(`kernel tests: batch ${index + 1}/${batches.length} (${batch.length} files)`);
    const result = await run(batch);
    if (result.error) {
      logError(`kernel tests: batch ${index + 1} could not start: ${result.error.code ?? result.error.message}`);
      status = 1;
      continue;
    }
    const summary = parseTotals(result.output);
    if (summary) totals.push(summary);
    else logError(`kernel tests: batch ${index + 1} printed no summary (exit ${result.status})`);
    if (result.status !== 0) status = 1;
  }
  return {status, totals};
}
