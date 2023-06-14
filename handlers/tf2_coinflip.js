const sha256 = require('sha256');
const { manager } = require('../classes/IO_Manager')();
const events = require('../interfaces/events');
const users = require('../interfaces/users');
const database = require('../interfaces/database');
const transactions = require('../interfaces/transactions');
const randomorg = require('../interfaces/randomorg');
const config = require('../config');
const { now, sum, getWinnerItems } = require('../helpers');

console.log('[TF2_Coinflip] Starting service...');


/**
 * Constants and variables
*/
const MAX_DIFF = 0.1;
const TIME_TO_JOIN = 120;
const START_COUNTDOWN = 10;
const ANIM_TIME = 4; // how long to wait to announce winner (in seconds)
const TOTAL_TICKETS = 1000 * 100; // 100k

let games = [];
let connectedUsers = []; // todo: this sucks, make it better 
let tmts = {};

// load active games into memory
try {
  const load = async () => {
    games = await database.get('coinflip_games', {
      custom: (x, r) => x.filter(
        r.not( r.row("status").eq(3) )
      )
    });
  }

  load();
} catch(e) {}


/**
 * This will validate the process before sending an offer to not allow to join already started games
*/
const _validator = async ({ data, user, items, price }) => {
  const id = data?.extra_data?.cf_id;
  const game = games.filter(x => x.id == id)[0];

  if(typeof id == 'undefined' || typeof game == 'undefined') return;

  if(game.deleted) {
    throw `This game is about to be deleted. Please try a different one or create your own.`;
  }

  // check if game is active
  if(game.status !== 0 || game.player2) {
    throw `This game has already started! Please try a different one or create your own.`;
  }

  // dont allow join your own games
  if(game.player1?.steamid == user.get('steamid')) {
    throw `Can't join your own game.`;
  }

  // compare price
  const prices = [
    (1 - MAX_DIFF) * game?.player1?.total,
    (1 + MAX_DIFF) * game?.player1?.total
  ];

  if(price < prices[0] || price > prices[1]) {
    throw `Value of your items must be between $${parseFloat(prices[0]).toFixed(2)} and $${parseFloat(prices[1]).toFixed(2)}.`;
  }
}


/**
 * This will check if the player joined during the 120s window to accept the offer, if not we will reverse the game
*/
const checkIfPlayerJoined = async (id, forceCancel = false) => {
  const game = games.filter(x => x.id == id)[0];
  // todo: we should cancel the offer after it times out
  console.log('checkIfPlayerJoined', id);
  if(!game) return;

  // player done goofed, kick him out
  if(game?.status == 1 || forceCancel) {
    const gameData = {
      id: game?.id,
      player2: undefined,
      player2_items: undefined,
      player2_side: undefined,
      value: sum(game?.player1_items, 'price'),
      timeUpdated: Math.round(+new Date() / 1000),
      status: 0,
      TIME_TO_JOIN
    };

    games.forEach(g => {
      if(g.id !== game.id) return;

      Object.keys(gameData).forEach(k => {
        g[k] = gameData[k];
      });
    });
    


    // emit update
    manager.emit('tf2_coinflip:gameUpdated', gameData, connectedUsers);
    emitValue();

    // todo: make a better system for xp
    // user.updateXp(data?.extra_data?.price * 2, 'add');

    // save to database 
    // await database._('coinflip_games', {
    //   filter: {id: game?.id},
    //   custom: (x, r) => {
    //     return x.replace(r.row.without('player2'))
    //   }
    // }, gameData);
    await database.r.db(config.database.name).table('coinflip_games').replace(database.r.row.without('player2'));

    await database.update('coinflip_games', {
      filter: {id: game?.id}
    }, {
      value: gameData.value,
      timeUpdated: gameData.timeUpdated,
      status: gameData.status
    })
  }
}

