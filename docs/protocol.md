# Project Robothand J1 - serieel protocol

Copyright (c) 2026 Robbe Wulgaert

Dit document beschrijft het huidige Arduino-protocol van `Arduino_Robotic_Hand.ino`. De eerste webversie blijft compatibel met deze firmware.

## Verbinding

- Board: Arduino UNO
- Baudrate: `9600`
- Formaat: CSV-regels, gescheiden door komma's
- Arduino naar browser: ongeveer elke 75 ms
- Browser naar Arduino: CSV-regel met newline

WebSerial werkt in Chrome of Edge via `localhost`, `https://` of GitHub Pages.

## Arduino naar browser

De Arduino stuurt een CSV-regel met 22 velden:

```text
workbookMode,
matchTrigger,
matchComplete,
countdown,
thumb,
index,
middle,
ring,
pinky,
round,
playerGesture,
opponentGesture,
playerRound1,
playerRound2,
playerRound3,
playerRound4,
playerRound5,
opponentRound1,
opponentRound2,
opponentRound3,
opponentRound4,
opponentRound5
```

### Betekenis

| Index | Naam | Betekenis |
| --- | --- | --- |
| 0 | `workbookMode` | Oude Excel-modus, momenteel niet gebruikt |
| 1 | `matchTrigger` | Trigger voor blad-steen-schaar |
| 2 | `matchComplete` | Match klaar of niet |
| 3 | `countdown` | Countdownwaarde tussen rondes |
| 4-8 | `thumb` tot `pinky` | Vingerwaarden, normaal 0-100 |
| 9 | `round` | Huidige ronde |
| 10 | `playerGesture` | Herkend gebaar speler |
| 11 | `opponentGesture` | Gebaar van de tegenstander |
| 12-16 | `playerRound1-5` | Gebarenhistoriek speler |
| 17-21 | `opponentRound1-5` | Gebarenhistoriek tegenstander |

## Gebaarcodes

| Code | Gebaar |
| --- | --- |
| `1` | Steen |
| `2` | Blad |
| `3` | Schaar |
| `-1` | Geen geldig gebaar |
| `0` | Nog geen waarde |

## Browser naar Arduino

De huidige Arduino-code leest drie posities uit de inkomende CSV-regel:

| Index | Arduinovariabele | Gebruik |
| --- | --- | --- |
| 4 | `mRound_Interval` | Tijd per ronde in seconden |
| 5 | `mMatchTrigger` | `1` start een match wanneer vorige match klaar is |
| 8 | `mExcelRPSgesture` | Tegenstandergebaar |

De webapp stuurt daarom een compatibele commandoregel van 9 velden:

```text
0,0,0,0,roundIntervalSeconds,matchTrigger,0,0,opponentGesture
```

Voorbeeld: start een match met rondes van 5 seconden en tegenstander `Blad`:

```text
0,0,0,0,5,1,0,0,2
```

Na een trigger kan de browser opnieuw `matchTrigger = 0` sturen om het signaal netjes terug laag te zetten.

## Aanbevolen firmwareverbeteringen later

Voor feature parity is de huidige firmware bruikbaar. Voor een latere robuustere versie zijn deze aanpassingen nuttig:

- voeg `millis()` toe als eerste veld;
- voeg een protocolversie of header toe;
- stuur ruwe sensorwaarden en gekalibreerde waarden apart;
- maak inkomende commando's naamgebaseerd in plaats van indexgebaseerd;
- voeg een expliciete kalibratie-reset toe.
