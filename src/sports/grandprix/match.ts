import { finishing } from '../../core/finishing';
import type { Rng } from '../../core/rng';
import type { GoalRecord, MatchOptions, MatchOutcome, RaceResult, SportModule, TeamSheet } from '../../core/sport';
import { effectiveStats } from '../football/match';
import { TRACK_TRAITS } from './data';

export const TUNING = {
  laps: 50,
  /** Seconds a lap at the field's average pace. */
  baseLap: 90,
  /** Seconds a lap gained per point of speed over the field's average. */
  pacePerPoint: 0.03,
  /** A driver's hidden ability, as seconds a lap per unit of its logarithm. */
  driverPace: 0.5,
  /** The lead driver's edge over his team-mate, in seconds a lap. */
  leadDriver: 0.05,
  /** How much a car is up or down on the day, and from lap to lap, in seconds. */
  daySpread: 0.38,
  lapSpread: 0.22,
  /** Grid: how far qualifying can swing a car, in seconds, and the gap per place at the start. */
  qualifyingSpread: 0.4,
  gridGap: 0.25,
  /** The chance a car stops on any lap at the field's average reliability, and how quickly that falls with more. */
  stopPerLap: 0.0027,
  stopScale: 22,
  /** The pit stop's cost in seconds, and how much slicker a reliable team's crew is per point. */
  pitLoss: 22,
  pitPerPoint: 0.02,
  pitSpread: 0.9,
  /** A crash brings the safety car out this often; it bunches the field up for these laps. */
  safetyCarChance: 0.5,
  safetyCarLaps: 3,
  safetyCarBunch: 0.35,
  /** The chance of rain anywhere without its own, and how much it spreads the field, lifts the best drivers and causes stops. */
  rain: 0.12,
  rainSpread: 1.5,
  rainDriver: 1.6,
  rainStops: 1.5,
  /** A run of form, and being at home in the Race of Nations, in seconds a lap. */
  streakPace: 0.08,
  hostPace: 0.1,
};

/** Points for the top ten. */
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const FAILURES = ['engine failure', 'gearbox failure', 'hydraulics failure', 'puncture'];
const CRASHES = ['crashed out', 'spun off', 'collision'];

export interface Car {
  clubId: number;
  driverId: number;
  /** Seconds a lap against the field's average, for speed and the driver. */
  edge: number;
  /** Today's edge on top of that. */
  day: number;
  stopRate: number;
  pitCost: number;
  pitLap: number;
  /** Total race time so far, in seconds. */
  time: number;
  grid: number;
  place: number;
  /** Places since the lap before; shown as an arrow. */
  moved: number;
  /** In the pits this lap. */
  pitting: boolean;
  pitted: boolean;
  out?: string;
}

export type RaceEvent =
  | { type: 'start'; lap: number }
  | { type: 'rain'; lap: number }
  | { type: 'overtake'; lap: number; driverId: number; clubId: number; place: number }
  | { type: 'lost'; lap: number; driverId: number; clubId: number; place: number }
  | { type: 'pit'; lap: number; driverId: number; clubId: number }
  | { type: 'out'; lap: number; driverId: number; clubId: number; why: string }
  | { type: 'lead'; lap: number; driverId: number; clubId: number }
  | { type: 'safetyCar'; lap: number }
  | { type: 'green'; lap: number }
  | { type: 'finish'; lap: number; driverId: number; clubId: number };

export interface RaceMatch {
  lap: number;
  laps: number;
  cars: Car[];
  safetyCar: number;
  wet: boolean;
  track?: string;
  events: RaceEvent[];
  /** The team followed closely (the player's, if they're in this race), and one other to fit the shared match shape. */
  home: { clubId: number; goals: number; gained: number; lost: number };
  away: { clubId: number; goals: number; gained: number; lost: number };
  knockout?: undefined;
}

function gauss(rng: Rng): number {
  return rng.normal(0, 1);
}

