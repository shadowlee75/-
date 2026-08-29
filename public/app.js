const app = document.querySelector("#app");
const money = new Intl.NumberFormat("ko-KR");
let routeRun = 0;

function formatWon(value) {
  return `${money.format(Number(value))}원`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
  })[character]);
}

async function api(path, options) {
  const response = await fetch(path, { headers: { accept: "application/json" }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(body.error?.message || "요청을 처리하지 못했습니다."); error.status = response.status; error.code = body.error?.code; throw error; }
  return body;
}

function currentRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/") return { name: "home", category: new URLSearchParams(window.location.search).get("category") || "전체" };
  if (pathname === "/cart") return { name: "cart" };
  if (pathname === "/login") return { name: "login" };
  if (pathname === "/signup") return { name: "signup" };
  if (pathname === "/mypage") return { name: "mypage" };
  if (pathname === "/payment/success") return { name: "payment-success" };
  if (pathname === "/payment/fail") return { name: "payment-fail" };
  if (pathname.startsWith("/product/")) return { name: "product", id: pathname.split("/")[2] };
  if (pathname.startsWith("/order/")) return { name: "order", id: decodeURIComponent(pathname.split("/")[2]) };
  return { name: "home", category: "전체" };
}

function navigate(path) {
  window.history.pushState({}, "", path);
  renderRoute();
}

function setCartCount(count) {
  document.querySelectorAll("[data-cart-count], [data-local-cart-count]").forEach((target) => {
    target.textContent = String(count);
  });
}

async function refreshCartCount() {
  try {
    const cart = await api("/api/cart");
    setCartCount(cart.items.reduce((sum, item) => sum + item.qty, 0));
  } catch {
    setCartCount(0);
  }
}

function renderLoading() {
  app.innerHTML = `<section class="content content--home"><p class="loading">불러오는 중입니다.</p></section>`;
}

function renderError(message) {
  app.innerHTML = `<section class="content content--home"><div class="error-panel">${escapeHtml(message)}</div></section>`;
}

function filterMarkup(active) {
  return ["전체", "잡화", "뷰티", "신발", "식품"].map((category) => `
    <button type="button" class="filter-button${active === category ? " is-active" : ""}" data-category="${category}" aria-pressed="${active === category}">${category}</button>
  `).join("");
}

function productCard(product) {
  return `
    <article class="product-card">
      <a class="product-card__link" href="/product/${product.id}" data-link>
        <img class="product-card__image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}">
        <h2 class="product-card__name">${escapeHtml(product.name)}</h2>
        <p class="product-card__price">${formatWon(product.price)}</p>
      </a>
    </article>
  `;
}

async function renderHome(route, token) {
  const { products } = await api(`/api/products${route.category && route.category !== "전체" ? `?category=${encodeURIComponent(route.category)}` : ""}`);
  if (token !== routeRun) return;
  document.title = route.category === "전체" ? "상품" : route.category;
  app.innerHTML = `
    <section class="content content--home">
      <div class="page-heading-row">
        <h1 class="page-heading">${escapeHtml(route.category === "전체" ? "상품" : route.category)}</h1>
        <a class="outline-button" href="/cart" data-link>장바구니 <span data-local-cart-count>0</span></a>
      </div>
      <nav class="filter-bar" aria-label="상품 분류">${filterMarkup(route.category)}</nav>
      <div class="product-grid">
        ${products.length ? products.map(productCard).join("") : `<div class="empty-state">상품이 없습니다.</div>`}
      </div>
    </section>
  `;
  refreshCartCount();
}

function quantityMarkup(quantity, label) {
  return `
    <div class="quantity-control" aria-label="${escapeHtml(label)} 수량">
      <button type="button" data-action="decrease" aria-label="수량 줄이기"${quantity <= 1 ? " disabled" : ""}>−</button>
      <output>${quantity}</output>
      <button type="button" data-action="increase" aria-label="수량 늘리기"${quantity >= 99 ? " disabled" : ""}>+</button>
    </div>
  `;
}

