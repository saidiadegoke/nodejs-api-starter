import { Controller, Get, Req, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { AuthService } from '../services/auth.service';
import { AuthRepository } from '../repositories/auth.repository';
import { UserSessionRepository } from '../repositories/user-session.repository';
import { BypassEnvelope } from '../../../utils';

const passport = require('../../../utils/config/passport.config');

@ApiTags('Auth')
@Controller('auth')
export class OAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authRepo: AuthRepository,
    private readonly sessionRepo: UserSessionRepository,
    private readonly dataSource: DataSource
  ) {}

  @Get('google')
  @BypassEnvelope()
  @ApiOperation({ summary: 'Initiate Google OAuth2 flow', description: 'Redirects client to Google sign-in consent' })
  googleAuth(@Req() req: Request, @Res() res: Response) {
    return passport.authenticate('google', { session: false })(req, res);
  }

  @Get('google/callback')
  @BypassEnvelope()
  @ApiOperation({ summary: 'Google OAuth2 callback' })
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return passport.authenticate('google', {
      session: false,
      failureRedirect: '/auth/oauth/failure',
    })(req, res, () => this.handleOAuthCallback(req, res));
  }

  @Get('facebook')
  @BypassEnvelope()
  @ApiOperation({ summary: 'Initiate Facebook OAuth2 flow' })
  facebookAuth(@Req() req: Request, @Res() res: Response) {
    return passport.authenticate('facebook', { session: false })(req, res);
  }

  @Get('facebook/callback')
  @BypassEnvelope()
  @ApiOperation({ summary: 'Facebook OAuth2 callback' })
  facebookCallback(@Req() req: Request, @Res() res: Response) {
    return passport.authenticate('facebook', {
      session: false,
      failureRedirect: '/auth/oauth/failure',
    })(req, res, () => this.handleOAuthCallback(req, res));
  }

  @Get('github')
  @BypassEnvelope()
  @ApiOperation({ summary: 'Initiate GitHub OAuth2 flow' })
  githubAuth(@Req() req: Request, @Res() res: Response) {
    return passport.authenticate('github', { session: false, scope: ['user:email'] })(req, res);
  }

  @Get('github/callback')
  @BypassEnvelope()
  @ApiOperation({ summary: 'GitHub OAuth2 callback' })
  githubCallback(@Req() req: Request, @Res() res: Response) {
    return passport.authenticate('github', {
      session: false,
      failureRedirect: '/auth/oauth/failure',
    })(req, res, () => this.handleOAuthCallback(req, res));
  }

  @Get('twitter')
  @BypassEnvelope()
  @ApiOperation({ summary: 'Initiate Twitter OAuth flow' })
  twitterAuth(@Req() req: Request, @Res() res: Response) {
    return passport.authenticate('twitter', { session: false })(req, res);
  }

  @Get('twitter/callback')
  @BypassEnvelope()
  @ApiOperation({ summary: 'Twitter OAuth callback' })
  twitterCallback(@Req() req: Request, @Res() res: Response) {
    return passport.authenticate('twitter', {
      session: false,
      failureRedirect: '/auth/oauth/failure',
    })(req, res, () => this.handleOAuthCallback(req, res));
  }

  @Get('oauth/failure')
  @BypassEnvelope()
  @ApiOperation({ summary: 'OAuth failure redirect handler' })
  handleOAuthFailure(@Res() res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }

  private async handleOAuthCallback(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user) {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=auth_failed`);
      }

      const roles = await this.authRepo.getUserRoles(user.id);
      const roleNames = roles.map((r) => r.name);

      const accessToken = this.authService.generateAccessToken(user.id, roleNames);
      const refreshToken = this.authService.generateRefreshToken(user.id);

      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      const deviceInfo = {
        ip_address: req.ip,
        user_agent: req.headers['user-agent'],
      };
      await this.sessionRepo.createSession(user.id, refreshTokenHash, deviceInfo);

      await this.dataSource.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/auth/callback?token=${accessToken}`;
      return res.redirect(redirectUrl);
    } catch (error) {
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/login?error=server_error`);
    }
  }
}
