# Funktionen

## Konten

Mehrere Nutzer, strikt getrennte Daten. Registrierung mit Benutzername, E-Mail und
Passwort (mindestens 6 Zeichen). Anmeldung ist auf 10 Fehlversuche pro IP in 15
Minuten gedrosselt.

Im Profil lassen sich Benutzername, E-Mail und Passwort ändern. Eine
Passwortänderung meldet alle anderen Geräte ab, das aktuelle bleibt angemeldet.

Ein Administrator sieht unter „Admin" alle Konten mit der Anzahl ihrer Einträge,
kann Passwörter setzen und Konten löschen. Das Löschen entfernt auch alle Notizen,
Orte, Wanderwege, Reisen und Anhänge des Kontos. Ein gesetztes Passwort meldet
alle Geräte des betroffenen Nutzers ab.

Zwei Grenzen gelten dabei: das eigene Konto ist über die Nutzerverwaltung nicht
änderbar (Passwort ändern geht im Profil), und das Konto eines anderen
Administrators ist es auch nicht — weder löschen noch Passwort setzen. Ein Admin
entsteht über die Umgebungsvariablen `ADMIN_EMAIL` und `ADMIN_PASSWORD` beim
ersten Start.

## Heimatort

Im Profil festzulegen, per Adresssuche, Kartenklick oder aktueller GPS-Position.
Er ist der Bezugspunkt aller Entfernungsangaben. Ohne ihn funktioniert die App
vollständig — es fehlen nur die Entfernungen, und die Views sagen das.

Angezeigt wird die **Luftlinie**, im Browser gerechnet: unter einem Kilometer in
Metern, bis 10 km mit einer Dezimalstelle, darüber gerundet. Die echte Fahrstrecke
liefert der Google-Maps-Link.

## Notizen

- Titel und beliebig langer Inhalt (bis 50.000 Zeichen)
- **Der Inhalt ist Markdown.** Überschriften, Listen, Aufgabenlisten mit
  Kästchen, Zitate, Tabellen, Codeblöcke, Trennlinien, Verweise und Bilder.
  - **Lesen:** Ein Klick auf eine Notiz öffnet eine eigene Leseansicht mit
    gerendertem Text über die volle Breite — nicht das Bearbeitungsformular.
    Der Stift in der Karte führt weiter direkt zum Bearbeiten.
  - **Schreiben:** Das Formular hat eine Werkzeugleiste (fett, kursiv,
    durchgestrichen, Code, Überschrift, Zitat, Liste, nummerierte Liste,
    Aufgabe, Verweis), Tastenkürzel Strg+B, Strg+I und Strg+K sowie einen
    Umschalter „Schreiben | Vorschau". Derselbe Knopf nimmt eine Auszeichnung
    auch wieder zurück; ohne Auswahl setzt er einen markierten Platzhalter.
  - Verweise öffnen in einem neuen Tab. Aufgabenkästchen sind Anzeige, nicht
    Eingabe — ein Häkchen dort würde niemand speichern.
  - Rohes HTML im Notiztext wird verworfen, nicht angezeigt.
  - Listenkarten und Suchtreffer zeigen den Text **ohne** Markdown-Zeichen,
    damit zwei Zeilen Vorschau lesbar bleiben.
- **Favoriten stehen immer oben**, danach sortiert nach letzter Änderung
- **Ordner** zum Gruppieren. Über der Liste steht eine Leiste mit „Alle", allen
  Ordnern samt Anzahl und „Ohne Ordner"; ein Klick öffnet die Gruppe. Eine Notiz
  liegt in genau einem Ordner oder in keinem.
  - Anlegen, umbenennen und löschen über das Ordnersymbol in der Leiste oder
    direkt aus dem Notizformular
  - Umbenennen wirkt sofort für alle enthaltenen Notizen
  - **Löschen vernichtet keine Notizen**: sie bleiben und stehen danach unter
    „Ohne Ordner". Ein Ordner ist eine Einordnung, kein Behälter.
  - Namen sind eindeutig, auch unabhängig von Groß- und Kleinschreibung —
    „Reisen" und „reisen" wären sonst zwei Gruppen, die gleich aussehen
  - Wer innerhalb eines Ordners eine neue Notiz anlegt, findet ihn vorbelegt
