const Handler = require('./Handler');
const { io, manager } = require('../IO_Manager')();
const events = require('../../interfaces/events');
const users = require('../../interfaces/users');
const database = require('../../interfaces/database');
const { now, addZeros } = require('../../helpers');
const config = require('../../config');

// todo: rooms should be stored in db and have unique ids in case they change
const ROOMS = [
  {code: 'us', name: 'English room'},
  {code: 'pl', name: 'Polish room'},
  {code: 'se', name: 'Swedish room'},
  {code: 'de', name: 'German room'},
  {code: 'fr', name: 'French room'},
  {code: 'tr', name: 'Turkish room'}
];

class ChatHandler extends Handler {
  constructor(props) {
    super(props);

    this.rooms = ROOMS.map((x, key) => ({title: x.name, code: x.code, id: key, users: [], sids: [], msgs: []}));

    // listen for disconnect
    events.on('user:disconnect', sid => {
      this.removeSocketFromAllRooms(sid);
      // console.log('disconnect, new online is', this.getOnlineByRooms())
      manager.emit('chat:online', this.getOnlineByRooms());
    });

    this.preload();
  }

  preload() {
    const _ = () => {
      // add existing messages
      this.rooms.forEach(async room => {
        const msgs = await database.get('chat_messages', {
          orderBy: ['time', 'desc'],
          limit: config.chat.limit,
          filter: {room: room.id},
          reverse: true
        });

        // console.log(`[Chat] Loaded ${msgs.length} total msgs in "${room.title}"`);

        msgs.forEach((msg, key) => {
          if(room && msg.user) {
            const newUser = users.find(msg.user.id, 'id');
            if(newUser) {
              msg.user = newUser.getPublic();
            }

            room.msgs.push({user: msg.user, content: msg.content, time: msg.time});
          }

          if(msg.room == -1 && msg.user.system) {
            this.rooms.forEach(r => {
              r.msgs.push({content: msg.content, time: msg.time});
            });
          }
        });
      });
    }

    if(users.loaded) {
      return _();
    } else {
      const timeout = setTimeout(() => this.preload(), 3000);
    }
  }

  removeSocketFromAllRooms(sid) {
    this.rooms.forEach(room => {
      room.sids = room.sids.filter(x => x !== sid);
      room.users = room.users.filter(x => {
        const sids = new Set([...x.sids].filter(y => y !== sid));

        // return sids.size == 0;
        if(sids.size == 0) {
          return false;
        } else {
          return true;
        }
      })
    });
  }

  getRoom(id) {
    return this.rooms.filter(x => x.id == id)[0];
  }

  getOnlineByRooms() {
    // console.log('');
    return this.rooms.map(x => {
      // console.log(`${x.title} = ${x.users.length} online (new: ${x.users.filter(y => y.sids.length > 0).length})`);
      return {
        id: x.id,
        title: x.title,
        code: x.code,
        total: x.users.filter(y => [...new Set(y.sids)].length > 0).length,
      };
    });
  }
  
  addToRoom(user, room) {
    this.rooms.forEach(r => {
      const index = r.users.map(x => x.get('token')).indexOf(user.get('token'));
      if(index !== -1) r.users.splice(index, 1);
    });

    if(room.users.filter(x => x.get('token') == user.get('token')).length == 0) {
      room.users.push(user);
    }
  }

  joinRoom(room, user, socket) {
    // todo: add non-signed in users as sids?
    room = this.getRoom(room);

    if(room) {
      this.removeSocketFromAllRooms(socket.id);
      if(user) this.addToRoom(user, room);
      if(!room.sids.includes(socket.id)) room.sids.push(socket.id);

      // debug
      // if(room.msgs.length == 0) {
      //   console.log(`joined room with ${room.msgs.length} msgs`);
      //   console.log(room);
      // }
      // todo: if msgs is 0 keep retrying until its not 0 and only then send (also check if loading finished)

      manager.emit('chat:joined_room', {id: room.id, msgs: room.msgs || [], config: config.chat}, socket.id);
      manager.emit('chat:online', this.getOnlineByRooms());
    } else {
      throw `Couldn't find room with id ${room}`;
    }
  }

