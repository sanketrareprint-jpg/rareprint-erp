import { redirect } from 'next/navigation'

// On the live website this lands customers on the storefront. In the
// Capacitor/Android build, "/web-to-print" is intentionally excluded (see
// scripts/build-android.js — it's not needed inside the internal staff
// app), so redirecting there would 404/blank-screen. Send the Android app
// straight to the internal dashboard instead.
export default function Home() {
  redirect(process.env.CAPACITOR_BUILD === '1' ? '/dashboard' : '/web-to-print')
}
