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
  if (!response.ok) throw new Error(body.error?.message || "요청을 처리하지 못했습니다.");
  return body;
}

function currentRoute() {
  const pathname = window.location.pathname.replace(/\/+$/, "") || "/";
  if (pathname === "/") return { name: "home", category: new URLSearchParams(window.location.search).get("category") || "전체" };
  if (pathname === "/cart") return { name: "cart" };
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

async function renderRoute() {
  const token = ++routeRun;
  const route = currentRoute();
  renderLoading();
  try {
    if (route.name === "home") await renderHome(route, token);
    if (route.name === "product") await renderProduct(route, token);
    if (route.name === "cart") await renderCart(token);
    if (route.name === "order") await renderOrder(route, token);
  } catch (error) {
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

document.addEventListener("click", (event) => {
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
