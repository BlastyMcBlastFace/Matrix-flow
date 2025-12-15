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


## v5.1 (400-fixar)
- **ResolutionNumber** skickas som **number**.
- I **Senaste-läge** sätts EndTime till **nu minus 1 minut** (undviker att servern tolkar EndTime som "i framtiden" p.g.a. klockskew).
- ISO-inmatning i Start/End normaliseras till **YYYY-MM-DD HH:mm**.


## v5.2 — fix för 'exceeded allowed read operations'
- **Delta-hämtning i Senaste-läge**: efter första lyckade anropet hämtas bara nya data sedan förra EndTime.
- **Auto-grovning av upplösning**: om uppskattade operations blir höga höjs ResolutionNumber automatiskt.
- Standard **poll-intervall** är höjt till 10 s för att inte slå i begränsningar.

### Tumregel
Operations ~ (antal taggar) × (antal tidssteg i intervallet). Minska taggar, korta lookback, eller öka upplösningen.


## v5.3 — adaptiv throttling vid operations-limit
- Om API:t svarar med **"exceeded allowed read operations"** så ökar sidan automatiskt en **adaptive×2** (2,4,8…):
  - lookback-fönstret krymps
  - ResolutionNumber höjs
- Taggar hårdkapas till **20** för att undvika extrema anrop.


## Standard: 10 taggar
- Klicka **Hämta /Tag**: om taggfältet är tomt fylls **första 10 taggarna** automatiskt.
- Vill du ha fasta 10 taggar oavsett /Tag-ordning: öppna `app.js` och fyll `DEFAULT_TAGS = [ ... ]`.


## v5.5 — chunkade requests (för 403 'exceeded allowed read operations')
- Du kan visa 10 taggar totalt men anropa API:t i mindre "bitar".
- **Taggar per request** (default 2) gör att varje anrop blir billigare.
- Rekommendation: Senaste-läge + lookback 5–10 min + chunk=1–2 + poll 10s.


## v5.6 — viktigt fix
- Knappen **Testa /MeasurementMulti** använder nu samma "Taggar per request" (chunk) som polling.
- Statusraden visar nu `tags=<antal>` så du ser att requesten verkligen är chunkad.
- Vid "exceeded allowed read operations" backar den automatiskt till `chunk=1` och höjer poll till minst 15 s.
