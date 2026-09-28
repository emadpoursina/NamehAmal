package com.namehamal.tracker.data.sync

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.syncEndpointStore by preferencesDataStore("sync_endpoint")

/** Manually saved Mac IP literal and sync port, reused across syncs (T029). */
data class DesktopEndpoint(val host: String, val port: Int) {
    private val urlHost: String get() = if (host.contains(":")) "[$host]" else host
    val baseUrl: String get() = "http://$urlHost:$port"
}

/**
 * DataStore-backed saved desktop endpoint. The user enters the Mac IP/port
 * once; Forget clears only this app's configuration (not host access).
 */
class SavedDesktopEndpoint(
    private val store: DataStore<Preferences>,
) {
    constructor(context: Context) : this(context.syncEndpointStore)

    private val hostKey = stringPreferencesKey("desktop_host")
    private val portKey = intPreferencesKey("desktop_port")

    val endpoint: Flow<DesktopEndpoint?> = store.data.map { prefs ->
        val host = prefs[hostKey]
        val port = prefs[portKey]
        if (host != null && port != null && isValidEndpoint(host, port)) {
            DesktopEndpoint(host, port)
        } else {
            null
        }
    }

    /** Validate and save the endpoint. Returns an error message, or null on success. */
    suspend fun save(host: String, port: Int): String? {
        val trimmed = normalizeHost(host.trim())
        val problem = endpointProblem(trimmed, port)
        if (problem != null) return problem
        store.edit { prefs ->
            prefs[hostKey] = trimmed
            prefs[portKey] = port
        }
        return null
    }

    /** Forget only clears this app's saved address; it is not host revocation. */
    suspend fun forget() {
        store.edit { prefs ->
            prefs.remove(hostKey)
            prefs.remove(portKey)
        }
    }

    companion object {
        fun isValidEndpoint(host: String, port: Int): Boolean =
            endpointProblem(host.trim(), port) == null

        /** Validate host syntax and port without requiring the server to be online. */
        fun endpointProblem(host: String, port: Int): String? {
            if (port < 1 || port > 65535) {
                return "Enter a port between 1 and 65535."
            }
            val normalizedHost = normalizeHost(host.trim())
            if (normalizedHost.isEmpty()) return "Enter a server address."
            if (!isValidHost(normalizedHost)) {
                return "Enter a valid IP address or host name."
            }
            return null
        }

        private val IPV4_LITERAL = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
        private val HOST_LABEL = Regex("^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$")

        private fun normalizeHost(host: String): String {
            val unwrapped = if (host.startsWith("[") && host.endsWith("]")) {
                host.substring(1, host.length - 1)
            } else {
                host
            }
            return unwrapped.removeSuffix(".")
        }

        private fun isValidHost(host: String): Boolean {
            if (IPV4_LITERAL.matches(host)) {
                val octets = host.split(".")
                return octets.all { octet ->
                    (octet.toIntOrNull() ?: 256) in 0..255 &&
                        (octet == "0" || !octet.startsWith("0"))
                }
            }
            if (host.contains(":")) {
                return try {
                    val parsed = InetAddress.getByName(host)
                    parsed is Inet6Address
                } catch (_: Exception) {
                    false
                }
            }
            if (host.length > 253) return false
            val labels = host.split(".")
            return labels.isNotEmpty() && labels.all { it.length <= 63 && HOST_LABEL.matches(it) }
        }

        /** Every DNS result must be a private, loopback, or link-local destination. */
        fun isPrivateDestination(addresses: List<InetAddress>): Boolean =
            addresses.isNotEmpty() && addresses.all(::isPrivateOrLoopback)

        private fun isPrivateOrLoopback(address: InetAddress): Boolean {
            if (address.isLoopbackAddress || address.isLinkLocalAddress) return true
            val bytes = address.address.map { it.toInt() and 0xff }
            if (address is Inet4Address) {
                return address.isSiteLocalAddress || isPrivateIpv4(bytes)
            }
            if (address is Inet6Address) {
                if ((bytes[0] and 0xfe) == 0xfc ||
                    (bytes[0] == 0xfe && (bytes[1] and 0xc0) == 0x80
                    )
                ) return true
                val mappedIpv4 = bytes.size == 16 && bytes.take(10).all { it == 0 } &&
                    bytes[10] == 0xff && bytes[11] == 0xff
                return mappedIpv4 && isPrivateIpv4(bytes.takeLast(4))
            }
            return false
        }

        private fun isPrivateIpv4(bytes: List<Int>): Boolean {
            if (bytes.size != 4) return false
            return when {
                bytes[0] == 10 -> true
                bytes[0] == 127 -> true
                bytes[0] == 169 && bytes[1] == 254 -> true
                bytes[0] == 192 && bytes[1] == 168 -> true
                bytes[0] == 172 && bytes[1] in 16..31 -> true
                else -> false
            }
        }
    }
}
