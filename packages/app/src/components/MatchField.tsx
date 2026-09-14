import type { WireMatchRule } from '@big-two/protocol';
import { HostOnly } from './HostOnly.js';
import { InfoTip } from './InfoTip.js';

/**
 * How long the match runs, in both lobbies.
 *
 * Two kinds of length, so two labelled rows in one outlined set — Points and
 * Rounds — rather than five chips in a line that ask the reader to work out
 * where one kind stops and the other starts. Chips carry the bare number; the
 * row says what it counts, and the sentence underneath says what the chosen
 * option means in full.
 *
 * Everyone at a shared table sees the same set. For anyone but the host it is
 * read-only — the chosen option still marked — with a "Host only" tag beside
 * the label saying why.
 */
const ROWS: { kind: WireMatchRule['kind']; name: string; values: number[] }[] = [
  { kind: 'points', name: 'Points', values: [15, 30, 50] },
  { kind: 'rounds', name: 'Rounds', values: [5, 10] },
];

export function matchSummary(rule: WireMatchRule): string {
  return rule.kind === 'points'
    ? `First to ${rule.target} points wins the match.`
    : `Most points after ${rule.count} rounds wins the match.`;
}

function isChosen(rule: WireMatchRule, kind: WireMatchRule['kind'], value: number): boolean {
  return rule.kind === kind && (rule.kind === 'points' ? rule.target : rule.count) === value;
}

function ruleFor(kind: WireMatchRule['kind'], value: number): WireMatchRule {
  return kind === 'points' ? { kind: 'points', target: value } : { kind: 'rounds', count: value };
}

export function MatchField({
  rule,
  onChange,
  editable,
  hostOnly = false,
}: {
  rule: WireMatchRule;
  onChange: (rule: WireMatchRule) => void;
  /** Whether this person can change it right now. */
  editable: boolean;
  /** Show the "Host only" tag: a shared table, seen by someone who is not the host. */
  hostOnly?: boolean;
}) {
  return (
    <div className="field">
      <div className="field__head">
        <span className="field__labelgroup">
          <span className="field__label" id="match-label">
            Match length
          </span>
          <InfoTip label="How match length works">
            <p>
              <span className="infotip__term">Points</span> ends the match when a round leaves someone on the target.{' '}
              <span className="infotip__term">Rounds</span> ends it after the set number.
            </p>
            <p>Rounds score 5, 3, 1 and 0. A tie goes to most rounds won, then one more round.</p>
          </InfoTip>
        </span>
        {hostOnly && <HostOnly />}
      </div>
      <div
        className={`optionset ${editable ? '' : 'is-locked'}`}
        role="group"
        aria-labelledby="match-label"
        title={hostOnly ? 'Only the host can change the match length' : undefined}
      >
        {ROWS.map((row) => (
          <div key={row.kind} className="optionset__row">
            <span className="optionset__name" id={`match-${row.kind}`}>
              {row.name}
            </span>
            <div className="optionset__choices" role="group" aria-labelledby={`match-${row.kind}`}>
              {row.values.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  aria-pressed={isChosen(rule, row.kind, value)}
                  aria-label={row.kind === 'points' ? `First to ${value} points` : `${value} rounds`}
                  disabled={!editable}
                  onClick={() => onChange(ruleFor(row.kind, value))}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="field__hint">{matchSummary(rule)}</p>
    </div>
  );
}
