import React, { useState } from 'react';
import './PostcodeIntelligence.css';

const fmt = (n) => (n != null && !Number.isNaN(Number(n)) ? `£${Number(n).toLocaleString()}` : '—');
const fmtPct = (n) => (n != null ? `${n}%` : '—');

const SOURCE_LABELS = {
  PropertyData: 'PropertyData',
  propertydata: 'PropertyData',
  HM_Land_Registry: 'HM Land Registry',
  'HM Land Registry': 'HM Land Registry',
  hmlr: 'HM Land Registry',
  Marketplace: 'Marketplace',
  marketplace: 'Marketplace',
};

/** Unique human-readable source labels — no repeated provider noise. */
export function uniqueAreaSources(dataSources = []) {
  const seen = new Set();
  const out = [];
  (dataSources || []).forEach((raw) => {
    if (raw == null || raw === '') return;
    const key = String(raw).trim();
    const label = SOURCE_LABELS[key] || key.replace(/_/g, ' ');
    const dedupe = label.toLowerCase();
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    out.push(label);
  });
  const preferred = ['HM Land Registry', 'PropertyData', 'Marketplace'];
  return out.sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    const ao = ai === -1 ? 99 : ai;
    const bo = bi === -1 ? 99 : bi;
    return ao - bo || a.localeCompare(b);
  });
}

export function areaSoldPriceLabel() {
  return 'Typical local sold price';
}

function ConfidenceBadge({ confidence, scoped = false }) {
  if (!confidence?.level) return null;
  const slug = confidence.level.toLowerCase().replace(/\s+/g, '-');
  return (
    <span
      className={`pi-pc-conf pi-pc-conf--${slug}`}
      title={confidence.note || confidence.summary || confidence.unassessedReason}
      data-testid={scoped ? 'area-evidence-strength-badge' : undefined}
    >
      {scoped ? (
        <>
          <span className="pi-pc-conf-scope">Area evidence strength</span>
          <span className="pi-pc-conf-level">{confidence.level}</span>
        </>
      ) : (
        confidence.level
      )}
    </span>
  );
}

function Provenance({ metric }) {
  if (!metric) return null;
  const bits = [];
  if (metric.source) bits.push(SOURCE_LABELS[metric.source] || metric.source.replace(/_/g, ' '));
  if (metric.underlyingSource) {
    bits.push(SOURCE_LABELS[metric.underlyingSource] || metric.underlyingSource.replace(/_/g, ' '));
  }
  if (metric.sampleSize != null) {
    bits.push(`${metric.sampleSize} record${metric.sampleSize === 1 ? '' : 's'}`);
  }
  if (metric.observationPeriod) bits.push(metric.observationPeriod);
  if (metric.confidence?.level) bits.push(`Area evidence: ${metric.confidence.level}`);
  if (!bits.length) return null;

  const uniqueBits = [];
  const seen = new Set();
  bits.forEach((b) => {
    const k = b.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    uniqueBits.push(b);
  });

  return (
    <p className="pi-pc-source">
      {uniqueBits.join(' · ')}
      {metric.sparseEvidence && <span className="pi-pc-sparse"> Limited evidence</span>}
    </p>
  );
}

function SnapshotTile({ label, value, hint, source, metric, testId }) {
  return (
    <div
      className={`pi-pc-snapshot-tile ${metric?.sparseEvidence ? 'pi-pc-snapshot-tile--sparse' : ''}`}
      data-testid={testId}
    >
      <small>{label}</small>
      <strong>{value}</strong>
      {hint && <span className="pi-pc-hint">{hint}</span>}
      {metric?.sparseEvidence && metric?.available && (
        <span className="pi-pc-sparse">
          Limited evidence — {metric.sampleSize} record{metric.sampleSize === 1 ? '' : 's'}
        </span>
      )}
      {metric?.observationPeriod && <span className="pi-pc-source">{metric.observationPeriod}</span>}
      {source && <span className="pi-pc-source">{source}</span>}
    </div>
  );
}

