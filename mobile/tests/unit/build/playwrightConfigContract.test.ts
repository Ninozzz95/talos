import { describe, expect, it } from 'vitest'
import config from '../../../playwright.config'

describe('mobile Playwright resource contract', () => {
    it('caps local browser workers and serializes CI', () => {
        expect(config.workers).toBe(process.env.CI ? 1 : 4)
    })
})
