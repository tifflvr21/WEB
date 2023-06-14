const express = require('express');
const config = require('../config');

const reactApp = express.static('build');

const reactAuthMiddleware = (req, res, next) => {
  if(!config.http.password || config.http.password == '') {
    return reactApp(req, res, next);
  }

  const authorization = req.headers.authorization;
  
  const reject = () => {
    res.setHeader("www-authenticate", "Basic");
    res.sendStatus(401);
    return;
  };
  
  if (!authorization) {
    return reject();
  }

  const [username, password] = Buffer.from(authorization.replace("Basic ", ""), "base64").toString().split(":");

  if(username === "admin" && password === config.http.password) {
    return reactApp(req, res, next);
  } else {
    return reject();
  }
}

module.exports = reactAuthMiddleware;