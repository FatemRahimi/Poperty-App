import { render, screen, fireEvent } from '@testing-library/react';
import CanonicalIdentityFields, {
  listingAppearsUnitLike,
  emptyCanonicalIdentityForm,
} from './CanonicalIdentityFields';

test('identity details stay collapsed by default', () => {
  render(
    <CanonicalIdentityFields
      value={emptyCanonicalIdentityForm()}
      onChange={() => {}}
    />
  );
  expect(screen.getByTestId('canonical-identity-fields')).toBeInTheDocument();
  expect(screen.queryByLabelText(/UPRN/i)).not.toBeInTheDocument();
});

test('unit-like listings show a missing unit hint', () => {
  render(
    <CanonicalIdentityFields
      value={emptyCanonicalIdentityForm()}
      onChange={() => {}}
      propertyType="flat"
      houseNumber="12"
    />
  );
  expect(screen.getByTestId('unit-identity-hint')).toBeInTheDocument();
});

test('progressive disclosure reveals PAON SAON building and UPRN', () => {
  render(
    <CanonicalIdentityFields
      value={emptyCanonicalIdentityForm()}
      onChange={() => {}}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /property identity details/i }));
  expect(screen.getByLabelText(/PAON/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/SAON/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/Building name/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/UPRN/i)).toBeInTheDocument();
});

test('listingAppearsUnitLike does not infer asset class', () => {
  expect(listingAppearsUnitLike({ propertyType: 'flat' })).toBe(true);
  expect(listingAppearsUnitLike({ propertyType: 'office', houseNumber: 'Suite 3' })).toBe(true);
  expect(listingAppearsUnitLike({ propertyType: 'land', houseNumber: 'Plot' })).toBe(false);
});

test('unresolved identity conflict is surfaced', () => {
  render(
    <CanonicalIdentityFields
      value={{ ...emptyCanonicalIdentityForm(), identityConflict: true }}
      onChange={() => {}}
    />
  );
  expect(screen.getByTestId('identity-conflict-hint')).toBeInTheDocument();
});

test('land and development types show a leave-blank hint when details are open', () => {
  render(
    <CanonicalIdentityFields
      value={emptyCanonicalIdentityForm()}
      onChange={() => {}}
      propertyType="development_site"
      defaultOpen
    />
  );
  expect(screen.getByText(/Leave blank rather than inventing a parcel or title identity/i)).toBeInTheDocument();
});
