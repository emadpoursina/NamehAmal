package com.namehamal.tracker.ui.checkin

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.namehamal.tracker.notifications.CheckInNotification

@Composable
fun NotificationPermissionCard() {
    val context = LocalContext.current
    val permissionGranted = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(
        context, Manifest.permission.POST_NOTIFICATIONS,
    ) == PackageManager.PERMISSION_GRANTED
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }

    Card(Modifier.padding(vertical = 8.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text("Hourly check-ins")
            Text(CheckInNotification.PERMISSION_EXPLANATION)
            if (!permissionGranted && Build.VERSION.SDK_INT >= 33) {
                Row(Modifier.padding(top = 8.dp)) {
                    Button(onClick = { permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS) }) {
                        Text("Allow notifications")
                    }
                }
            } else {
                Text("Check-in and timeline review remain available here if a reminder is delayed.")
            }
        }
    }
}
