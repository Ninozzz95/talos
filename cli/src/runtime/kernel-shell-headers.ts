/*
 * 0.6.13, release review S2-2 (22/10/2026): the two lines the desktop's kernel adapter puts in front of an executed shell result for
 * the MODEL (talosHarness.desktop-hotfix.mjs:55-57). They are the kernel's contract, copied byte for byte, not words of the screen:
 * the screen only recognises them to leave them out (tui/tools/shared.ts `withoutKernelExitLine`), so they live here and not in
 * src/i18n. Pinned against the adapter's own output by test/tui/shell-adapter-notice-row.test.ts.
 */
export const ADAPTER_SHELL_NOTICE='[shell output: stdout and stderr combined in arrival order; stream identity is not preserved]';
export const ADAPTER_POWERSHELL_ZERO_WARNING='⚠ SHELL_DIAGNOSTIC_WITH_ZERO_EXIT: PowerShell emitted a structured error diagnostic even though the process reported exit 0. Treat this command as NOT VERIFIED until the diagnostic is resolved.';
