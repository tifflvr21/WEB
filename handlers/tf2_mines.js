const sha256 = require('sha256');
const { manager } = require('../classes/IO_Manager')();
const events = require('../interfaces/events');
const users = require('../interfaces/users');
const database = require('../interfaces/database');
const transactions = require('../interfaces/transactions');
const randomorg = require('../interfaces/randomorg');
const config = require('../config');
const { now, sum, getWinnerItems } = require('../helpers');

console.log('[TF2_Mines] Starting service...');


/**
 * Constants and variables
*/
const PLAYER_STATUS = {
  0: 'Alive',
  1: 'Dead',
  2: 'Winner',
  3: 'Waiting' // this should be index 0 but im too lazy to change it now
};

const GAME_STATUS = {
  0: 'Waiting for players',
  1: 'Waiting for more players',
  2: 'Generating mines',
  3: 'In progress',
  4: 'Game over'
};

const MAX_DIFF = 0.1;
const TIME_TO_JOIN = 120; // time to accept offer
const WAIT_FOR_MORE_PLAYERS = 10; // after 1st player joins
const START_COUNTDOWN = 10; // generating mines
const TIME_TO_MAKE_MOVE = 3;
const MAX_PLAYERS = 4;

let games = [];
let connectedUsers = []; // todo: this sucks, make it better 
let tmts = {};

// load active games into memory
try {
  const load = async () => {
    games = await database.get('mines_games', {
      custom: (x, r) => x.filter(
        r.not( r.row("status").eq(4) )
      )
    });
  }

  // todo: for active games we should start the turnsystem

  load();
} catch(e) {}


/**
 * This will validate the process before sending an offer to not allow to join already started games
*/
const _validator = async ({ data, user, items, price }) => {
  // check status, check if in progress, check if ur not already in the game
  const id = data?.extra_data?.mines_id;
  const game = games.filter(x => x.id == id)[0];

  if(typeof id == 'undefined' || typeof game == 'undefined') return;

  // check if game is active
  if(![0,1].includes(game.status) || game.players.length >= MAX_PLAYERS) {
    throw `This game has already started! Please try a different one or create your own.`;
  }

  // dont allow to join game twice
  if(game.players.map(x => x.steamid).includes(user.get('steamid'))) {
    throw `You are already in this game.`;
  }

  // compare price
  const prices = [
    (1 - MAX_DIFF) * game?.players[0]?.total,
    (1 + MAX_DIFF) * game?.players[0]?.total
  ];

  if(price < prices[0] || price > prices[1]) {
    throw `Value of your items must be between $${parseFloat(prices[0]).toFixed(2)} and $${parseFloat(prices[1]).toFixed(2)}.`;
  }
}

const _updateGame = async (id, data) => {
  const gameData = {...data, id};

  games.forEach(g => {
    if(g.id !== id) return;

    Object.keys(gameData).forEach(k => {
      g[k] = gameData[k];
    });
  });

  const _game = games.filter(x => x.id)[0];


  // emit update
  // todo: dont emit `mines` and `serverHash` if game is in progress
  manager.emit('tf2_mines:gameUpdated', {
    ...gameData,
    mines: gameData.status !== 4 ? undefined : _game?.mines,
    minesRaw: gameData.status !== 4 ? undefined : _game?.minesRaw,
    minesPublic: gameData.status !== 4 ? _game?.minesPublic : _game?.mines,
    serverHash: gameData.status !== 4 ? undefined : _game?.serverHash,
    randomorgResult: gameData.status !== 4 ? undefined : _game?.randomorgResult
  }, connectedUsers);
  emitValue();

  // save to database
  await database.update('mines_games', {filter: {id}}, gameData);
}