function SegmentYieldRow({ segment }) {
  const y = segment.indicativeGrossYield;
  if (!y?.available) return null;
  return (
    <div className={`pi-pc-segment-row ${y.sparseEvidence ? 'pi-pc-segment-row--sparse' : ''}`}>
      <div>
        <strong>{segment.label}</strong>
        <p className="pi-pc-hint">
          {segment.typicalValue?.available &&
            `${areaSoldPriceLabel()} ${fmt(segment.typicalValue.value)}`}
          {segment.typicalRent?.available && ` · Typical local asking rent ${fmt(segment.typicalRent.value)}/mo`}
        </p>
        <p className="pi-pc-hint">
          {y.saleSampleSize} sale · {y.rentSampleSize} rental record
          {y.rentSampleSize === 1 ? '' : 's'}
        </p>
        {y.caution && <p className="pi-pc-sparse">{y.caution}</p>}
      </div>
      <div className="pi-pc-segment-yield">
        <strong>{fmtPct(y.grossYieldPercent)}</strong>
        <small>area gross yield</small>
        {y.confidence && <ConfidenceBadge confidence={y.confidence} />}
      </div>
    </div>
  );
}

function ExpandableSection({ title, children, defaultOpen = false, testId }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`pi-pc-expand ${open ? 'open' : ''}`} data-testid={testId}>
      <button type="button" className="pi-pc-expand-head" onClick={() => setOpen(!open)}>
        {title}
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && <div className="pi-pc-expand-body">{children}</div>}
    </div>
  );
}

function OverviewTab({ data }) {
  const snap = data.snapshot || {};
  const shortLead =
    'Local sold prices, asking rents and listings for this postcode — not a valuation of a specific property.';
  return (
    <div className="pi-pc-tab-panel">
      <div className="pi-pc-snapshot-grid">
        <SnapshotTile
          label={areaSoldPriceLabel()}
          value={snap.typicalValue?.available ? fmt(snap.typicalValue.value) : '—'}
          hint={snap.typicalValue?.label || 'Area sold-price context'}
          metric={snap.typicalValue}
          testId="area-typical-sold-price"
        />
        <SnapshotTile
          label="Typical local asking rent"
          value={snap.typicalRent?.available ? `${fmt(snap.typicalRent.value)}/mo` : '—'}
          hint={snap.typicalRent?.label || 'Area asking-rent context — not achievable property rent'}
          metric={snap.typicalRent}
          testId="area-typical-asking-rent"
        />
        <SnapshotTile
          label="Indicative area yield"
          value={
            snap.indicativeAreaYield?.available
              ? fmtPct(snap.indicativeAreaYield.grossYieldPercent)
              : '—'
          }
          hint={snap.indicativeAreaYield?.label}
          source="Area indicator only — not property-specific"
        />
        <SnapshotTile
          label="Market evidence"
          value={snap.marketEvidenceCount ?? '—'}
          hint="Area records counted"
        />
        <SnapshotTile
          label="Listing supply"
          value={snap.listingSupply?.total ?? 0}
          hint={`${snap.listingSupply?.sale || 0} sale · ${snap.listingSupply?.rent || 0} rent`}
          source="Marketplace only"
        />
        <SnapshotTile
          label="Area evidence strength"
          value={snap.confidence?.level || data.confidence?.level || '—'}
          hint={snap.confidence?.summary || data.confidence?.summary || 'Of area market evidence only'}
          testId="area-evidence-strength-tile"
        />
      </div>

      {!data.externalAvailable && (
        <div className="pi-pc-alert">
          <strong>External market data unavailable</strong>
          <p>{data.externalMessage || 'Statistics may reflect our marketplace listings only.'}</p>
        </div>
      )}

      <p className="pi-pc-summary-lead" data-testid="area-market-summary-lead">
        {shortLead}
      </p>
      {data.marketSummary && (
        <ExpandableSection title="More area detail" defaultOpen={false} testId="area-market-summary-detail">
          <p className="pi-pc-summary">{data.marketSummary}</p>
          <p className="pi-pc-hint">
            Area demand is not property-specific demand. Area asking rent is not achievable property rent.
          </p>
        </ExpandableSection>
      )}

      {snap.soldPriceEvidence?.available && (
        <ExpandableSection title="Recent sold-price evidence (HM Land Registry)">
          <p>
            Average sold price: <strong>{fmt(snap.soldPriceEvidence.average)}</strong>
            {snap.soldPriceEvidence.sampleSize != null && (
              <span className="pi-pc-hint"> · {snap.soldPriceEvidence.sampleSize} records</span>
            )}
          </p>
          {snap.soldPriceEvidence.range && (
            <p className="pi-pc-hint">
              Range {fmt(snap.soldPriceEvidence.range.low)} – {fmt(snap.soldPriceEvidence.range.high)}
            </p>
          )}
          <Provenance metric={snap.soldPriceEvidence} />
        </ExpandableSection>
      )}

      {snap.pricePerSqft?.available && (
        <ExpandableSection title="Typical area £/sq ft">
          <p>
            <strong>{fmt(snap.pricePerSqft.average)}</strong>/sq ft
          </p>
          <Provenance metric={snap.pricePerSqft} />
        </ExpandableSection>
      )}

      {snap.propertyTypeDistribution?.distribution?.length > 0 && (
        <ExpandableSection title="Property-type distribution">
          <ul className="pi-pc-list">
            {snap.propertyTypeDistribution.distribution.map(({ label, count }) => (
              <li key={label}>
                {label}: {count}
              </li>
            ))}
          </ul>
          <Provenance metric={snap.propertyTypeDistribution} />
        </ExpandableSection>
      )}

      {snap.epc?.available && (
        <ExpandableSection title="EPC (marketplace listings)">
          <ul className="pi-pc-list">
            {snap.epc.distribution.map(({ label, count }) => (
              <li key={label}>
                {label}: {count}
              </li>
            ))}
          </ul>
          <Provenance metric={snap.epc} />
        </ExpandableSection>
      )}
    </div>
  );
}

