import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../utils';
import { AdminSettingsService } from '../services/admin-settings.service';
import { UpdatePlatformSettingDto, PlatformSettingResponseDto } from '../dto';

@ApiTags('Admin Platform Settings')
@Controller('admin/settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class AdminSettingsController {
  constructor(private readonly settingsService: AdminSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all platform settings',
    description: 'Returns every runtime configuration / feature-flag key-value pair.',
  })
  @ApiOkResponse({ type: [PlatformSettingResponseDto] })
  async getAll() {
    return this.settingsService.getAll();
  }

  @Put()
  @ApiOperation({
    summary: 'Upsert a platform setting',
    description: 'Creates or updates a key-value runtime setting (feature flag, config override).',
  })
  @ApiOkResponse({ type: PlatformSettingResponseDto })
  async update(@Body() dto: UpdatePlatformSettingDto, @Req() req: any) {
    return this.settingsService.update(dto, req.user?.user_id);
  }
}
