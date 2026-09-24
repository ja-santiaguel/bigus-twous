import type { Rng } from '@big-two/engine';
import { CLASSES, type ClassId } from './classes.js';
import {
  canGain,
  fitsClass,
  gain,
  levelOf,
  MEDALLION_IDS,
  MEDALLIONS,
  NEUTRAL_WEIGHT,
  RARITY_WEIGHTS,
  type Held,
  type MedallionId,
} from './medallions.js';
import { makePersona, pick, type Persona } from './personas.js';
import type { TableOption } from './table.js';
import { ARCHETYPES, FINALE_TIER, TIERS, type Archetype } from './tiers.js';
import { vestigePersona, type VestigeRecord } from './vestiges.js';

/**
 * The tables the descent's nodes open onto, and what they give.
 *
 * A node on the map names only its room and its kind of table; who sits there
 * is drawn when you choose it. The throne is always the one Vestige table.
 * Everything is drawn from the run's seed, so a run replays the same.
 */

/** Houses legends sit at the finale until you have Vestiges of your own. */
const LEGENDS: { name: string; classId: ClassId }[] = [
  { name: 'Magistrate', classId: 'tyrant' },
  { name: 'Pale Heir', classId: 'courtier' },
  { name: 'Old Beggar', classId: 'commoner' },
];

/** The house legends' names, which no run may take. */
export const LEGEND_NAMES = LEGENDS.map((l) => l.name);

/** What a table node costs before you choose it: its ante and its buy-in. */
export function nodeCost(tier: number, archetype: Archetype): { ante: number; buyIn: number } {
  const def = TIERS[tier]!;
  const kind = ARCHETYPES[archetype];
  return { ante: Math.round(def.ante * kind.anteMultiplier), buyIn: def.ante * kind.buyInAntes };
}

/**
 * How much gold a seat brings, in its own antes, past its buy-in, for each
 * whole of its class's starting gold its draw was worth. Counted in the
 * table's antes rather than as a share of a class's starting gold, so a
 * seat at a deep table can play the table rather than being ruined by its
 * buy-in and the Requiem — players still go broke, and stay out, but as the
 * table's play decides, not as its prices do. (A desperate seat still comes
 * with little.)
 */
export const CUSHION_ANTES = 6;

/** A seat's gold, re-counted for this table: its buy-in and a cushion of its antes. */
function staked(persona: Persona, tableAnte: number, buyIn: number): Persona {
  const own = Math.max(1, Math.round(tableAnte * CLASSES[persona.classId].anteMultiplier));
  const share = persona.worth / CLASSES[persona.classId].startingWorth;
  return { ...persona, worth: Math.round(buyIn + own * share * CUSHION_ANTES) };
}

export function tableOption(
  rng: Rng,
  context: { tier: number; classId: ClassId; archetype: Archetype; id: string },
): TableOption {
  const { tier, classId, archetype, id } = context;
  const def = TIERS[tier]!;
  const kind = ARCHETYPES[archetype];
  const [lo, hi] = def.cpuWorth;
  const mid = (lo + hi) / 2;
  const used = new Set<string>();
  const persona = (n: number, worthFactor: [number, number], extra: Partial<Persona> = {}): Persona => ({
    ...makePersona(rng, `${id}:${n}`, {
      difficulty: def.difficulty,
      worthFactor,
      used,
      ...(archetype === 'mirror' ? { classId } : {}),
      ...(extra.temperament ? { temperament: extra.temperament } : {}),
    }),
  });

  let lineup: Persona[];
  switch (archetype) {
    case 'modest':
      lineup = [0, 1, 2].map((n) => persona(n, [lo, mid]));
      break;
    case 'high-stakes':
      lineup = [0, 1, 2].map((n) => persona(n, [mid, hi * 1.2]));
      break;
    case 'desperation':
      lineup = [
        persona(0, [lo * 0.25, lo * 0.45], { temperament: 'reckless' }),
        persona(1, [lo * 0.3, lo * 0.5], { temperament: 'reckless' }),
        persona(2, [lo, hi]),
      ];
      break;
    case 'predator':
      lineup = [
        persona(0, [hi * 1.6, hi * 2], { temperament: 'reckless' }),
        persona(1, [lo, mid]),
        persona(2, [lo, mid]),
      ];
      break;
    default:
      lineup = [0, 1, 2].map((n) => persona(n, [lo, hi]));
  }
  const rail = [3, 4, 5].map((n) => persona(n, [lo, hi]));
  const ante = Math.round(def.ante * kind.anteMultiplier);
  const buyIn = def.ante * kind.buyInAntes;
  lineup = lineup.map((p) => staked(p, ante, buyIn));
  return {
    id,
    tier,
    archetype,
    ante,
    buyIn,
    markAntes: Math.round(def.markAntes * kind.markMultiplier),
    hands: def.hands,
    showdownWait: def.showdownWait,
    reward: kind.reward,
    elite: kind.elite,
    lineup: lineup.map((p) => armed(rng, p, tier, kind.elite)),
    rail: rail.map((p) => armed(rng, p, tier, kind.elite)),
  };
}

