/**
 * Kotak Harian — Praktikum JavaScript (PABWE P3)
 * Fitur: Tab switcher (via query URL), Expense Tracker, Bookmark Manager, Quiz App
 * Semua logika berada di file ini. index.html hanya berisi markup & struktur UI.
 */

/* ========================================================================
   UTILITAS UMUM
   ======================================================================== */

/** Ambil satu elemen; lempar error jika tidak ditemukan (memudahkan debug) */
function $(selector, scope = document) {
  const el = scope.querySelector(selector);
  if (!el) throw new Error(`Elemen tidak ditemukan: ${selector}`);
  return el;
}

/** Ambil banyak elemen sekaligus */
function $all(selector, scope = document) {
  return scope.querySelectorAll(selector);
}

/** Format angka menjadi mata uang Rupiah sederhana */
function formatRupiah(value) {
  const number = Number(value) || 0;
  return "Rp " + number.toLocaleString("id-ID");
}

/** Format tanggal ISO (yyyy-mm-dd) menjadi format Indonesia singkat */
function formatTanggal(isoDate) {
  if (!isoDate) return "-";
  const date = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

/** Escape teks agar aman disisipkan ke dalam innerHTML */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

/** Buat id unik sederhana berbasis waktu + angka acak */
function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ========================================================================
   MODAL HELPERS (dipakai bersama oleh Expense & Bookmark)
   ======================================================================== */

function openModal(name) {
  const modal = $(`#modal-${name}`);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("modal-open");
}

function closeModal(name) {
  const modal = $(`#modal-${name}`);
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("modal-open");
}

// Tombol tutup modal (Batal / ikon X) & klik backdrop
$all("[data-close-modal]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
});
$all(".modal-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", () => {
    const modal = backdrop.closest("[id^='modal-']");
    closeModal(modal.id.replace("modal-", ""));
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    $all("[id^='modal-']:not(.hidden)").forEach((modal) => {
      closeModal(modal.id.replace("modal-", ""));
    });
  }
});

/* ========================================================================
   TAB SWITCHER — status tab disimpan & dipulihkan lewat QUERY URL
   Format: ?tab=expense | ?tab=bookmark | ?tab=quiz
   ======================================================================== */

const VALID_TABS = ["expense", "bookmark", "quiz"];
const DEFAULT_TAB = "expense";
const tabButtons = $all(".tab-btn");
const tabPanels = {
  expense: $("#panel-expense"),
  bookmark: $("#panel-bookmark"),
  quiz: $("#panel-quiz"),
};

/** Baca nilai ?tab= dari URL saat ini; kembalikan default jika tidak valid */
function getTabFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab");
  return VALID_TABS.includes(tab) ? tab : DEFAULT_TAB;
}

/**
 * Tampilkan panel sesuai nama tab, atur gaya tombol aktif,
 * lalu perbarui query string di address bar.
 * @param {string} name - "expense" | "bookmark" | "quiz"
 * @param {boolean} pushHistory - true untuk menambah entri history (klik tab),
 *                                false saat hanya menyinkronkan tampilan (load awal / back-forward)
 */
