import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NextOfKinService } from '../services/next-of-kin.service';
import { CreateNextOfKinDto } from '../dto/list-registrations-query.dto';
import { NextOfKinResponseDto } from '../dto/next-of-kin-response.dto';
import { JwtAuthGuard, PermissionsGuard } from '../../../shared';

@ApiTags('Next of Kin')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('me/next-of-kin')
export class NextOfKinController {
  constructor(private readonly nokService: NextOfKinService) {}

  @Get()
  @ApiOperation({
    summary: 'Get candidate active next of kin',
    description: 'Retrieves active next of kin contact for the authenticated candidate registration.',
  })
  @ApiOkResponse({
    type: NextOfKinResponseDto,
  })
  async getMe(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.nokService.getMine(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create active next of kin record',
    description: 'Registers primary next of kin emergency contact for the candidate.',
  })
  @ApiCreatedResponse({
    type: NextOfKinResponseDto,
  })
  async createMe(
    @Req() req: any,
    @Body() dto: CreateNextOfKinDto,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.nokService.createMine(userId, dto);
  }

  @Put()
  @ApiOperation({
    summary: 'Replace active next of kin record',
    description: 'Soft-deletes previous next of kin and persists replacement contact.',
  })
  @ApiOkResponse({
    type: NextOfKinResponseDto,
  })
  async replaceMe(
    @Req() req: any,
    @Body() dto: CreateNextOfKinDto,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.nokService.replaceMine(userId, dto);
  }

  @Get('history')
  @ApiOperation({
    summary: 'List next of kin modification history',
    description: 'Returns historical audit trail of all previous next of kin records.',
  })
  async listHistory(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.nokService.listHistoryMine(userId);
  }
}
