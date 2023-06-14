const users = require('../interfaces/users');

const userTokenMiddleware = async (req, res, next) => {
  if(req.body) {
    req.self = users.find(req.body.token);
  }

  return next();
}

module.exports = userTokenMiddleware;
