import type { LocalizedText } from '../i18n/localizedText';

// Spec: Error Log taxonomy. Keywords are lowercase fragments (en and de) matched against lesson titles.
export interface ErrorCategory {
  id: string;
  label: LocalizedText;
  keywords: string[];
}

const c = (id: string, en: string, de: string, keywords: string[]): ErrorCategory => ({ id, label: { en, de }, keywords });

export const TAXONOMY: ErrorCategory[] = [
  c('articles_gender', 'Articles and gender', 'Artikel und Genus', ['article', 'gender', 'artikel', 'genus']),
  c('case_prepositions', 'Case after prepositions', 'Kasus nach Präpositionen', ['preposition', 'präposition', 'wechselpräposition']),
  c('case_objects', 'Accusative and dative objects', 'Akkusativ- und Dativobjekte', ['accusative', 'dative', 'akkusativ', 'dativ']),
  c('adjective_endings', 'Adjective endings', 'Adjektivendungen', ['adjective ending', 'adjektivdeklination', 'adjektivendung']),
  c('verb_conjugation', 'Verb conjugation', 'Verbkonjugation', ['conjugation', 'konjugation', 'present tense', 'präsens']),
  c('perfect_auxiliary', 'Perfekt auxiliary (haben/sein)', 'Hilfsverb im Perfekt (haben/sein)', ['perfekt', 'present perfect']),
  c('participles', 'Participles', 'Partizipien', ['participle', 'partizip']),
  c('separable_verbs', 'Separable verbs', 'Trennbare Verben', ['separable', 'trennbar']),
  c('modal_verbs', 'Modal verbs', 'Modalverben', ['modal']),
  c('word_order_main', 'Verb position in main clauses', 'Verbposition im Hauptsatz', ['main clause', 'hauptsatz', 'word order', 'wortstellung']),
  c('word_order_subclause', 'Verb position in subordinate clauses', 'Verbposition im Nebensatz', ['subordinate', 'nebensatz', 'verb position']),
  c('word_order_middle', 'Word order in the middle field', 'Wortstellung im Mittelfeld', ['middle field', 'mittelfeld', 'word order', 'wortstellung']),
  c('connectors', 'Connectors', 'Konnektoren', ['connector', 'conjunction', 'konnektor', 'konjunktion']),
  c('relative_pronouns', 'Relative pronouns', 'Relativpronomen', ['relative', 'relativsatz', 'relativpronomen']),
  c('reflexive_pronouns', 'Reflexive pronouns', 'Reflexivpronomen', ['reflexive', 'reflexiv']),
  c('verbs_prepositions', 'Verbs with prepositions', 'Verben mit Präpositionen', ['verbs with preposition', 'verben mit präposition']),
  c('konjunktiv_ii', 'Konjunktiv II', 'Konjunktiv II', ['konjunktiv', 'subjunctive']),
  c('passive', 'Passive', 'Passiv', ['passive', 'passiv']),
  c('plurals', 'Plural forms', 'Pluralformen', ['plural']),
  c('comparison', 'Comparison', 'Komparation', ['comparison', 'comparative', 'superlative', 'komparativ', 'superlativ', 'komparation']),
  c('genitive', 'Genitive', 'Genitiv', ['genitive', 'genitiv']),
  c('n_declension', 'n-declension', 'n-Deklination', ['n-declension', 'n-deklination', 'weak noun']),
  c('infinitive_zu', 'Infinitive with zu', 'Infinitiv mit zu', ['infinitive with zu', 'infinitiv mit zu', 'zu-infinitiv']),
  c('negation', 'Negation (kein/nicht)', 'Negation (kein/nicht)', ['negation', 'kein', 'nicht']),
  c('capitalisation', 'Capitalisation', 'Groß- und Kleinschreibung', ['capital', 'großschreibung', 'groß- und kleinschreibung']),
  c('spelling', 'Spelling (ß/ss, umlauts)', 'Rechtschreibung (ß/ss, Umlaute)', ['spelling', 'rechtschreibung', 'umlaut']),
  c('punctuation', 'Punctuation (commas)', 'Zeichensetzung (Kommas)', ['punctuation', 'comma', 'zeichensetzung', 'komma']),
  c('word_choice', 'Word choice', 'Wortwahl', ['word choice', 'wortwahl']),
  c('collocations', 'Collocations', 'Kollokationen', ['collocation', 'kollokation']),
  c('register', 'Register (du/Sie, formal phrases)', 'Register (du/Sie, formelle Wendungen)', ['register', 'formal', 'formell', 'du/sie']),
  c('letter_conventions', 'Letter conventions (greeting, closing)', 'Briefkonventionen (Anrede, Gruß)', ['letter', 'brief', 'greeting', 'anrede']),
  c('other', 'Other', 'Sonstiges', []),
];

const IDS = new Set(TAXONOMY.map((x) => x.id));

export function taxonomyIds(): string[] {
  return TAXONOMY.map((x) => x.id);
}

export function normalizeCategory(id: unknown): string {
  return typeof id === 'string' && IDS.has(id) ? id : 'other';
}