const _getUser = (user, data, extra = {}) => {
  const totalValue = sum(data?.extra_data?.items || data?.items || data?.data?.items || [], 'price') || data?.extra_data?.price;
  const userData = {
    ...user.getPublic(),
    steamid: user.get('steamid'),
    total: totalValue,
    items: data?.extra_data?.items || [],
    ...extra
  };

  return {
    totalValue,
    userData
  };
}


/**
 * This will check if the player joined during the 120s window to accept the offer, if not we will reverse the game
*/
const checkIfPlayerJoined = async ({ id, steamid }, forceCancel = false) => {
  const game = games.filter(x => x.id == id)[0];
  // todo: we should cancel the offer after it times out
  console.log('checkIfPlayerJoined', id);
  if(!game) return;

  const _player = game.players.filter(x => x.steamid == steamid)[0];

  if(!_player) return;

  // player done goofed, kick him out
  if(_player.status === 3 || forceCancel) {
    await _updateGame(game?.id, {
      players: [...game.players.filter(x => x.steamid !== steamid)],
      value: sum(game?.players, 'total'),
      timeUpdated: Math.round(+new Date() / 1000),
      // status: 0,
      // TIME_TO_JOIN
    });
  }
}



const startTurns = async (id, _turnCount = 0) => {
  console.log('startTurns (1)', id);
  const _ = async () => {
    console.log('startTurns (2)', id);
    const game = games.filter(x => x.id == id)[0];
    if(!game) return console.log(`[TF2_Mines] Critical error when moving turns for game #${id}! Could not find the game`);
    // console.log(`game.turnCount: ${game.turnCount}, _turnCount: ${_turnCount} (${game.turnCount !== _turnCount})`);
    // if the turn is different, do nothing
    if(game.turnCount !== _turnCount) return;

    // todo: call pickBomb
    const user = users.find( game?.players[game?.turn]?.steamid , 'steamid');
    if(user) {
      pickBomb({
        gameId: game?.id,
        action: 'pickMine',
        mine: game?.minesPublic.indexOf(-1),
        token: user.get('token')
      });
    } else {
      console.log(`!!! failed to auto pickBomb! user not found`, game?.players[game?.turn]?.steamid);
    }
    // if we get here this means the user didnt take any action
    // const MAX_TURN = game.players.length - 1;

    // game.turnCount = _turnCount + 1;
    // game.turn = game.turn + 1 > MAX_TURN ? 0 : game.turn + 1;
    // game.players[game.turn].timeUpdated = Math.round(+new Date() / 1000);
    // game.players[game.turn].TIME_TO_JOIN = TIME_TO_MAKE_MOVE;

    // await _updateGame(game?.id, {
    //   timeUpdated: Math.round(+new Date() / 1000),
    //   TIME_TO_JOIN: TIME_TO_MAKE_MOVE,
    //   status: 3, // in progress
    //   turn: game.turn,
    //   players: game.players
    // });

    // startTurns(game?.id, game.turnCount);
  }

  clearTimeout(tmts[id]);
  tmts[id] = setTimeout(_, TIME_TO_MAKE_MOVE * 1000);
}

