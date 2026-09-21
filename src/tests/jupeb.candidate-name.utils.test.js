const { resolveCandidateDisplayName } = require('../modules/jupeb/utils/candidate-name');

describe('resolveCandidateDisplayName', () => {
  it('uses NIN names when verified even if intake differs', () => {
    expect(resolveCandidateDisplayName({
      ninPayload: { first_name: 'John', last_name: 'Doe' },
      intake: { name: 'James Bonds' },
      profile: { first_name: 'James', last_name: 'Bonds', display_name: 'James Bonds' },
      ninStatus: 'verified',
    })).toBe('John Doe');
  });

  it('uses intake name when verification is pending', () => {
    expect(resolveCandidateDisplayName({
      ninPayload: {},
      intake: { name: 'Adebayo Salami' },
      profile: { first_name: 'Other', last_name: 'Person' },
      ninStatus: 'pending',
    })).toBe('Adebayo Salami');
  });

  it('falls back to profile when pending and intake has no name', () => {
    expect(resolveCandidateDisplayName({
      intake: {},
      profile: { first_name: 'Profile', last_name: 'Name' },
      ninStatus: 'pending',
    })).toBe('Profile Name');
  });

  it('supports pre-joined ninFullName for list views', () => {
    expect(resolveCandidateDisplayName({
      intake: { name: 'James Bonds' },
      ninFullName: 'Mock1234 Candidate',
      ninStatus: 'verified',
    })).toBe('Mock1234 Candidate');
  });

  it('falls back to profile name when NIN is verified but payload is purged post-approval', () => {
    expect(resolveCandidateDisplayName({
      ninPayload: {},
      ninFullName: null,
      intake: { name: 'jamie Croix' },
      profile: { display_name: 'SADIYA UMAR', first_name: 'SADIYA', last_name: 'UMAR' },
      ninStatus: 'verified',
    })).toBe('SADIYA UMAR');
  });

  it('falls back to profile first and last name when display_name is absent and payload is purged', () => {
    expect(resolveCandidateDisplayName({
      ninPayload: {},
      ninFullName: null,
      intake: { name: 'jamie Croix' },
      profile: { first_name: 'SADIYA', last_name: 'UMAR' },
      ninStatus: 'verified',
    })).toBe('SADIYA UMAR');
  });

  it('falls back to intake name if both ninPayload and profile are empty for verified NIN', () => {
    expect(resolveCandidateDisplayName({
      ninPayload: {},
      ninFullName: null,
      intake: { name: 'jamie Croix' },
      profile: {},
      ninStatus: 'verified',
    })).toBe('jamie Croix');
  });
});
