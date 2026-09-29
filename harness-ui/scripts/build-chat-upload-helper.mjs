import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'native', 'chat-file-upload');
const output = join(root, 'native', 'talos-chat-upload.exe');
const go = process.env.TALOS_GO_BINARY || 'go';

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: source, encoding: 'utf8',
    env: { ...process.env, GOTOOLCHAIN: 'local', CGO_ENABLED: '0' }, ...options });
  if (result.error || result.status !== 0) {
    throw new Error(`Build helper upload non riuscita: ${executable} ${args[0]} (${result.error?.code || result.status})`);
  }
  return result.stdout.trim();
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Il helper upload del desktop 0.1.19 richiede Windows x64.');
}
const version = run(go, ['version']);
if (!/^go version go1\.27\.1 windows\/amd64$/u.test(version)) {
  throw new Error(`Toolchain Go non conforme: ${version}`);
}
run(go, ['test', './...']);
run(go, ['build', '-trimpath', '-buildvcs=false', '-o', output, '.']);
if (!/^talos-chat-upload 0\.1\.0 go1\.27\.1$/u.test(run(output, ['--version']))) {
  throw new Error('Identita del helper upload non conforme.');
}
process.stdout.write(`Helper upload verificato: ${output}\n`);
