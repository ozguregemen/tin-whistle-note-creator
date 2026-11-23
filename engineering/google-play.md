# Google Play yayın rehberi

Bu belge Play Console'da doldurulacak her alanı ve yanıtını içerir. Durum: 23.11.2026. Play Console arayüzü ve politikaları değişebildiği için alan adları zamanla farklılaşabilir.

## 1. Hazır dosyalar

| Ne | Nerede | Not |
| --- | --- | --- |
| Uygulama adı, kısa ve uzun açıklama, sürüm notu | `store/google-play/{tr-TR,en-US}/` | Karakter sınırları `tests/store-listing.test.mjs` ile denetlenir |
| Uygulama simgesi 512×512 | `store/google-play/<dil>/images/icon.png` | `npm run store:graphics` |
| Tanıtım görseli 1024×500 | `store/google-play/<dil>/images/featureGraphic.png` | Şeffaflıksız PNG |
| Telefon ekran görüntüleri 1080×1920 | `store/google-play/<dil>/images/phoneScreenshots/` | Aşağıdaki listeye göre çekilip `npm run store:graphics` ile çerçevelenir |
| Gizlilik politikası URL'si | https://ozguregemen.github.io/tin-whistle-note-creator/legal/privacy.html | |
| Hesap silme URL'si | https://ozguregemen.github.io/tin-whistle-note-creator/legal/account-deletion.html | |
| İletişim e-postası | ozguregemen1@gmail.com | |
| Web sitesi | https://ozguregemen.github.io/tin-whistle-note-creator/ | |

Klasör yapısı fastlane `supply` biçimindedir. İleride yükleme otomatikleştirilebilir.

## 2. Ekran görüntüleri (telefonda çekilecek)

Play en az 2, en fazla 8 telefon görüntüsü kabul eder. Redmi Note 10S ekranı 1080×2400'dür ve Play'in 2:1 oran sınırını aşar. Bu yüzden görüntüler başlıklı bir çerçeveye yerleştirilir.

Hazırlık: Uygulamayı Türkçe yapın. Bildirimleri temizleyin (veya “Rahatsız etmeyin” açın), pil ve saat görünse de olur. Ses düğmesi + güç düğmesiyle ekran görüntüsü alın.

| No | Ekran | Nasıl |
| --- | --- | --- |
| 01 | Katalog | Katalog sekmesi, listede birkaç şarkı görünsün |
| 02 | Şarkı detayı ve oynatıcı | Bir şarkı → Çal'a basın, aktif nota vurgulanırken çekin |
| 03 | Prova, şarkı takibi | Şarkıda “Bu şarkıyı prova et” → takibi başlatın, 2–3 notayı doğru çalınca çekin (maskot mest) |
| 04 | Prova, serbest çalma | Serbest nota → bir nota çalarken çekin (parmak şeması ve nota adı görünsün) |
| 05 | Eğitim | Eğitim ana ekranı (maskot ve ilerleme) |
| 06 | Notaya çevir | Notaya çevir → MIDI / MusicXML veya Nota yapıştır sekmesi |
| 07 | Topluluk (isteğe bağlı) | Bir topluluk şarkısında puan ve bildir/engelle düğmeleri |

İngilizce için aynı ekranları dil English iken tekrar çekin.

Dosyaları bilgisayarda şu klasörlere koyun ve çalıştırın:

```
store/google-play/screenshots/raw/tr-TR/01-katalog.png …
store/google-play/screenshots/raw/en-US/01-catalog.png …
```

```powershell
npm run store:graphics
```

Başlıklar `store/google-play/screenshots/captions.json` içindedir. Ham görüntüler git dışında tutulur, yalnızca çerçevelenmiş olanlar commit edilir.

## 3. Mağaza ayarları

- **Uygulama mı oyun mu:** Uygulama.
- **Kategori:** Eğitim (öneri). Uygulamanın özü tin whistle öğretmek. Alternatif: Müzik ve Ses.
- **Ücretsiz veya ücretli:** Ücretsiz. Gelir modeli freemium: uygulama içinden premium abonelik veya ömür boyu satın alma, ücretsiz kullanıcıya isteğe bağlı ödüllü reklam ([monetization.md](monetization.md)). Bu seçim yalnızca indirme ücretini belirler. Ücretsiz bir uygulama sonradan ücretliye çevrilemez.
- **Etiketler:** müzik eğitimi, enstrüman, nota.

