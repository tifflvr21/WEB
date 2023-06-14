const { createBPListing, parseSKU } = require('tf2-item-format/static');

const getBpLink = (sku) => {
  try {
    const attributes = typeof sku !== 'string' ? sku : parseSKU(sku);
    const bp = createBPListing( attributes );
    const bp_attr = {
      ...bp,
      item: bp.item_name,
      particle: bp.priceindex === 0 ? undefined : bp.priceindex,
      quality: attributes.quality,
      // remove unnecessary 
      // item_name: undefined,
      // priceindex: undefined
    };

    // todo: loop over keys and remove everything undefined
    // todo: remove "Professional Killstreak" from title and replace with "killstreak_tier=3"
    delete bp_attr.item_name;
    delete bp_attr.priceindex;
    if(bp_attr.particle == undefined) {
      delete bp_attr.particle;
    }

    const KILLSTREAKS = [
      'Basic Killstreak ', // 1
      'Specialized Killstreak ', // 2
      'Professional Killstreak ', // 3
    ];

    KILLSTREAKS.forEach((ks, key) => {
      if(bp_attr.item.includes(ks)) {
        bp_attr.item = bp_attr.item.replace(ks, '');
        bp_attr.killstreak_tier = key + 1;
      }
    });

    return `https://backpack.tf/classifieds?${new URLSearchParams(bp_attr).toString()}`;
  } catch(e) {
    return '';
  }
}

// console.log(getBpLink('25000;6'));

module.exports = getBpLink;