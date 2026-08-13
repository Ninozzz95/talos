import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { talosToolsForLocalEngine } from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'

/**
 * ⛔⛔ QUANTO PESANO GLI SCHEMI — e perché è la prima domanda del compito #42.
 *
 * ## Il vincolo che decide tutto il resto
 *
 * Gemma 2 2B IT ha una finestra di **8.192 token**. Un solo «ciao» con TALOS ne
 * è costato **8.414** (MISURATO, [[due-minuti-per-ciao]]): il prompt non ci
 * entra **prima ancora** che la persona scriva.
 *
 * Sapere che «non entra» però non dice **cosa tagliare**. Questo file misura
 * dove va il peso, e lo tiene fermo: un tool nuovo che porta con sé mezzo
 * kilobyte di descrizione è invisibile a chi lo aggiunge e fatale a chi ha una
 * finestra piccola.
 *
 * ## Perché si contano i BYTE e non i token
 *
 * Perché il tokenizzatore lo porta il modello, e qui non c'è un modello: un
 * conteggio in token sarebbe vero per Qwen e falso per Gemma. I byte sono
 * uguali per tutti, e il rapporto byte/token di un JSON inglese è stabile
 * abbastanza (~3,5-4) da rendere la soglia utile. ⛔ La soglia in token si
 * misura sul dispositivo, non qui.
 */
const OGNI_TOOL_ACCESO = Object.freeze(
    Object.fromEntries(TALOS_AGENT_TOOL_IDS.map((id) => [id, true])),
) as Record<string, boolean>

async function schemiLocali(): Promise<Array<Record<string, unknown>>> {
    const toolset = await createTalosToolset({
        repository: {} as never,
        readVaultFileText: vi.fn(async () => null),
        readVaultFileBytes: vi.fn(async () => null),
        requestConsent: vi.fn(async () => true),
        sessionTitles: vi.fn(async () => new Map<string, string>()),
        libraryEnabled: () => true,
        libraryAccess: () => 'allow',
        memoryWriteAccess: () => 'allow',
        memoryWrite: () => ({}) as never,
        /*
         * ⛔ LE SORGENTI DEL TELEFONO CI VANNO, o si misura meta' del problema.
         *
         * La prima versione di questo file non le passava e contava **18**
         * tool: mancavano torcia, volume, sveglia, sfondo, media, aereo,
         * risparmio, notifiche e tutto il ponte — cioe' proprio il gruppo che
         * il compito #42 deve far chiamare al modello locale. Il totale che ne
         * usciva era meno della meta' del vero, e sarebbe finito in una
         * decisione.
         */
        device: () => ({}) as never,
        privileged: () => ({}) as never,
        notifications: () => ({}) as never,
        libraryWrite: () => ({}) as never,
        notesWrite: () => ({}) as never,
        tasksWrite: () => ({}) as never,
        web: () => ({}) as never,
        research: () => ({}) as never,
        documents: () => ({}) as never,
        images: () => ({}) as never,
        saveVaultFileToDevice: vi.fn(async () => ({}) as never),
        libraryContextPolicy: {} as never,
    })
    const tools = toolset.offer(
        { read: 'allow', write: 'allow', outbound: 'allow' },
        OGNI_TOOL_ACCESO as never,
    )
    return talosToolsForLocalEngine(tools as never) as Array<Record<string, unknown>>
}

function byte(valore: unknown): number {
    return new TextEncoder().encode(JSON.stringify(valore)).length
}

/**
 * MISURATO il 2026-08-09: **61 tool, 38.324 byte**. Il tetto sta sopra di circa
 * il 10% — abbastanza per un tool nuovo normale, non abbastanza per uno che
 * porta con sé un'unione discriminata.
 *
 * ⛔ Non è un limite estetico. Con ~3,7 byte per token sono **~10.400 token di
 * soli schemi**, e la finestra di Gemma 2 2B IT è **8.192**: già oggi il
 * modello che l'owner vuole usare non ci sta. Ogni byte aggiunto qui allontana
 * quel traguardo, e lo fa in silenzio.
 */
