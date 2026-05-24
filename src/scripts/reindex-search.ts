import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { SearchService } from '../search/search.service';

async function run(): Promise<void> {
  const logger = new Logger('SearchReindexCli');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const searchService = app.get(SearchService);
    logger.log('Starting catalog reindex in OpenSearch...');

    const report = await searchService.reindexAll();

    logger.log(
      `Reindex completed: indexed=${report.indexed}, errors=${report.errors}, durationMs=${report.durationMs}`,
    );
  } catch (error) {
    logger.error('Catalog reindex failed');
    logger.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void run();
