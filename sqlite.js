import * as SQLite from 'expo-sqlite';

const database_name = "chatApp.db";
const database_version = "1.0";
const database_displayname = "Chat App Database";
const database_size = 200000;

let db;



export function openDatabase() {
  if (!db) {
    try {
      db = SQLite.openDatabaseSync(database_name);
      console.log('Database opened successfully:', database_name);
    } catch (error) {
      console.error('Failed to open database:', error);
      throw error;
    }
  }
  return db;
}

export async function checkMessageExists(serverMessageId) {
  if (!serverMessageId) return false;
  const db = openDatabase();
  const res = await executeSqlAsync(
    db,
    'SELECT 1 FROM messages WHERE serverMessageId = ? LIMIT 1;',
    [Number(serverMessageId)]
  );
  return res.rows.length > 0;
}

export function executeSqlAsync(db, sql, params = []) {
  try {
    const statement = db.prepareSync(sql);
    try {
      const result = statement.executeSync(params);
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        const rowsArray = result.getAllSync() || [];
        return {
          rows: {
            length: rowsArray.length,
            item: (i) => rowsArray[i],
            _array: rowsArray, // Match getUsers expectation
            raw: rowsArray, // Match createTable expectation
          },
        };
      }
      return {
        insertId: result.lastInsertRowId,
        changes: result.changes,
      };
    } catch (error) {
      console.error('SQL execution error:', { sql, params, error });
      throw error;
    } finally {
      try {
        statement.finalizeSync();
      } catch (finalizeError) {
        console.error('Error finalizing statement:', finalizeError);
      }
    }
  } catch (error) {
    console.error('SQL prepare error:', { sql, params, error });
    throw error;
  }
}

