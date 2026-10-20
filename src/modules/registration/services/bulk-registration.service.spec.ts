/**
 * BulkRegistrationService.bulkUpload — row handling.
 *
 * Covers: "Full Name" single-column split, bio column intake, blank-row skip
 * accounting, serial allocation (failed rows must not burn serials),
 * error codes, bulk-row refresh on NIN reuse, and status-history writes.
 *
 * Pure unit test — repositories/dataSource/event bus mocked, no DB. Real
 * .xlsx buffers built in-test via the same xlsx lib the service uses.
 */
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as XLSX from 'xlsx';
import { BulkRegistrationService } from './bulk-registration.service';
import { RegistrationRepository } from '../repositories/registration.repository';
import { NinVerificationRepository } from '../../identity/repositories/nin-verification.repository';
import { RegistrationStatusHistoryRepository } from '../repositories/registration-status-history.repository';
import { InstitutionUserScopeService } from './institution-user-scope.service';
import { InstitutionRegistrationLockService } from '../../sessions/services/institution-registration-lock.service';

function sheetBuffer(headers: string[], rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as Buffer;
}

describe('BulkRegistrationService.bulkUpload', () => {
  let service: BulkRegistrationService;
  let registrationRepo: Record<string, jest.Mock>;
  let ninVerificationRepo: Record<string, jest.Mock>;
  let historyRepo: Record<string, jest.Mock>;
  let dataSourceQuery: jest.Mock;
  let qb: any;

  beforeEach(() => {
    qb = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max_serial: 5 }),
    };
    registrationRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      create: jest.fn((o: any) => ({ ...o })),
      save: jest.fn(async (e: any) => ({ ...e, id: 'reg-1' })),
    };
    ninVerificationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((o: any) => ({ ...o })),
      save: jest.fn(async (e: any) => ({ ...e, id: e.id || 'nv-1' })),
    };
    historyRepo = {
      create: jest.fn(async (d: any) => ({ ...d })),
    };
    dataSourceQuery = jest.fn(async (sql: string) => {
      if (sql.includes('jupeb_prefix')) return [{ jupeb_prefix: 'TST' }];
      if (sql.includes('FROM jupeb_subjects')) return [];
      if (sql.includes('jupeb_subject_combinations')) return [];
      if (sql.includes('institution_issued_code')) return [];
      return [];
    });

    service = new BulkRegistrationService(
      registrationRepo as any,
      ninVerificationRepo as any,
      { query: dataSourceQuery } as unknown as DataSource,
      { effectiveUniversityId: jest.fn(async () => null) } as unknown as InstitutionUserScopeService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      historyRepo as any,
      { assertRegistrationAllowed: jest.fn() } as unknown as InstitutionRegistrationLockService,
    );
  });

  test('splits Full Name, counts skips, and does not burn serials on failures', async () => {
    // First registration save fails at the DB level (after serial allocation
    // in the old code) — the next success must still take serial 6, not 7.
    registrationRepo.save.mockRejectedValueOnce({ code: '23505' });

    const buf = sheetBuffer(
      ['Full Name', 'Email', 'Phone', 'NIN', 'Combination'],
      [
        ['Failing Row', 'fail@x.com', '0801', '11111111111', ''],
        ['', '', '', '', ''],
        ['Adaeze Chiamaka Obi', 'ada@x.com', '0802', '12345678901', ''],
      ],
    );

    const out: any = await service.bulkUpload(buf, 'sess-1', 'uni-1', null);

    expect(out.successful).toBe(1);
    expect(out.failed).toBe(1);
    expect(out.skipped_count).toBe(1);
    expect(out.skipped_rows).toEqual([3]);
    expect(out.partial).toBe(true);
    expect(out.errors[0].row).toBe(2);
    expect(out.errors[0].error_code).toBe('duplicate_registration');
    // The successful row takes serial 6 (max 5 + 1) — the failed row burned nothing.
    const created = registrationRepo.create.mock.calls[1][0];
    expect(created.provisionalSerial).toBe(6);
    expect(created.provisionalCandidateCode).toContain('6');
    // Full Name split into parts on the verification intake (second save —
    // the first row's verification saved before its registration failed).
    const savedNv = ninVerificationRepo.save.mock.calls[1][0];
    expect(savedNv.intakePayload).toMatchObject({
      first_name: 'Adaeze',
      middle_name: 'Chiamaka',
      last_name: 'Obi',
      email: 'ada@x.com',
    });
    // Status history mirrors single-create.
    expect(historyRepo.create).toHaveBeenCalledTimes(1);
    expect(historyRepo.create.mock.calls[0][0]).toMatchObject({
      registrationId: 'reg-1',
      fromStatus: null,
    });
  });

  test('maps duplicate DB errors to a categorized error code', async () => {
    registrationRepo.save.mockRejectedValueOnce({ code: '23505' });

    const buf = sheetBuffer(
      ['First Name', 'NIN'],
      [['Jane', '12345678901']],
    );

    const out: any = await service.bulkUpload(buf, 'sess-1', 'uni-1', null);

    expect(out.successful).toBe(0);
    expect(out.failed).toBe(1);
    expect(out.errors[0].error_code).toBe('duplicate_registration');
    expect(out.success).toBe(false);
  });

  test('stores bio columns and expands scientific-notation NINs', async () => {
    const buf = sheetBuffer(
      ['First Name', 'Last Name', 'NIN', 'Gender', 'Date of Birth', 'Address', 'State', 'LGA'],
      [
        ['John', 'Doe', '2.3456789012E+10', 'Male', '2000-01-01', '12 Main St', 'Lagos', 'Ikeja'],
        ['Zed', 'Zed', 34567890123, '', '', '', '', ''],
      ],
    );

    const out: any = await service.bulkUpload(buf, 'sess-1', 'uni-1', null);

    expect(out.successful).toBe(2);
    expect(out.failed).toBe(0);
    const first = ninVerificationRepo.save.mock.calls[0][0];
    expect(first.intakePayload).toMatchObject({
      first_name: 'John',
      gender: 'Male',
      date_of_birth: '2000-01-01',
      residential_address: '12 Main St',
      state_of_origin: 'Lagos',
      lga: 'Ikeja',
    });
  });

  test('refreshes stale bulk-typed verifications on NIN reuse, never real ones', async () => {
    const bulkRow = {
      id: 'nv-old',
      provider: 'bulk_upload',
      responsePayload: { first_name: 'Old' },
      intakePayload: { first_name: 'Old', email: 'old@x.com' },
    };
    ninVerificationRepo.findOne.mockResolvedValueOnce({ ...bulkRow });

    const buf = sheetBuffer(
      ['First Name', 'Last Name', 'NIN'],
      [['New', 'Name', '12345678901']],
    );
    await service.bulkUpload(buf, 'sess-1', 'uni-1', null);

    expect(ninVerificationRepo.create).not.toHaveBeenCalled();
    const updated = ninVerificationRepo.save.mock.calls[0][0];
    expect(updated.id).toBe('nv-old');
    expect(updated.responsePayload.first_name).toBe('New');
    expect(updated.intakePayload.first_name).toBe('New');
    // Untouched sheet fields keep their previous intake values.
    expect(updated.intakePayload.email).toBe('old@x.com');

    // A real NIMC verification is linked as-is, never overwritten.
    ninVerificationRepo.findOne.mockResolvedValueOnce({
      id: 'nv-real',
      provider: 'mono',
      responsePayload: { first_name: 'Real' },
      intakePayload: { first_name: 'Real' },
    });
    ninVerificationRepo.save.mockClear();
    await service.bulkUpload(buf, 'sess-1', 'uni-1', null);
    expect(ninVerificationRepo.save).not.toHaveBeenCalled();
  });
});
