import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcryptjs';
import { RegistrationStatus, RegistrationNextStep } from '../../../shared/enums';

describe('AuthService - Rejected Student Login', () => {
  let authService: AuthService;
  let mockAuthRepo: any;
  let mockSessionRepo: any;
  let mockDataSource: any;
  let mockMailService: any;

  const validPassword = 'StudentPassword123!';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(validPassword, 10);
  });

  beforeEach(() => {
    mockAuthRepo = {
      findByIdentifier: jest.fn(),
      getUserRoles: jest.fn().mockResolvedValue([{ name: 'user', display_name: 'User' }]),
    };

    mockSessionRepo = {
      createSession: jest.fn().mockResolvedValue({ id: 'session-1' }),
    };

    mockDataSource = {
      query: jest.fn(),
    };

    mockMailService = {};

    authService = new AuthService(
      mockAuthRepo,
      mockSessionRepo,
      mockDataSource,
      mockMailService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows student with user.status = "rejected" to log in and returns next_step view_rejection', async () => {
    const user = {
      id: 'student-rejected-user-id',
      email: 'rejected.student@example.com',
      password_hash: passwordHash,
      status: 'rejected',
      first_name: 'John',
      last_name: 'Doe',
      email_verified: true,
      created_at: new Date('2026-09-01'),
    };

    mockAuthRepo.findByIdentifier.mockResolvedValue(user);

    const mockReg = {
      id: 'reg-rejected-id',
      status: RegistrationStatus.REJECTED,
      status_reason: 'Incomplete Documentation',
      provisional_candidate_code: '0290132',
      jupeb_candidate_number: null,
      claimed_at: new Date('2026-09-02'),
      submitted_at: new Date('2026-09-05'),
      approved_at: null,
      dashboard_unlocked_at: null,
      university_id: 'uni-1',
    };

    mockDataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE users SET last_login_at')) {
        return [];
      }
      if (sql.includes('FROM jupeb_registrations')) {
        return [mockReg];
      }
      if (sql.includes('SELECT DISTINCT p.name')) {
        return [{ name: 'jupeb.student.access' }];
      }
      return [];
    });

    const result = await authService.login('rejected.student@example.com', validPassword);

    expect(result).toBeDefined();
    expect(result.access_token).toBeDefined();
    expect(result.user.user_id).toBe(user.id);
    expect(result.user.status).toBe('rejected');
    expect(result.registration).toBeDefined();
    expect(result.registration.status).toBe(RegistrationStatus.REJECTED);
    expect(result.registration.status_reason).toBe('Incomplete Documentation');
    expect(result.registration.next_step).toBe(RegistrationNextStep.VIEW_REJECTION);
  });

  it('allows student with user.status = "inactive" who has a rejected registration to log in', async () => {
    const user = {
      id: 'student-inactive-with-rejected-reg',
      email: 'inactive.student@example.com',
      password_hash: passwordHash,
      status: 'inactive',
      first_name: 'Jane',
      last_name: 'Doe',
      email_verified: true,
      created_at: new Date('2026-09-01'),
    };

    mockAuthRepo.findByIdentifier.mockResolvedValue(user);

    const mockReg = {
      id: 'reg-rejected-2',
      status: RegistrationStatus.REJECTED,
      status_reason: 'Blurry certificate scan',
      provisional_candidate_code: '0290133',
      jupeb_candidate_number: null,
      claimed_at: new Date('2026-09-02'),
      submitted_at: new Date('2026-09-05'),
      approved_at: null,
      dashboard_unlocked_at: null,
      university_id: 'uni-1',
    };

    mockDataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT 1 FROM jupeb_registrations WHERE user_id = $1 AND status = \'rejected\'')) {
        return [{ exists: 1 }];
      }
      if (sql.includes('UPDATE users SET last_login_at')) {
        return [];
      }
      if (sql.includes('FROM jupeb_registrations')) {
        return [mockReg];
      }
      if (sql.includes('SELECT DISTINCT p.name')) {
        return [{ name: 'jupeb.student.access' }];
      }
      return [];
    });

    const result = await authService.login('inactive.student@example.com', validPassword);

    expect(result).toBeDefined();
    expect(result.access_token).toBeDefined();
    expect(result.registration.status).toBe(RegistrationStatus.REJECTED);
    expect(result.registration.next_step).toBe(RegistrationNextStep.VIEW_REJECTION);
  });

  it('blocks user with user.status = "inactive" who has NO rejected registration with 403 Forbidden', async () => {
    const user = {
      id: 'inactive-non-rejected-user',
      email: 'regular.inactive@example.com',
      password_hash: passwordHash,
      status: 'inactive',
      first_name: 'Bob',
      last_name: 'Smith',
      email_verified: true,
      created_at: new Date('2026-09-01'),
    };

    mockAuthRepo.findByIdentifier.mockResolvedValue(user);

    mockDataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT 1 FROM jupeb_registrations WHERE user_id = $1 AND status = \'rejected\'')) {
        return [];
      }
      return [];
    });

    await expect(authService.login('regular.inactive@example.com', validPassword)).rejects.toThrow(
      new HttpException('Account is not active', HttpStatus.FORBIDDEN),
    );
  });

  it('allows student with user.status = "active" and rejected registration to log in', async () => {
    const user = {
      id: 'active-user-rejected-reg',
      email: 'active.rejected@example.com',
      password_hash: passwordHash,
      status: 'active',
      first_name: 'Alice',
      last_name: 'Wonder',
      email_verified: true,
      created_at: new Date('2026-09-01'),
    };

    mockAuthRepo.findByIdentifier.mockResolvedValue(user);

    const mockReg = {
      id: 'reg-rejected-3',
      status: RegistrationStatus.REJECTED,
      status_reason: 'Subject combination mismatch',
      provisional_candidate_code: '0290134',
      jupeb_candidate_number: null,
      claimed_at: new Date('2026-09-02'),
      submitted_at: new Date('2026-09-05'),
      approved_at: null,
      dashboard_unlocked_at: null,
      university_id: 'uni-1',
    };

    mockDataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE users SET last_login_at')) {
        return [];
      }
      if (sql.includes('FROM jupeb_registrations')) {
        return [mockReg];
      }
      if (sql.includes('SELECT DISTINCT p.name')) {
        return [{ name: 'jupeb.student.access' }];
      }
      return [];
    });

    const result = await authService.login('active.rejected@example.com', validPassword);

    expect(result).toBeDefined();
    expect(result.access_token).toBeDefined();
    expect(result.registration.status).toBe(RegistrationStatus.REJECTED);
    expect(result.registration.status_reason).toBe('Subject combination mismatch');
    expect(result.registration.next_step).toBe(RegistrationNextStep.VIEW_REJECTION);
  });
});
