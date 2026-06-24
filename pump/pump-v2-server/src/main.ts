import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Cats example')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addTag('cats')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: [
      'https://pump.fun',
      'https://www.pump.fun',
      'https://beta.pump.fun',
      'https://devnet.pump.fun',
      process.env.FRONTEND_DOMAIN,
      'http://localhost:3000',
      // 'https://pumpdash.vercel.app',
    ],
    credentials: true,
  });

  app.use(cookieParser());

  try {
    await app.listen(process.env.PORT || 8080);
  } catch (e) {
    console.error('error', e);
  }
}
bootstrap();
