# Sepet & Fiyat Hafızası

Çevrimdışı (offline-first) çalışabilen, tüm verileri tarayıcının yerel **IndexedDB** veritabanında saklayan alışveriş listesi ve çoklu market birim fiyat takip uygulaması.

## Özellikler

- **Alışveriş Listeleri & Şablonlar:** Aktif listeler oluşturma, reyon sırasına göre (Ana Tür) otomatik gruplama, alınanları üstünü çizip alta katlama, şablon kaydetme ve alınmayan ürünleri yeni listeye devretme.
- **Canlı Bütçe Takibi:** Son bilinen fiyatlara göre tahmini toplam ile gerçekleşen sepet tutarını anlık karşılaştırma.
- **Bağımsız Fiyat Gözlemi (`+ Fiyat Gir`):** Alışveriş listesine eklemeden aynı gün farklı marketlerden fiyat kaydı girme ve *"Kaydet ve Aynı Markette Devam Et"* ile seri raf fiyatı kaydetme.
- **Birim Normalizasyonu:** Girilen gramaj/miktarı otomatik olarak `TL/kg`, `TL/L` veya `TL/adet` bazına çevirerek gizli gramaj zamlarını yakalama.
- **Market Karşılaştırma & Grafikler:** Her ürün için market bazlı en güncel fiyatları en ucuzdan pahalıya sıralama, kampanya filtreli çoklu market fiyat grafiği ve tüm fiyat geçmişi.
- **Çevrimdışı PWA & Veri Güvenliği:** `vite-plugin-pwa` önbellekleme, `Screen Wake Lock` (alışverişte ekranı açık tutma), kalıcı depolama isteği, JSON yedek alma/birleştirme (Zod doğrulamalı) ve Excel uyumlu (UTF-8 BOM) CSV dışa aktarma.

## Kurulum ve Çalıştırma

Node.js (v18+) kurulu bir ortamda proje klasörüne girip şu komutları çalıştırın:

```bash
npm install
npm run dev
```

Üretim (production) derlemesi için:

```bash
npm run build
npm run preview
```

> **Not:** Projeyi GitHub üzerinden **Vercel** veya **Netlify**'a bağladığınızda `npm run build` ve `dist` klasörü ile otomatik olarak HTTPS üzerinden yayına alınır ve Android/iOS cihazlarda "Ana Ekrana Ekle" diyerek uygulama gibi çevrimdışı kullanılabilir.
