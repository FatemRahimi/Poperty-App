/**
 * Data quality assessment for AI analyses.
 */

function assessDataQuality({ comparableCount = 0, fieldsPresent = 0, fieldsTotal = 1, recencyDays = null }) {
  const completeness = fieldsTotal > 0 ? fieldsPresent / fieldsTotal : 0;
  let score = 0;

  if (comparableCount >= 20) score += 40;
  else if (comparableCount >= 10) score += 30;
  else if (comparableCount >= 5) score += 20;
  else if (comparableCount >= 1) score += 10;

  score += completeness * 40;

  if (recencyDays !== null) {
    if (recencyDays <= 45) score += 20;
    else if (recencyDays <= 90) score += 12;
    else if (recencyDays <= 180) score += 5;
  } else {
    score += 8;
  }

  let level = 'Low';
  if (score >= 75) level = 'High';
  else if (score >= 45) level = 'Medium';

  return {
    level,
    score: Math.round(score),
    comparableCount,
    completeness: Math.round(completeness * 100),
    recencyDays,
    summary:
      comparableCount === 0
        ? 'Insufficient comparable data for a reliable estimate.'
        : `${comparableCount} comparable propert${comparableCount === 1 ? 'y' : 'ies'} · Data quality: ${level.toUpperCase()}`,
  };
}

module.exports = { assessDataQuality };
