const { parseSKU, stringify } = require('tf2-item-format/static');

const getNameFromSKU = sku => {
  const attributes = parseSKU(sku.split(';')[0]);
  
  return stringify(attributes).replace('undefined ', '');
}

module.exports = getNameFromSKU;