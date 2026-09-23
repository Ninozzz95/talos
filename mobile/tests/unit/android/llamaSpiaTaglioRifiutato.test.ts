import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(
    process.cwd(),
    'android/app/src/main/cpp/talos_llama_jni.cpp',
), 'utf8')

/**
 * ⛔⛔⛔ LA SPIA DEL TAGLIO RIFIUTATO — scritta, e cancellata tre righe dopo.
 *
 * ## Il difetto, e perché è vissuto indisturbato dal giorno uno
 *
 * `nativeGenerate` accende `taglio_rifiutato` quando `llama_memory_seq_rm`
 * RIFIUTA il taglio parziale della KV, e poi pubblica i tempi con
 * un'inizializzazione aggregata: `session->tempi = { ... }`. Quella lista
 * elencava DIECI valori per UNDICI membri, e lo standard dice esattamente cosa
 * succede al membro lasciato fuori — C++17 (`CMAKE_CXX_STANDARD 17` in
 * `cpp/CMakeLists.txt:14`), N4659 [dcl.init.aggr]/8, letto il 2026-09-10:
 *
 *     «If there are fewer initializer-clauses in the list than there are
 *      elements in a non-union aggregate, then each element not explicitly
 *      initialized is initialized as follows: If the element has a default
 *      member initializer, the element is initialized from that initializer.»
 *
 * ⇒ `taglio_rifiutato` ha `= false` come default member initializer, quindi il
 * `true` veniva riazzerato nella STESSA chiamata e `"partialTrimRefused"`
 * usciva SEMPRE `false`. Non «non è successo»: falso per costruzione.
 *
 * ## Perché nessuno se n'è accorto
 *
 * Perché nessuno poteva. `-Wmissing-field-initializers` tace DI PROPOSITO
 * quando il membro mancante ha un default member initializer — per clang non
 * c'è niente di «missing», il valore c'è (llvm/llvm-project#147582, letto il
 * 2026-09-10). Verificato il 2026-09-10 col clang dell'NDK r27 su una
 * riproduzione minima, target `aarch64-linux-android26`: `-Wall -Wextra
 * -Wmissing-field-initializers` non stampa UNA riga, e due `static_assert`
 * confermano il resto — dieci inizializzatori danno `false`, undici danno
 * `true`. In build di rilascio il JNI non scrive in logcat, quindi nemmeno il
 * log poteva smentire il JSON. E `false` è un valore PLAUSIBILE: nessun
 * controllo si insospettisce davanti a una risposta ragionevole.
 *
 * ## Perché questa prova è fatta così, e non come le altre
 *
 * ⛔ Le prove che c'erano guardavano se il campo ESISTEVA nel JSON, e il campo
 * esisteva: erano verdi mentre la spia era morta. Una prova che chiede «c'è la
 * stringa `partialTrimRefused`?» NON PUÒ vedere questo difetto, perché il
 * difetto non toglie la stringa — la riempie sempre allo stesso modo.
 *
 * ⇒ Qui si fa l'unica cosa che morde senza un telefono in mano: si legge il
 * sorgente vero, si contano i membri veri della struttura, si spezzano gli
 * inizializzatori veri di OGNI pubblicazione, e si APPLICA [dcl.init.aggr]/8
 * per calcolare il valore che arriverebbe davvero al JSON. Se qualcuno rimette
 * dieci inizializzatori, la simulazione restituisce `false` e queste prove
 * diventano rosse — per la stessa ragione per cui il difetto esisteva, non per
 * una stringa mancante.
 */
