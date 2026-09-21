import { describe, expect, it, vi } from 'vitest'
import { createTalosMobileHttpTransport } from '@/lib/chat/httpTransport'

describe('Talos mobile HTTP transport', () => {
    it('delegates one canonical request and preserves only response status data and headers', async () => {
        const request = vi.fn().mockResolvedValue({
            status: 200,
            data: { ok: true },
            headers: { 'x-request-id': 'req-1' },
            url: 'https://ignored.example',
        })
        const transport = createTalosMobileHttpTransport(request)

        await expect(transport.request({
            method: 'GET',
            url: 'https://api.example/models',
            headers: { authorization: 'Bearer sentinel-secret' },
        })).resolves.toEqual({
            status: 200,
            data: { ok: true },
            headers: { 'x-request-id': 'req-1' },
        })
        expect(request).toHaveBeenCalledOnce()
        expect(request.mock.calls[0][0]).toMatchObject({
            method: 'GET',
            url: 'https://api.example/models',
        })
    })

    it('normalizes non-Error transport failures without serializing request credentials', async () => {
        const request = vi.fn().mockRejectedValue({ authorization: 'sentinel-secret' })
        const transport = createTalosMobileHttpTransport(request)

        await expect(transport.request({
            method: 'GET',
            url: 'https://api.example/models',
            headers: { authorization: 'Bearer sentinel-secret' },
        })).rejects.toThrow('Network request failed')
    })
})
