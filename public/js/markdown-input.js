/* =====================================================
   Wegzeichen – markdown-input.js
   Textumformungen der Werkzeugleiste

   Bewusst frei von DOM und State: eine Umformung nimmt den Zustand eines
   Eingabefelds ({ value, selectionStart, selectionEnd }) und gibt den neuen
   Zustand zurück. Wer die Werte ins Textfeld schreibt, ist markdown-editor.js.
   Deshalb ist dieses Modul direkt testbar.
   ===================================================== */

/* Alles, was am Zeilenanfang eine Zeile auszeichnet — wird beim Setzen eines
   neuen Zeilenpräfixes entfernt, damit „## " nicht auf „> " stapelt. */
const LINE_MARKER = /^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/;

function state(value, selectionStart, selectionEnd)
{
  return { value, selectionStart, selectionEnd };
}

/* ── Auszeichnung im Fließtext (**fett**, *kursiv*, `code`) ──
   Ist die Auswahl bereits ausgezeichnet, wird sie zurückgenommen — derselbe
   Knopf schaltet also hin und her. Ohne Auswahl wird ein Platzhalter
   eingesetzt und markiert, damit direkt darüber getippt werden kann. */
export function toggleInline({ value, selectionStart, selectionEnd }, marker, placeholder = 'Text')
{
  const selected = value.slice(selectionStart, selectionEnd);
  const width = marker.length;

  if (selected.length >= 2 * width
    && selected.startsWith(marker) && selected.endsWith(marker))
  {
    const inner = selected.slice(width, -width);
    return state(
      value.slice(0, selectionStart) + inner + value.slice(selectionEnd),
      selectionStart, selectionStart + inner.length
    );
  }

  // Marker außerhalb der Auswahl: „**Wort**" mit nur „Wort" markiert
  if (value.slice(selectionStart - width, selectionStart) === marker
    && value.slice(selectionEnd, selectionEnd + width) === marker)
  {
    return state(
      value.slice(0, selectionStart - width) + selected + value.slice(selectionEnd + width),
      selectionStart - width, selectionEnd - width
    );
  }

  const inner = selected || placeholder;
  return state(
    value.slice(0, selectionStart) + marker + inner + marker + value.slice(selectionEnd),
    selectionStart + width, selectionStart + width + inner.length
  );
}

/* ── Zeilenpräfixe (Überschrift, Zitat, Liste, Aufgabe) ──
   Wirkt auf alle angefassten Zeilen. Tragen sie das Präfix schon alle, wird es
   entfernt; sonst gesetzt. `prefix` darf eine Funktion sein — nummerierte
   Listen brauchen je Zeile einen anderen Wert. */
export function toggleLinePrefix({ value, selectionStart, selectionEnd }, prefix)
{
  const blockStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
  const lineEnd = value.indexOf('\n', selectionEnd);
  const blockEnd = lineEnd === -1 ? value.length : lineEnd;

  const lines = value.slice(blockStart, blockEnd).split('\n');
  const prefixOf = typeof prefix === 'function' ? prefix : () => prefix;

  const alreadySet = lines.every((line, index) => line.startsWith(prefixOf(index)));
  const changed = lines.map((line, index) => alreadySet
    ? line.slice(prefixOf(index).length)
    : prefixOf(index) + line.replace(LINE_MARKER, ''));

  const block = changed.join('\n');
  return state(
    value.slice(0, blockStart) + block + value.slice(blockEnd),
    blockStart, blockStart + block.length
  );
}

/* ── Verweis ──
   Aus markiertem Text wird der Verweistext, die Adresse bleibt zur Eingabe
   markiert. Ohne Auswahl umgekehrt: der Text wartet auf die Eingabe. */
export function insertLink({ value, selectionStart, selectionEnd }, placeholder = 'Text')
{
  const selected = value.slice(selectionStart, selectionEnd);
  const label = selected || placeholder;
  const url = 'https://';
  const snippet = `[${label}](${url})`;

  const cursorFrom = selected
    ? selectionStart + label.length + 3
    : selectionStart + 1;
  const cursorTo = selected
    ? cursorFrom + url.length
    : cursorFrom + label.length;

  return state(
    value.slice(0, selectionStart) + snippet + value.slice(selectionEnd),
    cursorFrom, cursorTo
  );
}
