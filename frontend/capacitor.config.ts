import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rareprint.crm",
  appName: "RarePrint",
  // 'out' is where Next.js puts the static export (CAPACITOR_BUILD=1 next build)
  webDir: "out",

  server: {
    androidScheme: "https",
    // Uncomment the line below during local dev to point the Android WebView
    // at your running Next.js dev server instead of a static build:
    // url: "http://10.0.2.2:3001",
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
    // Enables Chrome DevTools remote debugging — turn off for production
    webContentsDebuggingEnabled: false,
    backgroundColor: "#ffffff",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#1e40af",
      showSpinner: true,
      spinnerColor: "#ffffff",
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
