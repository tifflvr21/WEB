const express = require('express');
const users = require('../interfaces/users');
const config = require('../config');

const reactApp = express.static('build');
const reactAppNoAuth = express.static('build_closed_beta');

const allow = (req, res, next) => {
  req.betaAuth = true;
  return reactApp(req, res, next);
}

const deny = (req, res, next) => {
  req.betaAuth = false;
  return reactAppNoAuth(req, res, next);
}


const closedBetaMiddleware = (req, res, next) => {
  const data = req?.user?._json;
  const user = users.find(data?.steamid, 'steamid');

  if(!config.http.closedBeta) {
    return allow(req, res, next);
  } else {
    if(data) {
      if(user && !!user?.get('betaAccess')) {
        return allow(req, res, next);
      }

      return deny(req, res, next);
    }

    return deny(req, res, next);
  }
}

module.exports = closedBetaMiddleware;