"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { durableStorage } from "./durable-storage.mjs";
import { createEntitlements, type PremiumPlan } from "./entitlements.mjs";
import { LegalLinks } from "./legal-links";
import { Mascot } from "./mascot";
import { runtimeConfig } from "./runtime-config.mjs";

/** What the store reports for a purchase the user owns. */
export type PremiumPurchase = { plan: PremiumPlan; productId: string; expiresAt: number | null };

export type PremiumProduct = {
  plan: PremiumPlan;
  productId: string;
  /** Localized by the store, for example "₺499,99". */
  price: string;
  /** For yearly plans: the price spread over twelve months. */
  monthlyPrice?: string;
  trialDays?: number;
};

/**
 * Supplied by the installed app (mobile/). The web build has none, so nothing
 * is gated there. M1 uses a fake provider in staging builds; M2 adds Play
 * Billing and M3 real rewarded ads.
 */
export interface MonetizationProvider {
  /** Shown in the paywall when purchases are simulated, e.g. on staging. */
  testLabel?: string;
  products(): Promise<PremiumProduct[]>;
  /** Resolves null when the user cancels. */
  purchase(plan: PremiumPlan): Promise<PremiumPurchase | null>;
  restore(): Promise<PremiumPurchase | null>;
  /** The purchase the store currently reports; throws when the store is unreachable. */
  current(): Promise<PremiumPurchase | null>;
  manageSubscriptions(): Promise<void>;
  /** Resolves true when the user watched the ad to the end. */
  showRewardedAd?(): Promise<boolean>;
  /** Test builds only: forget simulated purchases. */
  resetTest?(): Promise<void>;
}

export type PaywallReason =
  | { kind: "lesson"; lessonId: string; onUnlocked?: () => void }
  | { kind: "follow"; songKey: string }
  | { kind: "transcription" }
  | { kind: "settings" };

type Entitlements = ReturnType<typeof createEntitlements>;

let entitlements: Entitlements | null = null;
let paywall: PaywallReason | null = null;
const paywallListeners = new Set<() => void>();

function provider(): MonetizationProvider | null {
  return runtimeConfig().monetization ?? null;
}

/** Null on the web: every feature is open. */
export function premiumStore(): Entitlements | null {
  if (!provider()) return null;
  entitlements ??= createEntitlements({ storage: durableStorage() });
  return entitlements;
}

export function openPaywall(reason: PaywallReason) {
  if (!provider()) return;
  paywall = reason;
  paywallListeners.forEach(listener => listener());
}

function closePaywall() {
  paywall = null;
  paywallListeners.forEach(listener => listener());
}

const noSubscription = () => () => {};

/** Re-renders the caller whenever premium state or free allowances change. */
export function usePremium() {
  const store = premiumStore();
  useSyncExternalStore(store ? store.subscribe : noSubscription, () => store?.snapshot() ?? null, () => null);
  return store;
}

/** Counts a song for today's free allowance, or opens the paywall and returns false. */
export function allowSongFollow(songKey: string) {
  const store = premiumStore();
  if (!store) return true;
  if (store.useSongFollow(songKey).allowed) return true;
  openPaywall({ kind: "follow", songKey });
  return false;
}

export function allowTranscription() {
  const store = premiumStore();
  if (!store) return true;
  if (store.peekTranscription().allowed) return true;
  openPaywall({ kind: "transcription" });
  return false;
}

export function recordTranscription() {
  premiumStore()?.recordTranscription();
}

/** Asks the store again (on start and when the app returns) so cancellations and renewals apply. */
export async function syncPremium() {
  const store = premiumStore();
  const source = provider();
  if (!store || !source) return;
  try {
    const purchase = await source.current();
    if (purchase) store.grantPremium(purchase);
    else store.revokePremium();
  } catch {
    // Offline or the store is busy: keep the last confirmed state for the grace period.
  }
}

