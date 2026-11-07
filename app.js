document.addEventListener("DOMContentLoaded", () => {
  const brandsToggleBtn = document.getElementById("brandsToggleBtn");
  const brandsDropdownMenu = document.getElementById("brandsDropdownMenu");
  const brandSearchInput = document.getElementById("brandSearchInput");
  const brandOptions = document.querySelectorAll(".brand-option");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const chatMessages = document.getElementById("chatMessages");
  const chipBtns = document.querySelectorAll(".chip-btn");
  const currencyBoard = document.getElementById("currencyBoard");
  const usdRateSpan = document.getElementById("usdRate");
  const eurRateSpan = document.getElementById("eurRate");

  let cachedProducts = [];
  let knownBrands = [];
  let dbLoaded = false;
  let dbLoadError = null;
  let cbuUsdRate = 0;
  let cbuEurRate = 0;
  let isUzsActive = false;

  // ⚠️ DIQQAT: bu kalit brauzer tomonida (client-side) ishlatilyapti —
  // faqat localhost'da sinov uchun mos. Saytni Netlify/boshqa hostingga
  // ochiq qilib qo'yishdan OLDIN buni albatta orqa server (masalan
  // Netlify Function) orqasiga yashirish kerak, aks holda har kim sahifa
  // manbasidan (View Source) kalitni ko'rib, o'zi ishlatib, sizning
  // Google hisobingiz hisobiga so'rov yuborishi mumkin.
  const GEMINI_API_KEY =
    "AQ.Ab8RN6It3tXxfE5m7I6QpFd5PIFx3x6mrmExtB_dLi3EPR0YUQ";
  const GEMINI_MODEL = "gemini-flash-latest";

  // Foydalanuvchining tabiiy yozuvidan ("13 pro max kk 500$ga kk" kabi)
  // brend, kalit so'zlar va narx chegarasini ajratib olish uchun
  // Gemini'ga murojaat qilamiz. Xato yoki vaqt tugashi holida `null`
  // qaytaradi — shunda kod avtomatik ravishda lokal qidiruvga o'tadi.
  async function geminiExtractFilter(rawQuery) {
    // Raqam yoki $ belgisi bo'lmagan oddiy so'rovlarda (masalan brend
    // nomi) Gemini'ga murojaat qilishning hojati yo'q — vaqt va
    // so'rov limitini tejaymiz.
    if (!/[0-9]/.test(rawQuery)) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const prompt =
      "Foydalanuvchi telefon do'konidan tovar qidiryapti. Uning xabaridan " +
      "quyidagi maydonlarni JSON qilib chiqar, BOSHQA HECH NARSA YOZMA " +
      "(izohsiz, faqat toza JSON):\n" +
      '{"brand": brend nomi yoki null, "keywords": [model va holatga oid ' +
      'kalit so\'zlar ro\'yxati, masalan ["13","pro","max"]], ' +
      '"max_price_usd": raqam yoki null}\n\n' +
      'Xabar: "' +
      rawQuery +
      '"';

    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);
      if (!resp.ok) {
        console.error("Gemini API xatosi:", resp.status);
        return null;
      }
      const data = await resp.json();
      const text =
        data &&
        data.candidates &&
        data.candidates[0] &&
        data.candidates[0].content &&
        data.candidates[0].content.parts &&
        data.candidates[0].content.parts[0] &&
        data.candidates[0].content.parts[0].text;
      if (!text) return null;
      return JSON.parse(text);
    } catch (err) {
      clearTimeout(timeoutId);
      console.error("Gemini so'rovda xatolik (lokal qidiruvga o'tildi):", err);
      return null;
    }
  }

  // Markaziy bank API orqali kurslarni olish
  async function fetchCbuRates() {
    try {
      const response = await fetch(
        "https://cbu.uz/uz/arkhiv-kursov-valyut/json/",
      );
      const data = await response.json();

      const usdObj = data.find((item) => item.Code === "840");
      const eurObj = data.find((item) => item.Code === "978");

      if (usdObj) {
        cbuUsdRate = parseFloat(usdObj.Rate);
        usdRateSpan.textContent = `USD/UZS: ${cbuUsdRate}`;
      }
      if (eurObj) {
        cbuEurRate = parseFloat(eurObj.Rate);
        eurRateSpan.textContent = `EUR/UZS: ${cbuEurRate}`;
      }
    } catch (error) {
      console.error("Markaziy bank kurslarini olishda xatolik:", error);
      usdRateSpan.textContent = "USD/UZS: Ma'lumot yo'q";
      eurRateSpan.textContent = "EUR/UZS: Ma'lumot yo'q";
    }
  }
  fetchCbuRates();

  async function loadDatabase() {
    if (chatInput) {
      chatInput.disabled = true;
      chatInput.placeholder = "Baza yuklanmoqda, biroz kuting...";
    }
    if (sendBtn) sendBtn.disabled = true;

    try {
      const response = await fetch("phones.json?v=" + Date.now());
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      const data = await response.json();

      if (Array.isArray(data)) {
        cachedProducts = data;
      } else if (data && typeof data === "object") {
        // phones.json {brandName: [{model, price}, ...], ...} ko'rinishida keladi.
        // Har bir brenddagi barcha tovarlarni bitta ro'yxatga yig'amiz va
        // har bir tovarga o'z brendini yozib qo'yamiz (agar item ichida
        // brend bo'lmasa, kalit nomidan olamiz).
        let flat = [];
        Object.keys(data).forEach((brandKey) => {
          const items = data[brandKey];
          if (Array.isArray(items)) {
            items.forEach((item) => {
              flat.push({
                brand: item.brand || item.brend || brandKey,
                ...item,
              });
            });
          }
        });
        cachedProducts = flat;
        knownBrands = Object.keys(data);
      } else {
        cachedProducts = [];
      }
      dbLoaded = true;
      dbLoadError = null;
    } catch (error) {
      // Eng ko'p uchraydigan sabab: index.html fayli to'g'ridan-to'g'ri
      // (file://...) ochilgan. Brauzerlar xavfsizlik siyosati bo'yicha
      // file:// orqali ochilgan sahifadan boshqa fayl (phones.json)ni
      // fetch() qilishga ruxsat bermaydi — shu sababli baza hech qachon
      // yuklanmaydi. Yechim: saytni lokal server orqali ochish kerak,
      // masalan VS Code'dagi "Live Server" kengaytmasi yoki terminalda
      // shu papkada "python -m http.server" buyrug'ini ishga tushirib,
      // http://localhost:8000 manzilidan ochish.
      console.error("phones.json o'qishda xatolik:", error);
      cachedProducts = [];
      dbLoaded = false;
      dbLoadError = error;
    } finally {
      if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = dbLoaded
          ? "Xabar yozing..."
          : "Baza yuklanmadi (pastdagi izohni o'qing)";
      }
      if (sendBtn) sendBtn.disabled = false;
    }
  }
  loadDatabase();

  if (currencyBoard) {
    currencyBoard.addEventListener("click", () => {
      if (!cbuUsdRate) {
        alert("Valyuta kursi hali yuklanmadi.");
        return;
      }
      isUzsActive = !isUzsActive;
      currencyBoard.classList.toggle("active-uzs", isUzsActive);

      if (chatInput) {
        chatInput.value = isUzsActive
          ? "Narxlarni so'mda ko'rsat"
          : "Narxlarni dollarda ko'rsat";
        handleSendMessage();
      }
    });
  }

  const translations = {
    uz: {
      notFound:
        "Kechirasiz, bazadan bu so'rov bo'yicha hech qanday mahsulot topilmadi.",
    },
  };

  if (brandsToggleBtn && brandsDropdownMenu) {
    brandsToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      brandsDropdownMenu.classList.toggle("active");
    });
    document.addEventListener("click", (e) => {
      if (
        !brandsDropdownMenu.contains(e.target) &&
        !brandsToggleBtn.contains(e.target)
      ) {
        brandsDropdownMenu.classList.remove("active");
      }
    });
  }

  if (brandSearchInput) {
    brandSearchInput.addEventListener("input", (e) => {
      const val = e.target.value.toLowerCase().trim();
      brandOptions.forEach((opt) => {
        const text = opt.textContent.toLowerCase();
        opt.style.display = text.includes(val) ? "block" : "none";
      });
    });
  }

  brandOptions.forEach((opt) => {
    opt.addEventListener("click", () => {
      const selectedBrand = opt.getAttribute("data-brand");
      if (chatInput) {
        chatInput.value = selectedBrand;
        brandsDropdownMenu.classList.remove("active");
        handleSendMessage();
      }
    });
  });

  chipBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (chatInput) {
        chatInput.value = btn.getAttribute("data-query");
        handleSendMessage();
      }
    });
  });

  function generateProductHTML(items) {
    return items
      .map((item) => {
        let name = item.name || item.model || item.title || "";
        let brand = item.brand || item.brend || "";
        let rawPriceStr = String(item.price || item.narxi || item.narx || "0");

        let cleanPrice = rawPriceStr.replace(/[^0-9.]/g, "");
        let baseDollarPrice = cleanPrice ? parseFloat(cleanPrice) : 0;

        let displayPrice = rawPriceStr;
        if (isUzsActive && cbuUsdRate > 0 && baseDollarPrice > 0) {
          let priceInUzs = Math.round(baseDollarPrice * cbuUsdRate);
          displayPrice = priceInUzs.toLocaleString() + " so'm";
        }

        return `
            <div class="product-result-item" style="border-bottom: 1px solid #e0e0e0; padding-bottom: 6px; margin-bottom: 6px;">
                🔥 <b>${brand} ${name}</b><br>
                💸 Narxi: ${displayPrice}
            </div>
        `;
      })
      .join("");
  }

  window.allSearchResults = window.allSearchResults || {};

  function searchProducts(query, lang, messageId, geminiFilter) {
    const t = translations[lang] || translations.uz;

    if (!cachedProducts || cachedProducts.length === 0) {
      if (dbLoadError) {
        return {
          html:
            "⚠️ Ma'lumotlar bazasi (phones.json) yuklanmadi.<br>" +
            "Eng ehtimoliy sabab: sahifa to'g'ridan-to'g'ri fayl sifatida (file://) ochilgan. " +
            "Brauzerlar bunday holatda boshqa faylni o'qishga ruxsat bermaydi.<br><br>" +
            'Yechim: bu papkani lokal server orqali oching — masalan VS Code\'da "Live Server" ' +
            "kengaytmasi bilan, yoki terminalda shu papka ichida <code>python -m http.server</code> " +
            "buyrug'ini ishga tushirib, <code>http://localhost:8000</code> manzilidan kiring.",
          hasMore: false,
        };
      }
      return { html: "Baza yuklanmoqda...", hasMore: false };
    }

    let q = query.toLowerCase().trim();
    let results = [];
    let smartFallbackNote = null;

    // Arzon mahsulotlarni saralash (50$ dan past yoki "arzon" so'zi yozilganda)
    if (q.includes("arzon") || q.includes("so'mda") || q.includes("dollarda")) {
      results = cachedProducts.filter((item) => {
        let priceStr = String(item.price || item.narxi || item.narx || "0");
        let cleanPrice = priceStr.replace(/[^0-9.]/g, "");
        let price = cleanPrice ? parseFloat(cleanPrice) : 0;
        return price > 0 && price <= 50;
      });
    } else {
      // Avval so'rov aniq bir brend nomiga to'g'ri kelishini tekshiramiz
      // (masalan brendlar menyusidan bosilganda yoki "Samsung" deb yozilganda),
      // shunda o'sha brenddagi HAMMA tovarlar chiqadi, faqat nomida so'z
      // uchraganlari emas.
      let exactBrand = knownBrands.find((b) => b.toLowerCase() === q);
      let matchedBrands = exactBrand
        ? [exactBrand]
        : knownBrands.filter(
            (b) => b.toLowerCase().includes(q) || q.includes(b.toLowerCase()),
          );

      if (matchedBrands.length > 0) {
        let matchedBrandsLower = matchedBrands.map((b) => b.toLowerCase());
        results = cachedProducts.filter((item) =>
          matchedBrandsLower.includes(String(item.brand || "").toLowerCase()),
        );
      } else {
        // "Aqlli" qidiruv: "13 pro max kk 500$ga" kabi tabiiy yozuvlarni
        // tushunish uchun — narx chegarasini va model kalit so'zlarini
        // ajratib olib, har bir tovarni ularga qanchalik mos kelishi
        // bo'yicha ballaymiz. Aynan byudjet ichida mos kelmasa, eng
        // yaqin (narx va model bo'yicha) variantlarni taklif qilamiz.
        smartFallbackNote = null;

        function getItemPrice(item) {
          let priceStr = String(item.price || item.narxi || item.narx || "0");
          let cleanPrice = priceStr.replace(/[^0-9.]/g, "");
          return cleanPrice ? parseFloat(cleanPrice) : 0;
        }

        function extractMaxPrice(text) {
          let m = text.match(/(\d+(?:[.,]\d+)?)\s*\$/);
          if (m) return parseFloat(m[1].replace(",", "."));
          m = text.match(/(\d+(?:[.,]\d+)?)\s*dollar/);
          if (m) return parseFloat(m[1].replace(",", "."));
          return null;
        }

        function cleanForTokens(text) {
          let cleaned = text
            .replace(/\d+(?:[.,]\d+)?\s*\$/g, " ")
            .replace(/\d+(?:[.,]\d+)?\s*dollar(ga|gacha)?/g, " ");
          const fillers = [
            "kk",
            "kerak",
            "kerakmi",
            "bo'lsa",
            "bolsa",
            "bormi",
            "bor",
            "menga",
            "men",
            "de",
            "deb",
            "yozsam",
            "uchun",
            "narxi",
            "narxda",
            "iltimos",
            "ga",
            "gacha",
            "dollarga",
            "dollar",
            "so'mga",
            "som",
            "so'm",
            "bolса",
          ];
          fillers.forEach((f) => {
            cleaned = cleaned.replace(
              new RegExp("\\b" + f.replace(/'/g, "['’]") + "\\b", "gi"),
              " ",
            );
          });
          return cleaned.replace(/\s+/g, " ").trim();
        }

        function tokenize(text) {
          return text
            .split(/[^a-z0-9']+/i)
            .map((t) => t.trim())
            .filter((t) => t.length > 0 && !(t.length === 1 && !/\d/.test(t)));
        }

        let maxPrice =
          geminiFilter &&
          geminiFilter.max_price_usd !== undefined &&
          geminiFilter.max_price_usd !== null
            ? Number(geminiFilter.max_price_usd)
            : extractMaxPrice(q);

        let tokens;
        if (
          geminiFilter &&
          Array.isArray(geminiFilter.keywords) &&
          geminiFilter.keywords.length > 0
        ) {
          tokens = geminiFilter.keywords
            .map((k) => String(k).toLowerCase().trim())
            .filter(Boolean);
          if (geminiFilter.brand) {
            tokens.push(String(geminiFilter.brand).toLowerCase().trim());
          }
        } else {
          tokens = tokenize(cleanForTokens(q));
        }

        // Foydalanuvchi aniq aksessuar so'ragan-so'ramaganini aniqlaymiz
        // (masalan "chexol", "steklo", "kabel"). Agar so'ramagan bo'lsa,
        // haqiqiy qurilmalar (category: "Telefon") natijalarda ustunlik
        // olishi kerak — aks holda "13 pro max" so'zi yozilgan chexol/
        // laminat kabi arzon aksessuarlar telefonlardan oldin chiqib
        // ketadi.
        const ACCESSORY_KEYWORDS = [
          "chexol",
          "chixol",
          "qilof",
          "g'ilof",
          "case",
          "steklo",
          "shisha",
          "oyna",
          "laminat",
          "kabel",
          "zaryadka",
          "zaryadlovchi",
          "quloqchin",
          "naushnik",
          "airpods",
          "sumka",
          "holder",
          "tripod",
          "kovrik",
          "mishka",
          "klaviatura",
          "fleshka",
          "printer",
          "kartrij",
          "router",
          "powerbank",
          "power bank",
          "adapter",
          "soat",
          "watch",
        ];
        let wantsAccessory = ACCESSORY_KEYWORDS.some((k) => q.includes(k));

        if (tokens.length > 0) {
          let scored = cachedProducts.map((item) => {
            let hay = (
              (item.brand || "") +
              " " +
              (item.model || item.name || "")
            ).toLowerCase();
            let score = 0;
            let matchedCount = 0;
            tokens.forEach((tok) => {
              if (hay.includes(tok)) {
                score += tok.length >= 3 ? 2 : 1;
                matchedCount += 1;
              }
            });
            if (score > 0) {
              let isDevice =
                String(item.category || "").toLowerCase() === "telefon";
              if (!wantsAccessory && isDevice) score += 50;
              if (wantsAccessory && !isDevice) score += 20;
            }
            return { item, score, matchedCount, price: getItemPrice(item) };
          });

          let matched = scored.filter((s) => s.matchedCount > 0);

          // Faqat bitta so'z (masalan faqat "pro") mos kelgan, lekin
          // qolgan kalit so'zlar ("13", "max") umuman yo'q tovarlarni
          // chiqarib tashlaymiz — aks holda MacBook, boshqa iPhone
          // modellari kabi aloqasiz mahsulotlar ham chiqib ketadi.
          // Avval BARCHA so'zlar mos kelgan tovarlarni izlaymiz; agar
          // shunday tovar umuman bo'lmasa, birma-bir talabni yumshatib
          // boramiz.
          if (matched.length > 0 && tokens.length > 1) {
            let maxMatchedCount = Math.max(
              ...matched.map((s) => s.matchedCount),
            );
            let requiredCount = Math.max(
              maxMatchedCount,
              Math.ceil(tokens.length * 0.6),
            );
            let tightened = matched.filter(
              (s) => s.matchedCount >= requiredCount,
            );
            if (tightened.length > 0) matched = tightened;
          }

          if (matched.length === 0) {
            // Hech qanday kalit so'z mos kelmadi — oxirgi chora sifatida
            // eski oddiy matn ichida qidiruvga tushamiz.
            results = cachedProducts.filter((item) => {
              let fullRowText = Object.values(item).join(" ").toLowerCase();
              return fullRowText.includes(q);
            });
          } else {
            // Agar foydalanuvchi aksessuar so'ramagan bo'lsa va mos
            // keladigan haqiqiy qurilma(lar) topilsa — aksessuarlarni
            // (chexol, laminat, steklo va h.k.) natijadan butunlay olib
            // tashlaymiz. Faqat hech qanday qurilma topilmasa, aksessuar
            // takliflarga qaytamiz (yo'qdan ko'ra shu bo'lsin).
            if (!wantsAccessory) {
              let deviceOnly = matched.filter(
                (s) =>
                  String(s.item.category || "").toLowerCase() === "telefon",
              );
              if (deviceOnly.length > 0) matched = deviceOnly;
            }

            if (maxPrice != null) {
              let within = matched.filter(
                (s) => s.price > 0 && s.price <= maxPrice,
              );
              let over = matched.filter(
                (s) => !(s.price > 0 && s.price <= maxPrice),
              );
              within.sort((a, b) => b.score - a.score || b.price - a.price);
              over.sort(
                (a, b) =>
                  b.score - a.score ||
                  Math.abs(a.price - maxPrice) - Math.abs(b.price - maxPrice),
              );
              if (within.length === 0 && over.length > 0) {
                smartFallbackNote = `Aynan ${maxPrice}$ byudjetga mos kelmadi, lekin eng yaqin takliflar shular:`;
              }
              results = within.concat(over).map((s) => s.item);
            } else {
              matched.sort((a, b) => b.score - a.score || a.price - b.price);
              results = matched.map((s) => s.item);
            }
          }
        } else {
          results = cachedProducts.filter((item) => {
            let fullRowText = Object.values(item).join(" ").toLowerCase();
            return fullRowText.includes(q);
          });
        }
      }
    }

    if (results.length > 0) {
      let firstBatch = results.slice(0, 6);
      let restBatch = results.slice(6);

      window.allSearchResults[messageId] = restBatch;
      let notePrefix = smartFallbackNote
        ? `<div style="margin-bottom:8px;color:#b45309;font-weight:600;">🔎 ${smartFallbackNote}</div>`
        : "";
      let html = `${notePrefix}<div class="product-list-container" id="prodList_${messageId}">${generateProductHTML(firstBatch)}</div>`;

      if (restBatch.length > 0) {
        html += `<div class="show-more-btn" data-msg-id="${messageId}" style="color: #4f46e5; cursor: pointer; margin-top: 8px; font-weight: 600;">
                    <i>✨ *(Va yana ${restBatch.length} ta arzon mahsulot bor - Hammasini ko'rsatish)*</i>
                </div>`;
      }
      return { html: html, hasMore: true };
    } else {
      return { html: t.notFound, hasMore: false };
    }
  }

  document.addEventListener("click", (e) => {
    const showMoreTrigger = e.target.closest(".show-more-btn");
    if (showMoreTrigger) {
      const msgId = showMoreTrigger.getAttribute("data-msg-id");
      const remainingItems = window.allSearchResults[msgId];
      const prodListContainer = document.getElementById(`prodList_${msgId}`);

      if (remainingItems && prodListContainer) {
        const extraHtml = generateProductHTML(remainingItems);
        prodListContainer.insertAdjacentHTML("beforeend", extraHtml);
        showMoreTrigger.remove();
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }
  });

  const footerContactInfo = `
    <div class="footer-contact-info" style="margin-top: 12px; border-top: 1px dashed #cbd5e1; padding-top: 8px;">
        📍 <b>Manzil:</b><br>
        1) Buxoro viloyati G’ijduvon tumani Y.Hamadoniy ko’chasi eski baxt uyi restoraning ro’parasi.<br>
        2) Buxoro viloyati G’ijduvon tumani Y.Hamadoniy ko’chasi bek restorani iyonida.<br>
        3) Buxoro viloyati Shofirkon tumani musiqa maktabi va Shofirkon dehqon bozori o’rtasi.<br>
        📱 <b>Insta:</b> ezgutech_uz<br>
        📞 <b>Murojaat uchun:</b> +998 78 555 20 01<br>
        <i>✨ EzguTechda kutib qolamiz!</i>
    </div>
  `;

  function handleSendMessage() {
    if (!chatInput || !chatMessages) return;
    const text = chatInput.value.trim();
    if (text === "") return;

    const userMsg = document.createElement("div");
    userMsg.className = "message user-message";
    userMsg.textContent = text;
    chatMessages.appendChild(userMsg);

    chatInput.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const messageId = "msg_" + Date.now();

    const thinkingMsg = document.createElement("div");
    thinkingMsg.className = "message ai-message";
    thinkingMsg.id = `thinking_${messageId}`;
    thinkingMsg.textContent = "Qidiryapman...";
    chatMessages.appendChild(thinkingMsg);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    setTimeout(async () => {
      let geminiFilter = null;
      try {
        geminiFilter = await geminiExtractFilter(text);
      } catch (err) {
        geminiFilter = null;
      }

      const searchResult = searchProducts(text, "uz", messageId, geminiFilter);

      const existingThinking = document.getElementById(`thinking_${messageId}`);
      if (existingThinking) existingThinking.remove();

      const aiMsg = document.createElement("div");
      aiMsg.className = "message ai-message";
      aiMsg.innerHTML = searchResult.html + footerContactInfo;

      chatMessages.appendChild(aiMsg);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 200);
  }

  if (sendBtn) sendBtn.addEventListener("click", handleSendMessage);
  if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") handleSendMessage();
    });
  }
});
