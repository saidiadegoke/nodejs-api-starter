import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService Greeting Sanitization (otp-code & jupeb-user-credentials)', () => {
  let service: MailService;
  let sentMails: any[] = [];

  beforeEach(async () => {
    sentMails = [];

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'NODE_ENV') return 'development';
              if (key === 'JUPEB_EMAIL_FORCE') return '1';
              if (key === 'SMTP_HOST') return 'smtp.example.com';
              if (key === 'SMTP_USER') return 'user@example.com';
              if (key === 'SMTP_PASSWORD') return 'secret';
              if (key === 'APP_NAME') return 'Registration Portal';
              if (key === 'FRONTEND_URL') return 'http://localhost:3000';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);

    // Mock transporter to capture the rendered html
    (service as any).transporter = {
      sendMail: jest.fn(async (options: any) => {
        sentMails.push(options);
        return { messageId: 'msg-test-123' };
      }),
    };
  });

  describe('otp-code.html greeting resolution', () => {
    it('renders real firstName when provided (e.g. Maryam)', async () => {
      await service.sendOtpEmail('maryam@example.com', {
        firstName: 'Maryam',
        code: '123456',
        ttlMinutes: 10,
        email: 'maryam@example.com',
      });

      expect(sentMails.length).toBe(1);
      expect(sentMails[0].html).toContain('Dear Maryam,');
      expect(sentMails[0].html).not.toContain('Dear there,');
    });

    it('replaces "there" with universityName for institution admins', async () => {
      await service.sendOtpEmail('hmucrp@yopmail.com', {
        firstName: 'there',
        universityName: 'Hallmark University',
        code: '316358',
        ttlMinutes: 10,
        email: 'hmucrp@yopmail.com',
      });

      expect(sentMails.length).toBe(1);
      expect(sentMails[0].html).toContain('Dear Hallmark University,');
      expect(sentMails[0].html).not.toContain('Dear there,');
      expect(sentMails[0].html).not.toContain('Dear There,');
    });

    it('falls back to "User" when firstName is empty string and no university exists', async () => {
      await service.sendOtpEmail('someone@example.com', {
        firstName: '',
        code: '999888',
        ttlMinutes: 10,
        email: 'someone@example.com',
      });

      expect(sentMails.length).toBe(1);
      expect(sentMails[0].html).toContain('Dear User,');
      expect(sentMails[0].html).not.toContain('Dear there,');
      expect(sentMails[0].html).not.toContain('Dear ,');
    });
  });

  describe('jupeb-user-credentials.html greeting resolution', () => {
    it('renders real firstName when user account is provisioned', async () => {
      await service.sendUserCredentialsEmail('lekan@example.com', {
        firstName: 'Lekan',
        email: 'lekan@example.com',
        role: 'registrar',
        password: 'TempPassword123!',
      });

      expect(sentMails.length).toBe(1);
      expect(sentMails[0].html).toContain('Dear Lekan,');
      expect(sentMails[0].html).not.toContain('Dear there,');
    });

    it('never renders "there" even if passed explicitly, falling back to university or User', async () => {
      await service.sendUserCredentialsEmail('admin@example.com', {
        firstName: 'there',
        universityName: 'University of Lagos',
        email: 'admin@example.com',
        role: 'institution_admin',
        password: 'TempPassword123!',
      });

      expect(sentMails.length).toBe(1);
      expect(sentMails[0].html).toContain('Dear University of Lagos,');
      expect(sentMails[0].html).not.toContain('Dear there,');
    });
  });
});
