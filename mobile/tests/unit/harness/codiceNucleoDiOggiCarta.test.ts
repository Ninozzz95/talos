import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { cartaApprovazioneR4 } from '@/lib/harness/r4/approvazioniR4'
import { testoDelServerR4 } from '@/lib/harness/r4/testiServerR4'
import serverR4 from '@/lib/harness/r4/testi/server-r4.json'
import serverCarte from '@/lib/harness/r4/testi/server-carte-r4.json'

/*
 * ⛔ Telefono 0.1.49 (decisione dell'owner 18/11/2026: «0.1.49 subito, nucleo nuovo»). Il Codice del telefono gira sul nucleo r4 copiato
 * dal commit stesso (`scripts/kernel-r4/copia-r4.mjs`), e la sua carta la disegna `cartaApprovazioneR4`. Queste prove fanno passare la
 * domanda VERA del nucleo (non una scritta a mano) fino alla carta del telefono:
 *   - NUC-01 P018: lo strumento di un connettore finto passa dal cancello, e la carta dice connettore, strumento e argomenti;
 *   - NUC-02 la cancellazione critica (le righe sono DATI: il cancello decide, nessun comando parte mai), anche con Accesso pieno;
 *   - NUC-03 le maschere dei segreti: sulla carta gli argomenti arrivano oscurati.
 * Il nucleo si legge da `TALOS_R4_RADICE_PROVA` (una copia di `copia-r4.mjs` di un altro commit) o dalla radice del deposito. Sul nucleo
 * della 0.1.48 (`2672d00f8`) sono rosse: lo strumento parte senza carta, `rm -rf "$VUOTA"/` passa con Accesso pieno.
 */
const RADICE = process.env.TALOS_R4_RADICE_PROVA || resolve(__dirname, '..', '..', '..', '..')
const NUCLEO = join(RADICE, 'harness-ui', 'src', 'kernel', 'talosHarness.mjs')
/* il nucleo vuole le sue dipendenze (`eventsource-parser`): senza `npm ci` in harness-ui la prova non può girare, e lo dice */
const senzaDipendenze = !existsSync(join(RADICE, 'harness-ui', 'node_modules', 'eventsource-parser'))

type Azione = Record<string, unknown>
/* il nucleo si carica col `require` di Node (che dalla 22.12 legge anche i moduli ES), fuori dalla trasformazione di Vite, che non ne
   legge la sintassi: è lo stesso modulo che il server del telefono carica con Node sul Pad */
const richiedi = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const importaConNode = async (percorso: string): Promise<any> => richiedi(percorso)
const nucleo = () => importaConNode(NUCLEO)

const cartelle: string[] = []
afterEach(() => {
    for (const c of cartelle.splice(0)) rmSync(c, { recursive: true, force: true })
})
function cartella(): string {
    const c = mkdtempSync(join(tmpdir(), 'nucleo-0149-'))
    cartelle.push(c)
    return c
}

const TOOL_MCP = [
    { name: 'mcp__github__create_issue', serverId: 'github', nomeOriginale: 'create_issue', description: 'opens an issue', inputSchema: { type: 'object', properties: { title: { type: 'string' } } } },
]
const FINE = { role: 'assistant', content: 'done', tool_calls: [] }
const chiama = (id: string, nome: string, argomenti: Record<string, unknown>) => ({
    role: 'assistant', content: null, tool_calls: [{ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } }],
})

/** Un giro del nucleo con un modello finto che chiama lo strumento del connettore; ogni carta riceve un No. */
async function giroMcp(argomenti: Record<string, unknown>) {
    const { talosLavora } = await nucleo()
    const risposte = [chiama('c1', 'mcp__github__create_issue', argomenti), FINE]
    let giri = 0
    const chieste: Azione[] = []
    const chiamateMcp: string[] = []
    await talosLavora({
        cartella: cartella(), task: { consegna: 'work' }, modello: 'x', chiave: 'finta-mai-usata-in-rete', toolMcp: TOOL_MCP,
        livelloAccesso: 'scrittura-progetto',
        chiamaToolMcpFn: async (nome: string) => { chiamateMcp.push(nome); return { content: [{ type: 'text', text: 'ok' }], isError: false } },
        chiediApprovazioneFn: async (a: Azione) => { chieste.push(a); return false },
        fetchDiRete: async () => {
            const scelta = risposte[Math.min(giri, risposte.length - 1)]
            giri += 1
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: scelta }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), text: async () => '' }
        },
    })
    return { carte: chieste.filter((a) => a.tipo === 'mcp_tool'), chiamateMcp }
}

