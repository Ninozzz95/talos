import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
    appId: 'ai.talos',
    appName: 'TALOS',
    webDir: 'dist',
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
