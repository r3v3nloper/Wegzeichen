/* =====================================================
   Wegzeichen – markdown-editor.js
   Eingabefeld für Markdown: Werkzeugleiste, Umschalter Schreiben/Vorschau

   Eine wiederverwendbare Komponente, keine notizspezifische Logik — auch die
   Beschreibung eines Ortes oder die Zusammenfassung einer Reise könnte sie
   später nutzen. Die Textumformungen selbst stehen in markdown-input.js.
   ===================================================== */
import { IC } from './icons.js';
import { $, $$, esc } from './dom.js';
import { renderMarkdown } from './markdown.js';
import { toggleInline, toggleLinePrefix, insertLink } from './markdown-input.js';

/* Knopf → Umformung. Die Platzhalter erscheinen, wenn ohne Auswahl geklickt
   wird, und stehen dann markiert im Feld. */
const ACTIONS = {
  bold: { icon: IC.bold, title: 'Fett (Strg+B)', run: s => toggleInline(s, '**', 'fett') },
  italic: { icon: IC.italic, title: 'Kursiv (Strg+I)', run: s => toggleInline(s, '*', 'kursiv') },
  strike: { icon: IC.strike, title: 'Durchgestrichen', run: s => toggleInline(s, '~~', 'gestrichen') },
  code: { icon: IC.code, title: 'Code', run: s => toggleInline(s, '`', 'Code') },
  heading: { icon: IC.heading, title: 'Überschrift', run: s => toggleLinePrefix(s, '## ') },
  quote: { icon: IC.quote, title: 'Zitat', run: s => toggleLinePrefix(s, '> ') },
  list: { icon: IC.listV, title: 'Liste', run: s => toggleLinePrefix(s, '- ') },
  listOl: {
    icon: IC.listOl, title: 'Nummerierte Liste',
    run: s => toggleLinePrefix(s, index => `${index + 1}. `),
  },
  task: { icon: IC.task, title: 'Aufgabe', run: s => toggleLinePrefix(s, '- [ ] ') },
  link: { icon: IC.link, title: 'Verweis (Strg+K)', run: s => insertLink(s) },
};

const SHORTCUTS = { b: 'bold', i: 'italic', k: 'link' };

/* Reihenfolge der Knöpfe; null trennt Gruppen optisch */
const TOOLBAR = ['bold', 'italic', 'strike', 'code', null,
  'heading', 'quote', null, 'list', 'listOl', 'task', null, 'link'];

function toolbarHtml()
{
  return TOOLBAR.map(key => key === null
    ? '<span class="md-tool-sep"></span>'
    : `<button type="button" class="md-tool" data-md="${key}"
        title="${ACTIONS[key].title}">${ACTIONS[key].icon}</button>`).join('');
}

/* `name` ist der Feldname im umgebenden Formular — das Textfeld bleibt ein
   gewöhnliches <textarea>, damit FormData unverändert funktioniert. */
export function markdownEditorHtml({ name, value = '', rows = 14, placeholder = '', maxlength })
{
  return `
    <div class="md-editor">
      <div class="md-bar">
        <div class="md-tools">${toolbarHtml()}</div>
        <div class="md-modes">
          <button type="button" class="md-mode active" data-md-mode="write">Schreiben</button>
          <button type="button" class="md-mode" data-md-mode="preview">
            ${IC.eye}<span>Vorschau</span></button>
        </div>
      </div>
      <textarea class="form-input md-input" name="${name}" rows="${rows}"
        ${maxlength ? `maxlength="${maxlength}"` : ''}
        placeholder="${esc(placeholder)}">${esc(value)}</textarea>
      <div class="md-preview md-body" hidden></div>
      <p class="md-hint">Markdown: <code>**fett**</code>, <code># Überschrift</code>,
        <code>- Liste</code>, <code>[Text](Adresse)</code></p>
    </div>`;
}

/* Bindet den Editor innerhalb von `scope` — im Modal-Stapel muss jede Ebene
   ihre Selektoren auf das eigene Overlay begrenzen. */
export function bindMarkdownEditor(scope)
{
  const root = $('.md-editor', scope);
  if (!root)
  {
    return;
  }

  const input = $('.md-input', root);
  const preview = $('.md-preview', root);

  function apply(key)
  {
    const next = ACTIONS[key].run({
      value: input.value,
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
    });

    input.value = next.value;
    input.focus();
    input.setSelectionRange(next.selectionStart, next.selectionEnd);
    // Der Wert wurde nicht getippt — ohne dieses Ereignis bliebe eine
    // beobachtende Vorschau oder Zeichenzählung stehen
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  $$('[data-md]', root).forEach(btn =>
    btn.addEventListener('click', () => apply(btn.dataset.md)));

  input.addEventListener('keydown', e =>
  {
    const key = (e.ctrlKey || e.metaKey) && !e.altKey ? SHORTCUTS[e.key.toLowerCase()] : null;
    if (key)
    {
      e.preventDefault();
      apply(key);
    }
  });

  $$('[data-md-mode]', root).forEach(btn => btn.addEventListener('click', () =>
  {
    const showPreview = btn.dataset.mdMode === 'preview';

    $$('[data-md-mode]', root).forEach(b => b.classList.toggle('active', b === btn));

    if (showPreview)
    {
      /* Die Vorschau übernimmt die gewachsene Höhe des Textfelds, damit das
         Umschalten den Dialog nicht springen lässt. */
      preview.style.minHeight = `${input.offsetHeight}px`;
      preview.innerHTML = renderMarkdown(input.value)
        || '<p class="md-empty">Noch kein Inhalt.</p>';
    }

    input.hidden = showPreview;
    preview.hidden = !showPreview;
    if (!showPreview)
    {
      input.focus();
    }
  }));
}
