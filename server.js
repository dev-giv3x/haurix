const cors = require('cors');
const path = require('path');
const express = require('express');
const app = express();
const pool = require('./db');
app.use(cors());
app.use(express.json());

const SteamAccountManager = require('./controllers/steamClient');
const steamManager = new SteamAccountManager();

const jwt = require('jsonwebtoken');
const authMiddleware = require('./middlewares/authMiddleware');
const adminMiddleware = require('./middlewares/adminMiddleware');

const JWT_SECRET = 'X9f3$kd82j9Fjk1@Zl29Mmz#28vld02&nKd8';

const bcrypt = require('bcrypt');

app.post('/register', adminMiddleware, async (req, res) => {
  const { steam_id, login, password, is_admin = 0 } = req.body;

  if (!login || !password) {
    return res.status(422).json({ error: 'Заполните все поля' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      'INSERT INTO users (steam_id, login, password_hash, is_admin) VALUES (?, ?, ?, ?)',
      [steam_id, login, hashedPassword, is_admin]
    );

    res.json({ message: 'Пользователь зарегистрирован', userId: result.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      res.status(422).json({ error: 'Пользователь с таким login уже существует' });
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

app.post('/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE login = ?', [login]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = jwt.sign({ userId: user.id, login: user.login, is_admin: user.is_admin }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ message: 'Успешный вход', token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/steam/login', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { login, password, twoFactorCode } = req.body;

    if (!login || !password) {
      return res.status(400).json({ error: 'Логин и пароль обязательны' });
    }

    const credentials = {
      login,
      password,
      twoFactorCode,
    };

    await steamManager.login(userId, credentials);

    res.json({
      success: true,
      message: 'Запрос на вход в Steam отправлен',
      userId,
    });
  } catch (e) {
    console.error('Steam login error:', e);
    res.status(500).json({
      error: e.message,
      userId: req.userId,
    });
  }
});

app.post('/steam/confirm', authMiddleware, (req, res) => {
  const userId = req.userId;
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Код подтверждения обязателен' });
  }

  const confirmed = steamManager.confirmSteamGuard(userId, code);

  if (confirmed) {
    res.json({ success: true, message: 'Steam Guard код принят' });
  } else {
    res.status(400).json({ error: 'Нет ожидающего Steam Guard подтверждения' });
  }
});

app.post('/steam/start', authMiddleware, (req, res) => {
  try {
    const userId = req.userId;
    const { appIds } = req.body;

    if (!appIds || !Array.isArray(appIds)) {
      return res.status(400).json({ error: 'Укажите appIds (массив)' });
    }

    steamManager.startBoost(userId, appIds);

    res.json({
      success: true,
      message: 'Буст запущен',
      userId,
      appIds,
    });
  } catch (e) {
    res.status(500).json({
      error: e.message,
      details: 'Ошибка при запуске буста',
    });
  }
});

app.post('/steam/stop', authMiddleware, (req, res) => {
  try {
    const userId = req.userId;
    const account = steamManager.clients.get(userId);
    if (account && account.loggedIn) {
      account.client.gamesPlayed([]); // Остановить буст, передав пустой массив
      res.json({ message: 'Буст остановлен' });
    } else {
      res.status(400).json({ error: 'Аккаунт не авторизован или не найден' });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/status', authMiddleware, (req, res) => {
  const userId = req.userId;
  const account = steamManager.clients.get(userId);
  if (!account) {
    return res.status(404).json({ error: 'Аккаунт не найден' });
  }

  res.json({
    loggedIn: account.loggedIn,
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(3000, () => {
  console.log('Сервер запущен на http://localhost:3000');
});
