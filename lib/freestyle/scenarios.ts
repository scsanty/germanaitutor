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
  { id: 'a1-bakery', level: 'A1', title: { en: 'Buying bread at the bakery', de: 'Beim Bäcker Brot kaufen' }, opener: 'Guten Morgen! Was möchten Sie? Wir haben heute frische Brötchen.' },
  { id: 'a1-family', level: 'A1', title: { en: 'Talking about your family', de: 'Über die Familie sprechen' }, opener: 'Das ist ein Foto von meiner Familie. Hast du Geschwister?' },
  { id: 'a1-hobbies', level: 'A1', title: { en: 'Talking about hobbies', de: 'Über Hobbys sprechen' }, opener: 'Ich spiele gern Fußball. Und du? Was machst du gern?' },
  { id: 'a1-directions', level: 'A1', title: { en: 'Asking the way', de: 'Nach dem Weg fragen' }, opener: 'Entschuldigung, suchen Sie etwas? Kann ich Ihnen helfen?' },
  { id: 'a1-hotel', level: 'A1', title: { en: 'Checking in at a hotel', de: 'Im Hotel einchecken' }, opener: 'Guten Abend und willkommen! Haben Sie eine Reservierung? Wie ist Ihr Name, bitte?' },
  { id: 'a1-colleague', level: 'A1', title: { en: 'Meeting a new colleague', de: 'Einen neuen Kollegen kennenlernen' }, opener: 'Hallo! Du bist neu hier, oder? Ich bin Tom. Was ist dein Beruf?' },
  { id: 'a1-registration', level: 'A1', title: { en: 'Registering your address', de: 'Den Wohnsitz anmelden' }, opener: 'Guten Tag! Bitte nehmen Sie Platz. Sie möchten sich anmelden, richtig? Wie ist Ihr Name?' },

  { id: 'a2-weekend', level: 'A2', title: { en: 'Talking about the weekend', de: 'Über das Wochenende sprechen' }, opener: 'Na, was hast du am Wochenende gemacht?' },
  { id: 'a2-shop', level: 'A2', title: { en: 'Buying clothes', de: 'Kleidung kaufen' }, opener: 'Guten Tag! Kann ich Ihnen helfen? Suchen Sie etwas Bestimmtes?' },
  { id: 'a2-restaurant', level: 'A2', title: { en: 'Ordering at a restaurant', de: 'Im Restaurant bestellen' }, opener: 'Guten Abend! Hier ist die Speisekarte. Möchten Sie schon etwas trinken?' },
  { id: 'a2-train', level: 'A2', title: { en: 'Buying a train ticket', de: 'Eine Fahrkarte kaufen' }, opener: 'Guten Tag! Wohin möchten Sie fahren, und wann soll es losgehen?' },
  { id: 'a2-pharmacy', level: 'A2', title: { en: 'At the pharmacy', de: 'In der Apotheke' }, opener: 'Guten Tag! Was kann ich für Sie tun? Haben Sie ein Rezept vom Arzt?' },
  { id: 'a2-holiday', level: 'A2', title: { en: 'Talking about your last holiday', de: 'Über den letzten Urlaub sprechen' }, opener: 'Du siehst so erholt aus! Wo warst du denn im Urlaub?' },
  { id: 'a2-plans', level: 'A2', title: { en: 'Making plans with a friend', de: 'Sich mit einer Freundin verabreden' }, opener: 'Hey! Hast du am Samstag Zeit? Wollen wir zusammen etwas unternehmen?' },
  { id: 'a2-sick-call', level: 'A2', title: { en: 'Calling in sick at work', de: 'Sich bei der Arbeit krankmelden' }, opener: 'Guten Morgen, hier ist Frau Schmidt. Oh, Sie klingen aber nicht gut. Was ist denn los?' },
  { id: 'a2-city-country', level: 'A2', title: { en: 'City or countryside?', de: 'Stadt oder Land?' }, opener: 'Ich wohne lieber auf dem Land, da ist es schön ruhig. Und du? Wo wohnst du lieber und warum?' },

  { id: 'b1-doctor', level: 'B1', title: { en: 'Making a doctor’s appointment', de: 'Einen Arzttermin vereinbaren' }, opener: 'Praxis Dr. Weber, guten Tag. Was kann ich für Sie tun?' },
  { id: 'b1-flat', level: 'B1', title: { en: 'Viewing a flat', de: 'Eine Wohnung besichtigen' }, opener: 'Willkommen! Das ist die Wohnung. Haben Sie schon Fragen?' },
  { id: 'b1-bank', level: 'B1', title: { en: 'Opening a bank account', de: 'Ein Bankkonto eröffnen' }, opener: 'Guten Tag, nehmen Sie doch Platz. Sie möchten also ein Girokonto eröffnen. Haben Sie Ihren Ausweis dabei?' },
  { id: 'b1-lost-property', level: 'B1', title: { en: 'Reporting a lost bag', de: 'Eine verlorene Tasche melden' }, opener: 'Fundbüro, guten Tag. Sie haben Ihre Tasche verloren? Erzählen Sie mal, wann und wo das passiert ist.' },
  { id: 'b1-hotel-problem', level: 'B1', title: { en: 'A problem with your hotel room', de: 'Ein Problem mit dem Hotelzimmer' }, opener: 'Rezeption, guten Abend. Ist mit Ihrem Zimmer etwas nicht in Ordnung?' },
  { id: 'b1-neighbour', level: 'B1', title: { en: 'Talking to a neighbour about noise', de: 'Mit dem Nachbarn über Lärm sprechen' }, opener: 'Ach, guten Abend! Sie wohnen doch direkt unter mir, oder? Was gibt’s denn?' },
  { id: 'b1-team-party', level: 'B1', title: { en: 'Planning a team party', de: 'Eine Teamfeier planen' }, opener: 'Du, die Chefin hat gesagt, wir zwei sollen die Weihnachtsfeier organisieren. Hast du schon eine Idee, was wir machen könnten?' },
  { id: 'b1-course', level: 'B1', title: { en: 'Signing up for an evening class', de: 'Sich für einen Abendkurs anmelden' }, opener: 'Volkshochschule, guten Tag. Sie interessieren sich für einen unserer Abendkurse? Für welchen denn?' },
  { id: 'b1-social-media', level: 'B1', title: { en: 'Social media: good or bad?', de: 'Soziale Medien: gut oder schlecht?' }, opener: 'Ich habe gelesen, dass Jugendliche fast vier Stunden am Tag am Handy sind. Findest du das bedenklich, oder ist das heute einfach normal?' },

  { id: 'b2-job', level: 'B2', title: { en: 'A job interview', de: 'Ein Vorstellungsgespräch' }, opener: 'Schön, dass Sie da sind. Erzählen Sie doch kurz von sich.' },
  { id: 'b2-complaint', level: 'B2', title: { en: 'A complaint at customer service', de: 'Eine Reklamation beim Kundenservice' }, opener: 'Kundenservice, mein Name ist Hoffmann. Worum geht es?' },
  { id: 'b2-meeting', level: 'B2', title: { en: 'Presenting a proposal in a meeting', de: 'Einen Vorschlag in einer Besprechung vorstellen' }, opener: 'Als Nächstes steht Ihr Vorschlag zur neuen Gleitzeitregelung auf der Tagesordnung. Bitte, Sie haben das Wort.' },
  { id: 'b2-utility-bill', level: 'B2', title: { en: 'Querying a service-charge bill', de: 'Eine Nebenkostenabrechnung klären' }, opener: 'Hausverwaltung Krüger, guten Tag. Sie rufen wegen der Nebenkostenabrechnung an? Was ist Ihnen denn daran aufgefallen?' },
  { id: 'b2-residence-permit', level: 'B2', title: { en: 'Extending a residence permit', de: 'Eine Aufenthaltserlaubnis verlängern' }, opener: 'Guten Tag, bitte nehmen Sie Platz. Sie möchten Ihre Aufenthaltserlaubnis verlängern lassen. Haben Sie alle nötigen Unterlagen mitgebracht?' },
  { id: 'b2-insurance', level: 'B2', title: { en: 'Reporting damage to your insurer', de: 'Einen Schaden bei der Versicherung melden' }, opener: 'Schadenabteilung, Sie sprechen mit Frau Yilmaz. Sie möchten einen Schaden melden? Schildern Sie mir bitte zunächst, was genau passiert ist.' },
  { id: 'b2-climate', level: 'B2', title: { en: 'Discussing climate protection', de: 'Über Klimaschutz diskutieren' }, opener: 'Viele sagen, der Einzelne könne beim Klimaschutz ohnehin wenig bewirken – entscheidend sei allein die Politik. Teilen Sie diese Ansicht?' },
  { id: 'b2-school-start', level: 'B2', title: { en: 'Should school start later?', de: 'Sollte die Schule später beginnen?' }, opener: 'In manchen Ländern beginnt der Unterricht erst um neun, weil Jugendliche frühmorgens nachweislich schlechter lernen. Halten Sie das für eine gute Idee?' },

  { id: 'c1-debate', level: 'C1', title: { en: 'Debating remote work', de: 'Über Homeoffice diskutieren' }, opener: 'Ich bin ja der Meinung, dass Homeoffice die Regel sein sollte – das klassische Büro hat sich doch längst überlebt. Oder sehen Sie das grundlegend anders?' },
  { id: 'c1-negotiation', level: 'C1', title: { en: 'Negotiating a salary', de: 'Ein Gehalt verhandeln' }, opener: 'Wir freuen uns, dass Sie sich für uns entschieden haben. Bevor wir den Vertrag aufsetzen, müssten wir noch über das Gehalt sprechen. Was schwebt Ihnen denn vor?' },
  { id: 'c1-team-conflict', level: 'C1', title: { en: 'Resolving a conflict in the team', de: 'Einen Konflikt im Team lösen' }, opener: 'Danke, dass Sie sich die Zeit nehmen. Mir ist zu Ohren gekommen, dass es in Ihrem Team zuletzt ziemlich gekriselt hat. Wie schätzen Sie die Lage ein?' },
  { id: 'c1-presentation-qa', level: 'C1', title: { en: 'Answering questions after a talk', de: 'Fragen nach einem Vortrag beantworten' }, opener: 'Vielen Dank für Ihren aufschlussreichen Vortrag. Eines leuchtet mir allerdings noch nicht ganz ein: Wie wollen Sie die Mehrkosten in der Anfangsphase eigentlich auffangen?' },
  { id: 'c1-appeal', level: 'C1', title: { en: 'Appealing an official decision', de: 'Widerspruch gegen einen Bescheid einlegen' }, opener: 'Sie haben gegen unseren Bescheid Widerspruch eingelegt. Bevor wir das Verfahren fortsetzen, möchte ich Ihnen Gelegenheit geben, Ihre Gründe noch einmal ausführlich darzulegen.' },
  { id: 'c1-ai-work', level: 'C1', title: { en: 'Artificial intelligence and the world of work', de: 'Künstliche Intelligenz und die Arbeitswelt' }, opener: 'Man hört ja immer wieder, künstliche Intelligenz werde in absehbarer Zeit ganze Berufsgruppen überflüssig machen. Halten Sie das für Panikmache, oder ist da durchaus etwas dran?' },
  { id: 'c1-tourism', level: 'C1', title: { en: 'Mass tourism and entry fees', de: 'Massentourismus und Eintrittsgelder' }, opener: 'In manchen Städten wird inzwischen ernsthaft über Eintrittsgelder für Tagestouristen nachgedacht. Ist das aus Ihrer Sicht ein sinnvoller Schritt, oder schießt man damit übers Ziel hinaus?' },
  { id: 'c1-book', level: 'C1', title: { en: 'Talking about a book', de: 'Über ein Buch sprechen' }, opener: 'Na, das Buch, das ich dir empfohlen hatte, hast du inzwischen bestimmt durch. Hat es dich genauso gepackt wie mich, oder fandest du es eher zäh?' },
];

export function scenariosFor(level: CefrLevel): Scenario[] {
  return SCENARIOS.filter((s) => s.level === level);
}