  cmdHandler(content, user) {
    let args = content.split(' ');
    let cmd = args[0];

    args.splice(0, 1);

    console.log(`Command ${cmd} called by ${user.get('name')} with arguments:`, args);

    // todo: permissions etc
    // todo: move all commands to subscribers
    if(cmd == '/alert') {
      if(parseInt(user.get('rank')) < 2) throw `Insufficient permissions`;
      if(args.length == 0 || args.join('') == '' || args[0] == '') throw `Usage: /alert <message>`;
      const time = now();

      this.rooms.forEach(room => {
        room.msgs.push({content: args.join(' '), time});
      })
      
      events.emit('chat:message', {room: {id: -1}, content: args.join(' '), time});
      return manager.emit('chat:error', args.join(' '));

    } else if(cmd == '/self') {
      return user.emit('chat:error', JSON.stringify(user.get(), null, 2));
    } else if(cmd == '/updateval') {
      // todo: permission
      if(parseInt(user.get('rank')) < 2) throw `Insufficient permissions`;
      // /updateval badge ADMIN <steamid>
      // return user.emit('chat:error', 'Invalid arguments! Usage: /updateval <key> <value> [<userid>]');
      if(args.length !== 2 && args.length !== 3) throw 'Invalid arguments! Usage: /updateval &lt;key&gt; &lt;value&gt; [&lt;userid&gt;]';
      const target = args.length == 2 ? user : users.find(args[2], 'id');

      if(!target) throw `No user with id ${args[2]} found`;

      // todo: emit event and also update in database
      // todo: dont broadcast if the value didnt change
      // todo: if value is empty, make the message say "value has been cleared"
      if(args[1] == 'true') args[1] = true;
      if(args[1] == 'false') args[1] = false;

      target.set(args[0], args[1]);
      if(args[0] == 'badge') target.emit('chat:error', `Your badge has been changed to "${args[1]}"`);

      throw `Value of "${args[0]}" for ${target.get('name')} has been changed to ${args[1]}`;
    } else if(cmd == '/balance') {
      if(parseInt(user.get('rank')) < 2) throw `Insufficient permissions`;
      if(args.length !== 2 && args.length !== 3) throw 'Invalid arguments! Usage: /balance &lt;set/add/remove&gt; &lt;value&gt; &lt;userid&gt;';
      const target = args.length == 2 ? user : users.find(args[2], 'id');

      if(!target) throw `No user with id ${args[2]} found`;

      target.updateBalance(args[1], args[0]);

      throw `User ${target.get('name')} got ${args[0] == 'set' ? 'their balance set to ' : ''}${args[1]} coins${args[0] == 'add' ? ' added to' : ''}${args[0] == 'remove' ? ' removed from' : ''}${args[0] !== 'set' ? ' their balance' : ''}`;
    } else if(cmd == '/ban') {
      if(parseInt(user.get('rank')) < 2) throw `Insufficient permissions`;
      if(args.length < 2) throw 'Invalid arguments! Usage: /ban &lt;userid&gt; &lt;time in hours&gt; &lt;reason*&gt;';

      const target = args.length == 2 ? user : users.find(args[0], 'id');

      if(!target) throw `No user with id ${args[0]} found`;
      if(target.get('id') == user.get('id')) throw `Can't ban yourself :)`;

      if(!!target.get('banned')) {
        target.set('banned', false);
        target.set('ban_expires_at', 0);
        target.set('ban_expires_at_readable', '');
        target.set('ban_length', 0);
        target.set('ban_reason', '');
        target.set('banned_by', {
          name: user.get('name'),
          avatar: user.get('avatar'),
          id: user.get('id'),
          steamid: user.get('steamid')
        });

        throw `User ${target.get('name')} has been unbanned`;
      } else {
        const expires_at = now() + ( (parseInt(args[1]) * 60) * 60 );
        const date = new Date(expires_at * 1000);
        const date_readable = `${addZeros(date.getDate())}/${addZeros(date.getMonth() + 1)}/${addZeros(date.getFullYear())}, ${addZeros(date.getHours())}:${addZeros(date.getMinutes())}`; // todo: make that a global function

        target.set('banned', true);
        target.set('ban_expires_at', expires_at);
        target.set('ban_expires_at_readable', date_readable);
        target.set('ban_length', parseInt(args[1]));
        target.set('banned_by', {
          name: user.get('name'),
          avatar: user.get('avatar'),
          id: user.get('id'),
          steamid: user.get('steamid')
        });

        if(args.length <= 2) {
          target.set('ban_reason', '');
        } else {
          args.splice(0, 2);
          target.set('ban_reason', args.join(' '));
        }

        // todo: in handshake check if that date has passed and unban if so
        // todo: go through all messages and mark user as banned (crossed out name)

        throw `User ${target.get('name')} has been banned${parseInt(args[1]) == 0 ? ' forever' : ' until ' + date_readable}`;
      }
    }

    throw `Invalid command ${cmd}.`;
  }

  sendMessage({ room, content, token }, user) {
    if(!user) throw `You need to sign in first!`; 
    room = this.getRoom(room);

    if(!!user.get('banned')) {
      throw user.getBanMsg(); 
    }

    if(room) {
      const time = now();
      const prev = room.msgs.filter(msg => msg.user?.id == user.get('id') && msg.time > time - config.chat.spamTimeout);
      const timeLeft = prev.length > 0 ? config.chat.spamTimeout - (time - prev[prev.length - 1].time) : 0;

      if(content[0] == '/' && [3,4].includes( parseInt(user.get('rank')) )) return this.cmdHandler(content, user);
      
      if(content.length == 0 || typeof content !== 'string') throw `You can't send an empty message!`;
      if(content.length > config.chat.messageMaxLength) throw `Your message is too long! ${content.length} out of ${config.chat.messageMaxLength} allowed.`;
      if(prev.length > 0 && parseInt(user.get('rank')) < 2) throw `Please wait ${timeLeft} more second${timeLeft == 1 ? '' : 's'} before sending a message again.`;

      room.msgs.push({user: user.getPublic(), content, time});
      room.sids.forEach(sid => {
        // return manager.emitToSid('chat:message', {room, content, user: user.getPublic()}, sid);
        return manager.emitToSid('chat:message', {room: room.id, content, user: user.getPublic(), time}, sid);
      });

      events.emit('chat:message', {room, content, user: user.getPublic(), time});
    } else {
      throw `Couldn't find room with id ${room}`;
    }
  }

  deleteMessage(dd, user) { // { steamid, content, time, room }
    let { steamid, content, time, room } = dd;
    let _room = dd.room;

    if(!user) throw `You need to sign in first!`; 
    room = this.getRoom(room);

    if(user.get('rank') < 2) {
      throw `Insufficient permissions`;
    }

    room.msgs = room.msgs.filter(x => {
      if(x?.user?.steamid == steamid && x.time == time) { // todo: check content or even better use ID
        return false;
      } else {
        return true;
      }
    });

    room.sids.forEach(sid => {
      return manager.emitToSid('chat:deleteMessage', dd, sid);
    });

    events.emit('chat:deleteMessage', {...dd, room: _room});
  }
}

module.exports = new ChatHandler();