export function createMatch(home: TeamSheet, away: TeamSheet, options: MatchOptions, rng: Rng): RaceMatch {
  const field = options.field ?? [home, away];
  const stats = field.map(effectiveStats);
  const mean = (of: (s: { attack: number; defence: number }) => number) => stats.reduce((t, s) => t + of(s), 0) / stats.length;
  const speed = mean((s) => s.attack);
  const reliable = mean((s) => s.defence);
  const traits = TRACK_TRAITS[options.track ?? ''] ?? {};
  const wet = rng.chance(traits.rain ?? TUNING.rain);
  const speedShare = traits.speed ?? 1;
  const driverShare = (traits.driver ?? 1) * (wet ? TUNING.rainDriver : 1);
  const stops = (traits.wear ?? 1) * (wet ? TUNING.rainStops : 1);
  const cars: Car[] = field.flatMap((sheet, i) =>
    sheet.lineup.slice(0, options.oneCar ? 1 : 2).map((driver) => {
      const edge =
        speedShare * TUNING.pacePerPoint * (stats[i].attack - speed) +
        driverShare * TUNING.driverPace * Math.log(finishing(driver.id)) +
        (driver.number === 1 ? TUNING.leadDriver : 0) +
        TUNING.streakPace * (sheet.streak ?? 0) +
        (sheet.clubId === options.host ? TUNING.hostPace : 0);
      return {
        clubId: sheet.clubId,
        driverId: driver.id,
        edge,
        day: gauss(rng) * TUNING.daySpread * (wet ? TUNING.rainSpread : 1),
        stopRate: stops * TUNING.stopPerLap * Math.exp(-(stats[i].defence - reliable) / TUNING.stopScale),
        pitCost: TUNING.pitLoss - TUNING.pitPerPoint * (stats[i].defence - reliable),
        pitLap: rng.int(16, 34),
        time: 0,
        grid: 0,
        place: 0,
        moved: 0,
        pitting: false,
        pitted: false,
      };
    }),
  );
  // Qualifying sets the grid, a little behind each other at the start.
  const quali = cars.map((car) => ({ car, lap: car.edge + car.day + gauss(rng) * TUNING.qualifyingSpread }));
  quali.sort((a, b) => b.lap - a.lap);
  quali.forEach(({ car }, i) => {
    car.grid = i + 1;
    car.place = i + 1;
    car.time = i * TUNING.gridGap;
  });
  return {
    lap: 0,
    laps: TUNING.laps,
    cars,
    safetyCar: 0,
    wet,
    ...(options.track ? { track: options.track } : {}),
    events: wet ? [{ type: 'start', lap: 0 }, { type: 'rain', lap: 0 }] : [{ type: 'start', lap: 0 }],
    home: { clubId: home.clubId, goals: 0, gained: 0, lost: 0 },
    away: { clubId: away.clubId, goals: 0, gained: 0, lost: 0 },
  };
}

/** Cars still running by time; those out behind them, the last to stop first. */
export function classified(m: Pick<RaceMatch, 'cars' | 'events'>): Car[] {
  const stoppedOn = (car: Car) => {
    for (let i = m.events.length - 1; i >= 0; i--) {
      const e = m.events[i];
      if (e.type === 'out' && e.driverId === car.driverId) return e.lap;
    }
    return 0;
  };
  return [...m.cars].sort((a, b) => Number(!!a.out) - Number(!!b.out) || (a.out ? stoppedOn(b) - stoppedOn(a) : a.time - b.time) || a.grid - b.grid);
}

export function step(m: RaceMatch, rng: Rng): void {
  if (isFinished(m)) return;
  m.lap++;
  const before = new Map(m.cars.map((c) => [c.driverId, c.place]));
  const leader = classified(m)[0];
  const neutral = m.safetyCar > 0;
  let crashed = false;
  for (const car of m.cars) {
    car.pitting = false;
    if (car.out) continue;
    if (rng.chance(car.stopRate)) {
      const crash = rng.chance(0.4);
      crashed ||= crash;
      car.out = rng.pick(crash ? CRASHES : FAILURES);
      m.events.push({ type: 'out', lap: m.lap, driverId: car.driverId, clubId: car.clubId, why: car.out });
      continue;
    }
    car.time += TUNING.baseLap + (neutral ? 0 : gauss(rng) * TUNING.lapSpread * (m.wet ? TUNING.rainSpread : 1) - car.edge - car.day);
    if (!car.pitted && m.lap >= car.pitLap) {
      car.pitted = true;
      car.pitting = true;
      car.time += neutral ? car.pitCost * 0.5 : car.pitCost + gauss(rng) * TUNING.pitSpread;
      if (car.clubId === m.home.clubId) m.events.push({ type: 'pit', lap: m.lap, driverId: car.driverId, clubId: car.clubId });
    }
  }
  if (neutral && --m.safetyCar === 0) m.events.push({ type: 'green', lap: m.lap });
  if (crashed && !neutral && m.lap < m.laps - TUNING.safetyCarLaps && rng.chance(TUNING.safetyCarChance)) {
    m.safetyCar = TUNING.safetyCarLaps;
    m.events.push({ type: 'safetyCar', lap: m.lap });
    bunch(m);
  }
  const order = classified(m);
  order.forEach((car, i) => {
    car.place = i + 1;
    car.moved = before.get(car.driverId)! - car.place;
  });
  noteMoves(m, order, leader, before);
  if (isFinished(m)) m.events.push({ type: 'finish', lap: m.lap, driverId: order[0].driverId, clubId: order[0].clubId });
}

