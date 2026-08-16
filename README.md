# Nefes

Türkçe ezgileri D tin whistle parmak pozisyonlarına dönüştüren web tabanlı bir MVP.

## Bu sürümde çalışanlar

- Üç örnek ezgiden oluşan yerel katalogda arama
- Do/Re/Mi veya C/D/E biçiminde elle nota girişi
- `|` işaretiyle müzik cümlelerini ayırma
- D tin whistle'ın temel dizisi için altı delikli parmak şemaları
- Standart dizinin dışındaki sesler için uyarı
- Mobil uyumlu görünüm ve yazdırma/PDF çıktısı

> Katalogdaki diziler ürün akışını denemek için hazırlanmış demo düzenlemelerdir; yayınlanmadan önce bir müzisyen tarafından doğrulanmalıdır.

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

## Ürün planı

### 1. MVP — parmak diyagramı

- Şarkı arama ve elle nota girişi
- Nota ayrıştırma ve D tin whistle uygunluk kontrolü
- Parmak diyagramı, mobil görünüm ve PDF çıktısı

### 2. Güvenilir nota kaynakları

- Kaynak başına bağımsız bağlayıcı (`SourceAdapter`) geliştirme
- Öncelik: izinli API, MusicXML/ABC dosyası ve kullanıcı yüklemesi
- Site kazıma yalnızca ilgili sitenin kullanım şartları ve izni doğrulandıktan sonra
- Kaynak, düzenleyen kişi, lisans ve doğrulama durumunu her eserle birlikte saklama

### 3. Müzikal dönüştürme

- Otomatik oktav seçimi ve transpoze önerisi
- Alternatif/cross fingering seçenekleri
- Farklı tin whistle tonları (C, D, Eb vb.)
- Müzisyen onayı ve kullanıcı düzeltme akışı

### 4. Pratik modu

- BPM, ritim ve nota süreleri
- Hareketli çalma imleci ve metronom
- Yavaşlatma, döngü ve backing track senkronizasyonu

## Teknik yön

- Arayüz: React + TypeScript
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
