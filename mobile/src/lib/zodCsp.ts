import { config } from 'zod/v4'
export * from 'zod/v4'
export { default } from 'zod/v4'

// Configure before schemas are constructed, without moving lazy schemas into
// the startup bundle. Even the eval capability probe violates the strict CSP.
config({ jitless: true })