function SalesTab({ sales, externalAvailable }) {
  if (!sales?.available) {
    return <p className="pi-pc-muted">Insufficient sale evidence for this postcode.</p>;
  }
  return (
    <div className="pi-pc-tab-panel">
      {sales.external?.soldPrices && (
        <div className="pi-pc-evidence-block">
          <h4>External sold prices (area)</h4>
          <p>
            Average: <strong>{fmt(sales.external.soldPrices.average)}</strong>
            {sales.external.soldPrices.sampleSize != null && (
              <span className="pi-pc-hint"> · {sales.external.soldPrices.sampleSize} HM Land Registry records</span>
            )}
          </p>
          {sales.external.soldPricesPerSqft && (
            <p className="pi-pc-hint">
              £/sq ft avg: {fmt(sales.external.soldPricesPerSqft.averagePerSqft)}
            </p>
          )}
        </div>
      )}
      {!externalAvailable && sales.external?.message && (
        <p className="pi-pc-muted">{sales.external.message}</p>
      )}
      {sales.internal?.askingPrices?.sampleSize > 0 && (
        <div className="pi-pc-evidence-block">
          <h4>Marketplace asking prices (area)</h4>
          <p>
            Median <strong>{fmt(sales.internal.askingPrices.median)}</strong>
            {' · '}
            {sales.internal.askingPrices.sampleSize} listing{sales.internal.askingPrices.sampleSize === 1 ? '' : 's'}
          </p>
          <ConfidenceBadge confidence={sales.internal.askingPrices.confidence} />
          <Provenance metric={sales.internal.askingPrices} />
        </div>
      )}
      {sales.external?.recentTransactions?.length > 0 && (
        <ExpandableSection title="Recent sold transactions">
          <ul className="pi-pc-list">
            {sales.external.recentTransactions.slice(0, 8).map((t) => (
              <li key={t.id}>
                {t.address || 'Address withheld'} — {fmt(t.price)}
                {t.sold_date ? ` · ${t.sold_date}` : ''}
              </li>
            ))}
          </ul>
        </ExpandableSection>
      )}
      {sales.priceTrend?.message && <p className="pi-pc-muted">{sales.priceTrend.message}</p>}
    </div>
  );
}

