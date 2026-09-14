/**
 * A name to start with.
 *
 * An empty "Your name" field reads as a form to fill in before you are allowed
 * to play. A plausible name already in it reads as done — and is still a field,
 * so anyone who cares can type over it. Short, common, and from many places, so
 * a table of four strangers does not look like a list of test accounts.
 */
const COMMON_NAMES = [
  'Alex',
  'Sam',
  'Jordan',
  'Taylor',
  'Chris',
  'Jamie',
  'Morgan',
  'Casey',
  'Riley',
  'Drew',
  'Robin',
  'Lee',
  'Kim',
  'Max',
  'Ben',
  'Leo',
  'Mia',
  'Zoe',
  'Ava',
  'Emma',
  'Noah',
  'Liam',
  'Lucas',
  'Ella',
  'Grace',
  'Jack',
  'Oscar',
  'Ruby',
  'Isla',
  'Nina',
  'Omar',
  'Sofia',
  'Maya',
  'Kai',
  'Ivy',
  'Theo',
  'Luca',
  'Eli',
  'Anna',
  'Hana',
  'Ken',
  'Amir',
  'Rosa',
  'Tom',
  'Lily',
  'Owen',
  'Finn',
  'Nora',
  'Jade',
  'Mei',
];

export function randomName(random: () => number = Math.random): string {
  return COMMON_NAMES[Math.floor(random() * COMMON_NAMES.length)]!;
}