const pickBomb = async (data) => {
  console.log(data?.token + ' picked mine', data);
  // validate user & game first
  if(!data || typeof data !== 'object' || Array.isArray(data)) return console.log('validation failed (1)');
  if(!data?.token || !data?.gameId || typeof data?.mine == 'undefined') return console.log('validation failed (2)');
  if(isNaN(data?.mine) || data?.mine < 0 || data?.mine > 35) return console.log('validation failed (4)');

  const user = users.find(data?.token);
  const game = games.filter(g => g.id == data?.gameId)[0];

  if(!user || !game) return console.log('validation failed (3)');
  if( game.status !== 3 || !game.players.map(x => x.steamid).includes(user.get('steamid')) ) return console.log('validation failed (5)');
  if( game.minesPublic[data?.mine] !== -1 ) return console.log('validation failed (6)');
  if( game.players.filter(x => x.steamid == user.get('steamid'))[0].status !== 0 ) return console.log('validation failed (7)');

  // all good
  clearTimeout(tmts[data?.gameId]);
  const mineResult = game.mines[data?.mine]; // 0 or 1

  // player found a bomb
  let allItems = [];
  let finalItems = [];

  if(mineResult == 1) {
    console.log('found a bomb');
    game.players.forEach(p => {
      if(p.steamid == user.get('steamid')) p.status = 1; // dead
    });

    // todo: reveal all bombs
    // check if the game is over
    const playersLeft = game.players.filter(p => p.status == 0);
    if(playersLeft.length <= 1) {
      game.players.forEach(p => {
        if(p.steamid == playersLeft[0].steamid) {
          p.status = 2; // winner
          game.winner = {...p};
        }
      });
      
      // winner 
      allItems = [];
      game.players.forEach(xxx => {
        allItems = [...allItems, ...xxx.items];
      });
      finalItems = getWinnerItems(allItems);
        
      console.log(`[TF2_Mines] Player "${game.winner?.name}" (${game.winner?.steamid}) won a total of ${allItems.length} items worth $${parseFloat(game?.value || 0).toFixed(2)} in game #${data?.gameId}`);

      // todo: delete from games[] array
      // todo: send winning offer and calculate tax
      // send items
      clearTimeout(tmts[game?.id]);
      sendWinOffer(game?.winner?.steamid, finalItems.win, game?.id);
    }
  }

  game.minesPublic[data?.mine] = mineResult;

  // console.log(game, "\n\n\n\n\n\n");

  // all good, next turn
  if(!game.winner) {
    const MAX_TURN = game.players.length - 1;

    // game.turnCount = _turnCount + 1;
    game.turnCount += 1;
    game.turn = game.turn + 1 > MAX_TURN ? 0 : game.turn + 1;
    game.players[game.turn].timeUpdated = Math.round(+new Date() / 1000);
    game.players[game.turn].TIME_TO_JOIN = TIME_TO_MAKE_MOVE;
  }

  // update
  const addOnlyIfWinner = game.winner ? {
    itemsWin: finalItems.win,
    itemsCut: finalItems.cut,
    itemsWinAmount: finalItems.winAmount,
    itemsCutAmount: finalItems.cutAmount,
    winOfferStatus: 0, // 0 = not sent, 1 = sent, 2 = accepted, 3 = error
    winOfferStatusText: '',
    winOfferId: 0
  } : {};

  events.emit('rake:new', {
    items: finalItems.cut,
    amount: finalItems.cutAmount,
    game: 'mines'
  });

  await _updateGame(game?.id, {
    timeUpdated: Math.round(+new Date() / 1000),
    TIME_TO_JOIN: TIME_TO_MAKE_MOVE,
    status: game.winner ? 4 : 3, // in progress
    turn: game.turn,
    players: game.players,
    turnCount: game.turnCount,
    winner: game.winner,
    minesPublic: game.minesPublic,
    ...addOnlyIfWinner
  });

  if(!game.winner) {
    startTurns(game?.id, game.turnCount);
  }
  
  // if < 0 || > 35
  // if turn
  // if status
  // check if player is in that game
  // increase turnCount
  // cancel timeouts after game is finished
}