function RentalTab({ rental }) {
  if (!rental?.available) {
    return (
      <p className="pi-pc-muted">
        {rental?.internal?.sampleSize === 0
          ? 'No rental listings on our platform in this postcode.'
          : 'Insufficient rental evidence.'}
      </p>
    );
  }
  const r = rental.internal;
  return (
    <div className="pi-pc-tab-panel">
      <p>
        Typical local asking rent: <strong>{fmt(r.medianMonthly)}/mo</strong>
        {r.range?.low != null && (
          <span className="pi-pc-hint">
            {' '}
            · Range {fmt(r.range.low)} – {fmt(r.range.high)}
          </span>
        )}
      </p>
      <p className="pi-pc-hint">
        Based on {r.sampleSize} marketplace rental listing{r.sampleSize === 1 ? '' : 's'}. Area asking rent is
        not achievable property rent.
      </p>
      <Provenance metric={r} />
      {r.bySegment?.length > 0 && (
        <ExpandableSection title="Rent by property segment" defaultOpen>
          <ul className="pi-pc-list">
            {r.bySegment.map((s) => (
              <li key={s.label}>
                {s.label}: {fmt(s.medianMonthly)}/mo ({s.sampleSize} listing{s.sampleSize === 1 ? '' : 's'})
              </li>
            ))}
          </ul>
        </ExpandableSection>
      )}
      {rental.external?.message && <p className="pi-pc-muted">{rental.external.message}</p>}
    </div>
  );
}

function InvestmentTab({ investment, lease }) {
  return (
    <div className="pi-pc-tab-panel">
      <p className="pi-pc-hint" data-testid="area-yield-tab-note">
        Area yield indicators only — not a Let / Invest property assessment.
      </p>
      {investment?.indicativeAreaYield?.available && (
        <div className="pi-pc-yield-banner">
          <small>{investment.indicativeAreaYield.label}</small>
          <strong>{fmtPct(investment.indicativeAreaYield.grossYieldPercent)}</strong>
          <p className="pi-pc-hint">{investment.indicativeAreaYield.disclaimer}</p>
          {investment.indicativeAreaYield.caution && (
            <p className="pi-pc-sparse">{investment.indicativeAreaYield.caution}</p>
          )}
          <p className="pi-pc-source">
            Rent basis: {investment.indicativeAreaYield.rentSampleSize} record
            {investment.indicativeAreaYield.rentSampleSize === 1 ? '' : 's'} ·{' '}
            {investment.indicativeAreaYield.rentObservationPeriod}
          </p>
          <p className="pi-pc-source">
            Sale basis: {investment.indicativeAreaYield.saleSampleSize} record
            {investment.indicativeAreaYield.saleSampleSize === 1 ? '' : 's'} ·{' '}
            {investment.indicativeAreaYield.saleObservationPeriod}
          </p>
        </div>
      )}
      {investment?.segments?.length > 0 && (
        <>
          <h4 className="pi-pc-subhead">Yield by matched segment</h4>
          {investment.segments.map((s) => (
            <SegmentYieldRow key={s.key} segment={s} />
          ))}
          <p className="pi-pc-hint">{investment.priceToRentNote}</p>
        </>
      )}
      {!investment?.available && (
        <p className="pi-pc-muted">Insufficient matched sale and rent evidence for investment indicators.</p>
      )}
      {lease?.available && (
        <ExpandableSection title="Commercial lease (separate)">
          <p>{lease.disclaimer}</p>
          <p>
            Median lease rent: <strong>{fmt(lease.rent?.medianMonthly)}/mo</strong> ({lease.listingCount} listings)
          </p>
          <Provenance metric={lease.rent} />
        </ExpandableSection>
      )}
    </div>
  );
}

const TABS = [
  { id: 'overview', label: 'Area overview' },
  { id: 'sales', label: 'Area sales' },
  { id: 'rental', label: 'Area rental' },
  { id: 'investment', label: 'Area yield' },
];

/**
 * @param {'primary' | 'secondary'} mode
 *   primary = postcode-only (no exact property selected)
 *   secondary = exact property already selected / compact report embed
 */
