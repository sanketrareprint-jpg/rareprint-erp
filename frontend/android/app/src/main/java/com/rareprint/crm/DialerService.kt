package com.rareprint.crm

import android.Manifest
import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.CallLog
import android.provider.Settings
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject

/**
 * DialerService — keeps an auto-dialer session alive while the phone's own
 * call screen is in front.
 *
 *   • Runs as a foreground service with a persistent "Dialer running" notification
 *     (Pause / Stop actions), so Android doesn't kill it mid-session.
 *   • Places each call via ACTION_CALL on the chosen SIM.
 *   • Watches call state (TelephonyCallback on API 31+, PhoneStateListener below):
 *     OFFHOOK → callStarted, OFFHOOK → IDLE → reads CallLog → callEnded.
 *   • After a call ends, brings MainActivity back to the front.
 *
 * Events reach JS through CallManagerPlugin via [eventSink].
 */
class DialerService : Service() {

    companion object {
        const val ACTION_START_SESSION = "DIALER_START_SESSION"
        const val ACTION_DIAL = "DIALER_DIAL"
        const val ACTION_PAUSE = "DIALER_PAUSE"
        const val ACTION_STOP = "DIALER_STOP"
        const val EXTRA_NUMBER = "number"
        const val EXTRA_SIM_ID = "simId"

        private const val CHANNEL_ID = "rareprint_dialer"
        private const val NOTIF_ID = 1002
        private const val RETURN_CHANNEL_ID = "rareprint_dialer_return"
        private const val RETURN_NOTIF_ID = 1003
        private const val RETURN_NOTIF_TIMEOUT_MS = 15000L

        /** Wait after IDLE before reading CallLog — the system writes the entry a moment late. */
        private const val CALL_LOG_DELAY_MS = 1500L
        /** If the call never goes OFFHOOK within this time, report it as ended (not started). */
        private const val NO_START_TIMEOUT_MS = 20000L

        /** Set by CallManagerPlugin; forwards (eventName, data) to JS listeners. */
        @Volatile var eventSink: ((String, JSObject) -> Unit)? = null

        @Volatile var isRunning = false
            private set

        fun findPhoneAccount(ctx: Context, simId: String?): PhoneAccountHandle? {
            if (simId.isNullOrBlank()) return null
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED
            ) return null
            val telecom = ctx.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            return try {
                telecom.callCapablePhoneAccounts.firstOrNull { it.id == simId }
            } catch (_: SecurityException) { null }
        }

        /** SIM slot index (0/1) for a phone account, or -1 if it can't be determined. */
        fun slotIndexFor(ctx: Context, handle: PhoneAccountHandle): Int {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return -1
            return try {
                val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
                val subId = tm.getSubscriptionId(handle)
                val sm = ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE)
                        as android.telephony.SubscriptionManager
                sm.getActiveSubscriptionInfo(subId)?.simSlotIndex ?: -1
            } catch (_: Exception) { -1 }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private var telephonyManager: TelephonyManager? = null
    private var telephonyCallback: TelephonyCallback? = null
    private var phoneStateListener: PhoneStateListener? = null

