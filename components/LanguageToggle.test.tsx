import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageToggle } from './LanguageToggle';

describe('LanguageToggle', () => {
  it('marks the current language and reports a switch', () => {
    const onChange = vi.fn();
    render(<LanguageToggle value="en" onChange={onChange} label="Lesson language" />);
    expect(screen.getByRole('group', { name: 'Lesson language' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'DE' }));
    expect(onChange).toHaveBeenCalledWith('de');
  });
});
