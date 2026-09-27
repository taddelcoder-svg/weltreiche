# Weltreiche – Spielkonzept

Echtzeit-Eroberungsspiel mit historischen Reichen für die Spielesammlung (Swimming Lions).
Stand: 27.09.2026 – Schritt 3 fertig (Online-Räume: gegeneinander und zusammen gegen Computer)

## Kurz gesagt

Auf einer 3D-Insel stehen 15 Städte, die mit Straßen verbunden sind. In deinen Städten werden laufend Soldaten ausgebildet.
Zieh von deiner Stadt zu einer anderen, und ein Teil deiner Truppen marschiert los.
Mehr Angreifer als Verteidiger = die Stadt gehört dir. Wer alle Gegner besiegt, gewinnt.
Eine Partie dauert 2–6 Minuten.

## Grundregeln (umgesetzt)

- **Ausbildung:** Städte bilden laufend Truppen aus, bis sie voll sind (Stufe 1: 30, Stufe 2: 50, Stufe 3: 80; 0,7 / 1,0 / 1,35 pro Sekunde).
  Neutrale Städte bilden nichts aus, haben aber eine feste Besatzung. Überfüllte Städte verlieren langsam Truppen.
- **Losschicken:** Von einer eigenen Stadt zum Ziel ziehen. Wahlweise 25 %, 50 % oder 100 % der Truppen.
  Wenn du beim Ziehen über mehrere eigene Städte fährst, schicken alle mit.
- **Marsch:** Truppen laufen über Straßen. Unterwegs dürfen sie nur durch eigene Städte laufen. Liegt eine fremde Stadt im Weg, greifen sie diese an.
- **Kampf:** Angreifer und Verteidiger heben sich 1:1 auf (mit Boni der Reiche). Treffen sich feindliche Trupps auf einer Straße, kämpfen sie dort.
- **Bezahlt wird mit Truppen:** Ausbauen (15 bzw. 30) und Turm (15) kosten Truppen aus der Stadt.

## Gebäude

| Gebäude | Was es macht | Stand |
|---|---|---|
| **Stadt** | Bildet Truppen aus, Stufe 1–3 (Stufe 2: Halle, Stufe 3: Tempel + Mauer) | ✅ |
| **Turm** | Bildet nichts aus, schießt Pfeile auf Feinde in der Nähe, Verteidiger zählen 1,5-fach | ✅ |
| **Schmiede** | Alle eigenen Truppen kämpfen 15 % stärker (Angriff und Verteidigung, max. 3), Rauch aus dem Schornstein | ✅ |
| **Kaserne** | Bildet 1,5/s aus (doppelt so schnell wie Stufe 1), max. 40, verteidigt nur 0,75-fach | ✅ |

## Reiche (alles umgesetzt, per Bot-Rundturnier ausbalanciert: 40–53 % Siege)

Die Fähigkeiten-Leiste lädt sich in 70 Sek. und +12 % je Eroberung; Start mit 25 %.

| Reich | Passiv | Spezialfähigkeit | Baustil |
|---|---|---|---|
| 🦅 **Römer** | Verteidigung +15 % | **Schildkröte:** 10 Sek. immun gegen Türme, Trupps kämpfen 30 % stärker | Villen, Forum, Kolosseum |
| ☥ **Ägypter** | Ausbildung +10 % | **Segen des Ra:** eigene Stadt bildet 10 Sek. doppelt so schnell aus | Flachdächer, Obelisk, Pyramide |
| ⚓ **Wikinger** | Angriff +15 % | **Raubzug:** fremde Stadt verliert die Hälfte (max. 30) | Langhäuser, Methalle, Palisade |
| 🏹 **Mongolen** | Truppen 35 % schneller | **Pfeilhagel:** Feind-Trupps im Gebiet −60 %, fremde Städte −20 % | Jurten, Khan-Jurte, Zaun |
| 龍 **Chinesen** | Bauen 40 % billiger, Ausbildung +5 % | **Große Mauer:** Straße 15 Sek. gesperrt, Wachen schießen | Pagodendächer, Pagoden |
| Ω **Griechen** | 30 % mehr Platz, Verteidigung +15 % | **Thermopylen:** eigene Stadt 10 Sek. unbesiegbar | Tempel, Parthenon |

Für Koop und Kampagne gibt es als Gegner die **Barbarenhorden**: viele schwache Krieger, die in Wellen angreifen.

## Karten

