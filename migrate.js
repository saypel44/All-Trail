const Database = require('better-sqlite3');
const db = new Database('qt.sqlite');

const cols = [
  "ALTER TABLE logs ADD COLUMN habit_id TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE logs ADD COLUMN habit_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE logs ADD COLUMN habit_icon TEXT",
  "ALTER TABLE logs ADD COLUMN duration REAL",
  "ALTER TABLE logs ADD COLUMN unit TEXT",
  "ALTER TABLE logs ADD COLUMN display_unit TEXT",
  "ALTER TABLE logs ADD COLUMN start_time TEXT",
  "ALTER TABLE logs ADD COLUMN end_time TEXT",
  "ALTER TABLE logs ADD COLUMN note TEXT",
  "ALTER TABLE alarms ADD COLUMN date TEXT",
  "ALTER TABLE alarms ADD COLUMN notes TEXT",
];

cols.forEach(sql => {
  try {
    db.exec(sql);
    console.log('OK:', sql.split('ADD COLUMN')[1].trim().split(' ')[0]);
  } catch (e) {
    if (e.message.includes('duplicate column')) {
      console.log('Already exists — skipping');
    } else {
      console.log('Error:', e.message);
    }
  }
});

console.log('\nMigration complete. Run: node server.js');