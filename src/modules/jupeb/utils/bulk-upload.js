/**
 * Tiny CSV parser supporting quoted fields, escaped quotes, CR/LF lines.
 * Header keys are lowercased + trimmed. Returns an array of row objects.
 */
function parseCsv(text) {
  if (!text || !String(text).trim()) return [];
  const src = String(text).replace(/\r\n?/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    field += ch;
  }
  // Trailing field/row
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Drop trailing all-empty rows
  while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop();
  if (!rows.length) return [];
  const headerRow = rows[0].map((h) => String(h).trim().toLowerCase());
  return rows.slice(1).map((cells) => {
    const obj = {};
    for (let i = 0; i < headerRow.length; i += 1) {
      obj[headerRow[i]] = cells[i] !== undefined ? cells[i] : '';
    }
    return obj;
  });
}

/**
 * Process an array of rows in sequence, calling `processor(row, index)` for each.
 * Errors are captured per-row and don't short-circuit. Optional `maxRows` guards
 * against accidental large uploads — exceeding throws `{ status: 413, code: 'too_many_rows' }`.
 *
 * Resolves to:
 *   { total, succeeded, failed, outcomes: [{ row, ok, data?, error_code?, error_message? }] }
 */
async function runBulk(rows, processor, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const maxRows = Number.isFinite(opts.maxRows) ? opts.maxRows : 1000;
  if (list.length > maxRows) {
    const err = new Error(`Bulk upload exceeds limit (${maxRows})`);
    err.status = 413;
    err.code = 'too_many_rows';
    throw err;
  }
  const outcomes = [];
  let succeeded = 0;
  let failed = 0;
  for (let i = 0; i < list.length; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const data = await processor(list[i], i);
      outcomes.push({ row: i + 1, ok: true, data });
      succeeded += 1;
    } catch (err) {
      outcomes.push({
        row: i + 1,
        ok: false,
        error_code: err.code || 'error',
        error_message: err.message || String(err),
      });
      failed += 1;
    }
  }
  return { total: list.length, succeeded, failed, outcomes };
}

module.exports = { parseCsv, runBulk };
