# Project Robothand J1

Auteur: Robbe Wulgaert · AI in de Klas · robbewulgaert.be  
© 2026 Robbe Wulgaert. Alle rechten voorbehouden.

## Korte uitleg

Robothand is een syntheseopdracht aan het einde van de Arduino-leerlijn. Leerlingen hebben dan al met Arduino gewerkt. In dit project bouwen en testen ze een handschoen met flexsensoren en een robothand met servo's.

De website is de lesomgeving: verbinden, kalibreren, observeren, een spel testen en een PDF-rapport maken. De nadruk ligt op bouwen, meten, bijsturen en uitleggen wat er gebeurt.

## Wat leerlingen doen

Leerlingen:

- controleren of Arduino, sensoren, servo's en USB goed klaarstaan;
- verbinden de Arduino met de browser;
- leggen een open hand en een gesloten hand vast voor de kalibratie;
- buigen hun vingers en bekijken de waarden per vinger;
- vergelijken wat de sensoren meten met wat de robothand doet;
- testen blad-steen-schaar met de robothand;
- noteren wat goed werkt en wat nog moet worden aangepast;
- maken een PDF-rapport met naam, klas, observaties en reflectie.

## Wat leerlingen oefenen

De opdracht herhaalt en verdiept:

- analoge input via flexsensoren;
- servo-aansturing;
- kalibratie van ruwe meetwaarden naar bruikbare percentages;
- seriële communicatie tussen Arduino en browser;
- eenvoudige gebarenlogica;
- foutzoeken in een fysieke opstelling;
- precies beschrijven wat een technisch systeem wel en niet goed doet.

## Lesverloop

1. Open `index.html` als startpagina.
2. Ga naar `platform.html`.
3. Upload `Arduino_Robotic_Hand.ino` naar de Arduino.
4. Controleer de bedrading en de voeding van de servo's.
5. Verbind de Arduino met de browser of start de demomodus.
6. Kalibreer een open hand.
7. Kalibreer een gesloten hand.
8. Observeer de vingerwaarden en de handvisualisatie.
9. Test blad-steen-schaar.
10. Vul observatie, besluit en reflectie in.
11. Genereer het PDF-rapport.

## Benodigdheden

- Arduino UNO;
- handschoen met vijf flexsensoren;
- robothand met vijf servo's;
- externe voeding voor de servo's wanneer nodig;
- gemeenschappelijke GND;
- USB-kabel die data doorgeeft;
- Chrome of Edge voor WebSerial.

## Seriële data

De huidige Arduino-code stuurt CSV-regels naar de browser op 9600 baud. De webversie blijft compatibel met de bestaande firmware.

Meer detail staat in:

```text
docs/protocol.md
```

Kort samengevat:

- Arduino naar browser: 22 CSV-velden met status, vingerwaarden, rondes en gebaren;
- browser naar Arduino: 9 CSV-velden om blad-steen-schaar aan te sturen;
- de vingerwaarden worden in de website gekalibreerd naar 0-100%;
- WebSerial werkt het best via GitHub Pages, HTTPS of `localhost`.

Als er geen hardware beschikbaar is, kan de demomodus gebruikt worden om het lesverloop te tonen. Er is geen CSV-export in deze webversie. De lesoutput is het PDF-rapport.

## Bestandsstructuur

```text
Project Robothand J1/
|-- Arduino_Robotic_Hand/
|   |-- Arduino_Robotic_Hand.ino
|-- index.html                  landingspagina
|-- platform.html               robothandplatform
|-- style.css                   vormgeving
|-- script.js                   WebSerial, kalibratie, visualisatie en rapportage
|-- readme.md
|-- media/
|   |-- landing_page_photo.jpg
|-- docs/
|   |-- protocol.md
|-- vendor/
|   |-- jspdf.umd.min.js
```

De oorspronkelijke instructies en Excel-werkmap kunnen in de projectmap blijven als achtergrondmateriaal. Voor klasgebruik start je vanuit `index.html`.

## Privacy en opslag

De website gebruikt geen server en geen leerlingenaccounts. Namen, klas en meetgegevens blijven in de browser. Alleen wanneer een leerling zelf een PDF downloadt, wordt er een bestand op het toestel bewaard.

## Voor publicatie op GitHub Pages

Publiceer de repo-root via GitHub Pages. Controleer na publicatie:

- `index.html` opent als startpagina;
- `platform.html` laadt zonder ontbrekende bestanden;
- `vendor/jspdf.umd.min.js` staat mee online;
- WebSerial werkt in Chrome of Edge;
- de demomodus start ook zonder Arduino.
