/**
 * ⛔ K3-C3b-2a (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): leggere una riga di comando per la scheda Processi.
 * COPIA FISSATA di `harness-ui/frontend/src/components/comando-shell.js` @ r4 `fc5e25d62` (`analizzaComando`, `FAMIGLIE`,
 * `nomeEseguibile`, `famigliaDaEseguibile`, la raffinazione per sottocomando), provata contro il golden calcolato dalla funzione
 * vera (`tests/fixtures/r4/processi-fc5e25d62.json`, `analisi`).
 * Il parser è `shell-quote` 1.10.0 (MIT) dal pacchetto npm fissato, lo stesso che il desktop tiene copiato nel suo repo. Si importa
 * `shell-quote/parse` e non l'ingresso del pacchetto: i tipi dell'ingresso ridichiarano `Array.join` per tutto il progetto.
 * Le icone e il disegno a segmenti sono del componente (`TalosCodiceR4Processi.vue`), non di qui.
 */
import parse from 'shell-quote/parse'

/** L'escape di `shell-quote` è la barra rovescia: qui si MOSTRA un comando, e la barra rovescia di un percorso Windows resta com'è. */
const SENZA_ESCAPE = '\u0000'
/** Le variabili NON si espandono: `$HOME` resta `$HOME`. */
const VARIABILE_A_SE_STESSA = (nome: string) => `$${nome}`

/** Le famiglie. `generico` è la risposta onesta per un comando che non conosciamo. */
export const FAMIGLIE_R4 = Object.freeze([
    'git', 'node', 'python', 'docker', 'test', 'build',
    'server', 'rete', 'filesystem', 'install', 'shell', 'generico',
] as const)
export type FamigliaR4 = (typeof FAMIGLIE_R4)[number]

const CON_SOTTOCOMANDO = new Set([
    'git', 'gh', 'hub', 'jj',
    'npm', 'pnpm', 'yarn', 'bun', 'npx', 'deno',
    'docker', 'podman', 'kubectl', 'helm',
    'cargo', 'go', 'rustup',
    'pip', 'pip3', 'poetry', 'uv', 'conda',
    'dotnet', 'apt', 'apt-get', 'brew', 'choco', 'winget', 'scoop',
    'systemctl', 'adb', 'terraform', 'aws', 'gcloud', 'az', 'nvm',
])
const PREFISSI = new Set(['sudo', 'doas', 'env', 'time', 'nohup', 'command'])
const GESTORI_PACCHETTI = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx'])

