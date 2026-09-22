# next-cache-trace — 0.1.0 sonrası yol haritası

20 Eylül 2026 — karşılaştırma sonrası revizyon. Durum: 0.2.0 adayı yerel olarak uygulanıp doğrulandı; hosted CI, npm yayını ve bağımsız pilot beklemede. İlk yol haritası ile kullanıcının ilettiği Claude planı karşılaştırıldı; teknik iddialar kaynak kodu ve güncel resmî belgelerden kontrol edildi. Süreler tek geliştirici için odaklı iş günü tahminidir; yayın taahhüdü değildir.

Önerilen ürün odağı: **Next.js geliştiricisinin cache tag ilişkilerini gerçek proje yapısında takip etmesini, bulguların nedenini anlamasını ve yeni hataları CI'da yakalamasını sağlamak.**

### Uygulama durumu

0.2.0 adayının yerel mühendislik kapsamı tamamlandı: doğrudan sabit/import çözümleme, kanıt zincirleri, fresh snapshot, baseline kimlikleri ve tekrar sayıları, Markdown/HTML/SARIF görünümü, kapsam kapıları, lint, tarball smoke testi ve coverage komutu hazır. 88 test geçiyor; local verification hosted CI, npm yayını veya kullanıcı pilotu yerine geçmiyor. Claude ekranındaki kısa ömürlü `use cache`, `connection()`/`io()`, `Suspense` ve `unstable_cache` düzenleme adayları bu sürüme eklenmedi; Next.js build karşı örnekleri ve en az iki pilot sinyali sonrasında ayrı karar olarak ele alınacak.

### 0.2.0 sonrası patch notu

`eslint-plugin-next-cache-trace` çalışma zamanında `next-cache-trace/eslint` export'una ihtiyaç duyuyor. 0.2.0 manuel testinden sonra plugin manifestindeki ana paket peer dependency'si `optional` olmaktan çıkarılacak ve ana paket sürümüyle eşleşen zorunlu peer aralığı olarak yayımlanacak. Kod davranışı değişmediği için bu düzeltme `0.2.1` patch sürümüne adaydır. 0.2.0 manuel testinde hem ana CLI/API hem de ESLint plugin kurulumu ayrıca kontrol edilmelidir.

## 1. Başlangıç noktamız

Ekran görüntüsünde haftalık indirme sayısı 151. Bu, tekil veya aktif kullanıcı sayısını göstermiyor. İlk başarı ölçütümüz, bağımsız geliştiricilerin araç sayesinde bir sorunu çözmesi ve aracı kullanmaya devam etmesi olacak.

Mevcut 0.1.0; CLI, TypeScript API, ESLint 9/10 entegrasyonu, metin/JSON/SARIF/HTML çıktıları, yapılandırma, susturma yorumları ve NCT001–NCT009 kurallarını içeriyor. NCT009 isteğe bağlı. Bu özellikleri yeniden geliştirme kalemi saymıyoruz.

Kod incelemesinde görülen öncelikli boşluklar:

- `src/ast.ts` tek dosyalı, `noResolve` kullanan analiz yapıyor. Tag değeri olarak doğrudan metinler destekleniyor; ortak sabitler, yeniden dışa aktarımlar ve yardımcı fonksiyonlar izlenmiyor.
- `src/model.ts` ilişki grafiğinde üretici ve invalidation konumları var; import/çağrı kanıt zinciri ve sayfa tüketicileri yok.
- `src/eslint.ts` proje modunda her incelenen dosya için proje taramasına gidiyor. AST önbelleği var; büyük proje performansı ayrıca ölçülmeli.
- Mevcut bulguları başlangıç kaydı olarak kabul edip yalnız yeni bulgularda CI'ı durduran baseline özelliği yok.
- Next.js sürümüne göre kural seçimi yok. Mevcut hedef Next.js 16 App Router.
- README önce kaynak koddan çalıştırmayı gösteriyor; pilot rehberinde yayın öncesi anlatım kalmış. npm kullanıcısına yönelik başlangıç öne alınmalı.
- Yerel ESLint workspace bağlantısının taşınmadan önceki konuma işaret ettiği ve hedef manifestin okunamadığı doğrulandı. Bu, yerel geliştirme ortamı sorunu; yayımlanan paketin bozuk olduğunu göstermiyor.
- SARIF ve ESLint metadata sürümleri ayrı ayrı sabit yazılmış. `Severity`, `RuleCode`, `Location`, `CacheConfig` ana girişten adlarıyla export edilmiyor; bunların eklenmesi API ergonomisini geliştirir, mevcut `TraceOptions` tipinin kullanılamadığı anlamına gelmez.
- `files` listesi tüm `docs` dizinini paketliyor; bakım kayıtları ile kullanıcı belgeleri ayrılmalı. Kök kaynak için lint config ve test coverage ölçümü görünmüyor.

Dayanak: [README](README.md), [mimari](docs/architecture.md), [pilot rehberi](docs/pilot-guide.md), [kural modeli](src/model.ts), [analiz motoru](src/ast.ts).

