"use client";

import { useMemo, useRef, useState } from "react";
import {
  toActivitySelection,
  useActivities,
  type ActivityListItem,
  type ActivitySelection,
} from "@/app/lib/use-activities";

const inputClassName =
  "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-800 dark:bg-black dark:text-zinc-50";

function filterActivities(activities: ActivityListItem[], query: string) {
  const normalized = query.trim().toLowerCase();

  const matches = normalized
    ? activities.filter((activity) =>
        activity.title.toLowerCase().startsWith(normalized),
      )
    : activities;

  return [...matches].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

// Reusable activity autocomplete combobox for tracker and manual session forms.
export function ActivityCombobox({
  value,
  onValueChange,
  onSelect,
  onClear,
  placeholder = "Search activities…",
  disabled = false,
  onCreateNew,
  createNewLabel = "Create new activity",
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSelect: (activity: ActivitySelection) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  onCreateNew?: () => void;
  createNewLabel?: string;
}) {
  const { activities, loading, error } = useActivities();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const matches = useMemo(
    () => filterActivities(activities, value),
    [activities, value],
  );

  const showCreateNew = Boolean(onCreateNew);
  const optionCount = matches.length + (showCreateNew ? 1 : 0);

  function closeList() {
    setOpen(false);
    setHighlightIndex(0);
  }

  function selectActivity(activity: ActivityListItem) {
    onSelect(toActivitySelection(activity));
    onValueChange(activity.title);
    closeList();
  }

  function handleInputChange(next: string) {
    onValueChange(next);
    setOpen(true);
    setHighlightIndex(0);
    if (!next.trim()) onClear?.();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      closeList();
      return;
    }

    if (!open || optionCount === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((idx) => (idx + 1) % optionCount);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((idx) => (idx - 1 + optionCount) % optionCount);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex < matches.length) {
        selectActivity(matches[highlightIndex]);
        return;
      }
      if (showCreateNew && onCreateNew) {
        onCreateNew();
        closeList();
      }
    }
  }

  const emptyMessage = loading
    ? "Loading activities…"
    : activities.length === 0
      ? "No activities yet"
      : value.trim()
        ? "No matches"
        : "No activities yet";

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          if (containerRef.current?.contains(e.relatedTarget as Node | null)) {
            return;
          }
          closeList();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || loading}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls="activity-combobox-listbox"
        aria-autocomplete="list"
        className={inputClassName}
      />

      {error ? (
        <div className="text-xs text-red-700 dark:text-red-300">{error}</div>
      ) : null}

      {open && !disabled ? (
        <div
          id="activity-combobox-listbox"
          role="listbox"
          className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-800 dark:bg-black"
        >
          {matches.length === 0 && !showCreateNew ? (
            <div className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-400">
              {emptyMessage}
            </div>
          ) : null}

          {matches.map((activity, index) => (
            <button
              key={activity.id}
              type="button"
              role="option"
              aria-selected={highlightIndex === index}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightIndex(index)}
              onClick={() => selectActivity(activity)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                highlightIndex === index
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
                  : "text-zinc-800 dark:text-zinc-200"
              }`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: activity.color ?? activity.category.color ?? "#71717a",
                }}
                aria-hidden
              />
              <span className="truncate">{activity.title}</span>
              {activity.isPinned ? (
                <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
                  Pinned
                </span>
              ) : null}
            </button>
          ))}

          {showCreateNew ? (
            <button
              type="button"
              role="option"
              aria-selected={highlightIndex === matches.length}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightIndex(matches.length)}
              onClick={() => {
                onCreateNew?.();
                closeList();
              }}
              className={`flex w-full items-center px-3 py-2 text-left text-sm font-medium ${
                highlightIndex === matches.length
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-50"
                  : "text-zinc-700 dark:text-zinc-300"
              }`}
            >
              {createNewLabel}
            </button>
          ) : null}

          {matches.length === 0 && showCreateNew ? (
            <div className="border-t border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {emptyMessage}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type { ActivitySelection };
