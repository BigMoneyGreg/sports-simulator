import type { ClubIdentity } from '../../core/career';
import type { Rng } from '../../core/rng';
import { FAMOUS_CLUB_TOWNS, REAL_CLUBS } from './data/blocklist';
import { CURATED_CLUBS, SPARE_TOWNS, type CuratedClub } from './data/clubs';

export const CLUB_SUFFIXES = ['United', 'City', 'Town', 'Rovers', 'Athletic', 'Wanderers', 'Albion', 'County', 'Rangers', 'FC', 'AFC'];

const KIT_COLOURS: [string, string][] = [
  ['#c8102e', '#ffffff'],
  ['#003399', '#ffffff'],
  ['#6cabdd', '#1c2c5b'],
  ['#111111', '#ffffff'],
  ['#fdb913', '#111111'],
  ['#00843d', '#ffffff'],
  ['#7a263a', '#95bfe5'],
  ['#f47b20', '#111111'],
  ['#5b2c83', '#ffffff'],
  ['#008080', '#ffffff'],
];

export function displayName(town: string, suffix: string): string {
  return suffix === 'AFC' ? `AFC ${town}` : `${town} ${suffix}`;
}

/** The name without its club suffix, for tight spaces: "Wexstead Rovers" → "Wexstead". */
export function townName(name: string): string {
  const words = name.split(' ');
  if (words.length > 1 && words[0] === 'AFC') return words.slice(1).join(' ');
  if (words.length > 1 && CLUB_SUFFIXES.includes(words[words.length - 1])) return words.slice(0, -1).join(' ');
  return name;
}

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let realClubs: Set<string> | undefined;
function realClubSet(): Set<string> {
  realClubs ??= new Set(REAL_CLUBS.split('\n'));
  return realClubs;
}

