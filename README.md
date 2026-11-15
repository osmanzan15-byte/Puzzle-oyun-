# Blok Bulmaca

Seviyeli blok bulmaca oyunu (tarayıcıda çalışır, derleme gerekmez).

- `index.html` dosyasını açın.
- Alttaki parçaları 8x8 tahtaya sürükleyin.
- Dolu satır/sütunlar temizlenir; art arda temizleme daha çok puan verir.
- Her seviyede hedef puana ulaşın. Seviye arttıkça hedef ve gri engeller artar.
- Hiçbir parça sığmazsa oyun biter; ilerlemeniz kaydedilir.

## Çelik Cephe (RTS)

`celik-cephe/index.html` dosyasını açın (3D çizim için Three.js CDN'den yüklenir, internet gerekir). Orijinal, tarayıcıda çalışan 3 boyutlu gerçek zamanlı strateji oyunu:

- Ana üs, santral, rafineri, kışla, fabrika ve taret kur; güç yetmezse üretim yavaşlar.
- Toplayıcılar maden toplayıp rafineriye taşır (kredi).
- Gerçekçi 3D sahne: güneş ışığı ve gerçek zamanlı gölgeler, gökyüzü, dokulu arazi, çam ağaçları, kıyılar, ayrıntılı bina ve birim modelleri.
- Savaş efektleri: namlu alevi ve geri tepme, iz bırakan mermiler, duman, ateş, yanık izleri, yıkıntılar, toz izleri; piyade yürüme animasyonu.
- Q/E ile döndür, fare tekerleği ile yakınlaştır.
- Hava Pisti (radar gerekir): Helikopter (hem havaya hem yere vurur) ve Bombardıman (bomba atar, pistte yeniden dolar). Tank havaya vuramaz; piyade, roketatar, taret ve helikopter vurabilir.
- Piyade, roketatar, tank üret; A* yol bulma, otomatik hedef alma.
- Yapay zekâ rakip ekonomi kurar ve büyüyen saldırı dalgaları gönderir.
- Savaş sisi: harita birimlerinle keşfedildikçe açılır, düşman görüş alanın dışında gizlenir.
- Radar binası hava saldırısı özel gücünü açar (90 sn bekleme); yapay zekâ da kullanır.
- Mini harita, kutu seçim, kontrol grupları (Ctrl+1-9), saldırarak ilerle (A), sat (X).
- Giriş ekranı: zorluk seçimi (Kolay / Normal / Zor), nasıl oynanır, zafer sayacı (tarayıcıda saklanır).
- Kazanmak için rakibin tüm yapılarını yok et.
