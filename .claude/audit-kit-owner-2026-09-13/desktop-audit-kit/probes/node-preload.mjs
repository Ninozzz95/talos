// Use --import explicitly with the separate Node development backend. Not a certified Electron entrypoint.
// No signal handlers are installed; application shutdown/sandbox/auth policies are not changed.
import {startNodeProbe} from './node-probe.mjs';
if (process.env.TALOS_AUDIT_DIRECTORY) {
  const interval = Number(process.env.TALOS_AUDIT_INTERVAL_MS ?? 1000);
  try {
    const probe = await startNodeProbe({directory:process.env.TALOS_AUDIT_DIRECTORY, intervalMs:interval});
    process.once('beforeExit', () => {probe.stop().catch(() => {process.stderr.write('TALOS audit probe finalization failed\n');});});
  } catch {
    // Fail open for the application, explicitly visible to the operator. Do not print secret paths/errors.
    process.stderr.write('TALOS audit probe did not start; check its explicit configuration\n');
  }
}
