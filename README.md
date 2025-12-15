# Matrix Live Data Stream (v4) — aCurve /api/v1 integration

Den här versionen är byggd för:
- GET  /Tag
- POST /MeasurementMulti
med header:
- Authorization: Bearer <token>

## Så kör du snabbt
1. Öppna sidan
2. Tryck **S**
3. Kontrollera:
   - API-bas: https://acurve.kappala.se:50001/api/v1/
   - Token: (utan "Bearer ")
4. Klicka **Hämta /Tag** (för att auto-populera taggar om möjligt)
5. Lägg in StartTime/EndTime + taggar
6. Klicka **Testa /MeasurementMulti** eller låt polling gå

## Felsökning
- Om status visar "CORS/Nät": webbläsaren blockerar anropet. Då behövs proxy eller CORS-headers på API:t.
- Om HTTP 401/403: token/behörighet
- Om HTTP 404: kontrollera API-bas och att den slutar med /api/v1/

## Säkerhet
Bearer-token i en statisk webbsida kan läsas av användare som har tillgång till sidan.
För produktion: använd en proxy/backend som håller token hemlig.