/**
 * Choose winner
*/
const chooseWinner = async id => {
  const game = games.filter(x => x.id == id)[0];

  if(!game) return console.log(`[TF2_Coinflip] Critical error when choosing winner for game #${id}! Could not find the game`);

  const randomorgResult = await randomorg.getSignedString();
  const finalHash = sha256(`${game.serverHash}-${randomorgResult.result}`);
  const winTicket = parseInt(finalHash.substr(0, 8), 16) % TOTAL_TICKETS + 1; // winning ticket
  
  const allItems = [...game?.player1_items, ...game?.player2_items];
  const finalItems = getWinnerItems(allItems);

  const winner = winTicket >= game?.player1_tickets[0] && winTicket <= game?.player1_tickets[1] ? (
    game.player1
  ) : (
    game.player2 // is this really correct tho?
  );
  // console.log('winner', winner);
  // console.log('player1', game.player1);
  // console.log('player2', game.player2);

  const winnerNum = winner.steamid === game.player1.steamid ? 'p1' : 'p2';

  const gameData = {
    id: game?.id,
    timeUpdated: Math.round(+new Date() / 1000),
    status: 3,
    randomorgResult: randomorgResult,
    finalHash: finalHash,
    winnerNum: winnerNum,
    winTicket,
    winner: winner,
    player2: game.player2,
    player2_items: game.player2_items,
    value: game.value,
    itemsWin: finalItems.win,
    itemsCut: finalItems.cut,
    itemsWinAmount: finalItems.winAmount,
    itemsCutAmount: finalItems.cutAmount,
    winOfferStatus: 0, // 0 = not sent, 1 = sent, 2 = accepted, 3 = error
    winOfferStatusText: '',
    winOfferId: 0
  };

  games.forEach(g => {
    if(g.id !== game.id) return;

    Object.keys(gameData).forEach(k => {
      g[k] = gameData[k];
    });
  });


  // emit update
  events.emit('rake:new', {
    items: finalItems.cut,
    amount: finalItems.cutAmount,
    game: 'coinflip'
  });
  manager.emit('tf2_coinflip:gameUpdated', gameData, connectedUsers);
  emitValue();

  // save to database
  await database.update('coinflip_games', {filter: {id: game?.id}}, gameData);

  console.log(`[TF2_Coinflip] Player "${gameData?.winner?.name}" (${gameData?.winner?.steamid}) won a total of ${game?.player1_items.length + game?.player2_items.length} items worth $${parseFloat(game?.value || 0).toFixed(2)} in game #${game?.aid}`);

  // todo: delete from games[] array
  // todo: send winning offer and calculate tax
  // send items
  clearTimeout(tmts[game?.id]);
  tmts[game?.id] = setTimeout(() => {
    sendWinOffer(gameData?.winner?.steamid, finalItems.win, game?.id);
  }, ANIM_TIME * 1000);

  
}

const sendWinOfferCallback = async ({ err, offerId, roundId }) => {
  if(err) console.log(`sendWinOfferCallback for #${roundId} failed`, err);

  await database.update('coinflip_games', {filter: {id: roundId}}, {
    winOfferStatus: err ? 3 : 1,
    winOfferStatusText: err ? err : `Offer sent successfully, trade offer id is #${offerId}`
  });
}

const sendWinOffer = async (steamid, items, roundId) => {
  console.log('sendWinOffer to ' + steamid, items);
  console.log(roundId);
    // request transactions
    transactions.new('winnings-steam', {
      items: items,
      appid: config.steam.defaultAppId,
      extra_data: {why: `coinflip-win`, roundId: roundId},
      callback: ({ err, offerId }) => sendWinOfferCallback({ err, offerId, roundId })
    }, users.find(steamid, 'steamid')).then(async data => {
      await database.update('coinflip_games', {filter: {id: roundId}}, {
        winOfferStatus: 1, 
        winOfferStatusText: 'Offer has been sent. Security code is ' + data.code,
        winOfferId: data.id
      });
    }).catch(async e => {
      await database.update('coinflip_games', {filter: {id: roundId}}, {
        winOfferStatus: 3,
        winOfferStatusText: e.message || e,
      });
    });

    // initRound(true);
    // real anim length is 6000 + 1000 + 600 (7600)
  /*manager.emit('tf2_jackpot:winner', {
    winner: state.winner,
    random: state.randomOffset
  }, connectedUsers);*/
}

