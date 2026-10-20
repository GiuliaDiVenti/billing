# Fatture

App per telefono (PWA): fotografi la fattura, diventa un PDF, la copia finisce sul tuo Google Drive e la scadenza sul tuo Google Calendar con i promemoria. Così non si dimentica più di pagare.

## Come funziona e cosa è sicuro

- **Nessun server.** L'app è solo codice che gira sul telefono. Fatture, importi e IBAN stanno sul telefono e nel Drive di chi la usa.
- **Permessi minimi su Google.** `drive.file`: l'app vede solo i file e le cartelle che ha creato lei, non il resto del Drive. `calendar.events`: crea, modifica e cancella eventi.
- **Non paga nulla**, non si collega a banche o carte.
- **Nessun segreto nel codice.** Il Client ID di Google è pubblico per natura.
- Il token di accesso resta solo in memoria (scade dopo circa un'ora).

Cartelle su Drive: `Fatture / <anno della scadenza> / <categoria> /`. Nome file: `2026-11-09 - Cassa malati - Helsana - 245.60.pdf`.

Promemoria su Calendar: 7 giorni, 3 giorni, 1 giorno prima e il giorno stesso, alle 09:00. Quando segni la fattura come pagata, l'evento viene cancellato.

## Messa online (GitHub Pages)

1. Crea un repository (anche privato se il tuo piano lo permette con Pages) e carica il contenuto di questa cartella.
2. Settings → Pages → branch `main`, cartella `/ (root)`.
3. L'indirizzo sarà `https://NOMEUTENTE.github.io/NOMEREPO/`. Serve HTTPS: GitHub Pages lo dà in automatico.

## Collegare Google (una volta sola, ~10 minuti)

Da fare con l'account Google **di chi userà l'app**. I nomi dei menù possono cambiare leggermente.

1. Vai su <https://console.cloud.google.com> e crea un progetto, per esempio "Fatture".
2. **API e servizi → Libreria**: abilita **Google Drive API** e **Google Calendar API**.
3. **Schermata di consenso OAuth** (oggi sotto "Google Auth Platform"):
   - Tipo di utente: **Esterno**.
   - Nome app "Fatture", email di assistenza la sua.
   - Ambiti: aggiungi `.../auth/drive.file` e `.../auth/calendar.events`.
   - Utenti di prova: aggiungi la sua email Gmail.
   - Poi porta l'app su **"In produzione"**. Se resta in "Test", Google fa scadere il consenso ogni 7 giorni e bisogna ricollegarsi. In produzione, senza verifica, al primo accesso compare "App non verificata": è la sua app, quindi *Avanzate → Vai a Fatture*.
4. **Credenziali → Crea credenziali → ID client OAuth → Applicazione web**:
   - Origini JavaScript autorizzate: `https://NOMEUTENTE.github.io` (solo il dominio, senza percorso né `/` finale).
   - Non servono URI di reindirizzamento.
5. Copia il **Client ID** (finisce con `.apps.googleusercontent.com`) in `config.js`, oppure incollalo nell'app: Impostazioni → Avanzate.
6. Nell'app: Impostazioni → **Collega Google** e accetta entrambi i permessi.

## Primo utilizzo

1. Apri l'indirizzo dal telefono e usa il menù del browser → **Aggiungi a schermata Home**. Importante: su iPhone, Safari può cancellare i dati dei siti non usati per qualche giorno; installata sulla Home questo non succede. In ogni caso la copia su Drive è il vero backup.
2. Tocca **Scansiona fattura**, fotografa (più pagine con "Altra pagina"), inserisci fornitore, categoria, importo e scadenza, **Salva**.
3. Se Google non è raggiungibile al momento del salvataggio, la fattura resta sul telefono e compare un banner arancione "da inviare a Google": un tocco e parte.

Puoi anche caricare un PDF già ricevuto per email (Galleria / PDF), oppure registrare una fattura già pagata (interruttore "Già pagata") solo per archivio.

## Cosa NON fa (ancora)

- Non legge in automatico importo e scadenza dalla foto: si scrivono a mano (30 secondi). Per le polizze svizzere con QR code si potrebbe leggere il QR direttamente sul telefono, senza servizi esterni.
- Se modifichi la categoria dopo l'invio, il PDF su Drive resta nella cartella vecchia.
- Eliminare una fattura dall'app non cancella la copia su Drive (è voluto).

## File

`index.html`, `styles.css`, `app.js` (interfaccia), `db.js` (archivio sul telefono), `scan.js` + `pdf.js` (foto → PDF, senza librerie), `google.js` (Drive e Calendar), `sw.js` + `manifest.webmanifest` (installazione e uso offline), `config.js` (Client ID).

Le categorie sono nell'elenco `CATEGORIES` all'inizio di `app.js`.
