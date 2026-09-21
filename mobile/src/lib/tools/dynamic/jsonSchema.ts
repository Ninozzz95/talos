import type { JsonSchemaSubset } from './contracts'

export function validateJsonSchemaValue(schema: JsonSchemaSubset | undefined, value: unknown, path = '$'): string[] {
    if (!schema) return []
    const errors: string[] = []
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
    if (schema.type) {
        const ok = schema.type === 'integer'
            ? typeof value === 'number' && Number.isInteger(value)
            : type === schema.type
        if (!ok) return [`${path}: expected ${schema.type}, got ${type}`]
    }
    if (schema.enum && !schema.enum.some((entry) => JSON.stringify(entry) === JSON.stringify(value))) {
        errors.push(`${path}: value is not in enum`)
    }
    if (typeof value === 'string') {
        if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than minLength`)
        if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than maxLength`)
    }
    if (typeof value === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`)
        if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`)
    }
    if (Array.isArray(value) && schema.items) {
        value.forEach((entry, index) => errors.push(...validateJsonSchemaValue(schema.items, entry, `${path}[${index}]`)))
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
        const record = value as Record<string, unknown>
        for (const required of schema.required ?? []) {
            if (!(required in record)) errors.push(`${path}.${required}: required`)
        }
        for (const [key, entry] of Object.entries(record)) {
            const child = schema.properties[key]
            if (child) errors.push(...validateJsonSchemaValue(child, entry, `${path}.${key}`))
            else if (schema.additionalProperties === false) errors.push(`${path}.${key}: additional property not allowed`)
        }
    }
    return errors
}
