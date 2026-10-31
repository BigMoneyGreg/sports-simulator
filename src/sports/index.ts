import type { Career, SportDefinition } from '../core/career';
import type { SportId } from '../core/format';
import { cricketSport } from './cricket';
import { footballSport } from './football';
import { rugbySport } from './rugby';

// Each sport's match type is its own; the game and the view only reach it through the definition.
export type AnySport = SportDefinition<any>;

export const SPORTS: Record<SportId, AnySport> = { football: footballSport, rugby: rugbySport, cricket: cricketSport };

export function sportOf(career: Pick<Career, 'sport'>): AnySport {
  return SPORTS[career.sport];
}
