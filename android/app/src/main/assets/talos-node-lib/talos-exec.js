// TalosTerminalPlugin — helper statico, pushato UNA volta insieme al
// binario Node, MAI ritrasmesso a ogni comando via `adb shell` — ricerca
// 28/8 (github.com/advisories/GHSA-r7qv-8r2h-pg27, delphix/sdb#219 e
// discussioni simili): `adb shell` ha limiti noti e non documentati nel
// preservare argomenti con `(`, `{`, `;`, righe multiple — uno script
// inline via `-e "<...>"` si rompeva con "syntax error: unexpected '('"
// sulla SHELL REMOTA, prima ancora di arrivare a Node. Il comando vero
// arriva in base64 (solo [A-Za-z0-9+/=], MAI interpretabile da una shell)
// invece che come testo libero.
const { execSync } = require('child_process');
const comando = Buffer.from(process.argv[2] || '', 'base64').toString('utf8');
try {
  const o = execSync(comando, { shell: '/system/bin/sh', maxBuffer: 8 * 1024 * 1024 });
  process.stdout.write(o);
} catch (e) {
  if (e.stdout) process.stdout.write(e.stdout);
  process.stderr.write(e.stderr || String(e.message || e));
  process.exitCode = e.status == null ? 1 : e.status;
}