export default function PostcodeIntelligencePanel({
  intelligence,
  compact = false,
  mode = 'primary',
  hasExactMatches = false,
  onSelectProperty = null,
}) {
  const [tab, setTab] = useState('overview');
  if (!intelligence?.success) return null;

  const postcode = intelligence.postcode || '';
  const isPrimary = mode === 'primary' && !compact;
  const sources = uniqueAreaSources(intelligence.dataSources);
  const selectLabel = postcode
    ? `Select a property in ${postcode}`
    : 'Select a property';

  return (
    <section
      className={`pi-pc-panel ${compact || !isPrimary ? 'pi-pc-panel--secondary' : ''} ${
        compact ? 'pi-pc-panel--compact' : ''
      } ${isPrimary ? 'pi-pc-panel--area-primary' : ''}`}
      aria-label={isPrimary ? `Area context ${postcode}` : 'Area market context'}
      data-testid="area-context-panel"
      data-mode={isPrimary ? 'area-context' : 'area-secondary'}
    >
      <header className="pi-pc-header" data-testid="area-context-header">
        <div>
          <p className="pi-pc-kicker" data-testid="area-context-kicker">
            Area context{postcode ? ` — ${postcode}` : ''}
          </p>
          <h3 data-testid="area-context-title">
            {isPrimary
              ? `${postcode || 'This postcode'} — local market snapshot`
              : intelligence.title || postcode || 'Area market snapshot'}
          </h3>
          <p className="pi-pc-lead" data-testid="area-context-lead">
            Local market snapshot — not a specific property.
          </p>
          {sources.length > 0 && (
            <p className="pi-pc-sources-compact" data-testid="area-sources-compact">
              Sources ({sources.length})
              <span> {sources.join(' · ')}</span>
            </p>
          )}
        </div>
        {(intelligence.confidence?.level || intelligence.snapshot?.confidence?.level) && (
          <ConfidenceBadge
            confidence={intelligence.confidence || intelligence.snapshot?.confidence}
            scoped
          />
        )}
      </header>

      {isPrimary && (
        <div className="pi-pc-primary-cta" data-testid="area-select-property-cta">
          {hasExactMatches && typeof onSelectProperty === 'function' ? (
            <button type="button" className="ai-btn ai-btn-primary pi-pc-select-btn" onClick={onSelectProperty}>
              {selectLabel}
            </button>
          ) : (
            <div className="pi-pc-select-fallback" role="status">
              <p className="pi-pc-select-fallback-title">{selectLabel}</p>
              <p className="pi-pc-hint">
                No exact property match yet. Refine the address above, or browse platform listings below.
              </p>
            </div>
          )}
          <p className="pi-pc-hint pi-pc-cta-note">
            Individual Property Intelligence starts only after you choose an exact property — not from this
            area snapshot.
          </p>
        </div>
      )}

      <details className="pi-pc-metrics-disclosure" open={isPrimary} data-testid="area-metrics-disclosure">
        <summary>{isPrimary ? 'Area snapshot metrics' : 'Show area snapshot'}</summary>
        <div className="pi-pc-tabs" role="tablist" aria-label="Area context views">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`pi-pc-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pi-pc-tab-content" role="tabpanel">
          {tab === 'overview' && <OverviewTab data={intelligence} />}
          {tab === 'sales' && (
            <SalesTab sales={intelligence.sales} externalAvailable={intelligence.externalAvailable} />
          )}
          {tab === 'rental' && <RentalTab rental={intelligence.rental} />}
          {tab === 'investment' && (
            <InvestmentTab investment={intelligence.investment} lease={intelligence.lease} />
          )}
        </div>
      </details>

      <footer className="pi-pc-methodology">
        <ExpandableSection title="Sources & limitations" defaultOpen={false}>
          <p>{intelligence.methodology?.summary}</p>
          <ul className="pi-pc-list">
            {(intelligence.disclaimers || []).map((d) => (
              <li key={d}>{d}</li>
            ))}
            <li>Area context is not Individual Property Intelligence.</li>
            <li>Area asking rent is not achievable property rent.</li>
            <li>Area demand is not property-specific tenant demand.</li>
          </ul>
          {sources.length > 0 && (
            <p className="pi-pc-sources-compact" data-testid="area-sources-footer">
              Sources ({sources.length}): {sources.join(' · ')}
            </p>
          )}
        </ExpandableSection>
      </footer>
    </section>
  );
}
