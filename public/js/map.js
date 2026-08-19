/* =====================================================
   Wegzeichen – map.js
   Leaflet-Wrapper. Kapselt Kartenerzeugung, Marker und Punktauswahl,
   damit die Views die Leaflet-API nicht direkt kennen müssen.
   ===================================================== */
import { esc } from './dom.js';
import { mapsDirectionsUrl } from './geo.js';

/* OpenStreetMap verlangt die Namensnennung — sie darf nicht entfernt werden */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" '
  + 'target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende';

/* Mitteleuropa als Startausschnitt, wenn nichts anzuzeigen ist */
const FALLBACK_CENTER = [51.1657, 10.4515];
const FALLBACK_ZOOM = 5;
const POINT_ZOOM = 13;

export function isMapAvailable()
{
  return typeof window.L !== 'undefined';
}

function baseMap(container, center, zoom)
{
  const map = window.L.map(container, { scrollWheelZoom: true });
  window.L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(map);
  map.setView(center || FALLBACK_CENTER, zoom ?? FALLBACK_ZOOM);

  // Leaflet berechnet seine Größe beim Erzeugen; im Modal ist der Container
  // zu diesem Zeitpunkt noch nicht final gelayoutet
  setTimeout(() => map.invalidateSize(), 60);
  return map;
}

/* Karte mit Markern für eine Liste von Einträgen. Einträge ohne Koordinaten
   werden übersprungen — sie haben auf einer Karte keinen Platz. */
export function renderSpotMap(container, items, onSelect)
{
  if (!isMapAvailable())
  {
    container.innerHTML = '<div class="map-unavailable">Karte konnte nicht geladen werden.</div>';
    return null;
  }

  const located = items.filter(i => Number.isFinite(i.lat) && Number.isFinite(i.lng));
  const map = baseMap(container, null, null);

  const markers = located.map(item =>
  {
    const marker = window.L.marker([item.lat, item.lng]).addTo(map);
    marker.bindPopup(popupHtml(item));
    if (onSelect)
    {
      marker.on('popupopen', () =>
      {
        const link = container.querySelector(`[data-popup-open="${item.id}"]`);
        link?.addEventListener('click', () => onSelect(item));
      });
    }
    return marker;
  });

  if (markers.length === 1)
  {
    map.setView([located[0].lat, located[0].lng], POINT_ZOOM);
  }
  else if (markers.length > 1)
  {
    map.fitBounds(window.L.featureGroup(markers).getBounds().pad(0.2));
  }

  return map;
}

function popupHtml(item)
{
  const navUrl = mapsDirectionsUrl(item);
  return `<div class="map-popup">
    <strong>${esc(item.name)}</strong>
    ${item.region ? `<div class="map-popup-sub">${esc(item.region)}</div>` : ''}
    <div class="map-popup-actions">
      <button class="btn btn-sm btn-primary" data-popup-open="${item.id}">Details</button>
      ${navUrl ? `<a class="btn btn-sm btn-ghost" href="${esc(navUrl)}"
        target="_blank" rel="noopener">Route</a>` : ''}
    </div>
  </div>`;
}

/* Karte zur Punktauswahl: ein Klick setzt den Marker und meldet die
   Koordinaten zurück. Liefert Handles zum Nachsetzen von außen (z.B. nach
   einer Adresssuche). */
export function createPointPicker(container, initial, onPick)
{
  if (!isMapAvailable())
  {
    container.innerHTML = '<div class="map-unavailable">Karte konnte nicht geladen werden.</div>';
    return null;
  }

  const hasInitial = Number.isFinite(initial?.lat) && Number.isFinite(initial?.lng);
  const start = hasInitial ? [initial.lat, initial.lng] : null;
  const map = baseMap(container, start, hasInitial ? POINT_ZOOM : null);

  let marker = hasInitial ? window.L.marker(start, { draggable: true }).addTo(map) : null;

  function place(lat, lng, zoom)
  {
    if (marker)
    {
      marker.setLatLng([lat, lng]);
    }
    else
    {
      marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', () =>
      {
        const pos = marker.getLatLng();
        onPick(pos.lat, pos.lng);
      });
    }
    map.setView([lat, lng], zoom ?? Math.max(map.getZoom(), POINT_ZOOM));
    onPick(lat, lng);
  }

  if (marker)
  {
    marker.on('dragend', () =>
    {
      const pos = marker.getLatLng();
      onPick(pos.lat, pos.lng);
    });
  }

  map.on('click', e => place(e.latlng.lat, e.latlng.lng));

  return { map, place };
}
