import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './entities/user.entity';
import { ProfileEntity } from './entities/profile.entity';
import { UserPreferenceEntity } from './entities/user-preference.entity';
import { UserActivityEntity } from './entities/user-activity.entity';
import { UserRepository } from './repositories/user.repository';
import { ProfileRepository } from './repositories/profile.repository';
import { UserPreferencesRepository } from './repositories/user-preferences.repository';
import { UserActivityRepository } from './repositories/user-activity.repository';
import { UsersService } from './services/users.service';
import { UserProfileService } from './services/user-profile.service';
import { UserActivityService } from './services/user-activity.service';
import { UserProfileController } from './controllers/user-profile.controller';
import { UserActivityController } from './controllers/user-activity.controller';
import { UsersController } from './controllers/users.controller';
import { RegistrationModule } from '../registration';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ProfileEntity,
      UserPreferenceEntity,
      UserActivityEntity,
    ]),
    RegistrationModule,
  ],
  controllers: [
    UserProfileController,
    UserActivityController,
    UsersController,
  ],
  providers: [
    UserRepository,
    ProfileRepository,
    UserPreferencesRepository,
    UserActivityRepository,
    UsersService,
    UserProfileService,
    UserActivityService,
  ],
  exports: [
    UsersService,
    UserProfileService,
    UserRepository,
    ProfileRepository,
  ],
})
export class UsersModule {}