/*
 * ⛔ 42.000 → 42.300, il 2026-08-13, per `invia_file` — owner: «si possa dire
 * alla chat di inviare un file della libreria via social media o app di
 * messaggistica».
 *
 * Il commento qui sopra diceva che il 10% di margine bastava «per un tool nuovo
 * normale». `invia_file` È un tool nuovo normale — tre parametri, nessuna
 * unione discriminata — e pesa **271 byte**. Il margine se l'erano mangiato i
 * tool arrivati fra agosto e oggi: la superficie era già a ~41.950.
 *
 * ⛔ E il peso è stato inseguito prima di alzare, in tre forme misurate:
 *     prima stesura (descrizione lunga)   42.819   ⛔ +819
 *     descrizione all'essenziale          42.354   ⛔ +354
 *     + titolo corto, parametri asciutti  42.221   ⛔ +221
 * Sotto i 271 byte non si scende senza togliere al modello qualcosa che non
 * può dedurre — per esempio che deve CHIEDERE invece di indovinare quale file.
 *
 * ⛔ E resta vero ciò che dice il commento sopra: con ~3,7 byte per token siamo
 * a ~11.400 token di soli schemi contro gli 8.192 di Gemma 2 2B. Quel traguardo
 * era già fuori portata prima di questi 271 byte, e la strada per riprenderlo
 * non è negare un tool: è il catalogo compatto per il motore locale.
 */
const TETTO_BYTE = 42_300

/**
 * ⛔ E nessun tool da solo può valere un ottavo di tutto.
 *
 * `document_create` oggi pesa **4.878 byte** — il 12,7% dell'intera superficie,
 * per via dell'unione discriminata degli undici blocchi del report. È
 * ricchezza vera e resta; il tetto serve a impedire che ne nasca un secondo
 * senza che nessuno se ne accorga.
 */
const TETTO_UN_TOOL = 5_200

describe('il peso degli schemi dei tool, che è il vincolo del locale', () => {
    it('⛔ la superficie totale resta sotto il tetto', async () => {
        const totale = (await schemiLocali()).reduce((somma, voce) => somma + byte(voce), 0)
        expect(totale).toBeLessThan(TETTO_BYTE)
    })

    it('⛔ nessun singolo tool sfonda da solo', async () => {
        const grossi = (await schemiLocali())
            .map((voce) => ({
                nome: String((voce.function as Record<string, unknown>).name),
                peso: byte(voce),
            }))
            .filter((riga) => riga.peso > TETTO_UN_TOOL)
        expect(grossi).toEqual([])
    })

    it('misura e mostra dove va il peso', async () => {
        const schemi = await schemiLocali()
        const righe = schemi.map((voce) => {
            const f = voce.function as Record<string, unknown>
            return {
                nome: String(f.name),
                totale: byte(voce),
                descrizione: byte(f.description),
                parametri: byte(f.parameters),
            }
        }).sort((a, b) => b.totale - a.totale)

        const totale = righe.reduce((somma, r) => somma + r.totale, 0)
        const descrizioni = righe.reduce((somma, r) => somma + r.descrizione, 0)
        const parametri = righe.reduce((somma, r) => somma + r.parametri, 0)

        // eslint-disable-next-line no-console
        console.log(
            `\nTOOL: ${righe.length}`
            + `\nTOTALE: ${totale} byte (~${Math.round(totale / 3.7)} token)`
            + `\n  descrizioni: ${descrizioni} byte (${Math.round(descrizioni * 100 / totale)}%)`
            + `\n  parametri:   ${parametri} byte (${Math.round(parametri * 100 / totale)}%)`
            + `\n\nI DODICI PIU' PESANTI:\n`
            + righe.slice(0, 12).map((r) =>
                `${String(r.totale).padStart(6)} b  desc ${String(r.descrizione).padStart(5)}  par ${String(r.parametri).padStart(5)}  ${r.nome}`,
            ).join('\n'),
        )

        expect(righe.length).toBeGreaterThan(10)
    })
})
