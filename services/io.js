const { io } = require('../classes/IO_Manager')();
const users = require('../interfaces/users');
const events = require('../interfaces/events');

const chatHandler = require('../classes/handlers/ChatHandler');
const userHandler = require('../classes/handlers/UserHandler');
const rouletteHandler = require('../classes/handlers/RouletteHandler');

// todo: replace all .delegate functions with this
const delegate = (event, data) => {
  events.emit(`socket:${event}:${data.data.action || 'generic'}`, data);
}

io.on('connection', socket => {
  socket.on('handshake', token => {
    events.emit(`user:handshake:${token}`, {sid: socket.id, token});
    socket.emit('handshake_complete');
  });

  socket.on('user', data => userHandler.delegate(data, socket));
  socket.on('chat', data => chatHandler.delegate(data, socket));
  socket.on('roulette', data => rouletteHandler.delegate(data, socket));
  socket.on('tf2_jackpot', data => delegate('tf2_jackpot', {data, socket}));
  socket.on('tf2_coinflip', data => delegate('tf2_coinflip', {data, socket}));
  socket.on('tf2_mines', data => delegate('tf2_mines', {data, socket}));
  socket.on('disconnect', () => {
    const user = users.getBySid(socket.id);

    if(user) {
      events.emit(`user:disconnect:${user.get('token')}`, socket.id);
    }

    events.emit('user:disconnect', socket.id);
  });
});