/**
 * Generate mines
*/
const generateMines = async id => {
  const game = games.filter(x => x.id == id)[0];

  if(!game) return console.log(`[TF2_Mines] Critical error when generating mines for game #${id}! Could not find the game`);

  await _updateGame(game?.id, {
    timeUpdated: Math.round(+new Date() / 1000),
    TIME_TO_JOIN: START_COUNTDOWN,
    status: 2, // generating mines
  });

  const randomorgResult = await randomorg.getSignedString();
  const finalHash = sha256(`${game.serverHash}-${randomorgResult.result}`);

  // start provably fair code
  const TILES = 36;
  const BOMBS = 6; 
  let generatedMines = []; // [ 8, 28, 10, 5, 6, 27 ]

  for(let i=0; i<1000; i++) {
    const mineHash = sha256(finalHash + '-' + i);
    const res = parseInt(mineHash.substr(0, 8), 16) % TILES;

    if(!generatedMines.includes(res)) {
      generatedMines.push(res);
    }

    if(generatedMines.length >= BOMBS) break;
  }
  // end provably fair code

  // generate array of 0s and 1s
  const finalMap = [...Array(TILES)].map((x, key) => generatedMines.includes(key) ? 1 : 0);


  // start game and update db with info
  clearTimeout(tmts[game?.id]);
  tmts[game?.id] = setTimeout(async () => {
    const TURN = 0;
    
    game.players[TURN].timeUpdated = Math.round(+new Date() / 1000);
    game.players[TURN].TIME_TO_JOIN = TIME_TO_MAKE_MOVE;

    await _updateGame(game?.id, {
      timeUpdated: Math.round(+new Date() / 1000),
      TIME_TO_JOIN: TIME_TO_MAKE_MOVE,
      status: 3, // in progress
      turn: TURN,
      turnCount: 0,
      mines: finalMap,
      players: game?.players,
      minesRaw: generatedMines
    });

    startTurns(game?.id, 0);
  }, START_COUNTDOWN * 1000);
}

const sendWinOfferCallback = async ({ err, offerId }) => {
  await database.update('mines_games', {filter: {id: roundId}}, {
    winOfferStatus: 1,
    winOfferStatusText: err ? err : `Offer sent successfully, trade offer id is #${offerId}`
  });
}

const sendWinOffer = async (steamid, items, roundId) => {
  console.log('sendWinOffer to ' + steamid, items);
  console.log(roundId);
    // request transactions
    transactions.new('winnings-steam', {
      items: items,
      appid: 440,
      extra_data: {why: `mines-win`, roundId: roundId},
      callback: sendWinOfferCallback
    }, users.find(steamid, 'steamid')).then(async data => {
      await database.update('mines_games', {filter: {id: roundId}}, {
        winOfferStatus: 1, 
        winOfferStatusText: 'Offer has been sent. Security code is ' + data.code,
        winOfferId: data.id
      });
    }).catch(async e => {
      await database.update('mines_games', {filter: {id: roundId}}, {
        winOfferStatus: 3,
        winOfferStatusText: e.message || e,
      });
    });
}

/**
 * Decide what action to take with the new deposit
*/
const newDeposit = async ({ user, data, socket }) => {
  if(data?.extra_data?.game !== 'mines') return;

  if(data?.extra_data?.mines_id) {
    return newDepositJoin({ id: data?.extra_data?.mines_id, user, data, socket });
  }
  
  return newDepositCreate({ user, data, socket });
}




const newDepositCreate = async({ user, data, socket }) => {
  const { totalValue, userData } = _getUser(user, data, {status: 0});
  // const items = data?.extra_data?.items.map(item => {
  //   item.owner = {name: userData.name, avatar: userData.avatar, price: item.price, id: userData.id};

  //   return item;
  // });

  // auto increment id
  const total = await database.get('mines_games', {count: true});
  const serverHash = sha256(`${+new Date()}-${data?.extra_data?.items?.length}-${userData?.steamid}-${userData?.id}-${JSON.stringify(data?.extra_data)}`);

  const gameData = {
    players: [userData],
    value: totalValue,
    id: sha256(`${+new Date()}-${userData?.steamid}`), // todo: make this better
    timeCreated: Math.round(+new Date() / 1000),
    timeUpdated: Math.round(+new Date() / 1000),
    serverHash: serverHash,
    publicServerHash: sha256(serverHash),
    status: 0,
    maxDiff: MAX_DIFF,
    aid: total + 1,
    mines: [],
    minesPublic: [...Array(36)].map(x => -1),
  };

  games.push(gameData);


  // emit update
  manager.emit('tf2_mines:newGame', {
    ...gameData,
    serverHash: undefined
  }, connectedUsers);
  emitValue();

  // todo: make a better system for xp
  user.updateXp(data?.extra_data?.price * 2, 'add');

  // save to database
  await database.insert('mines_games', gameData);

  console.log(`[TF2_Mines] Player "${user.get('name')}" (${user.get('steamid')}) just created a new game worth $${parseFloat(data?.extra_data?.price).toFixed(2)} containing ${data?.data?.items?.length || 0} items (TX ID: ${data.num_id})`);
}

