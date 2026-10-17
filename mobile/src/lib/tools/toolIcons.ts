import {
    BookMarked,
    Clock,
    AudioLines,
    Download,
    FileText,
    Flashlight,
    Globe,
    Image as ImageIcon,
    ListTodo,
    MapPin,
    Mail,
    NotebookPen,
    Smartphone,
    Sparkles,
    Play,
    Telescope,
    Volume2,
    Wrench,
} from '@lucide/vue'
import type { TalosToolIconName } from '@/lib/tools/toolLabels'

/**
 * The tool row's icon, in the user's words rather than the wire names. Moved here unchanged from
 * `TalosMobileStreamingReply.vue` (N13, 11/10/2026): the rows now live in the turn timeline, loaded on demand, not in the
 * streaming reply that the app loads at start.
 */
export const TALOS_TOOL_ICONS: Record<TalosToolIconName, unknown> = {
    library: BookMarked,
    note: NotebookPen,
    task: ListTodo,
    memory: Sparkles,
    clock: Clock,
    web: Globe,
    research: Telescope,
    // Il telefono ha i suoi segni: dargli quello del web o dei modelli direbbe
    // una cosa falsa su cosa sta succedendo.
    phone: Smartphone,
    place: MapPin,
    torch: Flashlight,
    volume: Volume2,
    // ⛔ Play e non un altoparlante: il volume ha gia' il suo segno, e due
    // strumenti diversi con lo stesso disegno raccontano la stessa cosa
    // mentre ne stanno facendo due.
    audio: Play,
    voice: AudioLines,
    document: FileText,
    // ⛔ La busta e non il foglio: contare la posta non è leggere un documento,
    // e due attrezzi con lo stesso disegno raccontano la stessa cosa mentre ne
    // stanno facendo due.
    mail: Mail,
    image: ImageIcon,
    download: Download,
    tool: Wrench,
}
