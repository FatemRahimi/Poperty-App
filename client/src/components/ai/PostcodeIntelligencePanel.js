import React, { useState } from 'react';
import './PostcodeIntelligence.css';

const fmt = (n) => (n != null && !Number.isNaN(Number(n)) ? `£${Number(n).toLocaleString()}` : '—');
const fmtPct = (n) => (n != null ? `${n}%` : '—');

function ConfidenceBadge({ confidence }) {
  if (!confidence?.level) return null;
  // "Not assessed" contains a space, which would emit two CSS classes.
  const slug = confidence.level.toLowerCase().replace(/\s+/g, '-');
  return (
    <span
      className={`pi-pc-conf pi-pc-conf--${slug}`}
      title={confidence.note || confidence.summary || confidence.unassessedReason}
    >
      {confidence.level}
    </span>
  );
}

/** Renders the provenance every postcode metric carries. */
function Provenance({ metric }) {
  if (!metric) return null;
  const bits = [];
  if (metric.source) bits.push(metric.source.replace(/_/g, ' '));
  if (metric.underlyingSource) bits.push(metric.underlyingSource);
  if (metric.sampleSize != null) {
    bits.push(`${metric.sampleSize} record${metric.sampleSize === 1 ? '' : 's'}`);
  }
  if (metric.observationPeriod) bits.push(metric.observationPeriod);
  if (metric.confidence?.level) bits.push(`${metric.confidence.level} confidence`);
  if (!bits.length) return null;

  return (
    <p className="pi-pc-source">
      {bits.join(' · ')}
      {metric.sparseEvidence && <span className="pi-pc-sparse"> Limited evidence</span>}
    </p>
  );
}

function SnapshotTile({ label, value, hint, source, metric }) {
  return (
    <div className={`pi-pc-snapshot-tile ${metric?.sparseEvidence ? 'pi-pc-snapshot-tile--sparse' : ''}`}>
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
          {segment.typicalValue?.available && `Typical value ${fmt(segment.typicalValue.value)}`}
          {segment.typicalRent?.available && ` · Rent ${fmt(segment.typicalRent.value)}/mo`}
        </p>
        <p className="pi-pc-hint">
          {y.saleSampleSize} sale · {y.rentSampleSize} rental record
          {y.rentSampleSize === 1 ? '' : 's'}
        </p>
        {y.caution && <p className="pi-pc-sparse">{y.caution}</p>}
      </div>
      <div className="pi-pc-segment-yield">
        <strong>{fmtPct(y.grossYieldPercent)}</strong>
        <small>gross yield</small>
        {y.confidence && <ConfidenceBadge confidence={y.confidence} />}
      </div>
    </div>
  );
}

function ExpandableSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`pi-pc-expand ${open ? 'open' : ''}`}>
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
  return (
    <div className="pi-pc-tab-panel">
      <div className="pi-pc-snapshot-grid">
        <SnapshotTile
          label="Typical value"
          value={snap.typicalValue?.available ? fmt(snap.typicalValue.value) : '—'}
          hint={snap.typicalValue?.label}
          metric={snap.typicalValue}
        />
        <SnapshotTile
          label="Typical rent"
          value={snap.typicalRent?.available ? `${fmt(snap.typicalRent.value)}/mo` : '—'}
          hint={snap.typicalRent?.label}
          metric={snap.typicalRent}
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
          hint="Records counted"
        />
        <SnapshotTile
          label="Listing supply"
          value={snap.listingSupply?.total ?? 0}
          hint={`${snap.listingSupply?.sale || 0} sale · ${snap.listingSupply?.rent || 0} rent`}
          source="Marketplace only"
        />
        <SnapshotTile
          label="Confidence"
          value={snap.confidence?.level || data.confidence?.level || '—'}
          hint={snap.confidence?.summary || data.confidence?.summary}
        />
      </div>

      {!data.externalAvailable && (
        <div className="pi-pc-alert">
          <strong>External market data unavailable</strong>
          <p>{data.externalMessage || 'Statistics may reflect our marketplace listings only.'}</p>
        </div>
      )}

      {data.marketSummary && (
        <ExpandableSection title="Market summary" defaultOpen>
          <p className="pi-pc-summary">{data.marketSummary}</p>
          <p className="pi-pc-hint">Summary from calculated evidence ({data.marketSummarySource || 'template'}).</p>
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
        <ExpandableSection title="Typical £/sq ft">
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
          <h4>External sold prices</h4>
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
          <h4>Marketplace asking prices</h4>
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
    return <p className="pi-pc-muted">{rental?.internal?.sampleSize === 0 ? 'No rental listings on our platform in this postcode.' : 'Insufficient rental evidence.'}</p>;
  }
  const r = rental.internal;
  return (
    <div className="pi-pc-tab-panel">
      <p>
        Typical rent: <strong>{fmt(r.medianMonthly)}/mo</strong>
        {r.range?.low != null && (
          <span className="pi-pc-hint">
            {' '}
            · Range {fmt(r.range.low)} – {fmt(r.range.high)}
          </span>
        )}
      </p>
      <p className="pi-pc-hint">Based on {r.sampleSize} marketplace rental listing{r.sampleSize === 1 ? '' : 's'}.</p>
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
  { id: 'overview', label: 'Overview' },
  { id: 'sales', label: 'Sales' },
  { id: 'rental', label: 'Rental' },
  { id: 'investment', label: 'Investment' },
];

export default function PostcodeIntelligencePanel({ intelligence, compact = false }) {
  const [tab, setTab] = useState('overview');
  if (!intelligence?.success) return null;

  return (
    <section className={`pi-pc-panel ${compact ? 'pi-pc-panel--compact' : ''}`} aria-label="Postcode property intelligence">
      <header className="pi-pc-header">
        <div>
          <p className="pi-pc-kicker">Market context · Postcode</p>
          <h3>{intelligence.title || intelligence.postcode}</h3>
          <p className="pi-pc-meta">
            Updated {new Date(intelligence.retrievedAt).toLocaleString()}
            {intelligence.dataSources?.length > 0 && (
              <> · Sources: {intelligence.dataSources.join(', ')}</>
            )}
          </p>
          {intelligence.layerNote && <p className="pi-pc-meta">{intelligence.layerNote}</p>}
        </div>
        <ConfidenceBadge confidence={intelligence.confidence} />
      </header>

      <div className="pi-pc-tabs" role="tablist">
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
        {tab === 'sales' && <SalesTab sales={intelligence.sales} externalAvailable={intelligence.externalAvailable} />}
        {tab === 'rental' && <RentalTab rental={intelligence.rental} />}
        {tab === 'investment' && <InvestmentTab investment={intelligence.investment} lease={intelligence.lease} />}
      </div>

      <footer className="pi-pc-methodology">
        <strong>Sources &amp; methodology</strong>
        <p>{intelligence.methodology?.summary}</p>
        <ul className="pi-pc-list">
          {(intelligence.disclaimers || []).map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </footer>

      <div className="pi-pc-actions">
        {intelligence.personalisationHints?.length > 0 && (
          <div className="pi-pc-hints-grid">
            {intelligence.personalisationHints.map((h) => (
              <div key={h.role} className="pi-pc-role-hint">
                <strong>{h.label}</strong>
                <p>{h.action}</p>
              </div>
            ))}
          </div>
        )}
        <p className="pi-pc-hint">Select a property below for individual property intelligence.</p>
      </div>
    </section>
  );
}
