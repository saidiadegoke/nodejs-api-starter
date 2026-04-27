/**
 * Final candidate number: 2-digit session year short + 3-digit university JUPEB prefix + 4+ digit serial.
 * Must satisfy DB check `^[0-9]{2}[0-9]{3}[0-9]{4,}$`.
 */
function formatCandidateNumber(yearShort, jupebPrefix, provisionalSerial) {
  const ys = String(yearShort ?? '')
    .replace(/\D/g, '')
    .slice(-2)
    .padStart(2, '0');
  const pref = String(jupebPrefix ?? '')
    .replace(/\D/g, '')
    .slice(0, 3)
    .padStart(3, '0');
  const ser = Math.max(0, parseInt(provisionalSerial, 10) || 0);
  return `${ys}${pref}${String(ser).padStart(4, '0')}`;
}

module.exports = { formatCandidateNumber };
