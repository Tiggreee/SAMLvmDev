export function getRelayStateRedirect(relayState?: string, expectedRelayState?: string): string | null {
  if (expectedRelayState) {
    return relayState === expectedRelayState ? '/dashboard' : null;
  }

  const path = typeof relayState === 'string'
    ? Buffer.from(relayState, 'base64').toString('utf-8')
    : '';
  if (!path.startsWith('/')) {
    return '/dashboard';
  }

  const target = new URL(path, 'https://saml.invalid');
  return target.origin === 'https://saml.invalid'
    ? `${target.pathname}${target.search}${target.hash}`
    : '/dashboard';
}