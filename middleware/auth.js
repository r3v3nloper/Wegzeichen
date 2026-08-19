const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET)
{
  throw new Error('JWT_SECRET Umgebungsvariable muss gesetzt sein');
}

function signToken(userId, tokenVersion)
{
  return jwt.sign({ userId, tv: tokenVersion || 0 }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next)
{
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
  {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2)
  {
    return res.status(401).json({ error: 'Nicht autorisiert' });
  }

  try
  {
    const decoded = jwt.verify(parts[1], JWT_SECRET);

    // Token-Version prüfen: Passwortänderung/-reset erhöht sie und
    // macht damit alle zuvor ausgestellten Tokens ungültig
    const user = db.prepare('SELECT token_version FROM users WHERE id = ?').get(decoded.userId);
    if (!user || (decoded.tv || 0) !== (user.token_version || 0))
    {
      return res.status(401).json({ error: 'Ungültiger Token' });
    }

    req.userId = decoded.userId;
    next();
  }
  catch
  {
    return res.status(401).json({ error: 'Ungültiger Token' });
  }
}

authMiddleware.JWT_SECRET = JWT_SECRET;
authMiddleware.signToken = signToken;
module.exports = authMiddleware;
