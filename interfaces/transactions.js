const events = require('../interfaces/events');
const { generateId, now } = require('../helpers');
const database = require('./database');
const users = require('./users');
// const { steam, steamApis } = require('../config');

// const DINO_FACTS = require('../.cache/dinosaur_facts.json');
const TXN_STATUS = {
  0: 'Started',
  1: 'In progress',
  2: 'Completed',
  3: 'Failed'
};
const TXN_TYPES = ['deposit-steam', 'withdraw-steam', 'winnings-steam', 'refund-steam'];

const transactions = {
  new: (type, data, user) => {
    return new Promise(async (resolve, reject) => {
      if(!TXN_TYPES.includes(type)) return reject('Invalid transaction type');
      if(!user) return reject(`Tried to create transaction for non-existant user`);
      // todo: dont allow if a active transaction already exists

      const time = now();
      const id = generateId(6, true);
      const code = generateId(6);
      // todo: make sure the num_id is unique
      const db_data = {
        num_id: id,
        type,
        code,
        data,
        user: user.get('id'),
        time_created: time,
        last_updated: time,
        status: 0,
        value: 0,
        extra_data: (data.extra_data && typeof data.extra_data == 'object' && !Array.isArray(data.extra_data)) ? data.extra_data : {}
      };

      await database.insert('transactions', db_data);
      events.emit(`transactions:new-${type}`, {...db_data, callback: data?.callback});

      resolve({
        id,
        code,
        // dino_fact: DINO_FACTS[Math.floor(Math.random() * DINO_FACTS.length)]
      });
    });
  },

  update: (id, status, extra_data = {}) => {
    return new Promise(async (resolve, reject) => {
      console.log(`[Transactions] Updating transaction #${id} to status "${TXN_STATUS[status] || status}"`, extra_data);
      
      const res = await database.update('transactions', {filter: {num_id: id.toString()}}, {
        status,
        extra_data,
        last_updated: now()
      });

      // get user info
      const txn = await database.get('transactions', {filter: {num_id: id.toString()}});

      if(txn.length > 0) {
        const user = users.find(txn[0].user, 'id');
        user.emit(`transactions:${id}-status`, {status, extra_data});
      }

      // console.log(`EMITTING EVENT transactions:${id}-status`);
      events.emit(`transactions:${id}-status`, {status, extra_data, id});

      resolve('ok');
    });
  },

  getByUserId: (userId, type) => {
    return new Promise(async (resolve, reject) => {
      resolve(await database.get('transactions', {filter: {user: userId}, limit: 20, orderBy: ['last_updated', 'desc']}));
    });
  }
}

module.exports = transactions;