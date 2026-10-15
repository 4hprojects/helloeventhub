export function evaluatePrimaryEventConfig(config, expectedSlug) {
  const configuredSlug = typeof config?.primaryEventSlug === 'string' ? config.primaryEventSlug.trim() : '';
  return {
    ok: configuredSlug === expectedSlug,
    configuredSlug,
    detail: configuredSlug || 'missing',
  };
}