/**
 * Decide what action to take with the new deposit
*/
const newDeposit = async ({ user, data, socket }) => {
  if(data?.extra_data?.game !== 'coinflip') return;

  if(data?.extra_data?.cf_id) {
    return newDepositJoin({ id: data?.extra_data?.cf_id, user, data, socket });
  }
  
  return newDepositCreate({ user, data, socket });
}




const newDepositCreate = async({ user, data, socket }) => {
  // add more detail to user data
  const userData = {
    ...user.getPublic(),
    steamid: user.get('steamid'),
    total: data?.extra_data?.price,
  };
  // const items = data?.extra_data?.items.map(item => {
  //   item.owner = {name: userData.name, avatar: userData.avatar, price: item.price, id: userData.id};

  //   return item;
  // });

  // auto increment id
  const total = await database.get('coinflip_games', {count: true});
  const serverHash = sha256(`${+new Date()}-${data?.extra_data?.items?.length}-${userData?.steamid}-${userData?.id}-${JSON.stringify(data?.extra_data)}`);

  console.log('newDepositCreate', userData, user.get('steamid'))
  const gameData = {
    player1: userData,
    player1_items: data?.extra_data?.items || [],
    player1_side: [1,2].includes(data?.extra_data?.cf_side) ? data?.extra_data?.cf_side : 1,
    // todo: add player ticket
    value: sum(data?.extra_data?.items, 'price'),
    id: sha256(`${+new Date()}-${userData?.steamid}`), // todo: make this better
    timeCreated: Math.round(+new Date() / 1000),
    timeUpdated: Math.round(+new Date() / 1000),
    serverHash: serverHash,
    publicServerHash: sha256(serverHash),
    status: 0,
    maxDiff: MAX_DIFF,
    aid: total + 1
  };

  games.push(gameData);


  // emit update
  manager.emit('tf2_coinflip:newGame', {
    ...gameData,
    serverHash: undefined
  }, connectedUsers);
  emitValue();

  // todo: make a better system for xp
  user.updateXp(data?.extra_data?.price * 2, 'add');

  // save to database
  await database.insert('coinflip_games', gameData);

  console.log(`[TF2_Coinflip] Player "${user.get('name')}" (${user.get('steamid')}) just created a new game worth $${parseFloat(data?.extra_data?.price).toFixed(2)} containing ${data?.data?.items?.length || 0} items (TX ID: ${data.num_id})`);
}

