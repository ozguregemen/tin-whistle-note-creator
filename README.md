# Tin Whistle Note Creator

Song notes to D tin whistle fingering diagrams — a web-based MVP with English and Turkish interfaces.

## Live app

[Open Tin Whistle Note Creator](https://ozguregemen.github.io/tin-whistle-note-creator/)

The site is published by GitHub Pages from the versioned `docs` directory on `main`.

## Bu sürümde çalışanlar

- İzin verilen kaynakları WordPress REST API üzerinden okuyan kaynak eşitleyici
- İlk gerçek ve kaynaklı kayıt: Duman — Bu Akşam
- The Session’ın CORS-açık API’sinde ziyaret anında canlı ABC nota araması
- Cloudflare Worker üzerinden Notalar.net ve Gitaregitim.net üzerinde canlı, paralel kaynak araması
- Onaylı kaynaklarda eşleşme yoksa nota odaklı web keşfi (MuseScore ve Kolay Nota); doğrulanmamış sonuçlar içe aktarılmadan önce açıkça işaretlenir
- Küratörlü akademik PDF kaynağında yalnızca belirlenmiş porte sayfalarını OMR ile okuma ve beklenen nota sayısıyla otomatik doğrulama
- Seçilen kaynağı güvenli `repository_dispatch` çağrısıyla GitHub Actions işleme kuyruğuna gönderme
- Metin notalarını otomatik çıkarma; PDF/JPG portelerini Audiveris OMR ile MusicXML'e dönüştürme
- Uzun süren kaynak işlerini sayfa yenilense bile takip edip tamamlanan sonucu otomatik açma
- Nota kaynağı ve bağımsız karşılaştırma bağlantılarını sonuçta gösterme
- Türkçe karakter normalizasyonu ve kontrollü fuzzy matching ile yazım hatasına dayanıklı arama
- Arka plan baskısından bağımsız `● / ○` parmak işaretleri ve sıkıştırılmış A4 PDF düzeni
- Haftalık GitHub Actions kaynak kontrolü; kaynak yapısı değişirse yayını durdurma
- GitHub’daki güncel katalog JSON’unu açılışta yükleme
- Varsayılan İngilizce arayüz ve tek tıkla Türkçe/İngilizce dil geçişi
- Do/Re/Mi veya C/D/E biçiminde elle nota girişi
- `|` işaretiyle müzik cümlelerini ayırma
- Clarke D chromatic fingering referansına göre tam, yarım ve açık delikli parmak şemaları
- Melodiyi aralıklarını değiştirmeden çalınabilir D whistle oktavına otomatik taşıma
- Desteklenen kromatik aralığın dışındaki sesler için uyarı
- Play/Pause/Stop, aktif nota takibi ve ayarlanabilir BPM içeren Pratik Modu v1
- ABC ve MusicXML kaynaklarından nota süresi, tempo ve es bilgisi okuma
- Ritim bilgisi bulunmayan eski kayıtlar için açıkça işaretlenmiş eşit vuruş tahmini
- Mobil uyumlu görünüm ve yazdırma/PDF çıktısı

> ABC ve MusicXML kaynaklarında ritim bilgisi varsa korunur. Yalnız perde sırası sunan metin kaynakları eşit vuruş tahminiyle çalınır; arayüz hangi yöntemin kullanıldığını açıkça gösterir.

## Çalıştırma

Node.js 22.13 veya daha yeni bir sürümle:

```bash
npm ci
npm run dev
```

Üretim kontrolü:

```bash
npm run build
npm run audit:catalog
```

İzin verilen internet kaynaklarını yeniden okumak için:

```bash
npm run sync:sources
```

Kaynak listesi `catalog/sources.json`, web uygulamasının okuduğu üretilmiş katalog ise `catalog/catalog.json` dosyasındadır. Eşitleyici kaynakta beklenmeyen nota veya cümle sayısı görürse yanlış sonucu otomatik yayımlamak yerine hata verir ve daha önce canlı kaynaklardan eklenen katalog kayıtlarını korur.

`npm run audit:catalog`; nota, süre ve es dizilerinin boyutlarını doğrular. Ayrıca karşılaştırılmamış OMR, eşit vuruş fallback'i ve bilinmeyen tempo gibi müzikal kalite boşluklarını ayrı uyarılar olarak raporlar. GitHub Actions hem haftalık kaynak yenilemesinde hem de yeni canlı kaynak işlendiğinde bu denetimi çalıştırır.

GitHub Pages statik çıktısını yerelde kontrol etmek için:

```bash
npm run build:pages
npm run preview:pages
```

`npm run build:pages` komutu yayınlanacak statik dosyaları `docs` klasöründe günceller.

## Canlı kaynak API'si

GitHub Pages yalnızca arayüzü sunar. `worker/source-api.mjs` içindeki Cloudflare Worker canlı kaynak aramasını, özel GitHub kataloğuna erişimi ve Actions iş tetiklemesini yürütür. Desteklenen adaptörler Notalar.net, Gitaregitim.net ve küratörlü akademik nota PDF'leridir.

Canlı API: `https://tin-whistle-note-source-api.ozguregemenbusiness.workers.dev`

Onaylı adaptörlerde eşleşme bulunamazsa Worker, yalnızca nota odaklı izinli alan adlarında (MuseScore ve Kolay Nota) arama motoru keşfi yapar. Bu sonuçlar güvenilirlik kontrolü için bağlantı olarak gösterilir; otomatik nota içe aktarma yalnızca onaylı WordPress veya küratörlü belge adaptörlerinde kullanılabilir. Belge adaptörleri tam internet taraması yapmaz: kaynak URL'si, nota sayfaları ve beklenen nota aralığı kodda izinli listeyle sınırlandırılır.

Worker'ı kontrol etmek ve yayımlamak için:

```bash
npm run worker:check
npx wrangler login
npx wrangler secret put GITHUB_TOKEN --config wrangler.source-api.jsonc
npx wrangler secret put GETSONGBPM_API_KEY --config wrangler.source-api.jsonc
npx wrangler d1 migrations apply tin-whistle-note-tempos --remote --config wrangler.source-api.jsonc
npm run worker:deploy
```

`GITHUB_TOKEN`, yalnızca bu depoya erişebilen ve repository dispatch oluşturup katalog sonuçlarını okuyabilen dar kapsamlı bir GitHub token'ı olmalıdır. Token hiçbir zaman GitHub Pages paketine eklenmez.

### BPM çözümleme ve önbellek

Worker tempo için şu sırayı kullanır: nota dosyasındaki açık tempo, `BPM_DB` D1 önbelleği, katı sanatçı/şarkı eşleşmesiyle GetSongBPM API ve son olarak açıkça “pratik varsayılanı” diye işaretlenen 90 BPM. Varsayılan değer veritabanına kaydedilmez. Böylece geçici bir kaynak hatası yanlış bir BPM'i kalıcılaştırmaz.

GetSongBPM anahtarı ücretsiz olarak [GetSongBPM API sayfasından](https://getsongbpm.com/api) alınır ve yalnızca Worker secret'ı olarak saklanır. Sağlayıcının zorunlu kaynak bağlantısı uygulamanın pratik panelinde gösterilir. D1 şeması `migrations/0001_create_song_tempos.sql` dosyasındadır; aranan ve güçlü eşleşme alan sonuçlar `song_tempos` tablosuna yazılır. Spotify Audio Features uç noktası artık deprecated olduğu ve yeni geliştirme modu kısıtlarına tabi olduğu için ana BPM bağımlılığı olarak kullanılmaz.

### Ritim aktarımı

MusicXML/ABC kaynaklarında ölçü, nota süresi ve esler doğrudan korunur. Düz metin kaynaklarında ise yalnızca kaynağın açıkça verdiği alt çizgi (`_`) süre işaretleri ile `es`/`sus` esleri aktarılır; bu işaretler yoksa nota dizisi bilinçli olarak eşit vuruş fallback'i ile çalınır. Metin notasyonunda alt çizgi ve vuruş açıklaması kullanımı için [örnek kaynak açıklamasına](https://www.gitaregitim.net/nota-isimleriyle-sarkilar/) bakılabilir.

Wrangler'ın verdiği `workers.dev` adresi Pages derlemesine aktarılır:

```powershell
$env:VITE_SOURCE_API_URL="https://<worker-adresi>.workers.dev"
npm run build:pages
```

Worker arama sonucunu hemen döndürür. Kullanıcı bir kaynağı seçince `.github/workflows/process-source-request.yml` çalışır; sonuç `catalog/jobs/<request-id>.json` dosyasına ve başarı halinde ana kataloğa yazılır. Gitaregitim PDF/JPG sonuçları veya küratörlü PDF sayfaları güvenilir biçimde okunamazsa yanlış nota yayımlamak yerine `needs-review` durumuna geçer.

Arayüz kaynak güvenini tek bir “doğrulandı” işareti olarak sunmaz. Ezgi, ritim ve tempo ayrı ayrı etiketlenir; makineyle okunmuş fakat başka bir kaynakla karşılaştırılmamış OMR kayıtları sarı uyarı kartıyla çalışma taslağı olarak gösterilir.

## Ürün planı

### 1. MVP — parmak diyagramı

- Şarkı arama ve elle nota girişi
- Nota ayrıştırma ve D tin whistle uygunluk kontrolü
- Parmak diyagramı, mobil görünüm ve PDF çıktısı

### 2. Güvenilir nota kaynakları

- Kaynak başına bağımsız bağlayıcı (`SourceAdapter`) geliştirme
- Öncelik: izinli API, MusicXML/ABC dosyası ve kullanıcı yüklemesi
- İlk bağlayıcı: Notalar.net’in herkese açık WordPress REST uç noktası
- İkinci bağlayıcı: The Session’ın salt okunur JSON/ABC API’si
- Yeni kaynak adaptörlerini ikişerli dilimler halinde ekleme ve her birini gerçek şarkı kabul testleriyle doğrulama
- Kaynak, düzenleyen kişi, lisans ve doğrulama durumunu her eserle birlikte saklama
- Tamamlandı: ezgi, ritim ve tempo güvenini ayrı gösteren katalog kalite denetimi

### 3. Müzikal dönüştürme

- Yarım delik ve temel cross-fingering seçenekleri
- Oktav uyarlamasına ek olarak ton bazlı transpoze önerisi
- Farklı tin whistle tonları (C, D, Eb vb.)
- Kaynak metnindeki alt çizgi ve `es` işaretlerinden nota süreleri/es aktarımı ([notasyon açıklaması](https://www.gitaregitim.net/nota-isimleriyle-sarkilar/))
- Uzman doğrulaması ve kaynaklar arası karşılaştırma

### 4. Pratik modu

- Tamamlandı: temel sesli oynatma, BPM ayarı ve hareketli nota vurgusu
- Tamamlandı: ABC/MusicXML nota süreleri ve MusicXML es/tempo aktarımı
- Tamamlandı: alt çizgili do-re-mi metinlerindeki süre ve es işaretlerinin pratik moduna aktarımı
- Tamamlandı: oynatmayı sıfırlamadan dinamik BPM değişimi ve kaldığı yerden hassas devam
- Tamamlandı: CC BY-SA lisanslı gerçek tin whistle örnekleriyle sample tabanlı ses motoru
- Tamamlandı: oynatmayla senkron metronom ve seçili cümleyi kesintisiz döngüye alma
- Tamamlandı: kaynak tempo / D1 önbelleği / BPM sağlayıcısı / açık 90 BPM varsayılanı ayrımı
- Tamamlandı: aktif notayı ekranda tutan takip modu, sabit pratik kontrolleri ve cümle içi ilerleme
- Öncelik: kaynak ölçülerini koruyan daha kapsamlı ritim/ölçü aktarımı ve doğrulama
- Daha sonra: mikrofonla perde takibi, daha geniş çoklu örnek seti, artikülasyonlar ve backing track senkronizasyonu

## Teknik yön

- Arayüz: React + TypeScript
- Dil yapısı: genişletilebilir sözlük tabanlı İngilizce/Türkçe arayüz
- Dağıtım: Cloudflare uyumlu vinext/Sites; statik sürüm GitHub Pages'e de uyarlanabilir
- Gelecek veri katmanı: sunucu tarafı kaynak bağlayıcıları, eser kataloğu ve doğrulama durumu
- Nota değişim biçimleri: MusicXML ve ABC; basit metin biçimi hızlı giriş için korunur

## Nota biçimi

Desteklenen temel D dizisi: `D E F# G A B C#`.

```text
D4 E4 F#4 G4 | A4 B4 C#5 D5
Re4 Mi4 Fa#4 Sol4 | La4 Si4 Do#5 Re5
```

Oktav yazılmazsa D–B için 4, C/Do için 5 varsayılır.