| Karte | Reiche | Besonderheit |
|---|---|---|
| Mittelinsel | 2 | längliche Insel, Stadt in der Mitte |
| Flussland | 2 | Fluss teilt die Insel, Brücken und Flussinsel-Stadt |
| Dreiländereck | 2–3 | runde Insel, dreifach symmetrisch |
| Vier Winde | 2–4 | große runde Insel, 25 Städte |

Karten werden in logik.js mit `symKarte()` gebaut: ein Abschnitt wird n-mal um die Mitte gedreht, damit alle Startplätze fair sind.

## Spielmodi

1. **Schnelles Spiel (solo):** ✅ Du gegen 1–3 Computergegner (Leicht / Mittel / Schwer), Karte wählbar oder Zufall.
2. **Online gegeneinander:** ✅ Raum mit 4-Buchstaben-Code (oder Einladungslink `/?raum=CODE`), bis 4 Reiche, Computergegner wählbar.
3. **Online zusammen:** ✅ Alle Menschen in einem Team gegen die Computergegner (Verbündete greifen sich nicht an, dürfen sich Truppen schicken und durch verbündete Städte marschieren). Später: Barbarenhorden als eigener Gegner.
4. **Kampagne „Aufstieg eines Reiches“:** 5 Kapitel mit je 5 Missionen und 1–3 Sternen pro Mission.
   Kapitel führen durch Landschaften: Mittelmeer, Nil-Delta, Nordmeer-Fjorde, Steppe, Große Mauer. Jedes Kapitel schaltet ein Reich frei.

Im Hauptmenü kämpfen zwei Computergegner im Hintergrund.

## Grafik (3D)

- three.js r128, selbst gehostet. Low-Poly, alle Modelle im Code gebaut (keine Bilddateien).
- Insel im Meer mit Wellen, Strand, Wäldern, Felsen, Feldern und Straßen.
- Dächer, Fahnen und Ringe in Reichsfarbe; Stufe 2 mit Halle, Stufe 3 mit Säulentempel und Stadtmauer; Turm mit Zinnen.
- Soldaten mit Speer als InstancedMesh (bis 2400 gleichzeitig), sie hüpfen beim Marschieren.
- Staubwolken bei Kämpfen, Pfeile von Türmen, Pop-Animation beim Erobern und Ausbauen.
- Später: eigener Baustil je Reich (römische Villen, ägyptische Flachdächer, Wikinger-Langhäuser …).

## Bedienung

- **Handy:** Ziehen = losschicken, Tippen auf eigene Stadt = Ringmenü (Ausbauen / Turm), Ziehen auf freier Fläche = Karte verschieben, zwei Finger = zoomen und drehen.
- **PC:** Maus wie oben, Mausrad zoomt, rechte Maustaste oder Q/E dreht, Tasten 1/2/3 für den Anteil, Esc = Pause.

## Technik

- `logik.js`: Regeln und Computergegner, ohne Grafik. Läuft im Browser und später auf dem Server (Online-Modus).
- `spiel.js`: Grafik, Steuerung, Ton (WebAudio), Menüs. `bauten.js`: Gebäude je Reich. `index.html`: Oberfläche.
- `server.js`: liefert aus, `zugang.js`-Passwort, Datenschutzseite. Port lokal 10300, Launch-Konfiguration „weltreiche“.
- `raeume.js`: Online-Räume über WebSocket `/ws`. Der Server rechnet das Spiel (20 Takte/s) und schickt 10-mal pro Sekunde einen Stand (~1–2 KB). Clients schicken nur Befehle (`senden`, `ausbauen`, `umbauen`, `faehigkeit`, `aufgeben`) und rechnen zwischen den Ständen mit `vorhersage()` weich weiter.
- `online.js`: Online-Menü, Warteraum, Verbindung; spricht über `weltreiche.online` mit spiel.js.
- Test-Hilfe in der Konsole: `weltreiche.sim(sek)`, `weltreiche.zustand`, `weltreiche.kamera(x, z, abstand)`.

## Bauplan

1. ✅ **Prototyp:** eine Karte, du gegen einen Computergegner, Losschicken, Kampf, Ausbildung, Ausbau, Türme, 6 Reiche mit Passiv-Bonus
2. ✅ Spezialfähigkeiten, Schmiede und Kaserne, 4 Karten (inkl. Fluss), bis zu 3 Gegner, Baustil je Reich, Bots nutzen alles
3. ✅ Online-Räume (gegeneinander + zusammen), Server rechnet mit logik.js, verlässt jemand das Spiel, übernimmt ein Computer
4. Kampagne mit 25 Missionen, Zufallskarten
5. Feinschliff: Musik, mehr Effekte, Veröffentlichung (GitHub + Render + Spielesammlung)
