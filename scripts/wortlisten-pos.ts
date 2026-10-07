// Small word lists for the part-of-speech guess in extract-wortlisten.ts. Verbs come mostly from the
// Goethe A2/B1 lists themselves (every verb there carries its forms); these lists cover the rest.

export const ADVERBS = new Set(`
abends allein also anders auch auf außen außerdem bald bereits besonders bestimmt bisher bitte
bloß dabei dafür dagegen daher dahin damals damit danach daneben dann darum da dort dorthin
draußen drinnen drüben dabei ebenfalls eben eigentlich einfach einmal endlich etwa etwas fast
früher ganz gar genau genauso gerade gern gestern gleich hier heute hinten hoffentlich immer
inzwischen irgendwann jetzt kaum leider links los manchmal mehr meistens mittags montags morgen
morgens nachher nachmittags nachts natürlich neulich nicht nie niemals noch nun nur oben oft
rechts schließlich schon sehr selbst selten so sofort sogar sonst später trotzdem überall
übermorgen vorgestern unten vielleicht vorbei vorher vormittags vorn vorne wahrscheinlich
wieder wirklich wohl zuerst zuletzt zurück zusammen zwar ziemlich zurzeit sicher hin her
heraus herein hinaus hinein insgesamt jedenfalls allerdings ebenso trotzdem vorwärts rückwärts
abwärts aufwärts weg weiter weiterhin zunächst zuvor überhaupt anschließend außerdem bisschen
darauf daraus darüber davon dazu dorther gleichfalls irgendwo irgendwie jedoch nirgends nämlich
oftmals stets täglich wochentags werktags eher ehrlich genug lange sowieso tagsüber unterwegs
vielmals vorwiegend zufällig ziemlich
`.trim().split(/\s+/));

export const ADJECTIVES = new Set(`
alt arm bekannt besetzt billig blau blond braun breit bunt dick dringend dumm dunkel dünn echt
eng falsch faul fein fern fertig fest fit frei fremd frisch froh fröhlich früh gelb gesund glatt
gleich grau groß grün gut halb hart hässlich heiß hell hoch hübsch jung kalt kaputt klar klein
klug krank kurz lang langsam laut lecker leer leicht leise lieb müde nah nass nett neu offen
ok okay rot rund ruhig satt sauber sauer scharf schlecht schlimm schmal schnell schön
schwach schwarz schwer stark still stolz süß teuer tief tot toll traurig treu trocken voll
wach warm weich weiß weit wenig wichtig wild zufrieden geöffnet geschlossen verheiratet
geschieden ledig verwitwet getrennt bequem böse doof egal ernst extra fair gemütlich gesamt
genug gerecht geschickt herzlich interessant kostenlos lila möglich nötig okay orange
pünktlich richtig rosa schade sicher spannend super sympathisch typisch verboten verrückt
wunderbar zuverlässig
`.trim().split(/\s+/));

// Lowercase words ending in -en/-ern/-eln that are not verbs.
export const NOT_VERBS = new Set(`
oben unten gegen morgen gestern vorgestern übermorgen innen außen trocken offen eigen golden
zufrieden verschieden entgegen wegen neben zwischen selten besten meisten einzeln eben ebenfalls
seltsam wesentlichen vorn hinten eben zusammen innen draußen drinnen trotzdem ungefähr
übrigen heutigen sondern indem obwohl bevor nachdem seitdem solange sobald damit dennoch einen
modern sauer teuer dunkel einmalen allgemeinen
`.trim().split(/\s+/));

// Nouns the Goethe alphabetical lists leave to their themed word groups (days, months, seasons,
// times of day, directions, units), as "article word plural".
export const EXTRA_NOUNS = `
der Montag -e;der Dienstag -e;der Mittwoch -e;der Donnerstag -e;der Freitag -e;der Samstag -e;der Sonntag -e;
der Sonnabend -e;der Januar -e;der Februar -e;der März -e;der April -e;der Mai -e;der Juni -s;der Juli -s;
der August -e;der September -;der Oktober -;der November -;der Dezember -;der Frühling -e;der Sommer -;
der Herbst -e;der Winter -;das Frühjahr -e;der Morgen -;der Vormittag -e;der Mittag -e;der Nachmittag -e;
der Abend -e;die Nacht ¨-e;der Tag -e;die Woche -n;das Wochenende -n;der Monat -e;das Jahr -e;
die Stunde -n;die Minute -n;die Sekunde -n;der Norden;der Süden;der Osten;der Westen;der Euro -s;
der Cent -s;das Kilo -s;das Gramm -;der Meter -;der Kilometer -;der Zentimeter -;der Liter -;das Pfund -e;
der Grad -e;das Deutsch;das Ostern;das Weihnachten;die Mama -s;der Papa -s
`.trim().split(';').map((s) => s.trim()).filter(Boolean);

// Noun endings that fix the article (and the plural where it is regular).
export const SUFFIX_ARTICLES: { re: RegExp; article: string; plural?: string }[] = [
  { re: /ung$/, article: 'die', plural: 'en' },
  { re: /(heit|keit|schaft)$/, article: 'die', plural: 'en' },
  { re: /(tion|sion)$/, article: 'die', plural: 'en' },
  { re: /(tät)$/, article: 'die', plural: 'en' },
  { re: /[^e]ie$/, article: 'die', plural: 'n' },
  { re: /[a-zäöü]{3}ei$/, article: 'die', plural: 'en' },
  { re: /(enz|anz)$/, article: 'die', plural: 'en' },
  { re: /(chen|lein)$/, article: 'das', plural: '' },
  { re: /ling$/, article: 'der', plural: 'e' },
  { re: /ismus$/, article: 'der' },
  { re: /[^a]ist$/, article: 'der', plural: 'en' },
];
