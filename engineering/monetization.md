# Gelir modeli planı: freemium ve ödüllü reklam

Durum: 23.11.2026. Model kullanıcı tarafından onaylandı. **M1 yazıldı.** Kilitler ve satın alma ekranı yalnızca staging sürümünde, sahte satın alma ve sahte ödüllü reklamla çalışıyor (`mobile/test-monetization.ts`). Üretim mobil sürümü ve web sürümü değişmedi. Fiyatlar ve sınırlar hâlâ öneri.

## 1. Model

- Uygulama Play'de **ücretsiz** listelenir. Premium uygulama içinden satılır, mağaza sayfasında “Uygulama içi satın alma” ve “Reklam içerir” etiketleri görünür.
- Ana döngü ücretsizdir: şarkı seçme, parmak şeması, dinleme ve çalma. Kilitler yalnızca maliyeti olan ya da ileri seviye özelliklerdedir.
- İlk sürümde yalnızca **ödüllü reklam** olur. Banner ve geçiş reklamı yoktur. Gelir verisine bakıldıktan sonra katalog ve gözatma ekranlarına banner eklenebilir. Prova ve ders ekranlarına hiçbir zaman reklam konmaz.
- **Web sürümü değişmez.** GitHub Pages ve ChatGPT Sites'ta kilit, reklam ve satın alma yoktur. Gelir özellikleri yalnızca `runtimeConfig().monetization` tanımlı olduğunda, yani mobil uygulamada çalışır. Web'de satış ileride ayrı bir iş olarak ele alınabilir.

## 2. Ücretsiz ve premium

| Özellik | Ücretsiz | Ödüllü reklamla | Premium |
| --- | --- | --- | --- |
| Katalog, arama, parmak şeması, dinleme | Sınırsız | — | Sınırsız |
| MIDI / MusicXML içe aktarma, nota yapıştırma | Sınırsız | — | Sınırsız |
| Serbest nota provası (mikrofon) | Sınırsız | — | Sınırsız |
| Topluluk: paylaşma, puanlama | Sınırsız | — | Sınırsız |
| Eğitim | 1. ve 2. ünite (8 ders) | Kilitli bir ders 24 saat açılır | 24 dersin tamamı |
| Şarkı takibiyle prova | Günde 3 farklı şarkı | +1 şarkı | Sınırsız |
| Sesten notaya çevirme (sunucuda) | Ayda 3 | +1 çevirme | Sınırsız (adil kullanım: ayda 100) |
| Reklam | Yalnızca kullanıcı isterse | — | Hiç yok |

- Ders içindeki takipli provalar şarkı kotasından düşmez.
- Ücretsiz sınırlar öneridir. Uygulamadan sonra kapalı testte gelen geri bildirime göre değiştirilebilir. Değerler tek bir yapılandırma dosyasında tutulur.

## 3. Ürünler ve fiyat

| Play ürünü | Tür | Not |
| --- | --- | --- |
| `premium` | Abonelik, iki temel plan: `monthly`, `yearly` | Yıllık plana 7 günlük ücretsiz deneme teklifi |
| `premium_lifetime` | Tek seferlik (tüketilmeyen) ürün | Aboneliği sevmeyenler için |

**Önerilen başlangıç fiyatları (ABD):** aylık 3,99 $, yıllık 24,99 $, ömür boyu 59,99 $. Diğer ülkelerin fiyatları Play'in yerel fiyat dönüştürmesiyle belirlenir. Türkiye fiyatı ayrıca, belirgin biçimde daha düşük ayarlanır. Kesin fiyatları siz belirleyeceksiniz.

Google abonelik ve satın alma gelirinden %15 hizmet ücreti alır (yılda ilk 1 milyon $ için).

## 4. Satın alma ekranı

**Açıldığı yerler:**
1. Kilitli bir derse dokunulduğunda veya 8. ders tamamlandığında (maskot kutlarken).
2. Günlük şarkı takibi sınırı dolduğunda.
3. Aylık sesten notaya çevirme sınırı dolduğunda.
4. Hesap / ayarlar alanındaki “Premium” girişinden.

İlk açılışta satın alma ekranı gösterilmez.

**İçeriği:**
- Premium'un faydaları.
- Üç plan. Yıllık plan önceden seçili gelir ve aylık karşılığı gösterilir.
- Deneme ve yenileme koşulları (Play bunları açıkça istiyor).
- “Satın alımları geri yükle” ve “Aboneliği yönet” bağlantıları. Aboneliği yönet, Play abonelik sayfasını açar.
- Kullanım şartları ve gizlilik bağlantıları.
- Uygun durumlarda “Reklam izle, bir kez kullan” seçeneği.

