import { createApp } from 'vue'
import TalosWorkspace from './components/talos/workspace/TalosWorkspace.vue'
import './lib/api'
import './lib/commandRegistry'
import './lib/statusCopy'
import './lib/statusTone'

const workspaceRoot = document.getElementById('talos-workspace-root')

if (workspaceRoot) {
    createApp(TalosWorkspace, {
        initialSurface: workspaceRoot.dataset.talosSurface ?? 'workspace',
        authenticated: workspaceRoot.dataset.authenticated === 'true',
        authUserName: workspaceRoot.dataset.authUserName ?? '',
        loginUrl: workspaceRoot.dataset.loginUrl ?? '/login',
        logoutUrl: workspaceRoot.dataset.logoutUrl ?? '/logout',
        csrfToken: workspaceRoot.dataset.csrfToken ?? '',
    }).mount(workspaceRoot)
}
