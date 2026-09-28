package com.namehamal.tracker.data.sync

import java.io.IOException
import java.net.InetAddress
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Outcome of one sync HTTP call. */
sealed interface SyncCallResult<out T> {
    data class Ok<T>(val value: T) : SyncCallResult<T>
    data class Failure(val kind: SyncFailureKind, val message: String) : SyncCallResult<Nothing>
}

enum class SyncFailureKind {
    /** Unreachable host, timeout, or denied local-network access: keep data, allow retry. */
    CONNECTION,
    /** Malformed payload or unknown endpoint. */
    PROTOCOL,
    /** Host speaks another protocol version: keep data, show update message. */
    VERSION,
    /** Host temporarily unavailable: keep data, allow retry. */
    HOST,
}

/**
 * Plain-HTTP client for the two versioned sync routes (T031).
 * Trusted private LAN only: no TLS, QR, HMAC, or per-device auth.
 * Called only from a user-started Sync flow; no polling or background use.
 */
interface AndroidSyncApi {
    suspend fun getStatus(endpoint: DesktopEndpoint): SyncCallResult<Map<String, Any?>>
    suspend fun postExchange(endpoint: DesktopEndpoint, requestJson: String): SyncCallResult<Map<String, Any?>>
}

class HttpAndroidSyncApi(
    private val connectTimeoutMs: Int = 15_000,
    private val readTimeoutMs: Int = 30_000,
    private val resolveAddresses: (String) -> List<InetAddress> = { host ->
        InetAddress.getAllByName(host).toList()
    },
) : AndroidSyncApi {
    override suspend fun getStatus(endpoint: DesktopEndpoint): SyncCallResult<Map<String, Any?>> =
        get(endpoint, STATUS_PATH)

    override suspend fun postExchange(
        endpoint: DesktopEndpoint,
        requestJson: String,
    ): SyncCallResult<Map<String, Any?>> = post(endpoint, EXCHANGE_PATH, requestJson)

    private suspend fun get(
        endpoint: DesktopEndpoint,
        path: String,
    ): SyncCallResult<Map<String, Any?>> = withContext(Dispatchers.IO) {
        destinationFailure(endpoint)?.let { return@withContext it }
        request("GET", endpoint.baseUrl + path, null)
    }

    private suspend fun post(
        endpoint: DesktopEndpoint,
        path: String,
        body: String,
    ): SyncCallResult<Map<String, Any?>> = withContext(Dispatchers.IO) {
        if (body.toByteArray(Charsets.UTF_8).size > MAX_BODY_BYTES) {
            return@withContext SyncCallResult.Failure(
                SyncFailureKind.PROTOCOL,
                "Sync batch is too large; it will be split before retry.",
            )
        }
        destinationFailure(endpoint)?.let { return@withContext it }
        request("POST", endpoint.baseUrl + path, body)
    }

    private fun destinationFailure(endpoint: DesktopEndpoint): SyncCallResult.Failure? {
        val addresses = try {
            resolveAddresses(endpoint.host)
        } catch (_: Exception) {
            return SyncCallResult.Failure(
                SyncFailureKind.CONNECTION,
                "Could not resolve the saved server address. Check the address and network, then retry.",
            )
        }
        if (!SavedDesktopEndpoint.isPrivateDestination(addresses)) {
            return SyncCallResult.Failure(
                SyncFailureKind.CONNECTION,
                "Sync can connect only to a private-network server. No phone data was sent.",
            )
        }
        return null
    }

    private fun request(
        method: String,
        url: String,
        body: String?,
    ): SyncCallResult<Map<String, Any?>> {
        val connection: HttpURLConnection
        try {
            connection = URL(url).openConnection() as HttpURLConnection
        } catch (e: IOException) {
            // Includes denied local-network access: fail safely, keep all data.
            return SyncCallResult.Failure(
                SyncFailureKind.CONNECTION,
                "Could not reach the desktop at the saved address. Check the IP, port, and network, then retry.",
            )
        }
        try {
            connection.requestMethod = method
            connection.connectTimeout = connectTimeoutMs
            connection.readTimeout = readTimeoutMs
            connection.setRequestProperty("Cache-Control", "no-store")
            connection.setRequestProperty("Accept", "application/json")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = try {
                connection.responseCode
            } catch (e: IOException) {
                return SyncCallResult.Failure(
                    SyncFailureKind.CONNECTION,
                    "Sync did not complete. All phone data is kept; retry when the desktop is reachable.",
                )
            }
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = try {
                stream?.bufferedReader(Charsets.UTF_8)?.readText().orEmpty()
            } catch (e: IOException) {
                ""
            }
            if (status in 200..299) {
                return try {
                    SyncCallResult.Ok(SyncJson.asObject(SyncJson.parse(text)))
                } catch (e: IllegalArgumentException) {
                    SyncCallResult.Failure(SyncFailureKind.PROTOCOL, "The desktop returned an unreadable reply; nothing was changed.")
                }
            }
            return mapHttpError(status, text)
        } finally {
            connection.disconnect()
        }
    }

    private fun mapHttpError(status: Int, text: String): SyncCallResult.Failure {
        val detail = try {
            SyncJson.asString(SyncJson.asObject(SyncJson.parse(text))["error"])
        } catch (_: IllegalArgumentException) {
            null
        }
        return when (status) {
            400 -> SyncCallResult.Failure(
                SyncFailureKind.PROTOCOL,
                detail ?: "The desktop rejected the sync data; nothing was changed.",
            )
            404 -> SyncCallResult.Failure(
                SyncFailureKind.PROTOCOL,
                "No sync endpoint at the saved address. Check the IP and port, then retry.",
            )
            409 -> SyncCallResult.Failure(
                SyncFailureKind.VERSION,
                detail ?: "The desktop needs a compatible app version; nothing was changed.",
            )
            413 -> SyncCallResult.Failure(
                SyncFailureKind.PROTOCOL,
                "Sync batch is too large; it will be split before retry.",
            )
            else -> SyncCallResult.Failure(
                SyncFailureKind.HOST,
                detail ?: "Sync did not complete. All phone data is kept; retry.",
            )
        }
    }

    companion object {
        const val STATUS_PATH = "/api/sync/v1/status"
        const val EXCHANGE_PATH = "/api/sync/v1/exchange"
        const val MAX_BODY_BYTES = 1_000_000
    }
}
