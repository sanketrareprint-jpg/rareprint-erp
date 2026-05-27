// ── Patch for android/app/src/main/java/com/rareprint/crm/MainActivity.kt ───
//
// After `cap add android` creates MainActivity.kt, REPLACE its content with this.
// The setup-android.sh script does this automatically.
//

package com.rareprint.crm

import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        // Register our custom plugin BEFORE super.onCreate()
        registerPlugin(CallManagerPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