- Suche über Titel und Inhalt; Prozentzeichen und Unterstriche werden als Text
  behandelt, nicht als Platzhalter
- **Anhänge**: PDF, Word (`.doc`, `.docx`), ODT, Text, Markdown, PNG, JPEG, WebP.
  Maximal 10 MB je Datei, 5 Dateien je Notiz, 200 MB je Konto. HTML und SVG sind
  ausgeschlossen, weil sie Skript enthalten können.
- Anhänge kommen per Auswahl oder Drag-and-drop hinzu. PDFs, Bilder und
  Textdateien öffnen sich in einem neuen Tab, alles andere wird heruntergeladen.
- Eine neue Notiz wird zuerst gespeichert; danach bleibt das Formular offen und
  nimmt Anhänge an.

## Wanderwege und Orte

Beide funktionieren gleich und unterscheiden sich nur in ihren Kennzahlen.

**Ein Ziel darf beides sein.** Im Formular sind „Wanderweg" und „Ort" zwei Haken,
nicht eine Entweder-oder-Wahl. Die Drachenschlucht in Eisenach fährt man an und
läuft sie ab — sie kreuzt beides an, erscheint in beiden Listen und hat sowohl
Länge, Dauer und Schwierigkeit als auch eine Ortsart. In der Liste weist ein
Hinweis auf den jeweils anderen Aspekt hin („auch ein Ort"). Mindestens ein Haken
muss gesetzt bleiben, und beide lassen sich nachträglich ändern.

Gemeinsam:

- Name, Notizen, Land, Region oder Stadt, Adresse
- Die **Notizen sind Markdown** und werden im selben Editor geschrieben wie eine
  Notiz: Werkzeugleiste, Tastenkürzel und Vorschau. In der Liste erscheint der
  Text ohne Markdown-Zeichen.
- Standort per Adresssuche, Kartenklick, GPS oder gar nicht
- **Status**: „Möchte ich hin" oder „War ich schon"
- Bei „War ich schon": Bewertung von 1 bis 5 Sternen und Besuchsdatum
- Bei „Möchte ich hin": ein optionales Datum „Geplant für". Es erscheint auf der
  Übersicht unter „Nächste Termine" und lässt sich als Sortierung wählen.
  Sobald der Eintrag auf „War ich schon" wechselt, entfällt der Termin —
  was besucht ist, muss nicht mehr geplant werden.
- Quelle als Link — die Webseite, auf der die Route gefunden wurde
- Favorit
- Entfernung als Luftlinie zum Heimatort
- Schaltfläche, die die Navigation direkt in Google Maps öffnet

Nur Wanderwege: Länge in Kilometern, Höhenmeter, Dauer (Stunden und Minuten),
Schwierigkeit (leicht, mittel, schwer).

Nur Orte: Art des Ortes als freies Textfeld mit Vorschlägen wie Hotel,
Ferienwohnung, Campingplatz, Wald, See, Aussichtspunkt, Stand, Restaurant, Burg,
Museum, Parkplatz, Badestelle.

Die Art eines Eintrags ist nach dem Anlegen unveränderlich.

### Filtern, Sortieren, Karte

Filter für Suchbegriff, Land und Status. Das Länderfeld bietet nur die tatsächlich
belegten Länder an. Alle Filter wirken sofort und ohne Serveraufruf, also auch
offline.

Sortierungen:

| Option | Verhalten |
|---|---|
| Land, dann Name | Gruppiert nach Land mit Überschrift und Anzahl (Voreinstellung) |
| Name A–Z | Flache Liste |
| Entfernung | Nächstes zuerst; ohne Heimatort erscheint ein Hinweis |
| Geplantes Datum | Nächster Termin zuerst, Ziele ohne Termin zuletzt |
| Bewertung | Beste zuerst, Unbewertete zuletzt |
| Zuletzt hinzugefügt | Neuestes zuerst |

Einträge ohne den jeweiligen Wert wandern immer nach hinten statt die Sortierung
zu verfälschen.

Über den Umschalter oben rechts wird aus der Liste eine **Karte**. Sie zeigt alle
gefilterten Einträge mit Koordinaten, ein Marker öffnet Name, Region, eine
Detail-Schaltfläche und einen Routen-Link. Ein Hinweis unter der Karte nennt, wie
viele Einträge keinen Punkt haben.

## Reisen

Ein privater Reiseblog ohne Bilder.

- Titel, Land, Zeitraum, Bewertung von 1 bis 5 Sternen, Reisebericht
- Der **Reisebericht ist Markdown** und wird im selben Editor geschrieben wie eine
  Notiz. Gerendert erscheint er beim Öffnen der Reise; in der Liste steht der Text
  ohne Markdown-Zeichen.
- **Dauer** wird aus dem Zeitraum berechnet, beide Tage zählen mit
- **Bilder** als Link auf ein Cloud-Album statt als Upload
- Favorit
- Sortierung: Favoriten oben, dann die jüngste Reise; Reisen ohne Datum zuletzt

### Route in Etappen

Eine Reise besteht aus Etappen in der Form „Tag 1–4 in Rom, dann weiter nach
Florenz":

- Tag von und Tag bis, Ortsname, Notiz, optional ein Punkt auf der Karte
- Etappen lassen sich per Pfeiltasten umsortieren und einzeln entfernen
- Eine Etappe kann mit einem **gespeicherten Ort oder Wanderweg verknüpft**
  werden; Name und Koordinaten werden dann übernommen. Wird der Ort später
  gelöscht, bleibt die Etappe erhalten und verliert nur die Verknüpfung.

Ein Klick auf eine Reise öffnet die Leseansicht mit Kopfdaten, Bericht und der
Route als Zeitleiste. Jede Etappe hat einen Link, der sie in Google Maps zeigt.

## Übersicht

- Globale Suche über Notizen, Wanderwege, Orte und Reisen. Reisen werden auch
  über ihre Etappen gefunden — „Florenz" findet die Italien-Reise.
- Vier Kacheln mit den Beständen, jede führt in ihren Bereich
- **Nächste Termine**: geplante Ziele und noch nicht abgeschlossene Reisen in
  einer chronologischen Liste, mit Angaben wie „heute", „morgen" oder
  „in 5 Tagen". Verstrichene Termine verschwinden nicht, sondern stehen oben
  und sind als *überfällig* gekennzeichnet.
- **Ziele in der Nähe**: die sechs nächstgelegenen Einträge von der Wunschliste,
  Besuchtes wird nicht mehr vorgeschlagen
- **Favoriten** aus allen vier Bereichen gemischt

## Offline

Die App ist als PWA auf Android und Windows installierbar.

| Situation | Verhalten |
|---|---|
| Lesen ohne Netz | Alles da, mit Hinweisbanner über der Liste |
| Bereits geöffnete Anhänge | Bleiben verfügbar |
| Speichern ohne Netz | Wird abgelehnt, mit dem Hinweis dass nichts gespeichert wurde |
| Kartenhintergrund | Fehlt — OpenStreetMap erlaubt kein Vorab-Caching der Tiles. Koordinaten, Entfernung und Maps-Link funktionieren |
| Kontowechsel | Der Zwischenspeicher wird geleert, damit niemand die Daten des vorigen Kontos sieht |

## Bedienung mit der Tastatur

Dialoge sind vollständig mit der Tastatur bedienbar: der Fokus springt beim
Öffnen ins erste Feld, bleibt mit Tab im Dialog, Escape schließt ihn — und
danach steht der Fokus wieder auf dem Knopf, der ihn geöffnet hat. Im
Notiz-Editor arbeiten Strg+B, Strg+I und Strg+K.

Icon-Knöpfe haben einen vorlesbaren Namen, und das Aufziehen mit zwei Fingern ist
nicht gesperrt.

## Sprache und Darstellung

Oberfläche durchgehend deutsch, Ländernamen und Datumsformate ebenso.
Dunkles Farbschema (Violett `#7c4dff`, Cyan `#00e5ff` auf `#0d0d1a`), Inter als
Schrift. Auf dem Telefon liegen die fünf Hauptbereiche in der unteren Leiste,
Profil und Admin im Seitenmenü.
