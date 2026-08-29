/**
 * Read-time mapping from a saved AiRequest row to IntelligenceReport props.
 * Does not rewrite stored output_data. Does not re-analyse or re-score.
 */

export function savedIntelligenceReportFromRow(row) {
  if (!row || typeof row !== 'object') return null;
  const stored = row.output_data || row.outputData || null;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
  return {
    ...stored,
    confidenceProvenance: {
      level: row.confidenceLevel ?? stored.confidence?.level ?? null,
      source: row.confidenceLevelSource ?? null,
      modelVersion: row.confidenceModelVersion ?? null,
      legacy: Boolean(row.confidenceLevelIsLegacyEstimate),
    },
  };
}