const newDepositJoin = async({ user, data, socket, id }) => {
  const { totalValue, userData } = _getUser(user, data, {status: 0});
  
  // big todo: if a game is already started, we cant let a player join, make them start a new game instead

  const game = await database.get('mines_games', {filter: {id}, returnFirstObject: true});

  // game was not found, abandon the joining process
  if(!game) {
    console.log(`[TF2_Mines] Player "${user.get('name')}" (${user.get('steamid')}) tried to join a non-existing game with id ${id.toString()}, we will create a new game instead`);
    
    return newDepositCreate({ user, data, socket });
  }
  
  // update
  await _updateGame(game?.id, {
    value: game?.value + totalValue,
    timeUpdated: Math.round(+new Date() / 1000),
    TIME_TO_JOIN: WAIT_FOR_MORE_PLAYERS,
    status: 1, // waiting for more players
    players: [...game.players.filter(x => x.steamid !== userData.steamid), userData]
  });

  // todo: make a better system for xp
  user.updateXp(totalValue * 2, 'add');

  console.log(`[TF2_Mines] Player "${user.get('name')}" (${user.get('steamid')}) just joined game #${game?.aid} with ${data?.data?.items?.length || 0} items worth $${parseFloat(data?.extra_data?.price).toFixed(2)} (TX ID: ${data.num_id})`);

  // switch to generating mines after 60s
  clearTimeout(tmts[game?.id]);
  tmts[game?.id] = setTimeout(() => generateMines(game?.id), WAIT_FOR_MORE_PLAYERS * 1000);
}

const newDepositFailed = async({ user, data }) => {
  const id = data?.extra_data?.mines_id;
  if(data?.extra_data?.game !== 'mines' || !id) return;

  checkIfPlayerJoined({ id, steamid: user.get('steamid') }, true);
}

// player started the deposit process but didnt accept the offer yet, we give him 120s to do so
const newDepositStarted = async({ user, data, socket, tx_id }) => {
  const id = data?.extra_data?.mines_id;

  if(data?.extra_data?.game !== 'mines' || !id) return;
  console.log('newDepositStarted', data);

  // listen for cancels / errors
  console.log(`LISTENING TO transactions:${tx_id}-status`);
  events.on(`transactions:${tx_id}-status`, ({ status }) => {
    console.log(`tf2_mines registered a status change in tx ${tx_id} to ${status}`);
    if(status === 3) {
      checkIfPlayerJoined({ id: game?.id, steamid: user.get('steamid') }, true);
    }
  });


  // add more detail to user data
  const { totalValue, userData } = _getUser(user, data, {
    status: 3, // 0 = alive, 1 = dead, 2 = winner, 3 = waiting
    timeUpdated: Math.round(+new Date() / 1000),
    TIME_TO_JOIN: TIME_TO_JOIN
  });

  const game = await database.get('mines_games', {filter: {id}, returnFirstObject: true});
  if(!game) return console.log('mines (1) game not found', id);

  await _updateGame(game?.id, {
    value: game?.value + totalValue,
    timeUpdated: Math.round(+new Date() / 1000),
    status: 0, // waiting for players
    players: [...game.players.filter(x => x.steamid !== userData.steamid), userData]
  });

  clearTimeout(tmts[game?.id]);
  tmts[game?.id] = setTimeout(() => checkIfPlayerJoined({ id: game?.id, steamid: userData.steamid }), TIME_TO_JOIN * 1000);
}










