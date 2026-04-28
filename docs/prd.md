# 🕒 NamehAmal — Personal Time Tracker PRD

---

## 1. Context

### Overview
NamehAmal is a **minimal, local-first time tracking app** designed for personal use.  
The goal is to track time **session-by-session**, categorize it, and generate simple insights over time.

### Problem
Current tracking methods are:
- inconsistent
- manual or fragmented
- lacking meaningful insights

The user needs:
- a **fast, frictionless way** to track sessions
- the ability to **analyze time spent per category**
- a system that is **fully controlled locally**

### Goals
- Track time sessions easily
- Categorize activities
- Generate daily, weekly, and monthly stats
- Keep everything minimal and fast

### Non-Goals
- No authentication
- No multi-user support
- No cloud sync (for now)
- No complex productivity systems (e.g. goals, habits)

---

## 2. User Journey

### Primary Flow

#### Start Session
1. User opens app
2. Selects or types a category
3. Clicks "Start"
4. Timer begins

#### End Session
1. User clicks "Stop"
2. Session is saved automatically
3. (Optional) User adds a note

---

### Secondary Flow

#### View Stats
1. User navigates to Stats page
2. Sees:
   - total time today
   - breakdown by category
   - charts (daily / weekly / monthly)

---

### Data Control Flow

#### Export Data
1. User clicks "Export"
2. Downloads JSON (or CSV)

#### Import Data
1. User uploads file
2. Data is merged or replaced

---

## 3. Page List

### 1. Dashboard (`/`)
- Today summary
- Active session (if running)
- Quick start/stop
- Recent sessions

---

### 2. Tracker (`/track`)
- Category input (select or create)
- Start / Stop button
- Live timer display

---

### 3. Stats (`/stats`)
- Daily / Weekly / Monthly views
- Charts:
  - time per category
  - trend over time

---

### 4. Settings (`/settings`)
- Export data (JSON / CSV)
- Import data
- Reset data (optional)

---

## 4. Tech Stack

### Core
- Next.js (App Router)
- TypeScript

### Database
- Prisma ORM
- SQLite (local file-based database)

### UI
- Tailwind CSS
- shadcn/ui (optional components)

### Charts
- Recharts

### Data Handling
- Server Actions / API Routes (Next.js)
- Local file export/import (JSON/CSV)

---

## 5. Design Direction

### Principles
- Minimal
- Fast
- Distraction-free
- Developer-friendly (clean codebase, readable UI)

---

### UI Style
- Clean, whitespace-heavy layout
- Subtle borders and soft shadows
- Neutral color palette (gray-based)
- Accent color for active session (e.g. green)

---

### UX Priorities
- Start tracking in **< 2 seconds**
- No unnecessary clicks
- Always show:
  - current state (tracking / idle)
  - today’s progress

---

### Components
- Simple buttons (Start / Stop)
- Input with quick category selection
- Cards for stats
- Lightweight charts

---

### Visual Identity
- Monospaced elements for time (optional)
- Minimal icons
- No heavy branding — tool-like feel

---

## Final Note

NamehAmal is not a product — it’s a **personal system**.

Success =  
> You actually use it every day without thinking.

Failure =  
> It feels heavy, slow, or annoying to open.

Keep it simple.