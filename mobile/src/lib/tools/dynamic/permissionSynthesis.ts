import type { ForgeAction, ForgeCapabilityDescriptor, ForgeFlow, ForgeInlineNode, ForgeRisk } from './contracts'
import { maxRisk } from './capabilityCatalog'

export interface SynthesizedPolicy {
    actions: ForgeAction[]
    capabilities: string[]
    risk: ForgeRisk
    critical: boolean
    /** Vedi contracts.ts#ForgeValidationResult — ogni nodo di scrittura
     * raggiungibile ha una compensazione dichiarata e corretta. */
    allWritesCompensated: boolean
}

type ForgeCapabilityNode = { capability: string; compensation?: { capability: string } }

export function synthesizeForgePolicy(flow: ForgeFlow, describe: (id: string) => ForgeCapabilityDescriptor | null): SynthesizedPolicy {
    const actions = new Set<ForgeAction>()
    const capabilities = new Set<string>()
    let risk: ForgeRisk = 'R1'
    let critical = false
    let allWritesCompensated = true
    const add = (capability: string) => {
        const descriptor = describe(capability)
        if (!descriptor) return
        capabilities.add(capability)
        descriptor.actions.forEach((action) => actions.add(action))
        risk = maxRisk(risk, descriptor.risk)
        if (descriptor.risk === 'R4') critical = true
    }
    /**
     * ⛔ Owner 2026-08-27: una compensazione contava se la capability
     * dichiarata ESISTEVA — non se compensava DAVVERO questo nodo. Ora
     * conta solo se `compensatesFor` della compensazione coincide con la
     * capability primaria del nodo — vedi capabilityCatalog.ts.
     */
    const checkCompensation = (node: ForgeCapabilityNode) => {
        const descriptor = describe(node.capability)
        if (!descriptor?.actions.includes('write')) return
        const compensator = node.compensation ? describe(node.compensation.capability) : null
        if (!compensator || compensator.compensatesFor !== node.capability) allWritesCompensated = false
    }
    const scanInline = (node: ForgeInlineNode) => {
        if (node.type !== 'capability') return
        add(node.capability); checkCompensation(node)
    }
    for (const node of flow.nodes) {
        if (node.type === 'capability') { add(node.capability); checkCompensation(node) }
        if (node.type === 'foreach') node.body.forEach(scanInline)
    }
    return { actions: [...actions], capabilities: [...capabilities], risk, critical, allWritesCompensated }
}
