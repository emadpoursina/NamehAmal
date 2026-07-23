import { PomodoroView } from "./PomodoroView";

export default function PomodoroPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Pomodoro
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Focus and rest cycles — separate from session tracking.
        </p>
      </div>

      <PomodoroView />
    </div>
  );
}
