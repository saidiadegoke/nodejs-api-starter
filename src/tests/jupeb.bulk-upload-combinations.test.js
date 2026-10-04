describe('Bulk Upload Combination Code Parsing', () => {
  function parseCombinationInput(rawInput) {
    if (!rawInput) {
      return {
        raw: '',
        codePart: '',
        codeCandidates: [],
        subjectTokens: [],
      };
    }
    const raw = String(rawInput).trim().replace(/^['’`"]+|['’`"]+$/g, '').trim();

    let subjectTokens = [];

    const bracketMatch = raw.match(/[([]([^)\]]+)[)\]]/);
    if (bracketMatch) {
      subjectTokens = bracketMatch[1]
        .split(/[,/|+]/)
        .map((s) => s.trim())
        .filter(Boolean);
    }

    let codeWithoutBrackets = raw.replace(/[([][^)\]]*[)\]]/g, '').trim();
    codeWithoutBrackets = codeWithoutBrackets.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();

    if (subjectTokens.length === 0) {
      if (raw.includes('/') || raw.includes('|') || raw.includes('+')) {
        const parts = raw.split(/[/|+]/).map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          subjectTokens = parts;
        }
      } else if (raw.includes(',')) {
        const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          subjectTokens = parts;
        }
      } else if (raw.includes(' - ')) {
        const parts = raw.split(' - ').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          subjectTokens = parts;
        }
      }
    }

    const codeCandidates = new Set();
    if (codeWithoutBrackets) {
      codeCandidates.add(codeWithoutBrackets.toLowerCase());
      const noJupeb = codeWithoutBrackets.replace(/^jupeb[\s_-]*/i, '').trim();
      if (noJupeb) {
        codeCandidates.add(noJupeb.toLowerCase());
        codeCandidates.add(noJupeb.replace(/[\s_-]+/g, '').toLowerCase());
      }
      if (!/^jupeb/i.test(codeWithoutBrackets)) {
        codeCandidates.add(`jupeb ${codeWithoutBrackets}`.toLowerCase());
        codeCandidates.add(`jupeb-${codeWithoutBrackets}`.toLowerCase());
      }
    }

    return {
      raw,
      codePart: codeWithoutBrackets,
      codeCandidates: Array.from(codeCandidates),
      subjectTokens,
    };
  }

  it('correctly parses dropdown format with shared prefix and distinct subjects in parentheses', () => {
    const res1 = parseCombinationInput('JUPEB SC-001 - (BIO / GOV / LIT)');
    expect(res1.subjectTokens).toEqual(['BIO', 'GOV', 'LIT']);
    expect(res1.codeCandidates).toContain('jupeb sc-001');
    expect(res1.codeCandidates).toContain('sc-001');

    const res2 = parseCombinationInput('JUPEB SC-001 - (MAT / GOV / LIT)');
    expect(res2.subjectTokens).toEqual(['MAT', 'GOV', 'LIT']);

    const res3 = parseCombinationInput('JUPEB SC-001 - (CRS / YOR / LIT)');
    expect(res3.subjectTokens).toEqual(['CRS', 'YOR', 'LIT']);

    const res4 = parseCombinationInput('JUPEB SC-001 - (CRS / GOV / LIT)');
    expect(res4.subjectTokens).toEqual(['CRS', 'GOV', 'LIT']);
  });

  it('correctly parses plain subject lists', () => {
    const res1 = parseCombinationInput('BIO / GOV / LIT');
    expect(res1.subjectTokens).toEqual(['BIO', 'GOV', 'LIT']);

    const res2 = parseCombinationInput('MAT, GOV, LIT');
    expect(res2.subjectTokens).toEqual(['MAT', 'GOV', 'LIT']);

    const res3 = parseCombinationInput('CRS - YOR - LIT');
    expect(res3.subjectTokens).toEqual(['CRS', 'YOR', 'LIT']);
  });
});
