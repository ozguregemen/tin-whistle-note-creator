"use client";

import { LegalLinks } from "./legal-links";

type Language = "en" | "tr";
type Credit = { name: string; detail: { en: string; tr: string }; license: string; url: string };

// Everything shipped inside the app bundle, with the attribution each license asks for.
const CREDITS: Credit[] = [
  {
    name: "GeneralUser GS — Whistle preset",
    detail: { en: "Tin whistle sound in the player. Sound bank by S. Christian Collins, browser conversion from WebAudioFont data (MIT).", tr: "Oynatıcıdaki tin whistle sesi. Ses bankası S. Christian Collins, tarayıcı dönüşümü WebAudioFont verisi (MIT)." },
    license: "GeneralUser GS License", url: "https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/LICENSE.txt",
  },
  {
    name: "Whistle.wav — Wikimedia Commons contributors",
    detail: { en: "Fallback tin whistle samples (Sweetone D whistle), adapted by AEmotionStudio Winds Studio sample pack v1.", tr: "Yedek tin whistle örnekleri (Sweetone D whistle), AEmotionStudio Winds Studio örnek paketi v1 uyarlaması." },
    license: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/",
  },
  {
    name: "Spotify Basic Pitch",
    detail: { en: "On-device audio-to-notes model. Copyright 2022 Spotify AB.", tr: "Cihazda sesi notaya çeviren model. Telif 2022 Spotify AB." },
    license: "Apache License 2.0", url: "https://github.com/spotify/basic-pitch-ts/blob/main/LICENSE",
  },
  {
    name: "TensorFlow.js",
    detail: { en: "Runs the Basic Pitch model on the device.", tr: "Basic Pitch modelini cihazda çalıştırır." },
    license: "Apache License 2.0", url: "https://github.com/tensorflow/tfjs/blob/master/LICENSE",
  },
  {
    name: "React",
    detail: { en: "User interface library. Copyright Meta Platforms, Inc. and affiliates.", tr: "Arayüz kütüphanesi. Telif Meta Platforms, Inc. ve iştirakleri." },
    license: "MIT", url: "https://github.com/facebook/react/blob/main/LICENSE",
  },
  {
    name: "Capacitor (core, Android, iOS, App, Preferences)",
    detail: { en: "Native app shell. Copyright Ionic.", tr: "Yerel uygulama kabuğu. Telif Ionic." },
    license: "MIT", url: "https://github.com/ionic-team/capacitor/blob/main/LICENSE",
  },
  {
    name: "@aparajita/capacitor-secure-storage",
    detail: { en: "Keeps the community sign-in in the Android Keystore / iOS Keychain. Copyright Aparajita Fishman.", tr: "Topluluk girişini Android Keystore / iOS Keychain'de saklar. Telif Aparajita Fishman." },
    license: "MIT", url: "https://github.com/aparajita/capacitor-secure-storage/blob/main/LICENSE",
  },
  {
    name: "GetSongBPM",
    detail: { en: "Tempo data for catalog songs.", tr: "Katalogdaki şarkıların tempo verisi." },
    license: "getsongbpm.com", url: "https://getsongbpm.com/",
  },
];

const copy = {
  en: {
    title: "Licenses and credits",
    intro: "Tin Whistle Note Creator is built with these sounds, models and libraries. Each song also lists its own note and tempo sources on its page.",
    license: "License",
    mascot: "The donkey mascot and app icon are original artwork made for this app.",
  },
  tr: {
    title: "Lisanslar ve atıflar",
    intro: "Tin Whistle Note Creator bu sesler, modeller ve kütüphanelerle yapıldı. Her şarkı ayrıca kendi nota ve tempo kaynaklarını kendi sayfasında gösterir.",
    license: "Lisans",
    mascot: "Eşek maskot ve uygulama simgesi bu uygulama için çizilmiş özgün çalışmalardır.",
  },
};

export function LicensesAndCredits({ language }: { language: Language }) {
  const t = copy[language];
  return (
    <section className="licenses" aria-labelledby="licenses-title">
      <h1 id="licenses-title">{t.title}</h1>
      <LegalLinks language={language} pages={["privacy", "terms", "deletion"]} />
      <p>{t.intro}</p>
      <ul>
        {CREDITS.map(credit => (
          <li key={credit.name}>
            <strong>{credit.name}</strong>
            <span>{credit.detail[language]}</span>
            <a href={credit.url} target="_blank" rel="noreferrer">{t.license}: {credit.license}</a>
          </li>
        ))}
      </ul>
      <p>{t.mascot}</p>
    </section>
  );
}
