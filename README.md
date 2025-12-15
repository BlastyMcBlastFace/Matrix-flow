# Matrix Live Data Stream (v3) — felsökning + robust dataextract

## Användning
- Tryck **S** → fyll i endpoint + token → välj **Polling**
- Titta på raden "API: ..." i inställningsrutan. Den visar HTTP-status, svarstid och om den injicerar data.

## Om du ser "FEL (CORS/Nät)"
Då blockeras anropet i webbläsaren. Vanligt om:
- du kör från GitHub Pages (origin skiljer sig)
- API:t saknar rätt CORS-headers

Lösning: proxy (backend/edge-function) som du anropar istället.

## Om du ser HTTP 401/403
Token saknas, är fel eller saknar behörighet.

## Dataformat
v3 försöker plocka ut data även från djupt nästlade JSON-strukturer genom att skapa en kompakt stream av nyckel=värde.
