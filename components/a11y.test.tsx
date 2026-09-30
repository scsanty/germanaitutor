import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test/renderWithIntl';
import { delayedResponse } from '@/test/delayedResponse';
import { axe, expectNoViolations } from '@/test/axe';
import type { ExerciseView } from '@/lib/tutoring/exerciseView';
import { PreferencesProvider } from '@/components/providers/PreferencesProvider';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: refreshMock, push: vi.fn() }) }));

import { DashboardPage } from './dashboard/DashboardPage';
import { CurriculumTree } from './tutoring/CurriculumTree';
import { LessonPage } from './tutoring/LessonPage';
import { ExerciseCard } from './tutoring/ExerciseCard';
import { SettingsPage } from './settings/SettingsPage';
import { ProfilePage } from './profile/ProfilePage';
import { TestOutPage } from './tutoring/TestOutPage';

const PROFILE = {
  displayName: '',
  uiLanguage: 'en',
  activeTrack: 'generic',
  activeLevel: 'A1',
  theme: 'dark',
  soundEnabled: true,
  onboardingComplete: true,
  highestUnlockedLevel: 'B1',
  placementStatus: 'taken',
  unlockNoticeLevel: null,
  onboardingChoicesSaved: true,
  dailyReviewCap: 50,
  updatedAt: '',
};

function stubProfileRoutes() {
  const routes: Record<string, unknown> = {
    'GET /api/profile': PROFILE,
    'GET /api/providers': [],
    'GET /api/admin/auth': { passwordSet: true, authenticated: false },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve({ ok: true, status: 200, json: async () => routes[`${init?.method ?? 'GET'} ${url}`] ?? {} })
    )
  );
}

describe('accessibility', () => {
  it('the dashboard has no axe violations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        delayedResponse({
          continueLesson: { id: 'a1-sein', title: 'The verb sein' },
          reviewsDue: 2,
          skills: [{ skill: 'grammar', done: 1, total: 2 }],
          activity: Array.from({ length: 84 }, (_, i) => ({ date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10), count: i % 3 })),
        })
      )
    );
    const { container } = renderWithIntl(<DashboardPage />);
    await screen.findByRole('link', { name: 'Continue: The verb sein' });
    expectNoViolations(await axe(container));
  });

  it('the tree has no axe violations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        delayedResponse({
          track: 'generic',
          level: 'A1',
          milestones: [
            {
              id: 'm1',
              title: 'Basics',
              description: null,
              rank: 1,
              state: 'open',
              edges: [],
              testOut: { status: 'none' },
              lessons: [
                {
                  id: 'a1-greet',
                  title: 'Saying hello',
                  skill: 'vocabulary',
                  status: 'not_started',
                  coveredVia: null,
                  locked: false,
                  earlierPrerequisites: [],
                  branch: 0,
                  column: 0,
                  row: 0,
                },
              ],
            },
          ],
        })
      )
    );
    const { container } = renderWithIntl(<CurriculumTree reloadKey={0} />);
    await screen.findByText('Basics');
    expectNoViolations(await axe(container));
  });

  it('an open lesson has no axe violations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        delayedResponse({
          locked: false,
          id: 'a1-greet',
          title: { en: 'Saying hello', de: 'Begrüßen' },
          track: 'generic',
          level: 'A1',
          skill: 'vocabulary',
          explanation: { en: 'Say Hallo to greet someone.', de: 'Sag Hallo zur Begrüßung.' },
          examples: [{ en: 'Hallo!', de: 'Hallo!' }],
          exercises: [
            { id: 'ex1', type: 'multiple_choice', question: 'Greeting?', options: ['Hallo', 'Tschüss'], instruction: { en: 'Pick the greeting.', de: 'Wähle die Begrüßung.' } },
            { id: 'ex2', type: 'multiple_choice', question: 'Farewell?', options: ['Hallo', 'Tschüss'] },
          ],
          passedExerciseIds: [],
          completed: false,
          prerequisites: [{ id: 'a1-basics', title: 'Basics', done: true }],
        })
      )
    );
    const { container } = renderWithIntl(<LessonPage lessonId="a1-greet" />);
    await screen.findByRole('heading', { name: 'Saying hello' });
    expectNoViolations(await axe(container));
  });

  it('a multiple-choice exercise card has no axe violations', async () => {
    const exercise: ExerciseView = { id: 'ex1', type: 'multiple_choice', question: 'How do you greet someone?', options: ['Hallo', 'Tschüss'], instruction: { en: 'Pick the greeting.', de: 'Wähle die Begrüßung.' } };
    const { container } = renderWithIntl(
      <ExerciseCard exercise={exercise} source="lesson" onAnswered={vi.fn()} onNext={vi.fn()} onSkip={vi.fn()} onAskAi={vi.fn()} />
    );
    expectNoViolations(await axe(container));
  });

  it('settings has no axe violations', async () => {
    stubProfileRoutes();
    const { container } = renderWithIntl(
      <PreferencesProvider initial={{ theme: 'dark', soundEnabled: true }}>
        <SettingsPage />
      </PreferencesProvider>
    );
    await screen.findByText('Daily review limit');
    await screen.findAllByRole('radio');
    expectNoViolations(await axe(container));
  });

  it('the profile has no axe violations', async () => {
    stubProfileRoutes();
    const { container } = renderWithIntl(<ProfilePage />);
    await screen.findByLabelText('Level');
    expectNoViolations(await axe(container));
  });

  it('the test-out intro has no axe violations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => delayedResponse({ milestone: { id: 'm2', title: 'Later' }, status: { status: 'available' }, lastResult: null }))
    );
    const { container } = renderWithIntl(<TestOutPage milestoneId="m2" />);
    await screen.findByRole('heading', { name: 'Test out: Later' });
    expectNoViolations(await axe(container));
  });
});
