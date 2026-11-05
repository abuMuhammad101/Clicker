import { describe, expect, it } from 'vitest'
import { loginUrl, safeNext } from './redirects'

describe('safeNext', () => {
  it('keeps a same-site path, with its query', () => {
    for (const ok of ['/', '/clearance/job/7', '/clearance/job?view=module%3Aby_stage&filter=state%3Ain%3Abooked', '/billing/bill/12?peek=x']) {
      expect(safeNext(ok)).toBe(ok)
    }
  })

  it('sends everything that could leave the site, or look like it could, Home', () => {
    const evil = [
      '//evil.com', 'https://evil.com/x', 'http://evil.com', 'javascript:alert(1)', '/\\evil.com', '/\t/evil.com',
      '/%2f/evil.com', '/%2F%2Fevil.com', '/%5cevil.com', 'evil.com', '', null, '/login', '/login?next=/', '\n//evil.com',
      'data:text/html,x', '/%09/evil.com', '/\n/evil.com', '/\u0000/evil.com',
    ]
    for (const raw of evil) expect(safeNext(raw), String(raw)).toBe('/')
  })

  it('builds a login address that carries where you were', () => {
    expect(loginUrl('/')).toBe('/login')
    expect(loginUrl('/clearance/job?x=1')).toBe('/login?next=%2Fclearance%2Fjob%3Fx%3D1')
  })
})
