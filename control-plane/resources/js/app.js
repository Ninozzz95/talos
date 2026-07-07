import { createApp } from 'vue'
import TalosShell from './components/TalosShell.vue'
import TalosChatPage from './components/TalosChatPage.vue'

const shellRoot = document.getElementById('talos-root')
const chatRoot = document.getElementById('talos-chat-root')

if (shellRoot) {
    createApp(TalosShell).mount(shellRoot)
}

if (chatRoot) {
    createApp(TalosChatPage).mount(chatRoot)
}
