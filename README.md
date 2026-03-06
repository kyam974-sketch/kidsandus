# Come pubblicare Kids&Us Follow-Up su iPad via GitHub Pages

## Cosa ottieni
Un URL fisso tipo `https://tuonome.github.io/kidsandus/` che apri in Safari su iPad
come una normale pagina web. Lo storico viene salvato nel browser dell'iPad e persiste
tra le sessioni. Zero costi, zero abbonamenti.

---

## Passo 1 — Crea un account GitHub (se non ce l'hai)
1. Vai su **github.com** da qualsiasi browser
2. Clicca **Sign up** → inserisci email, password, username
3. Verifica l'email

---

## Passo 2 — Crea il repository
1. Una volta dentro, clicca il **+** in alto a destra → **New repository**
2. Nome: `kidsandus` (tutto minuscolo, senza spazi)
3. Lascia tutto il resto invariato
4. Clicca **Create repository**

---

## Passo 3 — Carica il file HTML
1. Nella pagina del repository appena creato, clicca **uploading an existing file**
   (o trascina il file direttamente)
2. Carica il file `kidsandus.html`
3. **Importante:** rinominalo `index.html` prima di caricare
   (oppure rinominalo direttamente su GitHub dopo il caricamento)
4. Clicca **Commit changes**

---

## Passo 4 — Attiva GitHub Pages
1. Vai in **Settings** (tab in alto nel repository)
2. Clicca **Pages** nel menu a sinistra
3. Sotto **Source** seleziona **Deploy from a branch**
4. Branch: **main** → cartella: **/ (root)**
5. Clicca **Save**
6. Attendi 1-2 minuti, poi ricarica la pagina

Troverai il tuo URL nella stessa sezione Pages:
`https://tuonome.github.io/kidsandus/`

---

## Passo 5 — Apri su iPad
1. Apri **Safari** su iPad
2. Vai all'URL che ti ha dato GitHub Pages
3. Tocca il tasto **Condividi** (quadrato con freccia) → **Aggiungi a schermata Home**
4. Si crea un'icona come un'app — si apre in modalità full-screen

---

## Note importanti
- **Lo storico è salvato nell'iPad**: se cambi browser o dispositivo, lo storico non si
  trasferisce automaticamente. Per il momento è legato a Safari su quel dispositivo.
- **Aggiornamenti**: quando vorrai aggiornare l'app (es. aggiungere Pam&Paul a settembre),
  basta ricaricare il nuovo file `index.html` su GitHub e il link rimane lo stesso.
- **Connessione internet**: serve solo per il tasto "Genera note individuali" (chiamata API).
  Il resto dell'app funziona anche offline.