const cpp = {
    /** Via i commenti: dentro le graffe ci sono, e contengono virgole. */
    senzaCommenti(testo: string): string {
        let fuori = ''
        for (let i = 0; i < testo.length; i += 1) {
            if (testo.startsWith('/*', i)) {
                const fine = testo.indexOf('*/', i + 2)
                i = fine < 0 ? testo.length : fine + 1
                continue
            }
            if (testo.startsWith('//', i)) {
                const fine = testo.indexOf('\n', i)
                i = fine < 0 ? testo.length : fine - 1
                continue
            }
            if (testo[i] === '"') {
                const fine = testo.indexOf('"', i + 1)
                fuori += testo.slice(i, fine < 0 ? testo.length : fine + 1)
                i = fine < 0 ? testo.length : fine
                continue
            }
            fuori += testo[i]
        }
        return fuori
    },

    /** Il corpo fra la prima graffa a partire da `da` e la sua compagna. */
    corpoGraffe(testo: string, da: number): string {
        const apre = testo.indexOf('{', da)
        if (apre < 0) throw new Error(`nessuna graffa da ${da}`)
        let livello = 0
        for (let i = apre; i < testo.length; i += 1) {
            if (testo[i] === '{') livello += 1
            else if (testo[i] === '}') {
                livello -= 1
                if (livello === 0) return testo.slice(apre + 1, i)
            }
        }
        throw new Error(`graffa mai chiusa da ${da}`)
    },

    /** Le virgole di PRIMO livello: `(int) (fed - riusati)` è UN valore solo. */
    valoriDiPrimoLivello(corpo: string): string[] {
        const pezzi: string[] = []
        let livello = 0
        let corrente = ''
        for (const ch of corpo) {
            if ('([{'.includes(ch)) livello += 1
            if (')]}'.includes(ch)) livello -= 1
            if (ch === ',' && livello === 0) {
                pezzi.push(corrente)
                corrente = ''
                continue
            }
            corrente += ch
        }
        pezzi.push(corrente)
        // L'ultima virgola prima della graffa lascia un pezzo vuoto: non è un
        // valore, è punteggiatura.
        return pezzi.map((x) => x.trim()).filter((x) => x.length > 0)
    },
}

const nudo = cpp.senzaCommenti(source)

/** I membri di `talos_cronometro`, nell'ordine in cui li vede l'aggregato. */
const membri = (() => {
    const corpo = cpp.corpoGraffe(nudo, nudo.indexOf('struct talos_cronometro'))
    return [...corpo.matchAll(/(?:long long|int|bool)\s+(\w+)\s*=\s*([^;]+);/g)]
        .map((m) => ({ nome: m[1], predefinito: m[2].trim() }))
})()

/** Ogni `session->tempi = { ... }` del file, coi suoi valori già spezzati. */
const pubblicazioni = (() => {
    const fuori: string[][] = []
    let da = nudo.indexOf('session->tempi = {')
    while (da >= 0) {
        fuori.push(cpp.valoriDiPrimoLivello(cpp.corpoGraffe(nudo, da)))
        da = nudo.indexOf('session->tempi = {', da + 1)
    }
    return fuori
})()

/**
 * [dcl.init.aggr]/8 applicato per davvero: il membro oltre la fine della lista
 * NON è indeterminato e non è zero — prende il suo default member initializer.
 * È questa riga a riprodurre il difetto, ed è per questo che morde.
 */
function valoreCheArrivaAlJson(nomeMembro: string, inizializzatori: string[]): string {
    const posizione = membri.findIndex((m) => m.nome === nomeMembro)
    if (posizione < 0) throw new Error(`membro inesistente: ${nomeMembro}`)
    return posizione < inizializzatori.length
        ? inizializzatori[posizione]
        : membri[posizione].predefinito
}

