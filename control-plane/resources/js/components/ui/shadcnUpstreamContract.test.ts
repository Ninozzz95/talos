// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import Button from './button/Button.vue'
import DialogRoot from './dialog/Dialog.vue'
import DialogContent from './dialog/DialogContent.vue'
import DialogDescription from './dialog/DialogDescription.vue'
import DialogTitle from './dialog/DialogTitle.vue'
import DialogTrigger from './dialog/DialogTrigger.vue'
import AlertDialogRoot from './alert-dialog/AlertDialog.vue'
import AlertDialogContent from './alert-dialog/AlertDialogContent.vue'
import AlertDialogAction from './alert-dialog/AlertDialogAction.vue'
import AlertDialogCancel from './alert-dialog/AlertDialogCancel.vue'
import AlertDialogDescription from './alert-dialog/AlertDialogDescription.vue'
import AlertDialogTitle from './alert-dialog/AlertDialogTitle.vue'
import AlertDialogTrigger from './alert-dialog/AlertDialogTrigger.vue'
import CollapsibleRoot from './collapsible/Collapsible.vue'
import CollapsibleContent from './collapsible/CollapsibleContent.vue'
import CollapsibleTrigger from './collapsible/CollapsibleTrigger.vue'
import PopoverRoot from './popover/Popover.vue'
import PopoverContent from './popover/PopoverContent.vue'
import PopoverTrigger from './popover/PopoverTrigger.vue'
import TooltipRoot from './tooltip/Tooltip.vue'
import TooltipContent from './tooltip/TooltipContent.vue'
import TooltipProvider from './tooltip/TooltipProvider.vue'
import TooltipTrigger from './tooltip/TooltipTrigger.vue'

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

