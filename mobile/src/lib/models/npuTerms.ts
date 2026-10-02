/**
 * ⛔⛔ Le condizioni del software Qualcomm che l'utente accetta prima che
 * l'NPU si accenda — il testo ESATTO approvato dall'owner il 01/10/2026
 * («approva, andiamo avanti»), versione `npu-qualcomm-v1`.
 *
 * Perché esiste: il PKLA di Qualcomm (QTIL) permette di distribuire il codice
 * oggetto dentro TALOS solo con un accordo vincolante per chi lo usa (2.1 b),
 * con restrizioni simili alle sue (sezioni 3, 9 e 13).
 *
 * ⛔ Il testo NON passa da i18n: è un contratto, e quello che l'utente accetta
 * deve essere identico a quello approvato. Le due lingue stanno qui, intere.
 * L'impronta sha256 del testo mostrato va nel registro nativo
 * (`TalosNpuTerms`), insieme alla versione: cambiare una parola vuol dire
 * cambiare `TALOS_NPU_TERMS_VERSION` e chiedere una nuova accettazione
 * (lo fa fallire `tests/unit/models/npuTerms.test.ts`, NPU-TXT-02).
 */

export const TALOS_NPU_TERMS_VERSION = 'npu-qualcomm-v1'

export interface TalosNpuTermsText {
    title: string
    intro: string
    items: ReadonlyArray<{ title: string, body: string }>
    checkbox: string
    accept: string
    later: string
}

const IT: TalosNpuTermsText = {
    title: 'Accelerazione NPU — condizioni del software Qualcomm',
    intro: 'Per far lavorare i modelli sull\'NPU del tuo telefono, TALOS usa software concesso in licenza da Qualcomm Technologies International, Ltd. («Software Qualcomm»). Prima di accenderla devi accettare queste condizioni.',
    items: [
        { title: 'Uso consentito.', body: 'Puoi usare il Software Qualcomm solo dentro TALOS, su questo dispositivo, per eseguire i modelli.' },
        { title: 'Divieti.', body: 'Non puoi copiare, estrarre dall\'app, modificare, decompilare, disassemblare, decodificare o ricostruire in altro modo il Software Qualcomm, né cercare di ricavarne il codice sorgente. Non puoi distribuirlo, venderlo, noleggiarlo, prestarlo, concederlo in sublicenza o renderlo disponibile ad altri. Non puoi rimuovere o alterare gli avvisi di proprietà.' },
        { title: 'Riservatezza.', body: 'Il Software Qualcomm contiene segreti commerciali e informazioni riservate di Qualcomm e dei suoi licenziatari.' },
        { title: 'Proprietà.', body: 'Il Software Qualcomm resta di Qualcomm e dei suoi licenziatari. Queste condizioni non ti danno altri diritti oltre a quelli scritti qui.' },
        { title: 'Nessuna garanzia.', body: 'Il Software Qualcomm è fornito «così com\'è», senza garanzie di alcun tipo. Né Qualcomm né il fornitore di TALOS rispondono di danni derivanti dal suo uso, nei limiti consentiti dalla legge.' },
        { title: 'Usi ad alto rischio.', body: 'Non usare l\'accelerazione NPU in sistemi in cui un guasto possa causare morte, lesioni o danni gravi.' },
        { title: 'Leggi sull\'esportazione.', body: 'Il Software Qualcomm può essere soggetto alle leggi statunitensi e di altri paesi sull\'esportazione e sulle sanzioni. Non puoi usarlo, né trasferirlo, in paesi sotto embargo, verso persone o enti presenti nelle liste di soggetti sanzionati, o per usi finali vietati (per esempio militari, nucleari, chimici, biologici o missilistici).' },
        { title: 'Revoca.', body: 'Se la licenza di Qualcomm cessa o se violi queste condizioni, l\'accelerazione NPU si spegne e TALOS continua a funzionare con CPU e GPU.' },
    ],
    checkbox: 'Ho letto e accetto le condizioni del Software Qualcomm',
    accept: 'Accetto e accendo l\'NPU',
    later: 'Non ora',
}

const EN: TalosNpuTermsText = {
    title: 'NPU acceleration — Qualcomm software terms',
    intro: 'To run models on your phone\'s NPU, TALOS uses software licensed from Qualcomm Technologies International, Ltd. ("Qualcomm Software"). You must accept these terms before turning it on.',
    items: [
        { title: 'Permitted use.', body: 'You may use the Qualcomm Software only within TALOS, on this device, to run models.' },
        { title: 'Restrictions.', body: 'You may not copy, extract from the app, modify, decompile, disassemble, decrypt or otherwise reverse engineer the Qualcomm Software, or attempt to derive its source code. You may not distribute, sell, rent, lease, lend, sublicense or otherwise make it available to others. You may not remove or alter any proprietary notices.' },
        { title: 'Confidentiality.', body: 'The Qualcomm Software contains trade secrets and confidential information of Qualcomm and its licensors.' },
        { title: 'Ownership.', body: 'The Qualcomm Software remains the property of Qualcomm and its licensors. These terms grant you no rights other than those stated here.' },
        { title: 'No warranty.', body: 'The Qualcomm Software is provided "as is", without warranties of any kind. Neither Qualcomm nor the provider of TALOS is liable for damages arising from its use, to the extent permitted by law.' },
        { title: 'High-risk uses.', body: 'Do not use NPU acceleration in systems where a failure could cause death, injury or serious damage.' },
        { title: 'Export laws.', body: 'The Qualcomm Software may be subject to U.S. and other export control and sanctions laws. You may not use or transfer it in embargoed countries, to restricted persons or entities, or for prohibited end uses (for example military, nuclear, chemical, biological or missile).' },
        { title: 'Termination.', body: 'If Qualcomm\'s licence ends or you breach these terms, NPU acceleration turns off and TALOS keeps working on CPU and GPU.' },
    ],
    checkbox: 'I have read and accept the Qualcomm Software terms',
    accept: 'Accept and turn on the NPU',
    later: 'Not now',
}

/** Il testo nella lingua dell'app; ogni lingua diversa dall'italiano riceve l'inglese. */
export function talosNpuTermsText(locale: string): TalosNpuTermsText {
    return locale.toLowerCase().startsWith('it') ? IT : EN
}

/** La lingua del testo effettivamente mostrato (per il registro). */
export function talosNpuTermsLocale(locale: string): 'it' | 'en' {
    return locale.toLowerCase().startsWith('it') ? 'it' : 'en'
}

/**
 * Il testo in forma canonica, una riga per parte e nell'ordine in cui si
 * legge: è ciò di cui si calcola l'impronta. Le etichette dei pulsanti ne fanno
 * parte — «Accetto e accendo l'NPU» è la manifestazione del consenso.
 */
export function talosNpuTermsCanonical(text: TalosNpuTermsText): string {
    return [
        text.title,
        text.intro,
        ...text.items.map((item, index) => `${index + 1}. ${item.title} ${item.body}`),
        text.checkbox,
        text.accept,
        text.later,
    ].join('\n')
}

/** sha256 esadecimale minuscolo del testo canonico. */
export async function talosNpuTermsSha256(text: TalosNpuTermsText): Promise<string> {
    const dati = new TextEncoder().encode(talosNpuTermsCanonical(text))
    const digest = await crypto.subtle.digest('SHA-256', dati)
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
