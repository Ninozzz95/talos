// Gli ingressi della prova di parità col PC (giudice v1523), gli STESSI per il test del telefono e per chi rigenera i numeri del
// PC in `paritaRiassuntoAtteso.pc.json` (il modo è scritto in testa a `paritaRiassuntoAtteso.test.ts`). Solo dati, nessun percorso
// di altre lane (LANE-01, owner 25/09/2026).
const testo = (n, c = 'a') => c.repeat(n)
const scambiDelTester = (n) => Array.from({ length: n }, (_, i) => [{ role: 'user', content: `domanda ${i}` }, { role: 'assistant', content: testo(1_624, 'r') }]).flat()

export const MEZZI = [
    [],
    [{ role: 'user', content: testo(40) }],
    [{ role: 'user', content: testo(1_600) }, { role: 'assistant', content: testo(1_624) }],
    // Sei scambi del Tester: quattro risposte da ~406 token nel tratto da riassumere; otto: sei risposte.
    scambiDelTester(4),
    scambiDelTester(6),
    // Accenti e ideogrammi: il PC conta i byte UTF-8 fuori dall'ASCII e un token per ideogramma.
    [{ role: 'user', content: 'perché la città è così più bella ' + testo(300, 'è') }, { role: 'assistant', content: '日本語のテキスト' + testo(200, '漢') + '한국어' }],
    // Chiamate di attrezzi, risultati, pezzi con immagini e immagini guardate (`talos_immagini`).
    [
        { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'leggi', arguments: JSON.stringify({ percorso: testo(400) }) } }] },
        { role: 'tool', tool_call_id: 'c1', content: testo(9_000, 'x'), talos_immagini: [{ a: 1 }, { b: 2 }] },
        { role: 'user', content: [{ type: 'text', text: testo(800, 'p') }, { type: 'image_url', image_url: { url: 'data:' } }, { type: 'input_image' }, { type: 'image' }, { type: 'text', text: 'perché' }] },
    ],
    Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: testo(20_000 + i, 'z') })),
]
const FINESTRE = [null, 0, 2_816, 8_192, 131_072, 1_000_000]
const SOGLIE = [null, 1_344, 3_072, 150_000]
const MEDIANE = [null, -5, 50, 139.6, 401, 9_999, 50_000]
const PRIME = [[3_899, 2_351], [4_714, 2_351], [1_000, 1_200]]
const SCARTI = [0, 250.4]
const LISTE = [null, [], [120], [120, 80], [5, -1, 0, 'x', null, 300, 7], Array.from({ length: 14 }, (_, i) => (i * 37) % 23 + 1), [1.5, 2.5]]
const NUOVI = [null, 0, 250, -3]
// Giro dopo i revisori (giudice v1535): gli schemi degli attrezzi (il denominatore di k) e F6 con l'uguaglianza esatta (revisori A e C).
const ATTREZZI = [null, [], 'x', [{ type: 'function', function: { name: 'notes_list', description: testo(400, 'd') } }], [{ name: 'perché', description: '漢字 e più' }]]

/** I casi: `m` è il numero del tratto in MEZZI, che i due lati mettono al suo posto (il tratto non si ripete in ogni caso). */
export function casiDellaParita() {
    const casi = []
    for (const [m] of MEZZI.entries()) casi.push({ funzione: 'stimaConPezzi', m, argomenti: [null] })
    for (const lista of LISTE) {
        casi.push({ funzione: 'medianaRiassunti', argomenti: [lista] })
        for (const nuovo of NUOVI) casi.push({ funzione: 'conRiassuntoVero', argomenti: [lista, nuovo] })
    }
    for (const [m] of MEZZI.entries()) for (const finestraToken of FINESTRE) for (const soglia of SOGLIE) for (const mediana of MEDIANE) {
        casi.push({ funzione: 'riassuntoAtteso', m, argomenti: [null, { finestraToken, soglia, mediana }] })
        for (const [prima, pavimentoConCornice] of PRIME) {
            casi.push({ funzione: 'guadagnoAtteso', m, argomenti: [{ prima, pavimentoConCornice, finestraToken, soglia, mediana }] })
            for (const scarto of SCARTI) casi.push({ funzione: 'pavimentoOltreLaFinestra', m, argomenti: [{ pavimentoConCornice, finestraToken, soglia, mediana, scarto }] })
        }
    }
    for (const attrezzi of ATTREZZI) casi.push({ funzione: 'stimaDegliAttrezzi', argomenti: [attrezzi] })
    for (const pavimentoConCornice of [2_415, 2_416, 2_417]) {
        casi.push({ funzione: 'pavimentoOltreLaFinestra', m: 3, argomenti: [{ pavimentoConCornice, finestraToken: 2_816, soglia: null, mediana: null, scarto: 0 }] })
    }
    return casi
}

/** Gli argomenti veri di un caso, col tratto al suo posto. */
export function argomentiDelCaso(caso) {
    if (caso.m === undefined) return caso.argomenti
    const mezzo = MEZZI[caso.m]
    if (caso.funzione === 'stimaConPezzi' || caso.funzione === 'riassuntoAtteso') return [mezzo, ...caso.argomenti.slice(1)]
    return [{ ...caso.argomenti[0], mezzo }]
}

export const COSTANTI = ['RIASSUNTO_ATTESO_MINIMO_TOKEN', 'RIASSUNTI_VERI_TENUTI', 'FRAZIONE_RIASSUNTO_SUL_MEZZO',
    'FRAZIONE_RIASSUNTO_SULLA_FINESTRA', 'TETTO_TOKEN_RIASSUNTO', 'FRAZIONE_FINESTRA', 'TETTO_TOKEN_DEFAULT', 'FATTORE_K_MASSIMO']