const POLITICA = { permessi: 'Workspace write', perAttrezzo: {} }

/*
 * Le forme della domanda come le scrive il nucleo di oggi (`talosHarness.mjs`, `cancelloDelloStrumentoDiFuori` e `FRASI_DI_PERMESSO`):
 * girano anche dove il nucleo non si può caricare (la prova sopra si salta senza `npm ci` in harness-ui).
 */
describe('le carte nuove del nucleo di oggi sul telefono (0.1.49)', () => {
    it('NUC-04 plugin in «Solo lettura», Tool Forge e il comando troppo complesso: badge, bersaglio e frase nella lingua, mai il terzo pulsante', () => {
        const plugin = {
            tipo: 'plugin_tool', toolCallId: 'p1', nome: 'plugin__lint__check', plugin: 'lint', attrezzo: 'check', argomenti: {}, soloUnaVolta: true,
            frase: 'You are in Read only, but the tool «check» of the plugin «lint» runs a program that can change things on this PC and outside it. Allow it only this once?',
            fraseChiave: 'server.approval.pluginToolReadOnly', fraseParams: { plugin: 'lint', attrezzo: 'check' }, sempreNonBasta: true,
        }
        const p = cartaApprovazioneR4(plugin, { permessi: 'Read only', perAttrezzo: {} }, 'it')
        expect([p.badge, p.bersaglio, p.perche, p.codice, p.terzo]).toEqual(['Chiede di usare un plugin', 'check (lint)', 'Vuole usare uno strumento di un plugin:', '', null])
        expect(p.motivo).toBe('Sei in Solo lettura, ma lo strumento «check» del plugin «lint» fa girare un programma che può cambiare cose su questo dispositivo e fuori. Lo consenti solo questa volta?')
        const forge = {
            tipo: 'forge_tool', toolCallId: 'f1', nome: 'forge_daily_note', attrezzo: 'daily_note', argomenti: { giorno: 'oggi' },
            frase: 'It wants to use «daily note», a tool made in Tool Forge. It can change your notes, tasks and memory: it needs your yes.',
            fraseChiave: 'server.approval.forgeTool', fraseParams: { attrezzo: 'daily_note' },
        }
        const f = cartaApprovazioneR4(forge, POLITICA, 'en')
        expect([f.badge, f.bersaglio, f.perche, f.terzo]).toEqual(['Asks to use a Tool Forge tool', 'daily note', 'It wants to use a Tool Forge tool:', null])
        expect(f.motivo).toBe('It wants to use «daily note», a tool made in Tool Forge. It can change your notes, tasks and memory: it needs your yes.')
        expect(f.codice).toBe('{\n  "giorno": "oggi"\n}')
        const complesso = {
            tipo: 'shell', comando: 'x',
            cancellazioneCritica: {
                percorso: 'x', perche: 'troppo-complesso', fraseChiave: 'server.approval.criticalDelete.tooComplex', fraseParams: { percorso: 'x' },
                frase: 'This command is too complex to read before it runs, and it may delete something. With any permission, Full access included, this needs your yes every time.',
            },
        }
        const c = cartaApprovazioneR4(complesso, { permessi: 'Full access', perAttrezzo: {} }, 'it')
        expect(c.motivo).toBe('Questo comando è troppo complesso per essere letto prima che parta, e potrebbe cancellare qualcosa. Con qualsiasi permesso, anche con Accesso pieno, serve il tuo sì ogni volta.')
        expect(c.terzo).toBeNull()
    })

    /* Giudice v2133-v2135: le frasi del nucleo copiate dal PC dicevano «this PC»/«questo PC» anche sul telefono. Ogni frase di carta che il
       telefono può dire (tutte le chiavi `approval.*` delle due tabelle copiate), nelle due lingue, non nomina un PC. */
    it('NUC-05 nessuna carta del telefono dice «this PC» o «questo PC»: dice il dispositivo', () => {
        const chiavi = [...new Set([...Object.keys(serverR4.en), ...Object.keys(serverCarte.en)].filter((k) => k.startsWith('approval.')))]
        expect(chiavi.length).toBeGreaterThan(40)
        const valori = { attrezzo: 'check', plugin: 'lint', server: 'github', percorso: '/x', n: 2 }
        for (const lingua of ['en', 'it'] as const) {
            for (const k of chiavi) expect(testoDelServerR4(`server.${k}`, valori, '', lingua), `${lingua} ${k}`).not.toMatch(/\bPC\b/u)
        }
        expect(testoDelServerR4('server.approval.mcpToolReadOnly', valori, '', 'en')).toContain('outside this device')
        expect(testoDelServerR4('server.approval.pluginTool', valori, '', 'it')).toContain('su questo dispositivo')
        /* le copie restano quelle del PC: la cura sta solo nelle parole proprie del telefono */
        expect((serverCarte.en as Record<string, string>)['approval.pluginTool']).toContain('this PC')
    })

    /* Revisore della 0.1.49 (giudice v2149, mutanti M6 e M7): una cancellazione critica vale UNA volta (decisione 155 del PC,
       `legacy/app.js:18774` e `:18784`), anche quando la stessa carta porta la rete «di sessione» o la root di WSL, che da sole cambiano
       il sì in «per la sessione». Ogni prova controlla prima che senza la cancellazione critica il sì diventi davvero «per la sessione». */
    const critica = {
        percorso: '/home/x', perche: 'casa', fraseChiave: 'server.approval.criticalDelete.home', fraseParams: { percorso: '/home/x' },
        frase: 'This command deletes /home/x, your user folder. With any permission, Full access included, this needs your yes every time.',
    }
    const PIENO = { permessi: 'Full access', perAttrezzo: {} }
    const unaVoltaSola = (carta: ReturnType<typeof cartaApprovazioneR4>, lingua: 'it' | 'en') => {
        expect(carta.unaVolta, `${lingua}: il sì resta «una volta»`).toBe(lingua === 'it' ? 'Consenti una volta' : 'Allow once')
        expect(carta.nota, `${lingua}: la nota dice una sola richiesta`).toBe(lingua === 'it' ? 'Vale solo per questa richiesta' : 'Applies only to this request')
        expect(carta.terzo, `${lingua}: nessun «per la sessione»`).toBeNull()
    }

    it('NUC-06 cancellazione critica con la rete «di sessione»: il sì resta «una volta», niente «per la sessione»', () => {
        const rete = { ambito: 'sessione', ospite: 'nas', frase: 'The session folder is on a network computer (nas).' }
        const senzaCritica = cartaApprovazioneR4({ tipo: 'shell', comando: 'rm -rf ~', percorsoDiRete: rete }, PIENO, 'it')
        expect(senzaCritica.unaVolta, 'premessa: la rete di sessione da sola dà «per questa sessione»').toBe('Consenti per questa sessione')
        for (const lingua of ['it', 'en'] as const) {
            unaVoltaSola(cartaApprovazioneR4({ tipo: 'shell', comando: 'rm -rf ~', percorsoDiRete: rete, cancellazioneCritica: critica }, PIENO, lingua), lingua)
        }
    })

    it('NUC-07 cancellazione critica con la root di WSL: il sì resta «una volta», niente «per la sessione»', () => {
        const root = { linux: 'Ubuntu', utente: 'root', frase: 'This command would run in Ubuntu as root.' }
        const senzaCritica = cartaApprovazioneR4({ tipo: 'shell', comando: 'rm -rf ~', wslRoot: root }, PIENO, 'it')
        expect(senzaCritica.unaVolta, 'premessa: la root di WSL da sola dà «per questa sessione»').toBe('Consenti per questa sessione')
        for (const lingua of ['it', 'en'] as const) {
            unaVoltaSola(cartaApprovazioneR4({ tipo: 'shell', comando: 'rm -rf ~', wslRoot: root, cancellazioneCritica: critica }, PIENO, lingua), lingua)
        }
    })
})

