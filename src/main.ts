import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';
import {SuccessResponseInterceptor} from "./common/success-response.interceptor";
import {AllExceptionsFilter} from "./common/all-exceptions.filter";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
    app.enableCors();
    app.use(json({ limit: '5mb' }));
    app.use(urlencoded({ extended: true, limit: '5mb' }));

    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    app.useGlobalInterceptors(new SuccessResponseInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

bootstrap();