const cancelGameCallback = async ({ err, id, offerId }) => {
  console.log(`callback`, { err, id, offerId });
  const game = games.filter(x => x.id == id)[0];
  if(!game) return console.log('callback no game');

  const user = users.find(game.players?.[0]?.steamid, 'steamid');
  if(!user) return console.log('callback no user');

  manager.emit('tf2_mines:cancelGameCallback', {err, id, offerId}, user.getSids());

  if(!err) {
    games = games.filter(x => x.id !== id);
    await database.remove('coinflip_games', {filter: {id: id}});

    console.log(`[TF2_Mines] User "${user.get('name')}" (${user.get('steamid')}) has been refunded ${game.players?.[0]?.items.length} items for game #${id}`);
  }
}

const cancelGame = ({ data, socket } = {}) => {
  if(!data || !socket || typeof data !== 'object' || Array.isArray(data)) return;

  const user = users.find(data?.token, 'token');
  const game = games.filter(x => x.id == data?.id)[0];
  const userGameOwner = users.find(game.players?.[0]?.steamid, 'steamid');
  const now = Math.round(+new Date() / 1000);

  if(!user || !game) return console.log('no user or no game');
  if(game.status !== 0) return console.log('game status is not 0');
  if(game.players?.[0]?.steamid !== user.get('steamid') && parseInt(user?.get('rank')) < 2) return console.log('not authorized');
  if(now - game?.timeCreated < 10 * (60 * 1000)) return manager.emit('tf2_mines:cancelGameCallback', {err: 'Only games created more than 10 minutes ago can be deleted.'}, user.getSids());
  if(!userGameOwner) return console.log('userGameOwner not found', game.players?.[0]?.steamid);

  games.forEach(g => {
    if(g.id !== data?.id) return;

    g.deleted = true;
  });

  // todo: remove xp
  // todo: only allow games older than 10 mins to be deleted
  transactions.new('refund-steam', {
    items: game.players?.[0]?.items,
    appid: config.steam.defaultAppId,
    extra_data: {why: `coinflip-refund`, roundId: data?.id},
    callback: cancelGameCallback
  }, userGameOwner).catch(async e => {
    console.log(`[TF2_Mines] Failed to request refund to "${user.get('name')}" (${user.get('steamid')}) for game #${data?.id}`, e);
  });
}








events.on('steam:deposit-complete', newDeposit);
events.on('steam:deposit-started', newDepositStarted);
events.on('steam:deposit-failed', newDepositFailed);


// todo: this is retarded, think of a better solution (socket.io rooms?)
// maybe catch all joinSession events (tf2_coinflip, roulette etc) in one place
// and put them into a global variable like connectedSockets['roulette']
events.on('socket:tf2_mines:joinSession', ({ data, socket }) => {
  connectedUsers.push(socket.id);

  emitValue(socket.id);
});

events.on('socket:tf2_mines:getValue', ({ data, socket }) => emitValue(socket.id));
events.on('socket:tf2_mines:pickMine', ({ data, socket }) => pickBomb(data));
events.on('socket:tf2_mines:leave', ({ data, socket }) => {
  connectedUsers = connectedUsers.filter(x => x !== socket.id);
});
events.on('socket:tf2_mines:cancelGame', cancelGame);

const emitValue = sid => {
  manager.emit('tf2_mines:value', sum(games.filter(x => x.status == 0), 'value'), sid);
}