async function renderProduct(route, token) {
  const product = await api(`/api/products/${encodeURIComponent(route.id)}`);
  if (token !== routeRun) return;
  document.title = product.name;
  app.innerHTML = `
    <section class="content content--detail">
      <div class="sub-navigation">
        <a class="back-link" href="/" data-link>← 상품 목록</a>
        <a class="outline-button" href="/cart" data-link>장바구니 <span data-local-cart-count>0</span></a>
      </div>
      <div class="detail-grid">
        <img class="detail-image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}">
        <div class="detail-info">
          <p class="detail-category">${escapeHtml(product.category)}</p>
          <h1 class="detail-name">${escapeHtml(product.name)}</h1>
          <p class="detail-description">${escapeHtml(product.description)}</p>
          <p class="detail-price">${formatWon(product.price)}</p>
          <span class="quantity-label">수량</span>
          ${quantityMarkup(1, product.name)}
          <button type="button" class="primary-button" data-action="add-to-cart" data-product-id="${product.id}" data-qty="1">장바구니에 담기</button>
          <p class="feedback" data-feedback aria-live="polite"></p>
        </div>
      </div>
    </section>
  `;
  refreshCartCount();
}

function cartItemMarkup(item) {
  return `
    <article class="cart-item" data-cart-item="${item.productId}">
      <img class="cart-item__image" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
      <div class="cart-item__details">
        <h2 class="cart-item__name">${escapeHtml(item.name)}</h2>
        <p class="cart-item__description">${escapeHtml(item.category)}</p>
        <p class="cart-item__price">${formatWon(item.lineTotal)} <small>${item.qty}개</small></p>
        ${quantityMarkup(item.qty, item.name)}
        <button type="button" class="cart-item__delete" data-action="delete-cart" data-product-id="${item.productId}">삭제</button>
      </div>
    </article>
  `;
}

function cartSummary(cart) {
  return `
    <aside class="cart-summary" aria-label="주문 요약">
      <h2>주문 예상 금액</h2>
      <p class="summary-row"><span>상품 금액</span><span>${formatWon(cart.total)}</span></p>
      <p class="summary-total"><span>합계</span><span>${formatWon(cart.total)}</span></p>
      <button type="button" class="primary-button" data-action="create-order">주문하기</button>
    </aside>
  `;
}

async function renderCart(token) {
  const cart = await api("/api/cart");
  if (token !== routeRun) return;
  document.title = "장바구니";
  app.innerHTML = `
    <section class="content content--cart">
      <div class="page-heading-row">
        <h1 class="page-heading">장바구니</h1>
        <a class="outline-button" href="/" data-link>상품 계속 보기</a>
      </div>
      ${cart.items.length ? `
        <div class="cart-layout">
          <div class="cart-list">${cart.items.map(cartItemMarkup).join("")}</div>
          ${cartSummary(cart)}
        </div>
      ` : `<div class="empty-state">장바구니가 비어 있습니다.</div>`}
    </section>
  `;
  setCartCount(cart.items.reduce((sum, item) => sum + item.qty, 0));
}

function orderItemMarkup(item) {
  return `
    <article class="order-item">
      <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}">
      <div>
        <h2 class="order-item__name">${escapeHtml(item.name)}</h2>
        <p class="order-item__line">${formatWon(item.lineTotal)} <small>${item.qty}개</small></p>
      </div>
    </article>
  `;
}

async function renderOrder(route, token) {
  const order = await api(`/api/orders/${encodeURIComponent(route.id)}`);
  if (token !== routeRun) return;
  document.title = "주문 완료";
  app.innerHTML = `
    <section class="content content--order order-complete">
      <h1 class="order-complete__title">주문이 완료되었습니다.</h1>
      <p class="order-number">주문번호 ${escapeHtml(order.orderNo)}</p>
      <p class="order-status">결제 상태: ${order.status === "paid" ? "결제 완료" : "결제 대기"}</p>
      ${order.status === "pending" ? `<button type="button" class="primary-button" data-action="pay-order" data-order-id="${escapeHtml(order.orderNo)}" data-amount="${order.total}">결제하기</button>` : ""}
      <p class="feedback" data-feedback aria-live="polite"></p>
      <div class="order-items">${order.items.map(orderItemMarkup).join("")}</div>
      <p class="order-total"><span>합계</span><span>${formatWon(order.total)}</span></p>
      <div class="order-actions">
        <a class="outline-button" href="/" data-link>상품 목록</a>
        <a class="primary-button" href="/cart" data-link>장바구니</a>
      </div>
    </section>
  `;
  setCartCount(0);
}

