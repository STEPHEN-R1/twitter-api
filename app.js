const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const databasePath = path.join(__dirname, 'twitterClone.db')

const app = express()

app.use(express.json())

let database = null

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const validatePassword = password => {
  return password.length > 6
}
const authenticateToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.post('/register/', async (request, response) => {
  const {username, name, password, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await database.get(selectUserQuery)

  if (databaseUser === undefined) {
    const createUserQuery = `
     INSERT INTO
      user (name,username,password,gender)
     VALUES
      (
        
        '${name}',
       '${username}',
       '${hashedPassword}',
       '${gender}'
      );`
    if (validatePassword(password)) {
      const ans = await database.run(createUserQuery)

      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await database.get(selectUserQuery)

  if (databaseUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databaseUser.password,
    )
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      console.log('hi')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})
app.get('/user/following/', authenticateToken, async (request, response) => {
  const {username} = request
  const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
  const ans = await database.get(query)
  const userId = ans.userId
  const querys = `SELECT name  FROM user u JOIN follower f ON u.user_id=f.following_user_id WHERE f.follower_user_id=${userId}`
  const anss = await database.all(querys)
  response.send(anss)
})
app.get('/user/followers/', authenticateToken, async (request, response) => {
  const {username} = request
  const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
  const ans = await database.get(query)
  const userId = ans.userId
  const querys = `SELECT name  FROM user u JOIN follower f ON u.user_id=f.follower_user_id WHERE f.following_user_id=${userId}`
  const anss = await database.all(querys)
  response.send(anss)
})
app.get('/tweets/:tweetId/', authenticateToken, async (request, response) => {
  const {username} = request
  const {tweetId} = request.params
  const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
  const ans = await database.get(query)
  const userId = ans.userId
  const querys = `SELECT 1
            FROM tweet t
            JOIN follower f ON t.user_id = f.following_user_id
            WHERE t.tweet_id = ${tweetId} AND f.follower_user_id =${userId}`

  const anss = await database.all(querys)

  console.log(anss)
  console.log(anss.length === 0)
  if (anss.length === 0) {
    response.status(401)
    response.send('Invalid Request')
  } else {
    const sqlFetch = `
            SELECT t.tweet, COUNT(l.like_id) AS likes, COUNT(r.reply_id) AS replies, t.date_time AS dateTime
            FROM tweet t
            LEFT JOIN like l ON t.tweet_id = l.tweet_id
            LEFT JOIN reply r ON t.tweet_id = r.tweet_id
            WHERE t.tweet_id = ${tweetId}
            GROUP BY t.tweet_id
        `
    const tweet = await database.all(sqlFetch)
    const like = `SELECT COUNT(like_id) AS likes FROM like WHERE tweet_id=${tweetId}`
    const l = await database.get(like)
    const reply = `SELECT COUNT(reply_id) AS reply FROM reply WHERE tweet_id=${tweetId}`
    const r = await database.get(reply)
    response.send({
      tweet: tweet[0].tweet,
      likes: l.likes,
      replies: r.reply,
      dateTime: tweet[0].dateTime,
    })
  }
})
app.get('/user/tweets/feed/', authenticateToken, async (request, response) => {
  const {username} = request
  const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
  const ans = await database.get(query)
  const userId = ans.userId
  const querys = `SELECT u.username,t.tweet, t.date_time as dateTime
            FROM tweet t
            JOIN follower f ON t.user_id = f.following_user_id
            JOIN user u ON t.user_id = u.user_id
            WHERE f.follower_user_id = ${userId}
            ORDER BY t.date_time DESC
            LIMIT 4`
  const anss = await database.all(querys)
  response.send(anss)
})
const start = item => {
  const hello = []
  item.map(like => hello.push(like.likes))
  return {likes: hello}
}
app.get(
  '/tweets/:tweetId/likes/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
    const ans = await database.get(query)
    const userId = ans.userId
    const querys = `SELECT 1
            FROM tweet t
            JOIN follower f ON t.user_id = f.following_user_id
            WHERE t.tweet_id = ${tweetId} AND f.follower_user_id = ${userId}`

    const anss = await database.all(querys)
    if (anss.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const sqlFetch = `
            SELECT u.username AS likes
            FROM like l
            JOIN user u ON l.user_id = u.user_id
            WHERE l.tweet_id = ${tweetId}
        `
      const tweet = await database.all(sqlFetch)
      response.send(start(tweet))
    }
  },
)
app.get(
  '/tweets/:tweetId/replies/',
  authenticateToken,
  async (request, response) => {
    const {username} = request
    const {tweetId} = request.params
    const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
    const ans = await database.get(query)
    const userId = ans.userId
    const querys = `SELECT 1
            FROM tweet t
            JOIN follower f ON t.user_id = f.following_user_id
            WHERE t.tweet_id = ${tweetId} AND f.follower_user_id = ${userId}`

    const anss = await database.all(querys)
    if (anss.length === 0) {
      response.status(401)
      response.send('Invalid Request')
    } else {
      const sqlFetch = `
            SELECT u.name ,r.reply
            FROM reply r
            JOIN user u ON r.user_id = u.user_id
            WHERE r.tweet_id = ${tweetId}
        `
      const tweet = await database.all(sqlFetch)
      response.send({replies: tweet})
    }
  },
)
app.get('/user/tweets/', authenticateToken, async (request, response) => {
  const {username} = request

  const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
  const ans = await database.get(query)
  const userId = ans.userId
  const sql = `
        SELECT t.tweet, COUNT(l.like_id) AS likes, COUNT(r.reply_id) AS replies, t.date_time as dateTime
    FROM tweet t
    LEFT JOIN like l ON t.tweet_id = l.tweet_id
    LEFT JOIN reply r ON t.tweet_id = r.tweet_id
    WHERE t.user_id = ${userId}
    GROUP BY t.tweet_id
            
    `
  const list = await database.all(sql)
  response.send(list)
})
// api 9
app.post('/user/tweets/', authenticateToken, async (request, res) => {
  const {username} = request

  const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
  const ans = await database.get(query)
  const userId = ans.userId
  const {tweet} = request.body
  const sql = `INSERT INTO tweet (tweet, user_id, date_time) VALUES (?, ?, datetime('now'))`
  database.run(sql, [tweet, userId], function (err) {
    if (err) {
      console.error(err.message)
      return res.status(500).json({error: 'Server Error'})
    }
    res.status(201).json({message: 'Created a Tweet'})
  })
  res.send('Created a Tweet')
})
app.delete('/tweets/:tweetId/', authenticateToken, async (request, res) => {
  const {username} = request

  const query = `SELECT user_id as userId FROM user WHERE username="${username}"`
  const ans = await database.get(query)
  const userId = ans.userId
  const {tweetId} = request.params
  const sql = `SELECT * FROM tweet WHERE tweet_id = ${tweetId}`
  const anss = await database.get(sql)
  console.log(anss)
  if (anss.user_id === userId) {
    const ansss = database.run(
      'DELETE FROM tweet WHERE tweet_id = ? AND user_id = ?',
      [tweetId, userId],
      res.send('Tweet Removed'),
    )
  } else {
    res.status(401)
    res.send('Invalid Request')
  }
})

module.exports = app
