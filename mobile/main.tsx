import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import bundledCatalog from "../catalog/catalog.json";
import Home from "../app/page";
import { createNativeStore, setDurableStorage } from "../app/durable-storage.mjs";
import { configureRuntime } from "../app/runtime-config.mjs";
import "../app/globals.css";
import "./prototype.css";
import "./app-shell.css";
import { MobilePrototype } from "./prototype";

const DEVICE_CHECK_HASH = "#device-check";

function currentView() {
  return window.location.hash === DEVICE_CHECK_HASH ? "check" : "app";
}

function MobileApp() {
  const [view, setView] = useState(currentView);
  useEffect(() => {
    const onHash = () => setView(currentView());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (view === "check") {
    return (
      <>
        <a className="mobile-back-link" href="#app">← Tin Whistle Note Creator</a>
        <MobilePrototype />
      </>
    );
  }
  return (
    <>
      <Home />
      <footer className="mobile-device-link">
        <a href={DEVICE_CHECK_HASH}>Cihaz testi · Device check</a>
      </footer>
    </>
  );
}

async function prepareStorage() {
  if (!Capacitor.isNativePlatform()) return;
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
    if (window.location.hash === DEVICE_CHECK_HASH) window.location.hash = "app";
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
  });
  document.documentElement.classList.add("twnc-app");
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
