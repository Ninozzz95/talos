/**
 * ⭐⭐⭐ P0-bis, corsia A — i tre difetti della shell trovati sul banco il 16/09/2026
 * (schede BC-54, BC-55, BC-56 in `.claude/CODA-BUG-CRITICI-2026-09-08.md`).
 *
 * ⛔ Perché un file a parte e non dentro `src/kernel/talosHarness.test.mjs`: quello è
 *   la suite pura del kernel (`npm run test:kernel`), e il suo commento dichiara da
 *   sempre che `eseguiComandoSandboxato` «tocca processi veri (wsl.exe, spawn)» e
 *   perciò non è testata lì. Qui invece le prove d'integrazione ci sono per davvero,
 *   dichiarate e saltate con un motivo quando WSL non risponde — un `skip` che dice
 *   PERCHÉ è una misura, un file che tace non lo è.
 *
 * ⛔ E si importa lo SPAZIO DEI NOMI (`import * as kernel`), non i nomi uno per uno:
 *   così una funzione che manca fa fallire IL SUO test con un messaggio leggibile
 *   invece di far esplodere il caricamento dell'intero file, dove il conteggio
 *   diventa «0 test, 1 file rosso» e non si vede più quale regola non vale. È la
 *   forma che rende il RED misurabile prima della cura.
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as kernel from '../src/kernel/talosHarness.mjs'

/**
 * WSL risponde su questa macchina? Stessa domanda che si fa `distroWslPredefinita`
 * nel kernel, con lo stesso `utf16le` (wsl.exe scrive in UTF-16LE anche quando lo
 * si reindirizza) — ma qui serve solo un sì/no per decidere se una prova
 * d'integrazione può girare o va DICHIARATA saltata.
 */
function wslRisponde() {
    if (process.platform !== 'win32') return false
    try {
        const r = spawnSync('wsl.exe', ['-l', '-q'], { encoding: 'utf16le', timeout: 10_000, windowsHide: true })
        if (r.status !== 0) return false
        return String(r.stdout || '').replace(/\0/g, '').split('\n').some((riga) => riga.trim() !== '')
    }
    catch { return false }
}

const WSL_C_E = wslRisponde()
const MOTIVO_SALTO = 'wsl.exe non risponde su questa macchina (`wsl -l -q` vuoto o in errore): prova d\'integrazione NON eseguita, non passata'

let cartella
before(() => { cartella = mkdtempSync(join(tmpdir(), 'p0bis-shell-')) })

/* ──────────────────────────────────────────────────────────────────────────────
 * BC-54 — `wsl.exe … -- bash -lc "<script>"` fa passare la riga da DUE shell.
 * ────────────────────────────────────────────────────────────────────────────── */

describe('BC-54 — l\'argv verso WSL non passa mai dalla shell predefinita della distro', () => {
    it('⭐ `argomentiWslPerScript` esiste ed è la porta UNICA per consegnare uno script a WSL', () => {
        assert.equal(typeof kernel.argomentiWslPerScript, 'function',
            'senza una funzione sola che costruisce l\'argv, il separatore va ricordato in ogni chiamata — ed è esattamente così che `--` è rimasto lì')
    })

    it('⛔⛔⛔ il separatore è `--exec`, e `--` non compare MAI prima di `bash`', () => {
        const argv = kernel.argomentiWslPerScript('Ubuntu', 'echo ciao')
        assert.ok(!argv.includes('--'),
            `con '--' la riga la espande PRIMA la shell predefinita della distro: misurato il 17/09/2026, \`echo '$HOME'\` stampa /root. argv: ${JSON.stringify(argv)}`)
        assert.deepEqual(argv, ['-d', 'Ubuntu', '--exec', 'bash', '-lc', 'echo ciao'])
    })

    it('⭐ il separatore sta ATTACCATO a `bash`: ciò che segue è l\'eseguibile, non una riga da reinterpretare', () => {
        const argv = kernel.argomentiWslPerScript('Ubuntu-24.04', 'ls -la')
        assert.equal(argv[argv.indexOf('bash') - 1], '--exec')
        assert.equal(argv[argv.length - 1], 'ls -la', 'lo script viaggia come UN argomento, non spezzato')
    })

    it('⛔ e AL CONTRARIO: una distro diversa cambia solo la distro, non il resto della forma', () => {
        const a = kernel.argomentiWslPerScript('Ubuntu', 'X')
        const b = kernel.argomentiWslPerScript('Debian', 'X')
        assert.notDeepEqual(a, b)
        assert.deepEqual(a.filter((x) => x !== 'Ubuntu'), b.filter((x) => x !== 'Debian'))
    })

    it('⛔⛔⛔ INTEGRAZIONE — apici, `$?` e assegnazione per-comando sopravvivono fino a bash', async (t) => {
        if (!WSL_C_E) { t.skip(MOTIVO_SALTO); return }
        /*
         * I quattro casi misurati il 16/09 sul banco e rimisurati il 17/09 prima di scrivere:
         *   con `--`     → A:/root   B:/root   C:0   D:X=
         *   con `--exec` → A:$HOME   B:/root   C:1   D:X=42
         * `B` non si confronta con `/root`: l'utente della distro può non essere root su
         * un'altra macchina. Conta che `$HOME` sia stato espanso DA BASH (un percorso) e non
         * dalla shell esterna, e che fra apici singoli sia rimasto letterale.
         */
        const script = 'echo A:\'$HOME\' ; echo B:"$HOME" ; false ; echo C:$? ; X=42 sh -c \'echo D:X=$X\''
        const esito = await kernel.eseguiComandoSandboxato(script, cartella, { dove: 'wsl2' })
        assert.equal(esito.enforcement, 'wsl2', `doveva girare in WSL: ${esito.testo}`)
        assert.match(esito.testo, /A:\$HOME/, 'gli apici singoli devono proteggere `$HOME`: se leggi un percorso, una shell di troppo l\'ha già espanso')
        assert.match(esito.testo, /B:\/\S+/, '`"$HOME"` deve invece essere espanso da bash, in un percorso vero')
        assert.match(esito.testo, /C:1/, '`false; echo $?` deve dire 1: se dice 0 è la shell esterna che ha risposto per bash')
        assert.match(esito.testo, /D:X=42/, 'un\'assegnazione davanti al comando deve arrivare al processo figlio')
    })
})

