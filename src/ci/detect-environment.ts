/**
 * Detect environment from a base URL hostname.
 * Priority: config override → baseURL detection → 'default'.
 */
export function detectEnvironment(
  configEnvironment: string,
  baseURL: string | undefined,
): string {
  // User explicitly set environment — respect it
  if (configEnvironment !== 'default') return configEnvironment;

  if (!baseURL) return 'default';

  return environmentFromURL(baseURL);
}

export function environmentFromURL(url: string): string {
  try {
    const { hostname } = new URL(url);

    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
      return 'local';
    }

    // Check first subdomain: dev.mysite.com → "dev"
    const parts = hostname.split('.');
    if (parts.length > 2) {
      const sub = parts[0].toLowerCase();
      const knownEnvs: Record<string, string> = {
        dev: 'dev',
        development: 'development',
        stg: 'staging',
        staging: 'staging',
        stage: 'staging',
        qa: 'qa',
        uat: 'uat',
        preprod: 'preprod',
        'pre-prod': 'preprod',
        prod: 'production',
        production: 'production',
      };
      if (knownEnvs[sub]) return knownEnvs[sub];
    }

    // No recognizable pattern — show the URL itself so user sees what was tested
    return url;
  } catch {
    return 'default';
  }
}
