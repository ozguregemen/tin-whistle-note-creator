# Marka: tin whistle çalan eşek

`mascot.svg` tek kaynak çizimdir. Simge, Android uyarlanabilir simge katmanları, Android 13 temalı simgesi, açılış ekranları ve web favicon'u bu dosyadan üretilir:

```powershell
npm run brand:assets
```

Bu komut sırasıyla şunları yapar:
1. `scripts/build-brand.mjs --png` → `icon*.svg` ve `assets/*.png` (git dışı) dosyalarını ve `public/favicon.svg`'yi üretir.
2. `@capacitor/assets` ile `android/app/src/main/res` ve `ios/App/App/Assets.xcassets` altındaki tüm boyutları üretir.
3. Android uyarlanabilir simgesine temalı (tek renkli) katmanı ekler.

`@capacitor/assets` `AndroidManifest.xml` dosyasını yeniden biçimlendirir. Anlamı değişmez, ama gürültü olmaması için `git checkout -- android/app/src/main/AndroidManifest.xml` ile geri alın.

## Tasarım kararları (23.11.2026)

- **Karakter:** Avanak, öne fırlamış dişli, gri bir eşek. Düdüğü iki ön toynağıyla tutup çalıyor. Üç çeyrek açıyla çizildi. Gözler şehla ve düdüğe kilitli. Bir göz uykulu kapak altında, yanak üflemekten şişmiş, ter damlası var.
- **Tin whistle tanınırlığı:** Yeşil plastik başlık ve dikdörtgen ses penceresi, ince pirinç gövde, 3 + 3 düzeninde altı delik. Toynaklar düdüğü arkadan kavrar, delikleri kapatmaz.
- **Boyun ve gövde:** Tek siluet ve tek kontur. Ayrı parçaların birleşim yerinde dikiş izi oluşmaz.
- **Renk:** Zemin `#264b3e`, ışık halkası `#2c5345`, krem `#f3ead8`, pirinç `#d9b24c`, kontur `#2b2320`. Gri tüyün zemine kontrastı en az 3:1 (WCAG 1.4.11, grafik öğeler). Krem notalar 8,1:1, pirinç düdük 4,8:1. Eşeğin tonları birbirine yakın, tek vurgu rengi pirinç düdük.
- **Simge:** Maskotun yakın planı. Kafa, dişler ve düdüğün üst kısmı 48 px'te okunur. Android temalı simgesi dolu bir siluettir, gözler ve dişler oyuktur.

## Dayanılan araştırmalar

- Bebek şeması ve sevimlilik: Glocker ve ark. 2009, *Ethology* 115(3), doi:10.1111/j.1439-0310.2008.01603.x. Borgi ve ark. 2014, *Frontiers in Psychology* 5:411, doi:10.3389/fpsyg.2014.00411.
- Bakış yönü dikkati yönlendirir: Friesen ve Kingstone 1998, *Psychonomic Bulletin & Review* 5(3), doi:10.3758/BF03208827 (kısmen doğrulandı). Sajjacholapunt ve Ball 2014, *Frontiers in Psychology* 5:166. Palcu ve ark. 2017, *Frontiers in Psychology* 8:881. Kullanıcıya bakış ve güven: Musicus ve ark. 2015, *Environment and Behavior* 47(7) (yazarlardan birinin başka çalışmaları geri çekildiği için temkinli alınmalı).
- Marka karakterine güven: Garretson ve Niedrich 2004, *Journal of Advertising* 33(2). Antropomorfizm: Aggarwal ve McGill 2007, *Journal of Consumer Research* 34(4).
- Logo tasarımı: Henderson ve Cote 1998, *Journal of Marketing* 62(2), doi:10.1177/002224299806200202. Tanınma için doğal, uyumlu ve orta düzeyde ayrıntılı tasarım.
- Tekinsiz vadi ve stilizasyon: Mori 2012, *IEEE Robotics & Automation Magazine* 19(2). MacDorman ve ark. 2009, *Computers in Human Behavior* 25(3).
- Renk ve duygu: Valdez ve Mehrabian 1994, *Journal of Experimental Psychology: General* 123(4). Wilms ve Oberfeld 2018, *Psychological Research* 82(5). “Yeşil sakinleştirir” iddiası desteklenmiyor.
- Renk uyumu: Schloss ve Palmer 2011, *Attention, Perception, & Psychophysics* 73(2). Ou ve Luo 2006, *Color Research & Application* 31(3) (kısmen doğrulandı).
- Görsel konfor: Juricevic ve ark. 2010, *Perception* 39(7). Haigh ve ark. 2013, *Vision Research* 89. Aynı açıklıkta, doygun ve zıt renkler yan yana rahatsızlık verir. Renkleri açıklıkla ayırın.
- Renk körlüğü: Birch 2012, *JOSA A* 29(3), Avrupalı erkeklerin yaklaşık %8'i. Teberik ve Altıaylık Özer 2015, *Kocatepe Tıp Dergisi* 16(1), genç Türk erkeklerinin %7'si.
- Öğretici karakterler: Lester ve ark. 1997, CHI '97 (persona etkisi). Schroeder ve ark. 2013, *Journal of Educational Computing Research* 49(1) (meta-analiz, K-12'de daha büyük etki). Brom ve ark. 2018, *Educational Research Review* 25 (yüz ve hoş renkler, d ≈ 0,3–0,4). Baylor ve Kim 2005, *IJAIED* 15(1) (motive edici rol).

## Uygulama içi ifadeler

`scripts/mascot-moods.mjs` aynı çizimden beş ifade üretir: `public/mascot/{welcome,focus,correct,oops,celebrate}.svg`. Bileşen: `app/mascot.tsx`.

| İfade | Nerede |
| --- | --- |
| `welcome`: kullanıcıya bakar | Eğitim ana ekranı, boş Prova ekranı, dinleme başlamadan önce |
| `focus`: düdüğe bakar | Mikrofon dinlerken |
| `correct`: gözleri kapalı, mest | Doğru nota (1,2 saniye) |
| `oops`: faltaşı gözler, falso çizgisi | Yanlış nota (1,2 saniye) |
| `celebrate`: göz kırpar, yıldızlar | Ders veya şarkı bitince |

Maskot süs öğesidir (`alt=""`, `aria-hidden`). Her durum zaten metinle de verildiği için ekran okuyucuya bilgi tekrarlanmaz. İfade değişince kısa bir hareket oynar. `prefers-reduced-motion` açıkken bu hareket kapanır.
