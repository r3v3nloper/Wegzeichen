/* Gemeinsame Eingabeprüfung für alle Routen.
   Die Funktionen werfen bei ungültiger Eingabe eine ValidationError; die
   Fehler-Middleware in app.js übersetzt sie zu einem 400 mit deutscher Meldung.
   Dadurch bleiben die Routen frei von Verschachtelung (§2.10) und die
   Fehlertexte an einer Stelle (§2.9). */

const { isValidCountryCode } = require('./countries');

class ValidationError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = 'ValidationError';
  }
}

function fail(message)
{
  throw new ValidationError(message);
}

/* Leerstring, null und undefined gelten einheitlich als „nicht angegeben“ */
function isBlank(raw)
{
  return raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
}

function requiredText(raw, label, maxLength)
{
  if (isBlank(raw))
  {
    fail(`${label} ist erforderlich`);
  }
  const text = String(raw).trim();
  if (text.length > maxLength)
  {
    fail(`${label} darf maximal ${maxLength} Zeichen lang sein`);
  }
  return text;
}

function optionalText(raw, label, maxLength)
{
  if (isBlank(raw))
  {
    return null;
  }
  const text = String(raw).trim();
  if (text.length > maxLength)
  {
    fail(`${label} darf maximal ${maxLength} Zeichen lang sein`);
  }
  return text;
}

function optionalInt(raw, label, min, max)
{
  if (isBlank(raw))
  {
    return null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n))
  {
    fail(`${label} muss eine ganze Zahl sein`);
  }
  if (n < min || n > max)
  {
    fail(`${label} muss zwischen ${min} und ${max} liegen`);
  }
  return n;
}

function optionalNumber(raw, label, min, max)
{
  if (isBlank(raw))
  {
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n))
  {
    fail(`${label} muss eine Zahl sein`);
  }
  if (n < min || n > max)
  {
    fail(`${label} muss zwischen ${min} und ${max} liegen`);
  }
  return n;
}

function rating(raw)
{
  return optionalInt(raw, 'Bewertung', 1, 5);
}

/* Koordinaten werden als Paar geprüft: entweder beide oder keines.
   Ein halbes Paar wäre auf der Karte und in der Entfernungsrechnung unbrauchbar. */
function coordinates(rawLat, rawLng)
{
  const latBlank = isBlank(rawLat);
  const lngBlank = isBlank(rawLng);
  if (latBlank !== lngBlank)
  {
    fail('Breiten- und Längengrad müssen zusammen angegeben werden');
  }
  if (latBlank)
  {
    return { lat: null, lng: null };
  }
  return {
    lat: optionalNumber(rawLat, 'Breitengrad', -90, 90),
    lng: optionalNumber(rawLng, 'Längengrad', -180, 180),
  };
}

function countryCode(raw)
{
  if (isBlank(raw))
  {
    return null;
  }
  const code = String(raw).trim().toUpperCase();
  if (!isValidCountryCode(code))
  {
    fail('Unbekanntes Land');
  }
  return code;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function optionalIsoDate(raw, label)
{
  if (isBlank(raw))
  {
    return null;
  }
  const text = String(raw).trim();
  if (!ISO_DATE_RE.test(text))
  {
    fail(`${label} muss im Format JJJJ-MM-TT angegeben werden`);
  }
  // Fängt Scheindaten wie 2024-02-31 ab, die dem Muster entsprechen
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(text))
  {
    fail(`${label} ist kein gültiges Datum`);
  }
  return text;
}

function enumValue(raw, allowed, label, fallbackValue)
{
  if (isBlank(raw))
  {
    if (fallbackValue === undefined)
    {
      fail(`${label} ist erforderlich`);
    }
    return fallbackValue;
  }
  const text = String(raw).trim();
  if (!allowed.includes(text))
  {
    fail(`${label} muss einer von: ${allowed.join(', ')} sein`);
  }
  return text;
}

/* Nur http/https zulassen — javascript:- und data:-URLs wären im Frontend
   als Link ein XSS-Vektor */
function optionalUrl(raw, label, maxLength)
{
  const text = optionalText(raw, label, maxLength);
  if (text === null)
  {
    return null;
  }
  let parsed;
  try
  {
    parsed = new URL(text);
  }
  catch
  {
    fail(`${label} ist keine gültige URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
  {
    fail(`${label} muss mit http:// oder https:// beginnen`);
  }
  return text;
}

function boolFlag(raw)
{
  return raw === true || raw === 1 || raw === '1' || raw === 'true' ? 1 : 0;
}

/* ── Anmeldedaten ──────────────────────────────────────────────────────────
   Die Grenzen stehen hier und nicht in der Route, damit Registrierung und
   Profiländerung nicht auseinanderlaufen können. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_LENGTH = { min: 3, max: 50 };
const PASSWORD_LENGTH = { min: 6, max: 1000 };

/* Liefert die Adresse in Kleinschreibung zurück — sie ist der Anmeldeschlüssel
   und muss überall in derselben Form gespeichert und verglichen werden. */
function email(raw)
{
  if (isBlank(raw))
  {
    fail('E-Mail-Adresse ist erforderlich');
  }
  const text = String(raw).trim().toLowerCase();
  if (!EMAIL_RE.test(text))
  {
    fail('Ungültige E-Mail-Adresse');
  }
  return text;
}

function username(raw)
{
  if (isBlank(raw))
  {
    fail('Benutzername ist erforderlich');
  }
  const text = String(raw).trim();
  if (text.length < USERNAME_LENGTH.min || text.length > USERNAME_LENGTH.max)
  {
    fail(`Benutzername muss zwischen ${USERNAME_LENGTH.min} und `
      + `${USERNAME_LENGTH.max} Zeichen lang sein`);
  }
  return text;
}

/* `label` unterscheidet „Passwort" bei der Anmeldung von „Neues Passwort" beim
   Wechsel. Bewusst nicht über isBlank und ohne trim: Leerzeichen am Rand sind
   Teil des Passworts und dürfen weder verschwinden noch als „leer" gelten. */
function password(raw, label = 'Passwort')
{
  if (raw === undefined || raw === null || raw === '')
  {
    fail(`${label} ist erforderlich`);
  }
  const text = String(raw);
  if (text.length < PASSWORD_LENGTH.min || text.length > PASSWORD_LENGTH.max)
  {
    fail(`${label} muss zwischen ${PASSWORD_LENGTH.min} und `
      + `${PASSWORD_LENGTH.max} Zeichen lang sein`);
  }
  return text;
}

/* Für :id-Parameter — liefert null statt zu werfen, damit Routen mit 404
   antworten können statt mit 400 */
function parseIdParam(raw)
{
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = {
  ValidationError,
  fail,
  isBlank,
  requiredText,
  optionalText,
  optionalInt,
  optionalNumber,
  rating,
  coordinates,
  countryCode,
  optionalIsoDate,
  enumValue,
  optionalUrl,
  boolFlag,
  email,
  username,
  password,
  parseIdParam,
};
