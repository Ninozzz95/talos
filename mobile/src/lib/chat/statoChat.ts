/**
 * ⭐ LO STATO DI UNA CHAT NELL'ELENCO — dai fatti che il telefono ha già.
 *
 * Riferimento desktop (sola lettura): `components/session-item.js:69-111`,
 * `statoSessione`. Lì il difetto del 06/09 fu una PRECEDENZA sbagliata: una
 * sessione uccisa dalla morte del processo restava «in corso» per sempre,
 * perché `!conclusa` intercettava il caso prima che `interrotta` parlasse.
 * Qui la precedenza è UNA, scritta in fila, e la prova STATO-10 la percorre
 * sulla griglia intera:
 *
 *   aspetta-te > in-corso > in-coda | in-pausa > fallita > interrotta > conclusa > vuota
 *
 * CODA-PAUSA (25/09/2026, owner «in pausa»): «in-coda» e «in-pausa» sono lo STESSO posto nella precedenza
 * (ci sono voci che aspettano); la pausa dello Stop cambia solo la parola, come nella
 * coda della chat («1 in pausa … parte solo se la invii tu»).
 *
 * ## Corrispondenza con gli 8 stati del desktop
 *
 * | desktop       | mobile       | perché                                                          |
 * |---------------|--------------|-----------------------------------------------------------------|
 * | `attesa`      | `aspetta-te` | stesso fatto: un permesso d'attrezzo aspetta la persona         |
 * | `vivo`        | `in-corso`   | stesso fatto; qui lo dice lo store (giro vivo), non il server   |
 * | `interrotto`  | `interrotta` | morte del processo: sul telefono si vede dall'ultimo messaggio  |
 * | `fermata`     | `interrotta` | ⚠ sul mobile lo Stop e la morte del processo lasciano la STESSA |
 * |               |              | traccia (`metadata.interrupted: true`, `stores/chat.ts:1919`):  |
 * |               |              | distinguerle vorrebbe un dato che oggi non si scrive            |
 * | `errore`      | `fallita`    | il riquadro d'errore è un messaggio `system` in stato `failed`  |
 * |               |              | (`stores/chat.ts:1833`, `:1930`)                                |
 * | `successo`    | `conclusa`   | ultima risposta completa                                        |
 * | `ignoto`      | —            | NON ESISTE: il desktop non sempre conosce l'esito dal server;   |
 * |               |              | qui l'esito È l'ultimo messaggio, sempre sul disco del telefono |
 * | `pendente`    | `vuota`      | nessun messaggio ancora                                         |
 * | —             | `in-coda`    | NUOVO: il desktop mostra la coda nel banner della sessione; qui |
 * |               |              | la coda è per chat (B3) e l'elenco deve dire che una chat ha    |
 * |               |              | messaggi che aspettano di partire (decisione owner D-B3-04)     |
 * | —             | `in-pausa`   | NUOVO: le stesse voci, ferme dallo Stop (`inPausa` della coda)  |
 *
 * «giri finiti» del desktop non è uno stato ma una variante del TESTO di
 * `errore` (stessa classe): qui non ha un valore proprio.
 *
 * Funzione PURA: nessun DOM, nessuna rete, mai un'eccezione.
 */

export type TalosStatoChat =
    | 'aspetta-te'
    | 'in-corso'
    | 'in-coda'
    | 'in-pausa'
    | 'fallita'
    | 'interrotta'
    | 'conclusa'
    | 'vuota'

export interface TalosStatoChatUltimoMessaggio {
    ruolo: 'user' | 'assistant' | 'tool' | 'system'
    /** `TalosLocalMessageState`: 'persisted' | 'pending' | 'failed' (`repositories/chatRepository.ts:6`). */
    stato?: string
    /** `metadata.interrupted` della risposta fermata a metà. */
    interrotto?: boolean
}

export interface TalosStatoChatIngresso {
    permessoInAttesa: boolean
    inCorso: boolean
    vociInCoda: number
    /** CODA-PAUSA (25/09/2026, owner «in pausa»): la coda della chat è ferma dallo Stop. Assente = non in pausa. */
    codaInPausa?: boolean
    ultimoMessaggio: TalosStatoChatUltimoMessaggio | null
}

export function statoChat({
    permessoInAttesa,
    inCorso,
    vociInCoda,
    codaInPausa,
    ultimoMessaggio,
}: TalosStatoChatIngresso): TalosStatoChat {
    if (permessoInAttesa === true) return 'aspetta-te'
    if (inCorso === true) return 'in-corso'
    // Solo un numero vero e positivo: NaN, negativi o stringhe (dato storto) non contano.
    // Solo `true` è una pausa: un dato storto non la inventa.
    if (typeof vociInCoda === 'number' && vociInCoda > 0) return codaInPausa === true ? 'in-pausa' : 'in-coda'
    if (!ultimoMessaggio) return 'vuota'
    const { ruolo, stato, interrotto } = ultimoMessaggio
    /*
     * ⛔ L'errore vince sull'interruzione: un giro fallito dopo aver scritto un
     *   parziale lascia il parziale interrotto E, dopo, il riquadro d'errore.
     *   Il fatto più grave è l'errore, ed è quello che la persona deve leggere.
     */
    if ((ruolo === 'assistant' || ruolo === 'system') && stato === 'failed') return 'fallita'
    /*
     * ⛔ Nessun giro vivo (i rami sopra lo escludono) e la conversazione non è
     *   arrivata a una risposta finale: nessuno la sta eseguendo. È il difetto
     *   del desktop del 06/09 al contrario — una chat che nessuno esegue non
     *   può dirsi viva, e nemmeno conclusa.
     *   - `user`: la persona ha scritto e la risposta non è mai arrivata (Stop
     *     prima del primo carattere, o processo morto);
     *   - `tool`: il giro si è fermato fra un attrezzo e la risposta finale;
     *   - `assistant` interrotto o rimasto `pending`: risposta a metà.
     */
    if (ruolo === 'user' || ruolo === 'tool') return 'interrotta'
    if (ruolo === 'assistant' && (interrotto === true || stato === 'pending')) return 'interrotta'
    return 'conclusa'
}
