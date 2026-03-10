import { describe, it, expect } from 'vitest';
import { detectEnvironment, environmentFromURL } from './detect-environment';

describe('detectEnvironment', () => {
  it('respects config override when not default', () => {
    expect(detectEnvironment('production', 'https://dev.mysite.com')).toBe('production');
  });

  it('detects from baseURL when config is default', () => {
    expect(detectEnvironment('default', 'https://staging.mysite.com')).toBe('staging');
  });

  it('returns default when no baseURL and config is default', () => {
    expect(detectEnvironment('default', undefined)).toBe('default');
  });
});

describe('environmentFromURL', () => {
  it('detects localhost as local', () => {
    expect(environmentFromURL('http://localhost:3000')).toBe('local');
  });

  it('detects 127.0.0.1 as local', () => {
    expect(environmentFromURL('http://127.0.0.1:8080')).toBe('local');
  });

  it('detects 0.0.0.0 as local', () => {
    expect(environmentFromURL('http://0.0.0.0:3000')).toBe('local');
  });

  it('detects dev subdomain', () => {
    expect(environmentFromURL('https://dev.mysite.com')).toBe('dev');
  });

  it('detects development subdomain', () => {
    expect(environmentFromURL('https://development.mysite.com')).toBe('development');
  });

  it('detects staging subdomain', () => {
    expect(environmentFromURL('https://staging.mysite.com')).toBe('staging');
  });

  it('detects stg subdomain as staging', () => {
    expect(environmentFromURL('https://stg.mysite.com')).toBe('staging');
  });

  it('detects stage subdomain as staging', () => {
    expect(environmentFromURL('https://stage.mysite.com')).toBe('staging');
  });

  it('detects qa subdomain', () => {
    expect(environmentFromURL('https://qa.mysite.com')).toBe('qa');
  });

  it('detects uat subdomain', () => {
    expect(environmentFromURL('https://uat.mysite.com')).toBe('uat');
  });

  it('detects preprod subdomain', () => {
    expect(environmentFromURL('https://preprod.mysite.com')).toBe('preprod');
  });

  it('detects prod subdomain as production', () => {
    expect(environmentFromURL('https://prod.mysite.com')).toBe('production');
  });

  it('returns full URL for unrecognized patterns', () => {
    expect(environmentFromURL('https://mysite.com')).toBe('https://mysite.com');
  });

  it('returns full URL for unknown subdomains', () => {
    expect(environmentFromURL('https://app.mysite.com')).toBe('https://app.mysite.com');
  });

  it('returns default for invalid URL', () => {
    expect(environmentFromURL('not-a-url')).toBe('default');
  });
});
