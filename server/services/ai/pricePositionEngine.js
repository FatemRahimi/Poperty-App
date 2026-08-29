/**
 * Price position analysis — compares asking price to evidence-backed valuation range.
 */

const { createProvenance } = require('../../utils/provenance');

const THRESHOLDS = {
  fairBandPct: 3,
  moderateBandPct: 7,
};

function calculatePricePosition(askingPrice, valuation) {
  if (!askingPrice || askingPrice <= 0) {
    return {
      success: false,
      message: 'No asking price available for price position analysis.',
    };
  }

  if (!valuation?.success) {
    return {
      success: false,
      message: valuation?.message || 'Valuation unavailable — cannot assess price position.',
      askingPrice,
    };
  }

  const central = valuation.centralEstimate?.value ?? valuation.centralEstimate;
  const lower = valuation.lowerEstimate?.value ?? valuation.lowerEstimate;
  const upper = valuation.upperEstimate?.value ?? valuation.upperEstimate;

  if (!central || central <= 0) {
    return {
      success: false,
      message: 'Central valuation estimate unavailable.',
      askingPrice,
    };
  }

  const diffPct = ((askingPrice - central) / central) * 100;
  const diffAmount = askingPrice - central;

  let position = 'fairly_priced';
  let label = 'Fairly priced';
  let summary = 'Asking price is within the estimated market value range.';

  if (Number.isFinite(lower) && askingPrice < lower) {
    position = 'potentially_underpriced';
    label = 'Potentially underpriced';
    summary = 'Asking price is below the lower bound of the evidence-based valuation range.';
  } else if (Number.isFinite(upper) && askingPrice > upper) {
    position = 'potentially_overpriced';
    label = 'Potentially overpriced';
    summary = 'Asking price exceeds the upper bound of the evidence-based valuation range.';
  } else if (diffPct <= -THRESHOLDS.moderateBandPct) {
    position = 'potentially_underpriced';
    label = 'Potentially underpriced';
    summary = `Asking price is approximately ${Math.abs(diffPct).toFixed(1)}% below the central estimate.`;
  } else if (diffPct >= THRESHOLDS.moderateBandPct) {
    position = 'potentially_overpriced';
    label = 'Potentially overpriced';
    summary = `Asking price is approximately ${diffPct.toFixed(1)}% above the central estimate.`;
  } else if (Math.abs(diffPct) <= THRESHOLDS.fairBandPct) {
    position = 'fairly_priced';
    label = 'Fairly priced';
    summary = 'Asking price aligns closely with the central market estimate.';
  }

  const whyFactors = [];

  if (valuation.pricePerSqft?.value && valuation.localPricePerSqft) {
    const implied = valuation.pricePerSqft.value;
    const localAvg = valuation.localPricePerSqft.average;
    if (implied > localAvg * 1.05) {
      whyFactors.push({
        type: 'negative',
        text: `Property implied £/sq ft (£${implied.toLocaleString()}) is above local median (£${Math.round(localAvg).toLocaleString()}).`,
      });
    } else if (implied < localAvg * 0.95) {
      whyFactors.push({
        type: 'positive',
        text: `Property implied £/sq ft (£${implied.toLocaleString()}) is below local median (£${Math.round(localAvg).toLocaleString()}).`,
      });
    }
  }

  if (valuation.internalComparables?.length) {
    const avgComp =
      valuation.internalComparables.reduce((s, c) => s + c.price, 0) /
      valuation.internalComparables.length;
    if (askingPrice > avgComp * 1.05) {
      whyFactors.push({
        type: 'negative',
        text: 'Asking price is above the average of similar internal comparable listings.',
      });
    } else if (askingPrice < avgComp * 0.95) {
      whyFactors.push({
        type: 'positive',
        text: 'Asking price is below the average of similar internal comparable listings.',
      });
    }
  }

  if (diffPct > 0) {
    whyFactors.push({
      type: 'negative',
      text: `Asking price exceeds central estimate by £${Math.abs(Math.round(diffAmount)).toLocaleString()} (${diffPct.toFixed(1)}%).`,
    });
  } else if (diffPct < 0) {
    whyFactors.push({
      type: 'positive',
      text: `Asking price is £${Math.abs(Math.round(diffAmount)).toLocaleString()} (${Math.abs(diffPct).toFixed(1)}%) below central estimate.`,
    });
  }

  whyFactors.push({
    type: 'neutral',
    text: `Based on ${valuation.evidenceCount} evidence source${valuation.evidenceCount === 1 ? '' : 's'} with ${valuation.confidence} confidence.`,
  });

  return {
    success: true,
    askingPrice,
    position,
    label,
    summary,
    differenceFromCentral: {
      amount: Math.round(diffAmount),
      percent: Math.round(diffPct * 10) / 10,
    },
    valuationRange: { lower, central, upper },
    whyFactors,
    provenance: createProvenance({
      source: 'BlendedEvidence',
      method: 'price_position_vs_valuation_range',
      confidence: valuation.confidence,
      notes: 'Position derived deterministically from asking price vs valuation range',
    }),
    disclaimer:
      'Price position is indicative based on available evidence — not a guarantee of market outcome.',
  };
}

module.exports = { calculatePricePosition, THRESHOLDS };
