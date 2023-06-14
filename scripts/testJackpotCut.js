let items2 = [{"amount":1,"appid":"440","assetid":"11799455959","classid":"237182231","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEGegouTxTgsSxQt5i1Mv6NGucF1dkw5pJQ2248kFAqMraxMzE-c1HBUKNbDqBioA64DH9kv5JgVtbmor5IOVK4z5i9Hes","name":"Reinforced Robot Emotion Detector","price":0.03,"owner":{"name":"hxtnv.","avatar":"https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/c5/c570e9097ba46677da64845997527ccd9340321a_full.jpg","price":0.03,"id":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751"}},{"amount":1,"appid":"440","assetid":"12170061242","classid":"101785959","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEAaR4uURrwvz0N252yVaDVWrRTno9m4ccG2GNqxlQoZrC2aG9hcVGUWflbX_drrVu5UGki5sAij6tOtQ","name":"Mann Co. Supply Crate Key","price":2.14,"owner":{"name":"hxtnv.","avatar":"https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/c5/c570e9097ba46677da64845997527ccd9340321a_full.jpg","price":2.14,"id":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751"}},{"amount":1,"appid":"440","assetid":"10034854916","classid":"3051917503","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEDbQsdUgznvTYR2Jm-MvGNG-U_l9sn4pUbim88kgAtY-XnNWdiJFKTAqUIWaFsoVC7DH4xvsQ6BtW0ou1VLQi5vZyGbedz97Kp4g","name":"Violet Vermin Case","price":0.24,"owner":{"name":"hxtnv.","avatar":"https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/c5/c570e9097ba46677da64845997527ccd9340321a_full.jpg","price":0.24,"id":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751"}},{"amount":1,"appid":"440","assetid":"11955135786","classid":"237182229","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEGegouTxTgsSxQt5i-Mv6NGucF1YxmtZYCizNvxgd_NbWwZjZhcVWSA_AOWPRtrFC7UCVj6Z4zANG3r-tIOVK4uvXQm80","name":"Battle-Worn Robot Money Furnace","price":0.04,"owner":{"name":"hxtnv.","avatar":"https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/c5/c570e9097ba46677da64845997527ccd9340321a_full.jpg","price":0.04,"id":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751"}},{"amount":1,"appid":"440","assetid":"12170061536","classid":"101785959","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEAaR4uURrwvz0N252yVaDVWrRTno9m4ccG2GNqxlQoZrC2aG9hcVGUWflbX_drrVu5UGki5sAij6tOtQ","name":"Mann Co. Supply Crate Key","price":2.14,"owner":{"name":"hxtnv.","avatar":"https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/c5/c570e9097ba46677da64845997527ccd9340321a_full.jpg","price":2.14,"id":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751"}},{"amount":1,"appid":"440","assetid":"12181252099","classid":"4585824989","contextid":"2","image":"https://community.cloudflare.steamstatic.com/economy/image/fWFc82js0fmoRAP-qOIPu5THSWqfSmTELLqcUywGkijVjZULUrsm1j-9xgEDewlDDUmzhztMhdjzGeCDBt8Mmsgy4N5QgDAyk1ErZeezZDUxIFWRUKEOD6VirVq0WiMxupUwUISypr0HcATsqsKYZGT-UoFl","name":"Computron 5000","price":0.14,"owner":{"name":"hxtnv.","avatar":"https://steamcdn-a.akamaihd.net/steamcommunity/public/images/avatars/c5/c570e9097ba46677da64845997527ccd9340321a_full.jpg","price":0.14,"id":"f1c67fb4-cbc8-4479-b4d3-d5fc521b4751"}}];
// items2 = [...items2, ...items2];

items2.forEach(item => {
  item.price = Math.random() * 50;
  item.assetid = parseInt(Math.random() * 999999);
});


const OUR_CUT = 0.10;
const { sum } = require('../helpers');

const getWinnerItems = items => {
  const totalValue = sum(items, 'price');
  const idealCutValue = totalValue * OUR_CUT;
  const itemsUnderOurFullCutValue = items.filter(item => item.price <= idealCutValue).sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
  const sumOfItemsUnderOurFullCutValue = sum(itemsUnderOurFullCutValue, 'price');

  // scenario 1 - there is 2 or less items so we dont keep anything
  if(items.length <= 2) {
    console.log('scenario 1');
    return {
      cut: [],
      win: items,
      cutAmount: 0,
      winAmount: totalValue,
      idealCutAmount: idealCutValue
    };
  }

  // scenario 2 - there are items that are worth less than our cut value but together they are worth more  - we will try to take the most expensive items from here
  if(itemsUnderOurFullCutValue.length > 0 && sumOfItemsUnderOurFullCutValue > idealCutValue) {
    console.log('scenario 2');
    // todo: remove overlap from win items
    let cut = [];

    // console.log(items);

    const retry = (index = 0) => {
      if(!itemsUnderOurFullCutValue[index]) {
        return 'ok';
      }

      // console.log(`retry ${index}`);
      // console.log(`retry ${index}`, itemsUnderOurFullCutValue[index]);
      // we will keep adding items until we meet our cut amount
      cut.push(itemsUnderOurFullCutValue[index]);

      if(sum(cut, 'price') < idealCutValue) {
        retry(index + 1);
      } else {
        return 'ok';
      }
    }

    retry();

    cut = [...new Set(cut)];

    return {
      cut: cut,
      win: items.filter(item => !cut.map(it => it.assetid).includes(item.assetid)),
      cutAmount: sum(cut, 'price'),
      winAmount: sum(items.filter(item => !cut.map(it => it.assetid).includes(item.assetid)), 'price'),
      idealCutAmount: idealCutValue
    }
  }

  // scenario 3 - there is no items worth less than our cut value - we will take the cheapest item from the list 
  if(itemsUnderOurFullCutValue.length == 0 || sumOfItemsUnderOurFullCutValue < idealCutValue) {
    // todo: maybe add minimum price above here and fail-safe if nothing found
    const itemToTake = items.sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];

    // scenario 4 - the item we chose is too cheap, we will try to take an item that is the closest in value to our ideal cut
    if(itemToTake.price < (idealCutValue / 2)) {
      console.log('scenario 4');
      
      const itemToTake2 = items.filter(it => it.price == items.map(item => item.price).reduce(function(prev, curr) {
        return (Math.abs(curr - idealCutValue) < Math.abs(prev - idealCutValue) ? curr : prev);
      }))[0];

      return {
        cut: [itemToTake2],
        win: items.filter(item => item.assetid !== itemToTake2.assetid),
        cutAmount: itemToTake2.price,
        winAmount: sum(items.filter(item => item.assetid !== itemToTake2.assetid), 'price'),
        idealCutAmount: idealCutValue
      }
    }

    // scenario 3
    console.log('scenario 3');
    
    return {
      cut: [itemToTake],
      win: items.filter(item => item.assetid !== itemToTake.assetid),
      cutAmount: itemToTake.price,
      winAmount: sum(items.filter(item => item.assetid !== itemToTake.assetid), 'price'),
      idealCutAmount: idealCutValue
    }
  }

  // fail-safe
  console.log('fail-safe');
  return {
    cut: [],
    win: items,
    cutAmount: 0,
    winAmount: totalValue,
    idealCutAmount: idealCutValue
  }
}






const test = getWinnerItems(items2);

console.log(`The game was worth a total of $${parseFloat(sum(items2, 'price')).toFixed(2)} and contained ${items2.length} items, the winner will get $${parseFloat(test.winAmount).toFixed(2)} and our cut is $${parseFloat(test.cutAmount).toFixed(2)} (ideal is $${parseFloat(test.idealCutAmount).toFixed(2)})`);
console.log(`Winner will get ${test.win.length} items worth $${parseFloat(test.winAmount).toFixed(2)}`, test.win.map(item => {
  return {name: item.name, price: parseFloat(item.price.toFixed(2))};
}));
console.log(`Our cut contains ${test.cut.length} items worth $${parseFloat(test.cutAmount).toFixed(2)}`, test.cut.map(item => {
  return {name: item.name, price: parseFloat(item.price.toFixed(2))};
}));