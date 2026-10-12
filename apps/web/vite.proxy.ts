export function resolveApiProxyTarget(env: Record<string, string | undefined>): string {
  const explicitTarget = env.API_PROXY_TARGET?.trim();
  if (explicitTarget) return explicitTarget;

  const apiPort = env.PORT?.trim() || '3000';
  return `http://localhost:${apiPort}`;
}
