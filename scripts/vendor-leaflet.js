/* Kopiert Leaflet aus node_modules nach public/vendor/leaflet.
   Grund: die Karte darf nicht von einem CDN laden — sonst müsste die CSP
   Fremd-Hosts erlauben und die App wäre von deren Verfügbarkeit abhängig. */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'node_modules', 'leaflet', 'dist');
const DEST = path.join(__dirname, '..', 'public', 'vendor', 'leaflet');
const FILES = ['leaflet.js', 'leaflet.js.map', 'leaflet.css'];

if (!fs.existsSync(SRC))
{
  console.error('Leaflet nicht in node_modules gefunden — zuerst "npm install" ausführen.');
  process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });

FILES.forEach(name =>
{
  const from = path.join(SRC, name);
  if (fs.existsSync(from))
  {
    fs.copyFileSync(from, path.join(DEST, name));
  }
});

// Marker-Grafiken und Layer-Icons liegen in einem Unterordner, auf den
// leaflet.css relativ verweist — die Struktur muss erhalten bleiben
fs.cpSync(path.join(SRC, 'images'), path.join(DEST, 'images'), { recursive: true });

console.log(`Leaflet nach ${path.relative(process.cwd(), DEST)} kopiert.`);