export async function createTable() {
  const db = openDatabase();
  try {

       //await executeSqlAsync(db, `DROP TABLE IF EXISTS messages;`);
   // await executeSqlAsync(db, `DROP TABLE IF EXISTS chat_users;`);
    //console.log('Dropped existing messages table');
    await executeSqlAsync(db,
      `CREATE TABLE IF NOT EXISTS chat_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userID INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        LatestMessage TEXT,
        LatestMessageTime DATETIME,
        state TEXT DEFAULT 'sent'
      );`
    );
    console.log('Created chat_users table');

    await executeSqlAsync(db,
      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderID INTEGER NOT NULL,
        receiverID INTEGER NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'sent',
        serverMessageId INTEGER
      );`
    );
    console.log('Created messages table');

    const tables = await executeSqlAsync(db, "SELECT name FROM sqlite_master WHERE type='table';");
    const tableNames = tables.rows.raw || [];
    console.log('Existing tables:', JSON.stringify(tableNames.map(t => t.name), null, 2));
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}



export async function insertUsers(user) {
  if (!user || !user.userID || !user.name) {
    console.warn("Skipping insert — invalid user data:", user);
    return;
  }

  const db = openDatabase();
  try {
    await executeSqlAsync(
      db,
      `INSERT OR IGNORE INTO chat_users 
        (userID, name, email, LatestMessage, LatestMessageTime)
       VALUES (?, ?, ?, ?, ?);`,
      [
        Number(user.userID),
        user.name,
        user.email || "",
        user.LatestMessage || "",
        user.LatestMessageTime || new Date().toISOString()
      ]
    );
    console.log('Inserted user:', user.userID);
  } catch (error) {
    console.error('Error inserting user:', error);
  }
}

export async function getUsers() {
  const db = openDatabase();
  try {
    const results = await executeSqlAsync(db, 'SELECT * FROM chat_users;');
    const users = results.rows._array || [];
    console.log('getUsers results:', JSON.stringify(users, null, 2));
    return users;
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

export async function insertMessages({
  senderID,
  receiverID,
  message,
  timestamp = new Date().toISOString(),
  status = 'sent',
  serverMessageId = null
}) {
  if (!senderID || isNaN(senderID)) throw new Error('senderID is required and must be a valid number');
  if (!receiverID || isNaN(receiverID)) throw new Error('receiverID is required and must be a valid number');
  if (!message || typeof message !== 'string' || message.trim() === '') throw new Error('Message is required');

  const db = openDatabase();
  const normalizedTimestamp = new Date(timestamp).toISOString().slice(0, 19) + 'Z';

  const existing = await executeSqlAsync(
    db,
    `SELECT id, serverMessageId FROM messages
     WHERE (serverMessageId = ? AND serverMessageId IS NOT NULL)
        OR (senderID = ? AND receiverID = ? AND message = ? AND timestamp LIKE ?);`,
    [serverMessageId, Number(senderID), Number(receiverID), message, normalizedTimestamp.slice(0, 19) + '%']
  );

  if (existing.rows.length > 0) {
    const row = existing.rows.item(0);
    if (serverMessageId && !row.serverMessageId) {
      await executeSqlAsync(db, `UPDATE messages SET serverMessageId = ? WHERE id = ?;`, [serverMessageId, row.id]);
    }
    return row.id;
  }

  const result = await executeSqlAsync(
    db,
    `INSERT INTO messages (senderID, receiverID, message, timestamp, status, serverMessageId)
     VALUES (?, ?, ?, ?, ?, ?);`,
    [Number(senderID), Number(receiverID), message, normalizedTimestamp, status, serverMessageId]
  );

  return result.lastInsertRowId;
}

export async function getMessagesByUser(currentUserID, chatPartnerID) {
  console.log('getMessagesByUser called with:', { currentUserID, chatPartnerID });
  const db = openDatabase();
  try {
    const results = await executeSqlAsync(
      db,
      `SELECT * FROM messages
       WHERE (senderID = ? AND receiverID = ?)
          OR (senderID = ? AND receiverID = ?)
       ORDER BY datetime(timestamp) asc, id ASC;`,
      [Number(currentUserID), Number(chatPartnerID), Number(chatPartnerID), Number(currentUserID)]
    );
    const messages = results.rows.raw || [];
    console.log('Messages retrieved from DB:', JSON.stringify(messages, null, 2));
    return messages;
  } catch (error) {
    console.error('Error getting messages:', error);
    return [];
  }
}

export async function upsertChatUser(userID, name, email, latestMessage = '', latestMessageTime = new Date().toISOString(), state = 'sent') {
  const db = openDatabase();
  console.log('upsertChatUser called with:', { userID, name, email, latestMessage, latestMessageTime, state });
  try {
    await executeSqlAsync(
      db,
      `INSERT INTO chat_users (userID, name, email, LatestMessage, LatestMessageTime, state)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(userID) DO UPDATE SET
         name = excluded.name,
         email = excluded.email,
         LatestMessage = excluded.LatestMessage,
         LatestMessageTime = excluded.LatestMessageTime,
         state = excluded.state;`,
      [
        Number(userID),
        name || 'Unknown',
        email || '',
        latestMessage,
        latestMessageTime,
        state,
      ]
    );
    console.log('upsertChatUser completed for userID:', userID);
  } catch (error) {
    console.error('Error upserting chat user:', error);
  }
}

export async function updateLatestMessage(userID, message, timestamp, state = 'sent') {
  const db = openDatabase();
  console.log('updateLatestMessage called with:', { userID, message, timestamp, state });
  try {
    const result = await executeSqlAsync(db,
      `UPDATE chat_users
       SET LatestMessage = ?, LatestMessageTime = ?, state = ?
       WHERE userID = ?;`,
      [message, timestamp, state, Number(userID)]
    );
    console.log('updateLatestMessage completed for userID:', userID, 'Changes:', result.changes);
  } catch (error) {
    console.error('Error updating latest message:', error);
  }
}

export async function getAllChatUsers() {
  const db = openDatabase();
  try {
    const results = await executeSqlAsync(db, `SELECT * FROM chat_users ORDER BY LatestMessageTime desc;`);
    console.log('getAllChatUsers result:', JSON.stringify(results.rows._array, null, 2));
    return results.rows._array;
  } catch (error) {
    console.error('Error getting all chat users:', error);
    return [];
  }
}

export async function insertOrUpdateUser(user) {
  const db = openDatabase();
  try {
    await executeSqlAsync(
      db,
      `INSERT OR IGNORE INTO chat_users (userID, name, email, LatestMessage, LatestMessageTime)
       VALUES (?, ?, ?, '', datetime('now'));`,
      [Number(user.UserID), user.Name, user.Email]
    );
    console.log('Inserted or updated user:', user.UserID);
  } catch (error) {
    console.error('Error inserting or updating user:', error);
  }
}

export async function removeEmptyUsers() {
  const db = openDatabase();
  try {
    await executeSqlAsync(db, `DELETE FROM chat_users WHERE userID IS NULL OR name IS NULL OR name = '';`);
    console.log('Removed empty users');
  } catch (error) {
    console.error('Error removing empty users:', error);
  }
}

export async function getAllMessages() {
  const db = openDatabase();
  try {
    const results = await executeSqlAsync(
      db,
      'SELECT * FROM messages ORDER BY id desc;'
    );
    return results.rows._array;
  } catch (error) {
    console.error('Error getting all messages:', error);
    return [];
  }
}

export const saveMessagesToDB = async (messages) => {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      messages.forEach(msg => {
        // Ensure your Messages table has a UNIQUE constraint on a server-side message ID if possible
        // to prevent duplicates, or handle it with INSERT OR IGNORE / REPLACE.
        // For simplicity, this is an INSERT. Consider adding an 'id_from_server' column.
        tx.executeSql(
          `INSERT INTO Messages (id, sender_id, receiver_id, message, timestamp) 
           VALUES (?, ?, ?, ?, ?) 
           ON CONFLICT(id) DO UPDATE SET 
           message=excluded.message, timestamp=excluded.timestamp`, // Example: Update if server ID conflicts
          [msg.id, msg.sender_id, msg.receiver_id, msg.message, msg.timestamp],
          () => {},
          (_, error) => {
            console.error('Error inserting message into DB:', msg.id, error);
            // Optionally, you could collect errors and reject outside the loop
          }
        );
      });
    }, 
    (error) => reject(error), 
    () => resolve());
  });
};

export async function resetDatabase() {
  const db = openDatabase();
  try {
    await executeSqlAsync(db, 'delete from messages ');
    await executeSqlAsync(db, 'delete from chat_users');

    await executeSqlAsync(db,
      `CREATE TABLE IF NOT EXISTS chat_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userID INTEGER UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        LatestMessage TEXT,
        LatestMessageTime DATETIME,
        state TEXT DEFAULT 'sent'
      );`
    );

    await executeSqlAsync(db,
      `CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        senderID INTEGER NOT NULL,
        receiverID INTEGER NOT NULL,
        message TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        status TEXT DEFAULT 'sent',
        serverMessageId INTEGER
      );`
    );
    console.log('Database reset successfully');
  } catch (error) {
    console.error('Error resetting database:', error);
    throw error;
  }
}

export async function getLatestMessageForUser(currentUserId, chatPartnerId) {
  const db = openDatabase(); // ✅ This will work with your setup
  const result = await executeSqlAsync(
    db,
     `SELECT message, datetime(timestamp, 'localtime') AS timestamp
     FROM messages
     WHERE (senderID = ? AND receiverID = ?)
        OR (senderID = ? AND receiverID = ?)
     ORDER BY datetime(timestamp) DESC, id DESC
     LIMIT 1`,
    [currentUserId, chatPartnerId, chatPartnerId, currentUserId]
  );

  if (result.rows.length > 0) {
    console.log('Latest message for user:', result.rows.item(0));
    return result.rows.item(0);
  }
  return null;
}

