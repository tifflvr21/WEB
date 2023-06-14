const r = require('rethinkdb'); // todo: change to rethinkdbdash
const fs = require('fs');
const config = require('../config');

// const TABLES = [
//   'users',
//   'chat_messages',
//   'chat_badges',
//   'steam_items',
//   // 'steam_prices',
//   'transactions',
//   'roulette_rounds',
//   'roulette_hashes',
//   'roulette_bets',
//   'tf2_jackpot_rounds',
//   'coinflip_games',
//   'mines_games'
// ];
const TABLES = JSON.parse(fs.readFileSync('./.cache/tables.json'));

const timeNow = () => new Date().getTime();

const install = async () => {
  const timeStart = timeNow();

  try {
    const args = process.argv.splice(2);
    console.log(`Installing...`);

    const conn = await r.connect(config.database);

    try {
      await r.dbCreate(config.database.name).run(conn);
    } catch(e) {
      if(e.message.toLowerCase().includes('already exists')) {
        if(args.includes('--bypass')) {
          await r.dbDrop(config.database.name).run(conn);
          await r.dbCreate(config.database.name).run(conn);

          console.log(`Database '${config.database.name}' has been dropped`);
        } else {
          throw new Error(`Database with the same name already exists! Continuing will result in a complete loss of data. If you know what you are doing, run the same command with a --bypass flag.`);
        }
      }
    }

    console.log(`Database '${config.database.name}' has been created`);

    for(let i in TABLES) {
      await r.db(config.database.name).tableCreate(TABLES[i]).run(conn);

      /*await r.db(config.database.name).table(TABLES[i]).insert([
        {title: 'random1', value: Math.random(), value2: Math.random() * 100},
        {title: 'random2', value: Math.random(), value2: Math.random() * 100},
        {title: 'random3', value: Math.random(), value2: Math.random() * 100}
      ]).run(conn);*/
      console.log(`Table '${TABLES[i]}' has been created`);
    };

    await conn.close();
    
    const timeEnd = timeNow();
    console.log(`Installation complete! Everything took ${((timeEnd - timeStart) / 1000).toFixed(1)}s`);
  } catch (e) {
    console.error(`Installation failed! Error:`, e.message);
  } finally {
    process.exit(1);
  }
};

install();