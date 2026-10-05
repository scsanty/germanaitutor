import type { CefrLevel } from '../types';
import type { LocalizedText } from '../i18n/localizedText';

export interface Scenario {
  id: string;
  level: CefrLevel;
  title: LocalizedText;
  // the partner's first line, in German at the level
  opener: string;
}

export const SCENARIOS: Scenario[] = [
  { id: 'a1-cafe', level: 'A1', title: { en: 'Ordering at a café', de: 'Im Café bestellen' }, opener: 'Hallo! Was möchtest du trinken?' },
  { id: 'a1-introduce', level: 'A1', title: { en: 'Introducing yourself', de: 'Sich vorstellen' }, opener: 'Hallo, ich bin Lena. Wie heißt du?' },
  { id: 'a2-weekend', level: 'A2', title: { en: 'Talking about the weekend', de: 'Über das Wochenende sprechen' }, opener: 'Na, was hast du am Wochenende gemacht?' },
  { id: 'a2-shop', level: 'A2', title: { en: 'Buying clothes', de: 'Kleidung kaufen' }, opener: 'Guten Tag! Kann ich Ihnen helfen?' },
  { id: 'b1-doctor', level: 'B1', title: { en: 'Making a doctor’s appointment', de: 'Einen Arzttermin vereinbaren' }, opener: 'Praxis Dr. Weber, guten Tag. Was kann ich für Sie tun?' },
  { id: 'b1-flat', level: 'B1', title: { en: 'Viewing a flat', de: 'Eine Wohnung besichtigen' }, opener: 'Willkommen! Das ist die Wohnung. Haben Sie schon Fragen?' },
  { id: 'b2-job', level: 'B2', title: { en: 'A job interview', de: 'Ein Vorstellungsgespräch' }, opener: 'Schön, dass Sie da sind. Erzählen Sie doch kurz von sich.' },
  { id: 'b2-complaint', level: 'B2', title: { en: 'A complaint at customer service', de: 'Eine Reklamation beim Kundenservice' }, opener: 'Kundenservice, mein Name ist Hoffmann. Worum geht es?' },
  { id: 'c1-debate', level: 'C1', title: { en: 'Debating remote work', de: 'Über Homeoffice diskutieren' }, opener: 'Ich finde, Homeoffice sollte die Regel sein. Wie sehen Sie das?' },
  { id: 'c1-negotiation', level: 'C1', title: { en: 'Negotiating a salary', de: 'Ein Gehalt verhandeln' }, opener: 'Wir haben Ihr Angebot geprüft. Welche Vorstellungen haben Sie?' },
];

export function scenariosFor(level: CefrLevel): Scenario[] {
  return SCENARIOS.filter((s) => s.level === level);
}
