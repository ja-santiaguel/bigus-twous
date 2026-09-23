import { CLASSES, type Persona } from '@big-two/campaign';
import { medallionName } from './medallionText.js';

const gold = (n: number) => Math.round(n).toLocaleString('en-GB');

/** One player at a table: name; class, temperament and gold; and any Medallions they carry. */
export function PersonaLine({ persona }: { persona: Persona }) {
  return (
    <span className="campaign__persona">
      <span>{persona.name}</span>
      <span>
        <span className={`classtag classtag--${persona.classId}`}>{CLASSES[persona.classId].name}</span> ·{' '}
        {persona.temperament} · {gold(persona.worth)} gold
      </span>
      {persona.medallions.length > 0 && (
        <span className="campaign__carried">
          Carries {persona.medallions.map((m) => medallionName(m.id, m.level)).join(', ')}
        </span>
      )}
    </span>
  );
}
