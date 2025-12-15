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


## v5.7 — "En punkt"-läge + mer debug
- Nytt val **Hämtning**: 
  - **Fönster** (Start–End)
  - **En punkt** (Start=End, senaste minut) – kan vara mycket billigare på vissa API:n.
- Statusraden visar nu `tags=`, `res=`, `chunk=` och `fetch=`.
- Default: `chunk=1`, `resType=m`, `resNum=10`.


## v5.8 — hård clamp när API:t har strikt operations-limit
- Status visar nu även `fetch=`.
- I **Senaste-läge**:
  - `fetch=point` ger alltid **Start=End** (en datapunkt)
  - Om API:t svarar med "exceeded allowed read operations" flera gånger (adaptive×4+) växlar den automatiskt till **point** och ökar poll till minst **30s**.
  - Om `fetch=window` klampar den fönstret till max **5–10 min**.


## v5.9 — tomma svar ([]) fix
- I `fetch=point` skickas nu **inte** Start=End, utan ett minimalt intervall lika med **en upplösningsbucket** (t.ex. `m64` => 64 min). Det gör att API:t kan returnera minst en punkt.
- Om svaret är tomt (t.ex. `{Tag:[]}`) visas `0 punkter` i status och sidan injicerar texten `NO_DATA` i regnet.


## v6.0 — data syns tydligare + långsammare regn
- Nytt: **Hastighet** (0.2–1.5) för att göra regnet långsammare.
- Nytt: **Queue-repeat** (1–10): varje queue-tecken visas flera gånger så datan inte "bränns upp" på en frame.
- För aCurve-svar av typen `{tag:[...]}` extraheras nu kompakt `TAG:VALUE | TAG:VALUE` istället för att platta ut hela JSON.


## v6.1 — två decimaler
- Numeriska värden i datastreamen formateras som **xx.xx** (två decimaler), även om API:t returnerar heltal eller numeriska strängar.


## v6.2 — debug overlay + bättre visning av decimaler
- Checkbox **Visa debug overlay** visar senaste injicerade sträng (INJECT) + request/response + queue.
- Queue-repeat upprepas nu per **hela injicerade strängen** så att `12.34` syns som `12.34`.


## v6.2c
- Fixar en syntaxbugg i app.js (rensar kvarvarande repeat-fragment) så sidan renderar igen.


## v6.4 — head låst + data syns tydligare
- Första tecknet (head) i varje kolumn är **låst** under hela fallet och ritas sist (minskar flimret).
- Head hämtas primärt från API-queue (så data syns), medan spåret bakom är slumptecken.
- Injicerar i första hand **numeriska värden** (två decimaler) i regnet; taggnamn syns i debug overlay.
- Ny toggle: **Lås första tecknet från data**.


## v6.6 — head = hela talet (vertikalt)
- API-värden samlas som numeriska tokens (två decimaler) i **valueQueue**.
- Varje kolumn får en **headToken** (t.ex. 12.34) som ritas **vertikalt** i kolumnen och är låst tills kolumnen resetas.
- Debug overlay visar QUEUE(values) och NEXT_VALUES.


## v6.8 — headtokens endast från API + läsbart uppifrån och ner
- **Ingen** slump-fallback för headtokens: de ritas bara om de finns i API valueQueue.
- Head-token skrivs vertikalt så att talet kan läsas **uppifrån och ner**.
- Head-token tilldelas endast när kolumnen fortfarande är ovanför skärmen (så den inte kan bytas mitt i fallet).


## v6.9 — hover tooltip för taggnamn
- Varje headtoken kommer från API-kön som ett objekt `{tag,value}`.
- Hovra över en headtoken för att se **TagName + värde** i en tooltip.
