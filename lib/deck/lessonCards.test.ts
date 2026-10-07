import { describe, it, expect } from 'vitest';
import { createDbClient } from '../db/client';
import { seedTutoringCurriculum } from '@/test/tutoringFixtures';
import { lessonCardKey, lessonCardLemma, vocabularyCardContent } from './lessonCards';

// Real fronts from data/curriculum-seed (S6).
describe('lessonCardLemma', () => {
  it('splits "<article> X, die Y" into the lemma and its plural', () => {
    expect(lessonCardLemma('das Zeugnis, die Zeugnisse')).toEqual({ lemma: 'das Zeugnis', plural: 'die Zeugnisse' });
    expect(lessonCardLemma('der Abschluss, die Abschlüsse')).toEqual({ lemma: 'der Abschluss', plural: 'die Abschlüsse' });
    expect(lessonCardLemma('die Aufenthaltserlaubnis, die Aufenthaltserlaubnisse')).toEqual({
      lemma: 'die Aufenthaltserlaubnis',
      plural: 'die Aufenthaltserlaubnisse',
    });
    expect(lessonCardLemma('der/die Alleinerziehende, die Alleinerziehenden')).toEqual({
      lemma: 'der/die Alleinerziehende',
      plural: 'die Alleinerziehenden',
    });
  });

  it('keeps any other front verbatim, notes included', () => {
    expect(lessonCardLemma('die Lebensmittel (pl.)')).toEqual({ lemma: 'die Lebensmittel (pl.)', plural: null });
    expect(lessonCardLemma('umsteigen (steigt um, ist umgestiegen)')).toEqual({ lemma: 'umsteigen (steigt um, ist umgestiegen)', plural: null });
    expect(lessonCardLemma('der Kühlschrank')).toEqual({ lemma: 'der Kühlschrank', plural: null });
    expect(lessonCardLemma('das Buch / die Bücher')).toEqual({ lemma: 'das Buch / die Bücher', plural: null });
    expect(lessonCardLemma('einen Termin verschieben')).toEqual({ lemma: 'einen Termin verschieben', plural: null });
  });
});

describe('lessonCardKey', () => {
  it('drops a trailing parenthetical note from the key only', () => {
    expect(lessonCardKey('die Lebensmittel (pl.)')).toBe('die lebensmittel');
    expect(lessonCardKey('die Geschwister (Pl.)')).toBe('die geschwister');
    expect(lessonCardKey('umsteigen (steigt um, ist umgestiegen)')).toBe('umsteigen');
    expect(lessonCardKey('die Ausbildung (-en)')).toBe('die ausbildung');
    expect(lessonCardKey('das Zeugnis')).toBe('das zeugnis');
  });
});

describe('vocabularyCardContent', () => {
  it('returns a vocabulary flashcard and null for a malformed one or another lesson', () => {
    const db = createDbClient(':memory:');
    seedTutoringCurriculum(db);
    db.exec(`INSERT INTO exercises (id, lesson_id, type, content) VALUES
      ('a1-greet__bad1', 'a1-greet', 'flashcard', '{'),
      ('a1-greet__bad2', 'a1-greet', 'flashcard', '{"front":"  ","back":"x"}'),
      ('a1-greet__bad3', 'a1-greet', 'flashcard', '{"front":"die Katze"}'),
      ('a1-sein__card', 'a1-sein', 'flashcard', '{"front":"ich bin","back":"I am"}')`);
    expect(vocabularyCardContent(db, 'a1-greet__ex2')).toEqual({ front: 'der Hund', back: 'the dog' });
    for (const id of ['a1-greet__bad1', 'a1-greet__bad2', 'a1-greet__bad3', 'a1-sein__card', 'a1-greet__ex1', 'nope']) {
      expect(vocabularyCardContent(db, id)).toBeNull();
    }
  });
});
