import { Injectable } from '@nestjs/common';
import { INinProvider, NinVerificationResult } from './nin-provider.interface';

const MOCK_TEST_POOL_RE = /^000000000(0[1-9]|10)$/;

function mockProfileFor(nin: string) {
  const last4 = nin.slice(-4);
  const last8 = nin.slice(-8);
  const phone = `+2348${last8}`;
  return {
    first_name: `Mock${last4}`,
    last_name: 'Candidate',
    middle_name: 'Sample',
    title: 'MR',
    date_of_birth: '1990-01-01',
    gender: 'male',
    height: null,
    marital_status: 'SINGLE',
    religion: null,
    profession: 'STUDENT',
    education_level: null,
    employment_status: null,
    spoken_language: null,
    email: null,
    phone_number: phone,
    phone,
    address: `${last4} Main Street, Lagos, Nigeria`,
    state_of_origin: 'Ondo State',
    lga: 'Ondo West',
    place_of_birth: 'Lagos State',
    birthplace: { country: 'nigeria', state: 'Ondo State', lga: 'Ondo West' },
    residence: {
      address: `${last4} Main Street`,
      town: 'Akure',
      lga: 'Ondo West',
      state: 'Ondo',
      status: null,
    },
    next_of_kin: {
      name: `Jane ${last4}`,
      relationship: 'mother',
      phone: `+2348${last8}`,
      address: `${last4} Main Street, Lagos`,
    },
    photo_url: null,
  };
}

@Injectable()
export class MockNinProvider implements INinProvider {
  readonly name = 'mock';

  private isMockStrict(): boolean {
    const v = process.env.JUPEB_NIN_MOCK_STRICT;
    return v === '1' || String(v).toLowerCase() === 'true';
  }

  async verifyNin(
    normalizedNin: string,
    _options: { provider?: string; force_fresh?: boolean } = {},
  ): Promise<NinVerificationResult> {
    if (!normalizedNin || normalizedNin.length !== 11) {
      return {
        outcome: 'failed',
        error: { code: 'invalid_nin_length', message: 'NIN must be 11 digits' },
      };
    }

    if (normalizedNin === '00000000000' || /^(\d)\1{10}$/.test(normalizedNin)) {
      return {
        outcome: 'failed',
        error: { code: 'invalid_nin', message: 'Invalid NIN: repeating or dummy digits are not valid' },
      };
    }

    if (this.isMockStrict() && !MOCK_TEST_POOL_RE.test(normalizedNin)) {
      return {
        outcome: 'failed',
        error: {
          code: 'nin_not_found',
          message:
            'Mock NIN not found. In mock test mode only 00000000001..00000000010 verify successfully.',
        },
      };
    }

    return {
      outcome: 'verified',
      provider_reference: `mock-ref-${normalizedNin}`,
      profile: mockProfileFor(normalizedNin),
    };
  }
}
