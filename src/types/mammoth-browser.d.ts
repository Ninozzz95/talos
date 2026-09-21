declare module 'mammoth/mammoth.browser.js' {
    interface MammothBrowserResult {
        value: string
        messages: readonly {
            type: 'warning' | 'error'
            message: string
            error?: unknown
        }[]
    }

    const mammoth: {
        extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothBrowserResult>
    }

    export default mammoth
}
