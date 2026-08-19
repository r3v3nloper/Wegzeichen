/* Kopiert marked und DOMPurify aus node_modules nach public/vendor.
   Grund derselbe wie bei Leaflet: kein CDN, damit die CSP bei 'self' bleibt
   und die App nicht von der Verfügbarkeit eines Fremdhosts abhängt.

   Kopiert werden die ESM-Builds — public/js/markdown.js importiert sie direkt
   als Modul, es gibt keinen Bündelschritt. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const MODULES = [
  {
    name: 'marked',
    from: path.join(ROOT, 'node_modules', 'marked', 'lib', 'marked.esm.js'),
    to: path.join(ROOT, 'public', 'vendor', 'marked', 'marked.esm.js'),
  },
  {
    name: 'dompurify',
    from: path.join(ROOT, 'node_modules', 'dompurify', 'dist', 'purify.es.mjs'),
    to: path.join(ROOT, 'public', 'vendor', 'dompurify', 'purify.es.mjs'),
  },
];

/* Die Builds verweisen am Dateiende auf ihre Sourcemap. Die wird nicht
   mitkopiert — sonst müsste sie in die Cache-Liste des Service Workers, nur
   damit die Entwicklerwerkzeuge keinen 404 melden. */
const SOURCE_MAP_COMMENT = /\r?\n\/\/# sourceMappingURL=\S*\s*$/;

function copyModule(module)
{
  if (!fs.existsSync(module.from))
  {
    console.error(`${module.name} nicht in node_modules gefunden `
      + '— zuerst "npm install" ausführen.');
    process.exit(1);
  }

  const code = fs.readFileSync(module.from, 'utf8').replace(SOURCE_MAP_COMMENT, '\n');
  fs.mkdirSync(path.dirname(module.to), { recursive: true });
  fs.writeFileSync(module.to, code);
  console.log(`${module.name} nach ${path.relative(process.cwd(), module.to)} kopiert.`);
}

MODULES.forEach(copyModule);
