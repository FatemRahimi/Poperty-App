jest.mock('../../services/aiService', () => ({
  getSubjectPropertyAttributes: jest.fn().mockResolvedValue({ success: true, attributes: {} }),
  putSubjectPropertyAttributes: jest.fn(),
}));

import React from 'react';
import { render, screen } from '@testing-library/react';
import PropertyFactsSummary from './PropertyFactsSummary';
import { buildPropertyFactsFromPreview } from '../../Utils/propertyFactsDisplay';

describe('PropertyFactsSummary', () => {
  test('renders known listing fact and Unknown neutrally', () => {
    const facts = buildPropertyFactsFromPreview({
      property_type: '{"flat","flat"}',
      bedrooms: 2,
      square_feet: 900,
    });
    render(<PropertyFactsSummary facts={facts} />);
    expect(screen.getByTestId('property-facts-summary')).toBeInTheDocument();
    expect(screen.getByTestId('property-fact-value-propertyType')).toHaveTextContent('Flat');
    expect(screen.getByTestId('property-fact-provenance-propertyType')).toHaveTextContent(
      'Listing supplied'
    );
    expect(screen.getByTestId('property-fact-value-bedrooms')).toHaveTextContent('2');
    expect(screen.getByTestId('property-fact-value-bathrooms')).toHaveTextContent('Unknown');
    expect(screen.getByTestId('property-fact-value-finish')).toHaveTextContent('Unknown');
    expect(screen.queryByText(/never zero/i)).not.toBeInTheDocument();
  });

  test('does not show Add/Edit without subjectId', () => {
    const facts = buildPropertyFactsFromPreview({ property_type: 'office', square_feet: 5000 });
    render(<PropertyFactsSummary facts={facts} />);
    expect(screen.queryByTestId('property-facts-edit-toggle')).not.toBeInTheDocument();
    expect(screen.getByTestId('property-facts-listing-note')).toBeInTheDocument();
  });

  test('shows Add/Edit when subjectId is present', async () => {
    const facts = buildPropertyFactsFromPreview({ property_type: 'flat' });
    render(<PropertyFactsSummary facts={facts} subjectId={99} />);
    expect(await screen.findByTestId('property-facts-edit-toggle')).toBeInTheDocument();
  });

  test('office parking 230 case stays Unknown in UI', () => {
    const facts = buildPropertyFactsFromPreview({
      property_type: 'office',
      parking_spaces: 230,
      square_feet: 5000,
    });
    render(<PropertyFactsSummary facts={facts} />);
    expect(screen.getByTestId('property-fact-value-parking')).toHaveTextContent('Unknown');
    expect(screen.getByTestId('property-fact-value-floorArea')).toHaveTextContent('5000 sq ft');
    expect(screen.queryByText('230')).not.toBeInTheDocument();
  });
});
