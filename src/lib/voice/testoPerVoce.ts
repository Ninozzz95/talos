/**
 * ⭐⭐⭐ Owner 22/8: «documento_complesso» detto come «documento underscore
 * complesso» - non un caso isolato. Le risposte di TALOS sono markdown
 * (grassetto, codice inline, titoli), e nessun motore di voce sa che `**`,
 * `` ` `` o `_` sono sintassi e non parole: le legge come se fossero testo,
 * ESATTAMENTE il difetto noto e documentato di mandare markdown grezzo a un
 * motore TTS ("the service is underscore running underscore" - lo stesso
 * sintomo, altre parole).
 *
 * ⛔ Non è lo stesso problema di `soloUnNomeDiTool` in `frasiDaLeggere.ts`:
 * quello TACE una frase intera che È solo un id (`device_screen_drive`);
 * questo NORMALIZZA la punteggiatura di sintassi dentro una frase vera,
 * senza mai toccarne le parole. «documento_complesso» resta due parole
 * dette («documento complesso»), non sparisce.
 *
 * ⛔ Deliberatamente NON elimina il contenuto dei blocchi di codice
 * (```...```): quel testo può essere ciò che la persona ha chiesto di
 * sentire riassunto, e toglierlo del tutto è una perdita di contenuto, non
 * solo di sintassi - una decisione più grande di questo fix, non presa
 * qui. Le sostituzioni sotto restano comunque cieche ai confini di un
 * blocco: un trattino basso dentro `const x_y` diventa uno spazio come
 * ovunque altro - non è un difetto, per una lettura ad alta voce "const x
 * y" si capisce meglio di "const x underscore y".
 */
export function talosTestoPerVoce(testo: string): string {
    return testo
        // Titoli: "## Titolo" -> "Titolo" (solo a inizio riga).
        .replace(/^#{1,6}\s+/gm, '')
        // Grassetto/corsivo con asterischi: "**forte**" o "*enfasi*" -> il testo dentro.
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        // Codice inline: "`comando`" -> "comando". Le lookaround escludono
        // un ``` di recinto (```...```): senza, una singola coppia di
        // backtick "mangiava" un backtick da ciascun lato della tripletta -
        // MISURATO da TESTOVOCE-05, che senza questa guardia falliva.
        .replace(/(?<!`)`([^`]+)`(?!`)/g, '$1')
        // Trattino basso: emphasis "_corsivo_" o identificatori "nome_file" -
        // in entrambi i casi un motore di voce lo legge meglio come spazio
        // che come "underscore" o come parola incollata.
        .replace(/_/g, ' ')
        // Gli spazi doppi che le sostituzioni sopra possono aver lasciato.
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
}
