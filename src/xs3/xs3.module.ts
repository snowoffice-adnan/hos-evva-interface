import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { Xs3Client } from './xs3.client';
import { Xs3StateService } from './xs3.state.service';
import { Xs3QueriesService } from './xs3.queries.service';
import { Xs3CommandsService } from './xs3.commands.service';
import { Xs3ReaderListener } from './xs3-reader.listener';
import { Xs3Controller } from './xs3.controller';
import { Xs3ProgramService } from './xs3.program.service';

@Module({
  imports: [
    ConfigModule,
  ],
  controllers: [
    Xs3Controller,
  ],
  providers: [
    Xs3Client,
    Xs3StateService,
    Xs3QueriesService,
    Xs3CommandsService,
    Xs3ReaderListener,
    Xs3ProgramService,
  ],
  exports: [Xs3Client, Xs3QueriesService, Xs3CommandsService],
})
export class Xs3Module {}
