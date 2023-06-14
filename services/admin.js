const express = require('express');
const fs = require('fs');
const { exec } = require('child_process');
const { parseSKU, stringify } = require('tf2-item-format/static');
const database = require('../interfaces/database');
const manager = require('../interfaces/bots');
const steam = require('../interfaces/steam');
const users = require('../interfaces/users');
const userTokenMiddleware = require('../middlewares/user');
const tf2_colors = require('../resources/tf2_quality_colors');
const tf2_quality = require('../resources/tf2_quality');
const { botsForGames } = require('../subscribers/transactions_steam');
const config = require('../config');
const getBpLink = require('../helpers/getBPlink');
const router = express.Router();

const sum = (arr, key) => arr.reduce((a, b) => +a + +b[key], 0);
const getNamesForPrices = prices => {
  return Object.keys(prices).map(sku => {
    try {
      const attributes = parseSKU(sku);

      if(!attributes || !sku || isNaN(attributes.defindex)) return undefined;

      const name = stringify(attributes).replace('undefined ', '');
      const color = tf2_colors[ tf2_quality[attributes.quality] ];

      return {
        sku,
        name,
        bp_link: getBpLink(attributes),
        color
      };
    } catch(e) {
      return undefined;
    }
  }).filter(x => x !== undefined).reduce((acc, curr) => (acc[curr.sku] = {name: curr.name, bp_link: curr.bp_link, color: curr.color}, acc), {});
}
const getStartOfWeek = (offset = 0) => {
  offset = parseInt(offset);

  const prevMonday = new Date();
  const weekLong = 24 * 3600 * 7;

  prevMonday.setDate(prevMonday.getDate() - (prevMonday.getDay() + 6) % 7);
  prevMonday.setHours(0);
  prevMonday.setMinutes(0);
  prevMonday.setSeconds(0);

  return Math.round(
    (prevMonday.getTime() / 1000)
    -
    (weekLong * offset)
  );
}

