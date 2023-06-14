const fetch = require('node-fetch');
const fs = require('fs');

// const toInclude = [
//   8389, // pepe pack
//   4072, // better ttv 1
//   6205, // better ttv 2
//   5647, // sadge pepe
//   7956, // shiba pack 2
//   5410, // shiba pack 3
// ];
const toInclude = [
  2134,
  8572,
  9188
]

let finalList = [];

fetch('https://emoji.gg/api/packs').then(res => res.json()).then(data => {
  data = data.filter(x => toInclude.includes( parseInt( x.slug.split('-')[0] ) ));

  data.forEach(l => {
    let list = [];
    l.emojis.forEach(emoji => {
      const splitt = emoji.replaceAll('-', '_').split('_');
      const name = (splitt[1] || splitt[0]).split('.')[0];
      
      if(!list.map(x => x.name).includes(name) && !finalList.map(x => x.name).includes(name)) {
        // console.log(`Adding emoji :${name}: from pack ${l.slug.split('-')[0]} (${list.map(x => x.name).includes(name)})`);
        list.push({
          name: name,
          url: emoji
        });
      }
    });

    list = [...new Set(list)];
    finalList = [...finalList, ...list];

    console.log(`Added ${list.length} emojis from pack ${l.slug.split('-')[0]} (${l.emojis.length} available)`);
  });

  fs.writeFileSync('./.cache/emojis.json', JSON.stringify(finalList));
});