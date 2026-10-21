import type { LocalizedText } from '../i18n/localizedText';

// Spec: Error Log taxonomy. Keywords are lowercase fragments (en and de) matched against lesson titles.
export interface ErrorCategory {
  id: string;
  label: LocalizedText;
  keywords: string[];
}

const c = (id: string, en: string, de: string, keywords: string[]): ErrorCategory => ({ id, label: { en, de }, keywords });

export const TAXONOMY: ErrorCategory[] = [
  c('articles_gender', 'Articles and gender', 'Artikel und Genus', ['definite and indefinite articles', 'bestimmte und unbestimmte artikel', 'gender', 'genus']),
  c('case_prepositions', 'Case after prepositions', 'Kasus nach Präpositionen', [
    'dative prepositions', 'two-way prepositions', 'genitive prepositions', 'temporal prepositions', 'core prepositions',
    'präpositionen mit dativ', 'präpositionen mit genitiv', 'wechselpräpositionen', 'zeitpräpositionen', 'präpositionen der zeit', 'präpositionen für zeit und ort',
  ]),
  c('case_objects', 'Accusative and dative objects', 'Akkusativ- und Dativobjekte', ['accusative case', 'dative case', 'der akkusativ', 'der dativ']),
  c('adjective_endings', 'Adjective endings', 'Adjektivendungen', ['adjective endings', 'adjective declension', 'adjektivendungen', 'adjektivdeklination']),
  c('verb_conjugation', 'Verb conjugation', 'Verbkonjugation', ['conjugation', 'konjugation', 'present tense foundations']),
  c('perfect_auxiliary', 'Perfekt auxiliary (haben/sein)', 'Hilfsverb im Perfekt (haben/sein)', ['perfekt', 'present perfect']),
  c('participles', 'Participles', 'Partizipien', ['participle', 'participles', 'partizip', 'partizipien', 'partizipialattribute', 'partizipialkonstruktionen']),
  c('separable_verbs', 'Separable verbs', 'Trennbare Verben', ['separable', 'trennbare']),
  c('modal_verbs', 'Modal verbs', 'Modalverben', ['^modal verbs', '^modalverben']),
  c('word_order_main', 'Verb position in main clauses', 'Verbposition im Hauptsatz', ['declarative sentences', 'aussagesätzen', 'main clause', 'main clauses', 'hauptsatz', 'hauptsätze']),
  c('word_order_subclause', 'Verb position in subordinate clauses', 'Verbposition im Nebensatz', ['subordinate clauses', 'subordinate clause', 'nebensätze', 'nebensatz', 'verb position']),
  c('word_order_middle', 'Word order in the middle field', 'Wortstellung im Mittelfeld', ['middle field', 'mittelfeld', 'sentence bracket', 'satzklammer']),
  c('connectors', 'Connectors', 'Konnektoren', ['connectors', 'konnektoren', 'conjunctions', 'konjunktionen']),
  c('relative_pronouns', 'Relative pronouns', 'Relativpronomen', ['relative clauses', 'relativsätze', 'relative pronouns', 'relativpronomen']),
  c('reflexive_pronouns', 'Reflexive pronouns', 'Reflexivpronomen', ['reflexive', 'reflexivpronomen']),
  c('verbs_prepositions', 'Verbs with prepositions', 'Verben mit Präpositionen', [
    'verbs with fixed prepositions', 'verbs with prepositions', 'prepositional verbs', 'verben mit festen präpositionen', 'verben mit präpositionen',
  ]),
  c('konjunktiv_ii', 'Konjunktiv II', 'Konjunktiv II', ['konjunktiv ii', 'subjunctive ii', 'past subjunctive']),
  c('passive', 'Passive', 'Passiv', ['passive voice', 'process passive', 'subjectless passive', 'vorgangspassiv', 'das passiv', 'passiv mit', 'subjektloses passiv']),
  c('plurals', 'Plural forms', 'Pluralformen', ['plural', 'plurals', 'pluralformen']),
  c('comparison', 'Comparison', 'Komparation', ['comparative', 'superlative', 'komparativ', 'superlativ', 'komparation']),
  c('genitive', 'Genitive', 'Genitiv', ['the genitive', 'der genitiv', 'genitive prepositions', 'präpositionen mit genitiv']),
  c('n_declension', 'n-declension', 'n-Deklination', ['n-declension', 'n-deklination', 'weak masculine nouns']),
  c('infinitive_zu', 'Infinitive with zu', 'Infinitiv mit zu', ['infinitive with zu', 'infinitives with zu', 'infinitiv mit zu']),
  c('negation', 'Negation (kein/nicht)', 'Negation (kein/nicht)', ['negation', 'verneinung']),
  c('capitalisation', 'Capitalisation', 'Groß- und Kleinschreibung', ['capitalisation', 'capitalization', 'großschreibung', 'groß- und kleinschreibung']),
  c('spelling', 'Spelling (ß/ss, umlauts)', 'Rechtschreibung (ß/ss, Umlaute)', ['spelling', 'rechtschreibung', 'umlauts']),
  c('punctuation', 'Punctuation (commas)', 'Zeichensetzung (Kommas)', ['punctuation', 'commas', 'zeichensetzung', 'kommas']),
  c('word_choice', 'Word choice', 'Wortwahl', ['word choice', 'wortwahl']),
  c('collocations', 'Collocations', 'Kollokationen', ['collocations', 'kollokationen', 'noun-verb phrases', 'funktionsverbgefüge']),
  c('register', 'Register (du/Sie, formal phrases)', 'Register (du/Sie, formelle Wendungen)', ['register', 'politeness', 'formal register']),
  c('letter_conventions', 'Letter conventions (greeting, closing)', 'Briefkonventionen (Anrede, Gruß)', ['letter conventions', 'formal letters', 'briefkonventionen', 'greeting']),
  c('other', 'Other', 'Sonstiges', []),
];

const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const keywordRes = new Map<string, RegExp>();

// A keyword matches whole words only (Unicode-aware); a leading ^ anchors it to the start of the title.
export function keywordMatches(title: string, keyword: string): boolean {
  let re = keywordRes.get(keyword);
  if (!re) {
    const anchored = keyword.startsWith('^');
    re = new RegExp(`${anchored ? '^' : '(?<![\\p{L}\\p{N}])'}${escapeRe(anchored ? keyword.slice(1) : keyword)}(?![\\p{L}\\p{N}])`, 'iu');
    keywordRes.set(keyword, re);
  }
  return re.test(title);
}

const IDS = new Set(TAXONOMY.map((x) => x.id));

export function taxonomyIds(): string[] {
  return TAXONOMY.map((x) => x.id);
}

export function normalizeCategory(id: unknown): string {
  return typeof id === 'string' && IDS.has(id) ? id : 'other';
}
