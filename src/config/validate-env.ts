const PRODUCTION_REQUIRED_VARIABLES = [
  'BASE_URL',
  'FRONTEND_URL',
  'DB_HOST',
  'POSTGRES_PORT',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'POSTGRES_DATABASE',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'OPENSEARCH_URL',
  'OPENSEARCH_USER',
  'OPENSEARCH_PASSWORD',
] as const;

function requireUrl(config: Record<string, unknown>, name: string): void {
  try {
    new URL(String(config[name]));
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }
}

function requireUrlList(config: Record<string, unknown>, name: string): void {
  const values = String(config[name])
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error(`${name} must contain at least one absolute URL`);
  }

  for (const value of values) {
    try {
      new URL(value);
    } catch {
      throw new Error(`${name} contains an invalid absolute URL: ${value}`);
    }
  }
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const isProduction = config.NODE_ENV === 'production';

  if (isProduction) {
    const missing = PRODUCTION_REQUIRED_VARIABLES.filter(
      (name) => !String(config[name] ?? '').trim(),
    );

    if (missing.length > 0) {
      throw new Error(
        `Missing required production environment variables: ${missing.join(', ')}`,
      );
    }

    requireUrl(config, 'BASE_URL');
    requireUrlList(config, 'FRONTEND_URL');
    requireUrl(config, 'OPENSEARCH_URL');

    for (const secret of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (String(config[secret]).length < 32) {
        throw new Error(`${secret} must contain at least 32 characters`);
      }
    }
  }

  const port = Number(config.PORT ?? 4000);
  const postgresPort = Number(config.POSTGRES_PORT ?? 5432);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (
    !Number.isInteger(postgresPort) ||
    postgresPort < 1 ||
    postgresPort > 65535
  ) {
    throw new Error('POSTGRES_PORT must be an integer between 1 and 65535');
  }

  return {
    ...config,
    PORT: port,
    POSTGRES_PORT: postgresPort,
  };
}
