import { BaseProvider, ExtractionInput, ExtractionResult, ProviderUnavailableError } from './base.provider';

const FIXTURES = new Map<string, { text: string; pages: number; providerConfidence: number }>();

const SAMPLE_WAEC_TEXT = `WEST AFRICAN EXAMINATIONS COUNCIL
SENIOR SCHOOL CERTIFICATE EXAMINATION
EXAM. NO.: 4250101234001
CENTRE NO.: 4250101
CENTRE NAME: GOVERNMENT COLLEGE IBADAN
NAME: ADEGOKE RASHEED OLUWASEUN
DATE OF BIRTH: 15/07/2002
EXAM YEAR: 2023
DIET: MAY/JUNE

SUBJECT                          GRADE
ENGLISH LANGUAGE                 B3
MATHEMATICS                      A1
PHYSICS                          B2
CHEMISTRY                        B3
BIOLOGY                          C4
GEOGRAPHY                        C5
ECONOMICS                        B3
COMMERCE                         A1
FURTHER MATHEMATICS              C6
`;

const SAMPLE_NECO_TEXT = `NATIONAL EXAMINATIONS COUNCIL
SENIOR SCHOOL CERTIFICATE
REG. NO.: 30000123456
CENTRE: GOVERNMENT SECONDARY SCHOOL ABUJA
NAME: OKAFOR CHINEDU PRINCE
EXAM YEAR: 2023

SUBJECT            SCORE   GRADE
ENGLISH LANGUAGE    72      B2
MATHEMATICS         85      A1
PHYSICS             68      C4
CHEMISTRY           74      B2
BIOLOGY             80      A1
GEOGRAPHY           65      C5
`;

FIXTURES.set('waec_sample_2023.pdf', {
  text: SAMPLE_WAEC_TEXT,
  pages: 1,
  providerConfidence: 95,
});

FIXTURES.set('neco_sample_2023.pdf', {
  text: SAMPLE_NECO_TEXT,
  pages: 1,
  providerConfidence: 92,
});

export class MockProvider extends BaseProvider {
  constructor() {
    super();
    if (process.env.NODE_ENV !== 'test') {
      throw new ProviderUnavailableError(
        'mock',
        'mock provider instantiated outside NODE_ENV=test',
      );
    }
  }

  get name(): string {
    return 'mock';
  }

  supportsMime(): boolean {
    return true;
  }

  async extractText({ filename }: ExtractionInput): Promise<ExtractionResult> {
    const key = (filename || '').toLowerCase();
    const fixture = FIXTURES.get(key) || FIXTURES.get('waec_sample_2023.pdf')!;
    return {
      text: fixture.text,
      pages: fixture.pages,
      providerPayload: { fixture: key },
      providerConfidence: fixture.providerConfidence,
    };
  }

  static registerFixture(name: string, payload: { text: string; pages: number; providerConfidence: number }) {
    FIXTURES.set(name.toLowerCase(), payload);
  }

  static clearFixtures() {
    FIXTURES.clear();
  }
}

export default MockProvider;