/** The safety car closes the field up behind the leader, keeping the order. */
function bunch(m: RaceMatch): void {
  const running = m.cars.filter((c) => !c.out).sort((a, b) => a.time - b.time);
  const first = running[0]?.time ?? 0;
  for (const car of running) car.time = first + (car.time - first) * TUNING.safetyCarBunch;
}

function noteMoves(m: RaceMatch, order: Car[], leader: Car, before: Map<number, number>): void {
  if (order[0].driverId !== leader.driverId && !order[0].out) m.events.push({ type: 'lead', lap: m.lap, driverId: order[0].driverId, clubId: order[0].clubId });
  const was = (car: Car) => before.get(car.driverId)!;
  for (const car of m.cars) {
    if (car.clubId !== m.home.clubId || car.out || car.pitting) continue;
    // A place changed by someone's pit stop or retirement isn't racing: only passing on track counts.
    const racing = order.filter((other) => other !== car && !other.out && !other.pitting);
    if (racing.some((other) => was(other) < was(car) && other.place > car.place)) {
      m.home.gained++;
      m.events.push({ type: 'overtake', lap: m.lap, driverId: car.driverId, clubId: car.clubId, place: car.place });
    } else if (racing.some((other) => was(other) > was(car) && other.place < car.place)) {
      m.home.lost++;
      m.events.push({ type: 'lost', lap: m.lap, driverId: car.driverId, clubId: car.clubId, place: car.place });
    }
  }
}

export function isFinished(m: RaceMatch): boolean {
  return m.lap >= m.laps || m.cars.every((c) => c.out);
}

/** The race as it stands, or as it ended: where each car is, and what that's worth. */
export function raceResult(m: RaceMatch): RaceResult {
  const order = classified(m);
  return {
    order: order.map((c, i) => ({ clubId: c.clubId, driverId: c.driverId, place: i + 1, grid: c.grid, points: c.out ? 0 : (RACE_POINTS[i] ?? 0), out: !!c.out })),
    fieldSize: order.length,
  };
}

export function outcome(m: RaceMatch): MatchOutcome {
  const race = raceResult(m);
  const teamPoints = (clubId: number) => race.order.filter((c) => c.clubId === clubId).reduce((t, c) => t + c.points, 0);
  const goals: GoalRecord[] = race.order
    .filter((c) => c.points > 0)
    .map((c) => ({ side: c.clubId === m.home.clubId ? 'home' : 'away', playerId: c.driverId, minute: m.lap, added: 0, ownGoal: false, count: c.points }));
  return {
    homeGoals: teamPoints(m.home.clubId),
    awayGoals: teamPoints(m.away.clubId),
    goals,
    winner: race.order[0].clubId === m.home.clubId ? 'home' : 'away',
    race,
  };
}

export const grandPrix: SportModule<RaceMatch> = {
  createMatch,
  step,
  isFinished,
  outcome,
  ticks: TUNING.laps,
  realMinutes: 90,
  countsLive: (m) => m.lap > 0,
  // Green for passing someone or being passed in red. A car stopping counts as a place lost.
  alerts: (m) => [m.home.gained, m.home.lost + m.events.filter((e) => e.type === 'out' && e.clubId === m.home.clubId).length],
  notable: (m) => m.events.filter((e) => e.type === 'out' || e.type === 'safetyCar' || e.type === 'lead').length,
};
