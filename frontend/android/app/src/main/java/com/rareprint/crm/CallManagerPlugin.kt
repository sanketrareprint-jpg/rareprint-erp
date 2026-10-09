package com.rareprint.crm

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.CallLog
import android.provider.Settings
import android.telecom.TelecomManager
import android.telephony.PhoneStateListener
import android.telephony.TelephonyManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.*
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * RarePrint CRM — CallManagerPlugin
 *
 * Provides three native capabilities to the web CRM:
 *   1. Phone-state monitoring  — detects IDLE / RINGING / OFFHOOK in real time
 *   2. Display-over-other-apps — shows a floating overlay while a call is active
 *   3. Call-log access         — reads the system call log so outcomes are auto-filled
 */
@CapacitorPlugin(
    name = "CallManager",
    permissions = [
        Permission(
            strings = [Manifest.permission.READ_PHONE_STATE],
            alias = "phoneState"
        ),
        Permission(
            strings = [Manifest.permission.READ_CALL_LOG, Manifest.permission.WRITE_CALL_LOG],
            alias = "callLog"
        ),
        Permission(
            strings = [Manifest.permission.CALL_PHONE],
            alias = "callPhone"
        ),
        Permission(
            strings = [Manifest.permission.POST_NOTIFICATIONS],
            alias = "notifications"
        ),
        Permission(
            strings = [Manifest.permission.ANSWER_PHONE_CALLS],
            alias = "endCall"
        )
    ]
)
class CallManagerPlugin : Plugin() {

    // ── Phone-state listener ─────────────────────────────────────────────────
    private var phoneStateListener: PhoneStateListener? = null
    private var telephonyManager: TelephonyManager? = null
    private var lastState = TelephonyManager.CALL_STATE_IDLE
    private var callStartTime = 0L

    // ── Overlay service ──────────────────────────────────────────────────────
    private var overlayActive = false

    // ── Lifecycle ────────────────────────────────────────────────────────────

    override fun load() {
        telephonyManager =
            context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        // Auto-dialer events (callStarted / callEnded / dialerControl / dialerError).
        // retainUntilConsumed = true so an event fired while the WebView had no
        // listener attached yet is delivered once JS subscribes.
        DialerService.eventSink = { event, data -> notifyListeners(event, data, true) }
    }

    // ── Auto dialer ───────────────────────────────────────────────────────────

    private fun isGranted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun dialerPermissionStatus(): JSObject {
        val callPhone = isGranted(Manifest.permission.CALL_PHONE)
        val phoneState = isGranted(Manifest.permission.READ_PHONE_STATE)
        val callLog = isGranted(Manifest.permission.READ_CALL_LOG)
        val notifications = NotificationManagerCompat.from(context).areNotificationsEnabled()
        val overlay = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(context)
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        val batteryUnrestricted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M ||
                power.isIgnoringBatteryOptimizations(context.packageName)
        return JSObject()
            .put("callPhone", callPhone)
            .put("phoneState", phoneState)
            .put("callLog", callLog)
            .put("notifications", notifications)
            .put("overlay", overlay)
            .put("batteryUnrestricted", batteryUnrestricted)
            .put("allGranted", callPhone && phoneState && callLog && notifications && overlay)
            // Optional (not part of allGranted): lets "End call" on the PC hang up the phone.
            .put("endCall", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && isGranted(Manifest.permission.ANSWER_PHONE_CALLS))
            .put("brand", Build.MANUFACTURER ?: "")
    }

    /**
     * Status of everything the auto dialer needs. Overrides Capacitor's generic
     * checkPermissions so JS gets one flat status object (incl. overlay/battery,
     * which aren't runtime-permission aliases).
     */
    @PluginMethod
    override fun checkPermissions(call: PluginCall) {
        call.resolve(dialerPermissionStatus())
    }

