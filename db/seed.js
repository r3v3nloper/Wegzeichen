/* Erstanlage eines Administrators.

   Nur wenn ADMIN_PASSWORD gesetzt ist: ohne diese Bremse hätte jede
   Installation ein Konto mit vorhersehbarem Passwort. Über die API kann sich
   niemand selbst zum Admin machen, dieser Weg ist der einzige. */

const bcrypt = require('bcryptjs');

const DEFAULT_EMAIL = 'admin@wegzeichen.local';
const BCRYPT_ROUNDS = 10;

function seedAdmin(db)
{
  const email = process.env.ADMIN_EMAIL || DEFAULT_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!password)
  {
    return;
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists)
  {
    return;
  }

  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  db.prepare('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
    .run('admin', email, hash);
  console.log(`Admin-Benutzer angelegt (${email})`);
}

module.exports = { seedAdmin };
