import 'dotenv/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { getAllowedOrigins } from './config/cors-origins';
import { RedisIoAdapter } from './config/redis-io.adapter';

// Ensure upload directories exist on startup
['uploads/gallery', 'uploads/images'].forEach((dir) => {
  mkdirSync(join(process.cwd(), dir), { recursive: true });
});

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind the Dokploy/Traefik reverse proxy: trust the first proxy hop so
  // req.ip / req.ips reflect the real client (used by the rate limiter).
  app.set('trust proxy', 1);
  app.enableShutdownHooks();

  // Multi-worker broadcast for Socket.IO. If Redis is unreachable, fall back to
  // the in-memory adapter so a single worker still works (cross-worker events
  // won't propagate until Redis is back).
  const redisIoAdapter = new RedisIoAdapter(app);
  try {
    await redisIoAdapter.connectToRedis();
    app.useWebSocketAdapter(redisIoAdapter);
  } catch (err) {
    new Logger('Bootstrap').warn(
      `Socket.IO Redis adapter unavailable (${(err as Error).message}). ` +
        'Using in-memory WebSocket adapter.',
    );
    app.useWebSocketAdapter(new IoAdapter(app));
  }
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const config = new DocumentBuilder()
    .setTitle('Market API')
    .setDescription('Market API Documentation')
    .setVersion('1.0.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('/api', app, document);

  await app.listen(
    Number(process.env.PORT ?? 4000),
    process.env.HOST ?? '0.0.0.0',
  );
}
bootstrap();
