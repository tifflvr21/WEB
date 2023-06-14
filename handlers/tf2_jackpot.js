const sha256 = require('sha256');
const { manager } = require('../classes/IO_Manager')();
const events = require('../interfaces/events');
const users = require('../interfaces/users');
const database = require('../interfaces/database');
const transactions = require('../interfaces/transactions');
const randomorg = require('../interfaces/randomorg');
const config = require('../config');
const { now, sum, generateId, getWinnerItems } = require('../helpers');

console.log('[TF2_Jackpot] Starting service...');


/**
 * Constants and variables
*/
const TEST_DATA = [{"code":"5rcQEL","data":{"appid":"440","items":[{"amount":1,"assetid":"11799455959"}]},"extra_data":{"game":"jackpot","error_reason":"No online bots to process your request right now. Please try again later.","items":[{"amount":1,"appid":"440","assetid":"11799455959","classid":"237182231","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEGegouTxTgsSxQt5i1Mv6NGucF1dkw5pJQ2248kFAqMraxMzE-c1HBUKNbDqBioA64DH9kv5JgVtbmor5IOVK4z5i9Hes","name":"Reinforced Robot Emotion Detector","price":1.5}],"price":1.5},"id":"9efbf264-2240-40c4-80bc-8b4f3a71dd2d","last_updated":1665951716,"num_id":"772866","status":3,"time_created":1665951716,"type":"deposit-steam","user":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751","value":0}];
const GET_TEST_DATA = (index, user) => {
  const el = TEST_DATA[0];
  const random = sha256( Math.random().toString() ); // very professional yes

  el.data.items[0].assetid = `${random}-${user.get('steamid')}-${user.get('name')}`;
  el.extra_data.items[0].price = index === 0 ? 1.5 : 2.5;
  el.extra_data.price = index === 0 ? 1.5 : 2.5;
  el.extra_data.items[0].assetid = `${random}-${user.get('steamid')}-${user.get('name')}`;
  el.user = user.get('id');

  return el;
}

const COLORS = [
  '#4db3ef',
  // '#e13434', // this is for op1x only
  '#8f54dd',
  '#F22A82',
  '#CA2E73',
  '#FFDE6B',
  '#F99423',
  '#12cb5a',
  '#04963d',
];

const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS = 10;
const ROUND_TIME = 60; // in seconds
const TOTAL_TICKETS = 1000 * 100; // 100k


let timer, timeout;
let connectedUsers = []; // todo: this sucks, make it better 

let state = {
  roundId: 0,
  serverHash: undefined,
  publicServerHash: undefined,
  items: [], // array of objects
  players: [], // array of class instances
  total: 0,
  timeStart: 0,
  timeRolled: 0,
  timeCurrent: 0,
  timeTotal: ROUND_TIME,
  status: 0, // 0 = waiting, 1 = timer on, 2 = animation, 3 = over
};

let joinQueue = [];







/**
 * 
 */
const newDeposit = async ({ user, data, socket }) => {
  if(data?.extra_data?.game !== 'jackpot') return;

  // add more detail to user data
  const userData = {
    ...user.getPublic(),
    steamid: user.get('steamid'),
    color: COLORS[state.players.length] || COLORS[0],
    total: data?.extra_data?.price,
  };

  const items = data?.extra_data?.items.map(item => ({
    ...item,
    owner: {name: userData.name, avatar: userData.avatar, price: item.price, id: userData.id}
  }));

  // console.log(`[TF2_Jackpot] Player "${userData.name}" (${userData.steamid}) finished a deposit of ${items.length} items`, items);

  
  // todo: check max_players, if game is full add player to queue for the next game
  // todo: check status, if already rolling then add to queue aswell
  // if game is full or already rolling we will add it to the next game
  if(state.players.length >= MAX_PLAYERS) {
    joinQueue.push({ user, data });

    return manager.emit('chat:error', `Your deposit has been accepted and will be added to the next game.`, socket.id); 
  }

  // check if player is already in game
  // console.log(state.players);
  if(state.players.filter(p => p?.steamid == userData?.steamid).length > 0) {
    state.players.map(p => {
      if(p?.steamid == userData?.steamid) {
        p.total += data?.extra_data?.price;
      }

      return p;
    });
  } else { // not in game
    state.players = [...state.players, userData];

  }
  
  // state.items = [...state.items, ...items]; // WHY TF DOES IT OVERWRITE EVERYTHING????? IM ABOUT TO LOSE MY MIND
  items.forEach(itm => {
    state.items.push(itm);
  });
  state.total = sum(state.items, 'price');

  // update each players ticket
  let player2 = {};

  state.players.map((player, key) => {
    const prevPlayer = state.players[key - 1];

    player.chance = (player.total / state.total);
    if(isNaN(player.chance) || !isFinite(player.chance)) player.chance = 0;

    const startTicket = prevPlayer ? parseInt(prevPlayer.tickets[1]) + 1 : 1;
    const endTicket = startTicket + (TOTAL_TICKETS * player.chance);

    player.tickets = [
      parseInt(startTicket),
      parseInt(endTicket >= TOTAL_TICKETS ? TOTAL_TICKETS : endTicket)
    ];

    player2 = {...player};
    // console.log(`player ${player.name} has a chance of ${parseFloat(player.chance * 100).toFixed(2)}% and ${player.tickets[1] - player.tickets[0]} tickets`, player.tickets);
  });

  // emit update
  manager.emit('tf2_jackpot:newPlayer', {
    player: userData,
    items: data?.extra_data?.items,
    sum: sum(data?.extra_data?.items, 'price')
  }, connectedUsers);

  // todo: make a better system for xp
  user.updateXp(data?.extra_data?.price * 2, 'add');
  
  // save to database
  await database.update('tf2_jackpot_rounds', {filter: {roundId: state.roundId}}, {
    players: state.players,
    items: state.items,
    total: state.total
  });

  manager.emit('tf2_jackpot:value', state.total);

  console.log(`[TF2_Jackpot] Player "${user.get('name')}" (${user.get('steamid')}) just joined with ${data?.data?.items?.length || 0} items worth $${parseFloat(data?.extra_data?.price).toFixed(2)} (TX ID: ${data.num_id}). Their chance is ${parseFloat(player2.chance * 100).toFixed(2)}% and they have ${player2.tickets[1] - player2.tickets[0]} tickets`, player2.tickets);

  // check if requirements to start round are met
  if(shouldRoundStart()) {
    return startRoundTimer();
  }
}






/**
 * Will initiate a new round, reset everything and start a fail-safe to check if there is a previous unfinished game unless isNewRound is false
 * @param {*} isNewRound 
*/
const initRound = async (isNewRound = false) => {
  // generate public seed, save to database with time, id etc
  // reset previous round
  // setup listeners
  // randomly choose which bot to use?
  // todo: have jackpot bot be dynamically chosen based on inventory value, allow to choose which bot to use in admin panel
  let previousRound = await database.get('tf2_jackpot_rounds', {filter: [0,1,2], filter_key: 'status', orderBy: ['roundId', 'desc'], limit: 1, returnFirstObject: true});
  let totalRounds = await database.get('tf2_jackpot_rounds', {count: true});

  if(isNewRound) previousRound = undefined;

  // console.log('previous round', previousRound);

  state.time = -1;
  state.roundId = previousRound?.roundId || totalRounds + 1;
  state.players = previousRound?.players || [];
  state.items = previousRound?.items || [];
  state.winner = undefined;
  state.serverHash = previousRound?.serverHash || generateId(); // todo: need a better method of generating hashes
  // state.serverHash = await randomorg.getSignedString();
  state.publicServerHash = sha256(state.serverHash);
  state.status = previousRound?.status || 0;
  state.timeStart = previousRound?.timeStart || now();
  state.timeRolled = previousRound?.timeRolled || 0;
  state.timeCurrent = previousRound?.timeCurrent || 0;
  state.total = previousRound?.total || 0;
  state.randomorgResult = undefined;
  state.randomOffset = undefined;

  // insert into db if new round
  if(!previousRound) {
    await database.insert('tf2_jackpot_rounds', state);
  }

  // check queue
  if(joinQueue.length > 0) {
    joinQueue.map(async (item, key) => {
      await newDeposit(item);
    });

    joinQueue = [];
  }

  console.log(`[TF2_Jackpot] New round #${state.roundId} has been initiated`);

  manager.emit('tf2_jackpot:value', state.total);
  manager.emit('tf2_jackpot:init', {...state, serverHash: undefined}, connectedUsers);

  // check if game should have started
  if(shouldRoundStart()) {
    startRoundTimer();
  }
}





/**
 * Updates the round status in state and database
 * @param {*} status 
*/
const updateStatus = async status => {
  state.status = status;
  
  await database.update('tf2_jackpot_rounds', {filter: {roundId: state.roundId}}, {
    status
  });
}




/**
 * Checks if conditions are met to start the round
 * @returns 
*/
const shouldRoundStart = () => {
  // return false;
  return state.players.length >= MIN_PLAYERS_TO_START;
}





/**
 * Starts the round timer, after it ends it will call chooseWinner()
 * @returns 
*/
const startRoundTimer = async () => {
  if(state.status !== 0) return;

  clearInterval(timer);

  console.log(`[TF2_Jackpot] Round #${state.roundId} has started counting! ${ROUND_TIME} seconds until roll`);

  // setup timer
  state.time = parseInt(ROUND_TIME);
  await updateStatus(1);

  manager.emit('tf2_jackpot:timer', {
    current: state.time,
    total: ROUND_TIME
  }, connectedUsers);

  timer = setInterval(() => {
    state.time = state.time > 0 ? state.time - 1 : 0;

    manager.emit('tf2_jackpot:timer', {
      current: state.time,
      total: ROUND_TIME
    }, connectedUsers);

    if(state.time <= 0) return chooseWinner();
  }, 1000);
}






/**
 * Will select a winner based on randomorg data, send the winning offer and initiate a new round after a timeout
*/
const sendWinOfferCallback = async ({ err, offerId, roundId }) => {
  if(err) console.log(`[TF2_Jackpot] sendWinOfferCallback for #${roundId} failed`, err);

  await database.update('tf2_jackpot_rounds', {filter: {roundId}}, {
    winOfferStatus: err ? 3 : 1,
    winOfferStatusText: err ? err : `Offer sent successfully, trade offer id is #${offerId}`
  });
}

const chooseWinner = async () => {
  clearInterval(timer);
  clearTimeout(timeout);

  const finalItems = getWinnerItems(state.items);

  state.status = 2;
  state.randomOffset = Math.random(); // used for animation only
  state.randomorgResult = await randomorg.getSignedString();
  state.finalHash = sha256(`${state.serverHash}-${state.randomorgResult.result}`);
  state.winningTicket = parseInt(state.finalHash.substr(0, 8), 16) % TOTAL_TICKETS + 1;
  state.winner = state.players.filter(player => {
    return state.winningTicket >= player.tickets[0] && state.winningTicket <= player.tickets[1]; 
  })[0];

  // fail-safe: this should never happen
  if(!state.winner) {
    console.log(`[TF2_Jackpot] ERROR! Failed to find the winner based on ticket ${state.winningTicket}, the players are`, state.players.map(player => {
      return {name: player.name, steamid: player.steamid, tickets: player.tickets};
    }));

    state.winner = state.players[0];
  }

  console.log(`[TF2_Jackpot] Round #${state.roundId} is over! Player "${state.winner.name}" (${state.winner.steamid}) has won a total of ${state.items.length} items worth $${parseFloat(sum(state.items, 'price')).toFixed(2)}. Our cut from that was $${parseFloat(finalItems.cutAmount).toFixed(2)}`);

  // todo: use starttime
  await database.update('tf2_jackpot_rounds', {filter: {roundId: state.roundId}}, {
    winner: state.winner,
    random: state.randomOffset,
    timeRolled: now(),
    randomorgResult: state.randomorgResult,
    finalHash: state.finalHash,
    winningTicket: state.winningTicket,
    winner: state.winner,
    status: state.status,
    itemsWin: finalItems.win,
    itemsCut: finalItems.cut,
    itemsWinAmount: finalItems.winAmount,
    itemsCutAmount: finalItems.cutAmount,
    winOfferStatus: 0, // 0 = not sent, 1 = sent, 2 = accepted, 3 = error
    winOfferStatusText: '',
    winOfferId: 0
  });

  events.emit('rake:new', {
    items: finalItems.cut,
    amount: finalItems.cutAmount,
    game: 'jackpot'
  });

  manager.emit('tf2_jackpot:winner', {
    winner: state.winner,
    random: state.randomOffset
  }, connectedUsers);


  // wait for animation to end
  // todo: move animation length to config
  timer = setTimeout(async () => {
    await updateStatus(3);
    const roundIdSaved = parseInt(state.roundId);

    // request transactions
    transactions.new('winnings-steam', {
      items: finalItems.win,
      appid: config.steam.defaultAppId,
      extra_data: {why: 'jackpot-win', roundId: roundIdSaved},
      callback: ({ err, offerId }) => sendWinOfferCallback({ err, offerId, roundId: roundIdSaved })
    }, users.find(state.winner.steamid, 'steamid')).then(async data => {
      await database.update('tf2_jackpot_rounds', {filter: {roundId: roundIdSaved}}, {
        winOfferStatus: 1, 
        winOfferStatusText: 'Offer has been sent. Security code is ' + data.code,
        winOfferId: data.id
      });
    }).catch(async e => {
      await database.update('tf2_jackpot_rounds', {filter: {roundId: roundIdSaved}}, {
        winOfferStatus: 3,
        winOfferStatusText: e.message || e,
      });
    });

    initRound(true);
    // real anim length is 6000 + 1000 + 600 (7600)
  }, 6000 + 4600);
}











events.on('steam:deposit-complete', newDeposit);




events.on('socket:tf2_jackpot:getValue', ({ socket }) => {
  manager.emit('tf2_jackpot:value', state.total, socket.id);
});


// todo: this is retarded, think of a better solution (socket.io rooms?)
// maybe catch all joinSession events (tf2_jackpot, roulette etc) in one place
// and put them into a global variable like connectedSockets['roulette']
events.on('socket:tf2_jackpot:joinSession', ({ data, socket }) => {
  connectedUsers.push(socket.id);
  
  manager.emit('tf2_jackpot:init', {...state, serverHash: undefined}, socket.id);
});

events.on('socket:tf2_jackpot:leave', ({ data, socket }) => {
  connectedUsers = connectedUsers.filter(x => x !== socket.id);
});



initRound();






// debug ofc
const debug = 0;

if(debug == 1) {
  setTimeout(() => {
    // events.emit('steam:deposit-complete', {user: users.find('TD42', 'name'), data: {...TEST_DATA[0]} });
    events.emit('steam:deposit-complete', {user: users.find('hxtnv.', 'name'), data: GET_TEST_DATA(0, users.find('hxtnv.', 'name')) });
  }, 3 * 1000);

  setTimeout(() => {
    events.emit('steam:deposit-complete', {user: users.find('TD42', 'name'), data: GET_TEST_DATA(1, users.find('TD42', 'name')) });
    // events.emit('steam:deposit-complete', {user: users.find('hxtnv.', 'name'), data: {...TEST_DATA[0]} });
  }, 6 * 1000);

  // setTimeout(() => {
  //   state.winner = state.players[0];
  //   state.randomOffset = Math.random();
    
  //   manager.emit('tf2_jackpot:winner', {
  //     winner: state.winner,
  //     random: state.randomOffset
  //   }, connectedUsers);
  // }, 5 * 1000);

}