    /** Ask for call / phone-state / call-log (+ notifications on Android 13+) in one prompt. */
    @PluginMethod
    override fun requestPermissions(call: PluginCall) {
        val aliases = mutableListOf("callPhone", "phoneState", "callLog")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) aliases.add("notifications")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) aliases.add("endCall")
        requestPermissionForAliases(aliases.toTypedArray(), call, "dialerPermissionsCallback")
    }

    @PermissionCallback
    private fun dialerPermissionsCallback(call: PluginCall) {
        call.resolve(dialerPermissionStatus())
    }

    /** Opens this app's page in Android Settings (for permissions the user denied permanently). */
    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        val intent = Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.parse("package:${context.packageName}")
        ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
        context.startActivity(intent)
        call.resolve()
    }

    /** Shows the system "Allow app to run in background?" dialog. */
    @SuppressLint("BatteryLife")
    @PluginMethod
    fun requestIgnoreBatteryOptimizations(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val intent = Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:${context.packageName}")
            ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
            try {
                context.startActivity(intent)
            } catch (_: Exception) {
                context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
                    .apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK })
            }
        }
        call.resolve()
    }

    /** SIMs that can place calls: { sims: [ { id, label, slotIndex } ] }. */
    @PluginMethod
    fun listSims(call: PluginCall) {
        if (!isGranted(Manifest.permission.READ_PHONE_STATE)) {
            call.reject("READ_PHONE_STATE permission not granted")
            return
        }
        val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        val sims = JSArray()
        try {
            telecom.callCapablePhoneAccounts.forEach { handle ->
                val slot = DialerService.slotIndexFor(context, handle)
                sims.put(JSObject()
                    .put("id", handle.id)
                    .put("label", DialerService.simLabel(context, handle, slot))
                    .put("slotIndex", slot))
            }
        } catch (e: SecurityException) {
            call.reject("Could not read SIMs: ${e.message}")
            return
        }
        call.resolve(JSObject().put("sims", sims))
    }

    /** Starts the foreground "Dialer running" session (call before the first startCall). */
    @PluginMethod
    fun startDialerSession(call: PluginCall) {
        val intent = Intent(context, DialerService::class.java)
            .setAction(DialerService.ACTION_START_SESSION)
        try {
            ContextCompat.startForegroundService(context, intent)
        } catch (e: Exception) {
            // e.g. ForegroundServiceStartNotAllowedException when the screen is off —
            // report it instead of crashing the app.
            call.reject("Android didn't allow the dialer to start (${e.javaClass.simpleName}). Keep RarePrint open on screen and tap Start again.")
            return
        }
        call.resolve()
    }

    /** Ends the session and removes the notification. */
    @PluginMethod
    fun stopDialerSession(call: PluginCall) {
        if (DialerService.isRunning) {
            context.startService(
                Intent(context, DialerService::class.java).setAction(DialerService.ACTION_STOP_FROM_APP)
            )
        }
        call.resolve()
    }

    /**
     * Places a call on the chosen SIM with no tap: { number, simId? }.
     * Result arrives later as callStarted / callEnded events.
     */
    @PluginMethod
    fun startCall(call: PluginCall) {
        val number = call.getString("number")
        if (number.isNullOrBlank()) {
            call.reject("number is required")
            return
        }
        if (!isGranted(Manifest.permission.CALL_PHONE) || !isGranted(Manifest.permission.READ_PHONE_STATE)) {
            call.reject("Call / phone-state permission missing")
            return
        }
        val intent = Intent(context, DialerService::class.java)
            .setAction(DialerService.ACTION_DIAL)
            .putExtra(DialerService.EXTRA_NUMBER, number)
            .putExtra(DialerService.EXTRA_SIM_ID, call.getString("simId"))
        // While the session's foreground service is running, a plain startService is
        // always allowed — startForegroundService can be refused (Android 12+) if the
        // app happens to be in the background when the countdown fires.
        try {
            if (DialerService.isRunning) context.startService(intent)
            else ContextCompat.startForegroundService(context, intent)
        } catch (e: Exception) {
            call.reject("Android didn't allow the call to start (${e.javaClass.simpleName}). Keep RarePrint open on screen and try again.")
            return
        }
        call.resolve(JSObject().put("dialing", true).put("number", number))
    }

    /**
     * Hangs up the current call — "End call" pressed in the PC popup. The call
     * then ends as usual (callEnded event with the real duration).
     * Needs Android 9+ and the "answer / end phone calls" permission.
     */
    @SuppressLint("MissingPermission")
    @PluginMethod
    fun endCall(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            call.reject("Ending a call from the PC needs Android 9 or newer")
            return
        }
        if (!isGranted(Manifest.permission.ANSWER_PHONE_CALLS)) {
            call.reject("Allow RarePrint to end calls first (Dialer → Allow permissions)")
            return
        }
        val telecom = context.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
        val ended = try {
            @Suppress("DEPRECATION")
            telecom.endCall()
        } catch (e: SecurityException) {
            call.reject("Android refused to end the call: ${e.message}")
            return
        }
        call.resolve(JSObject().put("ended", ended))
    }

    // ── Public plugin methods ─────────────────────────────────────────────────

    /** Check whether SYSTEM_ALERT_WINDOW ("display over other apps") is granted. */
    @PluginMethod
    fun hasOverlayPermission(call: PluginCall) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
            Settings.canDrawOverlays(context) else true
        val ret = JSObject().put("granted", granted)
        call.resolve(ret)
    }

    /**
     * Open the system settings page so the user can grant
     * "Display over other apps" (SYSTEM_ALERT_WINDOW).
     * Cannot be requested programmatically — must be user-toggled.
     */
    @PluginMethod
    fun requestOverlayPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!Settings.canDrawOverlays(context)) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:${context.packageName}")
                )
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                context.startActivity(intent)
                call.resolve(JSObject().put("opened", true))
            } else {
                call.resolve(JSObject().put("granted", true))
            }
        } else {
            call.resolve(JSObject().put("granted", true))
        }
    }

    /** Request READ_CALL_LOG + WRITE_CALL_LOG at runtime. */
    @PluginMethod
    fun requestCallLogPermission(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG)
            == PackageManager.PERMISSION_GRANTED
        ) {
            call.resolve(JSObject().put("granted", true))
        } else {
            requestPermissionForAlias("callLog", call, "callLogPermissionCallback")
        }
    }

    @PermissionCallback
    private fun callLogPermissionCallback(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_CALL_LOG
        ) == PackageManager.PERMISSION_GRANTED
        call.resolve(JSObject().put("granted", granted))
    }

    /** Request READ_PHONE_STATE then start monitoring call state changes. */
    @PluginMethod
    fun startCallMonitoring(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissionForAlias("phoneState", call, "phoneStatePermissionCallback")
            return
        }
        attachPhoneStateListener()
        call.resolve(JSObject().put("monitoring", true))
    }

    @PermissionCallback
    private fun phoneStatePermissionCallback(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED

        if (granted) {
            attachPhoneStateListener()
            call.resolve(JSObject().put("monitoring", true))
        } else {
            call.reject("READ_PHONE_STATE permission denied")
        }
    }

    /** Stop monitoring call state. */
    @PluginMethod
    fun stopCallMonitoring(call: PluginCall) {
        detachPhoneStateListener()
        call.resolve(JSObject().put("monitoring", false))
    }

    /**
     * Show a floating overlay while a call is active.
     * Requires SYSTEM_ALERT_WINDOW — call requestOverlayPermission() first.
     *
     * Accepts: { leadName: string, phone: string }
     */
    @PluginMethod
    fun showCallOverlay(call: PluginCall) {
        val leadName = call.getString("leadName", "Unknown")
        val phone = call.getString("phone", "")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            !Settings.canDrawOverlays(context)
        ) {
            call.reject("SYSTEM_ALERT_WINDOW not granted. Call requestOverlayPermission() first.")
            return
        }

        val intent = Intent(context, OverlayService::class.java).apply {
            putExtra("leadName", leadName)
            putExtra("phone", phone)
            action = OverlayService.ACTION_SHOW
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent)
        } else {
            context.startService(intent)
        }
        overlayActive = true
        call.resolve(JSObject().put("shown", true))
    }

    /** Dismiss the floating overlay. */
    @PluginMethod
    fun hideCallOverlay(call: PluginCall) {
        val intent = Intent(context, OverlayService::class.java).apply {
            action = OverlayService.ACTION_HIDE
        }
        context.startService(intent)
        overlayActive = false
        call.resolve(JSObject().put("hidden", true))
    }

    /**
     * Read the N most recent call log entries.
     * Requires READ_CALL_LOG permission.
     *
     * Returns: { calls: [ { number, type, duration, date } ] }
     *   type: "INCOMING" | "OUTGOING" | "MISSED"
     */
    @PluginMethod
    fun getRecentCallLogs(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG)
            != PackageManager.PERMISSION_GRANTED
        ) {
            call.reject("READ_CALL_LOG permission not granted")
            return
        }

        val limit = call.getInt("limit", 20)
        val calls = JSArray()

        val cursor: Cursor? = context.contentResolver.query(
            CallLog.Calls.CONTENT_URI,
            arrayOf(
                CallLog.Calls.NUMBER,
                CallLog.Calls.TYPE,
                CallLog.Calls.DURATION,
                CallLog.Calls.DATE
            ),
            null, null,
            "${CallLog.Calls.DATE} DESC LIMIT $limit"
        )

        cursor?.use { c ->
            while (c.moveToNext()) {
                val typeInt = c.getInt(c.getColumnIndexOrThrow(CallLog.Calls.TYPE))
                val typeStr = when (typeInt) {
                    CallLog.Calls.INCOMING_TYPE -> "INCOMING"
                    CallLog.Calls.OUTGOING_TYPE -> "OUTGOING"
                    CallLog.Calls.MISSED_TYPE -> "MISSED"
                    else -> "UNKNOWN"
                }
                val entry = JSObject()
                    .put("number", c.getString(c.getColumnIndexOrThrow(CallLog.Calls.NUMBER)))
                    .put("type", typeStr)
                    .put("duration", c.getLong(c.getColumnIndexOrThrow(CallLog.Calls.DURATION)))
                    .put("date", c.getLong(c.getColumnIndexOrThrow(CallLog.Calls.DATE)))
                calls.put(entry)
            }
        }

        call.resolve(JSObject().put("calls", calls))
    }

    /**
     * Make a phone call directly without leaving the app context.
     * Requires CALL_PHONE permission.
     *
     * Accepts: { phone: string }
     */
    @PluginMethod
    fun makeCall(call: PluginCall) {
        val phone = call.getString("phone") ?: run {
            call.reject("phone is required")
            return
        }

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CALL_PHONE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissionForAlias("callPhone", call, "callPhonePermissionCallback")
            return
        }

        dialNumber(phone, call)
    }

    @PermissionCallback
    private fun callPhonePermissionCallback(call: PluginCall) {
        val phone = call.getString("phone") ?: run {
            call.reject("phone lost")
            return
        }
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.CALL_PHONE
        ) == PackageManager.PERMISSION_GRANTED

        if (granted) dialNumber(phone, call)
        else call.reject("CALL_PHONE permission denied")
    }

    private fun dialNumber(phone: String, call: PluginCall) {
        val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$phone")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        context.startActivity(intent)
        call.resolve(JSObject().put("dialed", true).put("phone", phone))
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    @Suppress("DEPRECATION")
    private fun attachPhoneStateListener() {
        if (phoneStateListener != null) return   // already attached

        phoneStateListener = object : PhoneStateListener() {
            override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                if (state == lastState) return
                val prev = lastState
                lastState = state

                when (state) {
                    TelephonyManager.CALL_STATE_OFFHOOK -> {
                        // Call answered / outgoing started
                        callStartTime = System.currentTimeMillis()
                        notifyJs("callStateChanged", JSObject()
                            .put("state", "OFFHOOK")
                            .put("phone", phoneNumber ?: ""))
                    }
                    TelephonyManager.CALL_STATE_RINGING -> {
                        notifyJs("callStateChanged", JSObject()
                            .put("state", "RINGING")
                            .put("phone", phoneNumber ?: ""))
                    }
                    TelephonyManager.CALL_STATE_IDLE -> {
                        val durationSec = if (callStartTime > 0)
                            (System.currentTimeMillis() - callStartTime) / 1000 else 0
                        callStartTime = 0

                        // Auto-hide overlay when call ends
                        if (overlayActive) {
                            val intent = Intent(context, OverlayService::class.java).apply {
                                action = OverlayService.ACTION_HIDE
                            }
                            context.startService(intent)
                            overlayActive = false
                        }

                        val outcome = when (prev) {
                            TelephonyManager.CALL_STATE_OFFHOOK -> "ANSWERED"
                            TelephonyManager.CALL_STATE_RINGING -> "MISSED"
                            else -> "UNKNOWN"
                        }

                        notifyJs("callStateChanged", JSObject()
                            .put("state", "IDLE")
                            .put("outcome", outcome)
                            .put("duration", durationSec)
                            .put("phone", phoneNumber ?: ""))
                    }
                }
            }
        }

        telephonyManager?.listen(
            phoneStateListener,
            PhoneStateListener.LISTEN_CALL_STATE
        )
    }

    @Suppress("DEPRECATION")
    private fun detachPhoneStateListener() {
        phoneStateListener?.let {
            telephonyManager?.listen(it, PhoneStateListener.LISTEN_NONE)
        }
        phoneStateListener = null
    }

    private fun notifyJs(event: String, data: JSObject) {
        bridge.triggerWindowJSEvent(event, data.toString())
        notifyListeners(event, data)
    }

    override fun handleOnDestroy() {
        detachPhoneStateListener()
        super.handleOnDestroy()
    }
}
