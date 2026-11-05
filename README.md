# MedAssist Hub

A personal health assistant: medicine reminders with a dose timeline, blood pressure and sugar trends, doctor appointments, a symptom checker with emergency detection, nearby hospitals on a map, first-aid guides and an SOS button.

Node.js + Express + SQLite on the backend; plain HTML, Tailwind (pre-built) and JavaScript on the frontend. Everything the page needs (fonts, map and chart libraries) is bundled, so it works on slow or filtered networks.

> General health information only. It does not replace a doctor.

---

## Demo account

| | |
|---|---|
| Email | `demo@medassist.app` |
| Password | `Demo@1234` |
| Person | Rajesh Sharma, 52, type 2 diabetes and high blood pressure |
| Data | 75 days of history: 5 medicines with dose logs, 30+ BP readings trending down, sugar, weight, a fever episode, 6 appointments, 3 symptom checks, 2 emergency contacts |

You don't have to type it: **"Explore the demo account"** on the home page signs in with one click, and so does adding `?demo` to the address (`http://localhost:3000/?demo`).

Dates are generated relative to *now* (India time), so **reset the data shortly before presenting**:

```bash
npm run demo     # reset the demo data, then start the server
```

One dose (the most recent one already due) is deliberately left untaken, so you can tap **Taken** live.

---

## Run it in GitHub Codespaces (recommended for the presentation)

1. **Put the project on GitHub.** On github.com click **New repository**, name it `medassist-hub`, and create it (private is fine). Then, in the project folder on your computer:
   ```bash
   git init
   git add .
   git commit -m "MedAssist Hub"
   git branch -M main
   git remote add origin https://github.com/<your-username>/medassist-hub.git
   git push -u origin main
   ```
2. **(Optional) Add your Gemini key as a secret.** In the repo: **Settings → Secrets and variables → Codespaces → New repository secret**, name `GEMINI_API_KEY`, paste the key. (Or paste it into `.env` inside the codespace later; `.env` is never committed.)
3. **Open the codespace.** On the repo page: **Code → Codespaces → Create codespace on main**. The first start installs everything, creates `.env` and the demo account automatically (about 1–2 minutes).
4. **Start the app** in the codespace terminal:
   ```bash
   npm run demo
   ```
   A pop-up offers **Open in Browser**; or open the **Ports** tab and click the globe next to port 3000.
5. **Let others open it (optional).** In the **Ports** tab, right-click port 3000 → **Port Visibility → Public**. Anyone with the link can now open it, for example faculty on their phones.
6. **Keep it awake.** A codespace stops after 30 idle minutes by default. On github.com go to **Settings → Codespaces → Default idle timeout** and set it to 240 minutes before the presentation.

To check that the AI, maps and medicine lookups can be reached from the codespace:
```bash
npm run check
```

---

## Run it on your own computer

