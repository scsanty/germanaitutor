import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { axe, expectNoViolations } from '@/test/axe';
import { AudioPlayer } from './AudioPlayer';

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(async function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  });
});

describe('AudioPlayer', () => {
  it('in exam mode counts full plays, not resumes, and stops at the limit', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={2} />);
    const audio = container.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    Object.defineProperty(audio, 'currentTime', { value: 3, writable: true });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Played 1 of 2 times')).toBeInTheDocument();
    audio.currentTime = 0;
    fireEvent(audio, new Event('ended'));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent(audio, new Event('ended'));
    expect(screen.getByText('Played 2 of 2 times')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('in lesson mode offers rewind and slow speed, with no limit', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="lesson" />);
    const audio = container.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: '0.75×' }));
    expect(audio.playbackRate).toBe(0.75);
    audio.currentTime = 12;
    fireEvent.click(screen.getByRole('button', { name: 'Back 5 seconds' }));
    expect(audio.currentTime).toBe(7);
  });

  it('says when audio is unavailable', () => {
    renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available={false} mode="lesson" />);
    expect(screen.getByText('Audio unavailable right now')).toBeInTheDocument();
  });

  // Review Focus 4: pausing inside the last allowed play may resume it, which doesn't count again.
  it('in exam mode lets the last play be paused and resumed, then stays disabled', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={1} />);
    const audio = container.querySelector('audio')!;
    expect(audio).toHaveAttribute('src', `/api/audio/${'a'.repeat(64)}`);
    expect(audio).not.toHaveAttribute('controls');
    expect(screen.queryByRole('button', { name: 'Back 5 seconds' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    Object.defineProperty(audio, 'currentTime', { value: 4, writable: true });
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Played 1 of 1 time')).toBeInTheDocument();
    fireEvent(audio, new Event('ended'));
    expect(audio.currentTime).toBe(0);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    // A play from elsewhere (the OS media keys) past the limit is stopped and not counted.
    audio.play();
    expect(screen.getByText('Played 1 of 1 time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  // Fix round 1: a play is new only after the previous one ended, never because currentTime is 0.
  it('in exam mode a double-click on Play is one play that can be resumed', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={2} />);
    const audio = container.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(audio.currentTime).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Played 1 of 2 times')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });

  it.each([1, 2])('in exam mode a pause while the last of %i plays still loads resumes it, uncounted', (replays) => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={replays} />);
    const audio = container.querySelector('audio')!;
    const times = replays === 1 ? 'time' : 'times';
    for (let i = 1; i < replays; i++) {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      fireEvent(audio, new Event('ended'));
    }
    // The last play: pressed, paused and pressed again before any audio has decoded (currentTime 0).
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    // Still playing (not paused straight away by the limit), and counted once.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByText(`Played ${replays} of ${replays} ${times}`)).toBeInTheDocument();
    fireEvent(audio, new Event('ended'));
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
  });

  it('in exam mode a pause and resume mid-play is not counted', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={2} />);
    const audio = container.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    audio.currentTime = 6;
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Played 1 of 2 times')).toBeInTheDocument();
  });

  it('in exam mode counts a play after ended as a new one', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={3} />);
    const audio = container.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent(audio, new Event('ended'));
    expect(screen.getByText('Played 1 of 3 times')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Played 2 of 3 times')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled();
  });

  it('in exam mode snaps an outside seek back to the playback position', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={1} />);
    const audio = container.querySelector('audio')!;
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    audio.currentTime = 10;
    fireEvent(audio, new Event('timeupdate'));
    audio.currentTime = 2;
    fireEvent(audio, new Event('seeking'));
    expect(audio.currentTime).toBe(10);
  });

  it('offers a retry after a media error, keeping the count', () => {
    const { container } = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent(container.querySelector('audio')!, new Event('error'));
    expect(screen.getByText('Audio unavailable right now')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(container.querySelector('audio')).not.toBeNull();
    expect(screen.getByText('Played 1 of 1 time')).toBeInTheDocument();
    // The interrupted play resumes on the new element without counting again.
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(screen.getByText('Played 1 of 1 time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('is accessible in both modes', async () => {
    const lesson = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="lesson" />);
    expectNoViolations(await axe(lesson.container));
    lesson.unmount();
    const exam = renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="exam" replays={2} />);
    expectNoViolations(await axe(exam.container));
    expect(screen.getByText('Played 0 of 2 times')).toHaveAttribute('aria-live', 'polite');
  });

  it('labels its controls in German', () => {
    renderWithIntl(<AudioPlayer hash={'a'.repeat(64)} available mode="lesson" />, 'de');
    expect(screen.getByRole('button', { name: 'Abspielen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5 Sekunden zurück' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0,75×' })).toHaveAttribute('aria-pressed', 'false');
  });
});
