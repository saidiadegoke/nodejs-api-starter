import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { SsoTokenService } from '../services/sso-token.service';
import {
  getSsoConfig,
  listConfiguredTargets,
  resolveLaunchCallbackUrl,
  SSO_TARGET_APPS,
} from '../../../shared/config/sso-keys.config';
import { JwtAuthGuard, CurrentUser, BypassEnvelope } from '../../../shared';

@ApiTags('Auth')
@Controller('sso')
export class SsoController {
  constructor(
    private readonly ssoTokenService: SsoTokenService,
    private readonly dataSource: DataSource
  ) {}

  @Get('targets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List configured SSO targets',
    description: 'Lists all downstream application targets configured for Single Sign-On handoff.',
  })
  @ApiOkResponse({ description: 'List of SSO targets' })
  listTargets() {
    const config = getSsoConfig();
    if (!config.enabled) {
      return {
        enabled: false,
        issuer: null,
        targets: [],
      };
    }

    return {
      enabled: true,
      issuer: config.issuer,
      targets: listConfiguredTargets(),
    };
  }

  @Get('launch/:targetApp')
  @UseGuards(JwtAuthGuard)
  @BypassEnvelope()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Launch SSO handoff to downstream application',
    description: 'Generates a signed RS256 handoff JWT token and redirects to the configured target application.',
  })
  @ApiParam({ name: 'targetApp', enum: ['crms', 'attendance'], description: 'Target application name' })
  @ApiQuery({ name: 'redirect_uri', required: false, description: 'Optional custom callback URL override' })
  async launch(
    @CurrentUser() currentUser: any,
    @Param('targetApp') targetApp: string,
    @Query('redirect_uri') redirectUri?: string,
    @Query('callback_url') callbackUrlQuery?: string
  ) {
    const config = getSsoConfig();
    if (!config.enabled) {
      throw new HttpException('SSO issuer is not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }

    if (!SSO_TARGET_APPS.includes(targetApp)) {
      throw new HttpException('Invalid SSO target application', HttpStatus.BAD_REQUEST);
    }

    const callbackUrl = resolveLaunchCallbackUrl(targetApp, redirectUri || callbackUrlQuery);
    if (!callbackUrl) {
      throw new HttpException(
        'A valid redirect_uri (or callback_url) query parameter is required',
        HttpStatus.BAD_REQUEST
      );
    }

    try {
      const rows = await this.dataSource.query(
        `SELECT u.id, u.email, p.jupeb_university_id,
                ARRAY(
                  SELECT r.name FROM user_roles ur
                  JOIN roles r ON ur.role_id = r.id
                  WHERE ur.user_id = u.id AND r.owner_jupeb_university_id IS NULL
                ) AS roles
           FROM users u
           LEFT JOIN profiles p ON p.user_id = u.id
          WHERE u.id = $1 LIMIT 1`,
        [currentUser.user_id]
      );
      const user = rows[0];
      if (!user) {
        throw new HttpException('User not found', HttpStatus.BAD_REQUEST);
      }

      const token = await this.ssoTokenService.issueHandoffToken({ user, targetApp });
      const redirectUrl = new URL(callbackUrl);
      redirectUrl.searchParams.set('token', token);
      return { redirectUrl: redirectUrl.toString() };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      const status = /email|institution|user/i.test(error.message)
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.SERVICE_UNAVAILABLE;
      throw new HttpException(error.message, status);
    }
  }
}
