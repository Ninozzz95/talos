/**
 * ⛔ K3-C Esporta e Condividi (ledger `LEDGER-K3-ESPORTA-CONDIVIDI-2026-10-17.md`; owner 17/10 «Come la chat: tutte e tre»): un'altra
 * sorgente per il foglio di esportazione della chat (`TalosMobileSessionExportSheet.vue`). Il foglio resta lo stesso (anteprima,
 * «Copia il Markdown», «Condividi o salva», «Salva nella Libreria»); cambia solo da dove vengono i formati e il contenuto. Senza
 * sorgente il foglio è quello della chat, com'era.
 */
export interface TalosFormatoEsportazione {
    format: string
    label: string
    action: string
    detail: string
}

export interface TalosArtefattoEsportato {
    reportType: string
    content: string
    contentType: string
    fileName: string
}

export interface TalosSorgenteEsportazione {
    /** Il titolo del foglio (senza, quello della chat: «Esporta chat»). */
    intestazione?: string
    /** Il nome di ciò che si esporta, in testa al foglio. */
    titolo: string
    /** La frase accanto al nome: cosa contiene ciò che si genera. */
    dettaglio: string
    formati: readonly TalosFormatoEsportazione[]
    /** Il contenuto del formato scelto; un rifiuto si dice nella riga d'errore del foglio. */
    genera(format: string): Promise<TalosArtefattoEsportato>
}
