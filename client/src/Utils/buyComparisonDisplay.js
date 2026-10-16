/**
 * Display selector for a server-produced BUY comparison.
 * Does not compare evidence or calculate a difference.
 */

const CONCLUSION = 'No purchase winner is determined from the current evidence.';

export function buyComparisonView(comparison) {
  if (!comparison || typeof comparison !== 'object') {
    return {
      conclusion: CONCLUSION,
      subjects: [],
      columns: [],
      observations: [],
      limited: true,
    };
  }
  const subjects = Array.isArray(comparison.subjects) ? comparison.subjects : [];
  return {
    conclusion: typeof comparison.conclusion === 'string' && comparison.conclusion.trim()
      ? comparison.conclusion
      : CONCLUSION,
    subjects,
    columns: (Array.isArray(comparison.columns) ? comparison.columns : [])
      .filter((row) => row && row.id)
      .map((row) => ({
        id: row.id,
        label: row.label || row.id,
        a: row.a == null ? '' : String(row.a),
        b: row.b == null ? '' : String(row.b),
      })),
    observations: (Array.isArray(comparison.observations) ? comparison.observations : [])
      .filter((row) => row && (row.statement || row.title))
      .map((row) => ({
        id: row.id || row.title,
        title: row.title || 'Difference',
        statement: row.statement || '',
        limitation: row.limitation || '',
      })),
    limited: comparison.limited === true,
  };
}
