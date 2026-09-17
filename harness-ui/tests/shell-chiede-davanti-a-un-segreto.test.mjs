/*
 * ⛔⛔⛔⛔ F15 — LA SHELL CHIEDE DAVANTI A UN SEGRETO, ANCHE CON «SEMPRE» (17/09/2026).
 *
 * Owner, P0-bis corsia D, decisione «entrambi stretto»:
 *   (1) una CLASSE DICHIARATA di percorsi segreti (.env, ~/.ssh, ~/.aws, *.pem, id_rsa…) è un
 *       INNESCO: se il testo di un comando `shell` o il percorso di un `leggi` la nomina, si
 *       chiede alla persona ANCHE quando l'attrezzo è impostato a «sempre»;
 *   (2) un CONFINE stretto: uscire dal workspace verso un percorso NASCOSTO (un segmento che
 *       comincia con `.`) chiede lo stesso, e nient'altro — nessuna euristica sul contenuto del
 *       comando oltre a queste due, perché ogni «chiedi» in più addestra a cliccare sì;
 *   (3) mai «nega» d'ufficio: l'esito è «chiedi», e il rifiuto lo decide la persona ogni volta.
 *
 * ⛔ LA DIFFERENZA CHE QUESTO FILE PROTEGGE, misurata PRIMA di scrivere la cura (RED): con
 *   `permessiPerAttrezzo: { shell: 'sempre' }`, `cat ~/.ssh/id_rsa` girava senza che nessuno
 *   fosse interpellato — `chiediApprovazioneFn` NON veniva chiamato nemmeno una volta.
 *
 * ⛔ Perché una LISTA qui è legittima mentre `custom-task.mjs` (28/8) ne rifiuta una: là la lista
 *   sarebbe stata il CONFINE («questi percorsi non si toccano»), e una denylist come confine è la
 *   strategia che la ricerca 2026 dà per fallita (Docker, «AI Coding Agent Horror Stories»,
 *   18/05/2026; Pillar, «The Week of Sandbox Escapes», 20/07/2026: gli escape documentati stanno
 *   proprio nella categoria denylist). Qui la lista è l'INNESCO DI UNA DOMANDA: chi la aggira
 *   ottiene il comportamento di oggi, non un permesso in più. Un innesco incompleto perde una
 *   domanda; un confine incompleto perde una chiave.
 */
import { strict as assert } from 'node:assert'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'

