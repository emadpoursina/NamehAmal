package com.namehamal.tracker.ui.checkin

import com.namehamal.tracker.domain.WorkdayController

class CheckInFlowViewModel(private val controller: WorkdayController) {
    suspend fun sameActivity(confirm: suspend () -> Unit) = confirm()
    suspend fun changeActivity(activityId: String?) = controller.changeActivity(activityId)
    suspend fun recordBreak() = controller.startBreak()
    suspend fun endWorkday() = controller.endWorkday()
}
