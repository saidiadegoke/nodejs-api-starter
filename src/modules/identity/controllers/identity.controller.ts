import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IdentityService } from '../services/identity.service';
import {
  VerifyNinDto,
  PatchNinIntakeDto,
  CreateBiometricDto,
  ReplaceBiometricDto,
  SkipBiometricDto,
  NinVerificationResponseDto,
  BiometricResponseDto,
} from '../dto';
import { RegistrationPhotoResponseDto } from '../dto/biometric-response.dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../utils';

@ApiTags('Identity & Biometrics')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Post('nin/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('jupeb.identity.verify')
  @ApiOperation({
    summary: 'Verify National Identification Number (NIN)',
    description: 'Executes lookup against NIMC / SpeedySMS gateway and returns structured demographic payload.',
  })
  @ApiOkResponse({
    type: NinVerificationResponseDto,
    description: 'NIN verified or queued with provider reference.',
  })
  async verifyNin(
    @Body() dto: VerifyNinDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.verifyNin(dto, userId);
  }

  @Post('nin/verifications/:verificationId/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('jupeb.identity.verify')
  @ApiOperation({
    summary: 'Retry pending or failed NIN verification',
    description: 'Re-dispatches lookup request to the identity gateway for pending background tasks.',
  })
  @ApiOkResponse({
    type: NinVerificationResponseDto,
  })
  async retryVerification(
    @Param('verificationId') verificationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.retryVerification(verificationId, userId);
  }

  @Get('nin/verifications/:verificationId')
  @ApiOperation({
    summary: 'Get NIN verification record by ID',
    description: 'Retrieves cached or verified demographic profile details.',
  })
  @ApiOkResponse({
    type: NinVerificationResponseDto,
  })
  async getVerification(
    @Param('verificationId') verificationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.getVerification(verificationId, userId);
  }

  @Patch('nin/verifications/:verificationId/intake')
  @RequirePermission('jupeb.identity.verify')
  @ApiOperation({
    summary: 'Update intake form metadata on verification',
    description: 'Shallow-merges custom form entries into intake_payload.',
  })
  @ApiOkResponse({
    type: NinVerificationResponseDto,
  })
  async patchNinIntake(
    @Param('verificationId') verificationId: string,
    @Body() dto: PatchNinIntakeDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.patchNinIntake(verificationId, dto, userId);
  }

  @Post('biometrics')
  @ApiOperation({
    summary: 'Submit biometric capture (face or fingerprint)',
    description: 'Records candidate live face selfie or fingerprint authentication event.',
  })
  @ApiCreatedResponse({
    type: BiometricResponseDto,
  })
  async createBiometric(
    @Body() dto: CreateBiometricDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.createBiometric(dto, userId);
  }

  @Get('registrations/:registrationId/biometrics')
  @ApiOperation({
    summary: 'List biometric captures for candidate registration',
    description: 'Returns all active and replaced biometric records for a registration.',
  })
  @ApiOkResponse({
    type: [BiometricResponseDto],
  })
  async listBiometrics(
    @Param('registrationId') registrationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.listBiometrics(registrationId, userId);
  }

  @Post('registrations/:registrationId/biometrics/skip')
  @ApiOperation({
    summary: 'Exempt candidate from biometric modality',
    description: 'Records administrative exception for physical disability or medical condition.',
  })
  async skipBiometric(
    @Param('registrationId') registrationId: string,
    @Body() dto: SkipBiometricDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.skipBiometric(registrationId, dto, userId);
  }

  @Get('registrations/:registrationId/photo')
  @ApiOperation({
    summary: 'Get candidate registration photo URL',
    description: 'Resolves active candidate portrait URL from biometrics or user profile.',
  })
  @ApiOkResponse({
    type: RegistrationPhotoResponseDto,
  })
  async getRegistrationPhoto(
    @Param('registrationId') registrationId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.getRegistrationPhoto(registrationId, userId);
  }

  @Put('biometrics/:captureId')
  @ApiOperation({
    summary: 'Replace existing biometric capture',
    description: 'Marks current active capture as replaced and stores new biometric capture.',
  })
  @ApiOkResponse({
    type: BiometricResponseDto,
  })
  async replaceBiometric(
    @Param('captureId') captureId: string,
    @Body() dto: ReplaceBiometricDto,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.replaceBiometric(captureId, dto, userId);
  }

  @Delete('biometrics/:captureId')
  @ApiOperation({
    summary: 'Delete biometric capture',
    description: 'Deletes a biometric capture record.',
  })
  @ApiOkResponse({
    type: BiometricResponseDto,
  })
  async deleteBiometric(
    @Param('captureId') captureId: string,
    @Req() req: any,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;
    return this.identityService.deleteBiometric(captureId, userId);
  }
}
