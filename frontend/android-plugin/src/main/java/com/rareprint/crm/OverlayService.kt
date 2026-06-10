package com.rareprint.crm

import android.app.*
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat

/**
 * OverlayService — floats a small card over any screen while a CRM call is active.
 *
 * Shows:
 *   • Lead name + phone number
 *   • "Log Call" button — taps bring the CRM app back to foreground
 *   • Duration timer
 *
 * Requires SYSTEM_ALERT_WINDOW permission (granted from Settings by the user).
 */
class OverlayService : Service() {

    companion object {
        const val ACTION_SHOW = "SHOW_OVERLAY"
        const val ACTION_HIDE = "HIDE_OVERLAY"
        private const val CHANNEL_ID = "rareprint_call_overlay"
        private const val NOTIF_ID = 1001
    }

    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var timerHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var secondsElapsed = 0
    private var timerRunnable: Runnable? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_SHOW -> {
                val leadName = intent.getStringExtra("leadName") ?: "Unknown"
                val phone = intent.getStringExtra("phone") ?: ""
                showOverlay(leadName, phone)
                startForeground(NOTIF_ID, buildNotification(leadName, phone))
            }
            ACTION_HIDE -> {
                hideOverlay()
                stopForeground(true)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        hideOverlay()
        super.onDestroy()
    }

    // ── Overlay view ──────────────────────────────────────────────────────────

    private fun showOverlay(leadName: String, phone: String) {
        if (overlayView != null) return

        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 16
            y = 120
        }

        // Build the overlay card programmatically (no XML layout needed)
        val card = buildOverlayCard(leadName, phone)
        overlayView = card

        // Allow dragging the overlay
        card.setOnTouchListener(DragTouchListener(windowManager!!, params, card))

        windowManager?.addView(card, params)
        startTimer(card)
    }

    private fun buildOverlayCard(leadName: String, phone: String): LinearLayout {
        val ctx = this

        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 16, 24, 16)
            setBackgroundColor(Color.parseColor("#1e40af"))   // RarePrint blue
            // Rounded corners via a drawable — keep it simple with a solid background
            elevation = 12f

            // Header row: icon + lead name
            val headerRow = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                addView(TextView(ctx).apply {
                    text = "📞"
                    textSize = 16f
                })
                addView(TextView(ctx).apply {
                    text = "  $leadName"
                    setTextColor(Color.WHITE)
                    textSize = 14f
                    setTypeface(null, android.graphics.Typeface.BOLD)
                })
            }
            addView(headerRow)

            // Phone number
            addView(TextView(ctx).apply {
                text = phone
                setTextColor(Color.parseColor("#bfdbfe"))
                textSize = 12f
                setPadding(0, 4, 0, 0)
            })

            // Timer
            addView(TextView(ctx).apply {
                tag = "timer"
                text = "00:00"
                setTextColor(Color.parseColor("#86efac"))   // green-300
                textSize = 11f
                setPadding(0, 4, 0, 8)
            })

            // "Open CRM" button
            addView(Button(ctx).apply {
                text = "Open CRM"
                textSize = 11f
                setTextColor(Color.parseColor("#1e40af"))
                setBackgroundColor(Color.WHITE)
                setPadding(16, 8, 16, 8)
                setOnClickListener {
                    // Bring the main app to the foreground
                    val launch = ctx.packageManager
                        .getLaunchIntentForPackage(ctx.packageName)?.apply {
                            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                        }
                    launch?.let { ctx.startActivity(it) }
                }
            })
        }
    }

    private fun startTimer(card: View) {
        secondsElapsed = 0
        timerRunnable = object : Runnable {
            override fun run() {
                secondsElapsed++
                val mm = secondsElapsed / 60
                val ss = secondsElapsed % 60
                val timerView = card.findViewWithTag<TextView>("timer")
                timerView?.text = String.format("%02d:%02d", mm, ss)
                timerHandler.postDelayed(this, 1000)
            }
        }
        timerHandler.postDelayed(timerRunnable!!, 1000)
    }

    private fun hideOverlay() {
        timerRunnable?.let { timerHandler.removeCallbacks(it) }
        overlayView?.let {
            try { windowManager?.removeView(it) } catch (_: Exception) {}
        }
        overlayView = null
    }

    // ── Foreground notification (required on Android 8+) ─────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "RarePrint Call Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows a floating card while a CRM call is active"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(leadName: String, phone: String): Notification {
        val openIntent = PendingIntent.getActivity(
            this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle("Call in progress — $leadName")
            .setContentText(phone)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    // ── Drag helper ───────────────────────────────────────────────────────────

    private class DragTouchListener(
        private val wm: WindowManager,
        private val params: WindowManager.LayoutParams,
        private val view: View
    ) : View.OnTouchListener {
        private var initialX = 0; private var initialY = 0
        private var initialTouchX = 0f; private var initialTouchY = 0f

        override fun onTouch(v: View, event: MotionEvent): Boolean {
            return when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x; initialY = params.y
                    initialTouchX = event.rawX; initialTouchY = event.rawY
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    params.x = initialX + (event.rawX - initialTouchX).toInt()
                    params.y = initialY + (event.rawY - initialTouchY).toInt()
                    wm.updateViewLayout(view, params)
                    true
                }
                else -> false
            }
        }
    }
}
