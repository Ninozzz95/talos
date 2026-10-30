/**
 * ICONE-SCELTE — owner 28/10/2026, dal mockup su disco (`.claude/mockup/icone-2026-10-28/`), dopo il censimento delle 419 icone
 * (`.claude/ragionamento/CENSIMENTO-ICONE-2026-10-28.md`, §5): «ci sono alcune icone che fanno veramente schifo… c'è una icona tela di
 * ragno quando accodi un messaggio… devi metterle belle». Ogni riga qui sotto è una scelta dell'owner: il disegno giusto nel posto giusto,
 * e quello vecchio non torna. P23 (Indietro) è restato com'era per sua scelta; P26 non era nel mockup.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sorgente = (f: string) => readFileSync(resolve(__dirname, '../../src', f), 'utf8')
// [P, file, ci deve essere, non ci deve essere più]
const SCELTE: Array<[string, string, RegExp, RegExp | null]> = [
    ['P1', 'components/chat/TalosMobileCodaDelGiro.vue', /return CornerDownRight/u, /\bShipWheel\b/u],
    ['P2', 'components/chat/TalosMobileCodaDelGiro.vue', /'ferma-e-riparti'\) return SkipForward/u, null],
    ['P3', 'components/chat/TalosMobileMessageOverflowMenu.vue', /<RotateCcw class="talos-message-sheet-icon"/u, /\bRefreshCcw\b/u],
    ['P3', 'components/codice/TalosCodiceR4Terminale.vue', /<RefreshCw class="size-3\.5"/u, /\bRotateCw\b/u],
    ['P4', 'components/codice/TalosCodiceR4ComandiSheet.vue', /icona: Play, diSessione: true/u, null],
    ['P5', 'components/codice/TalosCodiceR4ComandiSheet.vue', /icona: FoldVertical/u, /\bShrink\b/u],
    ['P5', 'components/codice/TalosCodiceR4Header.vue', /<FoldVertical /u, /\bShrink\b/u],
    ['P6', 'components/codice/TalosCodiceR4Header.vue', /<SquareSlash /u, /\bCommand\b/u],
    ['P7', 'components/chat/TalosMobileComposerDrawer.vue', /\{ id: 'agent', icon: Bot,/u, null],
    ['P7', 'components/codice/TalosCodiceR4HookSheet.vue', /<Webhook /u, /\bZap\b/u],
    ['P8', 'components/chat/TalosMobileComposerDrawer.vue', /testId: 'talos-drawer-context', icon: Library,/u, null],
    ['P8', 'components/shell/TalosMobileSidebar.vue', /key: 'navigation\.library', icon: Library/u, /\bBookOpen\b/u],
    ['P8', 'lib/tools/toolIcons.ts', /library: Library,/u, null],
    ['P9', 'lib/tools/toolIcons.ts', /memory: BookMarked,/u, /\bSparkles\b/u],
    ['P10', 'lib/tools/toolIcons.ts', /note: StickyNote,/u, /\bNotebookPen\b/u],
    ['P11', 'components/shell/TalosMobileSidebar.vue', /key: 'navigation\.tasks', icon: ListTodo/u, /\bCheckSquare\b/u],
    ['P12', 'components/shell/TalosMobileSidebar.vue', /key: 'navigation\.research', icon: Telescope/u, /\bFlaskConical\b/u],
    ['P13', 'components/chat/TalosMobileComposerDrawer.vue', /testId: 'talos-drawer-model-lab', icon: Cpu,/u, /\bFlaskConical\b/u],
    ['P13', 'components/shell/TalosGlobalSearchDialog.vue', /models: Cpu,/u, null],
    ['P14', 'components/chat/TalosMobileComposerDrawer.vue', /testId: 'talos-drawer-preset-analyze', icon: FileSearch,/u, null],
    ['P15', 'components/chat/TalosMobileComposerDrawer.vue', /\{ id: 'create', icon: FilePlus,/u, null],
    ['P16', 'screens/ChatScreen.vue', /<Ghost /u, /\bEyeOff\b/u],
    ['P16', 'components/shell/TalosMobileChatOptionsMenu.vue', /<Ghost /u, /\bEyeOff\b/u],
    ['P17', 'components/chat/TalosMobilePlanSheet.vue', /<ClipboardList/u, /\bListChecks\b/u],
    ['P18', 'components/chat/TalosMobileComposer.vue', /<ShieldQuestionMark /u, /\bShieldAlert\b/u],
    ['P18', 'components/codice/TalosCodiceR4Approvazione.vue', /<ShieldQuestionMark /u, /\bShieldAlert\b/u],
    ['P19', 'components/chat/TalosMobileMessageList.vue', /<CircleCheck /u, /\bCheckCheck\b/u],
    ['P20', 'components/codice/TalosCodiceR4Processi.vue', /python: FileCode, docker: Container, test: TestTubeDiagonal, build: Hammer/u, /\bLayoutGrid\b/u],
    ['P20', 'components/codice/TalosCodiceR4Processi.vue', /'in-corso': LoaderCircle/u, /'in-corso': Zap/u],
    ['P21', 'components/chat/TalosMobileStatoChat.vue', /'in-coda': ListEnd/u, /\bHourglass\b/u],
    ['P22', 'components/codice/TalosCodiceR4Header.vue', /<EllipsisVertical /u, /\bMoreHorizontal\b/u],
    ['P24', 'components/shell/TalosMobileDownloadCenterTrigger.vue', /<CircleX /u, /\bTrash2\b/u],
    ['P25', 'components/chat/TalosMobileChatMediaPanel.vue', /<Globe v-if/u, /size-2\.5|\bGlobe2\b/u],
    ['P27', 'components/codice/TalosCodiceR4Viste.vue', /icona: MessageSquareText/u, null],
    ['P28', 'lib/tools/toolIcons.ts', /audio: Music,/u, null],
]

describe('ICONE-SCELTE le icone scelte dall\'owner il 28/10/2026', () => {
    it.each(SCELTE)('%s in %s', (_p, file, deve, nonPiu) => {
        const s = sorgente(file)
        expect(s).toMatch(deve)
        if (nonPiu) expect(s).not.toMatch(nonPiu)
    })

    it('ICONE-SCELTE-NOTA le due voci della Libreria nel foglio «+» hanno due disegni diversi (nota del Desktop)', () => {
        const s = sorgente('components/chat/TalosMobileComposerDrawer.vue')
        expect(s).toMatch(/testId: 'talos-drawer-context', icon: Library,/u)
        expect(s).toMatch(/testId: 'talos-drawer-library-turn', icon: BookOpenCheck,/u)
    })

    it('ICONE-SCELTE-P20 la riga di un processo in corso ha la rotella che gira', () => {
        expect(sorgente('components/codice/TalosCodiceR4Processi.vue')).toContain(`:class="{ 'animate-spin': p.stato === 'in-corso' }"`)
    })
})
