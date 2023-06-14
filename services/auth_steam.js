const express = require('express');
const router = express.Router();
const passport = require('passport');
const SteamStrategy = require('passport-steam').Strategy;

// todo: loop over all files in subscribers and require them
// require('../subscribers/user');

const users = require('../interfaces/users');
// const events = require('../interfaces/events');
const config = require('../config');

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Use the SteamStrategy within Passport.
passport.use(new SteamStrategy({
    returnURL: `${config.http.backendUrl}/auth/steam/return`,
    realm: config.http.backendUrl,
    apiKey: config.steam.apiKey
  }, (identifier, profile, done) => {
    process.nextTick(() => {
      profile.identifier = identifier;
      return done(null, profile);
    });
  }
));
// GET /auth/steam
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  The first step in Steam authentication will involve redirecting
//   the user to steamcommunity.com.  After authenticating, Steam will redirect the
//   user back to this application at /auth/steam/return
router.get('/steam', passport.authenticate('steam', { failureRedirect: config.auth.returnUrlBase }), (req, res) => {
  res.redirect(config.auth.returnUrlBase);
});

// GET /auth/steam/return
//   Use passport.authenticate() as route middleware to authenticate the
//   request.  If authentication fails, the user will be redirected back to the
//   login page.  Otherwise, the primary route function function will be called,
//   which, in this example, will redirect the user to the home page.
router.get('/steam/return',
  // Issue #37 - Workaround for Express router module stripping the full url, causing assertion to fail 
  (req, res, next) => {
    req.url = req.originalUrl;
    next();
  }, 

  passport.authenticate('steam', { failureRedirect: config.auth.returnUrlBase }),
  async (req, res) => {
    const data = req.user._json;

    const user = await users.login({
      name: data.personaname,
      avatar: data.avatarfull,
      steamid: data.steamid,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    }, 'steamid');

    // console.log(`got token!`, user.get('token'));

    res.redirect(`${config.auth.returnUrlSuccess}?_ins_login=${user.get('token')}`);
  });

module.exports = router;