const jwt = require('jsonwebtoken');
const SECRET_KEY = 'X9f3$kd82j9Fjk1@Zl29Mmz#28vld02&nKd8';

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    
    // Добавляем проверку наличия userId в токене
    if (!decoded.userId) {
      return res.status(401).json({ error: 'Токен не содержит userId' });
    }
    
    // Явно добавляем userId в запрос
    req.userId = decoded.userId;
    req.user = decoded;
    
    // Для отладки
    console.log('Authenticated user ID:', decoded.userId);
    
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Невалидный токен' });
  }
}

module.exports = authMiddleware; 