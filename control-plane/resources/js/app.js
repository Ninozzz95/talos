import { createApp } from 'vue'
import TalosShell from './components/TalosShell.vue'
import TalosChatPage from './components/TalosChatPage.vue'
import TalosCommandPalette from './components/talos/shell/TalosCommandPalette.vue'
import './lib/api'
import './lib/commandRegistry'
import './lib/statusCopy'
import './lib/statusTone'

void TalosCommandPalette

const shellRoot = document.getElementById('talos-root')
const chatRoot = document.getElementById('talos-chat-root')

if (shellRoot) {
    createApp(TalosShell).mount(shellRoot)
}

if (chatRoot) {
    createApp(TalosChatPage).mount(chatRoot)
}