const newDepositJoin = async({ user, data, socket, id }) => {
  // add more detail to user data
  const userData = {
    ...user.getPublic(),
    steamid: user.get('steamid'),
    total: data?.extra_data?.price,
  };
  // const items = data?.extra_data?.items.map(item => {
  //   item.owner = {name: userData.name, avatar: userData.avatar, price: item.price, id: userData.id};

  //   return item;
  // });

  // auto increment id
  const game = await database.get('coinflip_games', {filter: {id}, returnFirstObject: true});

  // game was not found, abandon the joining process
  if(!game) {
    console.log(`[TF2_Coinflip] Player "${user.get('name')}" (${user.get('steamid')}) tried to join a non-existing game with id ${id.toString()}, we will create a new game instead`);
    
    return newDepositCreate({ user, data, socket });
  }

  
  const myValue = sum(data?.extra_data?.items, 'price');
  const totalValue = game?.value + myValue;
  const p1_tickets = [
    1, // min
    Math.floor( (game?.value / totalValue) * TOTAL_TICKETS ) // max
  ];
  const p2_tickets = [
    p1_tickets[1] + 1, // min
    TOTAL_TICKETS // max
  ];

  const gameData = {
    id: game?.id,
    player2: userData,
    player2_items: data?.extra_data?.items || [],
    player2_side: game?.player1_side == 1 ? 2 : 1,
    player1_tickets: p1_tickets,
    player2_tickets: p2_tickets,
    value: totalValue,
    timeUpdated: Math.round(+new Date() / 1000),
    TIME_TO_JOIN: START_COUNTDOWN,
    status: 2,
  };

  games.forEach(g => {
    if(g.id !== game.id) return;

    Object.keys(gameData).forEach(k => {
      g[k] = gameData[k];
    });
  });


  // emit update
  manager.emit('tf2_coinflip:gameUpdated', gameData, connectedUsers);
  emitValue();

  // todo: make a better system for xp
  user.updateXp(data?.extra_data?.price * 2, 'add');

  // save to database
  await database.update('coinflip_games', {filter: {id: game?.id}}, gameData);

  console.log(`[TF2_Coinflip] Player "${user.get('name')}" (${user.get('steamid')}) just joined game #${game?.aid} with ${data?.data?.items?.length || 0} items worth $${parseFloat(data?.extra_data?.price).toFixed(2)} (TX ID: ${data.num_id})`);

  // todo: figure out winner
  clearTimeout(tmts[game?.id]);
  tmts[game?.id] = setTimeout(() => chooseWinner(game?.id), START_COUNTDOWN * 1000);
}

const newDepositFailed = async({ user, data }) => {
  const id = data?.extra_data?.cf_id;
  if(data?.extra_data?.game !== 'coinflip' || !id) return;

  checkIfPlayerJoined(id, true);
}

// player started the deposit process but didnt accept the offer yet, we give him 120s to do so
const newDepositStarted = async({ user, data, socket, tx_id }) => {
  const id = data?.extra_data?.cf_id;

  if(data?.extra_data?.game !== 'coinflip' || !id) return;
  console.log('newDepositStarted', data);

  // listen for cancels / errors
  console.log(`LISTENING TO transactions:${tx_id}-status`);
  events.on(`transactions:${tx_id}-status`, ({ status }) => {
    console.log(`tf2_coinflip registered a status change in tx ${tx_id} to ${status}`);
    if(status === 3) {
      checkIfPlayerJoined(game?.id, true);
    }
  });


  // add more detail to user data
  const userData = {
    ...user.getPublic(),
    total: data?.price,
  };

  // auto increment id
  const game = await database.get('coinflip_games', {filter: {id}, returnFirstObject: true});
  if(!game) return;

  const gameData = {
    id: game?.id,
    player2: userData,
    player2_items: data?.items || [],
    player2_side: game?.player1_side == 1 ? 2 : 1,
    value: game?.value + sum(data?.items, 'price'),
    // todo: add player ticket
    timeUpdated: Math.round(+new Date() / 1000),
    status: 1,
    TIME_TO_JOIN
  };

  games.forEach(g => {
    if(g.id !== game.id) return;

    Object.keys(gameData).forEach(k => {
      g[k] = gameData[k];
    });
  });


  // emit update
  manager.emit('tf2_coinflip:gameUpdated', gameData, connectedUsers);
  emitValue();

  // todo: make a better system for xp
  // user.updateXp(data?.extra_data?.price * 2, 'add');

  // save to database
  await database.update('coinflip_games', {filter: {id: game?.id}}, gameData);

  clearTimeout(tmts[game?.id]);
  tmts[game?.id] = setTimeout(() => checkIfPlayerJoined(game?.id), TIME_TO_JOIN * 1000);

  // events.emit(`transactions:${id}-status`, {status, extra_data, id});

  // console.log(`[TF2_Coinflip] Player "${user.get('name')}" (${user.get('steamid')}) just joined game #${game?.aid} with ${data?.data?.items?.length || 0} items worth $${parseFloat(data?.extra_data?.price).toFixed(2)} (TX ID: ${data.num_id})`);

}


