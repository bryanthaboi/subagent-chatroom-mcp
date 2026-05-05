export const ADJECTIVES = [
  'kewl', 'l33t', 'dialUp', 'glitch', 'async', 'runtime', 'null', 'smarty',
  'xtreme', 'bug', 'bash', 'vhs', 'pixel', 'cyber', 'radical', 'tubular',
  'gnarly', 'slacker', 'cereal', 'trapper', 'aim', 'floppy', 'dialtone',
  'modem', 'geocity', 'napster', 'lime', 'frosted', 'crystal', 'neon',
  'chunky', 'furby', 'mall', 'mtv', 'trl', 'ska', 'boyband', 'gel',
  'glitter', 'pog', 'beanie', 'tamagotchi',
];

export const NOUNS = [
  'bandit', 'slayer', 'kid', 'kompiler', 'romeo', 'nomad', 'lurker', 'ninja',
  'pirate', 'wizard', 'fairy', 'sk8r', 'raver', 'surfer', 'goth', 'nerd',
  'genius', 'prophet', 'phantom', 'princess', 'prince', 'dude', 'chick',
  'daddy', 'mama', 'sensei', 'samurai', 'hax0r', 'noob', 'champ', 'ace',
  'legend', 'boi', 'gurl', 'queen', 'king', 'angel', 'devil',
];

export const NUMBERS = [
  '97', '98', '99', '2000', '2k', '42', '13', '420', '69', '007', '101', '247', 'XOXO',
];

export const AWAY_MESSAGES = [
  'brb, AIM-ing my crush',
  'afk — Blockbuster run',
  'dial tone calling',
  'mom needs the phone',
  'rewinding my VHS',
  'limewire is downloading',
  'tamagotchi is hungry',
  'feeding my furby',
  'Ocarina of Time grind',
  'Windows 98 rebooted itself',
  'in line for Titanic',
  'buying JNCOs',
  'out of pogs',
  'Y2K bug squashing',
  'watching TRL',
  'Crystal Pepsi run',
  'BIOS beeping at me',
  'floppy is unreadable',
  'compiling the manifest',
  'Trapper Keeper exploded',
  'gone to the mall',
  'ICQ uh-ohing',
  'Geocities is down',
  'dial-up screeching',
  'mavis beacon practice',
  'napster lawsuit?',
  'defragging',
  'printer jam, send help',
  'clippy is helping (no)',
  'raid in EverQuest',
  'MSN status: idle',
  'fixing the modem',
  'homework. probably.',
  'pager went off',
  'Boy Meets World rerun',
  'lunchables crisis',
];

export const FOLLOW_UPS = [
  'u there?', '??', 'AYT?', 'ping?', 'yo', 'knock knock', 'helloooo', '*poke*',
];

const cap = (s: string): string => (s.length === 0 ? s : s[0].toUpperCase() + s.slice(1));
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const TEMPLATES: ((adj: string, noun: string, num: string) => string)[] = [
  (adj, noun) => `${adj}_${noun}`,
  (adj, noun, num) => `${adj}${cap(noun)}${num}`,
  (adj, noun) => `${cap(adj)}${cap(noun)}`,
  (adj, noun, num) => `xX${cap(adj)}${cap(noun)}${num}Xx`,
  (_adj, noun, num) => `${noun}${num}`,
  (adj, noun, num) => `${adj}_${noun}_${num}`,
];

export function pickName(taken: Set<string>): string {
  for (let i = 0; i < 20; i++) {
    const tmpl = pick(TEMPLATES);
    const name = tmpl(pick(ADJECTIVES), pick(NOUNS), pick(NUMBERS));
    const trimmed = name.length > 22 ? name.slice(0, 22) : name;
    if (!taken.has(trimmed)) return trimmed;
  }
  const base = pick(NOUNS);
  let n = Math.floor(Math.random() * 9000) + 1000;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

export function pickAwayMessage(): string {
  return pick(AWAY_MESSAGES);
}

export function pickFollowUpPhrase(): string {
  return pick(FOLLOW_UPS);
}

export function suggestScreenNames(count: number, taken: Set<string>): string[] {
  const out: string[] = [];
  const local = new Set(taken);
  for (let i = 0; i < count; i++) {
    const n = pickName(local);
    local.add(n);
    out.push(n);
  }
  return out;
}