describe('la spia del taglio rifiutato dice il vero', () => {
    /**
     * ⛔ PRIMA DI TUTTO: la prova deve fallire rumorosamente se non ha trovato
     * ciò che credeva di leggere. Un lettore che non trova niente e tace è un
     * cancello inerte — supera ogni verifica esattamente come uno vero.
     */
    it('il lettore ha davvero trovato la struttura e le sue pubblicazioni', () => {
        expect(membri.map((m) => m.nome)).toEqual([
            'tokenizzazione_ms', 'prefisso_ms', 'prefill_ms', 'primo_token_ms', 'totale_ms',
            'token_prompt', 'token_riusati', 'token_nuovi', 'token_prodotti',
            'contesto_riusato', 'taglio_rifiutato',
        ])
        // Due, e non è un numero a caso: il prefill interrotto e la fine
        // ordinaria. Pubblicare in uno solo dei due è peggio che in nessuno,
        // perché sembra fatto.
        expect(pubblicazioni).toHaveLength(2)
        // ⛔ Il default DEVE essere `false`: è ciò che rende il difetto
        // invisibile invece che rumoroso, ed è la ragione di questa prova.
        expect(membri.at(-1)).toEqual({ nome: 'taglio_rifiutato', predefinito: 'false' })
    })

    /**
     * ⛔⛔⛔ LA PROVA CHE MORDE. Non «esiste il campo» ma «il valore ARRIVA».
     *
     * Rimetti dieci inizializzatori in una qualunque delle due pubblicazioni e
     * questa diventa rossa, perché la simulazione dello standard restituisce
     * `false` — la stessa `false` che il telefono avrebbe stampato.
     */
    it('il `true` scritto quando il taglio viene rifiutato arriva fino al JSON', () => {
        for (const inizializzatori of pubblicazioni) {
            expect(inizializzatori).toHaveLength(membri.length)
            expect(valoreCheArrivaAlJson('taglio_rifiutato', inizializzatori))
                .toBe('taglio_rifiutato')
        }
    })

    /**
     * ⛔ IL VERSO SBAGLIATO DELLA CURA, chiuso qui perché è invitante.
     *
     * Rileggere `session->tempi.taglio_rifiutato` come undicesimo valore
     * sembra «conservare il campo» e invece lo renderebbe APPICCICOSO: dopo il
     * primo rifiuto la spia resterebbe accesa per sempre, su ogni modello. La
     * verità di QUESTO giro sta in una locale che nasce `false` a ogni
     * chiamata, e la spia si spegne all'ingresso di `nativeGenerate`.
     */
    it('l\'undicesimo valore è la locale del giro, non il campo riletto', () => {
        expect(nudo).toContain('bool taglio_rifiutato = false;')
        for (const inizializzatori of pubblicazioni) {
            expect(inizializzatori.at(-1)).not.toContain('session->tempi')
        }
        expect(nudo).toContain('session->tempi.taglio_rifiutato = false;')
    })

    /**
     * L'altra metà della catena: la scrittura vera, nel ramo vero — quello in
     * cui `llama_memory_seq_rm` ha detto di no.
     */
    it('si accende SOLO dove `llama_memory_seq_rm` ha rifiutato', () => {
        const rifiuto = nudo.match(
            /!llama_memory_seq_rm\(memoria, 0, \(llama_pos\) riusati, -1\)\)\s*\{([^]*?)\n {8}\}/,
        )
        expect(rifiuto).not.toBeNull()
        const ramo = rifiuto?.[1] ?? ''
        expect(ramo).toContain('taglio_rifiutato = true;')
        expect(ramo).toContain('llama_memory_clear(memoria, true);')
        /*
         * ⛔ E SOTTO CHIAVE: `nativeLastTimings` è una VEDETTA — la disciplina
         * dichiarata su `g_motore` la mette fra chi NON prende la serratura del
         * motore, proprio per poter rispondere mentre la generazione va avanti.
         * ⇒ Legge `session->tempi` da un altro thread MENTRE questa riga lo
         * scrive. Senza il lock è una data race, cioè comportamento indefinito
         * — anche su un `bool`, e anche se «tanto è una scrittura sola».
         */
        expect(ramo).toMatch(
            /std::lock_guard<std::mutex> guard\(session->tempi_lock\);\s*\n\s*session->tempi\.taglio_rifiutato = true;/,
        )
    })

    /** Nessun accesso a `session->tempi` fuori dalla sua serratura. */
    it('ogni accesso a `session->tempi` passa da `tempi_lock`', () => {
        // `\b` e non `[ .=]`: la lettura in `nativeLastTimings` è
        // `tempi = session->tempi;` e finisce con un punto e virgola. E `\b`
        // esclude da sé `session->tempi_lock`, perché `_` è carattere di parola.
        const accessi = [...nudo.matchAll(/session->tempi\b/g)]
        const guardie = [...nudo.matchAll(/std::lock_guard<std::mutex> guard\(session->tempi_lock\);/g)]
        // Quattro scritture (lo spegnimento all'ingresso, l'accensione sul
        // rifiuto, le due pubblicazioni) più una lettura in
        // `nativeLastTimings`: cinque accessi, cinque guardie.
        expect(accessi).toHaveLength(5)
        expect(guardie).toHaveLength(5)
    })

    /** Fino allo schermo: il JSON deve leggere QUEL membro, non un altro. */
    it('il JSON stampa `partialTrimRefused` da `taglio_rifiutato`', () => {
        expect(source).toContain('\\"partialTrimRefused\\":%s}')
        expect(nudo).toContain('tempi.taglio_rifiutato ? "true" : "false"')
    })
})