const cancelGameCallback = async ({ err, id, offerId }) => {
  console.log(`callback`, { err, id, offerId });
  const game = games.filter(x => x.id == id)[0];
  if(!game) return console.log('callback no game');

  const user = users.find(game?.player1?.steamid, 'steamid');
  if(!user) return console.log('callback no user');

  manager.emit('tf2_coinflip:cancelGameCallback', {err, id, offerId}, user.getSids());

  if(!err) {
    games = games.filter(x => x.id !== id);
    await database.remove('coinflip_games', {filter: {id: id}});

    console.log(`[TF2_Coinflip] User "${user.get('name')}" (${user.get('steamid')}) has been refunded ${game.player1_items.length} items for game #${id}`);
  }
}

const cancelGame = ({ data, socket } = {}) => {
  if(!data || !socket || typeof data !== 'object' || Array.isArray(data)) return;

  const user = users.find(data?.token, 'token');
  const game = games.filter(x => x.id == data?.id)[0];
  const userGameOwner = users.find(game?.player1?.steamid, 'steamid');
  const now = Math.round(+new Date() / 1000);

  if(!user || !game) return console.log('no user or no game');
  if(game.status !== 0) return console.log('game status is not 0');
  if(game.player1?.steamid !== user.get('steamid') && parseInt(user?.get('rank')) < 2) return console.log('not authorized');
  if(now - game?.timeCreated < 10 * (60 * 1000)) return manager.emit('tf2_coinflip:cancelGameCallback', {err: 'Only games created more than 10 minutes ago can be deleted.'}, user.getSids());
  if(!userGameOwner) return console.log('userGameOwner not found', game?.player1?.steamid);

  games.forEach(g => {
    if(g.id !== data?.id) return;

    g.deleted = true;
  });

  // todo: remove xp
  // todo: only allow games older than 10 mins to be deleted
  transactions.new('refund-steam', {
    items: game.player1_items,
    appid: config.steam.defaultAppId,
    extra_data: {why: `coinflip-refund`, roundId: data?.id},
    callback: cancelGameCallback
  }, userGameOwner).catch(async e => {
    console.log(`[TF2_Coinflip] Failed to request refund to "${user.get('name')}" (${user.get('steamid')}) for game #${data?.id}`, e);
  });
}

















events.on('steam:deposit-complete', newDeposit);
events.on('steam:deposit-started', newDepositStarted);
events.on('steam:deposit-failed', newDepositFailed);


// todo: this is retarded, think of a better solution (socket.io rooms?)
// maybe catch all joinSession events (tf2_coinflip, roulette etc) in one place
// and put them into a global variable like connectedSockets['roulette']
events.on('socket:tf2_coinflip:joinSession', ({ data, socket }) => {
  connectedUsers.push(socket.id);

  emitValue(socket.id);
});

events.on('socket:tf2_coinflip:getValue', ({ data, socket }) => emitValue(socket.id));
events.on('socket:tf2_coinflip:leave', ({ data, socket }) => {
  connectedUsers = connectedUsers.filter(x => x !== socket.id);
});
events.on('socket:tf2_coinflip:cancelGame', cancelGame);

const emitValue = sid => {
  manager.emit('tf2_coinflip:value', sum(games.filter(x => x.status == 0), 'value'), sid);
}