function switchTab(name, pushHistory = true) {
  if (!VALID_TABS.includes(name)) name = DEFAULT_TAB;

  Object.entries(tabPanels).forEach(([key, panel]) => {
    panel.classList.toggle("hidden", key !== name);
  });

  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.setAttribute("aria-selected", String(active));
    btn.classList.toggle("bg-ink", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("text-ink/60", !active);
    btn.classList.toggle("hover:bg-ink/5", !active);
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("tab") !== name) {
    params.set("tab", name);
    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
    if (pushHistory) {
      history.pushState({ tab: name }, "", newUrl);
    } else {
      history.replaceState({ tab: name }, "", newUrl);
    }
  }
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// Tombol back/forward browser tetap mengikuti query URL
window.addEventListener("popstate", () => switchTab(getTabFromUrl(), false));

// Pulihkan tab dari query URL saat halaman pertama kali dibuka
switchTab(getTabFromUrl(), false);

/* ========================================================================
   FITUR 1: CATATAN PENGELUARAN HARIAN (EXPENSE TRACKER)
   Key localStorage: "kotak-harian-expense"
   ======================================================================== */

const EXPENSE_STORAGE_KEY = "kotak-harian-expense";

const expenseForm = $("#expense-form");
const expenseFormError = $("#expense-form-error");
const expenseSearch = $("#expense-search");
const expenseFilterType = $("#expense-filter-type");
const expenseFilterCategory = $("#expense-filter-category");
const expenseSort = $("#expense-sort");
const expenseList = $("#expense-list");
const expenseEmpty = $("#expense-empty");
const expenseTotalIncomeEl = $("#expense-total-income");
const expenseTotalOutcomeEl = $("#expense-total-outcome");
const expenseBalanceEl = $("#expense-balance");

const expenseEditForm = $("#expense-edit-form");

let expenses = loadExpenses();
let pendingDelete = null; // { feature: "expense" | "bookmark", id: string }

/** Baca daftar transaksi dari localStorage */
function loadExpenses() {
  try {
    const raw = localStorage.getItem(EXPENSE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Simpan daftar transaksi ke localStorage */
function saveExpenses() {
  localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(expenses));
}

/** Perbarui daftar opsi filter kategori berdasarkan kategori yang sudah ada */
function refreshExpenseCategoryOptions() {
  const current = expenseFilterCategory.value;
  const categories = [...new Set(expenses.map((item) => item.category))].sort((a, b) =>
    a.localeCompare(b, "id")
  );

  expenseFilterCategory.innerHTML = '<option value="all">Semua kategori</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    expenseFilterCategory.appendChild(option);
  });

  if (categories.includes(current)) expenseFilterCategory.value = current;
}

/** Hitung ringkasan (pemasukan, pengeluaran, saldo) dan tampilkan */
function renderExpenseSummary() {
  const totalIncome = expenses
    .filter((item) => item.type === "Pemasukan")
    .reduce((sum, item) => sum + item.amount, 0);
  const totalOutcome = expenses
    .filter((item) => item.type === "Pengeluaran")
    .reduce((sum, item) => sum + item.amount, 0);

  expenseTotalIncomeEl.textContent = formatRupiah(totalIncome);
  expenseTotalOutcomeEl.textContent = formatRupiah(totalOutcome);
  expenseBalanceEl.textContent = formatRupiah(totalIncome - totalOutcome);
  expenseBalanceEl.classList.toggle("text-rose-600", totalIncome - totalOutcome < 0);
  expenseBalanceEl.classList.toggle("text-expense", totalIncome - totalOutcome >= 0);
}

/** Filter + urutkan transaksi, lalu render ke daftar (DOM) */
function renderExpenseList() {
  const query = expenseSearch.value.trim().toLowerCase();
  const typeFilter = expenseFilterType.value;
  const categoryFilter = expenseFilterCategory.value;
  const sortMode = expenseSort.value;

  let items = expenses.filter((item) => {
    const matchesQuery = item.title.toLowerCase().includes(query);
    const matchesType = typeFilter === "all" || item.type === typeFilter;
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesQuery && matchesType && matchesCategory;
  });

  items = [...items].sort((a, b) => {
    switch (sortMode) {
      case "oldest":
        return a.createdAt - b.createdAt;
      case "amount-desc":
        return b.amount - a.amount;
      case "amount-asc":
        return a.amount - b.amount;
      case "newest":
      default:
        return b.createdAt - a.createdAt;
    }
  });

  const isEmptyOverall = expenses.length === 0;
  expenseEmpty.classList.toggle("hidden", !isEmptyOverall);
  expenseList.innerHTML = "";

  if (isEmptyOverall) return;

  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "py-8 text-center text-sm text-ink/50";
    li.textContent = "Tidak ada transaksi yang cocok dengan pencarian/filter.";
    expenseList.appendChild(li);
    return;
  }

  items.forEach((item) => expenseList.appendChild(buildExpenseRow(item)));
}

