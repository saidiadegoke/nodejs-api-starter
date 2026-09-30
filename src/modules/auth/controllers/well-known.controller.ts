import { Controller, Get, HttpException, HttpStatus, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { getSsoConfig } from '../../../utils/config/sso-keys.config';
import { BypassEnvelope } from '../../../utils';
import { JwksResponseDto } from '../dto/auth-responses.dto';

@ApiTags('Auth')
@Controller('.well-known')
export class WellKnownController {
  @Get('jwks.json')
  @BypassEnvelope()
  @ApiOperation({
    summary: 'Public JWKS endpoint',
    description: 'Returns the JSON Web Key Set containing the public keys used to verify CRP SSO tokens.',
  })
  @ApiOkResponse({ type: JwksResponseDto, description: 'JWKS public keys' })
  getJwks(@Res() res: Response) {
    const config = getSsoConfig();
    if (!config.enabled) {
      throw new HttpException('SSO issuer is not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.json({ keys: config.jwksKeys });
  }
}
