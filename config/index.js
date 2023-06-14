const { isProd } = require('../helpers');

const getFileName = () => isProd ? './production.json' : './development.json';

module.exports = require(getFileName());