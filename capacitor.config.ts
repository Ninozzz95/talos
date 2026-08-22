import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
    appId: 'ai.talos',
    appName: 'TALOS',
    webDir: 'dist',
    // Capacitor serializes complete plugin payloads at verbose level. Provider
    // keys and HTTP headers cross that bridge, so even debug builds fail closed.
    loggingBehavior: 'none',
    server: {
        androidScheme: 'https',
    },
    plugins: {
        CapacitorSQLite: {
            androidIsEncryption: true,
            androidBiometric: {
                biometricAuth: false,
                biometricTitle: 'Unlock TALOS',
                biometricSubTitle: 'Authenticate to access local TALOS data',
            },
        },
    },
}

export default config
