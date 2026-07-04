export const ROLE_TOPICS: Record<string, string[]> = {
  Student: ['classes', 'the Library', 'afternoon plans'],
  'Cafe Owner': ['coffee', 'busy hours', 'what customers are discussing'],
  Researcher: ['notes', 'public patterns', 'careful observations'],
  Journalist: ['leads', 'public reactions', 'what changed today'],
  Tourist: ['places to visit', 'local customs', 'good photo spots'],
};

export const LOCATION_TOPICS: Record<string, string[]> = {
  Home: ['rest', 'morning routines', 'quiet plans'],
  Cafe: ['coffee', 'lunch', 'who has been stopping by'],
  Library: ['books', 'study', 'research notes'],
  Park: ['fresh air', 'walks', 'people relaxing'],
  'Town Square': ['announcements', 'crowds', 'events'],
};

export const GENERIC_OPENERS = [
  'I noticed the town feels different today.',
  'Have you heard anything interesting?',
  'I am adjusting my plan as the day changes.',
  'This place is a good spot to compare notes.',
];
