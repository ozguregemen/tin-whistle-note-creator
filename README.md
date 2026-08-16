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
- Mobil uyumlu görünüm ve yazdırma/PDF çıktısı

> Nota kaynakları metin tabanlı perde sırasını veriyor; ritim ve nota süreleri bu MVP’de henüz yok. Her sonuçta kaynak ve doğrulama durumu gösterilir.

## Çalıştırma

Node.js 22.13 veya daha yeni bir sürümle:

```bash
npm ci
npm run dev
```

Üretim kontrolü:

```bash
npm run build
```

İzin verilen internet kaynaklarını yeniden okumak için:

```bash
npm run sync:sources
```

Kaynak listesi `catalog/sources.json`, web uygulamasının okuduğu üretilmiş katalog ise `catalog/catalog.json` dosyasındadır. Eşitleyici kaynakta beklenmeyen nota veya cümle sayısı görürse yanlış sonucu otomatik yayımlamak yerine hata verir.

GitHub Pages statik çıktısını yerelde kontrol etmek için:

```bash
npm run build:pages
npm run preview:pages
```

`npm run build:pages` komutu yayınlanacak statik dosyaları `docs` klasöründe günceller.

## Canlı kaynak API'si

GitHub Pages yalnızca arayüzü sunar. `worker/source-api.mjs` içindeki Cloudflare Worker canlı kaynak aramasını, özel GitHub kataloğuna erişimi ve Actions iş tetiklemesini yürütür. Desteklenen ilk adaptörler Notalar.net ve Gitaregitim.net'tir.

Canlı API: `https://tin-whistle-note-source-api.ozguregemenbusiness.workers.dev`

Worker'ı kontrol etmek ve yayımlamak için:

```bash
npm run worker:check
npx wrangler login
npx wrangler secret put GITHUB_TOKEN --config wrangler.source-api.jsonc
npm run worker:deploy
```

`GITHUB_TOKEN`, yalnızca bu depoya erişebilen ve repository dispatch oluşturup katalog sonuçlarını okuyabilen dar kapsamlı bir GitHub token'ı olmalıdır. Token hiçbir zaman GitHub Pages paketine eklenmez.

Wrangler'ın verdiği `workers.dev` adresi Pages derlemesine aktarılır:

```powershell
$env:VITE_SOURCE_API_URL="https://<worker-adresi>.workers.dev"
npm run build:pages
```

Worker arama sonucunu hemen döndürür. Kullanıcı bir kaynağı seçince `.github/workflows/process-source-request.yml` çalışır; sonuç `catalog/jobs/<request-id>.json` dosyasına ve başarı halinde ana kataloğa yazılır. Gitaregitim PDF/JPG sonuçları otomatik okunamazsa yanlış nota yayımlamak yerine `needs-review` durumuna geçer.

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

### 3. Müzikal dönüştürme

- Yarım delik ve temel cross-fingering seçenekleri
- Oktav uyarlamasına ek olarak ton bazlı transpoze önerisi
- Farklı tin whistle tonları (C, D, Eb vb.)
- Müzisyen onayı ve kullanıcı düzeltme akışı

### 4. Pratik modu

- BPM, ritim ve nota süreleri
- Hareketli çalma imleci ve metronom
- Yavaşlatma, döngü ve backing track senkronizasyonu

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
