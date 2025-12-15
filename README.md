# Matrix Live Data Stream (GitHub Pages-ready)

En liten statisk webbsida som visar en "Matrix"-liknande dataström (gröna tecken i kolumner) och kan injicera data från ett API.

## Snabbstart
1. Lägg filerna i en mapp:
   - `index.html`
   - `style.css`
   - `app.js`
2. Öppna `index.html` lokalt (eller publicera på GitHub Pages).

## Koppla till API
Tryck **S** för inställningar och ange en endpoint.

Stödda format (exempel):
- JSON-array: `[123, 456, "FLOW 1200"]`
- JSON-objekt: `{ "data": ["FLOW 1200", "NH4 2.5"], "ts": 123 }`
- Text: `"FLOW 1200 NH4 2.5"`

### SSE (Server-Sent Events)
Om din endpoint skickar SSE (Content-Type `text/event-stream`) kan du välja **SSE** i inställningarna. Varje `message`-event kan vara JSON eller text.

### Polling
Om du har en vanlig REST-endpoint (t.ex. returnerar JSON) välj **Polling** och ange intervall.

## Tangenter
- **S**: visa/dölj inställningar
- **F**: fullscreen
- **Space**: pausa

## Tips för maximal "Matrix-känsla"
- Välj teckenuppsättning **Matrix (katakana + siffror)**
- Sätt **Intensitet (spår)** runt 0.06–0.10
