"use strict";

const STORAGE_KEY = "week-deadlines.v1";
const THEME_KEY = "week-deadlines.theme";
const MOBILE_QUERY = "(max-width: 720px)";

const PRIORITY_LABELS = { high: "Высокий", normal: "Обычный", low: "Низкий" };
const DAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];
const MONTHS_NOMINATIVE = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
];

const weekEl = document.getElementById("week");
const weekLabelEl = document.getElementById("week-label");
const summaryEl = document.getElementById("summary");
const progressFillEl = document.getElementById("progress-fill");
const stripDaysEl = document.getElementById("week-strip-days");
const modalEl = document.getElementById("modal");
const formEl = document.getElementById("deadline-form");
const formTitleEl = document.getElementById("form-title");
const deleteCurrentButton = document.querySelector('[data-action="delete-current"]');
const themeButton = document.querySelector('[data-action="theme"]');

const fields = {
  title: document.getElementById("dl-title"),
  date: document.getElementById("dl-date"),
  time: document.getElementById("dl-time"),
  priority: document.getElementById("dl-priority"),
  description: document.getElementById("dl-description"),
};

let deadlines = loadDeadlines();
let weekStart = startOfWeek(new Date());
let activeDayIndex = (new Date().getDay() + 6) % 7;
let editingId = null;
let lastFocused = null;

function isMobile() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function pad2(v) {
  return String(v).padStart(2, "0");
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function fromISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offset = (base.getDay() + 6) % 7;
  base.setDate(base.getDate() - offset);
  return base;
}