// debug ofc
const debug = 0;
const CF_ID_ = '2222';
const TEST_DATA = [{"code":"5rcQEL","data":{"appid":"440","items":[{"amount":1,"assetid":"11799455959"},{"amount":1,"assetid":"11955135786"},{"amount":1,"assetid":"12181252099"},{"amount":1,"assetid":"10034854916"},{"amount":1,"assetid":"12170061536"},{"amount":1,"assetid":"12170061242"}]},"extra_data":{"game": "coinflip", "cf_id": CF_ID_, "error_reason":"No online bots to process your request right now. Please try again later.","items":[{"amount":1,"appid":"440","assetid":"11799455959","classid":"237182231","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEGegouTxTgsSxQt5i1Mv6NGucF1dkw5pJQ2248kFAqMraxMzE-c1HBUKNbDqBioA64DH9kv5JgVtbmor5IOVK4z5i9Hes","name":"Reinforced Robot Emotion Detector","price":0.03},{"amount":1,"appid":"440","assetid":"10034854916","classid":"3051917503","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEDbQsdUgznvTYR2Jm-MvGNG-U_l9sn4pUbim88kgAtY-XnNWdiJFKTAqUIWaFsoVC7DH4xvsQ6BtW0ou1VLQi5vZyGbedz97Kp4g","name":"Violet Vermin Case","price":0.24},{"amount":1,"appid":"440","assetid":"11955135786","classid":"237182229","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEGegouTxTgsSxQt5i-Mv6NGucF1YxmtZYCizNvxgd_NbWwZjZhcVWSA_AOWPRtrFC7UCVj6Z4zANG3r-tIOVK4uvXQm80","name":"Battle-Worn Robot Money Furnace","price":0.04},{"amount":1,"appid":"440","assetid":"12170061536","classid":"101785959","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEAaR4uURrwvz0N252yVaDVWrRTno9m4ccG2GNqxlQoZrC2aG9hcVGUWflbX_drrVu5UGki5sAij6tOtQ","name":"Mann Co. Supply Crate Key","price":2.14},{"amount":1,"appid":"440","assetid":"12181252099","classid":"4585824989","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEDewlDDUmzhztMhdjzGeCDBt8Mmsgy4N5QgDAyk1ErZeezZDUxIFWRUKEOD6VirVq0WiMxupUwUISypr0HcATsqsKYZGT-UoFl","name":"Computron 5000","price":0.14}],"price":4.7299999999999995},"id":"9efbf264-2240-40c4-80bc-8b4f3a71dd2d","last_updated":1665951716,"num_id":"772866","status":3,"time_created":1665951716,"type":"deposit-steam","user":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751","value":0}];

if(debug == 1) {
  setTimeout(() => {
    // events.emit('steam:deposit-started', {user: users.find('hxtnv.', 'name'), id: CF_ID_, tx_id: 0, data: {"items":[{"amount":1,"appid":"440","assetid":"12301962282","classid":"101785959","contextid":"2","name":"Mann Co. Supply Crate Key","price":2.14,"image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEAaR4uURrwvz0N252yVaDVWrRTno9m4ccG2GNqxlQoZrC2aG9hcVGUWflbX_drrVu5UGki5sAij6tOtQ"},{"amount":1,"appid":"440","assetid":"12301962015","classid":"101785959","contextid":"2","name":"Mann Co. Supply Crate Key","price":2.14,"image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEAaR4uURrwvz0N252yVaDVWrRTno9m4ccG2GNqxlQoZrC2aG9hcVGUWflbX_drrVu5UGki5sAij6tOtQ"}],"appid":"440","extra_data":{"game":"coinflip","cf_id":"ba9ff313afe90ea582d254827c18e57871fb97506fe895b39b15b36ab2204e0d"},"price":4.28} })
    events.emit('steam:deposit-complete', {user: users.find('hxtnv.', 'name'), data: {...TEST_DATA[0]} });
  }, 6 * 1000);

  // setTimeout(() => {
  //   events.emit('steam:deposit-failed', {user: users.find('hxtnv.', 'name'), data: {...TEST_DATA[0]} });
  // }, 10 * 1000);
}

module.exports = {
  TF2_CoinflipValidator: _validator
}