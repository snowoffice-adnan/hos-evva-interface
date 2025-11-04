// src/integrations/evva/xs3/xs3.controller.ts
import { Controller, Get, Query, Post, Body } from '@nestjs/common';
import { Xs3QueriesService } from './xs3.queries.service';
import { Xs3CommandsService } from './xs3.commands.service';
import { Xs3StateService } from './xs3.state.service';
import { Xs3ProgramService } from './xs3.program.service';
import { AssignAuthProfileDto } from './dto/assign-auth-profile.dto';
import { SetAccessBeginDto } from './dto/set-access-begin.dto';
import { SetAccessEndDto } from './dto/set-access-end.dto';
import { ProgramDto } from './dto/program.dto';
import {ok} from "../common/responses";

@Controller('integrations/evva/xs3')
export class Xs3Controller {
  constructor(
      private readonly queries: Xs3QueriesService,
      private readonly commands: Xs3CommandsService,
      private readonly state: Xs3StateService,
      private readonly programService: Xs3ProgramService,
  ) {}

  @Get('authorization-profiles')
  async listAuthProfiles(@Query('o') o = '0', @Query('l') l = '200') {
    const data = await this.queries.listAuthorizationProfiles(Number(o), Number(l));
    return { error: false, message: 'success', statusCode: 200, response: data };
  }

  @Get('identification-media')
  async listIdentificationMedia(@Query('o') o = '0', @Query('l') l = '200') {
    const data = await this.queries.listIdentificationMedia(Number(o), Number(l));
    return { error: false, message: 'success', statusCode: 200, response: data };
  }

  @Get('evva-components')
  async listEvvaComponents(@Query('o') o = '0', @Query('l') l = '200') {
    const data = await this.queries.listEvvaComponents(Number(o), Number(l));
    return { error: false, message: 'success', statusCode: 200, response: data };
  }

  @Get('reader-state')
  getReaderState() {
    return { error: false, message: 'success', statusCode: 200, mediumId: this.state.snapshot.mediumId, raw: this.state.snapshot };
  }

  @Post('set-access-begin')
  async setAccessBegin(@Body() dto: SetAccessBeginDto) {
    const raw = await this.commands.setAccessBeginAt(dto.mediumId, dto.checkIn);
    return ok('Access begin set', { result: raw });
  }

  @Post('set-access-end')
  async setAccessEnd(@Body() dto: SetAccessEndDto) {
    const raw = await this.commands.setAccessEndAt(dto.mediumId, dto.checkOut);
    return ok('Access end set', { result: raw });
  }

  @Post('assign-auth-profile')
  async assignAuthProfile(@Body() dto: AssignAuthProfileDto) {
    const raw = await this.commands.assignAuthorizationProfile(dto.mediumId, dto.profileId);
    return ok('Authorization profile assigned', { result: raw });
  }

  @Post('checkout')
  async withdrawAuthorizationProfile(@Body() dto: AssignAuthProfileDto) {
    const raw = await this.commands.withdrawAuthorizationProfile(dto.mediumId, dto.profileId);
    return ok('Authorization profile withdrawn', { result: raw });
  }

  @Post('program')
  async program(@Body() dto: ProgramDto) {
    return this.programService.program(dto);
  }
}
