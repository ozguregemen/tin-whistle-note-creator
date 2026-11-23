"use client";

import { isNativeApp } from "./runtime-config.mjs";

const copy = {
  en: { privacy: "Privacy policy", terms: "Terms of use", deletion: "Account deletion" },
  tr: { privacy: "Gizlilik politikası", terms: "Kullanım şartları", deletion: "Hesap silme" },
};

/**
 * Links to the bundled legal pages (public/legal). On the web they open in a new
 * tab so a half-filled form is kept; in the installed app they open in place and
 * the back button returns.
 */
export function LegalLinks({ language, pages = ["terms", "privacy"], className = "legal-links" }: {
  language: "en" | "tr";
  pages?: Array<"privacy" | "terms" | "deletion">;
  className?: string;
}) {
  const t = copy[language];
  const files = { privacy: "privacy.html", terms: "terms.html", deletion: "account-deletion.html" };
  const newTab = isNativeApp() ? {} : { target: "_blank", rel: "noreferrer" };
  return (
    <p className={className}>
      {pages.map((page, index) => (
        <span key={page}>
          {index > 0 && " · "}
          <a href={`legal/${files[page]}${language === "en" ? "#en" : ""}`} {...newTab}>{t[page]}</a>
        </span>
      ))}
    </p>
  );
}