describe.skipIf(senzaDipendenze)('il nucleo di oggi fino alla carta del telefono (0.1.49)', () => {
    it('NUC-01 P018: lo strumento di un connettore chiede la carta, che nomina connettore, strumento e argomenti; dopo il No non parte', async () => {
        const { carte, chiamateMcp } = await giroMcp({ title: 'nota' })
        expect(carte, 'il nucleo chiede la carta per lo strumento del connettore').toHaveLength(1)
        expect(chiamateMcp, 'dopo il No il connettore non è chiamato').toEqual([])
        const it = cartaApprovazioneR4(carte[0], POLITICA, 'it')
        expect(it.badge).toBe('Chiede di usare un connettore')
        expect(it.bersaglio).toBe('create issue (github)')
        expect(it.perche).toBe('Vuole usare uno strumento di un connettore:')
        expect(it.motivo).toContain('Vuole usare lo strumento «create issue» del connettore «github»')
        expect(it.codice).toContain('"title": "nota"')
        expect(it.terzo, 'il telefono non promette «Per questa sessione»').toBeNull()
        const en = cartaApprovazioneR4(carte[0], POLITICA, 'en')
        expect(en.motivo).toContain('It wants to use the tool «create issue» of the connector «github»')
        expect(en.badge).toBe('Asks to use a connector')
    }, 120_000)

    it('NUC-02 una cancellazione critica chiede anche con Accesso pieno, e la carta dice che cosa cancella; i comandi non partono mai', async () => {
        const { verificaPermessoScrittura } = await nucleo()
        for (const comando of ['rm -rf ~', 'rm -rf "$VUOTA"/']) {
            const chieste: Azione[] = []
            const esito = await verificaPermessoScrittura({ tipo: 'shell', comando }, {
                livelloAccesso: 'accesso-pieno', cartella: cartella(),
                chiediApprovazioneFn: async (a: Azione) => { chieste.push(a); return false },
            })
            expect(chieste, `${comando}: una carta`).toHaveLength(1)
            expect(esito.consentito, `${comando}: dopo il No non si consente`).toBe(false)
            const it = cartaApprovazioneR4(chieste[0], { permessi: 'Full access', perAttrezzo: {} }, 'it')
            expect(it.motivo, comando).toMatch(/^Questo comando cancella .+ serve il tuo sì ogni volta\.$/u)
            expect(it.terzo, `${comando}: niente «Per questa sessione»`).toBeNull()
            const en = cartaApprovazioneR4(chieste[0], { permessi: 'Full access', perAttrezzo: {} }, 'en')
            expect(en.motivo, comando).toMatch(/^This command deletes .+ this needs your yes every time\.$/u)
        }
    }, 120_000)

    it('NUC-03 le maschere: sulla carta del connettore un campo segreto e un nome di segreto nel testo arrivano oscurati', async () => {
        const { carte } = await giroMcp({ title: 'nota', clientsecret: 'finto-valore-123', note: 'DB_PASSPHRASE=finto-valore-456' })
        expect(carte).toHaveLength(1)
        const { codice } = cartaApprovazioneR4(carte[0], POLITICA, 'it')
        expect(codice).toContain('"title": "nota"')
        expect(codice).not.toContain('finto-valore-123')
        expect(codice).not.toContain('finto-valore-456')
        expect(codice).toContain('[redacted]')
        const { oscuraFormeDiSegreto } = await importaConNode(join(RADICE, 'harness-ui', 'src', 'forme-di-segreto.mjs'))
        expect(oscuraFormeDiSegreto('session-cookie: finto-valore-789')).toBe('session-cookie: [redacted]')
    }, 120_000)
})
