import type { TalosBackupWiringDeps } from '@/services/backupWiring'

/**
 * Le dipendenze vere del backup, prese dove vivono davvero.
 *
 * Sta in un file suo perché la superficie non deve conoscere il repository né il
 * vault: la schermata chiede «dammi le dipendenze» e non sa da dove vengano.
 * Tutti gli import sono **a richiesta** — il backup è una cosa che si fa una
 * volta ogni tanto, e chi non lo fa non deve pagarne il peso all'avvio.
 *
 * ⛔ Il repository è quello **durevole**, costruito qui e non preso dallo store.
 *
 * Lo store instrada fra durevole ed effimero a seconda della sessione: le chat
 * temporanee vivono in memoria **apposta per non lasciare traccia**, e un backup
 * che le portasse via romperebbe la sola promessa che una chat temporanea fa.
 */
export async function talosBackupDeps(): Promise<TalosBackupWiringDeps> {
    const [{ createProductionChatRepository }, { TALOS_APP_BUILD }] = await Promise.all([
        import('@/repositories/productionChatRepository'),
        import('@/lib/appBuild'),
    ])
    const repository = createProductionChatRepository()
    await repository.initialize?.()

    return {
        repository,
        async readVaultBytes(fileId: string) {
            const [analysis, fileStore, vault] = await Promise.all([
                import('@/services/attachmentAnalysisClient'),
                import('@/services/attachmentFileStore'),
                import('@/services/talosVaultService'),
            ])
            const servizio = vault.createTalosVaultService({
                repository,
                fileStore: fileStore.createAttachmentFileStore(),
                analysisClient: analysis.createAttachmentAnalysisClient(),
            })
            const letto = await servizio.readFilePreview(fileId).catch(() => null)
            return letto?.bytes ?? null
        },
        /**
         * Rimette i byte dove la riga dice che stanno.
         *
         * Stesso magazzino da cui li ha letti l'esportazione: se la scrittura
         * andasse altrove, la riga d'indice punterebbe a un posto vuoto — che
         * è il difetto che questa funzione esiste per togliere.
         */
        async writeVaultBytes(privateUri: string, base64: string) {
            const fileStore = await import('@/services/attachmentFileStore')
            await fileStore.createAttachmentFileStore().writePrivateBytes(privateUri, base64)
        },
        async readSettings() {
            const { useSettingsStore } = await import('@/stores/settings')
            const settings = useSettingsStore()
            /*
             * ⛔ Si esporta lo STATO, non lo store.
             *
             * Uno store porta con sé funzioni e riferimenti reattivi che non
             * sopravvivono a `JSON.stringify` — e ciò che non sopravvive alla
             * serializzazione sparisce in silenzio, che è il modo peggiore di
             * perdere un'impostazione.
             */
            return JSON.parse(JSON.stringify(settings.state ?? {})) as Record<string, unknown>
        },
        async deviceModel() {
            const { talosMeasureDevice } = await import('@/services/deviceCapacity')
            const device = await talosMeasureDevice().catch(() => null)
            return device?.deviceModel ?? null
        },
        appBuild: TALOS_APP_BUILD,
    }
}
