# Fatture (archivio)

App per telefono (PWA) per archiviare le fatture **già pagate**: fotografi il foglio, diventa un PDF, e una copia finisce nel tuo Google Drive, già ordinata.

## Come archivia

- Cartelle su Drive: `anno / categoria`, per esempio `2026/Cassa malati` o `2025/Assicurazioni`. L'anno è quello della **data della fattura**. Le cartelle vengono create nella radice di "Il mio Drive".
- Nome del file: **mandante + data**, per esempio `Helsana 2026-10-05.pdf`.
- Se correggi mandante, data o categoria dopo l'invio, il file su Drive viene rinominato e spostato di conseguenza.
- Sul telefono l'elenco è raggruppato per anno, con filtro per categoria e ricerca.

## Cosa è sicuro

- **Nessun server.** Le fatture stanno sul telefono e nel Drive di chi usa l'app.
- **Un solo permesso su Google:** `drive.file`. L'app vede solo i file e le cartelle che ha creato lei, non il resto del Drive. Niente Calendar, niente posta, niente banche.
- **Nessun segreto nel codice.** Il Client ID di Google è pubblico per natura.
- Il token di accesso resta solo in memoria (scade dopo circa un'ora).

## Messa online (GitHub Pages)

1. Crea un repository e carica il contenuto di questa cartella.
2. Settings → Pages → branch `main`, cartella `/ (root)`.
3. L'indirizzo sarà `https://NOMEUTENTE.github.io/NOMEREPO/` (HTTPS incluso).

## Collegare Google (una volta sola, ~10 minuti)

Da fare con l'account Google **di chi userà l'app**. I nomi dei menù possono cambiare leggermente.

1. Vai su <https://console.cloud.google.com> e crea un progetto, per esempio "Fatture".
2. **API e servizi → Libreria**: abilita **Google Drive API**.
3. **Schermata di consenso OAuth** (oggi sotto "Google Auth Platform"):
   - Tipo di utente: **Esterno**; nome app "Fatture"; email di assistenza la sua.
   - Ambito: aggiungi `.../auth/drive.file` (è un permesso "non sensibile", quindi non serve alcuna verifica da parte di Google).
   - Utenti di prova: aggiungi la sua email. Se vuoi evitare che il consenso scada ogni 7 giorni in modalità "Test", porta l'app su **"In produzione"**.
4. **Credenziali → Crea credenziali → ID client OAuth → Applicazione web**:
   - Origini JavaScript autorizzate: `https://NOMEUTENTE.github.io` (solo il dominio, senza percorso né `/` finale).
   - Non servono URI di reindirizzamento.
5. Copia il **Client ID** (finisce con `.apps.googleusercontent.com`) in `config.js`, oppure incollalo nell'app: Impostazioni → Avanzate.
6. Nell'app: Impostazioni → **Collega Google** e accetta il permesso.

## Primo utilizzo

1. Dal telefono apri l'indirizzo e usa il menù del browser → **Aggiungi a schermata Home**. Su iPhone, Safari può cancellare i dati dei siti non usati per qualche giorno; installata sulla Home questo non succede. In ogni caso il backup vero è la copia su Drive.
2. Tocca **Scansiona fattura**, fotografa (più pagine con "Altra pagina"), scrivi mandante e data, scegli la categoria, **Salva**. L'importo è facoltativo.
3. Se Google non è raggiungibile in quel momento, la fattura resta sul telefono e compare un banner arancione "da inviare su Drive": un tocco e parte.

Puoi anche caricare un PDF già ricevuto per email (Galleria / PDF).

## Limiti

- Mandante, data e categoria si scrivono a mano; l'app non legge la foto.
- Eliminare una fattura dall'app non cancella la copia su Drive (è voluto).
- Due fatture dello stesso mandante nella stessa data hanno lo stesso nome file: Drive le tiene entrambe nella stessa cartella.
- Non ci sono più scadenze né promemoria: è solo un archivio.

## File

`index.html`, `styles.css`, `app.js` (interfaccia), `db.js` (archivio sul telefono), `scan.js` + `pdf.js` (foto → PDF, senza librerie), `google.js` (Drive), `sw.js` + `manifest.webmanifest` (installazione e uso offline), `config.js` (Client ID).

Le categorie sono nell'elenco `CATEGORIES` all'inizio di `app.js`.
