---
id: activity-presets
title: Activity Presets
status: completed
created: 2026-07-15T05:43:00Z
completed_at: 2026-07-15T17:20:13.929Z
---

# Intent: Activity Presets

## Goal

Introduce reusable **activity presets** so tracking a repeated activity is faster and its category is bound once. Picking an activity **pre-fills** fields only (title + category, and default duration on the manual form) — it never auto-starts a timer or auto-saves a session. The user still clicks Start/Save.

## Users

Single user (the app owner), local-first app. No authentication, no multi-tenant concerns.

## Problem

Today every tracked session requires re-typing the activity title (free-text `Session.title`) and re-selecting the category, even for activities that recur many times a week whose category never changes. This makes recording slow (problem 1) and forces redundant category selection for activities whose category is stable (problem 2).

## Success Criteria

- Define an activity once → record N sessions of it without retyping the title or re-selecting the category.
- After editing an activity's category, previously recorded sessions keep their original category (category is a snapshot copied at session-creation time).
- Create a new activity inline from three locations: the Tracker card, the Add-session form, and the Sessions table.
- Autocomplete picker filters activities by typed prefix and sorts results alphabetically (e.g. `w` → `work`, `working`; `worki` → `working`).
- Archived activities are hidden from the picker but preserved on past sessions and remain manageable (unarchive-able) in Settings.
- An activity whose category has been archived is disabled in the picker until its category is reassigned in Settings.
- Activity titles are unique.

## Constraints

- Follow existing stack and patterns: Next.js App Router, TypeScript, Prisma, SQLite.
- Reuse existing UI conventions (current Settings/categories pages, active-timer refresh bus, dashboard server component data passing).
- `Session.categoryId` remains an independent snapshot stored per session; do not derive session category from the activity at read time.
- No external integrations.
- No auto-discovery of recent activities from history in v1 (explicit out-of-scope).
- No one-tap auto-start or auto-save in v1 (explicit out-of-scope); presets only pre-fill.

## Notes

### Data model (proposed)

New `Activity` model linked to `Category`:

```
Activity {
  id          String   @id @default(cuid())
  title       String   @unique          // used as both display label and Session.title value
  categoryId  String
  category    Category @relation(...)
  defaultDurationSeconds Int?           // pre-fills end = start + duration on manual form
  color       String?
  sortOrder   Int      @default(0)
  isPinned    Boolean  @default(false)
  isArchived  Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

Add `activities Activity[]` to `Category`. No required `Session.activityId` link in v1 (optional future enhancement for stats/rename propagation).

### Scope (v1 — in)

- Prisma migration adding `Activity`.
- Activities CRUD API: `app/api/activities/route.ts` + `app/api/activities/[id]/route.ts`.
- Settings management UI: create, edit, archive, reorder, pin.
- Autocomplete combobox (prefix-filter + alphabetical) on Tracker card and Add-session form — pre-fills title + category (+ default duration on manual form).
- Inline "new activity" button on Add-session form, Tracker card, and Sessions table.
- Enforce unique titles.

### Scope (v1 — out)

- Auto-discovery of recent activities from session history.
- One-tap auto-start / auto-save.
- `Session.activityId` link (deferred).

### Key behaviors

- Category is a **default**, changeable per session.
- Picking an activity pre-fills; user still clicks Start/Save.
- Manual form: when an activity with `defaultDurationSeconds` is picked, set end = start + default duration.
- Tracker presets show only when idle (no timer running).
- Archived activities: hidden from picker, kept on past sessions, listed/unarchive-able in Settings.
- Activity whose category is archived: disabled in picker; user must reassign category in Settings to re-enable.
- Empty picker state: simple "no activities yet" message with a create affordance.