## 4. Uygulama içeriği (App content) yanıtları

### Gizlilik politikası
URL: yukarıdaki gizlilik adresi.

> **Freemium sürümüyle değişecekler.** Aşağıdaki yanıtlar, gelir özellikleri eklenmeden önceki sürüm içindir. Ödüllü reklam ve satın alma eklendiğinde reklam, IARC ve Data safety yanıtları güncellenir. Ayrıntılar [monetization.md](monetization.md) bölüm 6'da. Gelir özellikleri eklenmeden üretime çıkılmaması önerilir.

### Reklamlar
Uygulamada reklam var mı: Şu anki sürümde **Hayır**. Freemium sürümünde **Evet** (AdMob ödüllü reklam).

### Uygulama erişimi (App access)
**Bazı işlevler kısıtlı.** Topluluk'ta paylaşım, puanlama, bildirme, engelleme ve hesap silme giriş gerektirir. İnceleme için:
1. Üretimde inceleme için ayrı bir hesap açın, örneğin `play-review`. Şifreyi bir şifre yöneticisinde saklayın, repoya koymayın.
2. Hesapla giriş yapıp kuralları kabul edin ve bir deneme düzenlemesi paylaşın.
3. Play Console'da kullanıcı adı ve şifreyi girin. Talimat: “Katalog sekmesi → üstteki Hesap düğmesi → Giriş yap. Topluluk şarkısında puan ver, Bildir veya Üyeyi engelle; Katkılarım → Hesabı sil.”

Bu hesabı inceleme süresince silmeyin.

### İçerik derecelendirmesi (IARC anketi)
- Kategori: “Referans, haber veya eğitim”.
- Şiddet, cinsellik, uygunsuz dil, uyuşturucu ve kumar: **Hayır**.
- Kullanıcılar etkileşime giriyor veya içerik paylaşıyor mu: **Evet**. Kullanıcılar düzenleme paylaşıyor ve puan veriyor. Sohbet ve mesajlaşma yok.
- Kullanıcı konumu paylaşılıyor mu: **Hayır**.
- Dijital ürün satın alma: Şu anki sürümde **Hayır**. Freemium sürümünde **Evet**.

Beklenen sonuç: Herkes / PEGI 3 düzeyi, “Kullanıcılar etkileşimde” açıklamasıyla. Kesin derecelendirmeyi IARC verir.

### Hedef kitle
**Önerilen ilk sürüm: 13 yaş ve üzeri** (13–15, 16–17, 18+). 13 yaş altını seçmek Google Play Aile politikasını devreye sokar. Bu politika ek gereksinimler getirir: kullanıcı içeriği olan uygulamalarda ek denetim ve Aile programı uyumu. Gizlilik politikası ve kullanım şartları da topluluk hesabını 13 yaş altına kapatıyor. Uygulama yine de herkes tarafından indirilebilir.

### Haber uygulaması, devlet uygulaması, finansal ve sağlık özellikleri
Hepsi: **Hayır**.

### Data safety
- **Veri topluyor veya paylaşıyor musunuz:** Evet.
- **Aktarımda şifreleme:** Evet (yalnızca HTTPS).
- **Kullanıcılar silme isteyebiliyor mu:** Evet. Uygulama içinden ve hesap silme URL'sinden.

| Veri türü | Toplanıyor | Paylaşılıyor | Geçici işleme | Zorunlu mu | Amaç |
| --- | --- | --- | --- | --- | --- |
| Kişisel bilgiler → Kullanıcı kimlikleri (kullanıcı adı) | Evet | Hayır | Hayır | İsteğe bağlı | Uygulama işlevi, hesap yönetimi |
| Uygulama etkinliği → Diğer kullanıcı içeriği (paylaşılan düzenlemeler, bildirim notları) | Evet | Hayır | Hayır | İsteğe bağlı | Uygulama işlevi |
| Uygulama etkinliği → Diğer işlemler (puanlar, engellemeler, bildirimler) | Evet | Hayır | Hayır | İsteğe bağlı | Uygulama işlevi |
| Uygulama etkinliği → Uygulama içi arama geçmişi (şarkı araması) | Evet | Hayır* | Evet | İsteğe bağlı | Uygulama işlevi |
| Ses → Ses veya ses kayıtları (sunucuda notaya çevrilen ses bölümü) | Evet | Hayır | Evet | İsteğe bağlı | Uygulama işlevi |

