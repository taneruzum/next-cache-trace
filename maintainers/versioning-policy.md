# Branch, sürüm ve yayın politikası

Karar tarihi: 23 Eylül 2026. Bu, next-cache-trace için seçtiğimiz iş akışıdır. npm yayını, GitHub'a push etmekten ayrı bir işlemdir.

## Branch ve Git etiketi

- `main`, birleştirilmiş ve CI'dan geçmiş çalışmaların ana dalıdır; her zaman npm'deki son sürümle aynı olmak zorunda değildir.
- Yeni işe başlamadan önce güncel `main` üzerinden kısa ömürlü bir branch açılır. Codex işleri `codex/` öneki kullanır: `codex/fix-peer-install`, `codex/feat-cache-profile`, `codex/docs-versioning`.
- Akış: branch → değişiklik ve uygun testler → pull request → CI ve inceleme → main'e merge. Tek bakımcı kendi PR'ını inceleyebilir; ikinci kişi zorunlu değildir. Birleştirme sonrası branch silinebilir.
- Her npm sürümü için kalıcı branch açılmaz. Yayımlanan kaynak commit'i `v0.2.0`, `v0.2.1` gibi değiştirilmeyen Git etiketleriyle işaretlenir. GitHub Release aynı etikete bağlı sürüm notudur.
- `develop` dalı şimdilik kullanılmaz. Bir sürüm beklerken main üzerinde sonraki sürümün geliştirmesi gerekiyorsa geçici bir `codex/release-0.2.0` dalı ayrılabilir. Ayrılmıyorsa yayın hedefi tam commit SHA ile sabitlenir; o commit'i etkileyen her düzeltme yeniden doğrulanır.
- Yayımlanan sürüme acil düzeltme gerekirken main daha yeni, ilgisiz özellikler içeriyorsa hotfix branch'i son yayın etiketinden açılır. Düzeltme ayrıca main'e alınır.

## Sürüm numarası

SemVer biçimi `MAJOR.MINOR.PATCH`. SemVer, 0.x döneminde kararlılık garantisi vermez; biz aşağıdaki daha sıkı proje politikasını seçiyoruz:

| Değişiklik | 0.x dönemindeki karar |
| --- | --- |
| Geriye uyumlu hata veya paketleme düzeltmesi | `0.2.0 → 0.2.1` |
| Yeni özellik veya yeni kural | `0.2.x → 0.3.0` |
| Uyumsuz CLI/API/tip/rapor/kurulum değişikliği | Yeni minor ve açık geçiş notu; örneğin `0.3.0` |
| Yalnız repo belgeleri, CI veya bakım notları | npm yayını zorunlu değil |
| Kararlı dış sözleşme ve yeterli kullanım doğrulaması | `1.0.0` |

1.0.0 sonrasında uyumlu düzeltme patch, uyumlu özellik minor, uyumsuz sözleşme değişikliği major olur. İndirme sayısı tek başına 1.0 gerekçesi değildir.

Uyumluluk; fonksiyon imzalarının yanında CLI bayrakları/çıkış kodları, rapor şeması, public tipler, ESLint preset'leri, Node desteği ve bağımlılık kurulum koşullarını da kapsar. Yeni varsayılan tanılar CI'ı etkileyebilir; minor notlarında açıkça belirtilir. Mevcut bir kuralın hatalı davranışını düzelten uyumlu bug fix patch olabilir; etkisi yine belgelenir.

Peer dependency'yi optional olmaktan çıkarmak otomatik olarak patch sayılmaz: otomatik kurulum ve sürüm çakışması davranışını değiştirebilir. Önceden not edilen `0.2.1` düzeltmesi, tek başına alias kurulumu ve mevcut tüketici yükseltmeleri doğrulanırsa patch olarak değerlendirilir; uyumsuz gereksinim getiriyorsa sonraki minor'a alınır.

## İki paketin eşleşmesi

- Şimdilik ana paket ve ESLint alias ortak sürüm takvimi kullanır. Yayınlanan çiftin sürümleri aynıdır; bu npm zorunluluğu değil, bakım kolaylığı seçimimizdir.
- İki manifest, kök lockfile, alias peer aralığı, üretilen metadata ve changelog birlikte kontrol edilir. Peer aralığı gereksiz yere daraltılmaz; yalnız gerçekten desteklenen sürümler kapsanır.
- Sürüm her commit'te artırılmaz; hedef sürüm yayın hazırlığında belirlenir. Yayımlanmamış adaya yapılan düzeltmeler aynı hedefte kalabilir. Yayımlanmış içerik değiştirilmez; yeni numara gerekir.
- npm sürümü ile JSON `schemaVersion` ayrı sözleşmelerdir. Her paket patch'inde şema numarası otomatik değiştirilmez.

## Yayın sırası

1. Yayın hazırlığını PR'da tamamla: sürüm, lockfile, changelog, README ve uyumluluk notları. Yayın engeli varsa changelog `Unreleased` kalır; gerçek yayın tarihi yayımlanırken yazılır.
2. Birleştirilmiş yayın commit'inin CI'ını kontrol et; `npm run verify` ve değişikliğe uygun manuel testler geçsin. Kaynak commit SHA'yı kaydet. Yeni commit, eski CI sonucunu devralmış sayılmaz.
3. Aynı temiz kaynak durumundan iki tarball üret; içeriklerini ve temiz tüketici kurulumunu doğrula, hash'lerini kaydet. Belgeler dahil paket içeriği değişirse yeniden paketle.
4. Yetkili yayın adımında ana paketi, ardından alias'ı incelenmiş tarball'lardan yayımla. Beta gerekiyorsa örneğin `0.3.0-beta.0` sürümü ve açık `--tag beta` kullan; beta'yı `latest` yapma. Kararlı yayın `latest` olur.
5. Registry'den iki sürümü/hash'i ve temiz CLI/API/ESLint kurulumunu doğrula. Sonra aynı kaynak SHA'ya `vX.Y.Z` Git etiketi ve GitHub Release oluştur. Etiketi sonraki main commit'ine yanlışlıkla bağlama.
6. Ana paket başarılı, alias başarısızsa durumu kısmi yayın olarak kaydet. Registry'yi kontrol edip yalnız eksik paketi yeniden dene; yayımlanan sürümü değiştirme veya yeniden yüklemeye çalışma. İkisi tamamlanmadan yayını tamamlandı sayma.

Branch ve npm dist-tag farklıdır: `beta`/`latest` npm'deki sürüm işaretçileridir, Git branch'i veya `v0.2.0` Git etiketi değildir.

## Şimdiki durum

0.2.0 kaynakları main'de `84eb5c1961511404f273e90951047f14942080aa` commit'ine gönderildi; [14 CI işi başarılı](https://github.com/taneruzum/next-cache-trace/actions/runs/35783666551). npm erişimi nedeniyle yayın bekliyor. Sırf bu bekleme nedeniyle 0.2.1'e geçilmez; yayın öncesi gerekli düzeltmeler hâlâ 0.2.0'a girebilir. Kullanıcının ertelediği peer değişikliği ayrıca değerlendirilir. Bu belge GitHub branch protection veya otomatik yayın ayarı oluşturmaz.

Kaynaklar: [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow), [SemVer 2.0.0](https://semver.org/), [npm dist-tags](https://docs.npmjs.com/adding-dist-tags-to-packages/).