**Dil:** Türkçe ve İngilizce.

## 5. Teknik tasarım

### Paketler (sabit sürüm, en az iki haftalık)
- Faturalandırma: `@capgo/native-purchases`. Play Billing Library 9.1.0 kullanır, Google'ın şu anki alt sınırı 8. iOS'ta StoreKit 2'yi de destekler. Lisansı MPL-2.0.
- Reklam: `@capacitor-community/admob` 8.3.0. Google Mobile Ads SDK'yı ve rıza ekranı için UMP SDK'yı içerir. Eklentinin varsayılanı `play-services-ads:25.4.+` olduğu için bu sürüm `android/variables.gradle` içinde tam numarayla sabitlenir.
- Alternatifler incelendi: `cordova-plugin-purchase` (Billing 9.0, Cordova tabanlı) ve RevenueCat. RevenueCat ek bir üçüncü taraf hesap ve veri paylaşımı demek. Kendi Worker'ımız doğrulamayı ücretsiz yapabildiği için seçilmedi.

### Uygulama içi parçalar
- `app/entitlements.mjs`: Saf mantık. Plan durumu, kotalar, gün ve ay anahtarları, ödüllü kredi. Node testleriyle sınanır.
- `app/premium-gate.tsx`: Kilit bileşeni ve satın alma ekranı.
- `mobile/billing.ts`: Eklentiyi saran katman. Ürünleri çeker, satın alır, geri yükler, doğrulamaya gönderir.
- `mobile/ads.ts`: UMP rıza ekranı, ödüllü reklamın yüklenip gösterilmesi, gizlilik seçenekleri girişi.
- Hak durumu `durableStorage` içinde son kullanma tarihiyle saklanır. Uygulama her açıldığında ve öne geldiğinde Play'den yeniden sorulur. Cihaz çevrimdışıysa 7 günlük bir tolerans süresi tanınır.

### Sunucu doğrulaması (Cloudflare Worker)
- Yeni uç nokta: `POST /api/entitlements/verify` (`productId` ve `purchaseToken` alır).
- Worker Google Play Developer API'ye sorar: abonelikler için `purchases.subscriptionsv2.get`, ömür boyu ürün için `purchases.products.get`. Satın alma onaylanmamışsa, Google'ın istediği gibi 3 gün içinde onaylar (`acknowledge`).
- Yanıt yalnızca `active`, `expiresAt` ve `productId` içerir. Satın alma belirteci saklanmaz, yalnızca istek boyunca işlenir.
- Kimlik bilgisi: Google Cloud hizmet hesabının JSON anahtarı Worker gizli değişkeni olarak tutulur (`PLAY_SERVICE_ACCOUNT`). Repoya ve uygulama paketine girmez.
- Sıra her zamanki gibi: önce staging, onayınızla sonra üretim.

### Bilinen sınırlama
Ücretsiz kotalar cihazda sayılır. Uygulama verisini silen biri kotayı sıfırlayabilir. Bu ilk sürüm için kabul edilebilir. Sesten notaya çevirmenin gerçek maliyeti ses sunucusunda oluştuğu için oradaki adil kullanım sınırı ileride sunucu tarafında, cihaz başına bir kimlikle uygulanabilir.

### Reklam akışı
- UMP rıza ekranı uygulama açılışında değil, ilk ödüllü reklam isteğinde gösterilir.
- AB, İngiltere ve İsviçre'de Google, sertifikalı bir rıza yönetim platformu ister. UMP bu şartı karşılar. Rıza yoksa yalnızca sınırlı reklam gelir.
- Ayarlara “Reklam gizlilik seçenekleri” girişi eklenir. UMP bu girişin gerekli olduğunu bildirdiğinde görünür.
- Reklam başlamadan önce mikrofon ve çalma durdurulur.
- Hata ayıklama ve staging sürümlerinde Google'ın test reklam birimleri kullanılır.
- AdMob uygulama kimliği ve reklam birimi kimlikleri gizli değildir, mobil yapılandırmaya yazılır.

## 6. Mağaza ve hukuk değişiklikleri

- **Play Console:**
  - Reklam: Evet.
  - IARC anketi: dijital ürün satın alma Evet.
  - Data safety'ye eklenecekler:
    - Cihaz veya diğer kimlikler: reklam kimliği, AdMob ile paylaşılır.
    - Satın alma geçmişi: uygulama işlevi.
    - AdMob'un topladığı veriler: yaklaşık konum, tanılama, uygulama etkileşimleri. Google'ın “AdMob Data safety” rehberine göre doldurulur.
