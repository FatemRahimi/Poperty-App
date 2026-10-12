import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExactPropertyPicker, {
  platformAddressLabel,
  unitHintFromAddress,
} from './ExactPropertyPicker';
import {
  sanitizeIntelligenceError,
  selectedPropertyOriginLabel,
  selectedPropertyRelationshipHint,
  displaySelectedAddress,
  platformMatchEvidenceLabel,
  externalMatchEvidenceLabel,
} from '../../Utils/exactPropertyPickerDisplay';

describe('ExactPropertyPicker', () => {
  const internal = [
    {
      id: 4,
      title: 'City loft',
      address_display: 'Flat 2, 10 Marks Street, Birmingham B1 2UJ',
      property_type: 'Flat',
      source: 'marketplace',
    },
  ];

  const myListing = {
    id: 7,
    title: 'My loft',
    address_display: '266 Hospital Street, Birmingham',
    property_type: 'Office',
    source: 'my_listing',
  };

  const externalMatches = [
    {
      uprn: '1001',
      address: 'Flat 1, 10 Marks Street, Birmingham B1 2UJ',
      classificationCodeDesc: 'Flat',
    },
    {
      uprn: '1002',
      address: 'Flat 2, 10 Marks Street, Birmingham B1 2UJ',
      classificationCodeDesc: 'Flat',
    },
    {
      uprn: '1003',
      address: 'Flat 3, 10 Marks Street, Birmingham B1 2UJ',
    },
  ];

  test('requires explicit selection — does not auto-call handlers on mount', () => {
    const onSelectInternal = jest.fn();
    const onSelectExternal = jest.fn();
    render(
      <ExactPropertyPicker
        internal={internal}
        externalMatches={externalMatches}
        onSelectInternal={onSelectInternal}
        onSelectExternal={onSelectExternal}
      />
    );
    expect(screen.getByTestId('exact-property-picker')).toBeInTheDocument();
    expect(screen.getByText('Select the property')).toBeInTheDocument();
    expect(onSelectInternal).not.toHaveBeenCalled();
    expect(onSelectExternal).not.toHaveBeenCalled();
  });

  test('keeps platform and UK address groups distinct', () => {
    render(
      <ExactPropertyPicker
        internal={internal}
        externalMatches={externalMatches}
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    expect(screen.getByTestId('epp-platform-group')).toHaveTextContent('Property matches');
    expect(screen.getByTestId('epp-uk-address-group')).toHaveTextContent('UK address / unit matches');
    expect(screen.queryByText(/PropertyData/i)).not.toBeInTheDocument();
  });

  test('platform listing is Property match evidence — not Your listing identity', () => {
    render(
      <ExactPropertyPicker
        internal={[myListing]}
        externalMatches={[]}
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    const row = screen.getByTestId('epp-platform-7');
    expect(row.querySelector('.epp-address')).toHaveTextContent(/266 Hospital Street/);
    expect(row).toHaveTextContent(/Property match/);
    expect(row).toHaveTextContent(/listing evidence/i);
    expect(row).not.toHaveTextContent(/^Your listing$/);
    expect(screen.queryByText('Your listing')).not.toBeInTheDocument();
  });

  test('renders multiple external UPRNs as separate selectable rows — no fabricated flats', async () => {
    const onSelectExternal = jest.fn();
    render(
      <ExactPropertyPicker
        internal={[]}
        externalMatches={externalMatches}
        onSelectInternal={jest.fn()}
        onSelectExternal={onSelectExternal}
      />
    );
    expect(screen.getByTestId('epp-uk-1001')).toBeInTheDocument();
    expect(screen.getByTestId('epp-uk-1002')).toBeInTheDocument();
    expect(screen.getByTestId('epp-uk-1003')).toBeInTheDocument();
    expect(screen.queryByTestId('epp-uk-1004')).not.toBeInTheDocument();
    await userEvent.click(screen.getByTestId('epp-uk-1002'));
    expect(onSelectExternal).toHaveBeenCalledTimes(1);
    expect(onSelectExternal.mock.calls[0][0].uprn).toBe('1002');
  });

  test('keeps UPRN secondary and address primary', () => {
    render(
      <ExactPropertyPicker
        internal={[]}
        externalMatches={[externalMatches[0]]}
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    const row = screen.getByTestId('epp-uk-1001');
    const address = row.querySelector('.epp-address');
    const uprn = row.querySelector('[data-testid="epp-uprn-secondary"]');
    expect(address).toHaveTextContent(/Flat 1/);
    expect(uprn).toHaveTextContent('Ref 1001');
    expect(row.textContent.indexOf('Flat 1')).toBeLessThan(row.textContent.indexOf('Ref 1001'));
    expect(screen.queryByText(/^UPRN /)).not.toBeInTheDocument();
    expect(row).toHaveTextContent(externalMatchEvidenceLabel());
  });

  test('does not fabricate bedrooms, bathrooms, value or rent on rows', () => {
    render(
      <ExactPropertyPicker
        internal={internal}
        externalMatches={externalMatches}
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    expect(screen.queryByText(/bedroom/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/bathroom/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/£/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/mo/i)).not.toBeInTheDocument();
  });

  test('shows full-address hint when exact property may be missing', () => {
    render(
      <ExactPropertyPicker
        internal={[]}
        externalMatches={externalMatches}
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    expect(screen.getByTestId('epp-flat-hint')).toHaveTextContent(
      /Can't see the exact property\? Search using the full address/i
    );
  });

  test('platformAddressLabel prefers full address over id', () => {
    expect(
      platformAddressLabel({ id: 9, address_display: '12 High St', title: 'Nice house' })
    ).toBe('12 High St');
    expect(unitHintFromAddress('Flat 3, Tower Block, B1 1AA')).toMatch(/Flat 3/i);
  });

  test('one discovery row does not auto-select', () => {
    const onSelectExternal = jest.fn();
    render(
      <ExactPropertyPicker
        internal={[]}
        externalMatches={[externalMatches[0]]}
        onSelectInternal={jest.fn()}
        onSelectExternal={onSelectExternal}
      />
    );
    expect(screen.getByText(/not selected automatically/i)).toBeInTheDocument();
    expect(onSelectExternal).not.toHaveBeenCalled();
  });

  test('preserves provider secondary/primary and UPRN as string — no fabricated flats', () => {
    render(
      <ExactPropertyPicker
        internal={[]}
        externalMatches={[
          {
            uprn: '100023351679',
            address: 'FLAT 1, 198, BARCOMBE AVENUE, LONDON, SW2 3BD',
            addressParts: {
              secondary: 'FLAT 1',
              primary: '198',
              street: 'BARCOMBE AVENUE',
              postcode: 'SW2 3BD',
            },
            secondary: 'FLAT 1',
            primary: '198',
            kind: 'unit',
            classificationCode: 'RD06',
            classificationCodeDesc: 'Flat',
          },
          {
            uprn: '100023351680',
            address: 'FLAT 2, 198, BARCOMBE AVENUE, LONDON, SW2 3BD',
            addressParts: {
              secondary: 'FLAT 2',
              primary: '198',
              street: 'BARCOMBE AVENUE',
              postcode: 'SW2 3BD',
            },
            secondary: 'FLAT 2',
            primary: '198',
            kind: 'unit',
          },
        ]}
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    const row = screen.getByTestId('epp-uk-100023351679');
    expect(row.querySelector('.epp-address')).toHaveTextContent('FLAT 1');
    expect(row.querySelector('.epp-secondary')).toHaveTextContent(/198.*BARCOMBE AVENUE/i);
    expect(row).toHaveTextContent('Ref 100023351679');
    expect(screen.queryByText(/Flat B/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('epp-uk-fabricated')).not.toBeInTheDocument();
  });

  test('shell rows are distinguishable from units and remain selectable as buildings', () => {
    render(
      <ExactPropertyPicker
        internal={[]}
        externalMatches={[
          {
            uprn: '100023351677',
            address: '198, BARCOMBE AVENUE, LONDON, SW2 3BD',
            addressParts: { secondary: null, primary: '198', street: 'BARCOMBE AVENUE', postcode: 'SW2 3BD' },
            kind: 'shell',
            classificationCodeDesc: 'Parent Shell',
          },
          {
            uprn: '100023351679',
            address: 'FLAT 1, 198, BARCOMBE AVENUE, LONDON, SW2 3BD',
            addressParts: { secondary: 'FLAT 1', primary: '198', street: 'BARCOMBE AVENUE' },
            kind: 'unit',
          },
        ]}
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    expect(screen.getByTestId('epp-uk-address-group')).toHaveTextContent('UK address / unit matches');
    expect(screen.getByTestId('epp-building-shell-group')).toHaveTextContent('Building / shell');
    const shell = screen.getByTestId('epp-uk-100023351677');
    expect(shell).toHaveAttribute('data-kind', 'shell');
    expect(shell).toHaveTextContent('Building / shell');
    expect(shell.querySelector('.epp-address')).not.toHaveTextContent(/Flat/i);
    expect(screen.getByTestId('epp-uk-100023351679')).toHaveAttribute('data-kind', 'unit');
  });

  test('named-unit warning and truncation note render without claiming completeness', () => {
    render(
      <ExactPropertyPicker
        internal={[]}
        externalMatches={[
          {
            uprn: '1',
            address: '30, FULHAM PARK GARDENS',
            kind: 'shell',
            classificationCodeDesc: 'Property Shell',
          },
        ]}
        namedUnitUnconfirmed
        potentiallyTruncated
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    expect(screen.getByTestId('epp-named-unit-warning')).toHaveTextContent(/named unit was not confirmed/i);
    expect(screen.getByTestId('epp-truncation-note')).toHaveTextContent(/not claimed complete/i);
    expect(screen.queryByText(/postcode is complete/i)).not.toBeInTheDocument();
  });

  test('same-postcode listings stay in the property-match group with a non-exact label', () => {
    render(
      <ExactPropertyPicker
        internal={[
          {
            id: 88,
            address_display: '88 Colmore Row, Birmingham',
            matchMethod: 'postcode',
            source: 'marketplace',
          },
        ]}
        externalMatches={[
          {
            uprn: '10',
            address: '10 Colmore Row, Birmingham',
            kind: 'address',
          },
        ]}
        onSelectInternal={jest.fn()}
        onSelectExternal={jest.fn()}
      />
    );
    expect(screen.getByTestId('epp-platform-88')).toHaveTextContent(
      /Same postcode listing · not an exact address match/
    );
    expect(screen.getByTestId('epp-uk-10')).toBeInTheDocument();
    expect(screen.getByTestId('epp-uk-address-group')).not.toHaveTextContent('88 Colmore');
  });

  test('mobile picker rules prevent horizontal overflow', () => {
    const css = require('fs').readFileSync(
      require('path').join(__dirname, 'ExactPropertyPicker.css'),
      'utf8'
    );
    expect(css).toMatch(/overflow-x:\s*hidden/);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/max-width:\s*100%/);
  });
});

describe('exactPropertyPickerDisplay helpers', () => {
  test('sanitizes provider jargon', () => {
    expect(sanitizeIntelligenceError('PropertyData API key missing in .env')).toMatch(
      /temporarily unavailable/i
    );
    expect(sanitizeIntelligenceError('Session expired. Please log in again.')).toMatch(/Session expired/);
  });

  test('origin labels are evidence — never Your listing as product identity', () => {
    expect(selectedPropertyOriginLabel({ isExternal: true })).toBe('UK address match');
    expect(selectedPropertyOriginLabel({ relationship: 'public' })).toBe('Listing evidence available');
    expect(selectedPropertyOriginLabel({ relationship: 'owner', source: 'my_listing' })).toBe(
      'Listing evidence available'
    );
    expect(selectedPropertyRelationshipHint({ relationship: 'owner' })).toMatch(/manage a listing/i);
    expect(platformMatchEvidenceLabel({ source: 'my_listing' })).toMatch(/Property match/);
    expect(platformMatchEvidenceLabel({ matchMethod: 'postcode_address' })).toMatch(
      /Same postcode listing · not an exact address match/
    );
    expect(displaySelectedAddress({ address_display: '1 Test Rd', title: 'X' })).toBe('1 Test Rd');
  });
});
