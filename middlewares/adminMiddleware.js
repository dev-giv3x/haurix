const jwt = require('jsonwebtoken');
const db = require('../db'); 
const JWT_SECRET = 'X9f3$kd82j9Fjk1@Zl29Mmz#28vld02&nKd8'; 

async function adminMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;
    console.log('userId из токена:', userId);

    const [rows] = await db.query('SELECT is_admin FROM users WHERE id = ?', [userId]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    const user = rows[0];

    if (!user.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }

    req.user = { id: userId, is_admin: true };
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ error: 'Невалидный токен' });
  }
}

module.exports = adminMiddleware;