async function renderPaymentResult(route) {
  const params = new URLSearchParams(window.location.search);
  if (route.name === "payment-fail") { renderError(params.get("message") || "결제가 취소되었습니다."); return; }
  try { const order = await api("/api/payments/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentKey: params.get("paymentKey"), orderId: params.get("orderId"), amount: Number(params.get("amount")) }) }); navigate("/order/" + encodeURIComponent(order.orderNo)); } catch (e) { renderError(e.message); }
}


function authFormMarkup(mode) {
  const signup = mode === "signup";
  const fields = signup ? '<label>이름<input name="name" type="text" autocomplete="name" required maxlength="80"></label>' : "";
  return '<section class="content content--home"><div class="auth-panel"><h1>' +
    (signup ? "회원가입" : "로그인") +
    '</h1><form class="auth-form" data-auth-form="' + mode + '">' +
    fields +
    '<label>이메일<input name="email" type="email" autocomplete="email" required></label>' +
    '<label>비밀번호<input name="password" type="password" autocomplete="' + (signup ? "new-password" : "current-password") + '" minlength="8" required></label>' +
    '<p class="auth-message" data-auth-message></p><button class="primary-button" type="submit">' +
    (signup ? "가입하기" : "로그인") +
    '</button></form><a class="auth-panel__link" href="/' + (signup ? "login" : "signup") + '" data-link>' +
    (signup ? "로그인으로 이동" : "회원가입으로 이동") + '</a></div></section>';
}

async function renderAuth(route, token) {
  document.title = route.name === "signup" ? "회원가입" : "로그인";
  if (token !== routeRun) return;
  app.innerHTML = authFormMarkup(route.name);
}

async function renderMyPage(token) {
  const result = await api("/api/me");
  if (token !== routeRun) return;
  document.title = "마이페이지";
  const orders = result.orders.length ? result.orders.map((order) =>
    '<div class="profile-order"><a href="/order/' + encodeURIComponent(order.orderNo) + '" data-link>' +
    escapeHtml(order.orderNo) + '</a><span>' + formatWon(order.total) + " · " +
    (order.status === "paid" ? "결제 완료" : "결제 대기") + "</span></div>"
  ).join("") : '<p class="loading">주문 내역이 없습니다.</p>';
  app.innerHTML = '<section class="content content--home"><div class="auth-panel"><h1>마이페이지</h1>' +
    '<div class="profile-row"><span>이름</span><strong>' + escapeHtml(result.user.name) + '</strong></div>' +
    '<div class="profile-row"><span>이메일</span><strong>' + escapeHtml(result.user.email) + '</strong></div>' +
    '<div class="profile-orders"><h2>내 주문</h2>' + orders + '</div></div></section>';
}

async function refreshAuthMenu() {
  const login = document.querySelector("[data-auth-login]");
  const signup = document.querySelector("[data-auth-signup]");
  const mypage = document.querySelector("[data-auth-mypage]");
  const logout = document.querySelector("[data-auth-logout]");
  if (!login || !signup || !mypage || !logout) return;
  try {
    const result = await api("/api/me");
    login.hidden = true;
    signup.hidden = true;
    mypage.hidden = false;
    logout.hidden = false;
    mypage.textContent = result.user.name + "님";
  } catch {
    login.hidden = false;
    signup.hidden = false;
    mypage.hidden = true;
    logout.hidden = true;
  }
}

async function renderRoute() {
  const token = ++routeRun;
  const route = currentRoute();
  renderLoading();
  refreshAuthMenu();
  try {
    if (route.name === "home") await renderHome(route, token);
    if (route.name === "product") await renderProduct(route, token);
    if (route.name === "cart") await renderCart(token);
    if (route.name === "order") await renderOrder(route, token);
    if (route.name === "login" || route.name === "signup") await renderAuth(route, token);
    if (route.name === "mypage") await renderMyPage(token);
    if (route.name === "payment-success" || route.name === "payment-fail") await renderPaymentResult(route);
  } catch (error) {
    if (error.status === 401 && ["cart", "order", "mypage"].includes(route.name)) { navigate("/login"); return; }
    if (token === routeRun) renderError(error.message);
  }
}

function feedback(message, isError = false) {
  const target = document.querySelector("[data-feedback]");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("is-error", isError);
}

async function handleAction(actionTarget) {
  const action = actionTarget.dataset.action;
  if (action === "pay-order") { await payOrder(actionTarget); return; }
  if (action === "add-to-cart") {
    const quantity = Number(actionTarget.closest(".detail-info").querySelector("output")?.textContent || 1);
    try {
      await api("/api/cart", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: Number(actionTarget.dataset.productId), qty: quantity }) });
      feedback("장바구니에 담았습니다.");
      refreshCartCount();
    } catch (error) {
      feedback(error.message, true);
    }
    return;
  }
  if (action === "increase" || action === "decrease") {
    const control = actionTarget.closest(".quantity-control");
    const output = control.querySelector("output");
    const next = Number(output.textContent) + (action === "increase" ? 1 : -1);
    if (next < 1 || next > 99) return;
    output.textContent = String(next);
    control.querySelector("button:first-child").disabled = next <= 1;
    control.querySelector("button:last-child").disabled = next >= 99;
    const cartItem = actionTarget.closest("[data-cart-item]");
    const addButton = actionTarget.closest(".detail-info")?.querySelector("[data-action=add-to-cart]");
    if (addButton) addButton.dataset.qty = String(next);
    if (cartItem) {
      try {
        await api(`/api/cart/${cartItem.dataset.cartItem}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ qty: next }) });
        await renderCart(routeRun);
      } catch (error) {
        renderError(error.message);
      }
    }
    return;
  }
  if (action === "delete-cart") {
    try {
      await api(`/api/cart/${actionTarget.dataset.productId}`, { method: "DELETE" });
      await renderCart(routeRun);
    } catch (error) {
      renderError(error.message);
    }
    return;
  }
  if (action === "create-order") {
    actionTarget.disabled = true;
    try {
      const order = await api("/api/orders", { method: "POST" });
      navigate(`/order/${encodeURIComponent(order.orderNo)}`);
    } catch (error) {
      actionTarget.disabled = false;
      const summary = actionTarget.closest(".cart-summary");
      const target = document.createElement("p");
      target.className = "feedback is-error";
      target.textContent = error.message;
      summary.append(target);
    }
  }
}


async function payOrder(actionTarget) {
  try {
    const config = await api("/api/payments/config");
    if (!config.clientKey || typeof window.TossPayments !== "function") throw new Error("결제 설정을 불러오지 못했습니다.");
    const toss = window.TossPayments(config.clientKey);
    await toss.requestPayment({ method: "CARD", amount: { currency: "KRW", value: Number(actionTarget.dataset.amount) }, orderId: actionTarget.dataset.orderId, orderName: "쇼핑몰 주문", successUrl: location.origin + "/payment/success", failUrl: location.origin + "/payment/fail" });
  } catch (e) { feedback(e.message || "결제창을 열 수 없습니다.", true); }
}

async function handleAuthSubmit(form) {
  const mode = form.dataset.authForm;
  const message = form.querySelector("[data-auth-message]");
  const body = Object.fromEntries(new FormData(form).entries());
  try {
    await api("/api/auth/" + mode, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    navigate(mode === "signup" ? "/mypage" : "/");
  } catch (error) {
    message.textContent = error.message;
  }
}

async function handleLogout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } finally {
    navigate("/login");
  }
}

document.addEventListener("submit", (event) => { const form = event.target.closest("[data-auth-form]"); if (form) { event.preventDefault(); handleAuthSubmit(form); } });
document.addEventListener("click", (event) => {
  if (event.target.closest("[data-auth-logout]")) { handleLogout(); return; }
  const link = event.target.closest("a[data-link]");
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute("href"));
    return;
  }
  const category = event.target.closest("[data-category]");
  if (category) {
    navigate(`/?category=${encodeURIComponent(category.dataset.category)}`);
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action) handleAction(action);
});

window.addEventListener("popstate", renderRoute);
renderRoute();
