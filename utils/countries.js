/* Länderliste und -namen kommen aus Intl.DisplayNames statt aus einer gepflegten
   Tabelle — dadurch gibt es genau eine Quelle für Codes und deutsche Namen,
   auf Server und Client identisch. */

const DISPLAY = new Intl.DisplayNames(['de'], { type: 'region', fallback: 'none' });

/* Intl liefert neben Ländern auch Zusammenschlüsse und Sonderreservierungen,
   die als „Land“ in einer Reiseliste nichts zu suchen haben */
const NON_COUNTRIES = new Set([
  'AC', 'CP', 'DG', 'EA', 'EU', 'EZ', 'IC', 'TA', 'UN', 'QO', 'XA', 'XB', 'ZZ',
]);

const CODE_RE = /^[A-Z]{2}$/;

function isValidCountryCode(code)
{
  if (typeof code !== 'string' || !CODE_RE.test(code) || NON_COUNTRIES.has(code))
  {
    return false;
  }
  const name = DISPLAY.of(code);
  return !!name && name !== code;
}

function countryName(code)
{
  return isValidCountryCode(code) ? DISPLAY.of(code) : null;
}

/* Alle gültigen Codes mit deutschem Namen, alphabetisch nach Namen sortiert */
function listCountries()
{
  const out = [];
  for (let a = 65; a <= 90; a++)
  {
    for (let b = 65; b <= 90; b++)
    {
      const code = String.fromCharCode(a, b);
      const name = countryName(code);
      if (name)
      {
        out.push({ code, name });
      }
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, 'de'));
}

module.exports = { isValidCountryCode, countryName, listCountries };