/** Bangun satu baris transaksi lewat createElement (manipulasi DOM) */
function buildExpenseRow(item) {
  const li = document.createElement("li");
  li.className = "py-3 flex items-center justify-between gap-3";
  li.dataset.id = item.id;

  const isIncome = item.type === "Pemasukan";
  const typeBadgeClass = isIncome ? "bg-expense-light text-expense" : "bg-rose-100 text-rose-700";
  const sign = isIncome ? "+" : "−";
  const amountClass = isIncome ? "text-expense" : "text-rose-600";

  li.innerHTML = `
    <div class="min-w-0">
      <p class="text-sm font-semibold text-ink truncate">${escapeHtml(item.title)}</p>
      <div class="flex flex-wrap items-center gap-1.5 mt-1">
        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${typeBadgeClass}">${escapeHtml(item.type)}</span>
        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-ink/5 text-ink/60">${escapeHtml(item.category)}</span>
        <span class="text-[11px] text-ink/40">${formatTanggal(item.date)}</span>
      </div>
    </div>
    <div class="flex items-center gap-2 shrink-0">
      <p class="text-sm font-semibold ${amountClass}">${sign} ${formatRupiah(item.amount)}</p>
      <button type="button" class="expense-edit-btn p-1.5 rounded-lg text-ink/50 hover:bg-ink/5" aria-label="Ubah transaksi">
        <i class="ti ti-pencil"></i>
      </button>
      <button type="button" class="expense-delete-btn p-1.5 rounded-lg text-rose-500 hover:bg-rose-50" aria-label="Hapus transaksi">
        <i class="ti ti-trash"></i>
      </button>
    </div>
  `;

  li.querySelector(".expense-edit-btn").addEventListener("click", () => openExpenseEditModal(item.id));
  li.querySelector(".expense-delete-btn").addEventListener("click", () => askDeleteExpense(item.id));

  return li;
}

/** Render ulang seluruh bagian Expense Tracker (ringkasan + daftar) */
function renderExpense() {
  refreshExpenseCategoryOptions();
  renderExpenseSummary();
  renderExpenseList();
}

/** Validasi input form transaksi. Kembalikan pesan error, atau null jika valid */
function validateExpenseInput({ title, category, amount, date }) {
  if (!title.trim() || !category.trim() || !date) {
    return "Judul, kategori, dan tanggal wajib diisi.";
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return "Jumlah harus berupa angka lebih dari 0.";
  }
  return null;
}

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(expenseForm);
  const newItem = {
    title: String(formData.get("title") || ""),
    category: String(formData.get("category") || ""),
    amount: Number(formData.get("amount")),
    type: String(formData.get("type") || "Pengeluaran"),
    date: String(formData.get("date") || ""),
  };

  const errorMessage = validateExpenseInput(newItem);
  if (errorMessage) {
    expenseFormError.textContent = errorMessage;
    expenseFormError.classList.remove("hidden");
    return;
  }
  expenseFormError.classList.add("hidden");

  expenses.push({ id: createId("exp"), createdAt: Date.now(), ...newItem });
  saveExpenses();
  renderExpense();
  expenseForm.reset();
  $("#expense-date").value = "";
});

[expenseSearch, expenseFilterType, expenseFilterCategory, expenseSort].forEach((el) => {
  el.addEventListener("input", renderExpenseList);
  el.addEventListener("change", renderExpenseList);
});

function openExpenseEditModal(id) {
  const item = expenses.find((exp) => exp.id === id);
  if (!item) return;

  $("#expense-edit-id").value = item.id;
  $("#expense-edit-title").value = item.title;
  $("#expense-edit-category").value = item.category;
  $("#expense-edit-amount").value = item.amount;
  $("#expense-edit-type").value = item.type;
  $("#expense-edit-date").value = item.date;

  openModal("expense-edit");
}

expenseEditForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const id = $("#expense-edit-id").value;
  const updated = {
    title: $("#expense-edit-title").value,
    category: $("#expense-edit-category").value,
    amount: Number($("#expense-edit-amount").value),
    type: $("#expense-edit-type").value,
    date: $("#expense-edit-date").value,
  };

  const errorMessage = validateExpenseInput(updated);
  if (errorMessage) {
    alert(errorMessage);
    return;
  }

  expenses = expenses.map((exp) => (exp.id === id ? { ...exp, ...updated } : exp));
  saveExpenses();
  renderExpense();
  closeModal("expense-edit");
});

function askDeleteExpense(id) {
  const item = expenses.find((exp) => exp.id === id);
  if (!item) return;
  pendingDelete = { feature: "expense", id };
  $("#delete-confirm-target").textContent = `transaksi "${item.title}"`;
  openModal("delete-confirm");
}

/* ========================================================================
   FITUR 2: BOOKMARK / LINK MANAGER
   Key localStorage: "kotak-harian-bookmarks" (terpisah dari Expense)
   ======================================================================== */

const BOOKMARK_STORAGE_KEY = "kotak-harian-bookmarks";

const bookmarkForm = $("#bookmark-form");
const bookmarkFormError = $("#bookmark-form-error");
const bookmarkSearch = $("#bookmark-search");
const bookmarkSort = $("#bookmark-sort");
const bookmarkList = $("#bookmark-list");
const bookmarkEmpty = $("#bookmark-empty");
const bookmarkEditForm = $("#bookmark-edit-form");

let bookmarks = loadBookmarks();

/** Baca daftar bookmark dari localStorage */
function loadBookmarks() {
  try {
    const raw = localStorage.getItem(BOOKMARK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Simpan daftar bookmark ke localStorage */
function saveBookmarks() {
  localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(bookmarks));
}

/** Validasi sederhana: URL wajib diawali http:// atau https:// */
function isValidUrl(url) {
  return /^https?:\/\/.+/i.test(url.trim());
}

/** Validasi input form bookmark. Kembalikan pesan error, atau null jika valid */
function validateBookmarkInput({ title, url, category }) {
  if (!title.trim() || !url.trim() || !category.trim()) {
    return "Nama, URL, dan kategori wajib diisi.";
  }
  if (!isValidUrl(url)) {
    return "URL harus diawali http:// atau https://";
  }
  return null;
}

/** Render ulang seluruh bagian Bookmark Manager */
function renderBookmarks() {
  const query = bookmarkSearch.value.trim().toLowerCase();
  const sortMode = bookmarkSort.value;

  let items = bookmarks.filter((item) => {
    return (
      item.title.toLowerCase().includes(query) ||
      item.url.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query)
    );
  });

  items = [...items].sort((a, b) => {
    switch (sortMode) {
      case "title-asc":
        return a.title.localeCompare(b.title, "id");
      case "title-desc":
        return b.title.localeCompare(a.title, "id");
      case "newest":
      default:
        return b.createdAt - a.createdAt;
    }
  });

  const isEmptyOverall = bookmarks.length === 0;
  bookmarkEmpty.classList.toggle("hidden", !isEmptyOverall);
  bookmarkList.innerHTML = "";

  if (isEmptyOverall) return;

  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "col-span-full py-8 text-center text-sm text-ink/50";
    li.textContent = "Tidak ada bookmark yang cocok dengan pencarian.";
    bookmarkList.appendChild(li);
    return;
  }

  items.forEach((item) => bookmarkList.appendChild(buildBookmarkCard(item)));
}

