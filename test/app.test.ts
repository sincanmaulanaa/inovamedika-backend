import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'

describe('HTTP application foundation', () => {
  it('reports liveness without calling the database readiness check', async () => {
    const readinessCheck = vi.fn(async (): Promise<void> => {
      throw new Error('Database should not be called')
    })
    const app = createApp({ readinessCheck })

    const response = await request(app)
      .get('/api/v1/health/live')
      .set('x-request-id', 'liveness-test')

    expect(response.status).toBe(200)
    expect(response.headers['x-request-id']).toBe('liveness-test')
    expect(response.headers['x-powered-by']).toBeUndefined()
    expect(response.body).toEqual({
      success: true,
      message: 'Layanan tersedia',
      data: { status: 'alive' },
    })
    expect(readinessCheck).not.toHaveBeenCalled()
  })

  it('reports readiness after dependencies pass their checks', async () => {
    const readinessCheck = vi.fn(async (): Promise<void> => undefined)
    const app = createApp({ readinessCheck })

    const response = await request(app).get('/api/v1/health/ready')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      message: 'Layanan siap digunakan',
      data: { status: 'ready' },
    })
    expect(readinessCheck).toHaveBeenCalledOnce()
  })

  it('returns the standard error contract when the service is not ready', async () => {
    const readinessCheck = vi.fn(async (): Promise<void> => {
      throw new Error('Database unavailable')
    })
    const app = createApp({ readinessCheck })

    const response = await request(app)
      .get('/api/v1/health/ready')
      .set('x-request-id', 'readiness-test')

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      success: false,
      message: 'Layanan belum siap digunakan. Coba lagi beberapa saat lagi.',
      code: 'SERVICE_NOT_READY',
      requestId: 'readiness-test',
    })
  })

  it('returns the standard error contract for an unknown route', async () => {
    const app = createApp({ readinessCheck: async () => undefined })

    const response = await request(app).get('/api/v1/unknown').set('x-request-id', 'not-found-test')

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      success: false,
      message: 'Layanan yang diminta tidak ditemukan. Periksa kembali alamat yang digunakan.',
      code: 'ROUTE_NOT_FOUND',
      requestId: 'not-found-test',
    })
  })

  it('returns a client error for malformed JSON', async () => {
    const app = createApp({ readinessCheck: async () => undefined })

    const response = await request(app)
      .post('/api/v1/unknown')
      .set('content-type', 'application/json')
      .set('x-request-id', 'invalid-json-test')
      .send('{"invalid"')

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      message: 'Data belum dapat dikirim. Muat ulang halaman lalu coba lagi.',
      code: 'INVALID_JSON',
      requestId: 'invalid-json-test',
    })
  })

  it('enforces the 100kb JSON request limit', async () => {
    const app = createApp({ readinessCheck: async () => undefined })

    const response = await request(app)
      .post('/api/v1/unknown')
      .set('x-request-id', 'large-payload-test')
      .send({ content: 'x'.repeat(102_400) })

    expect(response.status).toBe(413)
    expect(response.body).toEqual({
      success: false,
      message: 'Data yang dikirim terlalu besar. Kurangi ukuran data lalu coba lagi.',
      code: 'PAYLOAD_TOO_LARGE',
      requestId: 'large-payload-test',
    })
  })

  it('rejects browser origins outside the configured allowlist', async () => {
    const app = createApp({
      allowedOrigins: ['https://clinic.example.com'],
      readinessCheck: async () => undefined,
    })

    const response = await request(app)
      .get('/api/v1/health/live')
      .set('origin', 'https://attacker.example.com')
      .set('x-request-id', 'cors-test')

    expect(response.status).toBe(403)
    expect(response.headers['access-control-allow-origin']).toBeUndefined()
    expect(response.body).toEqual({
      success: false,
      message: 'Situs ini tidak diizinkan mengakses layanan.',
      code: 'CORS_ORIGIN_NOT_ALLOWED',
      requestId: 'cors-test',
    })
  })
})
