/**
 * Byte → base64, senza far esplodere lo stack.
 *
 * `String.fromCharCode(...bytes)` su un'immagine da qualche megabyte supera il
 * numero massimo di argomenti che una chiamata può avere e lancia. A pezzi da
 * 32 KB non succede, ed è il motivo per cui questa funzione esiste invece di
 * una riga in linea.
 *
 * Estratta da `toolset.ts` quando è servita anche alle immagini: due copie di
 * questa aritmetica sono due posti dove sbagliare la dimensione del pezzo.
 */
export function talosBytesToBase64(bytes: Uint8Array): string {
    let binary = ''
    const CHUNK = 0x8000
    for (let index = 0; index < bytes.length; index += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
    }
    return btoa(binary)
}
