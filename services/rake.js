const fs = require('fs');
const express = require('express');
const events = require('../interfaces/events');
const users = require('../interfaces/users');
const botManager = require('../interfaces/bots');
const { botsForGames } = require('../subscribers/transactions_steam');
const { steam } = require('../config');

const router = express.Router();
// let rake = {};

// console.log('rake running');

// setTimeout(() => {
//   events.emit('rake:new', {
//     items: [{assetid: '123', steamid: '22', price: 50, name: 'xx'}],
//     amount: 50,
//     game: 'coinflip'
//   });
// }, 3000);

events.on('rake:new', ({ items, amount, game }) => {
  const bot = steam.bots[ botsForGames[game] ];
  const filename = `./.cache/rake/rake_${bot?.steamid}.json`;
  
  let rake = {
    amount: 0,
    items: [],
    lastUpdate: Math.floor(new Date().getTime() / 1000),
    history: [],
  };

  try {
    rake = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch(e) {}

  rake.amount += amount;
  rake.items = [...rake.items, ...items];
  rake.lastUpdate = Math.floor(new Date().getTime() / 1000);

  fs.writeFileSync(filename, JSON.stringify(rake, null, 2), 'utf8');
  console.log('saved');
});


router.post('/info', async (req, res) => {
  const self = users.find(req.body.token, 'token');
  if(!self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unathorized'});

  let rake = {
    total: 0,
    bots: {}
  };

  const _ = (index = 0, cb) => {
    try {
      const { steamid } = steam.bots[index] || {};

      rake.bots[steamid] = JSON.parse(fs.readFileSync(`./.cache/rake/rake_${steamid}.json`, 'utf8'));
      rake.total += rake.bots[steamid].amount;
    } catch(e) {} finally {
      if(steam.bots[index + 1]) {
        return _(index + 1, cb);
      } else {
        return callback();
      }
    };
  }

  const callback = () => {
    return res.status(200).json(rake);
  }

  _(0, callback);
});


router.post('/withdraw', async (req, res) => {
  const self = users.find(req.body.token, 'token');
  if(!self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(self.get('rank') < 4) return res.status(401).json({success: false, msg: 'Unathorized'});

  let rake = {};
  try {
    rake = JSON.parse(fs.readFileSync(`./.cache/rake/rake_${req.body.bot}.json`, 'utf8'));
  } catch(e) {
    return res.status(422).json({sucess: false, msg: `Rake cache for bot "${req.body.bot}" wasnt found`});
  }

  // try to request
  const bot = botManager.getBySteamid(req.body.bot);
  const filename = `./.cache/rake/rake_${req.body.bot}.json`;
  if(!bot) {
    return res.status(500).json({sucess: false, msg: `Bot "${req.body.bot}" is not online`});
  }

  bot.sendOffer({
    type: 'withdraw',
    user: self,
    items: rake.items,
    code: '420',
    message: `Here's ${rake.items.length} item${rake.items.length == 1 ? '' : 's'} worth $${parseFloat(rake.amount).toFixed(2)}. Enjoy`
  }).then(id => {
    if(!rake.history) rake.history = [];

    rake.history = [{
      user: {steamid: self.get('steamid'), name: self.get('name'), avatar: self.get('avatar')},
      time: Math.floor(new Date().getTime() / 1000),
      items: [...rake.items],
      amount: rake.amount
    }, ...rake.history];

    rake.amount = 0;
    rake.items = [];
    rake.lastUpdate = Math.floor(new Date().getTime() / 1000);

    fs.writeFileSync(filename, JSON.stringify(rake, null, 2), 'utf8');

    return res.status(200).json({success: true, id});
  }).catch(e => {
    return res.status(500).json({sucess: false, msg: `Failed to send offer: ${e?.message || e}`});
  });
});



module.exports = router;