// debug ofc
const debug = 0;
const mines_id_ = '598e2e77039d1d79cc70a0752597a017b2db3bd0511efe9b0d2bbf64cefdd6e8';
const TEST_DATA = [{"code":"5rcQEL","data":{"appid":"440","items":[{"amount":1,"assetid":"11799455959"},{"amount":1,"assetid":"11955135786"},{"amount":1,"assetid":"12181252099"},{"amount":1,"assetid":"10034854916"},{"amount":1,"assetid":"12170061536"},{"amount":1,"assetid":"12170061242"}]},"extra_data":{"game": "mines", "mines_id": mines_id_, "error_reason":"No online bots to process your request right now. Please try again later.","items":[{"amount":1,"appid":"440","assetid":"11799455959","classid":"237182231","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEGegouTxTgsSxQt5i1Mv6NGucF1dkw5pJQ2248kFAqMraxMzE-c1HBUKNbDqBioA64DH9kv5JgVtbmor5IOVK4z5i9Hes","name":"Reinforced Robot Emotion Detector","price":0.03},{"amount":1,"appid":"440","assetid":"10034854916","classid":"3051917503","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEDbQsdUgznvTYR2Jm-MvGNG-U_l9sn4pUbim88kgAtY-XnNWdiJFKTAqUIWaFsoVC7DH4xvsQ6BtW0ou1VLQi5vZyGbedz97Kp4g","name":"Violet Vermin Case","price":0.24},{"amount":1,"appid":"440","assetid":"11955135786","classid":"237182229","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEGegouTxTgsSxQt5i-Mv6NGucF1YxmtZYCizNvxgd_NbWwZjZhcVWSA_AOWPRtrFC7UCVj6Z4zANG3r-tIOVK4uvXQm80","name":"Battle-Worn Robot Money Furnace","price":0.04},{"amount":1,"appid":"440","assetid":"12170061536","classid":"101785959","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEAaR4uURrwvz0N252yVaDVWrRTno9m4ccG2GNqxlQoZrC2aG9hcVGUWflbX_drrVu5UGki5sAij6tOtQ","name":"Mann Co. Supply Crate Key","price":2.14},{"amount":1,"appid":"440","assetid":"12181252099","classid":"4585824989","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEDewlDDUmzhztMhdjzGeCDBt8Mmsgy4N5QgDAyk1ErZeezZDUxIFWRUKEOD6VirVq0WiMxupUwUISypr0HcATsqsKYZGT-UoFl","name":"Computron 5000","price":0.14}],"price":4.7299999999999995},"id":"9efbf264-2240-40c4-80bc-8b4f3a71dd2d","last_updated":1665951716,"num_id":"772866","status":3,"time_created":1665951716,"type":"deposit-steam","user":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751","value":0}];

if(debug == 1) {
  setTimeout(() => {
    // events.emit('steam:deposit-started', {user: users.find('hxtnv.', 'name'), id: mines_id_, tx_id: 0, data: {"items":[{"amount":1,"appid":"440","assetid":"12301962282","classid":"101785959","contextid":"2","name":"Mann Co. Supply Crate Key","price":2.14,"image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEAaR4uURrwvz0N252yVaDVWrRTno9m4ccG2GNqxlQoZrC2aG9hcVGUWflbX_drrVu5UGki5sAij6tOtQ"},{"amount":1,"appid":"440","assetid":"12301962015","classid":"101785959","contextid":"2","name":"Mann Co. Supply Crate Key","price":2.14,"image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEAaR4uURrwvz0N252yVaDVWrRTno9m4ccG2GNqxlQoZrC2aG9hcVGUWflbX_drrVu5UGki5sAij6tOtQ"}],"appid":"440","extra_data":{"game":"mines","mines_id":mines_id_},"price":4.28} })
    events.emit('steam:deposit-complete', {user: users.find('hxtnv.', 'name'), data: {...TEST_DATA[0]} });
  }, 6 * 1000);

  // setTimeout(() => {
  //   events.emit('steam:deposit-failed', {user: users.find('hxtnv.', 'name'), data: {...TEST_DATA[0]} });
  // }, 10 * 1000);
}

module.exports = {
  TF2_MinesValidator: _validator
}