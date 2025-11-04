import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientModule } from '@evva/nest-xs3-api-client';
import { Xs3Module } from './xs3/xs3.module';
import configuration from './config/configuration';
import validationSchema from './config/validation';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
            validationSchema,
        }),
        ClientModule,
        Xs3Module,
    ],
})
export class AppModule {}