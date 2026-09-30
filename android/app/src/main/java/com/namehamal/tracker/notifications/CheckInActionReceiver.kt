package com.namehamal.tracker.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.namehamal.tracker.MainActivity
import com.namehamal.tracker.TrackerApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class CheckInActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as? TrackerApplication ?: return
        when (intent.action) {
            ACTION_CONFIRM -> {
                val checkInId = intent.getStringExtra(EXTRA_CHECK_IN_ID) ?: return
                val pending = goAsync()
                CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                    try {
                        val repository = app.timelineRepository
                        // Session reminders confirm by running session; workday markers fall back.
                        if (!repository.confirmSessionCheckIn(checkInId)) {
                            repository.confirmCheckIn(checkInId)
                        }
                    } finally {
                        pending.finish()
                    }
                }
            }
            else -> context.startActivity(
                Intent(context, MainActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            )
        }
    }

    companion object {
        const val ACTION_CONFIRM = "com.namehamal.tracker.action.CONFIRM_CHECK_IN"
        const val EXTRA_CHECK_IN_ID = "checkInId"
    }
}
