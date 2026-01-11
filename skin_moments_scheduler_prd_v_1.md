# Product Requirements Document (PRD)

## Product Name
Skin Moments Scheduler

## Version
v1.0 (MVP)

## Owner
Skin Self Love (Medik8 Portugal representative)

## 1. Purpose & Problem Statement

Pharmacies currently manage Medik8 Skin Moment appointments using paper-based daily forms ("Ficha de Marcações"). This approach is error‑prone, inflexible, and inefficient when handling mandatory breaks, schedule changes, and printing consistency.

The Skin Moments Scheduler replaces the paper form with a **simple, offline‑first, day‑view scheduling dashboard** that preserves the paper workflow logic while eliminating manual recalculation and visual clutter.

The product must feel trustworthy, calm, and professional — appropriate for use at a pharmacy counter.

---

## 2. Goals

- Replace the paper daily scheduling sheet with a digital equivalent
- Enforce mandatory lunch break rules automatically
- Allow flexible repositioning of lunch and technical breaks
- Automatically reflow appointments when breaks move
- Preserve **print parity** (what you see is what you print)
- Work offline without any backend dependency

### Non‑Goals (v1)
- Multi‑day or weekly views
- Online booking by clients
- CRM, marketing, or analytics features
- Long‑term data persistence

---

## 3. Target Users

- Pharmacy staff
- Medik8 Skin Experts

Usage context:
- Standing at a pharmacy counter
- Shared devices
- Time‑sensitive, interruption‑heavy environment

---

## 4. Core Assumptions & Constraints

- One Skin Expert per day view
- One pharmacy per instance
- Working day is fixed: **09:00–19:00**
- Appointments are fixed at **45 minutes**
- Lunch break is **mandatory, 60 minutes**
- Technical breaks are optional, **15 minutes**
- All scheduling changes may affect booked appointments

---

## 5. Functional Requirements

### 5.1 Day Timeline

- Display a vertical timeline from **09:00 to 19:00**
- Timeline scale is fixed and proportional to time
- No horizontal scrolling

Time scale rules:
- 15 minutes = 24 px
- 45‑minute appointment = 72 px
- 60‑minute lunch = 96 px
- 15‑minute technical break = 24 px

---

### 5.2 Appointment Slots

- Automatically generated 45‑minute slots fill all available time not occupied by breaks
- Two slot types:
  - Free
  - Booked

Booked slots must display:
- Time range
- Client name
- Contact
- Status

Statuses:
- Scheduled
- Checked‑in
- Completed
- No‑show

---

### 5.3 Lunch Break (Mandatory)

- Exactly one lunch block per day
- Duration: 60 minutes
- Draggable vertically in 15‑minute increments
- Can overlap booked appointments
- Triggers full schedule reflow on change

---

### 5.4 Technical Break (Optional)

- Duration: 15 minutes
- Can be added or removed
- Draggable in 15‑minute increments
- Triggers full schedule reflow on change

---

### 5.5 Schedule Reflow Rules

- All appointment slots are regenerated whenever breaks change
- Reflow preserves appointment order
- Booked appointments move with reflow
- If time exceeds 19:00:
  - Appointments are trimmed from the end
  - Trimmed booked appointments are flagged as "Needs reschedule"

---

### 5.6 Preview → Apply Mechanism

- Any break movement enters **Preview mode**
- Preview mode must:
  - Show proposed new times visually
  - Highlight affected appointments
  - Highlight trimmed appointments distinctly

- No changes are committed until user clicks **Apply changes**
- User may cancel to revert to previous schedule

---

### 5.7 Appointment Editing

- Clicking a slot opens a detail view
- Editable fields:
  - Name
  - Contact
  - Notes
  - Status

- Clearing a booking returns the slot to Free

---

### 5.8 Print Requirements

- Printable at all times
- Print output must visually match on‑screen layout
- A4 portrait format
- Must remain usable in black & white
- Print removes UI controls but preserves structure

---

## 6. Non‑Functional Requirements

### 6.1 Offline‑First

- App must function without internet
- No backend required for v1
- Data is session‑based and disposable

### 6.2 Performance

- Instant load on modern browsers
- Smooth drag interactions
- No perceptible lag during preview reflow

### 6.3 Accessibility

- WCAG 2.2 AA contrast compliance
- Minimum touch target: 44 px
- Keyboard navigable

### 6.4 Theme Support (Light/Dark)

- Provide **Light mode** and **Dark mode**
- Default theme:
  - Use the user's OS preference (`prefers-color-scheme`) on first load
  - Allow manual override via a theme toggle in the header
- Persist the user's theme preference locally (e.g., `localStorage`) for the same device/browser
- Light and Dark themes must both:
  - Preserve the same layout and information hierarchy
  - Remain print-safe (printing always uses a dedicated print stylesheet; theme does not affect print output)
  - Meet WCAG 2.2 AA contrast targets

### 6.5 Language Support (Portuguese/English)

- Provide **Portuguese (PT-PT)** and **English (EN)** UI languages
- Default language:
  - Use browser language on first load when possible
  - Allow manual selection via a language toggle in the header
- Persist the user's language preference locally (e.g., `localStorage`) for the same device/browser
- Internationalization rules:
  - All UI strings must be sourced from a translation dictionary (no hard-coded UI text)
  - Dates/times remain in 24h format (09:00–19:00) in both languages
  - Keep tone consistent: calm, professional, clinical

---

## 7. Technical Stack (v1)

- HTML
- CSS (variables + print styles)
- Vanilla JavaScript (ES modules)
- PWA (service worker + manifest)

---

## 8. Visual Design Requirements

- Visual language derived from:
  - medik8.pt (primary)
  - Skin Self Love brand (accent)

Rules:
- Neutral UI base
- Sage green accent used sparingly
- No gradients, heavy shadows, or decorative UI
- Calm, clinical, premium aesthetic

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|----|----|
| Accidental schedule changes | Preview → Apply confirmation |
| Print mismatch | Print parity designed from start |
| Over‑complex UI | Single day view, no tabs |
| Future data needs | Clean separation of scheduling engine |

---

## 10. Future Considerations (Out of Scope)

- Multi‑expert schedules
- Persistent storage per pharmacy
- Cloud sync
- Client‑side booking
- Analytics and reporting

---

## 11. Success Criteria

- Pharmacy staff can schedule a full day without manual recalculation
- Lunch and breaks can be moved without confusion
- Printed schedule matches digital exactly
- App usable without training

---

End of PRD

