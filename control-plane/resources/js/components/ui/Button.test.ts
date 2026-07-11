// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import Button from './Button.vue'

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountForm(buttonType?: 'button' | 'submit' | 'reset') {
    const submitCount = ref(0)
    const container = document.createElement('div')
    document.body.append(container)

    const app = createApp(defineComponent({
        setup() {
            return () => h('form', {
                onSubmit: (event: SubmitEvent) => {
                    event.preventDefault()
                    submitCount.value += 1
                },
            }, [
                h(Button, buttonType ? { type: buttonType } : {}, {
                    default: () => 'Form action',
                }),
            ])
        },
    }))

    mounted.push(app)
    app.mount(container)

    return {
        button: container.querySelector('button') as HTMLButtonElement,
        submitCount,
    }
}

function mountButton(props: Record<string, unknown>) {
    const clickCount = ref(0)
    const container = document.createElement('div')
    document.body.append(container)
    const app = createApp(defineComponent({
        setup() {
            return () => h(Button, {
                ...props,
                onClick: () => {
                    clickCount.value += 1
                },
            }, { default: () => 'Action' })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return {
        button: container.querySelector('button') as HTMLButtonElement,
        clickCount,
    }
}

describe('Button', () => {
    it('defaults to a non-submitting button inside forms', async () => {
        const { button, submitCount } = mountForm()

        expect(button.type).toBe('button')
        button.click()
        await nextTick()

        expect(submitCount.value).toBe(0)
    })

    it('preserves an explicit submit type', async () => {
        const { button, submitCount } = mountForm('submit')

        expect(button.type).toBe('submit')
        button.click()
        await nextTick()

        expect(submitCount.value).toBe(1)
    })

    it('makes loading actions busy and non-interactive', async () => {
        const { button, clickCount } = mountButton({ loading: true })

        expect(button.disabled).toBe(true)
        expect(button.getAttribute('aria-busy')).toBe('true')
        expect(button.classList.contains('talos-motion-control')).toBe(true)
        button.click()
        await nextTick()

        expect(clickCount.value).toBe(0)
    })

    it('preserves pressed state semantics', () => {
        const { button } = mountButton({ 'aria-pressed': true })

        expect(button.getAttribute('aria-pressed')).toBe('true')
    })
})
