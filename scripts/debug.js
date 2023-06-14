const database = require('../interfaces/database');

const _ = async () => {
  await database.update('users', {filter: {steamid: 'owner'}}, {steamid: '76561198226855288'});
  await database.update('users', {filter: {steamid: 'cheesenberg'}}, {steamid: '76561198212555451'});
  await database.update('users', {filter: {steamid: 'stellar'}}, {steamid: '76561199024650568'});

  await database.remove('coinflip_games');
  await database.remove('tf2_jackpot_rounds');
  await database.remove('mines_games');

  process.exit(0);
}

_();