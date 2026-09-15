/**
 * pdfmake ships no types for its prebuilt browser bundle, and only the four
 * calls TALOS makes are declared here — a hand-written surface that names what
 * we rely on is worth more than a wide `any`, and it documents the two API
 * rules that matter:
 *
 *  - `addVirtualFileSystem`, never `vfs = ...`. Reassigning an ESM import is
 *    the most reported pdfmake failure and shows up only in production builds.
 *  - every output method returns a PROMISE in 0.3. Passing a callback is the
 *    documented way to get a hang that never resolves.
 */
declare module 'pdfmake/build/pdfmake.min.js' {
    interface TalosPdfMakeDocument {
        getBuffer(): Promise<Uint8Array>
    }

    interface TalosPdfMake {
        addVirtualFileSystem(vfs: Record<string, string>): void
        setFonts(fonts: Record<string, Record<string, string>>): void
        createPdf(definition: unknown): TalosPdfMakeDocument
    }

    const pdfMake: TalosPdfMake
    export default pdfMake
}
