<script setup lang="ts">
import { ref } from 'vue'
import Card from '../../../ui/Card.vue'
import Input from '../../../ui/Input.vue'
import TalosAuditLog from '../../admin/TalosAuditLog.vue'
import TalosBackupPanel from '../../admin/TalosBackupPanel.vue'
import TalosDoctorPanel from '../../admin/TalosDoctorPanel.vue'
import TalosPolicyPanel from '../../admin/TalosPolicyPanel.vue'
import TalosShellPolicyPanel from '../../admin/TalosShellPolicyPanel.vue'
import type { TalosWindowModuleContext } from '../../../../lib/talosWindowModuleContext'

defineProps<{ context: TalosWindowModuleContext }>()
const adminToken = ref('')
</script>

<template>
    <Card>
        <div class="text-xs font-semibold uppercase text-[var(--talos-muted)]">Admin token</div>
        <Input v-model="adminToken" type="password" class="mt-2" placeholder="X-Talos-Api-Token" aria-label="TALOS admin API token" />
    </Card>
    <section v-show="context.activeSection === 'doctor'" :id="`talos-window-section-panel-${context.id}-doctor`" :aria-labelledby="`talos-window-section-tab-${context.id}-doctor`" role="tabpanel" data-testid="talos-window-section-doctor-doctor"><section data-testid="talos-admin-section-doctor" tabindex="-1" class="outline-none"><TalosDoctorPanel :token="adminToken" /></section></section>
    <section v-show="context.activeSection === 'policy'" :id="`talos-window-section-panel-${context.id}-policy`" :aria-labelledby="`talos-window-section-tab-${context.id}-policy`" role="tabpanel" data-testid="talos-window-section-doctor-policy"><section data-testid="talos-admin-section-policy" tabindex="-1" class="outline-none"><TalosPolicyPanel :token="adminToken" /></section></section>
    <section v-show="context.activeSection === 'shell'" :id="`talos-window-section-panel-${context.id}-shell`" :aria-labelledby="`talos-window-section-tab-${context.id}-shell`" role="tabpanel" data-testid="talos-window-section-doctor-shell"><section data-testid="talos-admin-section-shell" tabindex="-1" class="outline-none"><TalosShellPolicyPanel :token="adminToken" /></section></section>
    <section v-show="context.activeSection === 'backup'" :id="`talos-window-section-panel-${context.id}-backup`" :aria-labelledby="`talos-window-section-tab-${context.id}-backup`" role="tabpanel" data-testid="talos-window-section-doctor-backup"><section data-testid="talos-admin-section-backup" tabindex="-1" class="outline-none"><TalosBackupPanel :token="adminToken" /></section></section>
    <section v-show="context.activeSection === 'audit'" :id="`talos-window-section-panel-${context.id}-audit`" :aria-labelledby="`talos-window-section-tab-${context.id}-audit`" role="tabpanel" data-testid="talos-window-section-doctor-audit"><section data-testid="talos-admin-section-audit" tabindex="-1" class="outline-none"><TalosAuditLog :token="adminToken" /></section></section>
</template>