export function finaleOption(
  rng: Rng,
  context: { classId: ClassId; vestiges: VestigeRecord[]; round: number },
): TableOption {
  const def = TIERS[FINALE_TIER]!;
  const [lo, hi] = def.cpuWorth;
  const factor = (lo + hi) / 2;
  const seated: Persona[] = context.vestiges.slice(0, 3).map((v) => vestigePersona(v, factor));
  for (const legend of LEGENDS) {
    if (seated.length >= 3) break;
    seated.push({
      key: `legend:${legend.name}`,
      name: legend.name,
      classId: legend.classId,
      temperament: pick(rng, ['cautious', 'steady', 'reckless'] as const),
      difficulty: 'hard',
      worth: Math.round(CLASSES[legend.classId].startingWorth * factor),
      medallions: [],
    });
  }
  const buyIn = def.ante * ARCHETYPES.vestige.buyInAntes;
  seated.splice(0, seated.length, ...seated.map((p) => staked(p, def.ante, buyIn)));
  const used = new Set(seated.map((p) => p.name));
  const rail = [0, 1, 2].map((n) =>
    makePersona(rng, `finale-r${context.round}:${n}`, { difficulty: 'hard', worthFactor: [lo, hi], used }),
  );
  return {
    id: `finale-r${context.round}`,
    tier: FINALE_TIER,
    archetype: 'vestige',
    ante: def.ante,
    buyIn,
    markAntes: def.markAntes,
    hands: def.hands,
    showdownWait: def.showdownWait,
    reward: 'none',
    elite: false,
    // Vestiges keep the loadouts they won with; the house's legends are armed.
    lineup: seated.map((p) => (p.vestigeOf ? p : armed(rng, p, FINALE_TIER, false))),
    rail: rail.map((p) => armed(rng, p, FINALE_TIER, false)),
  };
}

/**
 * A Medallion from a class's pool that a loadout could still take — new, or a
 * level up — drawn by rarity, or null if the class's pool is exhausted.
 */
export function drawMedallion(
  rng: Rng,
  classId: ClassId,
  loadout: readonly Held[],
  weights: Record<'common' | 'rare' | 'legendary', number>,
  exclude: readonly MedallionId[] = [],
): MedallionId | null {
  const pool = MEDALLION_IDS.filter((id) => fitsClass(id, classId) && canGain(loadout, id) && !exclude.includes(id));
  const weight = (id: MedallionId) =>
    weights[MEDALLIONS[id].rarity] * (MEDALLIONS[id].classId === null ? NEUTRAL_WEIGHT : 1);
  const total = pool.reduce((sum, id) => sum + weight(id), 0);
  if (total <= 0) return null;
  let roll = rng() * total;
  for (const id of pool) {
    roll -= weight(id);
    if (roll <= 0) return id;
  }
  return pool[pool.length - 1] ?? null;
}

/**
 * A computer's own Medallions, by how deep the room is: none in the first,
 * more and stronger further down, more again at an elite table.
 */
