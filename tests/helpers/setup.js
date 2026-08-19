/* Test-Bootstrap: MUSS als allererstes required werden (vor db/app/routes),
   damit die SQLite-DB in einem frischen Temp-Verzeichnis landet und
   JWT_SECRET gesetzt ist, bevor middleware/auth lädt. */
const fs = require('fs');
const os = require('os');
const path = require('path');

/* NODE_ENV=test verhindert, dass app.js die lokale .env lädt — Tests dürfen
   nicht von der Entwicklerkonfiguration abhängen und erst recht keine echten
   Anfragen an externe Dienste auslösen. */
process.env.NODE_ENV = 'test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wegzeichen-test-'));
process.env.JWT_SECRET = 'test-secret';
delete process.env.ADMIN_PASSWORD;
delete process.env.NOMINATIM_USER_AGENT;

/* Startet die echte Express-App auf einem ephemeren Port.
   Liefert base-URL, einen kleinen fetch-Wrapper und close(). */
function startTestServer()
{
  const app = require('../../app');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  async function req(method, urlPath, body, token)
  {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token)
    {
      opts.headers.Authorization = `Bearer ${token}`;
    }
    if (body !== undefined)
    {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(base + urlPath, opts);
    let data = null;
    try
    {
      data = await res.json();
    }
    catch
    {
      // Kein JSON-Body (z.B. HTML-Fallback oder Datei-Download)
    }
    return { status: res.status, data };
  }

  /* Multipart-Upload — für die Anhang-Tests. Übergeben wird ein Array von
     { field, filename, contentType, content }. */
  async function upload(urlPath, files, token)
  {
    const form = new FormData();
    files.forEach(f =>
    {
      const blob = new Blob([f.content], { type: f.contentType || 'application/octet-stream' });
      form.append(f.field || 'files', blob, f.filename);
    });
    const opts = { method: 'POST', body: form, headers: {} };
    if (token)
    {
      opts.headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(base + urlPath, opts);
    let data = null;
    try
    {
      data = await res.json();
    }
    catch
    {
      // Kein JSON-Body
    }
    return { status: res.status, data };
  }

  /* Rohzugriff für Downloads, bei denen Header und Bytes geprüft werden */
  async function raw(urlPath, token)
  {
    const opts = { headers: {} };
    if (token)
    {
      opts.headers.Authorization = `Bearer ${token}`;
    }
    return fetch(base + urlPath, opts);
  }

  return { base, req, upload, raw, close: () => new Promise(r => server.close(r)) };
}

/* Legt einen Nutzer an und liefert Token samt Nutzerobjekt.
   Der Suffix hält die E-Mail über mehrere Aufrufe hinweg eindeutig. */
async function registerUser(srv, suffix)
{
  const res = await srv.req('POST', '/api/auth/register', {
    username: `user${suffix}`,
    email: `user${suffix}@example.com`,
    password: 'geheim123',
  });
  return { token: res.data.token, user: res.data.user, status: res.status };
}

/* Legt einen Nutzer an und macht ihn zum Administrator.

   Über die Datenbank statt über die App: `db.js` sät einen Admin nur, wenn
   ADMIN_PASSWORD gesetzt ist — und genau das löscht dieses Setup oben, damit
   Tests nicht von der Umgebung des Entwicklers abhängen. Einen Weg, sich selbst
   zum Admin zu machen, gibt es in der API bewusst nicht.

   `middleware/admin.js` liest `is_admin` bei jeder Anfrage frisch, der Token
   aus der Registrierung bleibt also gültig. */
async function registerAdmin(srv, suffix)
{
  const admin = await registerUser(srv, suffix);
  const db = require('../../db');
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(admin.user.id);
  return admin;
}

module.exports = { startTestServer, registerUser, registerAdmin };