describe('shadcn-vue upstream primitive contract', () => {
    it('imports and renders reka-backed Dialog, AlertDialog, Collapsible, and Button primitives', async () => {
        for (const primitive of [
            Button,
            DialogRoot,
            DialogContent,
            DialogDescription,
            DialogTitle,
            DialogTrigger,
            AlertDialogRoot,
            AlertDialogAction,
            AlertDialogCancel,
            AlertDialogContent,
            AlertDialogDescription,
            AlertDialogTitle,
            AlertDialogTrigger,
            CollapsibleRoot,
            CollapsibleContent,
            CollapsibleTrigger,
            PopoverRoot,
            PopoverContent,
            PopoverTrigger,
            TooltipRoot,
            TooltipContent,
            TooltipProvider,
            TooltipTrigger,
        ]) {
            expect(primitive).toBeDefined()
        }

        const shell = document.createElement('div')
        shell.className = 'talos-shell talos-ui-motion-disabled'
        const portalRoot = document.createElement('div')
        portalRoot.id = 'talos-portal-root'
        portalRoot.className = 'talos-portal-root'
        const mountPoint = document.createElement('div')
        shell.append(portalRoot, mountPoint)
        document.body.append(shell)

        app = createApp(defineComponent({
            setup() {
                    return () => h('main', [
                    h(Button, { variant: 'default' }, { default: () => 'Run' }),
                    h(DialogRoot, { open: true }, {
                        default: () => [
                            h(DialogTrigger, {}, { default: () => 'Open evidence' }),
                            h(DialogContent, {
                                to: '#talos-portal-root',
                                'aria-label': 'Browser evidence viewer',
                            }, {
                                default: () => [
                                    h(DialogTitle, {}, { default: () => 'Evidence' }),
                                    h(DialogDescription, {}, { default: () => 'Current browser frame' }),
                                ],
                            }),
                        ],
                    }),
                    h(AlertDialogRoot, { open: true }, {
                        default: () => [
                            h(AlertDialogTrigger, {}, { default: () => 'Confirm action' }),
                            h(AlertDialogContent, { to: '#talos-portal-root' }, {
                                default: () => [
                                    h(AlertDialogTitle, {}, { default: () => 'Confirm' }),
                                    h(AlertDialogDescription, {}, { default: () => 'This action is consequential.' }),
                                    h(AlertDialogCancel, {}, { default: () => 'Cancel' }),
                                    h(AlertDialogAction, {}, { default: () => 'Confirm' }),
                                ],
                            }),
                        ],
                    }),
                    h(CollapsibleRoot, { open: true }, {
                        default: () => [
                            h(CollapsibleTrigger, {}, { default: () => 'Raw evidence' }),
                            h(CollapsibleContent, {}, { default: () => 'Untrusted browser evidence' }),
                        ],
                    }),
                ])
            },
        }))

        app.mount(mountPoint)
        await nextTick()

        expect(shell.querySelector('[data-state="open"]')).not.toBeNull()
        const dialog = document.body.querySelector('[role="dialog"]')
        const alertDialog = document.body.querySelector('[role="alertdialog"]')
        expect(dialog).not.toBeNull()
        expect(alertDialog).not.toBeNull()
        expect(dialog?.parentElement).toBe(portalRoot)
        expect(alertDialog?.parentElement).toBe(portalRoot)
        expect(dialog?.getAttribute('aria-label')).toBe('Browser evidence viewer')
        expect(dialog?.closest('.talos-ui-motion-disabled')).toBe(shell)
        expect(alertDialog?.closest('.talos-ui-motion-disabled')).toBe(shell)
        expect(mountPoint.querySelector('button')?.className).toContain('bg-primary')
        expect(shell.textContent).toContain('Untrusted browser evidence')
    })

    it('ports Popover and Tooltip content into the TALOS theme boundary', async () => {
        const shell = document.createElement('div')
        shell.className = 'talos-shell talos-ui-motion-disabled'
        const portalRoot = document.createElement('div')
        portalRoot.id = 'talos-portal-root'
        portalRoot.className = 'talos-portal-root'
        const mountPoint = document.createElement('div')
        shell.append(portalRoot, mountPoint)
        document.body.append(shell)

        app = createApp(defineComponent({
            setup() {
                return () => h('main', [
                    h(PopoverRoot, { open: true }, {
                        default: () => [
                            h(PopoverTrigger, {}, { default: () => 'Runtime information' }),
                            h(PopoverContent, { to: '#talos-portal-root' }, {
                                default: () => 'Inspect runs, replay and recovery evidence.',
                            }),
                        ],
                    }),
                    h(TooltipProvider, { delayDuration: 0 }, {
                        default: () => h(TooltipRoot, { open: true }, {
                            default: () => [
                                h(TooltipTrigger, {}, { default: () => 'Information' }),
                                h(TooltipContent, { to: '#talos-portal-root' }, { default: () => 'Open contextual help' }),
                            ],
                        }),
                    }),
                ])
            },
        }))

        app.mount(mountPoint)
        await nextTick()
        await nextTick()

        expect(portalRoot.textContent).toContain('Inspect runs, replay and recovery evidence.')
        expect(portalRoot.textContent).toContain('Open contextual help')
        expect(portalRoot.querySelector('[data-reka-popper-content-wrapper]')).not.toBeNull()
    })

    it('closes a controlled AlertDialog through Cancel and emits its open update', async () => {
        const open = ref(true)
        const shell = document.createElement('div')
        shell.className = 'talos-shell'
        const portalRoot = document.createElement('div')
        portalRoot.id = 'talos-portal-root'
        const mountPoint = document.createElement('div')
        shell.append(portalRoot, mountPoint)
        document.body.append(shell)

        app = createApp(defineComponent({
            setup() {
                return () => h(AlertDialogRoot, {
                    open: open.value,
                    'onUpdate:open': (value: boolean) => { open.value = value },
                }, {
                    default: () => h(AlertDialogContent, { to: '#talos-portal-root' }, {
                        default: () => [
                            h(AlertDialogTitle, {}, { default: () => 'Confirm' }),
                            h(AlertDialogDescription, {}, { default: () => 'Confirm this action.' }),
                            h(AlertDialogCancel, {}, { default: () => 'Cancel' }),
                        ],
                    }),
                })
            },
        }))

        app.mount(mountPoint)
        await nextTick()
        const cancel = portalRoot.querySelector('button')
        expect(cancel).not.toBeNull()
        cancel?.click()
        await nextTick()

        expect(open.value).toBe(false)
        expect(document.body.querySelector('[role="alertdialog"][data-state="closed"]')).not.toBeNull()
    })

    it('closes a controlled AlertDialog through Action and emits its open update', async () => {
        const open = ref(true)
        const shell = document.createElement('div')
        shell.className = 'talos-shell'
        const portalRoot = document.createElement('div')
        portalRoot.id = 'talos-portal-root'
        const mountPoint = document.createElement('div')
        shell.append(portalRoot, mountPoint)
        document.body.append(shell)

        app = createApp(defineComponent({
            setup() {
                return () => h(AlertDialogRoot, {
                    open: open.value,
                    'onUpdate:open': (value: boolean) => { open.value = value },
                }, {
                    default: () => h(AlertDialogContent, { to: '#talos-portal-root' }, {
                        default: () => [
                            h(AlertDialogTitle, {}, { default: () => 'Confirm' }),
                            h(AlertDialogDescription, {}, { default: () => 'Confirm this action.' }),
                            h(AlertDialogAction, {}, { default: () => 'Confirm' }),
                        ],
                    }),
                })
            },
        }))

        app.mount(mountPoint)
        await nextTick()
        const action = portalRoot.querySelector('button')
        expect(action).not.toBeNull()
        action?.click()
        await nextTick()

        expect(open.value).toBe(false)
        expect(document.body.querySelector('[role="alertdialog"][data-state="closed"]')).not.toBeNull()
    })

    it('ships the reka-backed dropdown-menu wrapper set introduced by v7 R0', async () => {
        const parts = await import('./dropdown-menu/index.js')
        for (const name of [
            'DropdownMenu',
            'DropdownMenuTrigger',
            'DropdownMenuContent',
            'DropdownMenuItem',
            'DropdownMenuLabel',
            'DropdownMenuSeparator',
            'DropdownMenuGroup',
        ]) {
            expect(parts[name], `${name} must be exported from ui/dropdown-menu`).toBeTruthy()
        }
    })
})