describe('F15 — la shell chiede davanti a un segreto, anche con «sempre»', () => {
    function cartellaVuota(t) {
        const radice = mkdtempSync(join(tmpdir(), 'talos-f15-segreti-'))
        t.after(() => rmSync(radice, { recursive: true, force: true }))
        return radice
    }

    function reteDiRisposte(...risposte) {
        const chiamate = []
        return {
            chiamate,
            fetch: async (url, opzioni) => {
                const indice = chiamate.length
                chiamate.push({ url, opzioni, corpo: JSON.parse(opzioni.body) })
                const scelta = risposte[Math.min(indice, risposte.length - 1)]
                return {
                    ok: true, status: 200,
                    json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
                    text: async () => '',
                }
            },
        }
    }

    const TASK = { consegna: 'un compito qualunque, per la prova' }
    const CONCLUSO_SUBITO = { role: 'assistant', content: 'fatto', tool_calls: [] }
    const chiamaShell = (comando) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'shell', arguments: JSON.stringify({ comando }) } }] })
    const chiamaLeggi = (percorso) => ({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'leggi', arguments: JSON.stringify({ percorso }) } }] })

    /** Un giro solo con `shell: 'sempre'`: quante volte è stata interpellata la persona, e con quale motivo. */
    async function giroShell(t, comando, extra = {}) {
        const cartella = cartellaVuota(t)
        writeFileSync(join(cartella, '.env'), 'CHIAVE=segreta\n')
        const rete = reteDiRisposte(chiamaShell(comando), CONCLUSO_SUBITO)
        const domande = []
        const ricevute = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { shell: 'sempre' },
            chiediApprovazioneFn: async (azione) => { domande.push(azione); return true },
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
            ...extra,
        })
        const messaggioTool = rete.chiamate[1]?.corpo.messages.find((m) => m.role === 'tool')
        return { cartella, esito, domande, ricevute, testoTool: messaggioTool?.content ?? '' }
    }

    async function giroLeggi(t, percorso, extra = {}) {
        const cartella = cartellaVuota(t)
        writeFileSync(join(cartella, 'app.js'), 'export const a = 1\n')
        const rete = reteDiRisposte(chiamaLeggi(percorso), CONCLUSO_SUBITO)
        const domande = []
        const esito = await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            chiediApprovazioneFn: async (azione) => { domande.push(azione); return true },
            ...extra,
        })
        const messaggioTool = rete.chiamate[1]?.corpo.messages.find((m) => m.role === 'tool')
        return { cartella, esito, domande, testoTool: messaggioTool?.content ?? '' }
    }

    // ─────────────────────────────── 1. LA CLASSE DICHIARATA, COME INNESCO ───────────────────────────────

    it('⛔⛔⛔⛔ IL CASO CHE HA FATTO NASCERE LA RIGA — shell:\'sempre\' + `cat ~/.ssh/id_rsa`: la persona VIENE interpellata', async (t) => {
        const { domande } = await giroShell(t, 'cat ~/.ssh/id_rsa')
        assert.equal(domande.length, 1, 'il «sempre» non vale davanti a una chiave privata: si chiede')
        assert.equal(domande[0].tipo, 'shell')
    })

    it('⛔⛔⛔ `cat .env` chiede, anche dentro il workspace e anche con «sempre»', async (t) => {
        const { domande, ricevute } = await giroShell(t, 'cat .env')
        assert.equal(domande.length, 1)
        assert.equal(ricevute.at(-1).via, 'segreto-forza-conferma', 'la ricevuta dice QUALE meccanismo ha deciso')
    })

    it('⭐⭐⭐ LA COPIA PER LA PERSONA è in lingua naturale, nomina il file e NON contiene nomi tecnici', async (t) => {
        const { domande } = await giroShell(t, 'cat ~/.ssh/id_rsa')
        const frase = domande[0].segreto?.frase ?? ''
        assert.ok(frase.length > 0, 'la domanda deve portare con sé il proprio motivo')
        assert.ok(frase.includes('~/.ssh/id_rsa'), `la persona deve vedere QUALE file: «${frase}»`)
        assert.ok(/chiav|password/i.test(frase), `la frase deve dire perché: «${frase}»`)
        for (const tecnico of ['shell', 'permessiPerAttrezzo', 'segreto-forza-conferma', 'PERCORSI_SEGRETI', 'verificaPermessoScrittura', 'workspace']) {
            assert.ok(!frase.includes(tecnico), `nessun nome tecnico nella copia: trovato «${tecnico}» in «${frase}»`)
        }
    })

    it('⭐⭐⭐ LE TRE SCRITTURE DELLA HOME — `~`, `$HOME` e `%USERPROFILE%` innescano tutte la stessa domanda', async (t) => {
        for (const scrittura of ['~/.aws/credentials', '$HOME/.aws/credentials', '%USERPROFILE%/.aws/credentials']) {
            const { domande } = await giroShell(t, `cat ${scrittura}`)
            assert.equal(domande.length, 1, `«${scrittura}» deve chiedere come le altre due`)
        }
    })

    it('⭐⭐ Anche i separatori di Windows e le virgolette — `cat "~\\.ssh\\config"` chiede', async (t) => {
        const { domande } = await giroShell(t, 'cat "~\\.ssh\\config"')
        assert.equal(domande.length, 1)
    })

    it('⭐⭐ Un glob basta a nominare la classe — `cat *.pem` chiede', async (t) => {
        const { domande } = await giroShell(t, 'cat *.pem')
        assert.equal(domande.length, 1)
    })

    it('⭐⭐ Il file delle chiavi di TALOS (`.provider-runtime.json`) è nella classe', async (t) => {
        const { domande } = await giroShell(t, 'cat ../.provider-runtime.json')
        assert.equal(domande.length, 1)
    })

    it('⭐⭐ Il portachiavi del sistema è nella classe — `cmdkey /list` chiede', async (t) => {
        const { domande } = await giroShell(t, 'cmdkey /list')
        assert.equal(domande.length, 1)
        assert.ok(/portachiavi/i.test(domande[0].segreto?.frase ?? ''), 'la frase nomina il portachiavi, non un percorso')
    })

    // ─────────────────────────────── 2. IL CONFINE STRETTO ───────────────────────────────

    it('⛔⛔⛔ CONFINE — `cat ../.ssh/config` chiede: esce dal workspace verso un percorso nascosto', async (t) => {
        const { domande } = await giroShell(t, 'cat ../.ssh/config')
        assert.equal(domande.length, 1)
    })

    it('⛔⛔ CONFINE — una cartella nascosta QUALUNQUE fuori dal workspace chiede lo stesso (`cat ../.config/appunti.txt`)', async (t) => {
        const { domande } = await giroShell(t, 'cat ../.config/appunti.txt')
        assert.equal(domande.length, 1)
        assert.equal(domande[0].segreto?.classe, 'fuori-workspace-nascosto')
    })

    it('⭐⭐⭐ E il confine è STRETTO nei due versi — una cartella nascosta DENTRO il workspace non chiede, un file NON nascosto fuori nemmeno', async (t) => {
        for (const comando of ['cat .cache/appunti.txt', 'ls ./.git', 'cat ../fratello/note.txt']) {
            const { domande } = await giroShell(t, comando)
            assert.equal(domande.length, 0, `«${comando}» non deve chiedere: ogni «chiedi» in più addestra a cliccare sì`)
        }
    })

    // ─────────────────────────────── 3. I FALSI POSITIVI CERCATI ───────────────────────────────

    it('⛔⛔⛔⛔ I DIECI COMANDI COMUNI — nessuno di questi deve chiedere, nemmeno una volta', async (t) => {
        const comuni = [
            'echo $HOME',
            'ls -la',
            'git status --short',
            'npm run test:kernel',
            'node --version',
            'grep -rn "chiave" ./src',
            'cat package.json',
            'mkdir -p build/out',
            'curl https://example.com/.well-known/openid-configuration',
            'git log --oneline -3',
            'echo fatto > build/marker.txt',
            'node scripts/costruisci.mjs --sorgente=src/app.js',
        ]
        const chiesti = []
        for (const comando of comuni) {
            const { domande } = await giroShell(t, comando)
            if (domande.length > 0) chiesti.push(comando)
        }
        assert.deepEqual(chiesti, [], `questi comandi NON devono chiedere: ${chiesti.join(' · ')}`)
    })

    it('⭐⭐ Un esempio non è un segreto — `cat .env.example` e `cat id_rsa.pub` non chiedono', async (t) => {
        for (const comando of ['cat .env.example', 'cat id_rsa.pub', 'cat .env.sample']) {
            const { domande } = await giroShell(t, comando)
            assert.equal(domande.length, 0, `«${comando}» è pubblico per convenzione: non deve chiedere`)
        }
    })

    // ─────────────────────────────── 4. `leggi` — sola lettura, stessa domanda ───────────────────────────────

    it('⛔⛔⛔ `leggi ~/.aws/credentials` chiede — una lettura porta fuori un segreto esattamente come un comando', async (t) => {
        const { domande } = await giroLeggi(t, '~/.aws/credentials')
        assert.equal(domande.length, 1)
        assert.equal(domande[0].tipo, 'leggi')
    })

    it('⛔⛔⛔⛔ PARITÀ — `leggi app.js` dentro il workspace NON chiede MAI, e il file arriva al modello', async (t) => {
        const { domande, testoTool } = await giroLeggi(t, 'app.js')
        assert.equal(domande.length, 0, 'una lettura normale non passa da nessun cancello: è il comportamento di oggi')
        assert.ok(testoTool.includes('export const a = 1'), 'il contenuto arriva come sempre')
    })

    it('⛔⛔ AL CONTRARIO su `leggi` — se la persona dice NO, il file NON viene letto', async (t) => {
        const { domande, testoTool } = await giroLeggi(t, '~/.aws/credentials', { chiediApprovazioneFn: async () => false })
        assert.equal(domande.length, 0, 'il canale usato è quello passato per ultimo (che rifiuta)')
        assert.ok(/REFUSED/.test(testoTool), `al modello deve arrivare un rifiuto parlante: «${testoTool}»`)
    })

    // ─────────────────────────────── 5. I CONFINI CON LE REGOLE GIÀ ESISTENTI ───────────────────────────────

    it('⛔⛔⛔ «nega» RESTA «nega» — un segreto non trasforma un divieto in una domanda', async (t) => {
        const cartella = cartellaVuota(t)
        writeFileSync(join(cartella, '.env'), 'CHIAVE=segreta\n')
        const rete = reteDiRisposte(chiamaShell('echo segno>marker.txt && cat .env'), CONCLUSO_SUBITO)
        const domande = []
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { shell: 'nega' },
            chiediApprovazioneFn: async (azione) => { domande.push(azione); return true },
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(domande.length, 0, 'con «nega» non si chiede niente a nessuno')
        assert.equal(ricevute.at(-1).via, 'permesso-per-attrezzo-nega')
        assert.equal(existsSync(join(cartella, 'marker.txt')), false, 'e il comando non è girato')
    })

    it('⛔⛔⛔ AL CONTRARIO — se la persona dice NO, il comando NON gira (il marker non c\'è)', async (t) => {
        const cartella = cartellaVuota(t)
        writeFileSync(join(cartella, '.env'), 'CHIAVE=segreta\n')
        const rete = reteDiRisposte(chiamaShell('echo segno>marker.txt && cat .env'), CONCLUSO_SUBITO)
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { shell: 'sempre' },
            chiediApprovazioneFn: async () => false,
        })
        assert.equal(existsSync(join(cartella, 'marker.txt')), false, 'questa è la protezione vera: il «no» ferma il comando')
    })

    it('⭐⭐⭐ E se dice SÌ il comando gira davvero — la domanda non è un blocco travestito', async (t) => {
        const cartella = cartellaVuota(t)
        writeFileSync(join(cartella, '.env'), 'CHIAVE=segreta\n')
        const rete = reteDiRisposte(chiamaShell('echo segno>marker.txt && cat .env'), CONCLUSO_SUBITO)
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { shell: 'sempre' },
            chiediApprovazioneFn: async () => true,
        })
        assert.equal(existsSync(join(cartella, 'marker.txt')), true, 'approvato = eseguito, come sempre')
    })

    it('⛔⛔⛔ LO STOP MENTRE LA DOMANDA È SULLO SCHERMO resta gestito anche qui', async (t) => {
        const cartella = cartellaVuota(t)
        writeFileSync(join(cartella, '.env'), 'CHIAVE=segreta\n')
        const rete = reteDiRisposte(chiamaShell('cat .env'), CONCLUSO_SUBITO)
        const fermata = new AbortController()
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { shell: 'sempre' },
            segnaleStop: fermata.signal,
            // la persona non risponde: preme «Ferma». La promessa non si risolve MAI.
            chiediApprovazioneFn: () => new Promise(() => { fermata.abort() }),
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(ricevute.at(-1).via, 'fermato-su-richiesta', 'lo stop vince sulla domanda, e la RAGIONE lo dice')
    })

    it('⛔⛔⛔⛔ TALOS-BANCO — nessun canale di approvazione: un segreto degrada a rifiuto, mai a un sì implicito', async (t) => {
        const cartella = cartellaVuota(t)
        writeFileSync(join(cartella, '.env'), 'CHIAVE=segreta\n')
        const rete = reteDiRisposte(chiamaShell('echo segno>marker.txt && cat .env'), CONCLUSO_SUBITO)
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            // deliberatamente: nessun permessiPerAttrezzo, nessun chiediApprovazioneFn — lo scenario del banco.
        })
        assert.equal(existsSync(join(cartella, 'marker.txt')), false, 'non esiste un «sì» implicito quando non c\'è nessuno a cui chiedere')
    })

    /*
     * ⛔⛔⛔⛔ B1 — LA CURA CHE NEGAVA INVECE DI CHIEDERE (bocciatura del controllore, 17/09/2026).
     *
     * I test qui sopra passano `chiediApprovazioneFn` a mano, e con quello F15 chiede. Ma nella
     * configurazione PREDEFINITA di una sessione vera quel canale NON ESISTEVA:
     * `session-registry.mjs` lo costruiva solo per «Su richiesta» o se qualche attrezzo era su
     * «chiedi» — e il default è «Workspace write» con `permessiPerAttrezzo: null`. Risultato
     * misurato: `cat .env`, che sul codice base girava, diventava `REFUSED … nessun canale di
     * approvazione attivo`. Cioè esattamente il «nega di serie» che la decisione dell'owner
     * (punto 3) esclude, e la frase in lingua naturale non arrivava a nessuno.
     *
     * ⇒ Questi test corrono sul PERCORSO VERO del registro: è il registro a decidere quale
     *   canale costruire, e il kernel vero a girarci sopra. Solo la rete del modello è finta.
     */
    describe('B1 — il canale c\'è anche nella sessione PREDEFINITA', () => {
        /** Il registro vero, con una sessione che inoltra al kernel vero ciò che il registro ha deciso. */
        function registroCheArrivaAlKernel(t, { comando, permessiScelto, permessiPerAttrezzo } = {}) {
            const cartella = cartellaVuota(t)
            writeFileSync(join(cartella, '.env'), 'CHIAVE=segreta\n')
            writeFileSync(join(cartella, 'app.js'), 'export const a = 1\n')
            const rete = reteDiRisposte(comando.tipo === 'leggi' ? chiamaLeggi(comando.percorso) : comando.tipo === 'scrivi' ? CHIAMA_SCRIVI : chiamaShell(comando.testo), CONCLUSO_SUBITO)
            const eventi = []
            let finita
            const attesa = new Promise((risolvi) => { finita = risolvi })
            const registro = createSessionRegistry({
                guardaWorkspaceFn: () => () => {},
                cartelleProgetto: [{ id: '0', percorso: cartella, nome: 'prova' }],
                preparaEsecuzioneLiberaFn: () => ({ cartella, comandoProva: 'npm test', task: TASK }),
                modello: 'x', chiave: 'y',
                avviaSessioneFn: async (input) => {
                    input.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' })
                    // ⛔ I quattro campi che il REGISTRO ha deciso — non inventati dal test: è il punto della prova.
                    const esito = await talosLavora({
                        cartella: input.cartella, task: input.task, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
                        livelloAccesso: input.livelloAccesso,
                        chiediApprovazioneFn: input.chiediApprovazioneFn,
                        permessiPerAttrezzo: input.permessiPerAttrezzo,
                    })
                    finita(esito)
                    return esito
                },
            })
            const { sessionId } = registro.avviaLibero({ cartellaId: '0', consegna: 'fai qualcosa', ...(permessiScelto ? { permessiScelto } : {}), ...(permessiPerAttrezzo ? { permessiPerAttrezzoScelto: permessiPerAttrezzo } : {}) })
            registro.iscriviti(sessionId, (e) => eventi.push(e))
            return { cartella, registro, sessionId, eventi, attesa, rete }
        }

        const CHIAMA_SCRIVI = { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', function: { name: 'scrivi', arguments: '{"percorso":"nuovo.txt","contenuto":"ciao"}' } }] }

        /** Aspetta che la domanda compaia sul buffer della sessione (o che il giro finisca senza chiederla). */
        async function aspettaLaDomanda(scena) {
            for (let giro = 0; giro < 50; giro += 1) {
                const richiesta = scena.eventi.find((e) => e.type === 'ApprovalRequested')
                if (richiesta) return richiesta
                await new Promise((risolvi) => setImmediate(risolvi))
            }
            return null
        }

        it('⛔⛔⛔⛔ SESSIONE PREDEFINITA + `cat .env`: arriva UNA domanda, con la frase per la persona', async (t) => {
            const scena = registroCheArrivaAlKernel(t, { comando: { testo: 'cat .env' } })
            const richiesta = await aspettaLaDomanda(scena)
            assert.ok(richiesta, 'nel default («Workspace write», nessun override) la persona DEVE essere interpellata, non rifiutata')
            assert.equal(richiesta.azione.tipo, 'shell')
            assert.ok(richiesta.azione.segreto?.frase.includes('.env'), `la frase deve arrivare fino a chi risponde: ${JSON.stringify(richiesta.azione.segreto)}`)
            assert.equal(scena.eventi.filter((e) => e.type === 'ApprovalRequested').length, 1, 'una sola domanda, non una a giro')
            scena.registro.rispondiApprovazione(scena.sessionId, richiesta.requestId, true)
            await scena.attesa
        })

        it('⛔⛔⛔ e il SÌ esegue davvero — la domanda non è un rifiuto travestito', async (t) => {
            const scena = registroCheArrivaAlKernel(t, { comando: { testo: 'echo segno>marker.txt && cat .env' } })
            const richiesta = await aspettaLaDomanda(scena)
            assert.ok(richiesta)
            scena.registro.rispondiApprovazione(scena.sessionId, richiesta.requestId, true)
            await scena.attesa
            assert.equal(existsSync(join(scena.cartella, 'marker.txt')), true)
        })

        it('⛔⛔⛔ e il NO non esegue', async (t) => {
            const scena = registroCheArrivaAlKernel(t, { comando: { testo: 'echo segno>marker.txt && cat .env' } })
            const richiesta = await aspettaLaDomanda(scena)
            assert.ok(richiesta)
            scena.registro.rispondiApprovazione(scena.sessionId, richiesta.requestId, false)
            await scena.attesa
            assert.equal(existsSync(join(scena.cartella, 'marker.txt')), false)
        })

        it('⛔⛔⛔⛔ PARITÀ MISURATA — nel default, `npm test`, `ls -la`, `scrivi` e `leggi` su file normali fanno ZERO domande', async (t) => {
            const casi = [
                { comando: { testo: 'npm test' }, nome: 'npm test' },
                { comando: { testo: 'ls -la' }, nome: 'ls -la' },
                { comando: { tipo: 'scrivi' }, nome: 'scrivi nuovo.txt' },
                { comando: { tipo: 'leggi', percorso: 'app.js' }, nome: 'leggi app.js' },
            ]
            const chiesti = []
            for (const caso of casi) {
                const scena = registroCheArrivaAlKernel(t, caso)
                await scena.attesa
                if (scena.eventi.some((e) => e.type === 'ApprovalRequested')) chiesti.push(caso.nome)
            }
            assert.deepEqual(chiesti, [], `il canale sempre presente NON deve far chiedere ciò che ieri passava: ${chiesti.join(' · ')}`)
        })

        it('⭐⭐⭐ e vale anche con «Accesso pieno» e con `shell: \'sempre\'` — i due posti dove F15 serve di più', async (t) => {
            for (const extra of [{ permessiScelto: 'Full access' }, { permessiPerAttrezzo: { shell: 'sempre' } }]) {
                const scena = registroCheArrivaAlKernel(t, { comando: { testo: 'cat .env' }, ...extra })
                const richiesta = await aspettaLaDomanda(scena)
                assert.ok(richiesta, `con ${JSON.stringify(extra)} la persona deve essere interpellata`)
                scena.registro.rispondiApprovazione(scena.sessionId, richiesta.requestId, true)
                await scena.attesa
            }
        })
    })

    it('⭐⭐⭐⭐ PARITÀ — un giro senza segreti si comporta ESATTAMENTE come prima: nessuna domanda, comando eseguito', async (t) => {
        const cartella = cartellaVuota(t)
        const rete = reteDiRisposte(chiamaShell('echo segno>marker.txt'), CONCLUSO_SUBITO)
        const domande = []
        const ricevute = []
        await talosLavora({
            cartella, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: rete.fetch,
            permessiPerAttrezzo: { shell: 'sempre' },
            chiediApprovazioneFn: async (azione) => { domande.push(azione); return true },
            onGiro(e) { if (e.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
        })
        assert.equal(domande.length, 0)
        assert.equal(ricevute.at(-1).via, 'permesso-per-attrezzo-sempre', 'il «sempre» resta «sempre» dove non c\'è niente da proteggere')
        assert.equal(existsSync(join(cartella, 'marker.txt')), true)
    })
})
