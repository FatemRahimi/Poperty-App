import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SubjectAttributeCompletionPanel from './SubjectAttributeCompletionPanel';
import {
  FINISH_QUALITY_UI_OPTIONS,
  mapUiSelectionToProviderEnum,
} from '../../Utils/finishQualityProviderInput';

jest.mock('../../services/aiService', () => ({
  getSubjectPropertyAttributes: jest.fn(),
  putSubjectPropertyAttributes: jest.fn(),
}));

const {
  getSubjectPropertyAttributes,
  putSubjectPropertyAttributes,
} = require('../../services/aiService');

const REPORT = {
  subject: { id: 55 },
  property: {
    subjectId: 55,
    zip_code: 'M1 1AA',
    property_type: 'Terraced',
    square_feet: 900,
    year_built: 1990,
  },
  marketIntelligence: {
    sale: {
      readiness: {
        missingFields: [
          'bedrooms',
          'bathrooms',
          'outdoor_space',
          'off_street_parking',
          'finish_quality',
        ],
      },
    },
  },
};

const UNRESOLVED = [
  {
    id: 'subject_bedrooms',
    label: 'Bedrooms',
    isSubjectAttribute: true,
    subjectId: 55,
    cause: 'MISSING_USER_REPORTED_ATTRIBUTE',
  },
  {
    id: 'provider_finish_quality',
    label: 'Interior finish',
    isSubjectAttribute: true,
    subjectId: 55,
    providerRequestOnly: true,
    cause: 'MISSING_PROVIDER_REQUEST_INPUT',
  },
];

describe('SubjectAttributeCompletionPanel', () => {
  beforeEach(() => {
    getSubjectPropertyAttributes.mockReset();
    putSubjectPropertyAttributes.mockReset();
    getSubjectPropertyAttributes.mockResolvedValue({
      success: true,
      attributes: {
        bedrooms: { available: false },
        bathrooms: { available: false },
        outdoor: { available: false },
        offStreetParking: { available: false },
        finishQualityProviderRequest: { available: false },
      },
    });
  });

  test('missing fields render; finish has no default', async () => {
    render(
      <SubjectAttributeCompletionPanel report={REPORT} unresolved={UNRESOLVED} />
    );
    await waitFor(() => expect(screen.getByTestId('field-bedrooms')).toBeInTheDocument());
    expect(screen.getByTestId('field-finish-quality')).toBeInTheDocument();
    expect(screen.getByTestId('finish-quality-disclaimer')).toBeInTheDocument();
    const finish = screen.getByTestId('input-finish-quality');
    expect(finish.value).toBe('');
    expect(screen.getByTestId('subject-attr-provenance-note')).toHaveTextContent('USER_REPORTED');
  });

  test('existing values preload correctly', async () => {
    getSubjectPropertyAttributes.mockResolvedValue({
      success: true,
      attributes: {
        bedrooms: { available: true, value: 3, provenance: 'USER_REPORTED' },
        bathrooms: { available: true, value: 0, provenance: 'USER_REPORTED' },
        outdoor: { available: true, value: 'none' },
        offStreetParking: { available: true, value: 0 },
        finishQualityProviderRequest: { available: true, value: 'high' },
      },
    });
    render(
      <SubjectAttributeCompletionPanel report={REPORT} unresolved={UNRESOLVED} />
    );
    await waitFor(() => expect(screen.getByTestId('input-bedrooms')).toHaveValue(3));
    expect(screen.getByTestId('input-bathrooms')).toHaveValue(0);
    expect(screen.getByTestId('input-outdoor')).toHaveValue('none');
    expect(screen.getByTestId('input-parking')).toHaveValue(0);
    expect(screen.getByTestId('input-finish-quality')).toHaveValue('high');
  });

  test('save sends USER_REPORTED payload and shows readiness', async () => {
    putSubjectPropertyAttributes.mockResolvedValue({
      success: true,
      attributes: {
        bedrooms: { available: true, value: 2, provenance: 'USER_REPORTED' },
        bathrooms: { available: true, value: 1 },
        outdoor: { available: true, value: 'garden' },
        offStreetParking: { available: true, value: 0 },
        finishQualityProviderRequest: { available: true, value: 'average', providerRequestOnly: true },
      },
      readiness: {
        canRequestAvm: true,
        state: 'PROVIDER_ELIGIBLE',
        missingFields: [],
        providerCalled: false,
      },
    });

    render(
      <SubjectAttributeCompletionPanel report={REPORT} unresolved={UNRESOLVED} />
    );
    await waitFor(() => expect(screen.getByTestId('input-bedrooms')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('input-bedrooms'), { target: { value: '2' } });
    fireEvent.change(screen.getByTestId('input-bathrooms'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('input-outdoor'), { target: { value: 'garden' } });
    fireEvent.change(screen.getByTestId('input-parking'), { target: { value: '0' } });
    fireEvent.change(screen.getByTestId('input-finish-quality'), { target: { value: 'average' } });
    fireEvent.click(screen.getByTestId('subject-attr-save'));

    await waitFor(() => expect(putSubjectPropertyAttributes).toHaveBeenCalled());
    const [, payload] = putSubjectPropertyAttributes.mock.calls[0];
    expect(payload.bedrooms).toBe(2);
    expect(payload.offStreetParking).toBe(0);
    expect(payload.finishQuality).toBe('average');
    expect(payload.propertyContext).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('subject-attr-readiness')).toHaveTextContent('PROVIDER_ELIGIBLE');
    });
  });

  test('finish UI options map one-to-one', () => {
    for (const opt of FINISH_QUALITY_UI_OPTIONS) {
      expect(mapUiSelectionToProviderEnum(opt.providerValue)).toEqual({
        ok: true,
        value: opt.providerValue,
      });
    }
    expect(mapUiSelectionToProviderEnum('')).toEqual({ ok: false, reason: 'absent' });
  });

  test('panel hidden when no subject attribute gaps', () => {
    const { container } = render(
      <SubjectAttributeCompletionPanel report={REPORT} unresolved={[]} />
    );
    expect(container.querySelector('[data-testid="subject-attribute-completion"]')).toBeNull();
  });
});
