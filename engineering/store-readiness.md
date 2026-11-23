# Aşama 3 — iOS ve mağaza hazırlığı

Durum: 22.11.2026. Kurallar resmi Apple ve Google sayfalarından o gün okundu. Mağaza kuralları değişebildiği için gönderimden önce kaynakları yeniden kontrol edin.

## 1. Mağaza kuralları ve uygulamanın durumu

Uygulamada isteğe bağlı Topluluk hesabı (yalnızca kullanıcı adı ve şifre, e-posta yok), kullanıcıların eklediği düzenlemeler ve 1–5 yarım yıldızlı puanlar var. Reklam, izleme ve ödeme yok.

| Gereksinim | Apple | Google | Şu anki durum |
| --- | --- | --- | --- |
| Hesap silmeyi uygulama içinden başlatma; silme, düzenlemeleri ve puanları da kapsamalı; yalnızca devre dışı bırakmak yetmez | Zorunlu (5.1.1(v)) | Zorunlu | ✓ 3b (staging) |
| Uygulamayı indirmeden hesap silme isteği için web sayfası | — | Zorunlu | ✓ 3b: `#delete-account` (Pages yeniden derlenince) |
| Paylaşmadan önce kullanım şartlarını kabul ettirme ve uygunsuz içeriği tanımlama | Önerilir | Zorunlu | ✓ 3b (staging) |
| İçeriği ve kullanıcıyı uygulama içinden bildirme | Zorunlu (1.2) | Zorunlu | ✓ 3b (staging) |
| Kullanıcı engelleme | Zorunlu (1.2) | Zorunlu | ✓ 3b (staging) |
| Uygunsuz içeriği filtreleme ve bildirimlere zamanında yanıt (moderasyon) | Zorunlu (1.2) | Zorunlu | ✓ 3b: filtre, otomatik gizleme, moderasyon aracı ve süreç |
| Yayınlanmış iletişim bilgisi / destek adresi | Zorunlu (1.5) | Önerilir | ✓ `ozguregemen1@gmail.com`, yasal sayfalarda |
| Gizlilik politikası (uygulama içinde ve mağaza kaydında) | Zorunlu | Zorunlu | ✓ `legal/privacy.html` (aşağıdaki URL'ler) |
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

## 5. Aşama 3b — hesap ve içerik güvenliği (23.11.2026)

Topluluk sunucusuna (`worker/community-api.mjs`) ve arayüze eklenenler:

| Gereksinim | Uygulama |
| --- | --- |
| Hesap silme (uygulama içi) | Katkılarım → **Hesabı sil**. Şifreyle onaylanır. Kullanıcı, oturumları, tüm düzenlemeleri, verdiği ve düzenlemelerinin aldığı puanlar, bildirimleri ve engellemeleri tek işlemde silinir. Ardından “Hesabın ve ona ait tüm veriler silindi” onayı gösterilir. Şarkı silme ayrı bir işlem olarak kalır (Katkılarım → Sil). |
| Hesap silme (web) | Web sürümünde `…/tin-whistle-note-creator/#delete-account` hesap panelini doğrudan açar. Google Play'e verilecek “hesap silme URL'si” bu adres. GitHub Pages yeniden derlenip yayınlanınca geçerli olur. |
| Kullanım şartları | Kayıtta zorunlu onay kutusu ve kurallar listesi (`shared/community-moderation.mjs`). Sunucu kabul edilen sürümü (`COMMUNITY_TERMS_VERSION`) saklar. Kurallardan önce katılmış üyeler, paylaşmadan veya düzenlemeden önce onay ekranı görür (sunucu `terms_required` döndürür). |
| Filtre | Başlık, sanatçı ve kullanıcı adlarında Türkçe ve İngilizce küfür ve hakaret listesi. Liste tam kelime eşleşmesiyle çalışır. Gerçek şarkı adlarını engellememek için kısa tutuldu. |
| Bildirme | Bir topluluk sürümünde **Bildir**. Kullanıcı bu sürümü ya da üyeyi seçer, ardından nedeni (rahatsız edici, taciz, spam, telif/şarkı sözü, diğer) ve isteğe bağlı bir not girer. Aynı kişinin tekrarlanan bildirimi tek sayılır. **3 farklı üye** bir sürümü bildirince sürüm, moderatör inceleyene kadar herkesten gizlenir. Yazar kendi listesinde “Bildirimler incelenirken gizlendi” uyarısını görür. |
| Engelleme | Bir topluluk sürümünde **Üyeyi engelle**. Engellenen üyenin sürümleri, engelleyen kişinin katalog ve aramasında görünmez. Engel Katkılarım → Engellenen üyeler bölümünden kaldırılabilir. |
| Moderasyon | `npm run moderate -- <worker-url> reports | hide | restore | delete | resolve | suspend | unsuspend`. Worker sırrı `MODERATOR_TOKEN` gerektirir ve uygulamaya girmez. Askıya alınan hesabın oturumları kapanır ve giriş yapamaz. |

Test:
- Birim testleri: `tests/community-safety.test.mjs` 6 test. Toplam 278/278.
- Yerel Worker ve staging'de `npm run smoke:community` 15/15.
- Tarayıcıda telefon boyutunda yerel Worker'a karşı: kayıt ve kurallar, bildirme, engelleme, engeli listeleme, yanlış ve doğru şifreyle hesap silme, eski üye için onay ekranı. Bildirimin moderasyon kuyruğuna düştüğü ve hesapla birlikte silindiği de kontrol edildi.

Moderasyon süreci (mağaza incelemesi için “zamanında yanıt”):
1. Bildirimleri en az günde bir kez kontrol edin: `npm run moderate -- https://tin-whistle-community.ozguregemenbusiness.workers.dev reports`
2. Kurala aykırı sürümü silin (`delete`), uygun olanı geri açın (`restore`, ilgili bildirimler kapanır). Tekrarlayan ihlalde hesabı askıya alın (`suspend`).
3. Destek iletişim adresine gelen şikâyetleri de aynı araçla işleyin.

**Üretime alma (onayınızdan sonra):**
1. Uzun ve rastgele bir moderatör anahtarı üretip üretim sırrı olarak ayarlayın: `wrangler secret put MODERATOR_TOKEN --config wrangler.community.jsonc`.
2. Worker'ı yayınlayın. Staging'de görüldüğü gibi Durable Object yeni sırrı ancak yeniden yayından sonra görür. Bu yüzden sırdan **sonra** yayınlayın.
3. Mevcut üyeler bir sonraki paylaşımlarında kuralları kabul etmeye yönlendirilir. Eski web sürümü bu onayı bilmediği için GitHub Pages da aynı anda güncellenmeli: `npm run build:pages` → `docs/`.
4. Veritabanı geçişi (yeni tablolar ve sütunlar) Worker açılışında kendiliğinden ve veri kaybı olmadan yapılır.

## 6. Durum ve sıradaki parçalar

- **3b:** Üretimde (23.11.2026, Topluluk Worker'ı `5524d03f`).
- **Simge, açılış ekranı, maskot ifadeleri, lisanslar ekranı:** `main`'de (PR #34, #35).
- **Yasal sayfalar** (`public/legal/`, TR ve EN). GitHub Pages'te ve uygulamanın içinde:

  | Mağaza alanı | URL |
  | --- | --- |
  | Gizlilik politikası | https://ozguregemen.github.io/tin-whistle-note-creator/legal/privacy.html |
  | Kullanım şartları / EULA | https://ozguregemen.github.io/tin-whistle-note-creator/legal/terms.html |
  | Hesap silme (Google Play “web resource”) | https://ozguregemen.github.io/tin-whistle-note-creator/legal/account-deletion.html |
  | Destek URL'si / e-posta | `ozguregemen1@gmail.com` |

  Bağlantılar kayıt formunda (kuralların altında), Lisanslar ekranında, uygulamanın alt bilgisinde ve web sitesinin alt bilgisinde.
- **E-postayla silme talepleri** (örneğin şifresini unutanlar): `npm run moderate -- <worker-url> delete-user <kullanıcı-adı>`. Hesap silmeyle aynı işlemi şifresiz yapar. Talebin hesap sahibinden geldiğini önce doğrulayın.
- **Kalan:** Mağaza açıklamaları ve ekran görüntüsü planı.

## 7. Sizden gereken kararlar

1. Google Play geliştirici hesabınız kişisel mi, kurumsal mı ve ne zaman açıldı? Bu, 12 kişilik 14 günlük test şartını belirler.
2. Apple Developer Program üyeliği ve Mac erişimi var mı?
3. Uygulama kimliği `io.github.ozguregemen.tinwhistle` ve mağaza adı “Tin Whistle Note Creator” kesin mi?
4. Ses transkripsiyon sunucusu: Bizim kodumuz (`services/audio/server.py`) YouTube dönüşümünü geçici bir klasörde yapıp siliyor. Transkripsiyon MuScriptor kütüphanesinin sunucusunda yapılıyor. Gizlilik politikası "saklamayız" diyor, bu yüzden sunucuda istek gövdesini kaydeden bir günlük olmadığını doğrulayın.
5. Gizlilik politikasında veri sorumlusu "uygulamanın geliştiricisi" olarak geçiyor. KVKK ve mağaza kayıtları için adınızın veya şirket adınızın yazılması gerekebilir.
