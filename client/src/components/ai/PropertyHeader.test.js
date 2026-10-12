import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PropertyHeader from './PropertyHeader';

describe('PropertyHeader — confirmed subject', () => {
  test('Selected property is primary identity; listing evidence is secondary', () => {
    render(
      <PropertyHeader
        address="266 Hospital Street, Birmingham"
        propertyType="Office"
        originLabel="Listing evidence available"
        relationshipHint="You manage a listing for this property"
        uprn="12345"
        onChangeProperty={jest.fn()}
      />
    );
    expect(screen.getByTestId('property-header-kicker')).toHaveTextContent('Selected property');
    expect(screen.getByTestId('property-header-address')).toHaveTextContent('266 Hospital Street');
    expect(screen.getByTestId('property-header-meta')).toHaveTextContent(/Office/);
    expect(screen.getByTestId('property-header-meta')).toHaveTextContent(/Ref 12345/);
    expect(screen.getByTestId('property-header-origin')).toHaveTextContent(/Listing evidence available/);
    expect(screen.queryByText('Your listing')).not.toBeInTheDocument();
  });

  test('Change property is available', async () => {
    const onChange = jest.fn();
    render(
      <PropertyHeader address="12 Example Road" onChangeProperty={onChange} />
    );
    await userEvent.click(screen.getByTestId('change-property'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
