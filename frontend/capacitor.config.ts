import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rareprint.crm",
  appName: "RarePrint",
  // 'out' is where Next.js puts the static export (CAPACITOR_BUILD=1 next build)
  webDir: "out",

  server: {
    androidScheme: "https",
    // Load the live site instead of the bundled static export, so UI fixes
    // reach the app on every deploy without reinstalling the APK. Only
    // native changes (plugins, permissions, this file) need a new APK.
    // For local dev, swap this for your dev server, e.g. "http://10.0.2.2:3001".
    url: "https://rareprint-erp.vercel.app",
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
    // Enables Chrome DevTools remote debugging — turn off for production.
    // Temporarily true to diagnose the "could not reach the server" login
    // issue via chrome://inspect's Network tab. Set back to false once
    // resolved.
    webContentsDebuggingEnabled: true,
    backgroundColor: "#ffffff",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#ffffff",
      showSpinner: true,
      spinnerColor: "#ee1c25",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#ffffff",
    },
    Keyboard: {
      resize: "body",
      style: "dark",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
