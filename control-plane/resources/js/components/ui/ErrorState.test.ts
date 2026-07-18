// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import ErrorState from './ErrorState.vue'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountError(props: Record<string, unknown>) {
    const retries = ref(0)
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(ErrorState, {
                ...props,
                onRetry: () => { retries.value += 1 },
            })
        },
    }))
    apps.push(app)
    app.mount(container)
    return { container, retries }
}

describe('ErrorState', () => {
    it('renders cause and remedy, emits retry, never renders api paths passed as correlation detail', () => {
        const { container, retries } = mountError({
            message: 'TALOS could not load the readiness report.',
            remedy: 'Check the connection and retry.',
            correlationId: 'run_9f2ac41',
        })

        const alert = container.querySelector('[role="alert"]')
        expect(alert).not.toBeNull()
        expect(alert?.textContent).toContain('TALOS could not load the readiness report.')
        expect(alert?.textContent).toContain('Check the connection and retry.')
        expect(alert?.textContent).toContain('run_9f2ac41')
        expect(alert?.textContent).not.toContain('/api/')

        const button = container.querySelector('button')
        expect(button?.textContent).toContain('Retry')
        button?.click()
        expect(retries.value).toBe(1)
    })

    it('uses a custom retry label and omits correlation when absent', () => {
        const { container } = mountError({
            message: 'The benchmark comparison failed.',
            retryLabel: 'Run again',
        })

        expect(container.querySelector('button')?.textContent).toContain('Run again')
        expect(container.querySelector('.talos-readout')).toBeNull()
    })
})