function formatWeekLabel(start) {
  const end = addDays(start, 6);
  const sM = MONTHS_GENITIVE[start.getMonth()];
  const eM = MONTHS_GENITIVE[end.getMonth()];
  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.getDate()} ${sM} ${start.getFullYear()} — ${end.getDate()} ${eM} ${end.getFullYear()}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${start.getDate()} ${sM} — ${end.getDate()} ${eM} ${end.getFullYear()}`;
  }
  return `${start.getDate()}–${end.getDate()} ${eM} ${end.getFullYear()}`;
}

function activeDayDate() {
  return addDays(weekStart, activeDayIndex);
}

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme, persist) {
  const isDark = theme === "dark";
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  themeButton.setAttribute(
    "aria-label",
    isDark ? "Включить светлую тему" : "Включить тёмную тему"
  );
  themeButton.setAttribute("aria-pressed", String(isDark));
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    } catch (e) {}
  }
}

themeButton.addEventListener("click", () => {
  applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
});

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTask(value) {
  if (!value || typeof value !== "object") return null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const date = typeof value.date === "string" ? value.date : "";
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const priority = ["high", "normal", "low"].includes(value.priority)
    ? value.priority
    : "normal";
  return {
    id: typeof value.id === "string" && value.id ? value.id : createId(),
    title: title.slice(0, 120),
    date,
    time: typeof value.time === "string" && /^\d{2}:\d{2}$/.test(value.time) ? value.time : "",
    priority,
    description: typeof value.description === "string" ? value.description.slice(0, 400) : "",
    done: Boolean(value.done),
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : Date.now(),
  };
}

function loadDeadlines() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTask).filter(Boolean);
  } catch (e) {
    return [];
  }
}

function saveDeadlines() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines));
  } catch (e) {}
}

function compareTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  const tA = a.time || "99:99";
  const tB = b.time || "99:99";
  if (tA !== tB) return tA < tB ? -1 : 1;
  return a.createdAt - b.createdAt;
}

function render() {
  const todayISO = toISODate(new Date());
  const fragment = document.createDocumentFragment();
  let total = 0;
  let done = 0;

  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const iso = toISODate(date);
    const dayTasks = deadlines.filter((t) => t.date === iso).sort(compareTasks);
    total += dayTasks.length;
    done += dayTasks.filter((t) => t.done).length;
    fragment.append(buildDay(date, iso, dayTasks, todayISO));
  }

  weekEl.replaceChildren(fragment);
  weekLabelEl.textContent = formatWeekLabel(weekStart);

  summaryEl.textContent = total === 0
    ? "На этой неделе дедлайнов нет"
    : `Выполнено ${done} из ${total}`;

  progressFillEl.style.width = total ? `${(done / total) * 100}%` : "0%";

  buildStrip(todayISO);
  restoreDayScroll();
}

function buildDay(date, iso, tasks, todayISO) {
  const day = document.createElement("section");
  day.className = "day";
  day.dataset.date = iso;

  const weekday = (date.getDay() + 6) % 7;
  if (iso === todayISO) day.classList.add("day--today");
  if (weekday >= 5) day.classList.add("day--weekend");

  const header = document.createElement("header");
  header.className = "day__header";
  const label = document.createElement("div");
  label.className = "day__label";

  const name = document.createElement("span");
  name.className = "day__name";
  name.textContent = DAY_SHORT[weekday];

  const number = document.createElement("span");
  number.className = "day__date";
  number.textContent = String(date.getDate());

  label.append(name, number);

  if (date.getDate() === 1) {
    const month = document.createElement("span");
    month.className = "day__month";
    month.textContent = MONTHS_NOMINATIVE[date.getMonth()];
    label.append(month);
  }

  header.append(label);
  day.append(header);

  const list = document.createElement("div");
  list.className = "day__list";

  if (tasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "day__empty";
    empty.textContent = "Свободно";
    list.append(empty);
  } else {
    tasks.forEach((t) => list.append(buildTask(t)));
  }

  day.append(list);
  return day;
}

function buildTask(task) {
  const card = document.createElement("article");
  card.className = `task task--${task.priority}`;
  card.dataset.id = task.id;
  if (task.done) card.classList.add("task--done");

  const check = document.createElement("label");
  check.className = "task__check";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = task.done;
  cb.dataset.action = "toggle";
  cb.setAttribute("aria-label", `Отметить «${task.title}» как выполненное`);

  const title = document.createElement("span");
  title.className = "task__title";
  title.textContent = task.title;
  check.append(cb, title);
  card.append(check);

  const meta = document.createElement("div");
  meta.className = "task__meta";
  if (task.time) {
    const time = document.createElement("span");
    time.className = "task__time";
    time.textContent = task.time;
    meta.append(time);
  }
  const badge = document.createElement("span");
  badge.className = "task__badge";
  badge.textContent = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.normal;
  meta.append(badge);
  card.append(meta);

  if (task.description) {
    const desc = document.createElement("p");
    desc.className = "task__description";
    desc.textContent = task.description;
    card.append(desc);
  }

  const actions = document.createElement("div");
  actions.className = "task__actions";
  const editButton = document.createElement("button");
  editButton.className = "icon-button";
  editButton.type = "button";
  editButton.dataset.action = "edit";
  editButton.textContent = "✎";
  editButton.setAttribute("aria-label", `Редактировать «${task.title}»`);
  actions.append(editButton);
  card.append(actions);

  return card;
}

function buildStrip(todayISO) {
  stripDaysEl.replaceChildren();
  const frag = document.createDocumentFragment();

  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const iso = toISODate(date);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "week-strip__day";
    btn.dataset.action = "go-day";
    btn.dataset.index = String(i);
    btn.dataset.date = iso;
    if (i === activeDayIndex) btn.classList.add("week-strip__day--active");
    if (iso === todayISO) btn.classList.add("week-strip__day--today");

    const name = document.createElement("span");
    name.className = "week-strip__name";
    name.textContent = DAY_SHORT[i];
    const num = document.createElement("span");
    num.className = "week-strip__num";
    num.textContent = String(date.getDate());
    btn.append(name, num);
    btn.setAttribute("aria-label", `${DAY_SHORT[i]}, ${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`);

    frag.append(btn);
  }

  stripDaysEl.append(frag);
}

function highlightStripDay(index) {
  stripDaysEl.querySelectorAll(".week-strip__day").forEach((btn, i) => {
    btn.classList.toggle("week-strip__day--active", i === index);
  });
}

function scrollToDay(index, smooth = true) {
  const clamped = Math.max(0, Math.min(6, index));
  activeDayIndex = clamped;
  highlightStripDay(clamped);
  if (!isMobile()) return;
  const width = weekEl.clientWidth;
  if (!width) return;
  weekEl.scrollTo({
    left: clamped * width,
    behavior: smooth ? "smooth" : "instant",
  });
}

function restoreDayScroll() {
  if (!isMobile()) return;
  requestAnimationFrame(() => {
    const width = weekEl.clientWidth;
    if (!width) return;
    weekEl.scrollTo({ left: activeDayIndex * width, behavior: "instant" });
    highlightStripDay(activeDayIndex);
  });
}

let scrollRaf = 0;
weekEl.addEventListener("scroll", () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0;
    if (!isMobile()) return;
    const width = weekEl.clientWidth;
    if (!width) return;
    const index = Math.round(weekEl.scrollLeft / width);
    if (index !== activeDayIndex && index >= 0 && index <= 6) {
      activeDayIndex = index;
      highlightStripDay(index);
    }
  });
}, { passive: true });

window.addEventListener("resize", () => {
  if (isMobile()) scrollToDay(activeDayIndex, false);
});

function syncModalViewport() {
  if (modalEl.hidden) return;
  const vv = window.visualViewport;
  const height = vv ? vv.height : window.innerHeight;
  modalEl.style.setProperty("--modal-vh", `${height}px`);
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncModalViewport);
  window.visualViewport.addEventListener("scroll", syncModalViewport);
}

function toggleTask(id) {
  deadlines = deadlines.map((t) =>
    t.id === id ? { ...t, done: !t.done } : t
  );
  saveDeadlines();
  render();
  const next = weekEl.querySelector(`.task[data-id="${id}"] input[data-action="toggle"]`);
  if (next) next.focus();
}

function removeTask(id) {
  const task = deadlines.find((t) => t.id === id);
  if (!task) return false;
  const confirmed = window.confirm(`Удалить дедлайн «${task.title}»?`);
  if (!confirmed) return false;
  deadlines = deadlines.filter((t) => t.id !== id);
  saveDeadlines();
  return true;
}

function shiftWeek(delta) {
  weekStart = addDays(weekStart, delta * 7);
  render();
}

function goToToday() {
  const today = new Date();
  const todayIndex = (today.getDay() + 6) % 7;
  const todayISO = toISODate(today);
  const weekStartISO = toISODate(weekStart);
  const weekEndISO = toISODate(addDays(weekStart, 6));

  if (todayISO >= weekStartISO && todayISO <= weekEndISO) {
    scrollToDay(todayIndex);
  } else {
    weekStart = startOfWeek(today);
    activeDayIndex = todayIndex;
    render();
  }
}

function defaultFormDate() {
  return toISODate(activeDayDate());
}

function openForm({ id = null } = {}) {
  editingId = id;
  formEl.reset();

  const task = id ? deadlines.find((t) => t.id === id) : null;
  if (task) {
    formTitleEl.textContent = "Редактировать дедлайн";
    fields.title.value = task.title;
    fields.date.value = task.date;
    fields.time.value = task.time;
    fields.priority.value = task.priority;
    fields.description.value = task.description;
  } else {
    formTitleEl.textContent = "Новый дедлайн";
    fields.date.value = defaultFormDate();
    fields.priority.value = "normal";
  }

  deleteCurrentButton.hidden = !editingId;
  lastFocused = document.activeElement;
  modalEl.hidden = false;
  document.body.classList.add("is-locked");
  syncModalViewport();
  fields.title.focus();
}

function closeForm() {
  modalEl.hidden = true;
  document.body.classList.remove("is-locked");
  editingId = null;
  deleteCurrentButton.hidden = true;
  formEl.reset();
  if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  lastFocused = null;
}

formEl.addEventListener("focusin", (event) => {
  if (!isMobile()) return;
  const el = event.target;
  if (!(el instanceof HTMLInputElement) &&
      !(el instanceof HTMLTextAreaElement) &&
      !(el instanceof HTMLSelectElement)) return;
  setTimeout(() => {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 280);
});

formEl.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(formEl);
  const title = String(data.get("title") || "").trim();
  const date = String(data.get("date") || "");
  const time = String(data.get("time") || "");
  const priority = String(data.get("priority") || "normal");
  const description = String(data.get("description") || "").trim();

  if (!title || !date) return;

  if (editingId) {
    deadlines = deadlines.map((t) =>
      t.id === editingId ? { ...t, title, date, time, priority, description } : t
    );
  } else {
    deadlines.push({
      id: createId(), title, date, time, priority, description,
      done: false, createdAt: Date.now(),
    });
  }

  saveDeadlines();
  const targetDate = fromISODate(date);
  weekStart = startOfWeek(targetDate);
  activeDayIndex = (targetDate.getDay() + 6) % 7;
  closeForm();
  render();
});

deleteCurrentButton.addEventListener("click", () => {
  if (!editingId) return;
  const removed = removeTask(editingId);
  if (!removed) return;
  lastFocused = null;
  closeForm();
  render();
});

weekEl.addEventListener("change", (event) => {
  const cb = event.target.closest('input[data-action="toggle"]');
  if (!cb) return;
  const card = cb.closest(".task");
  if (!card) return;
  toggleTask(card.dataset.id);
});

weekEl.addEventListener("click", (event) => {
  const button = event.target.closest('button[data-action="edit"]');
  if (!button) return;
  const card = button.closest(".task");
  if (!card) return;
  openForm({ id: card.dataset.id });
});

document.querySelector('[data-action="new"]').addEventListener("click", () => {
  openForm();
});

document.querySelectorAll('[data-action="prev-week"]').forEach((btn) =>
  btn.addEventListener("click", () => shiftWeek(-1))
);

document.querySelectorAll('[data-action="next-week"]').forEach((btn) =>
  btn.addEventListener("click", () => shiftWeek(1))
);

document.querySelector('[data-action="today"]').addEventListener("click", goToToday);

document.querySelector('[data-action="prev-day"]').addEventListener("click", () => scrollToDay(activeDayIndex - 1));
document.querySelector('[data-action="next-day"]').addEventListener("click", () => scrollToDay(activeDayIndex + 1));

let suppressStripClick = false;

stripDaysEl.addEventListener("click", (event) => {
  if (suppressStripClick) {
    event.preventDefault();
    return;
  }
  const dayBtn = event.target.closest(".week-strip__day");
  if (!dayBtn) return;
  const index = Number(dayBtn.dataset.index);
  if (!Number.isFinite(index)) return;
  scrollToDay(index);
});

let stripPointer = null;

stripDaysEl.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") return;
  stripPointer = { x: event.clientX, y: event.clientY, moved: false };
});

stripDaysEl.addEventListener("pointermove", (event) => {
  if (!stripPointer) return;
  const dx = Math.abs(event.clientX - stripPointer.x);
  const dy = Math.abs(event.clientY - stripPointer.y);
  if (dx > 12 && dx > dy) stripPointer.moved = true;
});

stripDaysEl.addEventListener("pointerup", (event) => {
  if (!stripPointer) return;
  const dx = event.clientX - stripPointer.x;
  const moved = stripPointer.moved;
  stripPointer = null;
  if (moved && Math.abs(dx) > 40) {
    suppressStripClick = true;
    setTimeout(() => { suppressStripClick = false; }, 350);
    shiftWeek(dx > 0 ? -1 : 1);
  }
});

stripDaysEl.addEventListener("pointercancel", () => { stripPointer = null; });

let labelPointer = null;

weekLabelEl.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") return;
  labelPointer = { x: event.clientX };
});

weekLabelEl.addEventListener("pointerup", (event) => {
  if (!labelPointer) return;
  const dx = event.clientX - labelPointer.x;
  labelPointer = null;
  if (Math.abs(dx) > 50) shiftWeek(dx > 0 ? -1 : 1);
});

weekLabelEl.addEventListener("pointercancel", () => { labelPointer = null; });

modalEl.addEventListener("click", (event) => {
  if (event.target.closest('[data-action="close"]')) closeForm();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalEl.hidden) {
    closeForm();
    return;
  }
  if (!modalEl.hidden) return;
  const tag = document.activeElement ? document.activeElement.tagName : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (event.key === "ArrowLeft") {
    if (isMobile()) scrollToDay(activeDayIndex - 1);
    else shiftWeek(-1);
  }
  if (event.key === "ArrowRight") {
    if (isMobile()) scrollToDay(activeDayIndex + 1);
    else shiftWeek(1);
  }
});

applyTheme(currentTheme(), false);
render();