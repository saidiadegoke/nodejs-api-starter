import { FinanceService } from './finance.service';
import { UploadPaymentReceiptDto, ConfirmPaymentDto } from '../dto';
import {
  Currency,
  PaymentMethod,
  PaymentStatus,
  PaymentType,
} from '../../../shared/enums';

describe('FinanceService - Receipt Upload and Confirmation', () => {
  let service: FinanceService;
  let mockPaymentRepo: any;
  let mockReconRepo: any;
  let mockPaymentItemRepo: any;
  let mockPaymentStructureRepo: any;
  let mockSessionRepo: any;
  let mockScopeService: any;
  let mockUserRepo: any;
  let mockFilesService: any;
  let mockDataSource: any;
  let mockLoggerFactory: any;

  beforeEach(() => {
    mockPaymentRepo = {
      create: jest.fn().mockImplementation((data) => ({
        id: 'pay-uuid-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
      findById: jest.fn(),
      findByPaymentId: jest.fn(),
      updateById: jest.fn().mockImplementation((id, data) => ({
        id,
        paymentId: 'PAY-1234',
        amount: data.amount || 500000,
        currency: Currency.NGN,
        status: data.status,
        metadata: data.metadata,
        updatedAt: new Date(),
      })),
    };

    mockReconRepo = {
      create: jest.fn().mockResolvedValue({ id: 'recon-uuid-1' }),
    };

    mockPaymentItemRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'item-1', code: 'fee_affiliation', name: 'Affiliation Fee' }),
      findByCode: jest.fn(),
    };

    mockPaymentStructureRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'struct-1', code: 'full', name: 'Full Payment' }),
      findByCode: jest.fn(),
    };

    mockSessionRepo = {
      findActive: jest.fn().mockResolvedValue({ id: 'session-1', academicYear: '2026/2027' }),
    };

    mockScopeService = {
      effectiveUniversityId: jest.fn().mockResolvedValue('uni-1'),
      assertUniversityAccess: jest.fn().mockResolvedValue(undefined),
    };

    mockUserRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'admin-user-1',
        first_name: 'Finance',
        last_name: 'Officer',
        email: 'finance@jupeb.edu.ng',
      }),
    };

    mockFilesService = {
      uploadFile: jest.fn().mockResolvedValue({
        id: 'file-uuid-1',
        file_url: 'https://storage.example.com/receipt.pdf',
      }),
    };

    mockDataSource = {
      query: jest.fn().mockResolvedValue([]),
    };

    mockLoggerFactory = {
      create: () => ({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      }),
    };

    service = new FinanceService(
      {} as any,
      mockSessionRepo,
      mockPaymentRepo,
      mockReconRepo,
      mockPaymentItemRepo,
      mockPaymentStructureRepo,
      {} as any,
      mockScopeService,
      mockUserRepo,
      mockFilesService,
      mockDataSource,
      mockLoggerFactory,
    );
  });

  describe('uploadInstitutionPaymentReceipt', () => {
    it('should upload file and create pending payment record with metadata', () => {
      const dto: UploadPaymentReceiptDto = {
        payment_item_id: 'item-1',
        payment_structure_id: 'struct-1',
        amount: 500000,
        description: 'Payment for 2026/2027 affiliation fee',
      };
      const mockFile = { buffer: Buffer.from('fake-pdf'), originalname: 'receipt.pdf' };

      return service.uploadInstitutionPaymentReceipt('inst-user-1', dto, mockFile).then((res) => {
        expect(res.success).toBe(true);
        expect(mockFilesService.uploadFile).toHaveBeenCalledWith(mockFile, 'inst-user-1', 'payment_receipts');
        expect(mockPaymentRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            amount: 500000,
            currency: Currency.NGN,
            type: PaymentType.INSTITUTION_RECEIPT_UPLOAD,
            status: PaymentStatus.PENDING_VERIFICATION,
            paymentMethod: PaymentMethod.OFFLINE_RECEIPT,
            jupebUniversityId: 'uni-1',
            metadata: expect.objectContaining({
              receipt_url: 'https://storage.example.com/receipt.pdf',
              description: 'Payment for 2026/2027 affiliation fee',
            }),
          }),
        );
      });
    });
  });

  describe('confirmPayment', () => {
    it('should verify payment and create reconciliation record', () => {
      mockPaymentRepo.findById.mockResolvedValue({
        id: 'pay-uuid-1',
        paymentId: 'PAY-1234',
        amount: 500000,
        currency: Currency.NGN,
        status: PaymentStatus.PENDING_VERIFICATION,
        jupebUniversityId: 'uni-1',
        metadata: {},
      });

      const dto: ConfirmPaymentDto = {
        status: PaymentStatus.SUCCESSFUL,
        notes: 'Verified against bank statement',
        confirmed_amount: 500000,
      };

      return service.confirmPayment('pay-uuid-1', dto, 'admin-user-1').then((res) => {
        expect(res.success).toBe(true);
        expect(mockPaymentRepo.updateById).toHaveBeenCalledWith(
          'pay-uuid-1',
          expect.objectContaining({
            status: PaymentStatus.SUCCESSFUL,
            amount: 500000,
          }),
        );
        expect(mockReconRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            paymentId: 'pay-uuid-1',
            statusSnapshot: PaymentStatus.SUCCESSFUL,
            capturedAmount: 500000,
          }),
        );
      });
    });

    it('should treat confirmed status as successful when saving payment and reconciliation', async () => {
      mockPaymentRepo.findById.mockResolvedValue({
        id: 'pay-uuid-2',
        paymentId: 'PAY-5678',
        amount: 250000,
        currency: Currency.NGN,
        status: PaymentStatus.PENDING_VERIFICATION,
        jupebUniversityId: 'uni-1',
        metadata: {},
      });

      const dto: ConfirmPaymentDto = {
        status: PaymentStatus.CONFIRMED,
        notes: 'Confirmed by bank statement audit',
      };

      const res = await service.confirmPayment('pay-uuid-2', dto, 'admin-user-1');
      expect(res.success).toBe(true);
      expect(mockPaymentRepo.updateById).toHaveBeenCalledWith(
        'pay-uuid-2',
        expect.objectContaining({
          status: PaymentStatus.SUCCESSFUL,
          amount: 250000,
        }),
      );
      expect(mockReconRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'pay-uuid-2',
          statusSnapshot: PaymentStatus.SUCCESSFUL,
          capturedAmount: 250000,
        }),
      );
    });

    it('should default omitted status to successful', async () => {
      mockPaymentRepo.findById.mockResolvedValue({
        id: 'pay-uuid-3',
        paymentId: 'PAY-9012',
        amount: 150000,
        currency: Currency.NGN,
        status: PaymentStatus.PENDING_VERIFICATION,
        jupebUniversityId: 'uni-1',
        metadata: {},
      });

      const dto: ConfirmPaymentDto = {
        notes: 'Approved without explicit status',
      };

      const res = await service.confirmPayment('pay-uuid-3', dto, 'admin-user-1');
      expect(res.success).toBe(true);
      expect(mockPaymentRepo.updateById).toHaveBeenCalledWith(
        'pay-uuid-3',
        expect.objectContaining({
          status: PaymentStatus.SUCCESSFUL,
          amount: 150000,
        }),
      );
    });

    it('should store rejection_reason and notes when rejecting a payment', async () => {
      mockPaymentRepo.findById.mockResolvedValue({
        id: 'pay-uuid-4',
        paymentId: 'PAY-REJ-1',
        amount: 100000,
        currency: Currency.NGN,
        status: PaymentStatus.PENDING_VERIFICATION,
        jupebUniversityId: 'uni-1',
        metadata: {
          receipt_url: 'https://example.com/receipt.pdf',
        },
      });

      const dto: ConfirmPaymentDto = {
        status: PaymentStatus.REJECTED,
        reason: 'Invalid receipt uploaded',
      };

      const res = await service.confirmPayment('pay-uuid-4', dto, 'admin-user-1');
      expect(res.success).toBe(true);
      expect(res.data.status).toBe(PaymentStatus.REJECTED);
      expect(res.data.rejection_reason).toBe('Invalid receipt uploaded');
      expect(res.data.reason).toBe('Invalid receipt uploaded');
      expect(mockPaymentRepo.updateById).toHaveBeenCalledWith(
        'pay-uuid-4',
        expect.objectContaining({
          status: PaymentStatus.REJECTED,
          notes: 'Invalid receipt uploaded',
          metadata: expect.objectContaining({
            rejection_reason: 'Invalid receipt uploaded',
            reason: 'Invalid receipt uploaded',
            confirmation_notes: 'Invalid receipt uploaded',
          }),
        }),
      );
    });

    it('listAdminPayments should return rejection_reason and reason at top level and inside metadata', async () => {
      mockDataSource.query = jest.fn()
        .mockResolvedValueOnce([{ total: 1 }]) // count query
        .mockResolvedValueOnce([ // rows query
          {
            id: 'pay-uuid-rej',
            payment_id: 'PAY-REJ-2',
            amount: 500000,
            currency: 'NGN',
            status: 'rejected',
            created_at: new Date(),
            notes: null,
            metadata: {
              confirmation_notes: 'I dont like the price',
              payment_item_code: 'affiliation_fee',
            },
            item_code: 'affiliation_fee',
            item_name: 'Affiliation Fee',
          },
        ]);

      const res = await service.listAdminPayments({ payment_item: 'affiliation_fee' } as any, 'admin-user-1');
      expect(res.rows).toHaveLength(1);
      const row = res.rows[0];
      expect(row.status).toBe('rejected');
      expect(row.rejection_reason).toBe('I dont like the price');
      expect(row.reason).toBe('I dont like the price');
      expect(row.notes).toBe('I dont like the price');
      expect(row.metadata.rejection_reason).toBe('I dont like the price');
    });
  });
});
