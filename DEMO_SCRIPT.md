# MedAssist Hub: 10-minute demo script

**Audience:** faculty. **Goal:** show how the app solves real patient problems, then the tech briefly.
**Login:** click **Explore the demo account** (or `demo@medassist.app` / `Demo@1234`).

## Before you start (5 minutes before)

1. In the codespace terminal: `npm run demo` (resets the data to *today*).
2. `npm run check` in a second terminal: confirm Gemini and Overpass show **OK**.
3. Open the app, click **Explore the demo account**, then go back to the guest home (log out) so you start from the beginning.
4. Have your phone ready with the same link (port set to **Public**) to show the mobile view.
5. Allow location in the browser once, so "Use my location" doesn't stall on stage.

---

## 0:00–1:00 · The problem (talk, no clicks)

> "People managing chronic conditions juggle three things: **taking medicines on time**, **tracking numbers** like blood pressure and sugar, and **deciding when a symptom is serious**. In India, about 1 in 4 adults has high blood pressure and many stop or miss medicines. When something feels wrong, they either panic or ignore it. MedAssist Hub puts all of that in one place."

## 1:00–2:00 · Guest home → demo login

- Show the home page: *one sentence on what it does*, the example day.
- Point out: **symptom check, hospitals and first aid work without an account**, since in an emergency nobody should have to sign up.
- Click **Explore the demo account**.

> "This is Rajesh, 52, with type 2 diabetes and high blood pressure. He has used the app for about two months."

## 2:00–4:00 · Home: "Am I on track today?"  *(pain point: forgetting doses)*

- **Greeting line:** it's written from his data: the next/overdue dose and *"BP down from 149/95"*.
- **Dose timeline:** every dose of the day as a mark; filled = taken, amber = overdue, the black line = now.
- Click **Taken** on the overdue dose → the timeline and counter update instantly.
- **Needs attention:** *Refill Atorvastatin, 4 left*. "The app counts pills down with each dose and warns before he runs out."
- **At a glance:** 87% taken on time over 30 days.

## 4:00–5:00 · Medicines

- Open **Medicines**: schedule by day (‹ › to see yesterday's missed doses), prescriptions with stock, **Taken on time** chart showing it improved in the last 10 days, "since he started using reminders".
- Click **Check interactions** (FDA label check). Mention reminders pop up even when the tab is in the background.

## 5:00–6:00 · Vitals  *(pain point: no idea if treatment is working)*

- Open **Vitals**. Top strip = latest of each reading with a plain label (*High (stage 1)*, *Normal*).
- Chart: systolic falling from ~150 to 129 over 2 months, with the dashed **130** line where "high" starts.
- Click **Blood sugar**: fasting trend down. "This is what he shows his doctor."

## 6:00–7:30 · Symptom check  *(pain point: is this serious?)*

1. Type **"fever and joint pain with a rash"** → *Possible dengue*: it says **get a platelet test** and **avoid ibuprofen/aspirin**, and it skips anything in his allergy list.
2. Type **"chest pain spreading to my left arm"** → red **Emergency** banner with **Call 112**, ambulance and nearest hospital.

> "Emergency rules run first and can't be overridden; the AI (Google Gemini) adds detail but can only make advice more cautious, never less."

## 7:30–8:30 · Hospitals + SOS

- **Hospitals → Use my location**: real hospitals and clinics from OpenStreetMap, nearest first, with **Directions** and **Call**.
- Tap **SOS** (top right): one tap to call 112, and to send his **live location + blood group** to his wife or son by SMS or WhatsApp.

## 8:30–9:00 · Mobile (show your phone)

- Bottom tab bar, the same features, dialogs open as bottom sheets. Show **More → First aid → Snakebite**.

## 9:00–10:00 · Tech, briefly

- **Frontend:** HTML + JavaScript with Tailwind, no framework; fonts and libraries bundled so it works on weak networks.
- **Backend:** Node.js + Express REST API, **SQLite** database, logins with **JWT** and hashed passwords.
- **Free APIs:** Google **Gemini** (AI triage), **openFDA** (medicine labels), **OpenStreetMap** (hospitals and maps).
- **Safety by design:** rule-based red flags first, no medicine doses ever shown, allergy filtering, data deleted with the account.
- **Next steps:** push notifications on a closed app, Hindi/Kannada language support, sharing reports with doctors.

---

## If something goes wrong

| Problem | Say / do |
|---|---|
| AI is slow or shows "unavailable" | "Built-in rules still answer instantly"; carry on (results still show). |
| Hospital search fails | Click **Try again**, or **Open Google Maps** in the same card. |
| Location prompt blocked | Type **Jayanagar, Bengaluru** in the area box. |
| Data looks off for today | `npm run seed` in the terminal, then refresh. |
