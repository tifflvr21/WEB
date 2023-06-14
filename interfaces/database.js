const rdb = require('rethinkdbdash');
const { isDefined, isProd } = require('../helpers');

const { database } = require('../config');

const r = rdb({
  servers: [{host: database.host, port: database.port}],
  ssl: false,
  buffer: 20, // Minimum connections to rethinkDB
  max: 100, // Maximum connections to rethinkDB
  timeoutGb: 30 * 1000, // How long the pool keep a connection that hasn't been used (in ms)
  db: database.name,
  authKey: database.password,
  // silent: true, // prevent logging on stderr
});


const applyOptions = (x, options = {}) => {
  const { orderBy, limit, filter, filter_key, reverse, count, custom, pluck } = options;

  // filtering results
  if(isDefined(filter)) {
    // todo: allow >=, < etc
    if(Array.isArray(filter)) {
      x = x.filter(item => r.expr(filter).contains(item(filter_key)));
    } else {
      x = x.filter(filter);
    }
  }

  // order by (asc/desc)
  if(isDefined(orderBy)) {
    x = x.orderBy(
      orderBy[1] == 'desc' ? r.desc(orderBy[0]) : r.asc(orderBy[0]),
    );
  }

  // limit results
  if(isDefined(limit)) {
    x = x.limit(limit);
  }

  // return count instead of list
  if(isDefined(count)) {
    x = x.count();
  }

  // pluck
  if(isDefined(pluck)) {
    x = x.pluck(pluck);
  }

  // apply any custom options
  if(isDefined(custom)) {
    x = custom(x, r);
  }

  return x;
}

const databaseGet = async (table, options = {}) => {
  const x = applyOptions(r.db(database.name).table(table), options);
  
  // console.log(`[Database] Requesting data from "${table}" with options`, options);
  
  const data = await x.run().then(arr => isDefined(options.reverse) ? arr.reverse() : arr);
  
  return options.returnFirstObject ? data[0] : data;
}

const databaseUpdate = async (table, options = {}, data = {}) => {
  const x = applyOptions(r.db(database.name).table(table), options);

  // this should be a temp fix
  for(let i in data) {
    if(typeof data[i] == 'undefined' || typeof data[i] == 'function') delete data[i];
    if(typeof data[i] == 'object' && !Array.isArray(data[i])) {
      for(let j in data[i]) {
        if(typeof data[i][j] == 'undefined') delete data[i][j];
      }
    }
  }

  // console.log(`[Database] Updating data into "${table}", options:`, options);
  // console.log('[Database] Data:', data);

  return await x.update(data).run();
}

const databaseRemove = async (table, options = {}) => {
  const x = applyOptions(r.db(database.name).table(table), options);

  // console.log(`[Database] Deleting data from "${table}", options:`, options);

  return await x.delete().run();
}

const databaseInsert = async (table, data = {}) => {
  let newData = {};
  Object.keys(data).forEach(d => {
    newData[d] = data[d];
  })
  // data = {...data};
  // todo: return ID
  // console.log(`[Database] Inserting data into "${table}"`, data);

  // console.log('type', typeof data?.data?.callback);
  delete data?.data?.callback;
  delete data?.callback;

  return await r.db(database.name).table(table).insert(data).run();
}

const databaseCustom = async (table, data = {}, options = {}) => {
  const x = applyOptions(r.db(database.name).table(table), options);

  return await x(data).run();
}


module.exports = {
  get: databaseGet,
  insert: databaseInsert,
  update: databaseUpdate,
  remove: databaseRemove,
  _: databaseCustom,
  r
}