import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '@modules/users';
import { UserSessionEntity } from './entities/user-session.entity';
import { PasswordResetEntity } from './entities/password-reset.entity';
import { OtpCodeEntity } from './entities/otp-code.entity';
import { SocialAccountEntity } from './entities/social-account.entity';
import { UserSessionRepository } from './repositories/user-session.repository';
import { PasswordResetRepository } from './repositories/password-reset.repository';
import { OtpCodeRepository } from './repositories/otp-code.repository';
import { SocialAccountRepository } from './repositories/social-account.repository';
import { AuthRepository } from './repositories/auth.repository';
import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { PasswordResetService } from './services/password-reset.service';
import { SsoTokenService } from './services/sso-token.service';
import { AuthController } from './controllers/auth.controller';
import { OAuthController } from './controllers/oauth.controller';
import { SsoController } from './controllers/sso.controller';
import { WellKnownController } from './controllers/well-known.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserSessionEntity,
      PasswordResetEntity,
      OtpCodeEntity,
      SocialAccountEntity,
    ]),
    UsersModule,
  ],
  controllers: [
    AuthController,
    OAuthController,
    SsoController,
    WellKnownController,
  ],
  providers: [
    AuthRepository,
    UserSessionRepository,
    PasswordResetRepository,
    OtpCodeRepository,
    SocialAccountRepository,
    AuthService,
    OtpService,
    PasswordResetService,
    SsoTokenService,
  ],
  exports: [
    AuthService,
    OtpService,
    PasswordResetService,
    SsoTokenService,
    AuthRepository,
    UserSessionRepository,
  ],
})
export class AuthModule {}
