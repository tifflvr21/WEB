const socket = require('socket.io');
const config = require('../config');
const users = require('../interfaces/users');
const events = require('../interfaces/events');
const { isProd } = require('../helpers');

function isPlainObject(input) {
  return input && !Array.isArray(input) && typeof input === 'object';
}

class IO_Manager {
  constructor() {
    // console.log(`IO_Manager init`);

    // this event exists only because we need to import this class in User.js
    // and if we do so there is a circular dependency error
    // todo: find a way to simplify this
    events.on('emit_to_sid', data => {
      data.sids = [...new Set(data.sids)];
      // console.log('emit_to_sid', data);
      data.sids.forEach(sid => {
        const fn = data.event.includes(':') ? this.emitToSid : this.emitToSidNoConstruct;
        fn(data.event, data.data, sid); // emitToSidNoConstruct
      });
      
    });

    this.construct = this.construct.bind(this);
    this.deconstruct = this.deconstruct.bind(this);
    this.emit = this.emit.bind(this);
    this.emitToSid = this.emitToSid.bind(this);
    this.emitToSidNoConstruct = this.emitToSidNoConstruct.bind(this);
    this._emitToUserOrSocket = this._emitToUserOrSocket.bind(this);
  }

  /**
   * Function to convert an event string into an event object
   * @param {string} e - String containing the event name and type (for example "chat:online")
   * @param {object} data - additional data
   * @returns {object} - an object like so {action: 'online', online: 1}
  */
  construct(e, data) {
    const action = e.split(':');

    // console.log(`construct ${e}`, data);
    
    if(!isPlainObject(data)) {
      const tmp = data;
      data = {};
      data[action[1]] = tmp;
    }
  
    return {...data, action: action[1]};
  }

  /**
   * Function to convert an event object into an event string
   * @param {object} e - object containing event data (for example {action: 'online', online: 1})
   * @param {object} data - additional data
   * @returns {object} - an object like so 
  */
  deconstruct(e, data) {
    const action = data.action;

    if(Object.keys(data).length == 2) {
      if(typeof data[action] !== 'undefined') data = data[action];
    }

    return {
      title: `${e}:${action}`,
      data
    };
  }
  
  /**
   * 
   * @param {*} e 
   * @param {*} data 
   * @param {*} sid 
   * @returns 
   */
  emit(e, data, sid) {
    if(!io) return; // todo: have a centralised error handler
    if(sid) {
      if(typeof sid == 'string') return this._emitToUserOrSocket(e, data, sid);
      if(!Array.isArray(sid)) return;

      return sid.forEach(s => {
        this.emitToSid(e, data, s);
      });
    }
  
    io.emit(e.split(':')[0], this.construct(e, data));
  }

  /**
   * 
   * @param {*} e 
   * @param {*} data 
   * @param {*} sid 
   * @returns 
   */
  emitToSid(e, data, sid) {
    if(!io) return; // todo: have a centralised error handler
    io.to(sid).emit(e.split(':')[0], this.construct(e, data));
  }

  /**
   * 
   * @param {*} e 
   * @param {*} data 
   * @param {*} sid 
   * @returns 
   */
  emitToSidNoConstruct(e, data, sid) {
    if(!io) return; // todo: have a centralised error handler
    io.to(sid).emit(e, data);
  }

  /**
   * 
   * @param {*} e 
   * @param {*} data 
   * @param {*} sid 
   * @returns 
   */
  _emitToUserOrSocket(e, data, sid) {
    // first we check if this sid belongs to a connected user
    const user = users.getBySid(sid);
  
    if(user) return user.emit(e.split(':')[0], this.construct(e, data));
    return this.emitToSid(e, data, sid);
  }
}

const manager = new IO_Manager();

let io;

module.exports = server => {
  // if(server) io = socket(server, {cors: {origin: isProd ? config.http.frontendUrl : '*', methods: ["GET", "POST"]}});
  if(server) io = socket(server, {cors: {origin: '*', methods: ["GET", "POST"]}});

  return {
    io,
    manager
  }
}