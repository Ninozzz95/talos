import { z, type ZodTypeAny } from 'zod'
import type { JsonSchemaSubset } from './contracts'

export function zodFromJsonSchemaSubset(schema?: JsonSchemaSubset): ZodTypeAny {
    if (!schema) return z.unknown()
    let base: ZodTypeAny
    switch (schema.type) {
        case 'string': {
            let value = z.string()
            if (schema.minLength !== undefined) value = value.min(schema.minLength)
            if (schema.maxLength !== undefined) value = value.max(schema.maxLength)
            base = value; break
        }
        case 'number': {
            let value = z.number()
            if (schema.minimum !== undefined) value = value.min(schema.minimum)
            if (schema.maximum !== undefined) value = value.max(schema.maximum)
            base = value; break
        }
        case 'integer': {
            let value = z.number().int()
            if (schema.minimum !== undefined) value = value.min(schema.minimum)
            if (schema.maximum !== undefined) value = value.max(schema.maximum)
            base = value; break
        }
        case 'boolean': base = z.boolean(); break
        case 'null': base = z.null(); break
        case 'array': base = z.array(zodFromJsonSchemaSubset(schema.items)); break
        case 'object': {
            const required = new Set(schema.required ?? [])
            const shape: Record<string, ZodTypeAny> = {}
            for (const [key, child] of Object.entries(schema.properties ?? {})) {
                const value = zodFromJsonSchemaSubset(child)
                shape[key] = required.has(key) ? value : value.optional()
            }
            const object = z.object(shape)
            base = schema.additionalProperties === false ? object.strict() : object.passthrough()
            break
        }
        default: base = z.unknown()
    }
    if (schema.enum && schema.enum.length > 0) {
        // Generic enum fallback: preserve exact values with a refinement because
        // the subset also permits numeric/boolean enum members.
        const allowed = schema.enum.map((entry) => JSON.stringify(entry))
        base = base.refine((value) => allowed.includes(JSON.stringify(value)), 'value not in enum')
    }
    return base
}