const copy = {
  en: {
    title: "Tin Whistle Premium",
    close: "Not now",
    done: "Continue",
    reason: {
      lesson: "Stages 3 to 6 are part of Premium.",
      follow: (limit: number) => `You have used today's ${limit} free songs in follow mode.`,
      transcription: (limit: number) => `You have used this month's ${limit} free audio transcriptions.`,
      settings: "Learn the whole course and practise without limits.",
    },
    benefits: [
      "All 24 lessons, up to Irish dance tunes",
      "Follow any number of songs with your microphone",
      "Turn recordings into notes without a monthly limit",
      "No ads",
    ],
    plans: "Choose a plan",
    plan: { monthly: "Monthly", yearly: "Yearly", lifetime: "Lifetime" },
    perMonth: (price: string) => `${price} / month`,
    perYear: (price: string) => `${price} / year`,
    once: (price: string) => `${price} once`,
    trial: (days: number) => `${days} days free`,
    best: "Best value",
    subscribe: { monthly: "Subscribe monthly", yearly: "Subscribe yearly", lifetime: "Buy lifetime" },
    startTrial: (days: number) => `Start ${days}-day free trial`,
    trialTerms: (days: number, price: string) => `Free for ${days} days, then ${price} a year. Cancel in Google Play before the trial ends and you will not be charged.`,
    renewTerms: "The subscription renews automatically until you cancel it. Cancel any time in Google Play → Subscriptions; it stays active until the end of the paid period.",
    lifetimeTerms: "A single payment. Premium stays open on every device signed in to the same Google account.",
    restore: "Restore purchases",
    manage: "Manage subscription",
    loading: "Loading plans…",
    unavailable: "Plans could not be loaded. Check your connection and try again.",
    retry: "Try again",
    working: "Waiting for Google Play…",
    failed: "The purchase could not be completed. You have not been charged.",
    nothingToRestore: "No purchase was found for this Google account.",
    thanks: "Premium is open. Thank you for supporting the app!",
    active: "Premium is active",
    activePlan: { monthly: "Monthly subscription", yearly: "Yearly subscription", lifetime: "Lifetime purchase" },
    renews: (date: string) => `Renews or ends on ${date}`,
    reward: {
      lesson: "Watch an ad to open this lesson for 24 hours",
      follow: "Watch an ad for one more song today",
      transcription: "Watch an ad for one more transcription",
    },
    rewardWorking: "Loading the ad…",
    rewardFailed: "No ad is available right now. Try again later.",
    rewarded: {
      lesson: "The lesson is open for 24 hours.",
      follow: "One more song added for today. Start following again.",
      transcription: "One more transcription added. Choose the section again.",
    },
    or: "or",
    test: "Test mode",
    resetTest: "Delete test purchase",
  },
  tr: {
    title: "Tin Whistle Premium",
    close: "Şimdi değil",
    done: "Devam et",
    reason: {
      lesson: "3. ile 6. kademe arasındaki dersler Premium'a dahil.",
      follow: (limit: number) => `Bugünkü ${limit} ücretsiz şarkı takibi hakkını kullandın.`,
      transcription: (limit: number) => `Bu ayki ${limit} ücretsiz sesten notaya çevirme hakkını kullandın.`,
      settings: "Eğitimin tamamını öğren, sınırsız prova et.",
    },
    benefits: [
      "İrlanda dans ezgilerine kadar 24 dersin tamamı",
      "Mikrofonla istediğin kadar şarkı takibi",
      "Aylık sınır olmadan sesten notaya çevirme",
      "Reklamsız kullanım",
    ],
    plans: "Bir plan seç",
    plan: { monthly: "Aylık", yearly: "Yıllık", lifetime: "Ömür boyu" },
    perMonth: (price: string) => `Ayda ${price}`,
    perYear: (price: string) => `Yılda ${price}`,
    once: (price: string) => `Tek seferlik ${price}`,
    trial: (days: number) => `${days} gün ücretsiz`,
    best: "En avantajlı",
    subscribe: { monthly: "Aylık abone ol", yearly: "Yıllık abone ol", lifetime: "Ömür boyu satın al" },
    startTrial: (days: number) => `${days} günlük ücretsiz denemeyi başlat`,
    trialTerms: (days: number, price: string) => `${days} gün ücretsiz, ardından yılda ${price}. Deneme bitmeden Google Play'den iptal edersen ücret alınmaz.`,
    renewTerms: "Abonelik sen iptal edene kadar otomatik yenilenir. İstediğin zaman Google Play → Abonelikler'den iptal edebilirsin; ödediğin dönemin sonuna kadar açık kalır.",
    lifetimeTerms: "Tek seferlik ödeme. Premium aynı Google hesabıyla giriş yapılan her cihazda açık kalır.",
    restore: "Satın alımları geri yükle",
    manage: "Aboneliği yönet",
    loading: "Planlar yükleniyor…",
    unavailable: "Planlar yüklenemedi. Bağlantını kontrol edip tekrar dene.",
    retry: "Tekrar dene",
    working: "Google Play bekleniyor…",
    failed: "Satın alma tamamlanamadı. Senden ücret alınmadı.",
    nothingToRestore: "Bu Google hesabında bir satın alma bulunamadı.",
    thanks: "Premium açıldı. Uygulamayı desteklediğin için teşekkürler!",
    active: "Premium açık",
    activePlan: { monthly: "Aylık abonelik", yearly: "Yıllık abonelik", lifetime: "Ömür boyu satın alma" },
    renews: (date: string) => `${date} tarihinde yenilenir veya sona erer`,
    reward: {
      lesson: "Reklam izle, bu dersi 24 saat aç",
      follow: "Reklam izle, bugün bir şarkı daha",
      transcription: "Reklam izle, bir çevirme hakkı daha",
    },
    rewardWorking: "Reklam yükleniyor…",
    rewardFailed: "Şu an gösterilecek reklam yok. Daha sonra tekrar dene.",
    rewarded: {
      lesson: "Ders 24 saatliğine açıldı.",
      follow: "Bugün için bir şarkı hakkı eklendi. Takibi yeniden başlatabilirsin.",
      transcription: "Bir çevirme hakkı eklendi. Bölümü yeniden seçebilirsin.",
    },
    or: "veya",
    test: "Test modu",
    resetTest: "Test satın alımını sil",
  },
};

