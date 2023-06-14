const fs = require('fs');
const archiver = require('archiver');
const database = require('../interfaces/database');
const { isProd } = require('../helpers');

// const TABLES = JSON.parse(fs.readFileSync('./.cache/tables.json'));
const TABLES = [
  "users",
  "chat_messages",
  "steam_items",
  "transactions",
  "tf2_jackpot_rounds",
  "coinflip_games",
  "mines_games"
];
const BACKUP_INTERVAL = 8; // in hours

const zipDirectory = (source, out) => {
  const archive = archiver('zip', { zlib: { level: 9 }});
  const stream = fs.createWriteStream(out);

  return new Promise((resolve, reject) => {
    archive
      .directory(source, false)
      .on('error', err => reject(err))
      .pipe(stream)
    ;

    stream.on('close', () => resolve());
    archive.finalize();
  });
}

const backupTable = async (name, metadata) => {
  const result = await database.get(name);
  // const alerts_ = await r.db(config.database.name).table(name).run(conn).then(cursor => {
    // cursor.toArray((err, result) => {

      fs.writeFile(`./.backups/temp/tf2double_${name}.json`, JSON.stringify(result), 'utf8', err => {
        if(err) return console.log(`Couldn't save '${name}' table to file`);

        metadata.tables[name] = result.length;

        // console.log(`Backed up ${result.length} record${result.length == 1 ? '' : 's'} from '${name}' table`);
      });

    // });
  // });
}

const createBackup = async () => {
  console.log(`Starting a backup... (${new Date()})`);

  try {
    let now = Math.round(+new Date() / 1000);
    let title = `tf2double_${now}.zip`;
    let metadata = {
      title,
      time: now,
      tables: {}
    };

    if(!fs.existsSync('./.backups/temp')) {
      fs.mkdirSync('./.backups/temp');
    }

    // todo: backup logs aswell
    for(let i in TABLES) {
      await backupTable(TABLES[i], metadata);
    }
    // fs.copyFile('./logs/combined.log', `./backups/temp/logs.log`, async (err) => {
      // if(err) throw err;

      // fs.writeFile('./logs/combined.log', `IMPORTANT: Logs have been cleared by automatic backup. (${new Date()})` + "\n", 'utf8', function (err) {
        // if(err) throw err;

        await zipDirectory('./.backups/temp', `./.backups/${title}`);
        fs.writeFileSync(`./.backups/${title.split('.')[0]}.metadata`, JSON.stringify(metadata, null, 2));
        fs.writeFileSync(`./.backups/latest.json`, JSON.stringify(metadata, null, 2));

        console.log(`Backup completed! Saved as ${title}`);
      // });
    // });


    // await fs.rmdirSync('./backups/temp', { recursive: true });
    /*await fs.unlink(`./backups/temp/tf2double_${tables[0]}.json`);
    await fs.unlink(`./backups/temp/tf2double_${tables[1]}.json`);
    await fs.unlink(`./backups/temp/tf2double_${tables[2]}.json`);
    await fs.unlink(`./backups/temp/tf2double_${tables[3]}.json`);
    await fs.unlink(`./backups/temp/tf2double_${tables[4]}.json`);
    await fs.unlink(`./backups/temp/tf2double_${tables[5]}.json`);
    await fs.unlink(`./backups/temp/tf2double_${tables[6]}.json`);
    await fs.unlink(`./backups/temp/tf2double_${tables[7]}.json`);
    await fs.rmdirSync('./backups/temp', { recursive: true });*/

    // console.log(`Backup completed! Saved as ${title}`);
    // process.exit(0);

  } catch(e) {
    console.log(`Couldn't make a backup: ${e.message}`);
    console.log(e);
  }
};

const schedule = async () => {
  if(!isProd) return;
  
  createBackup();
  const intrv = setInterval(createBackup, BACKUP_INTERVAL * (3600 * 1000));
}

module.exports = {
  createBackup: createBackup,
  scheduleBackup: schedule
}

// _();