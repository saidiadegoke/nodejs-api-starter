import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RegistrationService } from '../services/registration.service';

@ApiTags('Public Registration Cleanup')
@Controller(['registration', 'jupeb/registration'])
export class PublicRegistrationCleanupController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('public/student-cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove a student account and registration data by email or registration ID',
    description:
      'Permanently removes the matching student account, registrations, NIN verifications, and related records. Does not remove institutions.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        registration_id: { type: 'string', format: 'uuid' },
      },
      oneOf: [
        { required: ['email'] },
        { required: ['registration_id'] },
      ],
    },
  })
  async cleanupStudent(
    @Body('email') email?: string,
    @Body('registration_id') registrationId?: string,
  ) {
    await this.registrationService.cleanupStudentByEmail(email, registrationId);
    return {
      success: true,
      message: 'Student cleanup completed if matching records existed.',
    };
  }
}