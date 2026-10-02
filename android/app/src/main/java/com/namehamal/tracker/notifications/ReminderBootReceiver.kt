package com.namehamal.tracker.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.namehamal.tracker.TrackerApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Re-enqueues the always-on reminder chain after a reboot from persisted settings.
 *
 * WorkManager persists its own queue across reboots, so this is defense-in-depth: it guarantees
 * the chain reflects the stored enabled/cycle/window even if the persisted work was cleared
 * (force-stop, OEM task killer) or is still waiting on WorkManager's own boot handling.
 */
class ReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val pending = goAsync()
        CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
            try {
                val app = context.applicationContext as? TrackerApplication ?: return@launch
                val settings = app.reminderSettingsStore.settings.first()
                if (settings.enabled) {
                    app.reminderScheduler.scheduleNext(settings)
                } else {
                    app.reminderScheduler.cancelAll()
                }
            } catch (_: Exception) {
                // Never crash boot; the next app start re-enqueues from the same settings.
            } finally {
                pending.finish()
            }
        }
    }
}