const FAMIGLIA_PER_ESEGUIBILE = new Map<string, FamigliaR4>(Object.entries({
    git: 'git', gh: 'git', hub: 'git', jj: 'git', tig: 'git',

    node: 'node', nodejs: 'node', deno: 'node', tsx: 'node', 'ts-node': 'node',
    eslint: 'node', prettier: 'node', biome: 'node',

    python: 'python', python3: 'python', py: 'python', pip: 'python', pip3: 'python',
    poetry: 'python', uv: 'python', conda: 'python', ruff: 'python', black: 'python', mypy: 'python',

    docker: 'docker', podman: 'docker', 'docker-compose': 'docker', kubectl: 'docker', helm: 'docker',
    minikube: 'docker', kind: 'docker',

    pytest: 'test', jest: 'test', vitest: 'test', mocha: 'test', ava: 'test', tap: 'test',
    playwright: 'test', cypress: 'test', phpunit: 'test', rspec: 'test', ctest: 'test', gotestsum: 'test',

    make: 'build', gmake: 'build', cmake: 'build', ninja: 'build', msbuild: 'build',
    gradle: 'build', gradlew: 'build', mvn: 'build', ant: 'build', bazel: 'build',
    cargo: 'build', go: 'build', dotnet: 'build', tsc: 'build', swc: 'build',
    webpack: 'build', rollup: 'build', esbuild: 'build', vite: 'build', parcel: 'build',

    serve: 'server', uvicorn: 'server', gunicorn: 'server', flask: 'server', django: 'server',
    nginx: 'server', httpd: 'server', caddy: 'server', rails: 'server', php: 'server',

    curl: 'rete', wget: 'rete', ssh: 'rete', scp: 'rete', sftp: 'rete', rsync: 'rete',
    ping: 'rete', nc: 'rete', netcat: 'rete', netstat: 'rete', dig: 'rete', host: 'rete',
    nslookup: 'rete', telnet: 'rete', traceroute: 'rete', ifconfig: 'rete', ip: 'rete',

    ls: 'filesystem', dir: 'filesystem', tree: 'filesystem', cat: 'filesystem', head: 'filesystem',
    tail: 'filesystem', less: 'filesystem', more: 'filesystem', cp: 'filesystem', mv: 'filesystem',
    rm: 'filesystem', rmdir: 'filesystem', mkdir: 'filesystem', touch: 'filesystem', ln: 'filesystem',
    find: 'filesystem', grep: 'filesystem', rg: 'filesystem', ripgrep: 'filesystem', ag: 'filesystem',
    sed: 'filesystem', awk: 'filesystem', sort: 'filesystem', uniq: 'filesystem', wc: 'filesystem',
    diff: 'filesystem', cut: 'filesystem', tr: 'filesystem', tar: 'filesystem', zip: 'filesystem',
    unzip: 'filesystem', gzip: 'filesystem', gunzip: 'filesystem', chmod: 'filesystem',
    chown: 'filesystem', du: 'filesystem', df: 'filesystem', stat: 'filesystem', realpath: 'filesystem',
    robocopy: 'filesystem', xcopy: 'filesystem', fd: 'filesystem',

    apt: 'install', 'apt-get': 'install', brew: 'install', choco: 'install', winget: 'install',
    scoop: 'install', yum: 'install', dnf: 'install', pacman: 'install', apk: 'install',

    bash: 'shell', sh: 'shell', zsh: 'shell', fish: 'shell', dash: 'shell', ksh: 'shell',
    pwsh: 'shell', powershell: 'shell', cmd: 'shell', echo: 'shell', printf: 'shell',
    export: 'shell', set: 'shell', source: 'shell', which: 'shell', where: 'shell',
    type: 'shell', sleep: 'shell', exit: 'shell', alias: 'shell', history: 'shell', clear: 'shell',
}) as [string, FamigliaR4][])