router.post('/stats/:weekOffset?', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});

  const weekOffset = req.params.weekOffset || 0;

  let stats = {
    users: {total: 0, basis: 0},
    deposits: {total: 0, basis: 0},
    games: {total: 0, basis: 0},
    commission: {total: 0, basis: 0},
  };

  let statsByDay = {
    users: {},
    deposits: {},
    games: {},
    commission: {}
  };

  let dist = {
    jackpot: 0,
    coinflip: 0,
    mines: 0,
    total: 0
  };

  let txns = [];
  let txns_fail = [];
  let bots = manager.getStatus();
  let backup = JSON.parse(fs.readFileSync(`./.backups/latest.json`, 'utf8'));
  let logs = fs.readFileSync(`./.logs/combined.log`, 'utf8');

  // todo: get only this week data
  const startOfWeek = getStartOfWeek(weekOffset);
  const singleDay = 24 * 3600;
  const days = {
    monday: [startOfWeek, startOfWeek + (singleDay * 1)],
    tuesday: [startOfWeek + (singleDay * 1) + 1, startOfWeek + (singleDay * 2)],
    wednesday: [startOfWeek + (singleDay * 2) + 1, startOfWeek + (singleDay * 3)],
    thursday: [startOfWeek + (singleDay * 3) + 1, startOfWeek + (singleDay * 4)],
    friday: [startOfWeek + (singleDay * 4) + 1, startOfWeek + (singleDay * 5)],
    saturday: [startOfWeek + (singleDay * 5) + 1, startOfWeek + (singleDay * 6)],
    sunday: [startOfWeek + (singleDay * 6) + 1, startOfWeek + (singleDay * 7)]
  }

  // users
  try {
    const users = await database.get('users', {
      pluck: 'joinDate'
    });
    const usersWeek = users.filter(x => x.joinDate >= days.monday[0] && x.joinDate <= days.sunday[1]);

    stats.users.total = users.length;
    stats.users.basis = usersWeek.length;

    // chart stuff
    Object.keys(days).forEach(day => {
      const times = days[day];

      statsByDay.users[day] = 0;

      usersWeek.forEach(usr => {
        if(usr.joinDate >= times[0] && usr.joinDate < times[1]) {
          statsByDay.users[day] += 1;
        }
      });
    });

  } catch(e) {}

  // deposits
  try {
    const deposits = await database.get('transactions', {
      filter: {status: 2, type: 'deposit-steam'},
      pluck: ['status', 'time_created', 'type', 'data', 'extra_data']
    });
    // const depositsWeek = deposits.filter(d => d.time_created >= startOfWeek);
    const depositsWeek = deposits.filter(x => x.time_created >= days.monday[0] && x.time_created <= days.sunday[1]);

    deposits.forEach(d => {
      const val = d?.value || d?.extra_data?.price || d?.data?.price || 0;

      stats.deposits.total += val;
      if(d.time_created >= days.monday[0] && d.time_created <= days.sunday[1]) {
        stats.deposits.basis += val;
      }
    });

    // chart stuff
    Object.keys(days).forEach(day => {
      const times = days[day];

      statsByDay.deposits[day] = 0;

      depositsWeek.forEach(d => {
        if(d.time_created >= times[0] && d.time_created < times[1]) {
          const val = d?.value || d?.extra_data?.price || d?.data?.price || 0;

          statsByDay.deposits[day] += val;
        }
      });
    });

  } catch(e) {
    console.log('deposits fak', e);
  }

  // commission & games
  try {
    // jackpot
    const jackpot = await database.get('tf2_jackpot_rounds', {filter: {status: 3}, pluck: ['status', 'itemsCutAmount', 'timeStart']});
    const jackpotBasis = jackpot.filter(x => x.timeStart >= days.monday[0] && x.timeStart <= days.sunday[1]);
    

    stats.games.total += jackpot.length;
    stats.commission.total += sum(jackpot, 'itemsCutAmount');

    stats.games.basis += jackpotBasis.length;
    stats.commission.basis += sum(jackpotBasis, 'itemsCutAmount');

    // dist.jackpot = jackpotBasis.length;
    dist.jackpot = jackpot.length;

    // coinflip
    const coinflip = await database.get('coinflip_games', {filter: {status: 3}, pluck: ['status', 'itemsCutAmount', 'timeCreated']});
    // const coinflipBasis = coinflip.filter(x => x.timeCreated >= startOfWeek);
    const coinflipBasis = coinflip.filter(x => x.timeCreated >= days.monday[0] && x.timeCreated <= days.sunday[1]);

    stats.games.total += coinflip.length;
    stats.commission.total += sum(coinflip, 'itemsCutAmount');

    stats.games.basis += coinflipBasis.length;
    stats.commission.basis += sum(coinflipBasis, 'itemsCutAmount');

    // dist.coinflip = coinflipBasis.length;
    dist.coinflip = coinflip.length;

    // mines
    const mines = await database.get('mines_games', {filter: {status: 4}, pluck: ['status', 'itemsCutAmount', 'timeCreated']});
    // const minesBasis = mines.filter(x => x.timeCreated >= startOfWeek);
    const minesBasis = mines.filter(x => x.timeCreated >= days.monday[0] && x.timeCreated <= days.sunday[1]);

    stats.games.total += mines.length;
    stats.commission.total += sum(mines, 'itemsCutAmount');

    stats.games.basis += minesBasis.length;
    stats.commission.basis += sum(minesBasis, 'itemsCutAmount');

    // dist.mines = minesBasis.length;
    dist.mines = mines.length;

    // chart stuff
    const allGames = [...jackpotBasis, ...coinflipBasis, ...minesBasis];

    Object.keys(days).forEach(day => {
      const times = days[day];

      statsByDay.games[day] = 0;
      statsByDay.commission[day] = 0;

      allGames.forEach(gg => {
        if(gg.timeCreated >= times[0] && gg.timeCreated < times[1]) {
          statsByDay.games[day] += 1;
          statsByDay.commission[day] += gg.itemsCutAmount;
        }
      });
    });
  } catch(e) {
    console.log('commission fak', e);
  }

  dist.total = dist.jackpot + dist.mines + dist.coinflip;






  // latest transactions
  try {
    txns = await database.get('transactions', {
      // custom: (x, r) => {
        // return x.filter(r.row('status').eq(2).or(r.row('status').eq(3))).pluck(['status', 'time_created', 'type', 'data', 'extra_data', 'user']).orderBy(r.desc('time_created')).limit(10)
      // },
      filter: {status: 2},
      pluck: ['status', 'time_created', 'type', 'data', 'extra_data', 'user'],
      orderBy: ['time_created', 'desc'],
      limit: 10
    });

    txns.forEach(t => {
      const usr = users.find(t.user, 'id');
      if(usr) t.user = usr.getPublic();
    });


    txns_fail = await database.get('transactions', {
      // custom: (x, r) => {
        // return x.filter(r.row('status').eq(2).or(r.row('status').eq(3))).pluck(['status', 'time_created', 'type', 'data', 'extra_data', 'user']).orderBy(r.desc('time_created')).limit(10)
      // },
      filter: {status: 3, type: 'winnings-steam'},
      pluck: ['status', 'time_created', 'type', 'data', 'extra_data', 'user'],
      orderBy: ['time_created', 'desc'],
    });

    txns_fail.forEach(t => {
      const usr = users.find(t.user, 'id');
      if(usr) t.user = usr.getPublic();
    });
  } catch(e) {
    console.log('txn fak', e)
  }

  // leaderboard list
  const lb_list = fs.readdirSync('./.cache').filter(x => x.includes('leaderboard-winners'));
  const latest_unix = Math.max.apply(Math, lb_list.map(x => parseInt( x.replace('leaderboard-winners-', '').replace('.json', '') )));
  // const latest_unix = 1669301031;
  const latest = JSON.parse(fs.readFileSync(`./.cache/leaderboard-winners-${latest_unix}.json`, 'utf8'));

  const lb = {
    latest: latest,
    list: lb_list
  };

  return res.status(200).json({
    stats,
    statsByDay,
    dist,
    bots,
    txns,
    txns_fail,
    backup,
    logs,
    uptime: global.startTime,
    lb,
    timeRange: [days.monday[0], days.sunday[0]]
  });
});

