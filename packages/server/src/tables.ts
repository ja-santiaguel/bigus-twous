import type { Difficulty } from '@big-two/ai';
import { makeSeed, type Speed } from '@big-two/session';
import type { TableCode } from '@big-two/protocol';
import { Table, type TableOptions } from './table.js';

/**
 * Every table the server is currently running, by code.
 *
 * Tables are made by sharing a link, not by matchmaking: somebody opens one,
 * the code goes into a URL, and whoever follows it sits down. So a code has to
 * be short enough to read aloud and unambiguous enough to type — and it is not
 * a secret, because a link is not a secret. Anyone with it can join, which is
 * exactly what sharing it means.
 */

/** No I, O, 0 or 1: a code gets read aloud and typed by hand. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

export interface RegistryOptions {
  difficulty?: Difficulty;
  turnTimeoutMs?: number;
  /** Table-wide pacing for computer seats; see `TableOptions`. */
  speed?: Speed;
  paced?: boolean;
  /**
   * How long an empty table is kept before it is thrown away.
   *
   * Not zero, because "everybody reloaded at once" and "everybody went home"
   * look identical for the first few seconds, and the first one should not
   * lose the game.
   */
  emptyTableGraceMs?: number;
  random?: () => number;
  now?: () => number;
}

export class TableRegistry {
  private readonly tables = new Map<TableCode, Table>();
  /** When a table last had nobody connected. Cleared the moment somebody does. */
  private readonly emptySince = new Map<TableCode, number>();
  private readonly options: Required<RegistryOptions>;

  constructor(options: RegistryOptions = {}) {
    this.options = {
      difficulty: 'medium',
      turnTimeoutMs: 60_000,
      speed: 'normal',
      paced: true,
      emptyTableGraceMs: 120_000,
      random: Math.random,
      now: Date.now,
      ...options,
    };
  }

  /** Opens a new table and returns its code. */
  create(overrides: Partial<TableOptions> = {}): Table {
    const code = overrides.code ?? this.freshCode();
    const table = new Table({
      code,
      // The same seed format as a game played alone, so a seed copied from
      // either deals the same cards in the other.
      seed: overrides.seed ?? makeSeed(this.options.random),
      difficulty: this.options.difficulty,
      turnTimeoutMs: this.options.turnTimeoutMs,
      speed: this.options.speed,
      paced: this.options.paced,
      ...overrides,
    });
    this.tables.set(code, table);
    return table;
  }

  get(code: TableCode): Table | undefined {
    return this.tables.get(code.toUpperCase());
  }

  /** Every open table. Used by the sweeper and by tests. */
  get size(): number {
    return this.tables.size;
  }

  /**
   * Throw away tables nobody has come back to.
   *
   * Called on a timer by the host process rather than scheduled per table:
   * one sweep is easier to reason about than N timers, and a table that
   * outlives its grace period by a few seconds costs nothing.
   */
  sweep(): void {
    const now = this.options.now();
    for (const [code, table] of this.tables) {
      if (!table.abandoned) {
        this.emptySince.delete(code);
        continue;
      }
      const since = this.emptySince.get(code);
      if (since === undefined) {
        this.emptySince.set(code, now);
        continue;
      }
      if (now - since >= this.options.emptyTableGraceMs) {
        table.close('Everybody left.');
        this.tables.delete(code);
        this.emptySince.delete(code);
      }
    }
  }

  closeAll(reason?: string): void {
    for (const table of this.tables.values()) table.close(reason);
    this.tables.clear();
    this.emptySince.clear();
  }

  private freshCode(): TableCode {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += ALPHABET[Math.floor(this.options.random() * ALPHABET.length)];
      }
      if (!this.tables.has(code)) return code;
    }
    throw new Error('Could not find a free table code.');
  }
}