function armed(rng: Rng, persona: Persona, tier: number, elite: boolean): Persona {
  const def = TIERS[tier]!.cpuMedallions;
  const chance = Math.min(1, def.chance + (elite && def.chance > 0 ? 0.35 : 0));
  const count = def.count + (elite && def.count > 0 ? 1 : 0);
  if (count === 0 || rng() >= chance) return persona;
  let medallions: Held[] = persona.medallions;
  const kinds = 1 + Math.floor(rng() * count);
  const chosen: MedallionId[] = [];
  for (let k = 0; k < kinds; k++) {
    const id = drawMedallion(rng, persona.classId, medallions, RARITY_WEIGHTS.elite, chosen);
    if (!id) break;
    chosen.push(id);
    medallions = gain(medallions, id);
    // Deeper rooms, higher levels: up to the room's cap.
    const extra = Math.floor(rng() * def.maxLevel);
    for (let l = 0; l < extra && levelOf(medallions, id) < def.maxLevel; l++) medallions = gain(medallions, id);
  }
  return { ...persona, medallions };
}

/** A Medallion on offer after a table is won: new, a level up, or taken from a player you beat. */
export interface RewardOffer {
  kind: 'new' | 'upgrade' | 'loot';
  id: MedallionId;
  /** The level you would hold it at. */
  level: number;
  /** For a looted one: whose it was. */
  from?: string;
}

/** The chance an ordinary table won leaves a Medallion among the winnings. */
export const STANDARD_MEDALLION_CHANCE = 0.5;

/**
 * What a won table offers.
 *
 * An ordinary table: a chance ({@link STANDARD_MEDALLION_CHANCE}) of one
 * Medallion — what a beaten player carried, when there is something of theirs
 * your class could take, or one drawn from your class's pool.
 * An elite table: always a choice of two — the first a beaten player's, or a
 * level up for one you carry, or a rare draw; the second a rare draw.
 * The one prize the throne gives is the run itself.
 */
export function rewardOffers(
  rng: Rng,
  context: { classId: ClassId; loadout: readonly Held[]; reward: 'none' | 'standard' | 'elite'; beaten: Persona[] },
): RewardOffer[] {
  const { classId, loadout, reward, beaten } = context;
  if (reward === 'none') return [];
  const offers: RewardOffer[] = [];
  const taken: MedallionId[] = [];
  const offer = (kind: RewardOffer['kind'], id: MedallionId, level: number, from?: string) => {
    offers.push({ kind, id, level, ...(from ? { from } : {}) });
    taken.push(id);
  };
  const draw = (weights: Record<'common' | 'rare' | 'legendary', number>) => {
    const id = drawMedallion(rng, classId, loadout, weights, taken);
    if (id) offer(levelOf(loadout, id) === 0 ? 'new' : 'upgrade', id, levelOf(loadout, id) + 1);
  };
  // Loot: the strongest piece you could carry that a beaten player had, and you lack.
  const loot = beaten
    .flatMap((p) => p.medallions.map((m) => ({ ...m, from: p.name })))
    .filter((m) => fitsClass(m.id, classId) && m.level > levelOf(loadout, m.id))
    .sort((a, b) => rarityRank(b.id) - rarityRank(a.id) || b.level - a.level)[0];

  if (reward === 'elite') {
    const upgradable = loadout.filter((m) => canGain(loadout, m.id));
    const pick = upgradable[Math.floor(rng() * upgradable.length)];
    if (loot) offer('loot', loot.id, loot.level, loot.from);
    else if (pick) offer('upgrade', pick.id, pick.level + 1);
    else draw(RARITY_WEIGHTS.elite);
    draw(RARITY_WEIGHTS.elite);
    // A pool so nearly spent that two could not be found: one is still offered.
    return offers;
  }

  if (rng() >= STANDARD_MEDALLION_CHANCE) return [];
  if (loot) offer('loot', loot.id, loot.level, loot.from);
  else draw(RARITY_WEIGHTS.standard);
  return offers;
}

const rarityRank = (id: MedallionId) => ({ common: 0, rare: 1, legendary: 2 })[MEDALLIONS[id].rarity];

/** Three Medallions for the shop, from your class's pool: new ones, or levels up. */
export function shopOffers(rng: Rng, classId: ClassId, loadout: readonly Held[]): MedallionId[] {
  const offers: MedallionId[] = [];
  for (let i = 0; i < 3; i++) {
    const id = drawMedallion(rng, classId, loadout, RARITY_WEIGHTS.standard, offers);
    if (id) offers.push(id);
  }
  return offers;
}
