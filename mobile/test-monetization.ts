// Simulated purchases and rewarded ads for staging builds only (M1 in
// engineering/monetization.md). Nothing here talks to Google Play or AdMob and
// no money moves. Production builds do not include this provider.
import type { PremiumPlan } from "../app/entitlements.mjs";
import type { MonetizationProvider, PremiumProduct, PremiumPurchase } from "../app/premium";

const PURCHASE_KEY = "twnc-test-purchase";
const DAY = 24 * 60 * 60 * 1000;
const DURATION: Record<Exclude<PremiumPlan, "lifetime">, number> = { monthly: 30 * DAY, yearly: 365 * DAY };

// Sample prices so the layout can be judged; the real ones come from Play Console.
const PRODUCTS: PremiumProduct[] = [
  { plan: "yearly", productId: "premium:yearly", price: "₺499,99", monthlyPrice: "₺41,67", trialDays: 7 },
  { plan: "monthly", productId: "premium:monthly", price: "₺79,99" },
  { plan: "lifetime", productId: "premium_lifetime", price: "₺1.199,99" },
];

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saved(): PremiumPurchase | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(PURCHASE_KEY) ?? "null");
    if (!value) return null;
    if (value.expiresAt !== null && value.expiresAt <= Date.now()) return null;
    return value;
  } catch {
    return null;
  }
}

function save(purchase: PremiumPurchase | null) {
  try {
    if (purchase) window.localStorage.setItem(PURCHASE_KEY, JSON.stringify(purchase));
    else window.localStorage.removeItem(PURCHASE_KEY);
  } catch { /* The purchase lasts for this session. */ }
}

/** A labelled full-screen stand-in for a rewarded ad with a short countdown. */
function simulatedAd(seconds = 3): Promise<boolean> {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "test-ad";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Test reklamı · Test ad");
    const title = document.createElement("p");
    title.textContent = "Test reklamı · Test ad";
    const count = document.createElement("strong");
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Kapat (ödülsüz) · Close (no reward)";
    overlay.append(title, count, close);
    // The paywall is a modal <dialog>; the overlay must sit inside the top layer to be clickable.
    (document.querySelector("dialog[open]") ?? document.body).append(overlay);
    close.focus();
    let left = seconds;
    const finish = (watched: boolean) => {
      window.clearInterval(timer);
      overlay.remove();
      resolve(watched);
    };
    const tick = () => {
      count.textContent = String(left);
      if (left <= 0) finish(true);
      left -= 1;
    };
    const timer = window.setInterval(tick, 1000);
    tick();
    close.addEventListener("click", () => finish(false));
  });
}

export function createTestMonetization(): MonetizationProvider {
  return {
    testLabel: "gerçek ödeme yok · no real payment",
    async products() {
      await wait(300);
      return PRODUCTS;
    },
    async purchase(plan) {
      await wait(700);
      const product = PRODUCTS.find(item => item.plan === plan);
      if (!product) throw new Error(`No product for ${plan}`);
      const purchase: PremiumPurchase = {
        plan,
        productId: product.productId,
        expiresAt: plan === "lifetime" ? null : Date.now() + DURATION[plan],
      };
      save(purchase);
      return purchase;
    },
    async restore() {
      await wait(400);
      return saved();
    },
    async current() {
      return saved();
    },
    async manageSubscriptions() {
      window.alert("Test modu: gerçek uygulamada Google Play abonelikler sayfası açılır.\nTest mode: the real app opens Google Play subscriptions.");
    },
    showRewardedAd: () => simulatedAd(),
    async resetTest() {
      save(null);
    },
  };
}
