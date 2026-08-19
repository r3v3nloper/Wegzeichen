/* =====================================================
   Wegzeichen – views/spots/meta.js
   Was Wanderwege von Orten unterscheidet, und die Sortierwahl

   Die View bedient beide Arten parametrisiert über `kind`; alles, was dabei
   verschieden ist, steht hier an einer Stelle statt in Bedingungen im Markup.
   ===================================================== */

export const KIND_META = {
  trail: {
    icon: 'mountain',
    title: 'Wanderwege',
    singular: 'Wanderweg',
    emptyEmoji: '⛰️',
    emptyHint: 'Speichere Routen, die du online findest — mit Länge, Ort und Quelle.',
  },
  place: {
    icon: 'pin',
    title: 'Orte',
    singular: 'Ort',
    emptyEmoji: '📍',
    emptyHint: 'Stände, Wälder, Hotels — alles, wo du hin willst oder schon warst.',
  },
};

/* „country" gruppiert nach Land, alle anderen liefern eine flache Liste */
export const SORT_OPTIONS = [
  { value: 'country', label: 'Land, dann Name' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'distance', label: 'Entfernung' },
  { value: 'planned', label: 'Geplantes Datum' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'created', label: 'Zuletzt hinzugefügt' },
];
