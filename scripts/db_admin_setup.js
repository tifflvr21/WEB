const r = require('rethinkdb')
r.connect({ host: 'localhost', port: 28015 }, function(err, conn) {
  if(err) throw err;

  
  r.db('rethinkdb').table('users').insert({id: 'hxtnv', password: '$dcTrArC0JMx#xqe3$SgZF02'}).run(conn, function(err, res) {
    if(err) throw err;
    console.log(res);

    
    r.grant('hxtnv', {read: true, write: true, config: true}).run(conn, function(err2, res2) {
      if(err2) throw err2;
      console.log(res2);

      process.exit(1);
    });
  });
});