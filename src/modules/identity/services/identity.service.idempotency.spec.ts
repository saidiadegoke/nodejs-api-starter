/**
 * IdentityService.verifyNin — idempotency replay rules.
 *
 * A reused idempotency_key must replay in-flight (pending) and resolved
 * (verified) rows WITHOUT a new upstream call, but must NEVER replay a
 * terminally failed row: the call falls through for a fresh upstream attempt
 * and updates the existing row in place (unique key + attempt history kept).
 *
 * Pure unit test — all collaborators mocked, no DB, no network.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerFactory } from '../../../logger';
import { IdentityService } from './identity.service';
import { NinVerificationRepository } from '../repositories/nin-verification.repository';
import { BiometricCaptureRepository } from '../repositories/biometric-capture.repository';
import { NinAdapterService } from './nin-adapter.service';
import { NinEventsService } from './nin-events.service';
import { NinWriteThroughService } from './nin-write-through.service';

const NIN = '12345678901';
const KEY = 'idem-key-1';

function failedRow(overrides: Record<string, any> = {}) {
  return {
    id: 'row-failed-1',
    status: 'failed',
    ninLast4: '5660',
    nin_last4: '5660',
    provider: 'speedysms',
    providerReference: null,
    responsePayload: {},
    errorPayload: { code: 'upstream_client_error', message: 'Bad request signature' },
    intakePayload: {},
    verifiedAt: null,
    retryAfter: null,
    lastErrorCode: 'upstream_client_error',
    attemptCount: 1,
    lastAttemptAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

function verifiedRow(overrides: Record<string, any> = {}) {
  return {
    id: 'row-verified-1',
    status: 'verified',
    ninLast4: '5660',
    nin_last4: '5660',
    provider: 'speedysms',
    providerReference: 'lkp_1',
    responsePayload: { first_name: 'JANE' },
    errorPayload: {},
    intakePayload: {},
    verifiedAt: new Date(),
    retryAfter: null,
    lastErrorCode: null,
    attemptCount: 1,
    lastAttemptAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('IdentityService.verifyNin idempotency', () => {
  let service: IdentityService;
  let ninRepo: Record<string, jest.Mock>;
  let ninAdapter: { verifyNin: jest.Mock };
  let ninEvents: { emitNinResolved: jest.Mock };

  beforeEach(async () => {
    ninRepo = {
      findByIdempotencyKey: jest.fn(),
      findActiveCacheByNinHash: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      markVerified: jest.fn(),
      markFailed: jest.fn(),
      markPending: jest.fn(),
      mergeIntakePayload: jest.fn(),
    };
    ninAdapter = { verifyNin: jest.fn() };
    ninEvents = { emitNinResolved: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityService,
        { provide: NinVerificationRepository, useValue: ninRepo },
        { provide: BiometricCaptureRepository, useValue: {} },
        { provide: NinAdapterService, useValue: ninAdapter },
        { provide: NinEventsService, useValue: ninEvents },
        { provide: NinWriteThroughService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: { query: jest.fn().mockResolvedValue([]) } },
        {
          provide: LoggerFactory,
          useValue: {
            create: () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
          },
        },
      ],
    }).compile();

    service = module.get<IdentityService>(IdentityService);
  });

  test('reused key on a FAILED row retries upstream instead of replaying', async () => {
    ninRepo.findByIdempotencyKey.mockResolvedValue(failedRow());
    ninAdapter.verifyNin.mockResolvedValue({
      provider_name: 'speedysms',
      result: {
        outcome: 'failed',
        error: { code: 'upstream_client_error', message: 'New upstream error' },
      },
    });
    ninRepo.markFailed.mockImplementation(async (_id: string, params: any) => ({
      ...failedRow(),
      errorPayload: params.error_payload,
      lastErrorCode: params.last_error_code,
      attemptCount: 2,
    }));

    const out = await service.verifyNin({ nin: NIN, idempotency_key: KEY } as any);

    expect(ninAdapter.verifyNin).toHaveBeenCalledTimes(1);
    expect(ninRepo.create).not.toHaveBeenCalled();
    expect(ninRepo.markFailed).toHaveBeenCalledTimes(1);
    expect(out.status).toBe('failed');
    expect(out.verification_id).toBe('row-failed-1');
    expect(out.error.message).toBe('New upstream error');
  });

  test('reused key on a FAILED row can recover to verified on the same row', async () => {
    ninRepo.findByIdempotencyKey.mockResolvedValue(failedRow());
    ninAdapter.verifyNin.mockResolvedValue({
      provider_name: 'speedysms',
      result: {
        outcome: 'verified',
        provider_reference: 'lkp_2',
        profile: { first_name: 'JANE' },
      },
    });
    ninRepo.markVerified.mockImplementation(async (_id: string, params: any) => ({
      ...failedRow(),
      status: 'verified',
      responsePayload: params.response_payload,
      providerReference: params.provider_reference,
      errorPayload: {},
      attemptCount: 2,
    }));

    const out = await service.verifyNin({
      nin: NIN,
      idempotency_key: KEY,
      intake_payload: { name: 'Jane' },
    } as any);

    expect(ninAdapter.verifyNin).toHaveBeenCalledTimes(1);
    expect(ninRepo.create).not.toHaveBeenCalled();
    expect(ninRepo.mergeIntakePayload).toHaveBeenCalledWith('row-failed-1', { name: 'Jane' });
    expect(out.status).toBe('verified');
    expect(out.verification_id).toBe('row-failed-1');
    expect(out.profile.first_name).toBe('JANE');
  });

  test('reused key on a VERIFIED row replays without an upstream call', async () => {
    ninRepo.findByIdempotencyKey.mockResolvedValue(verifiedRow());

    const out = await service.verifyNin({ nin: NIN, idempotency_key: KEY } as any);

    expect(ninAdapter.verifyNin).not.toHaveBeenCalled();
    expect(ninRepo.create).not.toHaveBeenCalled();
    expect(out.status).toBe('verified');
    expect(out.verification_id).toBe('row-verified-1');
  });

  test('reused key on a PENDING row replays without an upstream call', async () => {
    ninRepo.findByIdempotencyKey.mockResolvedValue({
      ...verifiedRow(),
      id: 'row-pending-1',
      status: 'pending',
    });

    const out = await service.verifyNin({ nin: NIN, idempotency_key: KEY } as any);

    expect(ninAdapter.verifyNin).not.toHaveBeenCalled();
    expect(ninRepo.create).not.toHaveBeenCalled();
    expect(out.status).toBe('pending');
  });

  test('no key performs a fresh upstream call and creates a row', async () => {
    ninAdapter.verifyNin.mockResolvedValue({
      provider_name: 'speedysms',
      result: {
        outcome: 'verified',
        provider_reference: 'lkp_3',
        profile: { first_name: 'JANE' },
      },
    });
    ninRepo.create.mockImplementation(async (data: any) => ({
      id: 'row-new-1',
      status: data.status,
      ninLast4: data.ninLast4,
      provider: data.provider,
      providerReference: data.providerReference,
      responsePayload: data.responsePayload,
      errorPayload: data.errorPayload,
      intakePayload: data.intakePayload,
      verifiedAt: data.verifiedAt,
      retryAfter: null,
      lastErrorCode: null,
      createdAt: new Date(),
    }));

    const out = await service.verifyNin({ nin: NIN } as any);

    expect(ninRepo.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(ninAdapter.verifyNin).toHaveBeenCalledTimes(1);
    expect(ninRepo.create).toHaveBeenCalledTimes(1);
    expect(ninRepo.markVerified).not.toHaveBeenCalled();
    expect(out.status).toBe('verified');
    expect(out.verification_id).toBe('row-new-1');
  });
});
