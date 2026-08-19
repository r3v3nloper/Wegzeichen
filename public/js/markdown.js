/* =====================================================
   Wegzeichen – markdown.js
   Markdown zu HTML (gesäubert) und Markdown zu reinem Text

   Notizinhalte sind Markdown. Gerendert wird mit marked, gesäubert mit
   DOMPurify — beide liegen vendort in public/vendor, damit die CSP bei 'self'
   bleibt. Kein anderes Modul darf Notizinhalt als HTML einsetzen: hier ist die
   einzige Stelle, an der aus Nutzertext Markup wird.
   ===================================================== */
import { marked } from '../vendor/marked/marked.esm.js';
import DOMPurify from '../vendor/dompurify/purify.es.mjs';

/* breaks: in einer Notiz ist ein Zeilenumbruch als Umbruch gemeint, nicht als
   Fortsetzung des Absatzes — CommonMark verlangt sonst zwei Leerzeichen.
   gfm: Tabellen, Aufgabenlisten und ~~durchgestrichen~~. */
marked.use({
  gfm: true,
  breaks: true,
  renderer: {
    /* Verweise verlassen die App, deshalb neuer Tab. `noopener` verhindert,
       dass die Zielseite über window.opener auf die App zugreift. */
    link({ href, title, tokens })
    {
      const text = this.parser.parseInline(tokens);
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

/* Positivliste statt Sperrliste: alles, was Markdown erzeugen kann, und nichts
   darüber hinaus. Damit fällt auch rohes HTML im Notiztext weg — <script>,
   <iframe>, Event-Attribute und Formulare gibt es hier nicht. */
const SANITIZE_OPTIONS = {
  ALLOWED_TAGS: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr', 'blockquote', 'pre', 'code',
    'strong', 'em', 'del', 'ul', 'ol', 'li',
    'a', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    // Aufgabenlisten von GFM: <input type="checkbox" disabled>
    'input',
  ],
  ALLOWED_ATTR: [
    'href', 'title', 'target', 'rel', 'src', 'alt',
    'start', 'type', 'checked', 'disabled', 'align',
  ],
  ALLOW_DATA_ATTR: false,

  /* Erlaubte Schemata: DOMPurifys Standard, aber ohne ftp, sms, cid, xmpp und
     matrix — mehr braucht eine Notiz nicht.

     Die beiden hinteren Zweige sind Pflicht, nicht Bequemlichkeit: DOMPurify
     prüft mit diesem Ausdruck *jeden* Attributwert, nicht nur Adressen. Ohne
     sie fielen `target="_blank"` und `type="checkbox"` durch, weil sie kein
     Schema tragen. Ein `javascript:`-Verweis scheitert weiterhin, weil auf die
     Buchstaben unmittelbar ein Doppelpunkt folgt. */
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
};

/* Nur marked, ohne Säuberung — getrennt, damit die Konfiguration ohne DOM
   prüfbar ist. Nach außen ist ausschließlich renderMarkdown sicher. */
export function markdownToHtml(text)
{
  if (!text)
  {
    return '';
  }
  return marked.parse(String(text));
}

export function renderMarkdown(text)
{
  const html = markdownToHtml(text);
  return html ? DOMPurify.sanitize(html, SANITIZE_OPTIONS) : '';
}

/* ── Auszüge ───────────────────────────────────────────────────────────────
   Listenkarten und Suchtreffer zeigen zwei Zeilen Text. Dort wäre rohe Syntax
   („## Tag 1", „**wichtig**") nur Rauschen, gerendertes HTML dagegen unruhig.
   Diese Umformung ist absichtlich grob: sie muss Syntax lesbar wegräumen,
   nicht Markdown vollständig verstehen. */
const PLAIN_TEXT_STEPS = [
  // Codeblöcke samt Zäunen und Sprachangabe
  [/```[\s\S]*?```/g, ' '],
  [/~~~[\s\S]*?~~~/g, ' '],
  // Bilder verschwinden, ihr Alternativtext bleibt
  [/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
  // Verweise: nur der Text zählt
  [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
  // Überschriften, Zitate, Listenzeichen und Aufgabenkästchen am Zeilenanfang
  [/^\s{0,3}#{1,6}\s+/gm, ''],
  [/^\s{0,3}>\s?/gm, ''],
  [/^\s{0,3}[-*+]\s+\[[ xX]\]\s+/gm, ''],
  [/^\s{0,3}[-*+]\s+/gm, ''],
  [/^\s{0,3}\d+[.)]\s+/gm, ''],
  // Trennlinien
  [/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm, ' '],
  // Tabellen: Trennzeile weg, Zellengrenzen zu Abstand
  [/^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/gm, ' '],
  [/\|/g, ' '],
  // Hervorhebungen und Code inline
  [/(\*\*|__)(.*?)\1/g, '$2'],
  [/(\*|_)(.*?)\1/g, '$2'],
  [/~~(.*?)~~/g, '$1'],
  [/`([^`]*)`/g, '$1'],
  // Rest: Zeilenumbrüche und Mehrfach-Leerraum zu einem Leerzeichen
  [/\s+/g, ' '],
];

export function markdownToPlainText(text)
{
  if (!text)
  {
    return '';
  }
  return PLAIN_TEXT_STEPS
    .reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), String(text))
    .trim();
}