/* ──────────────────────────────────────────────────────────────────────────────
 * BC-55 — il ripiego automatico (`dove: null`) guardava il PRIMO TOKEN NUDO.
 * ────────────────────────────────────────────────────────────────────────────── */

describe('BC-55 — una riga di shell POSIX non finisce su cmd.exe per il suo primo token', () => {
    it('⭐ `rigaVuoleUnaShellPosix` esiste', () => {
        assert.equal(typeof kernel.rigaVuoleUnaShellPosix, 'function')
    })

    it('⛔⛔⛔ le righe che una shell POSIX deve vedere', () => {
        const posix = [
            'X=abc; echo "X=[$X]"',            // assegnazione in testa: cmd non la conosce proprio
            "X=42 sh -c 'echo X=$X'",          // il caso del report, riprodotto il 16/09
            'export Y=7; echo $Y',
            '(cd . && pwd)',                   // il primo token è `(cd`
            'ls | wc -l',
            'npm test && echo fatto',
            'false || echo ripiego',
            "echo '$HOME'",
            'cat <<\'FINE\'\nriga\nFINE',      // più righe: cmd non esegue uno script
        ]
        for (const riga of posix) {
            assert.equal(kernel.rigaVuoleUnaShellPosix(riga), true, `doveva chiedere una shell POSIX: ${JSON.stringify(riga)}`)
        }
    })

    it('⛔⛔ e AL CONTRARIO: un programma NUDO con le sue opzioni non trascina nessuno in Linux', () => {
        const nudi = [
            'tasklist /FI "IMAGENAME eq explorer.exe"',   // le virgolette doppie sono di casa anche su cmd
            'findstr /C:"testo" file.txt',
            'ipconfig /all',
            'ver',
            'npm test',
            'node --version',
            'git status --short',
            'C:\\tools\\mio.exe --opzione valore',
            '',
        ]
        for (const riga of nudi) {
            assert.equal(kernel.rigaVuoleUnaShellPosix(riga), false, `NON doveva essere letta come shell POSIX: ${JSON.stringify(riga)}`)
        }
    })

    it('⛔⛔⛔ LA BOCCIATURA DEL 17/09 — la TILDE in testa è sintassi solo POSIX', () => {
        /*
         * Il controllore avversariale ha bocciato la prima consegna su questo, e aveva ragione:
         * citare il token nella sonda (`command -v "~/x.sh"`) SPEGNE l'espansione della tilde,
         * perché in bash il `~` non si espande dentro le virgolette doppie. Rimisurato da me il
         * 17/09/2026 con lo script davvero presente in `~` nella distro:
         *     `command -v ~/talos-p0bis-prova.sh`   → `/root/talos-p0bis-prova.sh`, exit 0
         *     `command -v "~/talos-p0bis-prova.sh"` → niente, exit 1
         * ⇒ la sonda diceva «non c'è in WSL» e il comando finiva su cmd.exe: «"~" non è
         *   riconosciuto come comando interno o esterno». Una regressione VERA, introdotta da un
         *   irrobustimento che nessuno aveva chiesto.
         * ⇒ La cura non è togliere gli apici (servono: un token come `` `id` `` verrebbe eseguito
         *   dalla sonda): è che una riga che COMINCIA con `~` non è una domanda per la sonda. La
         *   home con la tilde non esiste su cmd.exe: è sintassi POSIX, e basta quella a decidere.
         */
        assert.equal(kernel.rigaVuoleUnaShellPosix('~/script.sh'), true)
        assert.equal(kernel.rigaVuoleUnaShellPosix('~/bin/prova --tutto'), true)
        assert.equal(kernel.rigaVuoleUnaShellPosix('~utente/bin/prova'), true, 'anche la forma `~utente/` è espansione della tilde')
    })

    it('⛔⛔ e AL CONTRARIO: una tilde che NON è in testa al primo token non trascina niente in Linux', () => {
        assert.equal(kernel.rigaVuoleUnaShellPosix('C:\\~tmp\\x.exe'), false, 'una cartella Windows che comincia per tilde non è una home POSIX')
        assert.equal(kernel.rigaVuoleUnaShellPosix('dir~1'), false, 'il nome corto 8.3 di Windows ha la tilde in mezzo')
        assert.equal(kernel.rigaVuoleUnaShellPosix('mio.exe ~/x'), false, 'la regola guarda il PRIMO token: qui il programma è `mio.exe`, e per lui la tilde è solo testo')
    })

    it('⛔ un metacarattere DENTRO le virgolette doppie non conta: è un argomento, non sintassi', () => {
        assert.equal(kernel.rigaVuoleUnaShellPosix('findstr /C:"a & b" file.txt'), false)
        assert.equal(kernel.rigaVuoleUnaShellPosix('tasklist /FI "SESSIONNAME eq console$"'), false)
        assert.equal(kernel.rigaVuoleUnaShellPosix('mio.exe "C:\\Program Files (x86)\\cosa"'), false)
    })

    it('⛔⛔⛔ INTEGRAZIONE — con `dove: null` una riga POSIX gira in WSL e l\'esito lo dichiara', async (t) => {
        if (!WSL_C_E) { t.skip(MOTIVO_SALTO); return }
        for (const riga of ["X=42 sh -c 'echo X=$X'", '(cd . && pwd)', 'export Y=7 ; echo Y=$Y']) {
            const esito = await kernel.eseguiComandoSandboxato(riga, cartella, { dove: null })
            assert.equal(esito.enforcement, 'wsl2',
                `${JSON.stringify(riga)} è finita fuori da WSL — misurato il 17/09 sul codice di ieri: enforcement 'none' e «"X" non è riconosciuto come comando interno o esterno». Esito: ${esito.testo}`)
        }
    })

    it('⛔⛔ INTEGRAZIONE AL CONTRARIO — un programma solo-Windows ripiega su Windows, dicendolo', async (t) => {
        if (!WSL_C_E) { t.skip(MOTIVO_SALTO); return }
        /* `ver` e `tasklist` NON esistono in Ubuntu (misurato con `command -v` il 17/09: ASSENTE
           entrambi). ⛔ `dir` invece SÌ (/usr/bin/dir, coreutils): non è un buon controcaso,
           anche se il primo istinto lo sceglie. */
        const esito = await kernel.eseguiComandoSandboxato('tasklist /FI "IMAGENAME eq explorer.exe"', cartella, { dove: null })
        assert.equal(esito.enforcement, 'none', `un programma assente in Linux deve restare su Windows: ${esito.testo}`)
    })

    it('⛔⛔⛔ INTEGRAZIONE — uno script VERO in `~` si esegue, non finisce su cmd.exe', async (t) => {
        if (!WSL_C_E) { t.skip(MOTIVO_SALTO); return }
        /* Lo script si crea e si RIMUOVE: un test che lascia residui nella home di qualcun altro
           non è un test, è un rifiuto. Il nome porta il pid, così due corse non si pestano. */
        const nome = `talos-p0bis-${process.pid}.sh`
        const inDistro = (script) => spawnSync('wsl.exe', ['--exec', 'bash', '-lc', script], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
        inDistro(`printf '#!/bin/sh\\necho SCRIPT-ESEGUITO\\n' > ~/${nome} && chmod +x ~/${nome}`)
        try {
            const esito = await kernel.eseguiComandoSandboxato(`~/${nome}`, cartella, { dove: null })
            assert.equal(esito.enforcement, 'wsl2',
                `misurato il 17/09 sulla consegna bocciata: finiva su cmd.exe con «"~" non è riconosciuto come comando interno o esterno». Esito: ${esito.testo}`)
            assert.match(esito.testo, /SCRIPT-ESEGUITO/)
        }
        finally { inDistro(`rm -f ~/${nome}`) }
    })

    it('⛔ IL PREZZO DICHIARATO dell\'euristica — un apostrofo in un percorso Windows NON citato va in WSL', () => {
        /*
         * ⛔ Questo test non descrive un desiderio: descrive ciò che l'euristica FA, e serve
         *   perché il giorno in cui cambia qualcuno se ne accorga invece di scoprirlo dal vivo.
         *   `mio.exe C:\\Users\\D'Angelo\\x.txt` (senza virgolette) contiene un apice singolo, che
         *   l'euristica legge come quoting POSIX: la riga va in WSL e lì fallisce. Citato fra
         *   virgolette doppie — la forma che un percorso con caratteri strani vuole comunque su
         *   Windows — l'apice sparisce col resto e la riga resta su Windows (riga sotto).
         * ⛔ Non curato IN QUESTO GIRO per decisione del coordinatore: la strada c'è (un numero
         *   DISPARI di apici non può essere quoting, perché in bash sarebbe una citazione non
         *   chiusa) ma è una modifica in più su una corsia già bocciata per una modifica in più.
         */
        assert.equal(kernel.rigaVuoleUnaShellPosix("mio.exe C:\\Users\\D'Angelo\\x.txt"), true)
        assert.equal(kernel.rigaVuoleUnaShellPosix('mio.exe "C:\\Users\\D\'Angelo\\x.txt"'), false)
    })
})

/* ──────────────────────────────────────────────────────────────────────────────
 * I PUNTI DI CHIAMATA — la prova che gira anche dove WSL non c'è.
 * ────────────────────────────────────────────────────────────────────────────── */

describe('Nessun chiamante compone `--` a mano: la prova che non ha bisogno di WSL', () => {
    /*
     * ⛔⛔⛔ Trovata dal controllore avversariale il 17/09: rimettendo `'--'` in UN SOLO punto di
     *   chiamata (la spawn vera) i quattro test unitari su `argomentiWslPerScript` restavano
     *   VERDI — perché provano la funzione, non chi la usa — e mordeva solo la prova
     *   d'integrazione, che in CI si SALTA perché lì WSL non c'è. Cioè: in CI il difetto
     *   sarebbe tornato in silenzio, con la suite verde.
     * ⇒ Questo test legge il SORGENTE. È una misura sul testo e non sul comportamento, e lo
     *   dichiara: non sa se l'argv è giusto, sa che nessuno lo compone a mano vicino a
     *   `'wsl.exe'`. È esattamente la domanda che i test unitari non possono porre e
     *   l'integrazione non può porre in CI.
     */
    const sorgente = readFileSync(new URL('../src/kernel/talosHarness.mjs', import.meta.url), 'utf8')
    const FINESTRA = 300 // caratteri dopo `'wsl.exe'`: abbondano a coprire l'argv più lungo del file

    function puntiDiChiamata() {
        const punti = []
        for (let i = sorgente.indexOf("'wsl.exe'"); i !== -1; i = sorgente.indexOf("'wsl.exe'", i + 1)) {
            punti.push({ riga: sorgente.slice(0, i).split('\n').length, dopo: sorgente.slice(i, i + FINESTRA) })
        }
        return punti
    }

    it('⭐ i punti di chiamata a `wsl.exe` si trovano — e sono più di uno (se fossero zero questo test non misurerebbe niente)', () => {
        const punti = puntiDiChiamata()
        assert.ok(punti.length >= 3, `attesi almeno 3 (elenco distro, sonda, esecuzione), trovati ${punti.length}`)
    })

    it('⛔⛔⛔ nessuna chiamata a `wsl.exe` ha `\'--\'` fra i suoi argomenti', () => {
        for (const { riga, dopo } of puntiDiChiamata()) {
            assert.ok(!dopo.includes("'--'"),
                `talosHarness.mjs:${riga} compone il separatore a mano: con '--' la riga la espande prima la shell predefinita della distro (BC-54). Frammento: ${JSON.stringify(dopo.slice(0, 160))}`)
        }
    })

    it('⭐⭐ e i due che consegnano uno SCRIPT passano dalla funzione, non da un argv scritto lì', () => {
        const dallaFunzione = puntiDiChiamata().filter(({ dopo }) => /^'wsl\.exe',\s*argomentiWslPerScript\(/.test(dopo))
        assert.equal(dallaFunzione.length, 2,
            'la sonda `command -v` e l\'esecuzione vera: sono i due che consegnano uno script a bash, e devono usare la stessa porta')
    })
})

/* ──────────────────────────────────────────────────────────────────────────────
 * BC-56 — il comando vuoto.
 * ────────────────────────────────────────────────────────────────────────────── */

describe('BC-56 — un comando vuoto riceve una frase, non un TypeError e non un falso successo', () => {
    for (const dove of ['windows', 'wsl2', null]) {
        it(`⛔⛔ comando vuoto con dove=${JSON.stringify(dove)}`, async () => {
            for (const comando of ['', '   ', '\t\n ']) {
                const esito = await kernel.eseguiComandoSandboxato(comando, cartella, { dove })
                assert.equal(esito.codice, -1, `misurato il 17/09 sul codice di ieri: dove='windows' LANCIA TypeError [ERR_INVALID_ARG_VALUE], dove='wsl2' dà «syntax error near unexpected token ';'», e ${JSON.stringify('   ')} su Windows esce 0 con testo vuoto — un successo che non ha eseguito niente`)
                assert.equal(esito.testo, 'Il comando è vuoto: scrivi cosa eseguire.')
                assert.equal(esito.enforcement, 'none')
            }
        })
    }

    it('⛔ e AL CONTRARIO: un comando vero NON viene fermato dalla guardia', async () => {
        const esito = await kernel.eseguiComandoSandboxato('echo non-vuoto', cartella, { dove: 'windows' })
        assert.notEqual(esito.testo, 'Il comando è vuoto: scrivi cosa eseguire.')
        assert.match(esito.testo, /non-vuoto/)
    })
})

/* ──────────────────────────────────────────────────────────────────────────────
 * Lo STOP sul ramo WSL, con `--exec`: cambiare il separatore cambia CHI è il figlio.
 * ────────────────────────────────────────────────────────────────────────────── */

describe('Il fermo su richiesta regge anche con `--exec`', () => {
    it('⛔⛔ INTEGRAZIONE — un comando lungo fermato esce con la marca, e non lascia processi nella distro', async (t) => {
        if (!WSL_C_E) { t.skip(MOTIVO_SALTO); return }
        /*
         * ⛔ Perché questo test esiste: `--exec` cambia l'albero dei processi (niente shell
         *   predefinita in mezzo), e `uccidiAlberoDelProcesso` uccide `wsl.exe` su Windows —
         *   il commento del kernel dichiara che il processo DENTRO la distro può sopravvivergli.
         *   Con `--` non era provato; con `--exec` neanche. Ora sì.
         * ⛔ Niente timer: si ferma quando il primo pezzo ARRIVA. Un `setTimeout` qui sarebbe
         *   una gara persa su una macchina lenta, e la lezione sulle suite non ermetiche è
         *   costata già abbastanza.
         */
        const durata = 2999 // un numero che non compare in nessun altro `sleep`: serve a contare SOLO i nostri
        const fermatore = new AbortController()
        const esito = await kernel.eseguiComandoSandboxato(
            `echo VIA-P0BIS ; sleep ${durata} ; echo MAI-ARRIVATO`, cartella,
            { dove: 'wsl2', segnaleStop: fermatore.signal, onPezzo: (p) => { if (p.testo.includes('VIA-P0BIS')) fermatore.abort() } },
        )
        assert.equal(esito.enforcement, 'wsl2')
        assert.equal(esito.codice, 130, '130 = 128 + SIGINT: «l\'ha fermato qualcuno», che non è né «finito» né «tempo scaduto»')
        assert.equal(esito.fermatoSuRichiesta, true)
        assert.match(esito.testo, /Fermato su richiesta/)
        assert.doesNotMatch(esito.testo, /MAI-ARRIVATO/, 'se questa riga esce, il comando è arrivato in fondo: non è stato fermato')

        const conta = spawnSync('wsl.exe', ['--exec', 'bash', '-lc',
            `ps -eo args | grep -F 'sleep ${durata}' | grep -vc grep`], { encoding: 'utf8', timeout: 30_000, windowsHide: true })
        /* ⛔ «zero» è il numero più pericoloso: confermato al contrario il 17/09 — lo stesso
           conteggio, con un `sleep` vivo messo apposta, risponde `1`. Qui deve rispondere `0`. */
        assert.equal(String(conta.stdout).trim(), '0', 'il comando è sopravvissuto dentro la distro alla morte di wsl.exe')
    })
})