- **Gizlilik politikası:**
  - AdMob ve UMP bölümü.
  - Reklam kimliği ve rıza.
  - Satın alma doğrulamasında Google'a giden ve Google'dan gelen veri.
  - KVKK kapsamında yurt dışına aktarım (Google).
- **Kullanım şartları:**
  - Abonelik otomatik yenilenir. İptal Play'den yapılır.
  - Deneme süresi bitince ücret alınır.
  - İadeler Google Play politikasına göre yapılır.
  - Ömür boyu ürün, uygulama yayında kaldığı sürece geçerlidir.
- **Mağaza açıklaması:** Premium özellikleri ve abonelik bilgisi eklenir. `full_description.txt` içindeki “Reklam ve izleme yok” / “No ads, no tracking” cümlesi kaldırılır. Bu cümle şu anki sürüm için doğru, freemium sürümü için yanlış olur.

## 7. Sizin yapmanız gerekenler (hesap işlemleri, ben yapmam)

1. **Play Console → Ödeme profili (satıcı hesabı).** Vergi ve banka bilgisi gerekir. Türkiye'den açılabildiğini profil ekranında doğrulayın.
2. **Ürünleri oluşturun.** Play, faturalandırma izni olan bir AAB yüklenmeden ürün oluşturmaya izin vermez. Bu yüzden önce dahili teste yükleme yapılır, sonra `premium` ve `premium_lifetime` ürünleri bölüm 3'teki kimliklerle oluşturulur.
3. **Lisans test kullanıcıları.** Play Console → Ayarlar → Lisans testi'ne kendi Gmail'inizi ekleyin. Test kullanıcıları gerçek para ödemeden satın alır, abonelik birkaç dakikada bir yenilenir.
4. **AdMob hesabı.** Uygulamayı ekleyin ve bir “Ödüllü” reklam birimi oluşturun. Uygulama kimliğini ve reklam birimi kimliğini bana iletin.
5. **Google Cloud hizmet hesabı.**
   - Google Cloud'da Google Play Android Developer API'yi açın ve bir hizmet hesabı oluşturun.
   - Play Console → Kullanıcılar ve izinler bölümünde bu hesabı yalnızca bu uygulama için “Finansal verileri görüntüleme” ve “Siparişleri ve abonelikleri yönetme” izinleriyle davet edin.
   - Hesabın JSON anahtarını indirip `%USERPROFILE%\.tin-whistle\` altına koyun. Worker gizli değişkenine onayınızla ben yüklerim.

## 8. Uygulama aşamaları

| Aşama | İçerik | Doğrulama |
| --- | --- | --- |
| M1 | `entitlements.mjs`, kilitler, satın alma ekranı. Sahte faturalandırma yalnızca staging sürümünde açık. | Node testleri, telefonda staging APK |
| M2 | Gerçek faturalandırma eklentisi, Worker doğrulaması (staging), dahili test kanalı | Lisans test kullanıcısıyla satın alma, geri yükleme, iptal, yenileme |
| M3 | AdMob ödüllü reklam, UMP rıza ekranı, gizlilik seçenekleri | Test reklamları; AB rızası için UMP hata ayıklama coğrafyası |
| M4 | Gizlilik politikası, kullanım şartları, mağaza metinleri, Data safety; üretim Worker'ı (onayınızla) | Yayında sayfa kontrolü, kapalı test |

M1 hesap gerektirmez, hemen başlanabilir. M2 için bölüm 7'deki 1–3. ve 5. adımlar, M3 için 4. adım gerekir.

## 9. Açık kararlar

1. Fiyatlar. Bölüm 3'teki öneriler kabul mü, Türkiye fiyatı ne olsun?
2. Ücretsiz sınırlar. 8 ders, günde 3 şarkı, ayda 3 çevirme kabul mü?
3. Deneme süresi. 7 gün mü, yoksa hiç deneme olmasın mı?

## Kaynaklar

- [Play Billing Library sürüm kaldırma takvimi](https://developer.android.com/google/play/billing/deprecation-faq): 31 Ağustos 2026'dan sonra yeni uygulamalar ve güncellemeler için Billing 8 veya üstü zorunlu.
- [Abonelik yaşam döngüsü ve onaylama](https://developer.android.com/google/play/billing/lifecycle/subscriptions)
- [Google'ın AB, İngiltere ve İsviçre rıza yönetimi şartları](https://support.google.com/admob/answer/13554116)
- [AdMob AB kullanıcı rızası (UMP)](https://developers.google.com/admob/android/privacy/gdpr)
- [@capgo/native-purchases](https://github.com/Cap-go/capacitor-native-purchases)
