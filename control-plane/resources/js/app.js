import '@fontsource/orbitron/600.css'
import '@fontsource/instrument-sans/latin-400.css'
import '@fontsource/instrument-sans/latin-500.css'
import '@fontsource/instrument-sans/latin-600.css'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-600.css'
import '@fontsource/sora/latin-400.css'
import '@fontsource/sora/latin-500.css'
import '@fontsource/sora/latin-600.css'
import '@fontsource/source-serif-4/latin-400.css'
import '@fontsource/source-serif-4/latin-600.css'
import 'vue-sonner/style.css'
import { createApp } from 'vue'
import TalosWorkspace from './components/talos/workspace/TalosWorkspace.vue'
import { failTalosBootLoader, scheduleTalosBootCompletion } from './lib/talosBootLoader'
import { parseTalosPublicLinks } from './lib/talosPublicLinks'
import './lib/api'
import './lib/commandRegistry'
import './lib/statusCopy'
import './lib/statusTone'

const workspaceRoot = document.getElementById('talos-workspace-root')

if (workspaceRoot) {
    try {
        createApp(TalosWorkspace, {
            initialSurface: workspaceRoot.dataset.talosSurface ?? 'workspace',
            authenticated: workspaceRoot.dataset.authenticated === 'true',
            authUserName: workspaceRoot.dataset.authUserName ?? '',
            loginUrl: workspaceRoot.dataset.loginUrl ?? '/login',
            logoutUrl: workspaceRoot.dataset.logoutUrl ?? '/logout',
            csrfToken: workspaceRoot.dataset.csrfToken ?? '',
            devBrowserEvidence: workspaceRoot.dataset.devBrowserEvidence === 'true',
            developmentMode: workspaceRoot.dataset.developmentMode === 'true',
            publicLinks: parseTalosPublicLinks({
                avmDeepDive: workspaceRoot.dataset.talosAvmDeepDiveUrl,
                patreon: workspaceRoot.dataset.talosPatreonUrl,
                kofi: workspaceRoot.dataset.talosKofiUrl,
            }),
        }).mount(workspaceRoot)

        scheduleTalosBootCompletion(workspaceRoot)
    } catch (error) {
        failTalosBootLoader(workspaceRoot)
        console.error('TALOS workspace failed to mount.', error)
    }
}