router.post('/lb/:filename', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});
  if(!req?.params?.filename.includes('leaderboard-winners-')) return res.status(401).json({success: false, msg: 'Invalid filename'});

  try {
    const file = JSON.parse(fs.readFileSync(`./.cache/${req?.params?.filename}`, 'utf8'));
    return res.status(200).json(file);
  } catch(e) {
    return res.status(500).json({success: false, msg: 'File not found'});
  }

});

router.post('/users', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});

  const users = await database.get('users', {
    orderBy: ['joinDate', 'desc']
  }); // todo: pages etc

  return res.status(200).json(users);
});

router.post('/restartServer', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});
  if(req.self.get('steamid') !== config.steam.defaultAdmin) return res.status(401).json({success: false, msg: 'Only the main admin can restart the server'});

  console.log(`IMPORTANT: User ${req.self.get('name')} (${req.self.get('steamid')}) restarted the server!`, new Date().toLocaleString());
  
  exec("pm2 restart TF2Double", (error, stdout, stderr) => {
    if(error) {
      return res.status(401).json({success: false, msg: `Failed to restart server (1): ${error.message}`});
    }
    if(stderr) {
      return res.status(401).json({success: false, msg: `Failed to restart server (2): ${stderr}`});
    }
    
    return res.status(200).json({success: true, msg: 'Server has been restarted and should come back online within 30 seconds'});
  });
});

router.get('/backup/:name/:token', async (req, res) => {
  const self = users.find(req.params.token, 'token');
  if(!self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unathorized'});

  res.download(`./.backups/${req.params.name}`, `tf2double_backup_${Math.round(+new Date() / 1000)}.zip`);
});

router.get('/downloadLogs/:token', async (req, res) => {
  const self = users.find(req.params.token, 'token');
  if(!self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unathorized'});

  res.download(`./.logs/combined.log`, `tf2double_logs_${Math.round(+new Date() / 1000)}.log`);
});

router.post('/clearLogs', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});

  const msg = `Logs have been cleared by ${req.self.get('name')} (${req.self.get('steamid')}), ${new Date().toGMTString()}`;

  // todo: maybe save the logs in a separate file before clearing?
  fs.writeFile('./.logs/combined.log', msg + "\n", 'utf8', function (err) {
    if(err) return res.status(500).json({success: false, msg: err.message});

    return res.status(200).json({success: true, msg: msg});
  });
});

