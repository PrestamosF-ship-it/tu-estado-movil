(() => {
  const CONFIG = {
    brandName: "Préstamos Flash",
    slogan: "Tu crédito al instante",
    dataUrl: "./portal-clientes.json",
    currency: "ARS",
    locale: "es-AR",
    whatsappNumber: "",
    whatsappMessage: "Hola, quiero consultar el estado de mi préstamo.",
    footerText: "Información actualizada según el último respaldo publicado.",
    ...(window.PORTAL_CONFIG || {})
  };

  const els = {
    portalTitle: document.getElementById("portalTitle"),
    footerText: document.getElementById("footerText"),
    form: document.getElementById("accessForm"),
    dni: document.getElementById("dniInput"),
    code: document.getElementById("codeInput"),
    clear: document.getElementById("clearBtn"),
    message: document.getElementById("loginMessage"),
    loginCard: document.getElementById("loginCard"),
    accountCard: document.getElementById("accountCard"),
    back: document.getElementById("backBtn"),
    clientName: document.getElementById("clientName"),
    clientMeta: document.getElementById("clientMeta"),
    statusBadge: document.getElementById("statusBadge"),
    totalAmount: document.getElementById("totalAmount"),
    paidAmount: document.getElementById("paidAmount"),
    pendingAmount: document.getElementById("pendingAmount"),
    nextDue: document.getElementById("nextDue"),
    nextDueLabel: document.getElementById("nextDueLabel"),
    planLabel: document.getElementById("planLabel"),
    progressPct: document.getElementById("progressPct"),
    progressFill: document.getElementById("progressFill"),
    updatedAt: document.getElementById("updatedAt"),
    installmentsBody: document.getElementById("installmentsBody"),
    whatsappBtn: document.getElementById("whatsappBtn")
  };

  let portalRows = null;
  let dataLoadedAt = null;

  function init() {
    document.title = `${CONFIG.brandName} · Estado de cuenta`;
    els.portalTitle.textContent = CONFIG.brandName;
    document.querySelectorAll(".brand-subtitle").forEach((node) => {
      node.textContent = CONFIG.slogan;
    });
    els.footerText.textContent = CONFIG.footerText;
    els.form.addEventListener("submit", onSubmit);
    els.clear.addEventListener("click", clearForm);
    els.back.addEventListener("click", resetView);
    els.dni.focus();
  }

  async function onSubmit(event) {
    event.preventDefault();
    const dni = normalizeId(els.dni.value);
    const code = normalizeCode(els.code.value);

    if (!dni || !code) {
      showMessage("Ingresá DNI/CUIT y código portal.", "error");
      return;
    }

    showMessage("Consultando datos...", "info");

    try {
      const rows = await loadPortalRows();
      const matches = rows.filter((row) => {
        return idsMatch(row.dni, dni) && normalizeCode(row.codigo) === code;
      });

      if (!matches.length) {
        showMessage("No encontré una cuenta con ese DNI/CUIT y código. Revisá los datos o pedí el código nuevamente.", "error");
        return;
      }

      renderAccount(matches[0], matches, 0);
    } catch (error) {
      console.error(error);
      showMessage("No se pudieron cargar los datos del portal. Revisá que portal-clientes.json esté subido junto al index.html.", "error");
    }
  }

  async function loadPortalRows() {
    // Se consulta nuevamente en cada búsqueda para no conservar datos viejos
    // después de reemplazar portal-clientes.json en GitHub.
    const response = await fetch(`${CONFIG.dataUrl}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const raw = await response.json();
    dataLoadedAt = new Date();
    portalRows = normalizePayload(raw);
    return portalRows;
  }

  function normalizePayload(raw) {
    return Array.isArray(raw) ? raw : [];
  }

  function renderAccount(row, matchingRows = [row], selectedIndex = 0) {
    const state = classifyAccount(row);
    const total = numberOf(row.total);
    const paid = Math.min(total, numberOf(row.pagado));
    const pending = Math.max(0, numberOf(row.pendiente));
    const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
    const next = nextPendingInstallment(row.installments || []);

    els.loginCard.classList.add("hidden");
    els.accountCard.classList.remove("hidden");
    els.message.classList.add("hidden");

    els.clientName.textContent = titleCase(row.nombre || "Cliente");
    const loanPosition = matchingRows.length > 1
      ? ` · Préstamo ${selectedIndex + 1} de ${matchingRows.length}`
      : "";
    els.clientMeta.textContent = `DNI/CUIT terminado en ${lastDigits(row.dni)} · Código portal validado${loanPosition}`;
    renderLoanSelector(matchingRows, selectedIndex);

    els.statusBadge.textContent = state.label;
    els.statusBadge.className = `status-badge ${state.kind}`;

    els.totalAmount.textContent = money(total);
    els.paidAmount.textContent = money(paid);
    els.pendingAmount.textContent = money(pending);
    els.nextDue.textContent = next ? formatDate(next.dueDate) : "-";
    els.nextDueLabel.textContent = next ? next.label : "Préstamo cancelado o sin cuotas pendientes";

    els.planLabel.textContent = [row.periodLabel, row.cuotaLabel, numberOf(row.cuotaMonto) ? money(row.cuotaMonto) : ""]
      .filter(Boolean)
      .join(" · ") || "Plan de cuotas";
    els.progressPct.textContent = `${pct}%`;
    els.progressFill.style.width = `${pct}%`;

    els.updatedAt.textContent = `Actualizado: ${formatUpdated(row.generatedAt || row.updatedAt)}`;

    renderInstallments(row.installments || []);
    setupWhatsapp(row);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderLoanSelector(rows, selectedIndex) {
    const accountTop = els.accountCard.querySelector(".account-top");
    if (!accountTop) return;

    let selector = document.getElementById("loanSelector");
    if (rows.length <= 1) {
      if (selector) selector.remove();
      return;
    }

    if (!selector) {
      selector = document.createElement("div");
      selector.id = "loanSelector";
      selector.style.cssText = "display:grid;gap:10px;padding:14px;border:1px solid rgba(159,209,221,.18);border-radius:16px;background:rgba(4,13,21,.38)";
      accountTop.appendChild(selector);
    }

    selector.innerHTML = "";

    const title = document.createElement("strong");
    title.textContent = `Este cliente tiene ${rows.length} préstamos activos`;
    selector.appendChild(title);

    const buttons = document.createElement("div");
    buttons.style.cssText = "display:flex;flex-wrap:wrap;gap:9px";

    rows.forEach((loan, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `btn ${index === selectedIndex ? "primary" : "ghost"} small`;

      const plan = String(loan.periodLabel || "").trim();
      const due = String(loan.vencimiento || "").trim();
      button.textContent = [
        `Préstamo ${index + 1}`,
        money(numberOf(loan.total)),
        plan,
        due && due !== "-" ? `vence ${due}` : ""
      ].filter(Boolean).join(" · ");

      button.addEventListener("click", () => {
        renderAccount(loan, rows, index);
      });

      buttons.appendChild(button);
    });

    selector.appendChild(buttons);
  }

  function renderInstallments(installments) {
    els.installmentsBody.innerHTML = "";

    if (!installments.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="6">No hay cuotas cargadas para mostrar.</td>`;
      els.installmentsBody.appendChild(tr);
      return;
    }

    installments.forEach((item, index) => {
      const amount = numberOf(item.amount);
      const paid = Math.min(amount, numberOf(item.paidAmount));
      const balance = Math.max(0, amount - paid);
      const status = classifyInstallment(item);
      const tr = document.createElement("tr");
      tr.className = `installment-row ${status.kind}`;
      tr.innerHTML = `
        <td>${escapeHtml(item.number || index + 1)}</td>
        <td>${formatDate(item.dueDate)}</td>
        <td>${money(amount)}</td>
        <td>${money(paid)}</td>
        <td>${money(balance)}</td>
        <td><span class="installment-status ${status.kind}">${status.label}</span></td>
      `;
      els.installmentsBody.appendChild(tr);
    });
  }

  function setupWhatsapp(row) {
    const number = String(CONFIG.whatsappNumber || "").replace(/\D/g, "");
    if (!number) {
      els.whatsappBtn.classList.add("hidden");
      return;
    }

    const message = `${CONFIG.whatsappMessage}\nDNI/CUIT: ${row.dni || ""}\nCódigo: ${row.codigo || ""}`;
    els.whatsappBtn.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    els.whatsappBtn.classList.remove("hidden");
  }

  function classifyAccount(row) {
    const pending = numberOf(row.pendiente);
    if (String(row.estado || "").toLowerCase() === "cancelado" || pending <= 0) {
      return { kind: "ok", label: "Cancelado" };
    }

    const installments = Array.isArray(row.installments) ? row.installments : [];
    const statuses = installments.map(classifyInstallment);
    if (statuses.some((item) => item.code === "late" || item.code === "latePartial")) {
      return { kind: "bad", label: "Atrasado" };
    }
    if (statuses.some((item) => item.code === "today" || item.code === "partialToday")) {
      return { kind: "warn", label: "Vence hoy" };
    }
    if (statuses.some((item) => item.code === "tomorrow")) {
      return { kind: "warn", label: "Vence mañana" };
    }

    return { kind: "ok", label: "Al día" };
  }

  function classifyInstallment(item) {
    const balance = installmentBalance(item);
    const paid = numberOf(item.paidAmount);
    if (balance <= 0) return { kind: "ok", label: "Pagada", code: "paid" };

    const due = dateKey(item.dueDate);
    const today = todayKey();
    const tomorrow = addDaysKey(1);

    if (paid > 0 && due && due < today) return { kind: "bad", label: "Parcial vencida", code: "latePartial" };
    if (due && due < today) return { kind: "bad", label: "Atrasada", code: "late" };
    if (paid > 0 && due === today) return { kind: "warn", label: "Parcial hoy", code: "partialToday" };
    if (due === today) return { kind: "warn", label: "Vence hoy", code: "today" };
    if (due === tomorrow) return { kind: "warn", label: "Vence mañana", code: "tomorrow" };
    if (paid > 0) return { kind: "neutral", label: "Pago parcial", code: "partial" };
    return { kind: "neutral", label: "Pendiente", code: "pending" };
  }

  function nextPendingInstallment(installments) {
    const pending = installments
      .filter((item) => installmentBalance(item) > 0)
      .sort((a, b) => String(dateKey(a.dueDate) || "9999-99-99").localeCompare(String(dateKey(b.dueDate) || "9999-99-99")))[0];

    if (!pending) return null;
    const status = classifyInstallment(pending);
    return {
      ...pending,
      label: status.label
    };
  }

  function installmentBalance(item) {
    const amount = numberOf(item.amount);
    const paid = numberOf(item.paidAmount);
    return Math.max(0, amount - paid);
  }

  function normalizeId(value) {
    return String(value || "").replace(/\D/g, "");
  }

  // Acepta tanto DNI solo (7 u 8 dígitos) como CUIL/CUIT completo.
  // Ejemplo: 40451326 coincide con 27-40451326-0.
  function idVariants(value) {
    const digits = normalizeId(value);
    const variants = new Set();
    if (!digits) return variants;

    variants.add(digits);

    // Un CUIL/CUIT tiene prefijo de 2 dígitos y verificador final.
    if (digits.length === 10 || digits.length === 11) {
      const documentNumber = digits.slice(2, -1).replace(/^0+(?=\d)/, "");
      if (documentNumber) variants.add(documentNumber);
    }

    // Normaliza documentos que pudieran venir con ceros a la izquierda.
    if (digits.length <= 8) {
      variants.add(digits.replace(/^0+(?=\d)/, ""));
    }

    return variants;
  }

  function idsMatch(storedValue, enteredValue) {
    const stored = idVariants(storedValue);
    const entered = idVariants(enteredValue);
    return [...entered].some((value) => value && stored.has(value));
  }

  function normalizeCode(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function numberOf(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function money(value) {
    return new Intl.NumberFormat(CONFIG.locale, {
      style: "currency",
      currency: CONFIG.currency,
      maximumFractionDigits: 0
    }).format(numberOf(value));
  }

  function dateKey(value) {
    if (!value) return "";
    const raw = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

    const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slash) {
      const [, d, m, y] = slash;
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return toLocalDateKey(date);
  }

  function todayKey() {
    return toLocalDateKey(new Date());
  }

  function addDaysKey(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return toLocalDateKey(date);
  }

  function toLocalDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDate(value) {
    const key = dateKey(value);
    if (!key) return "-";
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return new Intl.DateTimeFormat(CONFIG.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(date);
  }

  function formatUpdated(value) {
    const raw = value ? new Date(value) : dataLoadedAt;
    const date = raw && !Number.isNaN(raw.getTime()) ? raw : dataLoadedAt;
    if (!date) return "-";
    return new Intl.DateTimeFormat(CONFIG.locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function titleCase(value) {
    return String(value || "")
      .toLocaleLowerCase("es-AR")
      .replace(/(^|\s|\(|-)([\p{L}])/gu, (match, sep, char) => sep + char.toLocaleUpperCase("es-AR"));
  }

  function lastDigits(value) {
    const id = normalizeId(value);
    if (id.length <= 3) return id || "-";
    return `***${id.slice(-3)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showMessage(text, kind) {
    els.message.textContent = text;
    els.message.className = `message ${kind}`;
  }

  function clearForm() {
    els.dni.value = "";
    els.code.value = "";
    els.message.classList.add("hidden");
    els.dni.focus();
  }

  function resetView() {
    els.accountCard.classList.add("hidden");
    els.loginCard.classList.remove("hidden");
    clearForm();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  init();
})();