const ASSEGNAZIONE = /^[A-Za-z_][A-Za-z0-9_]*=/u
const PARE_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)/iu
const PARE_PERCORSO = /[/\\]|^\.{1,2}$|^\.[^.]|\.[A-Za-z0-9]{1,8}$/u
const VUOLE_VIRGOLETTE = /[\s"'|&;<>()]/u
const OP_NUOVO_COMANDO = new Set(['|', '||', '&&', ';', ';;', '|&', '&', '(', ')', '<('])
const OP_VERSO_FILE = new Set(['>', '>>', '<', '<<<'])
const OP_VERSO_DESCRITTORE = new Set(['>&', '<&'])

export type TipoSegmentoR4 = 'eseguibile' | 'sottocomando' | 'flag' | 'argomento' | 'percorso' | 'url' | 'operatore' | 'commento' | 'grezzo'
export interface SegmentoR4 { tipo: TipoSegmentoR4; testo: string }
export interface AnalisiComandoR4 {
    ok: boolean
    segmenti: SegmentoR4[]
    eseguibile: string | null
    sottocomando: string | null
    famiglia: FamigliaR4
    testo: string
}

/** Il nome nudo di un eseguibile: via il percorso, via l'estensione di Windows, tutto minuscolo. */
export function nomeEseguibileR4(token: unknown): string {
    const t = String(token ?? '').trim()
    if (!t) return ''
    const ultimo = t.replace(/\\/gu, '/').split('/').filter(Boolean).pop() || ''
    return ultimo.toLowerCase().replace(/\.(?:exe|cmd|bat|ps1|com)$/u, '')
}

/** La famiglia di un eseguibile, senza guardare i suoi argomenti. */
export function famigliaDaEseguibileR4(eseguibile: unknown): FamigliaR4 {
    const nome = nomeEseguibileR4(eseguibile)
    if (!nome) return 'generico'
    return FAMIGLIA_PER_ESEGUIBILE.get(nome) || 'generico'
}

/** La famiglia quando il sottocomando cambia le carte in tavola (`npm install`, `cargo test`); solo le parole del PRIMO comando. */
function raffinaFamiglia(eseguibile: string, parole: string[], flag: string[]): FamigliaR4 {
    const base = famigliaDaEseguibileR4(eseguibile)
    const nome = nomeEseguibileR4(eseguibile)
    const p0 = (parole[0] || '').toLowerCase()
    const p1 = (parole[1] || '').toLowerCase()

    if (GESTORI_PACCHETTI.has(nome)) {
        if (nome === 'npx') {
            const dentro = famigliaDaEseguibileR4(p0)
            return dentro === 'generico' ? 'node' : dentro
        }
        if (['install', 'i', 'ci', 'add', 'remove', 'rm', 'uninstall', 'update', 'upgrade', 'link'].includes(p0)) return 'install'
        if (p0 === 'test' || p0 === 'prova') return 'test'
        if (['start', 'dev', 'serve', 'preview'].includes(p0)) return 'server'
        if (p0 === 'build') return 'build'
        if (['run', 'run-script', 'exec'].includes(p0)) {
            if (/^(?:test|prova|check|lint|verify)/u.test(p1)) return 'test'
            if (/^(?:build|compila|bundle|dist)/u.test(p1)) return 'build'
            if (/^(?:dev|start|serve|preview|watch)/u.test(p1)) return 'server'
            return 'node'
        }
        return 'node'
    }
    if (nome === 'node' || nome === 'deno' || nome === 'nodejs') {
        if (flag.some((f) => f === '--test' || f.startsWith('--test='))) return 'test'
        return 'node'
    }
    if (nome === 'python' || nome === 'python3' || nome === 'py') {
        if (['pytest', 'unittest', 'nose2'].includes(p0)) return 'test'
        return 'python'
    }
    if (nome === 'pip' || nome === 'pip3' || nome === 'poetry' || nome === 'uv' || nome === 'conda') {
        if (['install', 'add', 'sync'].includes(p0)) return 'install'
        return 'python'
    }
    if (nome === 'docker' || nome === 'podman') {
        if (p0 === 'build' || p0 === 'buildx') return 'build'
        return 'docker'
    }
    if (nome === 'cargo') {
        if (p0 === 'test' || p0 === 'bench') return 'test'
        if (p0 === 'add' || p0 === 'install') return 'install'
        return 'build'
    }
    if (nome === 'go') {
        if (p0 === 'test') return 'test'
        if (p0 === 'get' || p0 === 'install') return 'install'
        return 'build'
    }
    if (nome === 'dotnet') {
        if (p0 === 'test') return 'test'
        if (p0 === 'run') return 'server'
        return 'build'
    }
    if (['apt', 'apt-get', 'brew', 'choco', 'winget', 'scoop', 'yum', 'dnf', 'pacman', 'apk'].includes(nome)) return 'install'
    return base
}

/** Il testo da mostrare per un token: le virgolette tornano dove servono a non cambiare il comando. */
function perMostrare(token: unknown): string {
    const t = String(token ?? '')
    if (!VUOLE_VIRGOLETTE.test(t)) return t
    return `"${t.replace(/"/gu, '\\"')}"`
}

function tipoDelToken(token: string): TipoSegmentoR4 {
    if (token.startsWith('-')) return 'flag'
    if (PARE_URL.test(token)) return 'url'
    if (PARE_PERCORSO.test(token)) return 'percorso'
    return 'argomento'
}

/**
 * Legge una riga di comando e la rende in segmenti con un significato ciascuno. `ok: false` vuol dire «non l'ho saputo leggere»:
 * si ripiega su un segmento `grezzo` con la riga intera, mai una riga inventata.
 */
export function analizzaComandoR4(riga: unknown): AnalisiComandoR4 {
    const grezzo = String(riga ?? '').trim()
    const vuoto: AnalisiComandoR4 = { ok: false, segmenti: [], eseguibile: null, sottocomando: null, famiglia: 'generico', testo: '' }
    if (!grezzo) return vuoto

    let voci: unknown[]
    try {
        voci = parse(grezzo, VARIABILE_A_SE_STESSA, { escape: SENZA_ESCAPE })
    } catch {
        // `parse()` lancia su una sostituzione malformata (`${}`): una riga storta non butta giù la scheda
        return { ok: false, segmenti: [{ tipo: 'grezzo', testo: grezzo }], eseguibile: null, sottocomando: null, famiglia: 'generico', testo: grezzo }
    }
    if (!Array.isArray(voci) || voci.length === 0) return { ...vuoto, segmenti: [{ tipo: 'grezzo', testo: grezzo }], testo: grezzo }

    const segmenti: SegmentoR4[] = []
    const parole: string[] = []
    const indiciParole: number[] = []
    const flag: string[] = []
    let eseguibile: string | null = null
    let attesa: 'eseguibile' | 'percorso' | 'descrittore' | 'libera' = 'eseguibile'
    let primoComando = true

    for (const voce of voci) {
        if (voce && typeof voce === 'object') {
            const v = voce as { comment?: unknown; op?: unknown; pattern?: unknown }
            if (typeof v.comment === 'string') {
                segmenti.push({ tipo: 'commento', testo: `#${v.comment.replace(/\s+$/u, '')}` })
                continue
            }
            if (v.op === 'glob') {
                segmenti.push({ tipo: attesa === 'eseguibile' ? 'eseguibile' : 'percorso', testo: String(v.pattern ?? '') })
                if (attesa === 'eseguibile') attesa = 'libera'
                else if (attesa !== 'libera') attesa = 'libera'
                else if (primoComando) { parole.push(String(v.pattern ?? '')); indiciParole.push(segmenti.length - 1) }
                continue
            }
            if (typeof v.op === 'string') {
                segmenti.push({ tipo: 'operatore', testo: v.op })
                if (OP_NUOVO_COMANDO.has(v.op)) { attesa = 'eseguibile'; primoComando = false }
                else if (OP_VERSO_FILE.has(v.op)) attesa = 'percorso'
                else if (OP_VERSO_DESCRITTORE.has(v.op)) attesa = 'descrittore'
                else attesa = 'libera'
                continue
            }
            continue
        }

        const token = String(voce ?? '')
        if (!token) continue

        if (attesa === 'eseguibile') {
            if (ASSEGNAZIONE.test(token)) {
                segmenti.push({ tipo: 'argomento', testo: perMostrare(token) })
                continue
            }
            segmenti.push({ tipo: 'eseguibile', testo: perMostrare(token) })
            const nome = nomeEseguibileR4(token)
            if (PREFISSI.has(nome)) continue
            if (eseguibile === null) eseguibile = token
            attesa = 'libera'
            continue
        }
        if (attesa === 'percorso') {
            segmenti.push({ tipo: 'percorso', testo: perMostrare(token) })
            attesa = 'libera'
            continue
        }
        if (attesa === 'descrittore') {
            segmenti.push({ tipo: 'argomento', testo: perMostrare(token) })
            attesa = 'libera'
            continue
        }
        const tipo = tipoDelToken(token)
        segmenti.push({ tipo, testo: perMostrare(token) })
        if (primoComando) {
            if (tipo === 'flag') flag.push(token)
            else { parole.push(token); indiciParole.push(segmenti.length - 1) }
        }
    }

    let sottocomando: string | null = null
    if (eseguibile && CON_SOTTOCOMANDO.has(nomeEseguibileR4(eseguibile)) && parole.length) {
        const candidato = parole[0]
        if (!PARE_URL.test(candidato) && !PARE_PERCORSO.test(candidato)) {
            sottocomando = candidato
            const dove = indiciParole[0]
            if (segmenti[dove]) segmenti[dove].tipo = 'sottocomando'
        }
    }

    const famiglia = eseguibile ? raffinaFamiglia(eseguibile, parole, flag) : 'generico'
    return {
        ok: true,
        segmenti,
        eseguibile: eseguibile ? nomeEseguibileR4(eseguibile) : null,
        sottocomando,
        famiglia,
        testo: segmenti.map((s) => s.testo).join(' '),
    }
}
