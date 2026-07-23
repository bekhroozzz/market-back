import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';
import * as process from 'node:process';

config();

const isProduction = process.env.NODE_ENV === 'production';
const isSeeding = process.env.NODE_ENV === 'seeding';
const useSsl = process.env.DB_SSL === 'true';
// In a PM2 cluster the entrypoint runs migrations once before forking, then
// sets RUN_MIGRATIONS_ON_BOOT=false so workers don't race to migrate. Any
// single-instance run (no flag) keeps the previous auto-migrate behaviour.
const runMigrationsOnBoot = process.env.RUN_MIGRATIONS_ON_BOOT !== 'false';

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.POSTGRES_PORT),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
  entities: [join(__dirname, '..', 'src', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations',
  migrationsRun: isProduction && runMigrationsOnBoot,
  synchronize: !isProduction && !isSeeding,
  logging: !isProduction,
  ssl: useSsl
    ? {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      }
    : false,
  extra: {
    max: 20,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  },
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
