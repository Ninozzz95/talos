// Corpus DETERMINISTICO di comandi per il confronto differenziale del pavimento col rilevatore VERO di Hermes (N-02, owner
// 02/10/2026). Le risposte di Hermes per (12000, 11) stanno in pavimento-oracolo-hermes.json; rev-pavimento-comandi.test.mjs
// rigenera il corpus e confronta. ⛔ Non cambiare il generatore senza rigenerare il fissaggio con l'oracolo (Python + clone).
export function generaCorpusPavimento(quanti, seme) {
    let s = seme >>> 0
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    const scegli = (a) => a[Math.floor(rnd() * a.length)]
    const BASE = [
      'rm -rf /', 'rm -fr //', 'rm -rf /.', 'rm -rf /..', 'rm -rf /./', 'rm -rf //*', 'rm -rf ~', 'rm -rf ~/', 'rm -rf ~/*', 'rm -rf $HOME',
      'rm -rf "${HOME}"', 'rm -rf ${HOME}', 'rm -r /etc', 'rm -rf /etc/*', 'rm -rf /usr', 'rm -rf /home', 'rm -rf /home/u/x', 'rm -rf /tmp/x',
      'rm -rf ./build', 'rm --recursive --force /', 'rm -rf / *', 'rm /', 'rm -rf /...', 'rm -rf /.foo', 'rm -rf "/"', "rm -rf '/etc'",
      'rm -rf --no-preserve-root /', 'reboot', 'shutdown -h now', 'halt', 'poweroff', 'init 0', 'init 6', 'init 3', 'telinit 6',
      'systemctl reboot', 'systemctl kexec', 'systemctl status x', 'mkfs.ext4 /dev/sda1', 'mkfs /dev/sdb', 'mkfs_helper --v',
      'dd if=/dev/zero of=/dev/sda', 'dd if=x of=/dev/nvme0n1 bs=1M', 'dd if=a of=b', 'kill -9 -1', 'kill -1', 'kill -HUP -1', 'kill 123',
      'cat f > /dev/sda', 'echo x > /dev/sdb1', 'echo x > /dev/null', ':(){ :|:& };:', 'sudo -S whoami', 'sudo -s', 'sudo apt update',
      'sudo -u root id', 'echo hi', 'ls -la', 'git status', 'npm test', 'grep -P "x(y)" f', "grep 'reboot' f", 'grep -e reboot f',
      'grep -P', "grep 'open", 'printf "%s" x', 'cat <<EOF', 'echo $(echo rm) -rf /', 'r\\m -rf /', "r''m -rf /", 'rm${IFS}-rf${IFS}/',
      'find . -name "*reboot*"', 'node -e "1"', 'python3 -c "print(1)"', 'perl -e 1', 'ruby -e 1', 'pwsh -Command x', 'deno eval 1',
      'rg --pre-glob x --pre y f', 'sort -o out f', 'man ls', 'ag --pager less x', 'env -S "reboot"', 'command -v reboot',
      'timeout 5 reboot', 'chroot /x reboot', 'nice -n 5 reboot', 'exec reboot', 'builtin echo reboot', 'stdbuf -o0 reboot',
    ]
    const SEP = [';', ' ; ', ' && ', ' || ', ' | ', '\n', ' & ', ';\n', '&&']
    const virg = (x) => `"${x.replaceAll('"', '\\"')}"`
    const apici = (x) => `'${x.replaceAll("'", "'\\''")}'`
    const AVVOLGI = [
      (x) => `echo ${virg(x)}`, (x) => `echo ${apici(x)}`, (x) => `git commit -m ${virg(x)}`, (x) => `gh pr create --title ${virg(x)}`,
      (x) => `bash -c ${apici(x)}`, (x) => `sh -c ${virg(x)}`, (x) => `bash -lc ${apici(x)}`, (x) => `zsh -c ${apici(x)}`, (x) => `eval ${apici(x)}`,
      (x) => `python3 -c ${apici(x)}`, (x) => `$(${x})`, (x) => `\`${x}\``, (x) => `(${x})`, (x) => `( ${x} )`, (x) => `{ ${x}; }`,
      (x) => `sudo ${x}`, (x) => `sudo -E ${x}`, (x) => `env A=1 ${x}`, (x) => `nohup ${x}`, (x) => `setsid ${x}`, (x) => `time ${x}`,
      (x) => `timeout 5 ${x}`, (x) => `command ${x}`, (x) => `if true; then ${x}; fi`, (x) => `for i in 1; do ${x}; done`,
      (x) => `while false; do ${x}; done`, (x) => `rg --pre ${apici(x)} -e . f`, (x) => `sort --compress-program=${apici(x)} f`,
      (x) => `man -P ${apici(x)} ls`, (x) => `ag --pager=${apici(x)} n`, (x) => `xargs ${x}`, (x) => `echo "$(${x})"`, (x) => `echo "\`${x}\`"`,
      (x) => `grep -P ${apici(x)} f`, (x) => `grep -F ${apici(x)} f`, (x) => `printf '%s' ${apici(x)}`, (x) => `cat <<'EOF'\n${x}\nEOF`,
      (x) => `x="$(${x})"; echo $x`, (x) => `${x} # commento`, (x) => `# ${x}`, (x) => `true\n${x}`, (x) => `echo "a\\"b"; ${x}`,
      (x) => `cat "f\\"n"; ${x}`, (x) => `hermes send ${virg(`line1\n${x}`)}`, (x) => `env -S ${apici(x)}`, (x) => `bash -O x -c ${apici(x)}`,
    ]
    const OFFUSCA = [
      (x) => { const i = Math.floor(rnd() * x.length); return /[a-z]/.test(x[i] ?? '') ? x.slice(0, i) + '\\' + x.slice(i) : x },
      (x) => x.replace(' ', '${IFS}'), (x) => x.replace(' ', '$IFS '), (x) => { const i = Math.floor(rnd() * x.length); return x.slice(0, i) + "''" + x.slice(i) },
      (x) => x.replace(' ', ' \\\n'), (x) => x.replace(/[a-z]/g, (c) => (rnd() < 0.3 ? String.fromCharCode(c.charCodeAt(0) + 0xFEE0) : c)),
      (x) => x.replace(' ', ' \x1b[0m'), (x) => x.replace(' ', ' \x00'), (x) => x.toUpperCase(), (x) => x.replace(' ', '\t'),
      (x) => x.slice(0, Math.max(1, Math.floor(rnd() * x.length))), (x) => x + ' \\', (x) => x.replace('/', '\\/'),
    ]
    function comando(profondita) {
      let x = scegli(BASE)
      if (profondita > 0 && rnd() < 0.55) x = scegli(AVVOLGI)(comando(profondita - 1))
      if (rnd() < 0.3) x = x + scegli(SEP) + comando(profondita - 1 < 0 ? 0 : profondita - 1)
      if (rnd() < 0.2) x = scegli(OFFUSCA)(x)
      return x
    }
    const corpus = new Set()
    while (corpus.size < quanti) corpus.add(comando(Math.floor(rnd() * 4)))
    return [...corpus]
}