/** Edit distance, giving up early once it exceeds `cap`. */
export function editDistance(a: string, b: string, cap = Infinity): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    if (Math.min(...cur) > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Whether a club name copies or closely imitates a real club: the full name
 * or its town is on the real-club list, or the town is within two letters of
 * a famous club's town.
 */
export function isBlocked(name: string): boolean {
  const full = normalise(name);
  const suffixes = new RegExp(`\\b(${CLUB_SUFFIXES.map((s) => s.toLowerCase()).join('|')})\\b`, 'g');
  const town = full.replace(suffixes, ' ').replace(/\s+/g, ' ').trim();
  const real = realClubSet();
  if (real.has(full) || real.has(town)) return true;
  const words = town.split(' ');
  return FAMOUS_CLUB_TOWNS.some((f) => words.includes(f) || (f.length >= 4 && editDistance(town, f, 2) <= 2));
}

/** A fresh fictional name for the player's club, not clashing with `taken`. */
export function suggestClubName(rng: Rng, taken: Iterable<string> = []): string {
  const used = new Set([...taken].map(normalise));
  for (let attempt = 0; attempt < 100; attempt++) {
    const name = displayName(rng.pick(SPARE_TOWNS), rng.pick(CLUB_SUFFIXES));
    if (!isBlocked(name) && !used.has(normalise(name))) return name;
  }
  throw new Error('could not generate a club name');
}

/** Three-letter code from a name, unique among `used`. */
export function shortCode(name: string, used: Set<string>): string {
  const letters = name.replace(/^AFC /, '').toUpperCase().replace(/[^A-Z]/g, '');
  for (let i = 1; i < letters.length; i++) {
    for (let j = i + 1; j < letters.length; j++) {
      const code = letters[0] + letters[i] + letters[j];
      if (!used.has(code)) return code;
    }
  }
  for (let n = 0; ; n++) {
    const code = letters.slice(0, 2) + String(n);
    if (!used.has(code)) return code;
  }
}

function identity(c: CuratedClub): ClubIdentity {
  return { name: displayName(c.town, c.suffix), short: c.short, colours: [...c.colours] };
}

/**
 * The world: the player's club (a generated name) first, then 99 of the 100
 * curated clubs, so the world is the same from career to career bar one club.
 */
export function clubIdentities(rng: Rng, count: number): ClubIdentity[] {
  const ai = [...CURATED_CLUBS];
  ai.splice(rng.int(0, ai.length - 1), 1);
  const clubs = ai.slice(0, count - 1).map(identity);
  const name = suggestClubName(rng, clubs.map((c) => c.name));
  const short = shortCode(name, new Set(clubs.map((c) => c.short)));
  return [{ name, short, colours: rng.pick(KIT_COLOURS) }, ...clubs];
}

// ---------------------------------------------------------------------------
// Players (flavour only)

const FIRST_NAMES = [
  'Adam', 'Alfie', 'Ben', 'Callum', 'Charlie', 'Connor', 'Dan', 'Dylan', 'Ellis', 'Ethan', 'Finn', 'George', 'Harvey', 'Isaac',
  'Jack', 'Jake', 'Jamie', 'Joe', 'Josh', 'Kieran', 'Lewis', 'Liam', 'Luke', 'Max', 'Nathan', 'Oliver', 'Owen', 'Reece', 'Rhys',
  'Ryan', 'Sam', 'Scott', 'Sean', 'Tom', 'Tyler', 'Will', 'Aidan', 'Ciaran', 'Declan', 'Eoin', 'Fraser', 'Hamish', 'Ewan', 'Gareth',
  'Dafydd', 'Kwame', 'Kofi', 'Emeka', 'Tunde', 'Chidi', 'Moussa', 'Ibrahima', 'Youssef', 'Karim', 'Mateo', 'Diego', 'Pablo',
  'Andrés', 'João', 'Tiago', 'Rafael', 'Luca', 'Marco', 'Matteo', 'Lars', 'Mikkel', 'Jonas', 'Erik', 'Sven', 'Tomasz', 'Jakub',
  'Piotr', 'Bram', 'Daan', 'Jens', 'Florian', 'Théo', 'Hugo', 'Nico', 'Kenji', 'Jae-won', 'Samir', 'Arlo', 'Rory', 'Cian',
];

const SURNAMES = [
  'Ashworth', 'Barlow', 'Bennett', 'Bradshaw', 'Brennan', 'Carver', 'Clough', 'Cole', 'Cross', 'Dawson', 'Doherty', 'Eccles',
  'Farrow', 'Fletcher', 'Gallagher', 'Garside', 'Hale', 'Hargreaves', 'Holloway', 'Hughes', 'Ingram', 'Jarvis', 'Kirkland',
  'Lambert', 'Lind', 'Lowe', 'Marsh', 'Mercer', 'Moss', 'Nolan', 'Okafor', 'Oakley', 'Pearce', 'Platt', 'Quinn', 'Rawlings',
  'Reid', 'Rowe', 'Sadler', 'Shaw', 'Slater', 'Stokes', 'Thorne', 'Tolley', 'Varley', 'Wade', 'Walsh', 'Webb', 'Whitlock',
  'Yates', 'Abbott', 'Birch', 'Crowther', 'Denning', 'Ellery', 'Fenwick', 'Goddard', 'Haworth', 'Iveson', 'Kember', 'Larkin',
  'McAllister', 'McBride', 'Docherty', 'Fraser', 'Kerr', 'Lennox', 'Munro', 'Sinclair', 'Ross', 'Griffiths', 'Pryce', 'Vaughan',
  'Llewellyn', 'Morgan', 'Owusu', 'Mensah', 'Boateng', 'Adeyemi', 'Okonkwo', 'Eze', 'Nwosu', 'Diallo', 'Traoré', 'Koné',
  'Camara', 'Benali', 'Haddad', 'Moreno', 'Ortega', 'Navarro', 'Vidal', 'Serrano', 'Ferreira', 'Carvalho', 'Moura', 'Rossi',
  'Bianchi', 'Ferrari', 'Conti', 'Lindqvist', 'Halvorsen', 'Nygaard', 'Berg', 'Kowalski', 'Nowak', 'Wiśniewski', 'De Vries',
  'Visser', 'Jansen', 'Bakker', 'Schäfer', 'Becker', 'Lefèvre', 'Girard', 'Moreau', 'Dubois', 'Tanaka', 'Park', 'Kovač',
  'Novak', 'Horvat', 'Petrov', 'Stanley', 'Pickering', 'Rimmer', 'Sutcliffe', 'Tennant', 'Underwood', 'Wilde', 'Bramley',
];

/** A name generator for one squad: surnames don't repeat within it. */
export function playerNamer(): (rng: Rng) => string {
  const used = new Set<string>();
  return (rng) => {
    let surname = rng.pick(SURNAMES);
    for (let i = 0; i < 20 && used.has(surname); i++) surname = rng.pick(SURNAMES);
    used.add(surname);
    return `${rng.pick(FIRST_NAMES)} ${surname}`;
  };
}

/** Surname for commentary and scorer lists. */
export function surname(fullName: string): string {
  const parts = fullName.split(' ');
  if (parts.length >= 3 && parts[parts.length - 2] === 'De') return parts.slice(-2).join(' ');
  return parts[parts.length - 1];
}
