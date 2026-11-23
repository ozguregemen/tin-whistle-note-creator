/// <reference types="vite/client" />
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import bundledCatalog from "../catalog/catalog.json";
import Home from "../app/page";
import { createNativeStore, durableStorage, setDurableStorage } from "../app/durable-storage.mjs";
import { LicensesAndCredits } from "../app/licenses";
import { configureRuntime } from "../app/runtime-config.mjs";
import "../app/globals.css";
import "./prototype.css";
import "./app-shell.css";
import { MobilePrototype } from "./prototype";
import { keepCommunitySessionInKeystore } from "./secure-session";
import { createTestMonetization } from "./test-monetization";

const DEVICE_CHECK_HASH = "#device-check";

// `vite build --mode staging` points the app at the test Workers, whose
// community database is separate from production.
const STAGING = import.meta.env.MODE === "staging";
const SERVICE_URLS = STAGING
  ? {
    source: "https://tin-whistle-note-source-api-staging.ozguregemenbusiness.workers.dev",
    community: "https://tin-whistle-community-staging.ozguregemenbusiness.workers.dev",
  }
  : {
    source: "https://tin-whistle-note-source-api.ozguregemenbusiness.workers.dev",
    community: "https://tin-whistle-community.ozguregemenbusiness.workers.dev",
  };

function configureServices() {
  const config = window as Window & {
    __TWNC_SOURCE_API_URL__?: string;
    __TWNC_AUDIO_API_URL__?: string;
    __TWNC_COMMUNITY_API_URL__?: string;
  };
  config.__TWNC_SOURCE_API_URL__ = SERVICE_URLS.source;
  config.__TWNC_AUDIO_API_URL__ = SERVICE_URLS.source;
  config.__TWNC_COMMUNITY_API_URL__ = SERVICE_URLS.community;
}

const LICENSES_HASH = "#licenses";

function currentView() {
  if (window.location.hash === DEVICE_CHECK_HASH) return "check";
  if (window.location.hash === LICENSES_HASH) return "licenses";
  return "app";
}

function savedLanguage(): "en" | "tr" {
  try {
    return durableStorage().getItem("twnc-language") === "tr" ? "tr" : "en";
  } catch {
    return "en";
  }
}

function MobileApp() {
  const [view, setView] = useState(currentView);
  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (view !== "app") {
    return (
      <>
        <a className="mobile-back-link" href="#app">← Tin Whistle Note Creator</a>
        {view === "check" ? <MobilePrototype /> : <main className="mobile-shell"><LicensesAndCredits language={savedLanguage()} /></main>}
      </>
    );
  }
  return (
    <>
      <Home />
      <footer className="mobile-device-link">
        {STAGING && <p className="mobile-staging-note">Test sunucuları (staging) · Test servers</p>}
        <a href="legal/privacy.html">Gizlilik · Privacy</a>
        <a href={LICENSES_HASH}>Lisanslar · Licenses</a>
        <a href={DEVICE_CHECK_HASH}>Cihaz testi · Device check</a>
      </footer>
    </>
  );
}

async function prepareStorage() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await keepCommunitySessionInKeystore();
  } catch (error) {
    // Sign-in still works; it lasts until the app is closed.
    console.warn("Secure storage is unavailable", error);
  }
  try {
    let fallback: Storage | null = null;
    try { fallback = window.localStorage; } catch { /* WebView storage may be unavailable. */ }
    setDurableStorage(await createNativeStore(Preferences, {
      fallback,
      onError: error => console.warn("Native storage write failed", error),
    }));
  } catch (error) {
    // Progress still works for this session through the WebView's own storage.
    console.warn("Native storage is unavailable", error);
  }
}

function listenToAppLifecycle() {
  if (!Capacitor.isNativePlatform()) return;
  void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
    // The shared practice code releases the microphone and pauses playback on
    // pagehide. Android only stops the activity here, so signal it explicitly.
    if (!isActive) window.dispatchEvent(new Event("pagehide"));
  });
  void CapacitorApp.addListener("backButton", ({ canGoBack }) => {
    if (window.location.hash === DEVICE_CHECK_HASH || window.location.hash === LICENSES_HASH) window.location.hash = "app";
    else if (canGoBack) window.history.back();
    else void CapacitorApp.minimizeApp();
  });
}

async function boot() {
  const platform = Capacitor.getPlatform();
  configureRuntime({
    platform: platform === "android" || platform === "ios" ? platform : "web",
    bundledSongs: bundledCatalog.songs,
    youtubeAudio: false,
    pauseWhenHidden: true,
    // M1: free limits and the paywall run on staging with simulated purchases.
    // Production builds keep everything open until Play Billing is wired (M2).
    monetization: STAGING ? createTestMonetization() : null,
  });
  document.documentElement.classList.add("twnc-app");
  configureServices();
  await prepareStorage();
  listenToAppLifecycle();

  const root = document.getElementById("root");
  if (!root) throw new Error("Application root was not found.");
  createRoot(root).render(
    <StrictMode>
      <MobileApp />
    </StrictMode>,
  );
}

void boot();