router.post('/getPrices', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});

  const prices = JSON.parse(fs.readFileSync(`./.cache/prices_tf.json`, 'utf8'));
  const prices_overwrite = JSON.parse(fs.readFileSync(`./.cache/prices_tf_overwrite.json`, 'utf8'));
  const names = getNamesForPrices(prices);

  return res.status(200).json({
    prices,
    prices_overwrite,
    names
  });
});

router.post('/getPricesReview', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});

  const prices = JSON.parse(fs.readFileSync(`./.cache/prices_tf.json`, 'utf8'));
  const prices_overwrite = JSON.parse(fs.readFileSync(`./.cache/prices_tf_overwrite.json`, 'utf8'));
  const prices_review = JSON.parse(fs.readFileSync(`./.cache/prices_tf_to_review.json`, 'utf8'));
  const prices_final = {...prices_overwrite, ...prices};
  const names = getNamesForPrices({...prices_final, ...prices_review});

  // send only the prices that overlap prices_review
  Object.keys(prices_final).forEach(sku => {
    if(!prices_review[sku]) {
      delete prices_final[sku];
      delete names[sku];
    }
  });

  return res.status(200).json({
    prices: prices_final,
    prices_review,
    names,
  });
});

router.post('/updatePrice', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});
  if(!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(401).json({success: false, msg: 'Invalid data'});
  if(!req.body.sku || !req.body.price) return res.status(401).json({success: false, msg: 'Invalid data (1)'});

  let prices_overwrite = JSON.parse(fs.readFileSync(`./.cache/prices_tf_overwrite.json`, 'utf8'));
  prices_overwrite[req.body.sku] = parseFloat(req.body.price);

  if(!!req.body.reset) {
    delete prices_overwrite[req.body.sku];
  }

  fs.writeFileSync('./.cache/prices_tf_overwrite.json', JSON.stringify(prices_overwrite));
  steam.checkCacheExpiration(); // this will reload the file in memory to make sure it applies instantly

  return res.status(200).json({
    success: true
  });
});

router.post('/acceptManualPrice', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(req.self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unauthorized'});
  if(!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(401).json({success: false, msg: 'Invalid data'});
  if(!req.body.sku || typeof req.body.accept !== 'boolean') return res.status(401).json({success: false, msg: 'Invalid data (1)'});

  const { sku, accept } = req.body;
  const prices = JSON.parse(fs.readFileSync(`./.cache/prices_tf.json`, 'utf8'));
  const prices_review = JSON.parse(fs.readFileSync(`./.cache/prices_tf_to_review.json`, 'utf8'));

  if(typeof prices_review[sku] == 'undefined') {
    return res.status(401).json({success: false, msg: 'Invalid data (3)'});
  }

  if(!!accept) {
    prices[sku] = prices_review[sku].price;

    fs.writeFileSync('./.cache/prices_tf.json', JSON.stringify(prices));
    steam.checkCacheExpiration(); // this will reload the file in memory to make sure it applies instantly
  }

  delete prices_review[sku];

  fs.writeFileSync('./.cache/prices_tf_to_review.json', JSON.stringify(prices_review));

  return res.status(200).json({
    success: true
  });
});



router.post('/resendOffer', userTokenMiddleware, async (req, res) => {
  try {
    if(!req.self) throw 'Invalid user';
    if(req.self.get('rank') < 4) throw 'Unauthorized';

    const bot = manager.getByIndex(botsForGames[req?.body?.offer?.game] || 0);
    if(!bot) throw `Failed to find bot for game ${req?.body?.offer?.game} (make sure app is running without the --no-bot flag)`;

    bot.sendOffer({
      type: req?.body?.offer?.type,
      user: users.find(req?.body?.offer?.userid, 'id'),
      code: req?.body?.offer?.code,
      // message: req.body?.message
      items: req?.body?.offer?.items || []
    }).then(id => {
      return res.status(200).json({success: true, msg: `Offer sent successfully, id is #${id}`});
    }).catch(e => {
      console.log(e);
      return res.status(500).json({success: false, msg: `Failed to send offer: ${e.toString()}`});
    });

  } catch(e) {
    return res.status(500).json({success: false, msg: e?.message || e});
  }


});

module.exports = router;