/** Bangun satu kartu bookmark lewat createElement */
function buildBookmarkCard(item) {
  const li = document.createElement("li");
  li.className = "rounded-xl border border-ink/10 p-4 flex flex-col gap-2";
  li.dataset.id = item.id;

  li.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
         class="text-sm font-semibold text-bookmark hover:underline break-words">
        ${escapeHtml(item.title)}
      </a>
      <span class="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-bookmark-light text-bookmark">${escapeHtml(item.category)}</span>
    </div>
    <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
       class="text-xs text-ink/50 hover:text-bookmark break-all">${escapeHtml(item.url)}</a>
    ${item.note ? `<p class="text-xs text-ink/60">${escapeHtml(item.note)}</p>` : ""}
    <div class="flex items-center gap-2 mt-1">
      <button type="button" class="bookmark-edit-btn inline-flex items-center gap-1 text-xs font-medium text-ink/60 hover:text-ink">
        <i class="ti ti-pencil"></i> Ubah
      </button>
      <button type="button" class="bookmark-delete-btn inline-flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-700">
        <i class="ti ti-trash"></i> Hapus
      </button>
    </div>
  `;

  li.querySelector(".bookmark-edit-btn").addEventListener("click", () => openBookmarkEditModal(item.id));
  li.querySelector(".bookmark-delete-btn").addEventListener("click", () => askDeleteBookmark(item.id));

  return li;
}

bookmarkForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(bookmarkForm);
  const newItem = {
    title: String(formData.get("title") || ""),
    url: String(formData.get("url") || ""),
    category: String(formData.get("category") || ""),
    note: String(formData.get("note") || ""),
  };

  const errorMessage = validateBookmarkInput(newItem);
  if (errorMessage) {
    bookmarkFormError.textContent = errorMessage;
    bookmarkFormError.classList.remove("hidden");
    return;
  }
  bookmarkFormError.classList.add("hidden");

  bookmarks.push({ id: createId("bmk"), createdAt: Date.now(), ...newItem });
  saveBookmarks();
  renderBookmarks();
  bookmarkForm.reset();
});

[bookmarkSearch, bookmarkSort].forEach((el) => {
  el.addEventListener("input", renderBookmarks);
  el.addEventListener("change", renderBookmarks);
});

function openBookmarkEditModal(id) {
  const item = bookmarks.find((bmk) => bmk.id === id);
  if (!item) return;

  $("#bookmark-edit-id").value = item.id;
  $("#bookmark-edit-title").value = item.title;
  $("#bookmark-edit-url").value = item.url;
  $("#bookmark-edit-category").value = item.category;
  $("#bookmark-edit-note").value = item.note || "";

  openModal("bookmark-edit");
}

bookmarkEditForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const id = $("#bookmark-edit-id").value;
  const updated = {
    title: $("#bookmark-edit-title").value,
    url: $("#bookmark-edit-url").value,
    category: $("#bookmark-edit-category").value,
    note: $("#bookmark-edit-note").value,
  };

  const errorMessage = validateBookmarkInput(updated);
  if (errorMessage) {
    alert(errorMessage);
    return;
  }

  bookmarks = bookmarks.map((bmk) => (bmk.id === id ? { ...bmk, ...updated } : bmk));
  saveBookmarks();
  renderBookmarks();
  closeModal("bookmark-edit");
});

function askDeleteBookmark(id) {
  const item = bookmarks.find((bmk) => bmk.id === id);
  if (!item) return;
  pendingDelete = { feature: "bookmark", id };
  $("#delete-confirm-target").textContent = `bookmark "${item.title}"`;
  openModal("delete-confirm");
}

// Tombol konfirmasi hapus (dipakai bersama Expense & Bookmark)
$("#delete-confirm-btn").addEventListener("click", () => {
  if (!pendingDelete) return;

  if (pendingDelete.feature === "expense") {
    expenses = expenses.filter((exp) => exp.id !== pendingDelete.id);
    saveExpenses();
    renderExpense();
  } else if (pendingDelete.feature === "bookmark") {
    bookmarks = bookmarks.filter((bmk) => bmk.id !== pendingDelete.id);
    saveBookmarks();
    renderBookmarks();
  }

  pendingDelete = null;
  closeModal("delete-confirm");
});

/* ========================================================================
   FITUR 3: KUIS INTERAKTIF (QUIZ APP)
   Key localStorage: "kotak-harian-quiz-highscore" (terpisah dari fitur lain)
   ======================================================================== */

const QUIZ_HIGHSCORE_KEY = "kotak-harian-quiz-highscore";

/** Bank soal — array of object, minimal 5 soal, masing-masing 4 opsi */
const QUIZ_QUESTIONS = [
  {
    question: "Tag HTML apa yang digunakan untuk membuat tautan (link)?",
    options: ["<link>", "<a>", "<href>", "<nav>"],
    answer: "<a>",
  },
  {
    question: "Properti CSS apa yang digunakan untuk mengubah warna teks?",
    options: ["text-color", "font-color", "color", "background-color"],
    answer: "color",
  },
  {
    question: "Kata kunci JavaScript apa yang membuat variabel tidak dapat diubah nilainya?",
    options: ["let", "var", "const", "static"],
    answer: "const",
  },
  {
    question: "Method array JavaScript apa yang digunakan untuk menambah elemen di akhir array?",
    options: ["shift()", "push()", "pop()", "unshift()"],
    answer: "push()",
  },
  {
    question: "Objek browser apa yang digunakan untuk menyimpan data secara permanen di sisi klien?",
    options: ["sessionStorage", "cookie", "localStorage", "cache"],
    answer: "localStorage",
  },
  {
    question: "Tag HTML5 apa yang secara semantik digunakan untuk konten utama halaman?",
    options: ["<section>", "<main>", "<div>", "<content>"],
    answer: "<main>",
  },
  {
    question: "Method apa yang digunakan untuk mengubah string JSON menjadi objek JavaScript?",
    options: ["JSON.stringify()", "JSON.toObject()", "JSON.parse()", "JSON.decode()"],
    answer: "JSON.parse()",
  },
];

const quizStartScreen = $("#quiz-start");
const quizQuestionScreen = $("#quiz-question-panel");
const quizResultScreen = $("#quiz-result");
const quizStartBtn = $("#quiz-start-btn");
const quizRestartBtn = $("#quiz-restart-btn");
const quizNextBtn = $("#quiz-next-btn");
const quizProgress = $("#quiz-progress");
const quizLiveScore = $("#quiz-live-score");
const quizQuestionText = $("#quiz-question-text");
const quizOptionsContainer = $("#quiz-options");
const quizFeedback = $("#quiz-feedback");
const quizFinalScore = $("#quiz-final-score");
const quizHighScoreDisplay = $("#quiz-high-score-display");
const quizHighScoreResult = $("#quiz-high-score-result");

/** State kuis: nomor soal aktif, skor, dan status sudah menjawab atau belum */
let quizState = {
  currentIndex: 0,
  score: 0,
  answered: false,
};

/** Baca skor tertinggi dari localStorage (default 0) */
function loadQuizHighScore() {
  const raw = localStorage.getItem(QUIZ_HIGHSCORE_KEY);
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

/** Simpan skor tertinggi ke localStorage */
function saveQuizHighScore(score) {
  localStorage.setItem(QUIZ_HIGHSCORE_KEY, String(score));
}

function showQuizScreen(name) {
  quizStartScreen.classList.toggle("hidden", name !== "start");
  quizQuestionScreen.classList.toggle("hidden", name !== "question");
  quizResultScreen.classList.toggle("hidden", name !== "result");
}

function updateQuizHighScoreDisplay() {
  quizHighScoreDisplay.textContent = `${loadQuizHighScore()} / ${QUIZ_QUESTIONS.length}`;
}

/** Mulai / ulangi kuis: reset seluruh state lalu tampilkan soal pertama */
function startQuiz() {
  quizState = { currentIndex: 0, score: 0, answered: false };
  showQuizScreen("question");
  renderQuizQuestion();
}

/** Render pertanyaan + opsi aktif berdasarkan state lewat manipulasi DOM */
function renderQuizQuestion() {
  const item = QUIZ_QUESTIONS[quizState.currentIndex];

  quizProgress.textContent = `Soal ${quizState.currentIndex + 1} / ${QUIZ_QUESTIONS.length}`;
  quizLiveScore.textContent = `Skor: ${quizState.score}`;
  quizQuestionText.textContent = item.question;
  quizFeedback.classList.add("hidden");
  quizNextBtn.classList.add("hidden");
  quizState.answered = false;

  quizOptionsContainer.innerHTML = "";
  item.options.forEach((optionText) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "quiz-option w-full text-left rounded-lg border border-ink/15 px-4 py-2.5 text-sm font-medium hover:border-quiz hover:bg-quiz-light transition";
    button.textContent = optionText;
    button.addEventListener("click", () => selectQuizAnswer(optionText, button));
    quizOptionsContainer.appendChild(button);
  });
}

/** Bandingkan jawaban user dengan kunci jawaban, beri feedback, dan update skor */
function selectQuizAnswer(selected, button) {
  if (quizState.answered) return; // cegah klik ganda setelah dijawab
  quizState.answered = true;

  const item = QUIZ_QUESTIONS[quizState.currentIndex];
  const isCorrect = selected === item.answer;
  if (isCorrect) quizState.score += 1;

  $all(".quiz-option", quizOptionsContainer).forEach((optionBtn) => {
    optionBtn.classList.add("pointer-events-none");
    if (optionBtn.textContent === item.answer) {
      optionBtn.classList.add("border-expense", "bg-expense-light", "text-expense");
    } else if (optionBtn === button) {
      optionBtn.classList.add("border-rose-400", "bg-rose-50", "text-rose-600");
    }
  });

  quizFeedback.textContent = isCorrect ? "Benar! Jawaban tepat." : `Kurang tepat. Jawaban benar: ${item.answer}`;
  quizFeedback.classList.toggle("text-expense", isCorrect);
  quizFeedback.classList.toggle("text-rose-600", !isCorrect);
  quizFeedback.classList.remove("hidden");

  quizLiveScore.textContent = `Skor: ${quizState.score}`;

  const isLastQuestion = quizState.currentIndex === QUIZ_QUESTIONS.length - 1;
  quizNextBtn.textContent = isLastQuestion ? "Lihat hasil" : "Lanjut";
  quizNextBtn.innerHTML = isLastQuestion
    ? 'Lihat hasil <i class="ti ti-flag-2"></i>'
    : 'Lanjut <i class="ti ti-arrow-right"></i>';
  quizNextBtn.classList.remove("hidden");
}

quizNextBtn.addEventListener("click", () => {
  const isLastQuestion = quizState.currentIndex === QUIZ_QUESTIONS.length - 1;
  if (isLastQuestion) {
    finishQuiz();
  } else {
    quizState.currentIndex += 1;
    renderQuizQuestion();
  }
});

/** Tampilkan skor akhir dan perbarui high score jika perlu */
function finishQuiz() {
  const previousHighScore = loadQuizHighScore();
  const isNewHighScore = quizState.score > previousHighScore;
  if (isNewHighScore) saveQuizHighScore(quizState.score);

  quizFinalScore.textContent = `${quizState.score} / ${QUIZ_QUESTIONS.length}`;
  quizHighScoreResult.textContent = isNewHighScore
    ? "Rekor baru! Skor tertinggimu diperbarui."
    : `Skor tertinggi saat ini: ${loadQuizHighScore()} / ${QUIZ_QUESTIONS.length}`;

  updateQuizHighScoreDisplay();
  showQuizScreen("result");
}

quizStartBtn.addEventListener("click", startQuiz);
quizRestartBtn.addEventListener("click", startQuiz);

/* ========================================================================
   INISIALISASI AWAL
   ======================================================================== */

renderExpense();
renderBookmarks();
updateQuizHighScoreDisplay();
showQuizScreen("start");
