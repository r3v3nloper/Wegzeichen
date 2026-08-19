const db = require('../db');
const authMiddleware = require('./auth');

module.exports = (req, res, next) =>
{
  authMiddleware(req, res, () =>
  {
    const user = db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.userId);
    if (!user || !user.is_admin)
    {
      return res.status(403).json({ error: 'Kein Admin-Zugriff' });
    }
    next();
  });
};
