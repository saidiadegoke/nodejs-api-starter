const fs = require('fs');
const path = require('path');

describe('email templates standard and rendering', () => {
  const candidateDirs = [
    path.join(__dirname, '../shared/emails'),
    path.join(__dirname, '../modules/mail/mail-templates'),
  ];
  const emailsDir = candidateDirs.find((d) => fs.existsSync(d)) || candidateDirs[0];

  function renderTemplate(filename, placeholders) {
    const fullPath = path.join(emailsDir, filename);
    let html = fs.readFileSync(fullPath, 'utf8');
    if (Array.isArray(placeholders)) {
      let idx = 0;
      html = html.replace(/%s/g, (match) => {
        if (idx < placeholders.length) return placeholders[idx++];
        return match;
      });
    } else if (typeof placeholders === 'object' && placeholders !== null) {
      html = html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return placeholders[key] !== undefined ? placeholders[key] : match;
      });
    }
    return html;
  }

  const bannedPhrases = [
    'Your App',
    'OP',
    'Your Voice, Your Impact',
    'trending topics',
    'follower network',
    'online stores',
    'jupeb://',
    'https://example.com',
  ];

  describe('banned words check across all templates', () => {
    const files = fs.readdirSync(emailsDir).filter((f) => f.endsWith('.html'));

    test.each(files)('%s has no residual template dummy text or broken deep links', (file) => {
      const content = fs.readFileSync(path.join(emailsDir, file), 'utf8');
      for (const phrase of bannedPhrases) {
        expect(content).not.toContain(phrase);
      }
    });
  });

  describe('placeholder rendering tests', () => {
    it('renders email-verification.html with 3 %s arguments and leaves no unreplaced %s', () => {
      const html = renderTemplate('email-verification.html', ['John', 'https://reg.jupeb.edu.ng/verify?t=123', 'https://reg.jupeb.edu.ng/verify?t=123']);
      expect(html).toContain('John');
      expect(html).toContain('https://reg.jupeb.edu.ng/verify?t=123');
      expect(html).not.toContain('%s');
    });

    it('renders resend-verification.html with 3 %s arguments and leaves no unreplaced %s', () => {
      const html = renderTemplate('resend-verification.html', ['Jane', 'https://reg.jupeb.edu.ng/verify?t=456', 'https://reg.jupeb.edu.ng/verify?t=456']);
      expect(html).toContain('Jane');
      expect(html).toContain('https://reg.jupeb.edu.ng/verify?t=456');
      expect(html).not.toContain('%s');
    });

    it('renders welcome.html with 3 %s arguments and leaves no unreplaced %s', () => {
      const html = renderTemplate('welcome.html', ['Alice', 'https://reg.jupeb.edu.ng/login', 'alice@example.com']);
      expect(html).toContain('Alice');
      expect(html).toContain('https://reg.jupeb.edu.ng/login');
      expect(html).toContain('alice@example.com');
      expect(html).not.toContain('%s');
    });

    it('renders forgot-password.html with 4 %s arguments and leaves no unreplaced %s', () => {
      const html = renderTemplate('forgot-password.html', ['Bob', 'https://reg.jupeb.edu.ng/reset?t=789', 'https://reg.jupeb.edu.ng/reset?t=789', 'bob@example.com']);
      expect(html).toContain('Bob');
      expect(html).toContain('https://reg.jupeb.edu.ng/reset?t=789');
      expect(html).toContain('bob@example.com');
      expect(html).not.toContain('%s');
    });

    it('renders password-reset-success.html with 5 %s arguments and leaves no unreplaced %s', () => {
      const html = renderTemplate('password-reset-success.html', ['Charlie', 'September 21, 2026', 'https://reg.jupeb.edu.ng/login', 'September 21, 2026', 'charlie@example.com']);
      expect(html).toContain('Charlie');
      expect(html).toContain('https://reg.jupeb.edu.ng/login');
      expect(html).toContain('charlie@example.com');
      expect(html).not.toContain('%s');
    });

    it('renders direct-transfer-instructions.html with 10 %s arguments and leaves no unreplaced %s', () => {
      const html = renderTemplate('direct-transfer-instructions.html', [
        'JUPEB Portal',
        'David',
        '₦50,000',
        'PAY-12345',
        'Zenith Bank',
        'JUPEB Reg Account',
        '1012345678',
        'https://reg.jupeb.edu.ng/pay/12345',
        'https://reg.jupeb.edu.ng/pay/12345',
        'JUPEB Portal',
      ]);
      expect(html).toContain('David');
      expect(html).toContain('₦50,000');
      expect(html).toContain('PAY-12345');
      expect(html).toContain('Zenith Bank');
      expect(html).toContain('1012345678');
      expect(html).not.toContain('%s');
    });

    it('renders jupeb-welcome-student.html with all keys and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('jupeb-welcome-student.html', {
        appName: 'JUPEB Portal',
        firstName: 'Emeka',
        universityName: 'University of Lagos',
        provisionalCode: '0060001',
        dashboardUrl: 'https://crp-theta.vercel.app/',
        email: 'emeka@example.com',
        year: '2026',
      });
      expect(html).toContain('Emeka');
      expect(html).toContain('0060001');
      expect(html).toContain('https://crp-theta.vercel.app/');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders jupeb-code-issued.html with claimUrl and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('jupeb-code-issued.html', {
        appName: 'JUPEB Portal',
        firstName: 'Fatima',
        universityName: 'University of Abuja',
        code: 'ARM7P4',
        claimUrl: 'https://crp-theta.vercel.app/auth/claim?code=ARM7P4',
        expiryNotice: '<p>Expires soon</p>',
        email: 'fatima@example.com',
        year: '2026',
      });
      expect(html).toContain('Fatima');
      expect(html).toContain('ARM7P4');
      expect(html).toContain('https://crp-theta.vercel.app/auth/claim?code=ARM7P4');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders jupeb-registration-approved.html with dashboardUrl and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('jupeb-registration-approved.html', {
        appName: 'JUPEB Portal',
        firstName: 'Gbenga',
        universityName: 'Obafemi Awolowo University',
        candidateNumber: '280060001',
        approvedAt: '2026-09-21',
        dashboardUrl: 'https://crp-theta.vercel.app/',
        email: 'gbenga@example.com',
        year: '2026',
      });
      expect(html).toContain('Gbenga');
      expect(html).toContain('280060001');
      expect(html).toContain('https://crp-theta.vercel.app/');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders jupeb-registration-rejected.html with dashboardUrl and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('jupeb-registration-rejected.html', {
        appName: 'JUPEB Portal',
        firstName: 'Halima',
        universityName: 'University of Ilorin',
        reason: 'O-Level certificate scan is blurry',
        dashboardUrl: 'https://crp-theta.vercel.app/',
        email: 'halima@example.com',
        year: '2026',
      });
      expect(html).toContain('Halima');
      expect(html).toContain('O-Level certificate scan is blurry');
      expect(html).toContain('https://crp-theta.vercel.app/');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders jupeb-registration-withdrawn.html with dashboardUrl and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('jupeb-registration-withdrawn.html', {
        appName: 'JUPEB Portal',
        firstName: 'Ibrahim',
        universityName: 'Ahmadu Bello University',
        reasonBlock: '<p>Voluntary withdrawal request</p>',
        dashboardUrl: 'https://crp-theta.vercel.app/',
        email: 'ibrahim@example.com',
        year: '2026',
      });
      expect(html).toContain('Ibrahim');
      expect(html).toContain('https://crp-theta.vercel.app/');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders jupeb-matric-assigned.html with dashboardUrl and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('jupeb-matric-assigned.html', {
        appName: 'JUPEB Portal',
        firstName: 'Joy',
        universityName: 'University of Nigeria, Nsukka',
        candidateNumber: '280060002',
        dashboardUrl: 'https://crp-theta.vercel.app/',
        email: 'joy@example.com',
        year: '2026',
      });
      expect(html).toContain('Joy');
      expect(html).toContain('280060002');
      expect(html).toContain('https://crp-theta.vercel.app/');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders jupeb-institution-admin-credentials.html with loginUrl and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('jupeb-institution-admin-credentials.html', {
        appName: 'JUPEB Portal',
        firstName: 'Dr. Kalu',
        universityName: 'University of Ibadan',
        email: 'kalu@ui.edu.ng',
        password: 'TempPassword123!',
        loginUrl: 'https://institution.reg-portal.cloud/login',
        year: '2026',
      });
      expect(html).toContain('Dr. Kalu');
      expect(html).toContain('TempPassword123!');
      expect(html).toContain('https://institution.reg-portal.cloud/login');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders jupeb-user-credentials.html with loginUrl and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('jupeb-user-credentials.html', {
        appName: 'JUPEB Portal',
        firstName: 'Lekan',
        role: 'registrar',
        universityName: 'Covenant University',
        email: 'lekan@covenant.edu.ng',
        password: 'TempPassword456!',
        loginUrl: 'https://crp-theta.vercel.app/auth/login',
        year: '2026',
      });
      expect(html).toContain('Lekan');
      expect(html).toContain('registrar');
      expect(html).toContain('TempPassword456!');
      expect(html).toContain('https://crp-theta.vercel.app/auth/login');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders otp-code.html with code and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('otp-code.html', {
        appName: 'JUPEB Portal',
        firstName: 'Maryam',
        ttlMinutes: 10,
        code: '849201',
        email: 'maryam@example.com',
        year: '2026',
      });
      expect(html).toContain('Maryam');
      expect(html).toContain('849201');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders support-ticket-created.html with ticket info and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('support-ticket-created.html', {
        appName: 'JUPEB Portal',
        firstName: 'Ngozi',
        category: 'Document Verification',
        ticketNumber: 'TKT-2026-0042',
        subject: 'WAEC Scratch Card Query',
        message: 'Could you verify my uploaded scratch card pin?',
        email: 'ngozi@example.com',
        year: '2026',
      });
      expect(html).toContain('Ngozi');
      expect(html).toContain('TKT-2026-0042');
      expect(html).toContain('WAEC Scratch Card Query');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });

    it('renders support-ticket-reply.html with response message and leaves no unreplaced {{}}', () => {
      const html = renderTemplate('support-ticket-reply.html', {
        appName: 'JUPEB Portal',
        firstName: 'Osagie',
        ticketNumber: 'TKT-2026-0042',
        responderName: 'Admissions Officer Ade',
        institutionName: 'University of Benin',
        subject: 'WAEC Scratch Card Query',
        replyMessage: 'We have re-verified your card and approved your results.',
        email: 'osagie@example.com',
        year: '2026',
      });
      expect(html).toContain('Osagie');
      expect(html).toContain('Admissions Officer Ade');
      expect(html).toContain('University of Benin');
      expect(html).toContain('We have re-verified your card and approved your results.');
      expect(html).not.toMatch(/\{\{\w+\}\}/);
    });
  });
});
