import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(relative: string): string {
    return readFileSync(resolve(process.cwd(), relative), 'utf8')
}

describe('Android TALOS run service contract', () => {
    it('implements Android 15 timeout stop and typed cancel status through the Capacitor plugin', () => {
        const service = source('android/app/src/main/java/ai/talos/TalosRunService.java')
        const plugin = source('android/app/src/main/java/ai/talos/TalosRunServicePlugin.java')
        const manifest = source('android/app/src/main/AndroidManifest.xml')

        expect(manifest).toContain('android:name="ai.talos.TalosRunService"')
        expect(manifest).toContain('android:foregroundServiceType="dataSync"')
        expect(manifest).toContain('android.permission.FOREGROUND_SERVICE_DATA_SYNC')

        expect(service).toContain('static final String ACTION_CANCEL')
        expect(service).toContain('PendingIntent.getService')
        expect(service).toContain('.addAction(')
        expect(service).toContain('"Cancel"')
        expect(service).toContain('.setShowsUserInterface(false)')
        expect(service).not.toContain('SEMANTIC_ACTION_STOP')
        expect(service).toContain('public void onTimeout(int startId, int fgsType)')
        expect(service).toContain('recordState(this, runId, STATUS_TIMED_OUT)')
        expect(service).toContain('stopForeground(STOP_FOREGROUND_REMOVE)')
        expect(service).toContain('stopSelf(startId)')
        expect(service).toContain('STATUS_CANCELLED')

        expect(plugin).toContain('@PluginMethod')
        expect(plugin).toContain('public void status(PluginCall call)')
        expect(plugin).toContain('notifyListeners("stateChanged"')
        expect(plugin).toContain('ContextCompat.RECEIVER_NOT_EXPORTED')
        expect(plugin).toContain('TALOS_RUN_SERVICE_STATE_INVALID')
    })
})
