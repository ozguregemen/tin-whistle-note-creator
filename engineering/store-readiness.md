# Aşama 3 — iOS ve mağaza hazırlığı

Durum: 22.11.2026. Kurallar resmi Apple ve Google sayfalarından o gün okundu. Mağaza kuralları değişebildiği için gönderimden önce kaynakları yeniden kontrol edin.

## 1. Mağaza kuralları ve uygulamanın durumu

Uygulamada isteğe bağlı Topluluk hesabı (yalnızca kullanıcı adı ve şifre, e-posta yok), kullanıcıların eklediği düzenlemeler ve 1–5 yarım yıldızlı puanlar var. Reklam, izleme ve ödeme yok.

| Gereksinim | Apple | Google | Şu anki durum |
| --- | --- | --- | --- |
| Hesap silmeyi uygulama içinden başlatma; silme, düzenlemeleri ve puanları da kapsamalı; yalnızca devre dışı bırakmak yetmez | Zorunlu (5.1.1(v)) | Zorunlu | **Yok** → 3b |
| Uygulamayı indirmeden hesap silme isteği için web sayfası | — | Zorunlu | **Yok** → 3b (web sürümündeki hesap paneli) |
| Paylaşmadan önce kullanım şartlarını kabul ettirme ve uygunsuz içeriği tanımlama | Önerilir | Zorunlu | **Yok** → 3b |
| İçeriği ve kullanıcıyı uygulama içinden bildirme | Zorunlu (1.2) | Zorunlu | **Yok** → 3b |
| Kullanıcı engelleme | Zorunlu (1.2) | Zorunlu | **Yok** → 3b |
| Uygunsuz içeriği filtreleme ve bildirimlere zamanında yanıt (moderasyon) | Zorunlu (1.2) | Zorunlu | **Yok** → 3b (moderasyon aracı ve süreç) |
| Yayınlanmış iletişim bilgisi / destek adresi | Zorunlu (1.5) | Önerilir | **Karar sizde**: destek e-postası veya sayfası |
| Gizlilik politikası (uygulama içinde ve mağaza kaydında) | Zorunlu | Zorunlu | **Yok** → 3c |
| İnceleme için demo hesap ve canlı backend | Zorunlu (2.1) | Zorunlu (giriş gerektiren özellikler için) | Gönderimden önce hazırlanacak |
| Hesap olmadan da kullanılabilme | Önerilir (5.1.1) | — | ✓ Katalog, Prova ve Eğitim hesapsız çalışıyor |
| Üçüncü taraf/sosyal giriş varsa Apple ile giriş vb. | 4.8, yalnızca sosyal giriş varsa | — | ✓ Gerekmiyor, yalnızca kendi hesap sistemi var |
| Hedef API 36 | — | Zorunlu (31.08.2026'dan beri) | ✓ targetSdk 36 |
| AAB ve Play App Signing, RSA ≥2048 yükleme anahtarı | — | Beklenen | ✓ `npm run android:aab`. Anahtarı siz oluşturacaksınız (aşağıda) |
| Kişisel hesaplar için kapalı test: en az 12 test kullanıcısı, 14 gün kesintisiz | — | 13.11.2023'ten sonra açılan kişisel geliştirici hesaplarında zorunlu | **Karar sizde**: hesabın açılış tarihi |
| Gizlilik manifesti, gerekçeli API bildirimi | Zorunlu | — | ✓ `ios/App/App/PrivacyInfo.xcprivacy` (UserDefaults: CA92.1) |
| Mikrofon izin açıklaması | Zorunlu | — | ✓ `NSMicrophoneUsageDescription` (İngilizce ve Türkçe) |

### Veri beyanları (App Store "App Privacy" ve Google Play "Data safety")

- **Toplanmayan:** Mikrofonla canlı prova sesi cihazda işlenir. İki mağaza da yalnızca cihazda işlenen veriyi “toplanan” saymıyor. Ders ilerlemesi ve dil tercihi yalnızca cihazda kalıyor.
- **Toplanan, isteğe bağlı ve hesapla ilişkili:**
  - Kullanıcı adı: Apple'da “User ID”, Google'da “User IDs”.
  - Eklenen düzenlemeler: Apple'da “Other User Content”, Google'da “Other user-generated content”.
  - Puanlar: Apple'da “Other User Content” veya “Product Interaction”, Google'da “Other actions”. Mağaza konsolunda son kontrol yapılacak.
- **Şifre:** Sunucuda tuzlanmış scrypt özeti olarak tutuluyor. İki mağazanın listesinde ayrı bir şifre türü yok. Hesap verisinin parçası olarak açıklanacak.
- **Sunucu transkripsiyonuna gönderilen ses bölümü:** Apple'da “Audio Data”, Google'da “Voice or sound recordings”. Apple, sunucu sesi isteği yanıtladıktan hemen sonra siliyorsa beyan istemiyor. Google ise geçici işlemeyi de formda yanıtlatıyor. **Ses sunucusunun gerçekten saklamadığını doğrulamanız gerekiyor.** Manifestte bu tür şimdilik ihtiyatlı olarak beyan edildi.
- **IP adresi:** Hız sınırlayıcılar IP'yi anahtar olarak kullanıyor. Kaynak API'sinde Workers Logs açık (`observability`, örnekleme oranı 1). Bu günlüklerin IP veya istek başlıklarını ne kadar süre sakladığı Cloudflare panelinden doğrulanmadı. Saklanıyorsa IP adresi beyan edilmeli. Gönderimden önce kontrol edilecek.
- **Aktarım şifrelemesi:** Evet, tüm istekler HTTPS.

Kaynaklar:
- https://developer.apple.com/app-store/review/guidelines/ (sayfada “Last updated: October 16, 2026”)
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/app-store/app-privacy-details/
- https://support.google.com/googleplay/android-developer/answer/13327111 (hesap silme)
- https://support.google.com/googleplay/android-developer/answer/9876937 (kullanıcı içeriği)
- https://support.google.com/googleplay/android-developer/answer/10787469 (Data safety)
- https://developer.android.com/google/play/requirements/target-sdk
- https://support.google.com/googleplay/android-developer/answer/9842756 (uygulama imzalama)
- https://support.google.com/googleplay/android-developer/answer/14151465 (kişisel hesap test şartı)

Apple'ın gizlilik manifesti sayfası okuma sırasında içerik döndürmedi. `PrivacyInfo.xcprivacy` içeriği, Capacitor'ın kendi manifesti ve bilinen gerekçe kodu CA92.1 temel alınarak yazıldı. Xcode'un “Generate Privacy Report” çıktısıyla doğrulanmalı (aşağıdaki Mac listesi).

## 2. Sürüm numarası

Tek kaynak `mobile/app-version.json`: `versionName` (ör. `0.1.0`) ve `versionCode` (her mağaza yüklemesinde 1 artmalı).
- Android bu dosyayı `android/app/build.gradle` içinden doğrudan okur.
- iOS için `npm run ios:sync` bu değerleri `MARKETING_VERSION` ve `CURRENT_PROJECT_VERSION` alanlarına yazar.

## 3. Android AAB (Google Play)

Durum: `npm run android:aab` imzasız bir `app-release.aab` üretiyor (22.11.2026'da derlendi, 4,4 MB, versionCode 1, versionName 0.1.0). İmzasız olmasının nedeni henüz yükleme anahtarı olmaması.

**Yükleme anahtarı (bir kez, sizin yapmanız gereken):** Anahtar ve şifreleri repoya ve uygulama paketine koymayın.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.tin-whistle"
& "<JDK>\bin\keytool.exe" -genkeypair -v -keystore "$env:USERPROFILE\.tin-whistle\upload.jks" -alias upload -keyalg RSA -keysize 4096 -validity 10000
```

Ardından `%USERPROFILE%\.tin-whistle\android-upload.properties` dosyasını oluşturun:

```properties
storeFile=C:/Users/<kullanıcı>/.tin-whistle/upload.jks
storePassword=...
keyAlias=upload
keyPassword=...
```

Farklı bir yer kullanacaksanız `TWNC_ANDROID_SIGNING` ortam değişkeniyle bu dosyanın yolunu verin. Anahtarı ve şifreleri ayrıca güvenli bir yere yedekleyin. Play App Signing kullanıldığında anahtar kaybolursa Google yükleme anahtarını sıfırlayabilir, ama bu zaman alır.

**Play Console adımları (sizin hesabınızda, onayınızla):**
1. Uygulamayı oluşturun, Play App Signing'i kabul edin.
2. Gizlilik politikası URL'sini, Data safety formunu (yukarıdaki beyanlar) ve hesap silme web URL'sini girin.
3. Kapalı test kanalı açın. Hesabınız 13.11.2023'ten sonra açılmış kişisel bir hesapsa en az 12 test kullanıcısı 14 gün kesintisiz katılmalı.
4. İnceleme için bir demo Topluluk hesabı verin.

## 4. iOS (TestFlight) — Mac, Xcode ve iPhone gerektiren kontrol listesi

Windows'ta yapılanlar:
- `ios/` Capacitor 8 projesi oluşturuldu: iOS 15+, Swift Package Manager, Secure Storage, App ve Preferences eklentileri.
- Info.plist: mikrofon açıklaması (EN ve TR), `ITSAppUsesNonExemptEncryption = false` (yalnızca standart HTTPS ve iOS Keychain), `CFBundleLocalizations` en/tr, `arm64`.
- `PrivacyInfo.xcprivacy` App hedefinin kaynaklarına eklendi. Bu, proje dosyası elle düzenlenerek yapıldı ve Xcode'da doğrulanmalı.
- Sürüm: `npm run ios:sync`.

Mac'te yapılacaklar (bu ortamda yapılamadı):
1. Gereken araçlar: güncel Xcode, Node.js 22+, Apple Developer Program üyeliği.
2. `npm ci`, ardından `npm run ios:sync`, ardından Xcode'da `ios/App/App.xcodeproj` açılır. Swift paketleri ilk açılışta indirilir.
3. **Signing & Capabilities:** Ekibi seçin. Bundle ID `io.github.ozguregemen.tinwhistle`; bu kimlik mağazaya ilk yüklemeden sonra değiştirilemez, son kararınızı verin. Keychain için ek yetenek gerekmiyor.
4. Project navigator'da `PrivacyInfo.xcprivacy` dosyasının App hedefinde ve **Build Phases → Copy Bundle Resources** listesinde olduğunu kontrol edin.
5. Fiziksel iPhone'da çalıştırın ve şunları deneyin:
   - İlk dinlemede mikrofon izni penceresi çıkmalı ve açıklama metni görünmeli. İzni reddedip sonra Ayarlar'dan verin.
   - Serbest çalmada nota tanıma, 1. ders kuralı (tek uzun Si = 1/3).
   - **Sessiz anahtarı açıkken** tin whistle sesi duyuluyor mu? WKWebView'de Web Audio sessiz anahtarına uyabilir. Duyulmuyorsa bir AVAudioSession ayarı veya `navigator.audioSession` gerekecek.
   - Mikrofon kullanıldıktan sonra ses **kulaklıktan değil hoparlörden** mi geliyor? iOS kayıt sırasında sesi ahizeye yönlendirebilir.
   - Arka plana geçip dönme, telefon araması ile kesinti, Topluluk girişinin uygulama yeniden açılınca korunması (Keychain).
   - Çentik ve Dynamic Island güvenli alanları, büyük yazı boyutu, VoiceOver ile alt sekmeler.
6. Product → Archive → Distribute → App Store Connect → TestFlight.
7. Xcode Organizer'da **Generate Privacy Report** çıktısını App Store Connect'teki App Privacy yanıtlarıyla karşılaştırın.
8. App Store Connect'te:
   - Gizlilik politikası URL'si, destek URL'si ve App Privacy yanıtları.
   - Yaş derecelendirmesi (kullanıcı içeriği var).
   - Demo hesap ve inceleme notlarında özelliklerin açık açıklaması (2.3.1).

## 5. Sıradaki parçalar

- **3b, hesap ve içerik güvenliği:**
  - Hesap silme: uygulama içinden, ayrıca web'den. Hesap, oturumlar, düzenlemeler ve puanlar birlikte silinir. Şarkı silme ayrı bir işlem olarak kalır.
  - Kayıtta kullanım şartları onayı.
  - Düzenleme ve kullanıcı bildirme, kullanıcı engelleme.
  - Basit içerik filtresi.
  - Moderasyon için bildirim kuyruğu ve kaldırma aracı.
  - Önce staging'de test, üretim onayınızla.
- **3c, mağaza varlıkları:**
  - Uygulama simgesi ve açılış ekranı (şu an Capacitor varsayılanları).
  - Uygulama içi “Lisanslar ve atıflar” ekranı (GeneralUser GS, CC BY-SA örnekler, Basic Pitch Apache-2.0).
  - Gizlilik politikası ve kullanım şartları metinleri.
  - Mağaza açıklamaları ve ekran görüntüsü planı.

## 6. Sizden gereken kararlar

1. Destek iletişim bilgisi: hangi e-posta veya sayfa yayınlanacak?
2. Gizlilik politikası ve hesap silme sayfası nerede yayınlansın? Öneri: GitHub Pages altında `/privacy` ve `/account-deletion`.
3. Google Play geliştirici hesabınız kişisel mi, kurumsal mı ve ne zaman açıldı? Bu, 12 kişilik 14 günlük test şartını belirler.
4. Apple Developer Program üyeliği ve Mac erişimi var mı?
5. Uygulama kimliği `io.github.ozguregemen.tinwhistle` ve mağaza adı “Tin Whistle Note Creator” kesin mi?
6. Ses transkripsiyon sunucusu yüklenen bölümü saklıyor mu? Bu, veri beyanını belirler.
