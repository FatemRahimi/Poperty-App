import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DecisionJobSelector from './DecisionJobSelector';

function Harness({ initial = null }) {
  const [job, setJob] = useState(initial);
  return (
    <div>
      <DecisionJobSelector value={job} onChange={setJob} />
      <pre data-testid="selected-job">{job || ''}</pre>
    </div>
  );
}

describe('DecisionJobSelector', () => {
  test('exposes Buy, Let / Invest and Sell as separate radio controls', () => {
    render(<Harness />);
    expect(screen.getByTestId('decision-job-BUY')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-LET_INVEST')).toBeInTheDocument();
    expect(screen.getByTestId('decision-job-SELL')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Buy\. Purchase decision/i })).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /Let \/ Invest\. Rental investment/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Sell\. Sale \/ pricing context/i })).toBeInTheDocument();
    expect(screen.queryByText(/^Hold$/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('decision-job-HOLD')).not.toBeInTheDocument();
    const group = screen.getByTestId('decision-job-radiogroup');
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(3);
  });

  test('selection is explicit, one at a time, with non-colour Selected text', async () => {
    render(<Harness />);
    expect(screen.getByTestId('selected-job')).toHaveTextContent('');
    const buy = screen.getByTestId('decision-job-BUY');
    const letInvest = screen.getByTestId('decision-job-LET_INVEST');
    expect(buy).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(buy);
    expect(screen.getByTestId('selected-job')).toHaveTextContent('BUY');
    expect(buy).toHaveAttribute('aria-checked', 'true');
    expect(buy).toHaveTextContent(/Selected/i);
    expect(buy.className).toMatch(/selected/);
    await userEvent.click(letInvest);
    expect(screen.getByTestId('selected-job')).toHaveTextContent('LET_INVEST');
    expect(letInvest).toHaveAttribute('aria-checked', 'true');
    expect(letInvest).toHaveTextContent(/Selected/i);
    expect(buy).toHaveAttribute('aria-checked', 'false');
    expect(buy).not.toHaveTextContent(/Selected/i);
  });

  test('keyboard arrows move selection and keep focus visible target', () => {
    render(<Harness />);
    const buy = screen.getByTestId('decision-job-BUY');
    buy.focus();
    fireEvent.keyDown(buy, { key: 'ArrowRight' });
    expect(screen.getByTestId('selected-job')).toHaveTextContent('LET_INVEST');
    expect(screen.getByTestId('decision-job-LET_INVEST')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('decision-job-LET_INVEST')).toHaveFocus();
    fireEvent.keyDown(screen.getByTestId('decision-job-LET_INVEST'), { key: 'End' });
    expect(screen.getByTestId('selected-job')).toHaveTextContent('SELL');
    expect(screen.getByTestId('decision-job-SELL')).toHaveFocus();
  });

  test('controls are not concatenated text — each job has its own accessible name', () => {
    render(<Harness />);
    const names = screen.getAllByRole('radio').map((node) => node.getAttribute('aria-label'));
    expect(names).toEqual([
      'Buy. Purchase decision',
      'Let / Invest. Rental investment / landlord assessment',
      'Sell. Sale / pricing context',
    ]);
    expect(names.join(' ')).not.toMatch(/^Buy Purchase context Let \/ Invest/);
  });
});