You need **Node.js 22.13 or newer** (`node -v`). On Linux, the easiest way is nvm:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install --lts
```

Then, in the project folder:
```bash
npm install
node scripts/setup-env.js   # creates .env with a random secret
npm run demo                # creates the demo account and starts the app
```
Open **http://localhost:3000**. Stop with `Ctrl + C`.

Turn on AI triage: get a free key at https://aistudio.google.com/apikey, open `.env` (`nano .env`), paste it after `GEMINI_API_KEY=`, save and restart.

---

## Commands

| Command | What it does |
|---|---|
| `npm start` | Start the server |
| `npm run demo` | Reset the demo account's data, then start |
| `npm run seed` | Reset the demo account's data only |
| `npm run check` | Test the connection to Gemini, OpenStreetMap and openFDA, and list your Gemini models |
| `npm run dev` | Start and restart automatically on code changes |
| `npm run build:css` | Rebuild `public/css/tailwind.css` after changing Tailwind classes |

---

## If the AI or hospital search times out

Run `npm run check`. It tests each service and says exactly what failed.

- **Gemini** "thinks" before answering; the app asks for a low thinking level and waits up to 40 seconds. A 404 means the model name in `GEMINI_MODEL` isn't available to your key; `npm run check` lists the ones that are. A 429 means the free-tier limit for the minute is used up; wait a minute.
- **Hospital search** asks three free OpenStreetMap servers at once and uses the first that answers, then falls back to OpenStreetMap's search service. If all are busy, the app offers *Try again* and *Open Google Maps*.
- **Slow or filtered networks** (college Wi-Fi, some ISPs): the server prefers IPv4 and allows longer connection times. If it still fails, run the app in Codespaces, whose connection is reliable.
- When the AI is unavailable, symptom checks still work with the built-in medical rules.

---

## Features

| Area | What it does |
|---|---|
| **Home** | Greeting with today's key fact, doses taken, latest BP and sugar, next appointment, a timeline of today's doses, what needs attention, the 60-day BP trend and upcoming visits |
| **Symptom check** | Rule engine with emergency red flags (chest pain, stroke signs, breathing trouble, anaphylaxis, snakebite and more), a supportive crisis response with the Tele-MANAS helpline, a dengue rule that blocks NSAIDs, allergy-aware suggestions, plus an optional Gemini AI analysis that can raise urgency but never lower it |
| **Medicines** | Several reminder times a day, Taken/Skip/Undo, pill stock with refill alerts, pause/resume, course end dates, adherence over 7/14/30 days, FDA label info and an interaction check |
| **Vitals** | BP, sugar (fasting/after meal), heart rate, weight, temperature (°C/°F), oxygen; each reading labelled against general ranges; trend chart with the reference line |
| **Appointments** | Upcoming and past visits, add to calendar (.ics with a 1-hour alarm), in-app reminder an hour before, questions to ask |
| **Hospitals** | GPS or typed area; hospitals, clinics and pharmacies on a map with distance, emergency/24×7 tags, call and directions |
| **First aid** | 18 searchable step-by-step guides with what not to do |
| **Profile & SOS** | Health details, BMI, emergency contacts, a printable Medical ID; SOS calls 112 and sends your live location by SMS or WhatsApp |
| **Phone** | Bottom tab bar, bottom-sheet dialogs, list/map toggle in the hospital search |

Free services used: Google Gemini (optional key), openFDA, OpenStreetMap (Overpass, Nominatim, map tiles).

---

## Project structure

```
medassist-hub/
├── .devcontainer/devcontainer.json   # GitHub Codespaces setup
├── .env.example                      # settings template
├── scripts/
│   ├── seed-demo.js                  # creates/resets the demo account
│   ├── check.js                      # connectivity check
│   └── setup-env.js                  # creates .env with a random secret
├── server/
│   ├── index.js  config.js  db.js  sqlite.js  net.js
│   ├── middleware/auth.js
│   ├── routes/      auth, profile, medications, vitals, appointments, dashboard, triage, health-data
│   ├── services/    triageEngine, gemini, openfda, overpass, cache
│   ├── data/        symptoms.js (triage knowledge), firstAid.js
│   └── utils/       validate.js, vitalRanges.js
├── src/tailwind.css                  # design tokens + components (source)
├── tailwind.config.js
└── public/
    ├── index.html
    ├── css/  tailwind.css (built), styles.css
    ├── vendor/  leaflet, chart.js, Public Sans font
    └── js/   ui, api, auth, dashboard, triage, tracker, vitals, appointments, locator, info, profile, reminders, app
```

## API

All under `/api`; 🔒 needs `Authorization: Bearer <token>`.

| Endpoint | Purpose |
|---|---|
| `GET /meta` | Public settings |
| `POST /auth/register` · `POST /auth/login` · `POST /auth/demo` | Sign up, log in, one-click demo login |
| `GET /auth/me` 🔒 · `POST /auth/change-password` 🔒 · `DELETE /auth/account` 🔒 | Account |
| `GET/PUT /profile` 🔒 · `POST/PUT/DELETE /profile/contacts[/:id]` 🔒 | Profile and emergency contacts |
| `GET/POST /medications` 🔒 · `PUT/DELETE /medications/:id` 🔒 · `POST /medications/:id/refill` 🔒 | Medicines |
| `GET /medications/schedule?date=` 🔒 · `POST/DELETE /medications/:id/log` 🔒 · `GET /medications/adherence` 🔒 | Doses |
| `GET/POST /vitals` 🔒 · `GET /vitals/summary` 🔒 · `DELETE /vitals/:id` 🔒 | Vitals |
| `GET/POST /appointments` 🔒 · `PUT/DELETE /appointments/:id` 🔒 | Appointments |
| `GET /dashboard` 🔒 | Home screen data |
| `POST /triage` · `GET /triage/history` 🔒 | Symptom checks |
| `GET /drugs/lookup?name=` · `GET /drugs/my-interactions` 🔒 | Medicine info |
| `GET /places/nearby` · `GET /places/geocode?q=` | Hospitals and area search |
| `GET /firstaid?q=` | First-aid guides |
