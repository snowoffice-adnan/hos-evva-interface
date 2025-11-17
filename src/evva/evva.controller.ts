import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { EvvaService } from './evva.service';
import * as crypto from 'crypto';
import { ok } from '../common/response';
import { SetAccessBeginDto } from './dto/set-access-begin.dto';
import { SetAccessEndDto } from './dto/set-access-end.dto';
import { ExtendAccessDto } from './dto/extend-access.dto';
import { SetMobileServiceModeDto } from './dto/set-mobile-service-mode.dto';
import { MssConfirmDto } from './dto/mss-confirm.dto';
import { StateService } from './state.service';
import { AssignAuthProfileDto } from './dto/assign-auth-profile.dto';
import { ProgramDto } from './dto/program.dto';
import { RevokeSmartphoneDto } from './dto/revoke-smartphone.dto';

@Controller('integrations/evva/xs3')
export class EvvaController {
  constructor(
    private readonly evva: EvvaService,
    private readonly state: StateService,
  ) {}

  @Get('authorization-profiles')
  async getAuthProfiles() {
    const data = await this.evva.queryResource('authorization-profiles');
    return ok('success', data);
  }

  @Get('identification-media')
  async getIdentificationMedia() {
    const data = await this.evva.queryResource('identification-media');
    return ok('success', data);
  }

  @Get('identification-media-access-data')
  async getIdentificationMediaAccessData(@Query('id') id?: string) {
    const params: any = {};

    if (id) {
      params.filters = [
        {
          field: 'id',
          type: 'eq',
          op: 'eq',
          value: id,
        },
      ];
      params.pageLimit = 1;
    }

    const data = await this.evva.queryResource(
      'identification-media-access-data',
      params,
    );

    return ok('success', data);
  }

  @Get('evva-components')
  async getEvvaComponents() {
    const data = await this.evva.queryResource('evva-components');
    return ok('success', data, { unwrapSingle: false });
  }

  @Get('installation-points')
  async getInstallationPoints() {
    const data = await this.evva.queryResource('installation-points');
    return ok('success', data, { unwrapSingle: false });
  }

  @Get('mss/pending')
  async getPending(@Query('state') state: string) {
    const data = await this.evva.queryResource(
      'identification-media-access-data',
      {
        filters: [{ field: 'state', type: 'eq', op: 'eq', value: state }],
      },
    );
    return ok('success', data);
  }

  @Get('disengage-params/:mediumId')
  async getDisengageParams(@Param('mediumId') mediumId: string) {
    const rows = await this.evva.queryResource(
      'identification-media-access-data',
      {
        filters: [{ field: 'id', type: 'eq', op: 'eq', value: mediumId }],
      },
    );

    const row = rows?.data?.[0];
    if (!row) throw new NotFoundException('Medium access data not found');

    const mobileIdSource = row.xsMobileId ?? '';
    const mobileId = crypto
      .createHash('sha256')
      .update(mobileIdSource, 'utf8')
      .digest('hex');

    const data = {
      mobileId,
      mobileDeviceKey: row.xsMOBDK,
      mobileGroupId: row.xsMOBGID,
      mediumAccessData: row.mediumDataFrame,
      meta: {
        id: row.id,
        mediumType: row.mediumType,
        state: row.state,
        transactionId: row.transactionId,
        validFrom: row.validFrom,
        validUntil: row.validUntil,
        xsId: row.xsId,
        version: row.version,
      },
    };

    return ok('success', data);
  }

  @Post('set-access-begin')
  async setAccessBegin(@Body() dto: SetAccessBeginDto) {
    const result = await this.evva.setAccessBeginAt(dto.mediumId, dto.checkIn);
    return ok('success', result);
  }

  @Post('set-access-end')
  async setAccessEnd(@Body() dto: SetAccessEndDto) {
    const result = await this.evva.setAccessEndAt(dto.mediumId, dto.checkOut);
    return ok('success', result);
  }

  @Post('extend-access')
  async extendAccess(@Body() dto: ExtendAccessDto) {
    return await this.evva.extendAccess(
      dto.mediumId,
      dto.checkIn,
      dto.checkOut,
    );
  }

  @Post('mobile-service-mode')
  async setMobileServiceMode(@Body() dto: SetMobileServiceModeDto) {
    const result = await this.evva.setMobileServiceMode(dto.mobileServiceMode);
    return ok('success', result);
  }

  @Post('mss/confirm')
  async confirmSmartphoneUpdate(@Body() dto: MssConfirmDto) {
    const result = await this.evva.confirmSmartphoneUpdate(dto);
    return ok('success', result);
  }

  @Post('mss/revoke')
  async confirmSmartphoneRevoke(@Body() dto: MssConfirmDto) {
    const result = await this.evva.confirmSmartphoneRevoke(dto);
    return ok('success', result);
  }

  @Post('mss/revoke-smartphone')
  async revokeSmartphone(@Body() dto: RevokeSmartphoneDto) {
    const raw = await this.evva.revokeSmartphone(dto.mediumId);
    return ok('Smartphone revoke triggered', raw);
  }

  @Get('reader-state')
  getReaderState() {
    return ok('success', {
      mediumId: this.state.snapshot.mediumId,
      raw: this.state.snapshot,
    });
  }

  @Post('assign-auth-profile')
  async assignAuthProfile(@Body() dto: AssignAuthProfileDto) {
    const raw = await this.evva.assignAuthorizationProfile(
      dto.mediumId,
      dto.profileId,
    );
    return ok('Authorization profile assigned', { result: raw });
  }

  @Post('checkout')
  async withdrawAuthorizationProfile(@Body() dto: AssignAuthProfileDto) {
    const raw = await this.evva.withdrawAuthorizationProfile(
      dto.mediumId,
      dto.profileId,
    );
    return ok('Authorization profile withdrawn', { result: raw });
  }

  @Post('program')
  async program(@Body() dto: ProgramDto) {
    const result = await this.evva.program(
      dto.mediumId,
      dto.checkIn,
      dto.checkOut,
      dto.profileId,
    );
    return ok('success', result);
  }

  @Post('installation-points/metadata-definitions')
  async addInstallationPointMetadataDefinitions(
    @Body('names') names: string[],
  ) {
    const res = await this.evva.addInstallationPointMetadataDefinition(names);
    return ok('Metadata definitions added', res);
  }

  @Post('installation-points/metadata-value')
  async setInstallationPointMetadataValue(
    @Body()
    body: {
      installationPointId: string;
      metadataId: string;
      value: string;
    },
  ) {
    const res = await this.evva.changeInstallationPointMetadataValue(
      body.installationPointId,
      body.metadataId,
      body.value,
    );

    return ok('Metadata value changed', res);
  }

  @Post('installation-points/metadata-definitions/delete')
  async deleteInstallationPointMetadataDefinitions(
    @Body('names') names: string[],
  ) {
    const res =
      await this.evva.deleteInstallationPointMetadataDefinitions(names);
    return ok('Metadata definitions deleted', res);
  }
}