    // State of the call placed by the dialer (only one at a time)
    private var activeNumber: String? = null
    private var dialedAt = 0L
    private var offhookAt = 0L
    private var lastState = TelephonyManager.CALL_STATE_IDLE
    private var noStartTimeout: Runnable? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        telephonyManager = getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_SESSION -> {
                goForeground()
                attachCallStateListener()
                isRunning = true
            }
            ACTION_DIAL -> {
                // Already foreground for calls 2+; re-calling startForeground from the
                // background can be refused on Android 12+, so only do it once.
                if (!isRunning) goForeground()
                attachCallStateListener()
                isRunning = true
                val number = intent.getStringExtra(EXTRA_NUMBER)
                if (number.isNullOrBlank()) {
                    emit("dialerError", JSObject().put("message", "No number given"))
                } else {
                    placeCall(number, intent.getStringExtra(EXTRA_SIM_ID))
                }
            }
            // Notification buttons: JS owns the queue, so just tell it what was tapped.
            ACTION_PAUSE -> emit("dialerControl", JSObject().put("action", "pause"))
            ACTION_STOP -> {
                emit("dialerControl", JSObject().put("action", "stop"))
                stopSession()
            }
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        detachCallStateListener()
        noStartTimeout?.let { handler.removeCallbacks(it) }
        isRunning = false
        super.onDestroy()
    }

    private fun stopSession() {
        detachCallStateListener()
        noStartTimeout?.let { handler.removeCallbacks(it) }
        activeNumber = null
        isRunning = false
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // ── Placing the call ──────────────────────────────────────────────────────

    private fun placeCall(number: String, simId: String?) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            emit("dialerError", JSObject().put("message", "CALL_PHONE permission missing"))
            return
        }

        val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(number))).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        val handle = findPhoneAccount(this, simId)
        if (handle != null) {
            intent.putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle)
            // Some OEM dialers (Xiaomi/Samsung/Vivo) ignore the standard handle and
            // read a slot index instead — pass it too so the SIM picker doesn't appear.
            val slot = slotIndexFor(this, handle)
            if (slot >= 0) {
                intent.putExtra("com.android.phone.force.slot", true)
                intent.putExtra("com.android.phone.extra.slot", slot)
                intent.putExtra("slot", slot)
                intent.putExtra("simSlot", slot)
                intent.putExtra("subscription", slot)
            }
        }

        activeNumber = number
        dialedAt = System.currentTimeMillis()
        offhookAt = 0L
        updateNotification("Calling $number")

        try {
            startActivity(intent)
        } catch (e: Exception) {
            activeNumber = null
            emit("dialerError", JSObject().put("message", "Could not start call: ${e.message}"))
            return
        }

        noStartTimeout?.let { handler.removeCallbacks(it) }
        noStartTimeout = Runnable {
            if (activeNumber == number && offhookAt == 0L) {
                activeNumber = null
                emit("callEnded", JSObject()
                    .put("number", number)
                    .put("durationSec", 0)
                    .put("answered", false)
                    .put("startedAt", dialedAt)
                    .put("callType", "NOT_STARTED"))
                bringAppToFront()
            }
        }
        handler.postDelayed(noStartTimeout!!, NO_START_TIMEOUT_MS)
    }

    // ── Call-state tracking ───────────────────────────────────────────────────

    private fun onCallState(state: Int) {
        if (state == lastState) return
        val prev = lastState
        lastState = state
        val number = activeNumber ?: return   // not a dialer call — ignore

        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> {
                offhookAt = System.currentTimeMillis()
                noStartTimeout?.let { handler.removeCallbacks(it) }
                updateNotification("On call: $number")
                emit("callStarted", JSObject()
                    .put("number", number)
                    .put("startedAt", dialedAt))
            }
            TelephonyManager.CALL_STATE_IDLE -> {
                if (prev != TelephonyManager.CALL_STATE_OFFHOOK) return
                activeNumber = null
                val startedAt = dialedAt
                updateNotification("Dialer running")
                handler.postDelayed({ finishCall(number, startedAt, retry = true) }, CALL_LOG_DELAY_MS)
            }
        }
    }

    /** Reads the real duration/type from CallLog, then emits callEnded. */
    private fun finishCall(number: String, startedAt: Long, retry: Boolean) {
        val entry = readCallLog(number, startedAt)
        if (entry == null && retry) {
            // Some OEMs write the log entry later — try once more.
            handler.postDelayed({ finishCall(number, startedAt, retry = false) }, CALL_LOG_DELAY_MS)
            return
        }
        val durationSec = entry?.first ?: 0L
        emit("callEnded", JSObject()
            .put("number", number)
            .put("durationSec", durationSec)
            .put("answered", durationSec > 0)
            .put("startedAt", startedAt)
            .put("callType", entry?.second ?: "NOT_IN_CALL_LOG"))
        bringAppToFront()
    }

    /** Latest CallLog entry for [number] placed at/after [sinceMs]: (durationSec, type). */
    private fun readCallLog(number: String, sinceMs: Long): Pair<Long, String>? {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CALL_LOG)
            != PackageManager.PERMISSION_GRANTED
        ) return null
        val target = number.filter { it.isDigit() }.takeLast(10)
        return try {
            contentResolver.query(
                CallLog.Calls.CONTENT_URI,
                arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DURATION),
                "${CallLog.Calls.DATE} >= ?",
                arrayOf((sinceMs - 5000).toString()),
                "${CallLog.Calls.DATE} DESC"
            )?.use { c ->
                while (c.moveToNext()) {
                    val n = (c.getString(0) ?: "").filter { it.isDigit() }.takeLast(10)
                    if (n == target) {
                        val type = when (c.getInt(1)) {
                            CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                            CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                            CallLog.Calls.MISSED_TYPE -> "MISSED"
                            else -> "OTHER"
                        }
                        return@use Pair(c.getLong(2), type)
                    }
                }
                null
            }
        } catch (_: Exception) { null }
    }

    private fun attachCallStateListener() {
        if (telephonyCallback != null || phoneStateListener != null) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            emit("dialerError", JSObject().put("message", "READ_PHONE_STATE permission missing"))
            return
        }
        lastState = telephonyManager?.currentCallState() ?: TelephonyManager.CALL_STATE_IDLE

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handler.post { onCallState(state) }
                }
            }
            telephonyManager?.registerTelephonyCallback(mainExecutor, cb)
            telephonyCallback = cb
        } else {
            @Suppress("DEPRECATION")
            val l = object : PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    onCallState(state)
                }
            }
            @Suppress("DEPRECATION")
            telephonyManager?.listen(l, PhoneStateListener.LISTEN_CALL_STATE)
            phoneStateListener = l
        }
    }

    private fun detachCallStateListener() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            telephonyCallback?.let { telephonyManager?.unregisterTelephonyCallback(it) }
        }
        phoneStateListener?.let {
            @Suppress("DEPRECATION")
            telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
        }
        telephonyCallback = null
        phoneStateListener = null
    }

    private fun TelephonyManager.currentCallState(): Int = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) callStateForSubscription
        else @Suppress("DEPRECATION") callState
    } catch (_: SecurityException) { TelephonyManager.CALL_STATE_IDLE }

    // ── Back to the app after a call ──────────────────────────────────────────

    /**
     * Android 10+ blocks activity starts from the background unless the app holds
     * "Display over other apps" (SYSTEM_ALERT_WINDOW). With it, we jump straight
     * back; without it, the notification's tap target is the fallback.
     */
    private fun bringAppToFront() {
        val canStart = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q ||
                Settings.canDrawOverlays(this)
        if (!canStart) {
            showReturnFullScreenIntent()
            return
        }
        try {
            startActivity(Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP
            })
        } catch (_: Exception) {
            showReturnFullScreenIntent()
        }
    }

    /**
     * Fallback when the overlay route isn't allowed: a full-screen-intent
     * notification. Android opens the app directly when the screen is off/locked,
     * and shows a heads-up "Return to dialer" banner when the phone is in use.
     */
    private fun showReturnFullScreenIntent() {
        updateNotification("Call ended — tap to return to the dialer")
        val returnIntent = PendingIntent.getActivity(
            this, 3,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notification = NotificationCompat.Builder(this, RETURN_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle("Call ended")
            .setContentText("Tap to return to the RarePrint dialer")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(returnIntent)
            .setFullScreenIntent(returnIntent, true)
            .setAutoCancel(true)
            .setTimeoutAfter(RETURN_NOTIF_TIMEOUT_MS)
            .build()
        getSystemService(NotificationManager::class.java).notify(RETURN_NOTIF_ID, notification)
    }

    // ── Notification ──────────────────────────────────────────────────────────

    private fun goForeground() {
        val notification = buildNotification("Dialer running")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ServiceCompat.startForeground(
                this, NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            )
        } else {
            startForeground(NOTIF_ID, notification)
        }
    }

    private fun updateNotification(text: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIF_ID, buildNotification(text))
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "RarePrint Auto Dialer", NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shown while the auto dialer session is running"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
            val returnChannel = NotificationChannel(
                RETURN_CHANNEL_ID, "RarePrint Dialer — return after call", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Brings the dialer back after each call ends"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(returnChannel)
        }
    }

    private fun buildNotification(text: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val pauseIntent = PendingIntent.getService(
            this, 1,
            Intent(this, DialerService::class.java).setAction(ACTION_PAUSE),
            PendingIntent.FLAG_IMMUTABLE
        )
        val stopIntent = PendingIntent.getService(
            this, 2,
            Intent(this, DialerService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle("RarePrint Dialer")
            .setContentText(text)
            .setContentIntent(openIntent)
            .addAction(0, "Pause", pauseIntent)
            .addAction(0, "Stop", stopIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun emit(event: String, data: JSObject) {
        handler.post { eventSink?.invoke(event, data) }
    }
}
