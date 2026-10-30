import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from 'vue'

/**
 * La colonna della chat in coordinate dello sfondo, per il corridoio velato di Forge (`motion-v6/veloDelleScene.ts`, owner 28/10, come il
 * desktop dc4859dd6 `misuraColonna`). Si misura quando cambia, MAI a ogni fotogramma: un ResizeObserver su sfondo e lista, più un
 * controllo al secondo che riaggancia la lista quando si cambia schermata (la lista nasce e muore col percorso).
 */
export const SELETTORE_COLONNA_CHAT = '[data-testid="talos-mobile-message-list"]'
export const SELETTORE_SFONDO = '[data-testid="talos-motion-background"]'

type Rettangolo = Readonly<{ left: number, right: number, width: number }>

/** `null` senza lista o con una lista larga meno di un pixel: allora resta solo il velo al 70%. */
export function colonnaRelativa(lista: Rettangolo | null, sfondo: Rettangolo | null): readonly [number, number] | null {
    if (!lista || !sfondo || lista.width <= 1) return null
    return Object.freeze([lista.left - sfondo.left, lista.right - sfondo.left] as const)
}

export function useColonnaDellaChat(radice: Pick<Document, 'querySelector'> = document): ShallowRef<readonly [number, number] | null> {
    const colonna = shallowRef<readonly [number, number] | null>(null)
    let osservatore: ResizeObserver | null = null
    let lista: Element | null = null
    let sfondo: Element | null = null
    let controllo: ReturnType<typeof setInterval> | null = null

    const misura = (): void => {
        colonna.value = colonnaRelativa(lista?.getBoundingClientRect() ?? null, sfondo?.getBoundingClientRect() ?? null)
    }
    const aggancia = (): void => {
        const nuovaLista = radice.querySelector(SELETTORE_COLONNA_CHAT)
        const nuovoSfondo = radice.querySelector(SELETTORE_SFONDO)
        if (nuovaLista === lista && nuovoSfondo === sfondo) return
        osservatore?.disconnect()
        lista = nuovaLista
        sfondo = nuovoSfondo
        if (typeof ResizeObserver === 'function') {
            osservatore = new ResizeObserver(misura)
            if (lista) osservatore.observe(lista)
            if (sfondo) osservatore.observe(sfondo)
        }
        misura()
    }

    onMounted(() => {
        aggancia()
        controllo = setInterval(aggancia, 1_000)
        window.addEventListener('resize', misura)
    })
    onBeforeUnmount(() => {
        osservatore?.disconnect()
        if (controllo) clearInterval(controllo)
        window.removeEventListener('resize', misura)
    })
    return colonna
}
