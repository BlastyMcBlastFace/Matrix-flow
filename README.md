# Matrix Live Data Stream (v4-fixed)

Fixar ett fel i v4 där sidan kunde bli helt svart p.g.a. att `mode`-fältet saknades i HTML.

## Snabb test
- Öppna sidan
- Tryck **S**
- Välj **Demo (lokal data)** → då ska du alltid se Matrix-regn direkt.

## Kör mot aCurve API
- API-bas: https://acurve.kappala.se:50001/api/v1/
- Token: (utan "Bearer ")
- Lägg in taggar, start/end och kör Poll / Testa.

## Om du får CORS
Då blockeras anrop från webbläsaren och du behöver proxy eller CORS-headers på API:t.


## Queue-läge
Den här versionen drar alltid tecken från queue när den innehåller data (maximal "meningsfull" stream).


## Uppdateringar:
- Tider skickas nu i ISO 8601-format (UTC) för att undvika 403-felet.
- Polling sker varje sekund för att få de senaste aktuella värdena.