type Language = keyof typeof copy;
type Status = { kind: "idle" | "working" | "rewardWorking" } | { kind: "message"; text: string; success?: boolean };

const PLAN_ORDER: PremiumPlan[] = ["yearly", "monthly", "lifetime"];

function PlanPrice({ product, t }: { product: PremiumProduct; t: (typeof copy)[Language] }) {
  if (product.plan === "lifetime") return <>{t.once(product.price)}</>;
  if (product.plan === "monthly") return <>{t.perMonth(product.price)}</>;
  return <>{t.perYear(product.price)}{product.monthlyPrice && <small> · {t.perMonth(product.monthlyPrice)}</small>}</>;
}

/** The single paywall dialog. Rendered once by the app; opened with openPaywall(). */
export function PremiumPaywall({ language }: { language: Language }) {
  const t = copy[language];
  const source = provider();
  const store = usePremium();
  const reason = useSyncExternalStore(
    listener => { paywallListeners.add(listener); return () => { paywallListeners.delete(listener); }; },
    () => paywall, () => null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [products, setProducts] = useState<PremiumProduct[] | "loading" | "failed">("loading");
  const [selected, setSelected] = useState<PremiumPlan>("yearly");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const open = Boolean(reason && source && store);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      headingRef.current?.focus({ preventScroll: true });
    } else if (dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || !source) return;
    let current = true;
    source.products().then(list => {
      if (!current) return;
      const sorted = PLAN_ORDER.map(plan => list.find(item => item.plan === plan)).filter((item): item is PremiumProduct => Boolean(item));
      setProducts(sorted.length ? sorted : "failed");
      setSelected(plan => sorted.some(item => item.plan === plan) ? plan : sorted[0]?.plan ?? "yearly");
    }, () => { if (current) setProducts("failed"); });
    return () => { current = false; };
  }, [attempt, open, source]);

  if (!source || !store) return null;

  const premium = store.isPremium() ? store.premium() : null;
  const busy = status.kind === "working" || status.kind === "rewardWorking";
  const product = Array.isArray(products) ? products.find(item => item.plan === selected) : undefined;
  const rewardKind = reason && reason.kind !== "settings" && source.showRewardedAd && !premium ? reason.kind : null;
  const reasonText = !reason ? "" : reason.kind === "follow" ? t.reason.follow(store.limits.songFollowsPerDay)
    : reason.kind === "transcription" ? t.reason.transcription(store.limits.transcriptionsPerMonth) : t.reason[reason.kind];

  function finish(unlocked: boolean) {
    if (unlocked && reason?.kind === "lesson") reason.onUnlocked?.();
  }

  async function buy() {
    if (!product || !source || !store) return;
    setStatus({ kind: "working" });
    try {
      const purchase = await source.purchase(product.plan);
      if (!purchase) { setStatus({ kind: "idle" }); return; }
      store.grantPremium(purchase);
      setStatus({ kind: "message", text: t.thanks, success: true });
    } catch {
      setStatus({ kind: "message", text: t.failed });
    }
  }

  async function restore() {
    if (!source || !store) return;
    setStatus({ kind: "working" });
    try {
      const purchase = await source.restore();
      if (purchase) {
        store.grantPremium(purchase);
        setStatus({ kind: "message", text: t.thanks, success: true });
      } else setStatus({ kind: "message", text: t.nothingToRestore });
    } catch {
      setStatus({ kind: "message", text: t.failed });
    }
  }

  async function watchAd() {
    if (!source?.showRewardedAd || !store || !reason || reason.kind === "settings") return;
    setStatus({ kind: "rewardWorking" });
    let watched = false;
    try { watched = await source.showRewardedAd(); } catch { watched = false; }
    if (!watched) { setStatus({ kind: "message", text: t.rewardFailed }); return; }
    if (reason.kind === "lesson") store.unlockLesson(reason.lessonId);
    else if (reason.kind === "follow") store.grantSongFollow();
    else store.grantTranscription();
    setStatus({ kind: "message", text: t.rewarded[reason.kind], success: true });
  }

  async function resetTest() {
    if (!source?.resetTest || !store) return;
    await source.resetTest();
    store.revokePremium();
    setStatus({ kind: "idle" });
  }

  const success = status.kind === "message" && status.success;
  const message = status.kind === "message" ? status.text
    : status.kind === "working" ? t.working : status.kind === "rewardWorking" ? t.rewardWorking : "";
  const unlocked = Boolean(premium) || Boolean(success && reason?.kind === "lesson");

  return (
    <dialog className="editor-dialog premium-dialog" ref={dialogRef} aria-labelledby="premium-title"
      onClose={() => {
        const unlockedNow = unlocked;
        closePaywall();
        setStatus({ kind: "idle" });
        finish(unlockedNow);
      }}>
      <header className="editor-dialog-heading">
        <h2 ref={headingRef} id="premium-title" tabIndex={-1}>{t.title}</h2>
        <button className="secondary-action" type="button" onClick={() => dialogRef.current?.close()}>
          {success || premium ? t.done : t.close}
        </button>
      </header>
      <div className="community-body premium-body">
        <div className="premium-hero">
          <Mascot mood={success || premium ? "celebrate" : "welcome"} size={84} />
          <div>
            {source.testLabel && <p className="premium-test">{t.test} · {source.testLabel}</p>}
            {premium ? <>
              <p className="premium-reason"><strong>✓ {t.active}</strong></p>
              <p>{t.activePlan[premium.plan]}{premium.expiresAt !== null && ` · ${t.renews(new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(premium.expiresAt))}`}</p>
            </> : <p className="premium-reason">{reasonText}</p>}
          </div>
        </div>

        {message && <p className={`premium-status${success ? " success" : ""}`} role="status">{message}</p>}

        {!premium && <>
          <ul className="premium-benefits">
            {t.benefits.map(item => <li key={item}><span aria-hidden="true">✓</span> {item}</li>)}
          </ul>

          {products === "loading" && <p className="premium-muted" role="status">{t.loading}</p>}
          {products === "failed" && <p className="premium-muted" role="status">
            {t.unavailable} <button type="button" className="text-action" onClick={() => setAttempt(value => value + 1)}>{t.retry}</button>
          </p>}
          {Array.isArray(products) && <fieldset className="premium-plans" disabled={busy}>
            <legend>{t.plans}</legend>
            {products.map(item => (
              <label key={item.plan} className={`premium-plan${item.plan === selected ? " selected" : ""}`}>
                <input type="radio" name="premium-plan" value={item.plan} checked={item.plan === selected}
                  onChange={() => setSelected(item.plan)} />
                <span className="premium-plan-name">
                  <strong>{t.plan[item.plan]}</strong>
                  {item.plan === "yearly" && <span className="premium-badge">{t.best}</span>}
                  {item.trialDays ? <span className="premium-badge trial">{t.trial(item.trialDays)}</span> : null}
                </span>
                <span className="premium-plan-price"><PlanPrice product={item} t={t} /></span>
              </label>
            ))}
          </fieldset>}

          {product && <>
            <button type="button" className="community-primary premium-buy" disabled={busy} onClick={() => void buy()}>
              {product.trialDays ? t.startTrial(product.trialDays) : t.subscribe[product.plan]}
            </button>
            <p className="premium-terms">
              {product.plan === "lifetime" ? t.lifetimeTerms
                : product.trialDays ? `${t.trialTerms(product.trialDays, product.price)} ${t.renewTerms}` : t.renewTerms}
            </p>
          </>}

          {rewardKind && <div className="premium-reward">
            <span>{t.or}</span>
            <button type="button" className="secondary-action" disabled={busy} onClick={() => void watchAd()}>
              ▶ {t.reward[rewardKind]}
            </button>
          </div>}
        </>}

        <div className="premium-links">
          {premium && premium.plan !== "lifetime" && <button type="button" className="text-action" onClick={() => void source.manageSubscriptions()}>{t.manage}</button>}
          {!premium && <button type="button" className="text-action" disabled={busy} onClick={() => void restore()}>{t.restore}</button>}
          {source.resetTest && premium && <button type="button" className="text-action" onClick={() => void resetTest()}>{t.resetTest}</button>}
        </div>
        <LegalLinks language={language} />
      </div>
    </dialog>
  );
}
