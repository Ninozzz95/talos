import { createApp } from 'vue'
import './mockup.css'
import { createTalosI18n } from '@/i18n'
import { applyTalosTheme } from '@/stores/theme'
import { TALOS_DEFAULT_THEME } from '@/lib/talosThemes'
import MockupN15 from './MockupN15.vue'

// Il tema vero dell'app (quello di serie), chiaro o scuro dall'indirizzo: ?tema=dark|light.
const parametri = new URLSearchParams(location.search)
applyTalosTheme(TALOS_DEFAULT_THEME, parametri.get('tema') === 'light' ? 'light' : 'dark')

const i18n = await createTalosI18n()
createApp(MockupN15).use(i18n).mount('#app')
