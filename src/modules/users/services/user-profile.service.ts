import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRepository } from '../repositories/user.repository';
import { ProfileRepository } from '../repositories/profile.repository';
import { UserPreferencesRepository } from '../repositories/user-preferences.repository';
import { UpdateProfileDto } from '../dto/update-profile.dto';

function formatRoleLabel(roleName?: string) {
  if (!roleName) return null;
  return roleName
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function withPersonalInfoFields(user: any, roles: string[] = []) {
  const fullName =
    user.display_name ||
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    null;

  const candidateCount =
    user.expected_candidate_count != null ? Number(user.expected_candidate_count) : null;

  let institutionObj = null;
  if (user.jupeb_university_id || user.university_id) {
    institutionObj = {
      id: user.jupeb_university_id || user.university_id,
      university_id: user.jupeb_university_id || user.university_id,
      institution_id: user.university_code || user.jupeb_university_id || user.university_id,
      code: user.university_code || null,
      name: user.university_name || null,
      short_name: user.university_short_name || null,
      prefix: user.jupeb_prefix || null,
      jupeb_prefix: user.jupeb_prefix || null,
      email: user.university_email || null,
      phone: user.university_phone || null,
      address: user.university_address || null,
      expected_candidate_count: candidateCount,
      number_of_allocated_candidates: candidateCount,
      allocated_candidates: candidateCount,
      university_type: user.university_type || null,
    };
  }

  return {
    ...user,
    full_name: fullName,
    professional_title: user.title || null,
    position: formatRoleLabel(roles[0]) || null,
    institution: institutionObj,
    // Flat convenience aliases for UI forms
    prefix: user.jupeb_prefix || null,
    institution_id: user.university_code || user.jupeb_university_id || user.university_id || null,
    institution_name: user.university_name || null,
    institution_email: user.university_email || null,
    number_of_allocated_candidates: candidateCount,
    allocated_candidates: candidateCount,
    expected_candidate_count: candidateCount,
  };
}

@Injectable()
export class UserProfileService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly profileRepo: ProfileRepository,
    private readonly preferencesRepo: UserPreferencesRepository,
    private readonly dataSource: DataSource,
  ) {}

  async getMe(userId: string) {
    const user = await this.profileRepo.findByUserId(userId);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    const rolesRes = await this.dataSource.query(
      `SELECT r.name, r.description FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
      [userId],
    );
    const roles = rolesRes.map((r: any) => r.name);
    user.roles = roles;
    user.permissions = await this.getMyPermissions(userId);

    return withPersonalInfoFields(user, roles);
  }

  async updateMe(userId: string, data: UpdateProfileDto) {
    if (data.phone) {
      await this.userRepo.update(userId, { phone: data.phone });
    }

    const profileData: any = {};
    if (data.first_name !== undefined) profileData.firstName = data.first_name;
    if (data.last_name !== undefined) profileData.lastName = data.last_name;
    if (data.display_name !== undefined) profileData.displayName = data.display_name;
    if (data.full_name !== undefined) profileData.displayName = data.full_name;
    if (data.title !== undefined) profileData.title = data.title;
    if (data.professional_title !== undefined) profileData.title = data.professional_title;
    if (data.bio !== undefined) profileData.bio = data.bio;
    if (data.profile_photo_url !== undefined) profileData.profilePhotoUrl = data.profile_photo_url;
    if (data.date_of_birth !== undefined) profileData.dateOfBirth = data.date_of_birth;
    if (data.gender !== undefined) profileData.gender = data.gender;
    if (data.preferred_language !== undefined) profileData.preferredLanguage = data.preferred_language;
    if (data.timezone !== undefined) profileData.timezone = data.timezone;
    if (data.country_id !== undefined) profileData.countryId = data.country_id;
    if (data.state_province !== undefined) profileData.stateProvince = data.state_province;
    if (data.educational_level !== undefined) profileData.educationalLevel = data.educational_level;
    if (data.employment_status !== undefined) profileData.employmentStatus = data.employment_status;
    if (data.profile_completed !== undefined) profileData.profileCompleted = data.profile_completed;

    if (Object.keys(profileData).length > 0) {
      await this.profileRepo.upsert(userId, profileData);
    }

    return await this.getMe(userId);
  }

  async getStats(userId: string) {
    return await this.userRepo.getStats(userId);
  }

  async getMyPermissions(userId: string) {
    const res = await this.dataSource.query(
      `SELECT DISTINCT p.name FROM (
        SELECT p.id, p.name FROM user_permissions up
        JOIN permissions p ON up.permission_id = p.id
        WHERE up.user_id = $1 AND up.granted = true
        AND (up.expires_at IS NULL OR up.expires_at > NOW())
        UNION
        SELECT p.id, p.name FROM user_roles ur
        JOIN role_permissions rp ON ur.role_id = rp.role_id
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = $1
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      ) p`,
      [userId],
    );
    return res.map((r: any) => r.name);
  }

  async getCountries() {
    return await this.profileRepo.getCountries();
  }

  async getPreferences(userId: string) {
    const prefs = await this.preferencesRepo.findByUserId(userId);
    return prefs || this.preferencesRepo.defaults();
  }

  async updatePreferences(userId: string, fields: { push_notifications_enabled?: boolean; biometric_login_enabled?: boolean }) {
    return await this.preferencesRepo.upsert(userId, fields);
  }

  async deleteMe(userId: string) {
    const deleted = await this.userRepo.softDelete(userId);
    if (!deleted) {
      throw new NotFoundException('User not found');
    }
    return { message: 'Account deleted successfully' };
  }

  async getUserById(targetUserId: string) {
    const user = await this.profileRepo.findByUserId(targetUserId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return withPersonalInfoFields(user, []);
  }
}
