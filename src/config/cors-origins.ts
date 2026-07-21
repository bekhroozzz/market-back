const DEVELOPMENT_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

export function getAllowedOrigins(): string[] {
  const configuredOrigins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  if (process.env.NODE_ENV === 'production') {
    return configuredOrigins;
  }

  return [...new Set([...configuredOrigins, ...DEVELOPMENT_ORIGINS])];
}
