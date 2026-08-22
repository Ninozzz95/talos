/**
 * L'unica richiesta di TALOS che non parte in JSON.
 *
 * OpenAI accetta una modifica d'immagine solo in `multipart/form-data`. Tutto
 * il resto dell'app parla al trasporto nativo, che manda oggetti; qui servono
 * dei byte dentro un pacco con un confine, e questa e' la sola ragione per cui
 * esiste questo file.
 *
 * ## Perche' `fetch` e non il trasporto dell'app
 *
 * MISURATO dal dispositivo il 2026-08-04, non dedotto: `fetch` con `FormData`
 * dalla WebView raggiunge `api.openai.com/v1/images/edits` e viene letto — la
 * risposta e' 401 sulla chiave, cioe' un errore di autenticazione, non un muro
 * CORS ne' un errore di trasporto. Il trasporto nativo dell'app, invece, prende
 * `data` come oggetto da serializzare in JSON: non ha un modo di dire «questi
 * sono byte binari con questo nome».
 *
 * La conseguenza sta scritta qui perche' si veda: e' una deviazione dalla
 * strada che prende tutto il resto, e una deviazione nascosta e' una trappola
 * per chi legge dopo.
 *
 * ## Cosa NON cambia
 *
 * Il risultato ha la stessa forma di quello del trasporto — `{ status, data }`
 * — e OpenAI risponde con lo stesso `b64_json` delle generazioni. Cosi' chi
 * legge lo stato, chi riconosce gli errori e chi estrae l'immagine restano
 * quelli di prima: la deviazione finisce qui dentro.
 */
import type { TalosImagePlan } from './imageGateway'

/**
 * Da base64 a byte veri.
 *
 * `Uint8Array<ArrayBuffer>` e non `Uint8Array` e basta: un `Uint8Array` puo'
 * appoggiarsi anche a una memoria condivisa fra thread, e `Blob` non la
 * accetta. Dichiarare il buffer qui e' cio' che rende questi byte impacchettabili.
 *
 * Il verso opposto — `talosBytesToBase64` — lavora a pezzi da 32 KB perche' li'
 * il pericolo e' passare un array enorme come argomenti di una chiamata. Qui
 * non c'e' quel pericolo, quindi non c'e' quella complicazione: il giro e' uno
 * solo, e scrive in memoria gia' allocata.
 */
function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binario = atob(base64)
    const byte = new Uint8Array(new ArrayBuffer(binario.length))
    for (let i = 0; i < binario.length; i += 1) byte[i] = binario.charCodeAt(i)
    return byte
}

/**
 * Spedisce un piano multipart e riporta indietro cio' che il trasporto avrebbe
 * riportato.
 *
 * `signal` arriva fino in fondo, al contrario di quanto succede col trasporto
 * nativo: qui `fetch` sa davvero interrompere: premere Stop smette di aspettare
 * E chiude la richiesta, invece di lasciarla correre e pagarla.
 */
export async function sendTalosImageMultipart(
    plan: TalosImagePlan,
    signal?: AbortSignal,
): Promise<{ status: number, data: unknown }> {
    const parts = plan.multipart
    if (!parts) throw new Error('TALOS_IMAGE_MULTIPART_MISSING')

    const form = new FormData()
    for (const [nome, valore] of Object.entries(parts.fields)) form.append(nome, valore)
    for (const file of parts.files) {
        form.append(
            file.field,
            new Blob([base64ToBytes(file.base64)], { type: file.mediaType }),
            file.filename,
        )
    }

    let risposta: Response
    try {
        risposta = await fetch(plan.url, {
            method: 'POST',
            headers: plan.headers,
            body: form,
            signal,
        })
    } catch (errore) {
        /*
         * Fermarsi ha UN nome solo in tutta l'app.
         *
         * `fetch` interrotto lancia un `AbortError`, che il resto della catena
         * non conosce: arriverebbe a chi guarda come un guasto di rete, cioe'
         * come un errore, mentre e' stata una sua decisione. L'altro ramo dice
         * gia' `TALOS_IMAGE_STOPPED`, e due nomi per lo stesso gesto sono due
         * comportamenti diversi davanti alla stessa persona.
         */
        if (signal?.aborted || (errore as { name?: string })?.name === 'AbortError') {
            throw new Error('TALOS_IMAGE_STOPPED')
        }
        throw errore
    }

    /*
     * Il corpo si legge come testo e poi si prova a interpretarlo.
     *
     * Un errore di gateway o una pagina di cortesia non sono JSON, e un
     * `response.json()` che esplode cancellerebbe la sola cosa utile che il
     * server ha detto. Cosi' invece il testo sopravvive comunque, e chi legge
     * gli errori a valle sa gia' cavare un messaggio da una forma qualsiasi.
     */
    const testo = await risposta.text()
    let dati: unknown = testo
    try {
        dati = JSON.parse(testo)
    } catch {
        dati = testo
    }
    return { status: risposta.status, data: dati }
}