## 2. Güncel ihtiyaçlar ve bunlardan çıkardığımız öncelikler

| Gözlenen ihtiyaç / kanıt | Ürün kararı |
| --- | --- |
| Mart 2026 tarihli bir geliştirici bildirimi, tag invalidation sonrasında Link geçişi ile sayfa yenilemede farklı sonuçların anlaşılmasını konu alıyor. Bu bir ihtiyaç sinyali; tek başına yaygınlık veya kök neden kanıtı değil. [Next.js tartışması #91785](https://github.com/vercel/next.js/discussions/91785) | Raporda gözlenen tag ilişkisini, invalidation politikasını ve statik analizin cevaplayamadığı çalışma zamanı sorularını açıkla. |
| Mayıs 2026 tarihli bir tartışmada `revalidateTag` profili ile `cacheLife` ilişkisinin anlaşılmadığı görülüyor. Teknik davranışı tartışma yanıtlarından değil, resmî referanstan doğruluyoruz. [Tartışma #94014](https://github.com/vercel/next.js/discussions/94014) | Bulguların yanına kısa, sürüme uygun davranış açıklaması ekle. |
| Güncel referansta `revalidateTag(tag, 'max')` eski veriyi sunarken yenilemeye izin veriyor; profilin `expire` değeri kullanılıyor. Tek parametreli kullanım deprecated. [revalidateTag](https://nextjs.org/docs/app/api-reference/functions/revalidateTag) | Mevcut NCT006/NCT009 üzerine açıklama ekle; otomatik olarak her çağrıya `'max'` ekleme. |
| `updateTag` yalnız Server Action bağlamında kullanılabiliyor ve sonraki okumanın taze veriyi beklemesini sağlıyor. [updateTag](https://nextjs.org/docs/app/api-reference/functions/updateTag) | Kesin bilinen yanlış bağlamlar için kural ekle; yardımcı fonksiyonda `'use server'` bulunmamasını tek başına hata sayma. |
| `cacheLife` için birlikte belirtilen `expire`, `revalidate` değerinden büyük olmalı. Varsayılan profil kullanımı geçerli. [cacheLife](https://nextjs.org/docs/app/api-reference/functions/cacheLife) | Statik olarak çözülen profil hatalarını kontrol et; varsayılan ömrü hata seviyesine yükseltme. |
| Resmî Next.js DevTools MCP zaten çalışma zamanı hataları, loglar, sayfa bilgisi ve geçiş yardımı sunuyor. [Next.js MCP](https://nextjs.org/docs/app/guides/mcp) | Ayrışmayı proje genelindeki tag ilişkileri ve CI denetiminde kur. Yapılandırılmış JSON çıktısını ajanların da okuyabileceği şekilde geliştir. |

Ortak tag sabitleri, monorepo ve baseline talepleri henüz bağımsız kullanıcı görüşmeleriyle doğrulanmadı. Bunlar kodda görülen sınırlardan çıkardığımız ürün hipotezleri. Pilotlarda önceliklerini sınayacağız.

### İki planın karşılaştırılması ve kararlar

İlk planın güçlü tarafı analiz doğruluğu, kanıt zinciri, pilot ölçütleri ve sınırlı kapsam. Claude planının güçlü tarafı somut bakım eksikleri, baseline, Markdown çıktısı ve yayın altyapısı. Birleştirmede **baseline'ı 0.2.0'a öne alıyoruz; doğrudan import edilen sabitleri de bu sürümde tutuyoruz.** Genel barrel/wrapper çözümlemesi ve deneysel kurallar ayrı aşamalara bölünüyor.

| Öneri | Karar ve gerekçe |
| --- | --- |
| Sürüm bilgisini tek kaynağa bağlama, tip export'ları, paket içeriği, lint | Kabul. Kaynakta karşılıkları doğrulandı. Geliştirme hazırlığına ve 0.2.0'a alındı. |
| Baseline + Markdown raporu | Kabul, 0.2.0. Kullanıcının mevcut projeyi CI'a kademeli alabilmesini sağlar. |
| Mevcut SARIF hash'ini baseline kimliği olarak aynen kullanma | Düzeltildi. `code + file + message`, aynı dosyadaki özdeş bulguları birleştirebilir; mesaj düzenlemesi de kimliği değiştirir. Yapısal konum ve tekrar sayısını gözeten, sürümlü kimlik gerekir. |
| `post:${id}` ile `post:${postId}` aynı öneke sahip olduğu için eşleşmiş sayılsın | Reddedildi. İki ifade farklı somut tag'ler üretebilir. Desen yalnız olası ilişki olarak gösterilebilir; kesin ilişki veya NCT001'i kapatma gerekçesi olamaz. |
| `page`/`layout` üzerinde `use cache` için varsayılan uyarı | Reddedildi. Resmî belge bu kullanımı açıkça destekliyor; cached layout'un `children` içeriği de otomatik olarak cache'lenmiş sayılmaz. [use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache#caching-a-route-segments-output-with-use-cache) |
| Cache Components açıkken her `revalidatePath` çağrısına öneri | Varsayılan kural yapılmayacak. Path ve tag invalidation farklı amaçlara hizmet eder; otomatik karşılık yoktur. Açıklama görünümünde fark anlatılabilir. [revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath#relationship-with-revalidatetag-and-updatetag) |
| Bilinmeyen `cacheLife` profili | Kabul. Yalnız profil kümesi tamamen çözülebiliyorsa ve sürüm biliniyorsa teşhis üretir. |
| Cache içindeki zaman/rastgelelik çağrıları | Talebe bağlı, kapalı başlayan inceleme önerisi. Cache'lenmiş zaman damgası kasıtlı olabilir; yan etkili çağrının sonucunun cache çıktısına katkısı da her zaman bilinmez. |
| Dosyada `Suspense` varsa güvenli, yoksa hatalı sayma | Reddedildi; yerine araştırma adımı. JSX'in varlığı sınırın ilgili okumanın üstünde olduğunu kanıtlamaz. `loading`, üst segmentler ve `generateStaticParams` da değerlendirilmelidir. [Blocking route açıklaması](https://nextjs.org/docs/messages/blocking-route) |
| `unstable_cache` geçiş raporu | Kabul, 0.3.0 sonrası isteğe bağlı genişleme. Yakın hazır profile yuvarlama veya bütün `keyParts` değerlerini argümana taşıma gibi eşdeğerliği kanıtlanmamış öneriler çıkarıldı. |
| `--since` ile yalnız değişen dosyaların bulgularını gösterme | CI doğruluk ölçütü olarak reddedildi. Silinen üretici, değişmeyen tüketicide yeni bulgu doğurabilir. Tam raporlar karşılaştırılmalı. |
| Trusted Publishing ve hazır GitHub Action | Kabul, bağımsız teslimatlar. Araç sürümünü sabitleme, hata kodunu koruma ve gerçek yayın doğrulaması şartları eklendi. |
| `1.0.0` sonrasındaki her değişiklik `2.0.0` gerektirir | Düzeltildi. Yalnız geriye uyumsuz sözleşme değişiklikleri major gerektirir; uyumlu özellikler minor olabilir. [SemVer](https://semver.org/) |

Claude planındaki “en çok şikâyet edilen”, “1 numaralı neden” ve rakiplerin kapsamına ilişkin sıralamalar doğrulanmış bir örnekleme dayanmıyor; ürün kararı için kanıt kabul edilmedi. Next.js derleyicisinin zaten yakaladığı hatalar için ek değerimiz daha erken, daha açıklayıcı veya dosyalar arası teşhis olmalı.

## 3. Sürüm sırası

| Sürüm | Kullanıcının elde edeceği sonuç | Tahmin | Öncelik |
| --- | --- | --- | --- |
| **0.1.1, gerekirse** | Kurulum ve yayın belgeleri düzeltilir; uyumlu bakım düzeltmeleri hızlı çıkar. | 1–2 gün | 0.2.0 yakınsa ayrıca yayınlanması şart değil |
| **0.2.0** | Sabit ve doğrudan import edilen tag'ler anlaşılır; kanıt, baseline ve Markdown raporuyla CI'a geçiş kolaylaşır. | 12–18 gün | Sonraki esas sürüm |
| **0.3.0** | Sürüm/bağlam/profil kontrolleri, sınırlı yeniden export çözümleme ve açıklama görünümü derinleşir. | 8–12 gün | 0.2.0 geri bildirimiyle kesinleştirilir |
| **0.4.0** | Sınırlı yardımcı fonksiyon/route izleme, hızlı tekrar analiz ve çok uygulamalı çalışma gelişir. | 10–15 gün | Pilot sonucuna bağlı |
| **1.0.0** | Kararlı kullanım sözleşmesi ve doğrulanmış günlük kullanım. | Ölçütlere bağlı | Sürüm numarası hedefi değil, kararlılık kararı |

0.2.0 tahmini önceki plandan artırıldı; baseline ve dağıtım ergonomisi aynı sürüme alındı. İlk iki geliştirme günündeki çözümleyici denemesi ve başlangıç ölçümüyle tahmin güncellenecek. İsteğe bağlı geçiş raporu için ayrıca 4–6 gün, yayın otomasyonu/hazır Action için toplam 3–5 gün öngörülür; hesap ayarı beklemeleri dahil değildir. 1.0.0 için 0.4.0'daki her özelliğin bitmesi şart değil.

### Ortak hazırlık — yayın öncesi gerekli zemin

- Yerel workspace bağlantısını temiz bağımlılık kurulumu ile düzelt ve kurulu alias importunu doğrula. Paket kaynak sorunu ile yerel kurulum sorununu ayrı kaydet.
- SARIF ve ESLint sürümünü ana manifestten tek bir iç sürüm modülüyle besle. Yöntemi derlenmiş çıktı ve kurulu tarball üzerinde doğrula; yalnız bunun için `./package.json` public export'u eklemek gerekmez.
- Ana/alias manifestleri, alias peer aralığı, lockfile ve metadata sürümü için tutarlılık kontrolü koy. Yeni adlandırılmış tip export'ları 0.2.0 kapsamında eklenir.
- Bakım kayıtlarını npm dosya listesinden çıkar veya `maintainers/` altına taşı; README bağlantılarını ve tarball içeriğini kontrol et. Tarihli doğrulama kayıtlarını geriye dönük değiştirme; sonradan yapılan yayını yeni tarihli durum notuyla belirt.
- Küçük bir kaynak lint config'i ekle. Önce coverage raporu üret; rastgele yüzdeyi yayın engeli yapma. Kritik çözümleyici/kimlik davranışlarını örneklerle doğrula, eşikleri başlangıç ölçümüne göre belirle.
- Destek tablosunda test edilen kesin Next sürümleri ile hedeflenen aralığı ayır. Paket/adaptör için yeni ana sürüm desteğini bağımlılık aralığını genişleterek varsayma.
- `sideEffects: false`, ek package export'ları ve `codemod` keyword'ü somut ihtiyaç/doğrulama olmadan eklenmez. Mevcut araç kaynak kodu dönüştüren bir codemod değildir.

### 0.1.1 veya 0.2.0'a dahil — İlk kullanım ve geri bildirim

- README'nin başına npm kurulumu, ilk tarama ve tek bir hatanın önce/sonra örneğini koy.
- Kaynak koddan geliştirme adımlarını aşağı taşı; pilot rehberini yayınlanmış paket akışına güncelle.
- Mevcut issue şablonlarına Next.js sürümü, ilgili config, küçük tekrar üretim örneği ve beklenen/gerçek sonuç alanlarını ekle.
- 3–5 bağımsız Next.js App Router geliştiricisiyle pilot hazırlığı yap. CMS/webhook, form/Server Action ve ortak veri katmanı kullanan projeleri örnekle.

Tamamlanma ölçütü: temiz bir tüketici projede yalnız README izlenerek kurulum ve ilk açıklanabilir bulguya ulaşılması. Pilot görüşmeleri ürün geliştirmeyle birlikte ilerler; bu plan kimseye mesaj gönderildiği anlamına gelmez.

### 0.2.0 — Doğru ilişkiler ve kademeli CI

Dar ve uygulanabilir ilk kapsam:

1. Yerel `const` metinler, statik nesne alanları ve bilinen dizileri çözümle. `as const` gibi tip ifadelerinin çalışma zamanı değişmezliği sağlamadığını dikkate al; mutasyon veya bilinmeyen akış varsa sonucu belirsiz bırak.
2. Proje içi doğrudan adlandırılmış import/export ve `tsconfig` path alias çözümlemesi ekle. Karmaşık barrel zincirleri, `export *` çakışmaları ve wrapper çağrıları sonraki sürüme kalır. Kod çalıştırma. Proje kökü dışını açık sınır olarak raporla; başka Next uygulamasının aynı tag'ini üretici sayma.
3. İlişki başına kaynak zinciri üret: kullanım → import/export → tanım → çözülen tag. Döngü, belirsiz export veya analiz bütçesi aşımı için okunabilir gerekçe ver.
4. CLI ve HTML'de belirli bir tag'in üretici ve invalidation noktalarını gösteren açıklama görünümü ekle. JSON'a aynı kanıtı aktar; şema değişikliğini sürümle.
5. Mevcut coverage bilgisini geliştir: doğrudan okunan, statik olarak çözülen ve çözülemeyen ifadeleri say. Sıfır bulgu ile yetersiz analiz kapsamını ayırt et.
6. Baseline ve Markdown raporunu aşağıdaki sözleşmeyle ekle. Yeni davranış kuralları, bu çekirdek tamamlanana kadar sürüme eklenmez.

Örnek hedef: `tags.ts` içindeki `export const POSTS = 'posts'` değeri iki ayrı dosyada `cacheTag(POSTS)` ve `updateTag(POSTS)` için kullanıldığında ilişki kurulmalı. Sabit değiştiğinde sonraki tarama yeni değeri göstermeli.

Bu sürümde çalışma zamanında gelen `id` değerini tahmin etmiyoruz. `post:${id}` türü ifadeler, somut tag olarak gösterilmiyor.

**Baseline sözleşmesi:** Önerilen arayüz `--baseline <dosya>` ve açık bir oluşturma/güncelleme işlemi. Normal audit baseline'ı değiştirmez. Mevcut, yeni ve çözülen bulgular ayrı sayılır; baseline'a alınanlar graph'tan ve tam rapordan silinmez. `summary` toplamları ile CI'a uygulanacak yeni-bulgu toplamları ayrı tanımlanır.

- Kimlik sürümlüdür; kural, uygulama/dosya, ilgili sembol/ifade ve birden çok eşdeğer bulguyu ayırt eden konum bilgisi kullanılır. Yalnız satır numarası veya kullanıcıya gösterilen mesaj hash'i yeterli değildir. Aynı bulgunun ikinci bir kopyası baseline içinde kaybolmamalı.
- Boş satır/yorum ekleme kimliği bozmamalı. İlk sürümde dosya taşıma açıkça yeni/çözülen bulgu sayılabilir; akıllı rename takibi şart değil.
- Config, kapsam, kimlik ve şema sürümü uyumsuzluğu açıklanır; sessizce bütün bulgular kabul edilmiş sayılmaz. Parser hataları ve araç/I/O hataları baseline ile gizlenmez.
- SARIF kimlik üretimiyle ortak bileşen kullanılabilir; eski parmak izi alanını sessizce farklı anlama çevirmek yerine sürümlü geçiş belgelenir.

**Kapsam kapısı:** `--min-files` ve `--require-cache-usage` gibi isteğe bağlı beklentiler tanımlanır; sağlanmazsa exit 2 ve ölçülen değer raporlanır. Cache kullanımı yalnız `use cache` boundary sayısı değildir: `fetch(... next.tags ...)` ve `unstable_cache` projeleri de geçerli olabilir. Dinamik tag çözülemese de API kullanımı sayılır. Bu kapı cache doğruluğu veya yeterli kapsam garantisi vermez; kapsam sayıları susturulan bulgulardan etkilenmez.

**Markdown:** GitHub job summary'de okunabilir özet, yeni/eski bulgu ayrımı, kaynak konumları ve tag tablosu. Markdown/HTML özel karakterlerini doğru kaçır; çok büyük raporda özeti sınırla ve tam rapora yönlendir. İlk teslimat kilitlenmiş yerel CLI ile çalışan workflow örneği; ayrı Action zorunlu değil.

Tamamlanma ölçütleri:

- Doğrudan import, path alias, gölgelenen isim, döngü ve mutasyon örnekleri davranış testleriyle kapsanır. Desteklenmeyen yeniden export açıkça belirsiz kalır.
- Mevcut literal sonuçlar korunur; çözümlemenin başarısız olduğu durumda uydurma ilişki üretilmez.
- CLI ve ESLint proje modu aynı kayıtlı kaynak için aynı kanıtı kullanır. Dosya içi ESLint modu kendi sınırını korur.
- En az iki pilotta ortak sabit/import kullanımı mevcut sürüme göre daha açıklanabilir sonuç verir; performans farkı kaydedilir.
- Baseline sonrası aynı taramada yeni bulgu sıfırdır; özdeş ikinci hata eklenirse bir yeni bulgu çıkar. Üretici silinmesi, tüketici dosyası değişmese de yeni bulgu oluşturur.
- Tamamı tag'li `fetch` kullanan ve boundary içermeyen geçerli proje, genel cache-kullanımı beklentisini sağlar. Gerçekten boş kapsam beklentiyi sağlamaz.

### 0.3.0 — Sürüme uygun kontroller ve açıklama

- **Yeniden export:** Adlandırılmış barrel zincirleri, ardından sınırlandırılmış `export *` çözümleme. Çakışma/döngü/derinlik bütçesi aşımı belirsiz sonuç verir. `analyzeSource` dosya içi API olarak kalır; proje çözümlemesi ikinci geçiştedir.
- **Next.js sürüm farkındalığı:** Uygulamanın kurulu sürümünü çalıştırmadan oku; sürüm aralığını kesin kurulu sürüm gibi sunma. Bulunamayan veya destek dışı sürümü belirt. İlk hedef 16.x olarak kalır.
- **Bağlam kuralı:** Örneğin Route Handler gövdesindeki doğrudan `updateTag` kullanımını yakala. Genel yardımcı fonksiyonların çağrı bağlamı bilinmiyorsa kesin hata verme.
- **Profil kontrolü:** Statik olarak bilinen `cacheLife` değerlerinin çelişkilerini ve tamamen çözülen yapılandırmada bulunmayan özel profil adlarını tespit et. Dinamik config'ten profil yokluğu sonucu çıkarma.
- Bulgu yardımında kullanılan API'nin etkisini, ilgili resmî belgeyi ve kullanıcıdan beklenen kararı göster. Yeni kuralları önce isteğe bağlı sun; mevcut CI davranışını değiştiren varsayılanları sürüm notunda açıkla.

Yeni kural ID'leri uygulama sırasında tek bir kayıt tablosunda atanır. Sadece `RULES` içine eklemek yeterli değildir: kuralın config/proje bilgisine ihtiyacı, ESLint recommended/project preset'i ve dosya içi kapsamı ayrı doğrulanır. Özellikle proje bilgisi isteyen kurallar dosya içi preset'e otomatik açılmaz.

Tamamlanma ölçütü: geçerli Server Action, varsayılan profil, dinamik config ve izinli sayfa cache örnekleri yanlış hata üretmez. Geçersiz profil/bağlam örnekleri ilgili Next sürümünün build veya istek senaryosuyla doğrulanır. Pilotlarda mevcut build/ESLint'e ek fayda kaydedilir.

**İsteğe bağlı geçiş raporu:** En az iki pilotta gerçek ihtiyaç görülürse `migrate` komutu eklenir; yalnız geçiş adaylarını ve kararları raporlar. Sürümü geciktirecekse sonraki minor'a taşınır. [Resmî geçiş rehberi](https://nextjs.org/docs/app/guides/migrating-to-cache-components)

- `unstable_cache` tag, revalidate, keyParts, parametre ve closure kullanımını envanterle; çözülmeyen bölümleri belirt.
- Sayısal süreyi en yakın hazır profile otomatik yuvarlama. Diğer lifetime değerleriyle birlikte etkisini inceleme notu ver; `false`, eksik veya dinamik seçenekleri ayrı ele al.
- `keyParts` için her durumda “argümana taşı” deme. `use cache` anahtarında argümanların yanında yakalanan closure değerleri de yer alabilir; eşdeğerliği uygulamaya göre incele. [Anahtar modeli](https://nextjs.org/docs/app/api-reference/directives/use-cache), [unstable_cache seçenekleri](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
- Depolama/yeniden deployment kalıcılığının değişebileceğini raporla; `cacheComponents` etkinliğini önkoşul olarak denetle. Kaynakta aynı görünen dönüşümün çalışma zamanı davranışını koruduğunu iddia etme. [Geçişte kalıcılık farkı](https://nextjs.org/docs/app/guides/migrating-to-cache-components#unstable_cache)
- `revalidatePath` için otomatik tag karşılığı ve NCT006 için otomatik `'max'` seçimi üretme. Kaynak dosyalarına yazan bir seçenek bu kapsamda yok.

### 0.4.0 — İlişki kapsamı ve günlük çalışma

Önce pilotların en çok istediği iki kalemi seç; kalanları sonraki sürüme taşı:

- **Sınırlı tag yardımcıları:** Saf, küçük tag üretim fonksiyonlarını ve doğrudan çağrılarını kaynak üzerinden izle. Sabit argüman varsa somut değer; bilinmeyen argümanda yalnız sembolik desen göster. Aynı desen, aynı çalışma zamanı tag'i olduğunun kanıtı değildir.
- **Route etkisi:** Doğrudan import ve çağrılardan, cache kullanan fonksiyona ulaşabilen sayfa/layout adaylarını göster. Kontrol akışı, dinamik import ve dış paket sınırlarını görünür tut. Statik erişilebilirlik, gerçekleşmiş çağrı olarak etiketlenmez.
- **Watch ve performans:** İlk tam taramadan sonra değişen modülü ve ona bağımlı modülleri yeniden analiz et. Tag/config/import değişikliklerinde önbelleğin doğru geçersizleştiğini doğrula. Önce 100/1.000/5.000 dosyalık ölçüm yap, süre ve bellek hedeflerini bu ölçüme göre belirle.
- **Monorepo:** Birden fazla Next uygulamasını ayrı config/sürüm ve ayrı ilişki alanlarıyla tara. Başka uygulamadaki aynı tag, bu uygulamanın üreticisi sayılmamalı. Ortak workspace paketlerini açıkça tanımlanan kaynak kapsamına al.
- **HTML raporu:** Tag araması, kural/dosya filtresi ve kanıt zinciri görünümü. Rapor yerel açılmalı; dış servis gerektirmemeli. Arayüz karmaşıklığı ancak gerçek rapor okuma ihtiyacını azaltıyorsa eklenmeli.

Tamamlanma ölçütü seçilen kapsam için belirlenir: sıcak tarama tam taramayla aynı sonucu verir; uygulamalar arası hatalı ilişki kurulmaz; bir kullanıcı tag değişikliğinin olası etkisini kaynak zincirinden açıklayabilir.

**`--since` tasarımı:** Önce 0.2.0 baseline kullanılmalı. Sonradan Git karşılaştırması eklenirse merge-base ve hedef snapshot'ın tüm raporları, aynı analiz motoru ve açık config politikasıyla karşılaştırılır. Sadece değişen dosya filtresi bir görüntüleme seçeneği olabilir, CI kararını belirlemez. Git katmanı CLI'da kalır; uygulama kodunu checkout edip çalıştırmak gerekmez. Silme/yeniden adlandırma, sığ clone, bulunamayan ref ve çalışma ağacı/HEAD farkı açıkça tanımlanır. Güvenilir eski snapshot alınamıyorsa sessizce temiz sonuç verilmez.

### Suspense ve deneysel öneriler — sürüm sözü verilmeyen araştırma

Önce 2–3 günlük bir uygulanabilirlik çalışması ve gerçek Next build örnekleri. `Suspense` import'u veya aynı dosyada JSX bulunması tek başına ölçüt değildir. Okuma, onu saran gerçek render ağacı, üst layout, ilgili `loading` sınırı, statik params ve çağrı zinciri birlikte ele alınmalı. Üst layout'un kendisindeki okuma, döndürdüğü alt sınır tarafından korunmuş sayılmaz. `connection` doğru olarak `next/server` kaynağından çözülür. [Suspense hata rehberi](https://nextjs.org/docs/messages/blocking-route), [connection](https://nextjs.org/docs/app/api-reference/functions/connection)

Çıkış ölçütü: desteklenen dar desenler, hem pozitif hem karşı örneklerle doğrulanır; çözülemeyen render ilişkisi kesin hata sayılmaz. Sonuç yeterli değilse lint kuralı yerine teşhis rehberi yayımlanır. Başarılı olursa ilk sürümde kapalı bir deneysel öneri olur. Zaman/rastgelelik uyarıları da kullanıcı niyeti gerektirdiğinden aynı opt-in yaklaşımını izler.

## 4. İlk sprintin sırası

1. Yerel bağlantıyı, sürüm kaynağını ve kullanıcı/bakım belgelerinin ayrımını düzelt; mevcut doğrulama sonucunu kaydet.
2. Sabit/import karşı örnekleri ve 100/1.000/5.000 dosyalık başlangıç performansını çıkar. İlk iki günde kapsam/tahmini yeniden değerlendir.
3. Ortak kanıt modeliyle yerel sabitleri, ardından doğrudan import/path alias çözümlemesini uygula.
4. Yeni bulgu kimliği ve baseline semantiğini geliştir; silinen üretici ve özdeş yeni hata örneklerini önce doğrula.
5. Kapsam beklentilerini, Markdown çıktısını ve CLI/JSON/HTML/ESLint uyumunu tamamla.
6. Pilot geri bildirimi, temiz paket kurulumu ve aday commit CI doğrulamasından sonra 0.2.0'ı hazırla.

Teknik değişikliklerin ana yerleri: `src/ast.ts`, sınırlı çözümleyici, sürüm/kimlik/baseline modülleri, `src/model.ts`, `src/analyze.ts`, `src/reporters.ts`, `src/eslint.ts`, `src/index.ts` ve CLI. Bu modüllerin isimleri uygulama önerisidir. Mevcut mimari korunabilir; yeni bir framework veya paket ailesi gerekmiyor.

Her teslimat davranış testleriyle kapanır; sürüm adayı mevcut `verify` zinciri ve eklenen lint kontrolünden geçer. Her küçük doküman değişiminde bütün Next matrisi tekrar koşturulmaz. Harici testbed toplamlarını yalnız yeni sonuca uydurmak yerine değişen kural, konum ve beklenen etki doğrulanır.

### Yayın ve CI altyapısı — bağımsız teslimatlar

- **Önce workflow örneği:** Lockfile'daki kurulu CLI'yı kullan, Markdown özeti ve tam raporu üret; sonra bulgu eşiğini uygula. Rapor yüklemek için analiz hatasını başarılı sonuca çevirmeme. SARIF başarısızlığı ile analiz/araç hatasını ayrı göster.
- **Sonra composite Action:** Pilotlar kurulumda zorlanıyorsa çıkar. Tool sürümü/çalıştırılan CLI açık ve sabit olmalı; `@v0` Action etiketi analiz motorunun sürümünü tek başına sabitlemez. Girdileri shell'e ham metin olarak yerleştirme. Summary/artifact üretimi varsayılan; SARIF upload isteğe bağlı ve izin/hesap uygunluğuna bağlı. PR yorumu yazmak için ekstra yetki gerektiren akış varsayılan olmaz.
- **Mevcut code-scanning örneği:** Şu an kasıtlı hatalar içeren fixture'ı tarıyor. Bunu doğrudan her PR'a bağlamak repo kodunun denetlendiği izlenimi verir. Fixture doğrulamasını normal CI'da tut; gerçek hedef için ayrı, anlamlı workflow tanımla.
- **Trusted Publishing:** İki npm paketi için repo/workflow eşleştirmesi ayrı hazırlanır. Güncel npm belgesindeki Node/npm alt sınırları, GitHub-hosted runner, OIDC izni ve izinli publish işlemi doğrulanır. GitHub trusted publishing provenance'ı otomatik üretir; manifestte koşulsuz `provenance: true` zorunlu değildir. Yeni publisher ayarlarının staged/direct yayın seçimi kontrol edilir. [npm resmî rehberi](https://docs.npmjs.com/trusted-publishers/)
- Yayın akışı sürüm etiketi, iki manifest, lockfile ve aday commit'i eşler; doğrulanmış artefaktları ana paket → alias sırasıyla yayımlar. Aynı sürüm için eşzamanlı çalışmayı önler. Ana paket yayımlanıp alias başarısız olursa, yeniden deneme önce registry durumunu doğrular ve yalnız eksik adımı sürdürür.
- `--dry-run` paket içeriğini ve komutu sınar; OIDC yetkisi/provenance veya gerçek registry yayınını kanıtlamaz. Yayın sonrası registry'den temiz kurulum, CLI/API/ESLint ve provenance doğrulanır. Etiket tetiklemeleri yalnız seçilen sürümü hedefler.
- Dependabot/PR şablonu gibi bakım kolaylıkları küçük bağımsız işlerdir. Tek bakımcılı projede CODEOWNERS gereksinimi ve ek repo kuralları ayrıca değerlendirilir; özellik sürümünün zorunlu önkoşulu yapılmaz.

## 5. Kullanıcı faydasını nasıl ölçeceğiz?

Telemetri eklemeden gönüllü pilot formu ve küçük tekrar üretim örnekleri kullan:

| Ölçüm | Ne öğreniyoruz? |
| --- | --- |
| İlk yararlı rapora ulaşma süresi | Kurulum ve açıklamalar anlaşılır mı? İlk hedef 10 dakikanın altında. |
| Kullanıcının doğruladığı faydalı bulgular ve yanlış pozitifler | Kural gerçekten eyleme dönüşüyor mu? Payda ve örnek sayısı birlikte kaydedilir. |
| Çözülemeyen tag ifadeleri ve nedenleri | Bir sonraki çözümleme özelliği hangisi olmalı? |
| Mevcut build/ESLint'in zaten yakaladığı bulgular | Aracın ek faydası nerede? |
| İki hafta sonra CI/editörde kullanmaya devam eden pilotlar | Araç günlük iş akışına yerleşiyor mu? İlk hedef en az iki bağımsız proje. |
| Soğuk/sıcak tarama süresi ve tepe bellek | Yeni kapsam editör ve CI maliyetini artırıyor mu? |

İndirme sayısı yardımcı bir dağıtım göstergesi olarak izlenir. Kullanım veya fayda oranını hesaplamak için tek başına kullanılmaz. Pilotların asıl ihtiyacı çalışma zamanı sorunları çıkarsa birkaç somut örnek toplanır ve kapsam yeniden değerlendirilir.

## 6. 1.0.0 ve sürüm politikası

SemVer biçimi `MAJOR.MINOR.PATCH`: uyumsuz API değişikliği major, geriye uyumlu özellik minor, geriye uyumlu hata düzeltmesi patch. `0.y.z` ilk geliştirme dönemini; `1.0.0` tanımlanmış kararlı dış API'yi ifade eder. 1.0 sonrası her şema alanı veya özellik eklemesi otomatik olarak 2.0 gerektirmez; tüketici sözleşmesine etkisi belirleyicidir. `RuleCode` gibi union genişlemeleri de exhaustive switch kullanan tüketiciler açısından değerlendirilir. [SemVer 2.0.0](https://semver.org/)

Depodaki ilk yayın planı 0.1.0'ı hedefliyordu. Mevcut belgeler ilk kapsamın sınırlı olduğunu ve bağımsız kullanıcı doğrulamasının henüz tamamlanmadığını kaydediyor. 0.1.0 seçimi bu aşamayla uyumlu. 1.0.0 için belirli bir indirme sayısı veya bütün fikirlerin tamamlanması gerekmiyor.

Önerilen proje politikası:

- 0.x döneminde patch sürümleri uyumlu düzeltmelere ayrılır. Uyumsuz CLI/API/rapor değişiklikleri yeni minor sürüm ve geçiş notu alır.
- 1.0 öncesi CLI argümanları, çıkış kodları, JSON şeması, TypeScript API, yapılandırma ve ESLint preset davranışları belgelenip sabitlenir. Yeni teşhislerin CI sonucunu nasıl etkileyebileceği için açık politika yazılır.
- npm paket sürümü ile raporun `schemaVersion` değeri ayrı sözleşmelerdir; uyumlulukları belgelenir.
- Ana paket ve ESLint alias birlikte doğrulanır. 0.2.0 adayında alias'ın `next-cache-trace` peer aralığı `^0.2.0`; yeni minor geçişlerinde uyumlu aralık bilinçli güncellenir. ESLint metadata sürümü de eşlenir.
- Yayın adayının kendi commit'inde Windows/macOS/Linux, desteklenen Node/ESLint ve Next sürümleri için uygun kontroller geçer. Tanımlanmış CI matrisi, çalışmış ve geçmiş sonuç yerine kullanılamaz.
- Temiz tüketicide paket kurulumu, CLI, tipler ve ESLint doğrulanır. Cache davranışı iddia eden kurallar için ilgili Next sürümlerinde `build/start` senaryoları kullanılır.
- 3–5 bağımsız pilot tamamlanır; en az iki proje aracı iki hafta kullanır. Bilinen ciddi yanlış pozitifler ve kararlılık engelleri çözülür; kalan analiz sınırları belgelenir.

## 7. Talep gelene kadar sonraya bırakılanlar

- Ayrı VS Code eklentisi: mevcut ESLint entegrasyonunun karşılamadığı somut bir editör ihtiyacı beklenir.
- Ayrı MCP sunucusu: önce mevcut JSON/CLI çıktısının kullanımı denenir; resmî Next.js araçlarını tekrarlamanın faydası ölçülür.
- Çalışma zamanı hit/miss takibi ve overlay: farklı bir teknik kapsam; statik rapordan türetilmiş tahmin olarak sunulmaz.
- Otomatik toplu tag yeniden adlandırma ve invalidation API dönüşümü: dinamik/dış üreticiler ve davranış değişikliği nedeniyle önce inceleme önerisi sunulur.
- Hosted dashboard, Redis entegrasyonu ve geniş framework desteği: çekirdek ürünün düzenli kullanım kanıtı oluşunca değerlendirilir.

Her sürümün kapanış sorusu: **Geliştirici bu değişiklik sayesinde hangi gerçek cache sorununu daha hızlı buldu veya önledi?**
