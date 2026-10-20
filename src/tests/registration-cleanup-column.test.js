const { RegistrationService } = require('../modules/registration/services/registration.service');

describe('RegistrationService.cleanupStudentByEmail', () => {
  it('uses created_by when cleaning jupeb_result_entries for a user', async () => {
    const calls = [];
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      query: jest.fn((sql, params) => {
        calls.push({ sql, params });

        if (sql.includes('FROM users u')) {
          return [{ id: '11111111-1111-4111-8111-111111111111', phone: '+2348000000000' }];
        }
        if (sql.includes('FROM jupeb_nin_verifications')) {
          return [];
        }
        if (sql.includes('FROM jupeb_registrations')) {
          return [];
        }
        if (sql.includes('FROM support_tickets')) {
          return [];
        }

        return { rowCount: 0 };
      }),
    };

    const service = new RegistrationService(
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      {},
      { createQueryRunner: () => queryRunner },
      { create: () => ({}) },
      { assertRegistrationAllowed: jest.fn() },
    );

    await service.cleanupStudentByEmail('student@example.com');

    const resultEntryDelete = calls.find((call) => call.sql.includes('DELETE FROM jupeb_result_entries'));
    expect(resultEntryDelete).toBeTruthy();
    expect(resultEntryDelete.sql).toContain('created_by');
    expect(resultEntryDelete.sql).not.toContain('entered_by');

    const postMediaDelete = calls.find((call) => call.sql.includes('DELETE FROM post_media'));
    expect(postMediaDelete).toBeTruthy();
    expect(postMediaDelete.sql).toContain('DELETE FROM post_media');
    expect(postMediaDelete.sql).toContain('post_id IN');
    expect(postMediaDelete.sql).not.toContain('DELETE FROM post_media WHERE user_id');
  });
});
