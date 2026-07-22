// Dictation mode is the one piece of the STT surface the always-mounted UI needs
// eagerly (the composer mic + the Settings selector). Keeping it in a dependency-free
// module lets the heavy engine machinery in ./talosDictation load lazily, so neither
// the server-whisper client nor the transformers.js runtime enters the initial chunk.

export type TalosDictationMode = 'local' | 'cloud' | 'auto'

export const TALOS_DICTATION_MODE_OPTIONS: Array<{ value: TalosDictationMode; label: string }> = [
    { value: 'local', label: 'On device (private)' },
    { value: 'cloud', label: 'Cloud (accurate)' },
    { value: 'auto', label: 'Automatic' },
]
