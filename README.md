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


## Strömmande senaste värdet
I inställningarna finns **Senaste-läge**. När det är valt räknas StartTime/EndTime automatiskt som ett rullande fönster bakåt från 'nu' i formatet **YYYY-MM-DD HH:mm** (som API-specen).

## 403 vid ändring av tid
Om du får 403 när du väljer vissa tider är det ofta att intervallet är otillåtet (t.ex. EndTime i framtiden, för stort spann, eller behörighet saknas för historik). Den här versionen visar även Start/End som faktiskt skickas samt en kort snutt av feltexten i statusraden.