\* Arama metni, kullanıcının isteğini yerine getirmek için nota kaynaklarına, DuckDuckGo'ya ve GetSongBPM'e gönderilir. Google, kullanıcının başlattığı bir işlemi yerine getirmek için yapılan aktarımı “paylaşım” saymaz. Hizmet sağlayıcılara (Cloudflare, GitHub) yapılan aktarımlar da paylaşım sayılmaz.

**Beyan edilmeyenler ve nedenleri:**
- Mikrofon sesi yalnızca cihazda işlenir, bu yüzden “toplanan” sayılmaz.
- Ders ilerlemesi ve dil tercihi cihazdan çıkmaz.
- E-posta, konum, kişiler, fotoğraf, cihaz kimliği ve reklam kimliği şu anki sürümde hiç kullanılmaz. Freemium sürümünde reklam kimliği ve AdMob verileri ile satın alma geçmişi eklenir ([monetization.md](monetization.md) bölüm 6).

Ses sunucusunun ses bölümünü kaydetmediğini doğrulayın. Kaydediyorsa “Geçici işleme” Hayır yapılmalı ve saklama süresi gizlilik politikasına eklenmelidir.

## 5. Yayın kanalları

1. **Dahili test (Internal testing):** En fazla 100 test kullanıcısı, inceleme beklemeden dakikalar içinde yayına girer. İlk imzalı AAB'yi buraya yükleyin ve kendi telefonunuzda Play'den kurarak deneyin.
2. **Kapalı test (Closed testing):** Geliştirici hesabınız 13 Kasım 2023'ten sonra açılmış kişisel bir hesapsa üretime geçmeden önce zorunludur. En az 12 test kullanıcısı 14 gün boyunca kesintisiz katılmalıdır. Test kullanıcıları için bir Google Grubu veya e-posta listesi hazırlayın.
3. **Üretim:** Kapalı test şartı tamamlanınca Dashboard'dan “Apply for production”. İnceleme genellikle 7 gün veya daha kısa sürer.

## 6. İmzalama

Play App Signing kullanılır. Google uygulama imzalama anahtarını kendisi tutar, siz yalnızca **yükleme anahtarı** ile imzalarsınız.

1. Yükleme anahtarını oluşturun (bir kez): `powershell -ExecutionPolicy Bypass -File scripts/create-upload-key.ps1`. Betik şifreyi sizden gizli olarak ister. Şifre keytool'a komut satırından değil ortam değişkeniyle geçer. Anahtar (`upload.jks`) ve Gradle ayar dosyası (`android-upload.properties`, yalnızca sizin okuyabileceğiniz izinlerle) `%USERPROFILE%\.tin-whistle\` altına yazılır. Bu dosyalar repoya girmez. Şifrede yalnızca İngilizce harf, rakam ve simge kullanın, çünkü Gradle dosyayı ISO-8859-1 olarak okur.
2. `upload.jks` dosyasını ve şifresini ayrıca güvenli bir yere yedekleyin (şifre yöneticisi, şifreli USB). Kaybolursa Play Console'dan yükleme anahtarı sıfırlanabilir, ama bu birkaç gün sürer.
3. İmzalı paket: `npm run android:aab` → `android/app/build/outputs/bundle/release/app-release.aab`.
4. İmzayı doğrulayın. `jarsigner -verify` “jar verified.” demeli, sertifika `CN=Tin Whistle Note Creator` olmalı. “signed in JarFile but is not signed in JarInputStream” uyarıları AAB için olağandır.
5. Play Console'a ilk yüklediğiniz AAB'nin imzası yükleme anahtarı olarak kaydedilir. Bu yüzden yalnızca kendi `upload.jks` anahtarınızla imzalanmış paketi yükleyin.
6. Her yeni yüklemede `mobile/app-version.json` içindeki `versionCode`'u 1 artırın.

İmzalama zinciri 23.11.2026'da geçici bir deneme anahtarıyla uçtan uca denendi: AAB 5,98 MB, `jar verified.`, SHA384withRSA 4096 bit. Deneme anahtarı repo dışındaydı, onunla imzalanan paket silindi.