/**
 * ⛔ LA CACCIA ALLE ALTRE INIZIALIZZAZIONI AGGREGATE INCOMPLETE.
 *
 * Il difetto non è «una svista in due righe»: è una FORMA, e una forma si cerca
 * ovunque possa ripetersi. Censite il 2026-09-10 tutte le inizializzazioni
 * aggregate del file e contati i membri di ogni struttura contro i suoi valori:
 *
 *     `session->tempi = { ... }`            ×2  → 11 su 11 (era 10, curato)
 *     `gguf_init_params params = { ... }`   ×2  → 2 su 2   (no_alloc, ctx)
 *     `common_speculative_get_draft_params(...) = { ... }` → 6 su 6
 *     `TalosHwcap{ ... }`                       → 2 su 2
 *     `jlong valori[3]` / `const jlong values[5]` → array, non aggregati con NSDMI
 *     `talos_core_cpu core;` / `talos_forma_gguf forma;` → default-init, mai a graffe
 *
 * ⇒ Nessun'altra incompleta. Questa prova tiene ferma la conclusione: se un
 * domani qualcuno aggiunge una struttura con default member initializer e la
 * inizializza a metà, il conteggio qui sotto se ne accorge.
 */
describe('nessun\'altra inizializzazione aggregata lascia indietro un membro', () => {
    /** Le strutture del file che HANNO default da perdere. */
    const conDefault = [...nudo.matchAll(/struct (\w+) \{/g)]
        .filter((m) => /\w+\s+\w+\s*=\s*[^;]+;/.test(cpp.corpoGraffe(nudo, m.index ?? 0)))
        .map((m) => m[1])

    it('il censimento trova tutte e sole le strutture esposte al difetto', () => {
        // ⛔ `TalosHwcap` non c'è, e giustamente: i suoi due membri non hanno
        // default, quindi un elenco a metà li azzererebbe invece di riempirli di
        // nascosto — rumoroso, non silenzioso. È il silenzio a fare il difetto.
        // ⛔ `talos_geometria_kv` aggiunta il 2026-09-10 con la cura della KV
        // sui modelli IBRIDI (`talos_geometria_kv_di()`): ha default da
        // perdere, quindi il censimento la deve vedere — ma non viene MAI
        // inizializzata a graffe (si dichiara e si assegna per intero), come
        // la prova qui sotto verifica da sé.
        expect([...conDefault].sort()).toEqual([
            'talos_core_cpu', 'talos_cronometro', 'talos_forma_gguf',
            'talos_geometria_kv', 'talos_session',
        ])
    })

    /**
     * ⛔ La caccia vera: fra le quattro, l'UNICA che viene inizializzata a
     * graffe è `talos_cronometro` (via `session->tempi`), e quella è contata
     * membro per membro qui sopra. Le altre tre si dichiarano e basta
     * (`talos_core_cpu core;`, `talos_forma_gguf forma;`, `talos_session` con
     * `new`), quindi ogni membro prende il suo default e non se ne perde
     * nessuno. Se un domani una di loro venisse inizializzata a graffe,
     * questa prova diventerebbe rossa e chiederebbe lo stesso conteggio.
     */
    it('delle quattro, solo `talos_cronometro` viene inizializzata a graffe', () => {
        for (const nome of conDefault) {
            // `(?<!struct )` o la dichiarazione stessa risponderebbe presente.
            const graffe = [...nudo.matchAll(
                new RegExp(`(?<!struct )\\b${nome}\\b[\\w\\s*&]*=?\\s*\\{[^}]`, 'g'),
            )]
            expect({ nome, graffe: graffe.length })
                .toEqual({ nome, graffe: 0 })
        }
        // E l'unica strada a graffe verso `talos_cronometro` resta
        // `session->tempi`, già contata membro per membro.
        expect(pubblicazioni).toHaveLength(2)
    })
})
