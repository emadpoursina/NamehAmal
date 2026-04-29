# 🕒 NamehAmal — Personal Time Tracker PRD

---

## 1. Context

### Overview
NamehAmal is a **minimal, local-first time tracking app** for personal usage.  
It focuses on **tracking time sessions**, either manually or in real-time, and providing **simple, clear insights** into how time is spent across categories.

---

### Problem
The user needs a simple way to:
- Track work sessions (both manually and live)
- Organize sessions into categories
- View and filter sessions easily
- Understand time distribution across categories

Existing tools are often:
- too complex
- slow to use
- not flexible for quick manual entry

---

### Goals
- Allow **fast session creation** (manual + live tracking)
- Provide a **clear table view of sessions**
- Enable **category-based filtering and analysis**
- Keep everything **minimal, fast, and local**

---

### Non-Goals
- No authentication
- No multi-user support
- No cloud sync (for now)
- No advanced productivity systems (goals, reminders, etc.)

---

## 2. User Journey

### Primary Flows

#### A. Manual Session Entry
1. User opens app
2. Inputs:
   - duration
   - title
   - category
   - date
3. Saves session
4. Session appears in table

---

#### B. Live Tracking
1. User selects a category (and optionally title)
2. Clicks "Start"
3. Timer runs
4. User clicks "Stop"
5. Session is saved automatically

Rules:
- Only **one** live timer session can run at a time.
- A live timer session is considered **running** when `kind = TIMER` and `endedAt = null`.
- On stop, `durationSeconds` is computed as `max(1, floor((endedAt - startedAt) / 1000))`.

---

### Viewing & Filtering

#### Table View (Main Usage)
1. User opens dashboard
2. Sees list of sessions (default: today)
3. Can:
   - filter by category
   - filter by date
4. Reviews all sessions in a simple table

---

#### Category Analysis
1. User views aggregated data
2. Sees total time spent per category
3. Applies filters (e.g. date range, category)
4. Understands time distribution

---

### Category Management
1. User can:
   - add new categories
   - remove existing categories
2. Categories are predefined but editable

Notes:
- Removing a category is implemented as **archiving** (`isArchived=true`) to preserve history.
- Archived categories are hidden from session creation pickers by default, but existing sessions still show their category.
- Category ordering in UI lists is controlled by `sortOrder` (adjustable in Settings).

---

## 3. Page List

### 1. Dashboard (`/`)
Main working page:
- Table of sessions (default: today)
- Filters:
  - by category
  - by date
- Quick actions:
  - add session
  - start/stop tracking

---

### 2. Add Session (Modal or Section)
- Inputs:
  - title
  - category (select)
  - duration
  - date
- Save action

---

### 3. Tracker (Inline or Component)
- Select category
- Optional title
- Start / Stop button
- Live timer display

---

### 4. Analytics (`/stats`)
- Time spent per category
- Filter by:
  - **week preset** (Monday–Sunday, local time) or arbitrary date range
  - date range (`from` / `to`)
  - category
- **Weekly goals**: when the range is exactly one local Monday-through-Sunday week, compare tracked time per category to **weekly hour targets** set in Settings (categories with no target are omitted from the goals table).
- MVP: **summarized view only** (list of totals by category). Charts can be added later.

Implementation notes:
- Stats uses session `occurredAt` for date-range filtering and `durationSeconds` for totals.
- Default stats range when `from` / `to` are missing or invalid: **current calendar week** (local Monday 00:00 through Sunday end of day), matching the week preset control.
- Proposed query params:
  - `from`: `YYYY-MM-DD` (local date)
  - `to`: `YYYY-MM-DD` (local date)
  - `categoryId`: optional category filter

---

### 5. Settings (`/settings`)
- Manage categories:
  - add
  - remove
- **Weekly targets**: planned hours per week (Monday–Sunday, local time) per **active** category; stored as `weeklyTargetHours` on `Category` (`null` = no target).
- Export data (JSON / CSV)
- Import data

Implementation notes:
- “Remove” = archive/restore (no hard delete).
- Reordering uses simple Up/Down controls and persists via `sortOrder`.
- Data import/export (v1):
  - Export format is **versioned JSON** (CSV can be added later).
  - Category objects may include optional `weeklyTargetHours` (number or `null`).
  - Import mode is **merge**:
    - Categories merge by unique `Category.name` (import creates missing categories).
    - For categories that **already exist**, import updates `weeklyTargetHours` when that field is present on the category entry in the file (so targets round-trip with export).
    - Sessions reference categories by `categoryName` in the import file.
  - Known limitation (v1): re-importing the same file may create **duplicate sessions** (no de-duplication yet).

---

## 4. Tech Stack

### Core
- Next.js (App Router)
- TypeScript

### Database
- Prisma ORM
- SQLite (local file-based database)

---

## 4.1 Data Model (Prisma)

### Category
- `id`: string
- `name`: unique category name
- `color`: optional color (e.g. hex)
- `sortOrder`: ordering in UI lists
- `isArchived`: soft-hide category without losing history

### Session
- `id`: string
- `kind`: `MANUAL` or `TIMER`
- `title`: optional session title
- `note`: optional notes
- `categoryId`: required category relation
- `occurredAt`: timestamp used for date filtering (manual date or timer start)
- `startedAt` / `endedAt`: timer timestamps (nullable; `endedAt` nullable while running)
- `durationSeconds`: total duration (manual duration or computed on stop)

---

### UI
- Tailwind CSS
- shadcn/ui (optional)

---

### Charts / Aggregation
- Recharts (for category distribution)
- Custom aggregation logic (server-side)

---

### Data Handling
- Next.js Server Actions or API routes
- JSON / CSV import & export

---

## 5. Design Direction

### Principles
- Minimal and fast
- Data-first (focus on clarity)
- No distractions
- Optimized for daily usage

---

### UI Style
- Clean table-focused interface
- Subtle borders and spacing
- Neutral colors with light accents
- Clear typography for readability

---

### UX Priorities
- Add session in **seconds**
- Start/stop tracking instantly
- View and filter data without friction
- Keep everything on **one main screen** as much as possible

---

### Core Components
- Table (main focus)
- Filters (category, date)
- Simple form inputs
- Timer component
- Category summary (list or chart)

---

### Visual Identity
- Functional and tool-like
- Minimal icons
- No heavy branding
- Focus on usability over aesthetics

---

## Final Note

NamehAmal is a **personal utility**, not a product.

Success =
> You can log and review your time with zero friction.

Failure =
> You avoid using it because it feels slow or complicated.

Keep it simple. Always.