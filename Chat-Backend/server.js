const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sql = require('mssql');
const messagesRoute = require('./routes/messages');

// ------- App Setup -------
const app = express();
const port = 3000;

const bcrypt = require('bcrypt');

app.use(cors());
app.use(bodyParser.json());
app.use(messagesRoute);

// ------- SQL Server Configuration -------
const sqlConfig = {
  user: 'Ruan',
  password: 'Ru@n#124',
  server: '192.168.50.241',
  database: 'React-Messages',
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// ------- Connect to SQL Server -------
sql.connect(sqlConfig)
  .then(() => {
    console.log('Connected to SQL Server');
  })
  .catch(err => {
    console.error('SQL Connection Error: ', err);
  });

// ------- USER TOKENS -------
const { v4: uuidv4 } = require('uuid');
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// ------- Create Tables -------
async function createMessagesTable() {
  try {
    const query = `
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Messages')
      Create TABLE  Messages (
        id INT IDENTITY(1,1) PRIMARY KEY,
        sender_id INT,
        receiver_id INT,
        message NVARCHAR(MAX),
        timestamp DATETIME,
        FOREIGN KEY (sender_id) REFERENCES Users(id),
        FOREIGN KEY (receiver_id) REFERENCES Users(id)
      );
    `;
    await sql.query(query);
    console.log('Messages table created or already exists');
  } catch (err) {
    console.error('Error creating Messages table:', err);
  }
}

createMessagesTable();


// -------- access endpoint ---------
app.get('/', (req, res) => {
  res.send('Server is running');
});
// ------- Registration Endpoint -------
app.post('/register', async (req, res) => {
  const { name, email } = req.body;
  const userAgent = req.headers['user-agent'] || 'unknown';
  const rememberToken = uuidv4();
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  try {
    // Insert user
    //const hashedPassword = await bcrypt.hash(password, 10);
    const insertUser = new sql.Request();
    insertUser.input('name', sql.VarChar, name);
    insertUser.input('email', sql.VarChar, email);
    //insertUser.input('password', sql.VarChar, hashedPassword);
    await insertUser.query(`
      INSERT INTO dbo.[users] (name, Email)
      VALUES (@name, @email)
    `);

    // Get user ID
    const userRequest = new sql.Request();
    userRequest.input('email', sql.VarChar, email);
    const userResult = await userRequest.query(`
      SELECT UserID FROM dbo.[users] WHERE Email = @email
    `);
    const userId = userResult.recordset[0].UserID;

    // Insert token
    const tokenRequest = new sql.Request();
    tokenRequest.input('userId', sql.Int, userId);
    tokenRequest.input('token', sql.VarChar, rememberToken);
    tokenRequest.input('userAgent', sql.VarChar, userAgent);
    tokenRequest.input('expiry', sql.DateTime, expiryDate);
    await tokenRequest.query(`
      INSERT INTO dbo.[User_tokens] (user_id, token, user_agent, expiry)
      VALUES (@userId, @token, @userAgent, @expiry)
    `);

    // Set cookie
    res.cookie('remember_token', rememberToken, {
      httpOnly: true,
      secure: false,
      expires: expiryDate,
    });

    res.status(200).json({ token: rememberToken, userID: userId, name, email });
  } catch (err) {
    console.error('Registration error1:', err);
    res.status(500).send(`Error during registration: ${err.message}`);
  }
});

// ------- Login Endpoint -------
app.post('/login', async (req, res) => {
  console.log('POST /login: Request received');
  const { email, name } = req.body;
  const userAgent = req.headers['user-agent'] || 'unknown';
  console.log('POST /login: Request body:', { email, name, userAgent });

  try {
    // Validate input
    console.log('POST /login: Validating input');
    if (!email || !name) {
      console.log('POST /login: Missing email or name');
      return res.status(400).json({ error: 'Email and name are required' });
    }
    console.log('POST /login: Input validated');

    // Check if user exists
    console.log('POST /login: Querying user in dbo.[users]');
    const userRequest = new sql.Request();
    userRequest.input('email', sql.VarChar, email);
    userRequest.input('name', sql.VarChar, name);
    const userResult = await userRequest.query(`
      SELECT UserID, name, Email
      FROM dbo.[users]
      WHERE Email = @email AND name = @name
    `);
    console.log('POST /login: User query result:', userResult.recordset);

    if (userResult.recordset.length === 0) {
      console.log('POST /login: No user found for provided email and name');
      return res.status(401).json({ error: 'Invalid email or name' });
    }

    const user = userResult.recordset[0];
    console.log('POST /login: User found:', { UserID: user.UserID, name: user.name, Email: user.Email });

    // Check for existing valid token
    console.log('POST /login: Checking for existing token in dbo.[User_tokens]');
    const tokenRequest = new sql.Request();
    tokenRequest.input('userId', sql.Int, user.UserID);
    const tokenResult = await tokenRequest.query(`
      SELECT token
      FROM dbo.[User_tokens]
      WHERE user_id = @userId AND expiry > GETDATE()
    `);
    console.log('POST /login: Existing token query result:', tokenResult.recordset);

    if (tokenResult.recordset.length > 0) {
      const existingToken = tokenResult.recordset[0].token;
      console.log('POST /login: Found existing valid token:', existingToken);
      res.cookie('remember_token', existingToken, {
        httpOnly: true,
        secure: false, // Set to true in production with HTTPS
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      console.log('POST /login: Set cookie with existing token');
      return res.status(200).json({
        token: existingToken,
        userID: user.UserID,
        name: user.name,
        email: user.Email,
      });
    }

  function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const tokenRequest = new sql.Request();
  tokenRequest.input('token', sql.VarChar, token);
  tokenRequest.query(`
    SELECT user_id
    FROM dbo.[User_tokens]
    WHERE token = @token AND expiry > GETDATE()
  `)
    .then(result => {
      if (result.recordset.length === 0) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }
      req.userId = result.recordset[0].user_id;
      next();
    })
    .catch(err => {
      console.error('Token check error:', err);
      res.status(500).json({ error: 'Token validation failed' });
    });
}

    // Generate new token
    console.log('POST /login: No valid token found, generating new token');
    const rememberToken = uuidv4();
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    console.log('POST /login: New token generated:', rememberToken);

    const insertTokenRequest = new sql.Request();
    insertTokenRequest.input('userId', sql.Int, user.UserID);
    insertTokenRequest.input('token', sql.VarChar, rememberToken);
    insertTokenRequest.input('userAgent', sql.VarChar, userAgent);
    insertTokenRequest.input('expiry', sql.DateTime, expiryDate);
    await insertTokenRequest.query(`
      INSERT INTO dbo.[User_tokens] (user_id, token, user_agent, expiry)
      VALUES (@userId, @token, @userAgent, @expiry)
    `);
    console.log('POST /login: New token inserted into dbo.[User_tokens]');

    res.cookie('remember_token', rememberToken, {
      httpOnly: true,
      secure: false,
      expires: expiryDate,
    });
    console.log('POST /login: Set cookie with new token');

    const response = {
      token: rememberToken,
      userID: user.UserID,
      name: user.name,
      email: user.Email,
    };
    console.log('POST /login: Sending response:', response);
    res.status(200).json(response);
  } catch (err) {
    console.error('POST /login: Error:', err.message, err.stack);
    res.status(500).json({ error: `Error during login: ${err.message}` });
  }
  console.log('POST /login: Request processing complete');
});

// ------- Get User Endpoint -------
app.get('/user', async (req, res) => {
  const token = req.headers.authorization?.split('Bearer ')[1] || req.body.token;
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const userRequest = new sql.Request();
    userRequest.input('token', sql.VarChar, token);
    const userResult = await userRequest.query(`
      SELECT u.UserID, u.name, u.Email
      FROM dbo.[users] u
      JOIN dbo.[User_tokens] ut ON u.UserID = ut.user_id
      WHERE ut.token = @token AND ut.expiry > GETDATE()
    `);
    if (userResult.recordset.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const user = userResult.recordset[0];
    res.status(200).json({
      userID: user.UserID,
      name: user.name,
      email: user.Email,
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// ------- Search Endpoint -------
app.get('/search', async (req, res) => {
  const query = req.query.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  try {
    const request = new sql.Request();
    request.input('query', sql.VarChar, `%${query}%`);
    
    const result = await request.query(`
      SELECT UserID, name, Email
      FROM dbo.[users]
      WHERE name LIKE @query OR Email LIKE @query
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'An error occurred while searching' });
  }
});

// ------- Verify Token Endpoint -------
app.post('/verify-token', async (req, res) => {
  const token = req.body.token;

  if (!token) {
    return res.status(400).json({ valid: false, message: 'No token provided' });
  }

  try {
    const tokenCheck = new sql.Request();
    tokenCheck.input('token', sql.VarChar, token);
    const result = await tokenCheck.query(`
      SELECT * FROM dbo.[User_tokens]
      WHERE token = @token AND expiry > GETDATE()
    `);

    if (result.recordset.length > 0) {
      res.status(200).json({ valid: true });
    } else {
      res.status(401).json({ valid: false, message: 'Invalid or expired token' });
    }
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(500).json({ valid: false, message: err.message });
  }
});

//  Get messages for a user pair
app.get('/messages', async (req, res) => {
  const { user_id, chat_partner_id, last_id = 0 } = req.query;
  try {
    const result = await sql.query`
      SELECT id, sender_id, receiver_id, message, timestamp
      FROM Messages
      WHERE id > ${last_id}
      AND (
        (sender_id = ${user_id} AND receiver_id = ${chat_partner_id})
        OR (sender_id = ${chat_partner_id} AND receiver_id = ${user_id})
      )
      ORDER BY timestamp asc;
    `;
    res.json(result.recordset);
    console.log("Fetching messages with", { user_id, chat_partner_id, last_id });
  } catch (err) {
    console.error('Message fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /messages
app.post('/messages', async (req, res) => {
  const { sender_id, receiver_id, message, timestamp } = req.body;

  if (!sender_id || !receiver_id || !message || !timestamp) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const existing = await sql.query`
      SELECT id, sender_id, receiver_id, message, timestamp
      FROM dbo.Messages
      WHERE sender_id = ${sender_id}
      AND receiver_id = ${receiver_id}
      AND message = ${message}
      AND timestamp = ${timestamp}
    `;

    if (existing.recordset && existing.recordset.length > 0) {
      return res.status(200).json(existing.recordset[0]);
    }

    const result = await sql.query`
      INSERT INTO dbo.Messages (sender_id, receiver_id, message, timestamp)
      OUTPUT INSERTED.id, INSERTED.sender_id, INSERTED.receiver_id, INSERTED.message, INSERTED.timestamp
      VALUES (${sender_id}, ${receiver_id}, ${message}, ${timestamp})
    `;

    if (result.recordset && result.recordset.length > 0) {
      res.status(201).json(result.recordset[0]);
    } else {
      throw new Error('Failed to retrieve inserted message');
    }
  } catch (err) {
    console.error('Message insert error:', err);
    res.status(500).json({ error: 'Failed to insert message' });
  }
});


// Polling endpoint for new messages

app.post('/messages/new', async (req, res) => {
  console.log('POST /messages/new: Request received');
  const { lastTimestamp, userId } = req.body;
  const token = req.headers.authorization?.split('Bearer ')[1];
  console.log('POST /messages/new: Request body:', { lastTimestamp, userId }, 'Token:', token);

  try {
    // Validate input
    if (!lastTimestamp || !userId || !token) {
      console.log('POST /messages/new: Missing required fields');
      return res.status(400).json({ error: 'lastTimestamp, userId, and token are required' });
    }

    // Verify token
    console.log('POST /messages/new: Verifying token');
    const tokenRequest = new sql.Request();
    tokenRequest.input('token', sql.VarChar, token);
    tokenRequest.input('userId', sql.Int, userId);
    const tokenResult = await tokenRequest.query(`
      SELECT user_id
      FROM dbo.[User_tokens]
      WHERE token = @token AND user_id = @userId AND expiry > GETDATE()
    `);
    console.log('POST /messages/new: Token query result:', tokenResult.recordset);

    if (tokenResult.recordset.length === 0) {
      console.log('POST /messages/new: Invalid or expired token');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Fetch new messages
    console.log('POST /messages/new: Fetching new messages');
    const messagesRequest = new sql.Request();
    messagesRequest.input('recipientId', sql.Int, userId);
    messagesRequest.input('lastTimestamp', sql.DateTime, new Date(lastTimestamp));
    const messagesResult = await messagesRequest.query(`
      SELECT m.id, m.sender_id, m.receiver_id, m.Message, m.Timestamp, u.name
      FROM dbo.Messages m
      JOIN dbo.[users] u ON m.sender_id = u.UserID
      WHERE m.receiver_id = @recipientId AND m.Timestamp > @lastTimestamp
      ORDER BY m.Timestamp ASC
    `);
    console.log('POST /messages/new: Messages query result:', messagesResult.recordset);

    res.status(200).json(messagesResult.recordset);
  } catch (err) {
    console.error('POST /messages/new: Error:', err.message, err.stack);
    res.status(500).json({ error: `Error fetching messages: ${err.message}` });
  }
  console.log('POST /messages/new: Request processing complete');
});


// ------- Start Server -------
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));

