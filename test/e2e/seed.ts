// Writes a rugby save moments from the end of the season, so a real season end can be seen in moments.
import { writeFileSync } from 'node:fs';
import { Game, type Scheduler } from '../../src/extension/game';

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
game.setDuration('25m');
game.start({ rating: 55, seed: 21, team: 'WAL' });
while (game.phase !== 'seasonOver') {
  if (game.phase === 'live') moments.push(JSON.stringify(game.snapshot()));
  step();
}
// About half a minute before the end, so the box is open by the time it comes.
writeFileSync(process.argv[2], moments[moments.length - 40]);
