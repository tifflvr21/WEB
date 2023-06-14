module.exports = app => {
  require('./io'); // todo: move elsewhere

  app.use('/auth', require('./auth_steam'));
  app.use('/user', require('./user'));
  app.use('/emojis', require('./emojis'));
  app.use('/steam_bots', require('./steam_bots'));
  app.use('/tf2_jackpot', require('./tf2_jackpot'));
  app.use('/tf2_coinflip', require('./tf2_coinflip'));
  app.use('/tf2_mines', require('./tf2_mines'));
  app.use('/leaderboard', require('./leaderboard'));
  app.use('/admin', require('./admin'));
  app.use('/rake', require('./rake'));

  // debug
  app.get('/test', (req, res) => {
    res.send('Hello, I am working! :)');
  });
}