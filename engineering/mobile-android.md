# Mobil uygulama — Aşama 1: Android prototipi

Bu belge Capacitor tabanlı mobil sürümün teknik kararlarını, derleme adımlarını ve gerçek cihaz test listesini tutar. Web yayını (GitHub Pages `docs/`, ChatGPT Sites/Vinext ve Cloudflare Worker'ları) bu çalışmadan etkilenmez.

## Teknik kararlar

| Konu | Karar | Neden |
| --- | --- | --- |
| Çerçeve | Capacitor 8 (`@capacitor/core`, `@capacitor/android`, `@capacitor/app`) | Mevcut React/Vite kodu değişmeden WebView içinde çalışır. Aynı paket iOS'a da taşınır. |
| Depo | Aynı depo, ayrı dal (`mobile/android-prototype`) | Ortak nota, parmak, ritim ve ders modülleri tek yerde kalır. Haftalık katalog güncellemesi mobil pakete de girer. |
| Web derlemesi | Ayrı `vite.mobile.config.ts`, kök `mobile/`, `base: "./"`, çıktı `dist-mobile/` (git dışı) | `vite.pages.config.ts` ve `docs/` olduğu gibi kalır. |
| Paketli varlıklar | `public/` içindeki tin whistle soundfont ve WAV örnekleri, Basic Pitch modeli ve `catalog/catalog.json` APK'nın içinde | Katalog, Prova ve Eğitim çevrimdışı açılabilir. |
| Ses çıkışı | Yeni `app/whistle-player.mjs`: Web'deki oynatıcıyla aynı sırayı izler (GeneralUser GS soundfont, ardından CC BY-SA WAV örnekleri, ardından sinüs yedeği) | Ses mantığı `app/page.tsx` içine gömülüydü. Mobil ve web aynı modülü kullanabilsin diye ayrıldı. Web sayfası henüz bu modüle taşınmadı (Aşama 2). |
| Mikrofon | Web Audio + `getUserMedia`, mevcut `PracticeMicrophone`, `live-pitch.mjs` ve `song-follow.mjs` değiştirilmeden kullanılıyor | Önce cihazda ölçeceğiz. Gecikme veya kesinti sorunu ölçülürse yalnızca Android için yerel bir ses adaptörü yazılacak, nota takip mantığı ortak kalacak. |
| İzin | `RECORD_AUDIO` ve `MODIFY_AUDIO_SETTINGS` manifestte. Çalışma zamanı izni kullanıcı “Dinlemeyi başlat”a dokunduğunda isteniyor | Capacitor'ın WebChromeClient'ı WebView isteğini Android izin penceresine bağlar. |
| Arka plan | `@capacitor/app` `appStateChange` ve `visibilitychange` olayları mikrofonu bırakır ve oynatıcıyı askıya alır | Arka planda mikrofon açık kalmaz. |
| Uygulama kimliği | `io.github.ozguregemen.tinwhistle` | GitHub Pages alan adınıza dayanır. Mağazaya ilk yüklemeden önce değiştirilebilir, sonra değiştirilemez. |

## Canlı servisler ve origin

Kurulu uygulama paketi `https://localhost` (Android) ve `capacitor://localhost` (iOS) origin'inden yükler. 22.11.2026'da salt-okunur GET istekleriyle ölçüldü:

| Origin | Source API `/health` | Community API `/songs` |
| --- | --- | --- |
| `https://ozguregemen.github.io` | 200 | 200 |
| `https://localhost` | 403 | 403 |
| `capacitor://localhost` | 403 | 403 |

İki Worker yalnızca yapılandırılmış origin'leri ve `http://localhost:<port>` kalıbını kabul ediyor. Bu yüzden canlı nota arama, BPM ve Topluluk kurulu uygulamada şu an çalışmaz. Paketli içerik etkilenmez. Aşama 2'de önce yerel `wrangler dev` ve staging üzerinde, sizin onayınızla, iki mobil origin'in dar kapsamlı olarak izin listesine eklenmesi önerilecek. Ses POST rotalarının `Origin` şartı ve `AUDIO_SERVICE_ORIGINS` / `SCORE_SOURCE_ORIGINS` listeleri ayrıca değerlendirilecek.

## Derleme (Windows)

Gerekenler: Node.js 22.13 veya daha yenisi, JDK 21, Android SDK (platform 36, build-tools 36).

```powershell
$env:ANDROID_HOME = "<Android SDK klasörü>"
$env:JAVA_HOME = "<JDK 21 klasörü>"
npm ci
npm run android:apk
```

`npm run android:apk` sırasıyla Basic Pitch modelini `public/` altına kopyalar, `dist-mobile/` klasörünü üretir, `npx cap sync android` ile Android projesine aktarır ve Gradle `assembleDebug` görevini çalıştırır.

Çıktı: `android/app/build/outputs/apk/debug/app-debug.apk`

Yalnızca web paketini denemek için:

```powershell
npm run build:mobile
npm run preview:mobile
```

## Telefona kurulum

1. APK'yı telefona kopyalayın (USB, Google Drive veya e-posta).
2. Dosyaya dokunun. Android “bilinmeyen uygulamalar” uyarısı gösterirse dosyayı açtığınız uygulamaya (Dosyalar, Drive vb.) bu izin için onay verin.
3. Alternatif: USB hata ayıklama açıkken `adb install -r app-debug.apk`.

Bu bir debug APK'sıdır. Android'in debug anahtarıyla imzalanır, mağazaya yüklenemez. Yeni sürüm kurarken önce eskisini kaldırmanız gerekmez, aynı anahtarla imzalandığı sürece üzerine kurulur.

## Gerçek cihaz test listesi (Aşama 1)

Her test için sonucu ve uygulamadaki “Olay kaydı”nı (“Kaydı kopyala”) paylaşın.

1. **Açılış ve çevrimdışı**: Uçak modunda uygulamayı açın, “Kontrolleri çalıştır”a dokunun. Katalog, iki WAV, soundfont ve iki Basic Pitch dosyası ✓ olmalı. İki servis ✗ “offline” göstermeli.
2. **Tin whistle sesi**: Bir notaya dokunun. Durum rozeti “Tin whistle soundfont” olmalı. “Re gamını çal” sekiz notayı çalmalı ve vurgu sesle birlikte ilerlemeli. Yazılı E4 düğmesi E5 perdesinde duyulmalı.
3. **Mikrofon izni**: “Serbest çalma” → “Dinlemeyi başlat”. İzin penceresi o anda açılmalı. Reddedin: “mikrofon izni” uyarısı görünmeli ve uygulama donmamalı. Tekrar deneyip izin verin.
4. **Serbest çalma**: D whistle ile alt registerdan D, E, F♯, G, A, B, C♯ ve üst D çalın. Nota adı, Do/Re/Mi adı, yazılı oktav ve altı delik doğru görünmeli. Yanlış notaları kaydedin.
5. **Arka plan**: Dinlerken ana ekrana dönün, 5 saniye sonra uygulamaya geri gelin. Olay kaydında `app: background` ve `microphone: off` görünmeli. Durum çubuğundaki mikrofon simgesi kaybolmalı.
6. **Ses kesintisi**: Dinlerken kendinize arama yaptırın veya bir alarm çaldırın. Sonra uygulamaya dönüp dinlemeyi yeniden başlatın.
7. **1. ders takibi**: Tek ve uzun bir Si çalın: sayaç 1/3'te kalmalı. Nefes alıp iki ayrı Si daha çalın: 3/3 olmalı. Olay kaydında `lesson first-b: completed` görünmeli.
8. **Rehber sesi**: 1. ders takibinde rehberi açın ve hoparlörden gelen rehber sesinin doğru nota sayılıp sayılmadığını not edin.
9. **Örneği dinle**: Vurgulanan nota sesle eşzamanlı ilerlemeli.
10. **Canlı servisler**: Wi-Fi açıkken “Kontrolleri çalıştır”. İki servis için şu an ✗ “CORS/Origin” sonucu bekleniyor.
11. **Ekran**: Büyük yazı tipi ayarıyla (Ayarlar → Ekran → Yazı tipi boyutu) düğmelerin taşmadığını, durum ve gezinme çubuklarının içeriği örtmediğini kontrol edin.

## Aşama 1 cihaz sonucu ve düzeltme (22.11.2026)

Redmi Note 10S, Android WebView Chrome 157 üzerinde ölçüldü:

- Paketli varlıkların hepsi yüklendi. Soundfont sesi 48 kHz'de, 5 ms temel gecikmeyle çaldı.
- Mikrofon “izin bekleniyor”da takılı kaldı. Olay kaydında her denemede aynı saniyede `microphone: on` ve `microphone: off` vardı. Neden: Prototip, `PracticeMicrophone` bileşenine her çizimde yeni bir `onUseChange` fonksiyonu veriyordu. Bileşenin temizleme effect'i buna bağlı olduğu için açılmakta olan mikrofon hemen bırakılıyordu. Düzeltme: Bileşen artık son geri çağırmayı bir ref'te tutuyor ve yeniden çizim mikrofonu kapatmıyor. Prototip de sabit bir geri çağırma kullanıyor.
- Sahte mikrofonla tarayıcıda doğrulandı: 988 Hz → Si / B5 (yazılı B4). 1. derste tek uzun Si 1/3, iki ayrı üfleyiş daha 3/3 yaptı.
- İki Worker kurulu uygulamadan `Failed to fetch` döndü (403, beklenen).

## Aşama 2a — tam uygulama, çevrimdışı katalog, kalıcı ilerleme

- `mobile/main.tsx` artık web'deki uygulamanın tamamını (`app/page.tsx`) açıyor. Katalog, Notaya çevir, Prova ve Eğitim alt sekme çubuğunda. Topluluk ve hesap üst çubukta. Klavye açıkken sekme çubuğu gizleniyor. Sistem çubukları için Capacitor 8'in `--safe-area-inset-*` değişkenleri kullanılıyor.
- `app/runtime-config.mjs`: Mobil giriş, ilk çizimden önce paketli kataloğu (41 şarkı), YouTube MP3'ün kapalı olduğunu ve arka planda duraklatmayı bildiriyor. Web girişleri bunu hiç çağırmıyor, web davranışı aynı kalıyor.
- `app/durable-storage.mjs`: Ders ilerlemesi, dil, not düzeltmeleri ve bekleyen kaynak işi web'de localStorage'da, kurulu uygulamada `@capacitor/preferences` (Android SharedPreferences) ile saklanıyor. Aşama 1 sürümünde WebView'a kaydedilmiş ilerleme bir kez yerel depoya kopyalanıyor. Web'deki ilerleme telefona taşınmıyor.
- Uygulama arka plana geçince (`appStateChange`) mikrofon bırakılıyor ve katalog oynatıcısı yerini koruyarak duruyor. Android geri tuşu cihaz testinden uygulamaya dönüyor, ana ekranda uygulamayı küçültüyor.
- Cihaz testi ekranı sayfanın en altındaki “Cihaz testi · Device check” bağlantısında.
- Kapsam dışında kalan: Worker origin izinleri (onayınızla, önce staging), Topluluk oturumunun güvenli depoda tutulması, ses dosyası seçici ve puanlama dokunmatik testleri (Aşama 2b).

Web etkisi: `page.tsx`, `tutorial-workspace.tsx` ve `practice-microphone.tsx` değişti. Web'de davranış aynı ve testler 268/268 geçiyor. `docs/` bu dalda yeniden üretilmedi. Dal `main`'e birleştirildiğinde GitHub Pages çıktısının olağan akışla yeniden derlenmesi gerekecek.

### Aşama 2a cihaz testleri

1. Uçak modunda açın: Katalogda “Tüm şarkılar 38” görünmeli (41 düzenleme). Bir şarkıyı açıp Çal'a basın, tin whistle sesi ve aktif nota vurgusu ilerlemeli.
2. Çalarken ana ekrana dönüp geri gelin: Oynatıcı durmuş ve yerini korumuş olmalı.
3. “Bu şarkıyı prova et” → Takibi başlat: Doğru notada sağdaki kartta parmak şeması ve nota adı kalıcı görünmeli. Yanlış notada sıra ilerlememeli.
4. Eğitim → İlk derse başla: Üç ayrı Si ile dersi bitirin. Uygulamayı son uygulamalardan tamamen kapatıp yeniden açın, ilerleme %4 (1/24) olarak kalmalı.
5. Dili English yapın, uygulamayı kapatıp açın: Dil korunmalı.
6. Notaya çevir → MIDI / MusicXML ve Ses kaydı: Dosya seçici açılmalı. Bir dosya seçince sonuç gelmeli. YouTube MP3 indirme bağlantısı görünmemeli.
7. Geri tuşu: Ana ekranda uygulamayı küçültmeli. Cihaz testi ekranında uygulamaya dönmeli.
8. Büyük yazı tipiyle alt sekme etiketlerinin taşmadığını kontrol edin.

## Lisans ve atıflar

- Tin whistle sesleri: GeneralUser GS (yeniden paketlemeye izinli) ve CC BY-SA 4.0 WAV örnekleri. Ayrıntılar `public/audio/tin-whistle/ATTRIBUTION.md`, paket içinde de yer alıyor.
- Basic Pitch modeli: Apache-2.0, `LICENSE` dosyası model klasörüyle birlikte paketleniyor.
- Mağaza sürümünden önce uygulama içinde görünür bir “Lisanslar ve atıflar” ekranı eklenecek (Aşama 3).
