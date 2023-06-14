const express = require('express');
const fs = require('fs');
const router = express.Router();

const users = require('../interfaces/users');
const transactions = require('../interfaces/transactions');
const { generateId, isValidTradelink } = require('../helpers');
const userTokenMiddleware = require('../middlewares/user');
// const events = require('../interfaces/events');
const config = require('../config');

router.post('/self', async (req, res) => {
  res.status(200).json(req?.user?._json || {});
});

router.post('/applyBetaCode', async (req, res) => {
  const user = users.find(req?.user?._json?.steamid, 'steamid');

  const deny = reason => {
    return res.status(422).json({success: false, msg: reason});
  };

  if(!req?.user?._json || !user) {
    return deny('Not logged in');
  }

  if(!!user.get('betaAccess')) {
    return deny('You already have beta access!');
  }

  if(!req.body?.code || req.body?.code?.length > 16) {
    return deny('Invalid code (1)');
  }

  
  let codes = JSON.parse(fs.readFileSync(`./.cache/betaCodes.json`, 'utf8') || {});
  const code = codes.filter(x => x.code == req?.body?.code)[0];

  if(!code) {
    return deny('Invalid code (2)');
  }

  if((code?.usedBy || []).length > 0 && !code?.unlimited) {
    return deny('This code was used by someone else');
  }

  console.log(`[BETA_ACCESS] User "${user.get('name')}" (${user.get('steamid')}) just got access to the site using code "${code.code}"`);
  
  user.set('betaAccess', true);

  codes.forEach(c => {
    if(c.code == code.code) {
      if(!c.usedBy) c.usedBy = [];

      c.usedBy = [...c.usedBy, user.get('steamid')];
    }
  });

  if(!codes.map(x => x.owner).includes(user.get('steamid'))) {
    for(let i=0; i<2; i++) {
      codes = [...codes, {
        code: generateId(14),
        owner: user.get('steamid'),
        createdAt: Math.floor(new Date().getTime() / 1000)
      }];
    }
  }

  fs.writeFileSync(`./.cache/betaCodes.json`, JSON.stringify(codes, null, 2), 'utf8');

  res.status(200).json({success: true, msg: 'Welcome :D'});
});

router.post('/public/:id', userTokenMiddleware, async (req, res) => {
  const user = users.find(req.params.id, 'id');

  res.status(user ? 200 : 404).json({
    success: !!user,
    user: user ? (req.self ? (req.self.isAdmin() ? user.get() : user.getPublic()) : user.getPublic()) : undefined
  });
});

router.post('/data/:token', (req, res) => {
  // important todo!
  // check token on this request, if valid we have to create a new one
  // the old one is invalidated and new one is sent to the user to create
  // sort of a session system
  const user = users.find(req.params.token);

  // check ban status
  if(!!user) user.checkBanExpiration();

  const betaKeys = !!user ? (
    !!config.http.closedBeta ? (
      JSON.parse(fs.readFileSync(`./.cache/betaCodes.json`, 'utf8') || {}).filter(x => x.owner == user.get('steamid'))
    ) : undefined
  ) : undefined;

  res.status(user ? 200 : 401).json({
    success: !!user,
    msg: user ? undefined : 'Not signed in',
    user: user ? user.get() : undefined,
    betaKeys
  });
});

router.post('/stats', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});

  req.self.getStats().then(stats => {
    res.status(200).json({
      success: true,
      stats
    });
  }).catch(e => {
    res.status(500).json({success: false, msg: e.message || e});
  });
});

router.post('/loadSteamInventory/:appid', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});

  req.self.steam_getInventory(req.params.appid).then(inv => {
    res.status(200).json({
      success: true,
      inv
    });
  }).catch(e => {
    res.status(500).json({success: false, msg: e.message || e});
  });
});

router.post('/updateTradelink', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(!req.body) return res.status(422).json({success: false, msg: 'Invalid data'});
  if(Array.isArray(req.body)) return res.status(422).json({success: false, msg: 'Invalid data'});
  if(typeof req.body !== 'object') return res.status(422).json({success: false, msg: 'Invalid data'});

  const link = req.body.link || '';
  if(!isValidTradelink(link)) return res.status(422).json({success: false, msg: 'Invalid tradelink, please try again.'});

  req.self.set('tradelink', link);
  res.status(200).json({success: true});
});

// todo: requestTransaction ?
router.post('/requestDeposit/:appid', userTokenMiddleware, async (req, res) => {
  // todo: make better validation
  console.log('req.body', req.body);
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return res.status(422).json({success: false, msg: 'Invalid data (1)'});
  if(!Array.isArray(req.body?.items) || req.body?.items?.length == 0) return res.status(422).json({success: false, msg: 'Invalid data (2)'});
  // if(!req.body?.data) return res.status(422).json({success: false, msg: 'Invalid data (3)'});

  // if(typeof req.body !== 'object') return res.status(422).json({success: false, msg: 'Invalid data'});
  // if(!req.body.items) return res.status(422).json({success: false, msg: 'Invalid data'});
  // if(req.body.items.length == 0) return res.status(422).json({success: false, msg: 'Invalid data'});
  // if(!Array.isArray(req.body.items)) return res.status(422).json({success: false, msg: 'Invalid data'});
  transactions.new('deposit-steam', {
    items: req.body.items,
    appid: req.params.appid,
    extra_data: req.body?.data || {}
  }, req.self).then(data => {
    res.status(200).json({success: true, ...data});
  }).catch(e => {
    res.status(500).json({success: false, msg: e.message || e});
  });
});

router.post('/requestWithdraw/:appid', userTokenMiddleware, async (req, res) => {
  // todo: make better validation
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});
  if(!req.body) return res.status(422).json({success: false, msg: 'Invalid data'});
  if(Array.isArray(req.body)) return res.status(422).json({success: false, msg: 'Invalid data'});
  if(typeof req.body !== 'object') return res.status(422).json({success: false, msg: 'Invalid data'});
  if(!req.body.items) return res.status(422).json({success: false, msg: 'Invalid data'});
  if(req.body.items.length == 0) return res.status(422).json({success: false, msg: 'Invalid data'});
  if(!Array.isArray(req.body.items)) return res.status(422).json({success: false, msg: 'Invalid data'});

  transactions.new('withdraw-steam', {items: req.body.items, appid: req.params.appid}, req.self).then(data => {
    res.status(200).json({success: true, ...data});
  }).catch(e => {
    res.status(500).json({success: false, msg: e.message || e});
  });
});

router.post('/getTransactions', userTokenMiddleware, async (req, res) => {
  if(!req.self) return res.status(401).json({success: false, msg: 'Invalid user'});

  transactions.getByUserId(req.self.get('id')).then(data => {
    res.status(200).json({success: true, data});
  }).catch(e => {
    console.log(e);
    res.status(500).json({success: false, msg: e.message || e});
  });
});


module.exports = router;