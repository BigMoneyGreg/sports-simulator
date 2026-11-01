// Writes a rugby save moments from the end of the season, so a real season end can be seen in moments.
import { writeFileSync } from 'node:fs';
import { chooseFocus, newCareer, playSeason } from '../../src/core/career';
import { Game, SAVE_VERSION, type Scheduler } from '../../src/extension/game';
import { SPORTS } from '../../src/sports';

const queue: { fn: () => void }[] = [];
const scheduler: Scheduler = {
  setTimeout: (fn) => {
    const timer = { fn };
    queue.push(timer);
    return timer;
  },
  clearTimeout: (handle) => {
    const i = queue.indexOf(handle as (typeof queue)[number]);
    if (i >= 0) queue.splice(i, 1);
  },
};
const step = () => queue.shift()!.fn();

const moments: string[] = [];
const game = new Game({ save: () => {}, changed: () => {} }, scheduler);
game.selectSport('rugby');
game.setDuration('90s');
game.start({ rating: 55, seed: 21, team: 'WAL' });
while (game.phase !== 'seasonOver') {
  if (game.phase === 'live') moments.push(JSON.stringify(game.snapshot()));
  step();
}
// About half a minute before the end, so the box is open by the time it comes.
writeFileSync(process.argv[2], moments[moments.length - 40]);

// A cricket career just out of a World Championship, stopped on its report.
const world = new Game({ save: () => {}, changed: () => {} }, scheduler);
queue.length = 0;
world.selectSport('cricket');
world.setDuration('2m');
const career = newCareer({ rating: 95, seed: 9, team: 'IND' }, SPORTS.cricket);
for (let season = 0; season < 4; season++) {
  playSeason(career, SPORTS.cricket);
  chooseFocus(career, 'attack');
}
world.load(JSON.parse(JSON.stringify({ version: SAVE_VERSION, career, live: null, paused: false, duration: '2m' })));
while (world.phase !== 'worldOver') step();
writeFileSync(process.argv[3], JSON.stringify(world.snapshot()));
