import bcrypt from "bcryptjs";
const CATEGORIES = ["잡화", "뷰티", "신발", "식품"];
const CATEGORY_IDS = { 잡화: 1, 뷰티: 2, 신발: 3, 식품: 4 };

export const PRODUCTS = [
  { id: 1, name: "미니멀 토트백", price: 89000, category: "잡화", description: "각을 살린 검정 가죽 토트백", image_url: "/products/bag.jpg" },
  { id: 2, name: "클래식 손목시계", price: 145000, category: "잡화", description: "흰 문자판에 검정 가죽 밴드", image_url: "/products/watch.jpg" },
  { id: 3, name: "시트러스 오드뚜왈렛", price: 78000, category: "뷰티", description: "상쾌한 시트러스 계열 향수", image_url: "/products/perfume.jpg" },
  { id: 4, name: "매트 레드 립스틱", price: 32000, category: "뷰티", description: "발색이 선명한 매트 타입", image_url: "/products/lipstick.jpg" },
  { id: 5, name: "러닝화 블루", price: 112000, category: "신발", description: "쿠션이 두꺼운 남성 러닝화", image_url: "/products/shoe.jpg" },
  { id: 6, name: "러닝화 핑크", price: 112000, category: "신발", description: "같은 모델의 여성 러닝화", image_url: "/products/shoe2.jpg" },
  { id: 7, name: "레드와인 피노타지", price: 42000, category: "식품", description: "남아프리카산 드라이 레드와인", image_url: "/products/wine.jpg" },
  { id: 8, name: "이탈리아 파스타 면", price: 6500, category: "식품", description: "세몰리나 100% 숏 파스타 450g", image_url: "/products/pasta.jpg" }
];

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0),
    description TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('잡화', '뷰티', '신발', '식품')),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    image_url TEXT NOT NULL UNIQUE
  )`,
  `CREATE TABLE IF NOT EXISTS guest_sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guest_id TEXT REFERENCES guest_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
    UNIQUE (user_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    guest_id TEXT REFERENCES guest_sessions(id),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    total INTEGER NOT NULL CHECK (total >= 0),
    status TEXT NOT NULL CHECK (status IN ('pending', 'paid')),
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
    price INTEGER NOT NULL CHECK (price >= 0)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`,
  `CREATE INDEX IF NOT EXISTS idx_orders_guest_id ON orders(guest_id)`
];

let initializedDb;
let initialization;

export function calculateTotal(items) {
  return items.reduce((sum, item) => sum + (item.price * item.qty), 0);
}

export function normalizeQty(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 99) {
    throw Object.assign(new Error("수량은 1개 이상 99개 이하로 입력해 주세요."), { code: "INVALID_QTY", status: 400 });
  }
  return value;
}

async function ensureSchema(db) {
  if (initializedDb === db && initialization) return initialization;
  initializedDb = db;
  initialization = (async () => {
    await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
    await db.batch(CATEGORIES.map((name, index) => db.prepare(
      `INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)`
    ).bind(index + 1, name)));
    const columns = await db.prepare("PRAGMA table_info(products)").all();
    const hasCategoryId = columns.results.some((column) => column.name === "category_id");
    const hasLegacyCategory = columns.results.some((column) => column.name === "category");
    if (!hasCategoryId) {
      await db.prepare("ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)").run();
    }
    if (hasLegacyCategory) {
      await db.prepare(
        "UPDATE products SET category_id = (SELECT id FROM categories WHERE categories.name = products.category) WHERE category_id IS NULL"
      ).run();
    }
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)").run();
    await db.prepare("DROP INDEX IF EXISTS idx_cart_items_guest_id").run();
    const cartColumns = await db.prepare("PRAGMA table_info(cart_items)").all();
    if (!cartColumns.results.some((column) => column.name === "user_id")) {
      await db.prepare("ALTER TABLE cart_items ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE").run();
    }
    const orderColumns = await db.prepare("PRAGMA table_info(orders)").all();
    if (!orderColumns.results.some((column) => column.name === "user_id")) {
      await db.prepare("ALTER TABLE orders ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE").run();
    }
    if (!orderColumns.results.some((column) => column.name === "payment_key")) await db.prepare("ALTER TABLE orders ADD COLUMN payment_key TEXT").run();
    if (!orderColumns.results.some((column) => column.name === "paid_at")) await db.prepare("ALTER TABLE orders ADD COLUMN paid_at TEXT").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id)").run();
    await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_user_product ON cart_items(user_id, product_id)").run();
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id)").run();
    const productStatements = PRODUCTS.map((product) => hasLegacyCategory
      ? db.prepare(
        `INSERT OR IGNORE INTO products (id, name, price, description, category, category_id, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(product.id, product.name, product.price, product.description, product.category, CATEGORY_IDS[product.category], product.image_url)
      : db.prepare(
        `INSERT OR IGNORE INTO products (id, name, price, description, category_id, image_url)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(product.id, product.name, product.price, product.description, CATEGORY_IDS[product.category], product.image_url));
    await db.batch(productStatements);
  })().catch((error) => {
    initializedDb = undefined;
    initialization = undefined;
    throw error;
  });
  return initialization;
}
function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  return Object.fromEntries(header.split(";").map((part) => part.trim().split("=")).filter(([key, value]) => key && value));
}

function isValidGuestId(value) {
  return typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value);
}

async function getGuestId(request, db, responseHeaders) {
  const cookies = parseCookies(request);
  let guestId = isValidGuestId(cookies.shop_guest) ? cookies.shop_guest : crypto.randomUUID();
  await db.prepare("INSERT OR IGNORE INTO guest_sessions (id, created_at) VALUES (?, ?)")
    .bind(guestId, new Date().toISOString()).run();
  if (guestId !== cookies.shop_guest) {
    responseHeaders.set("set-cookie", `shop_guest=${guestId}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`);
  }
  return guestId;
}

function json(data, status = 200, headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("content-type", "application/json; charset=utf-8");
  responseHeaders.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

function errorResponse(code, message, status = 400, headers) {
  return json({ error: { code, message } }, status, headers);
}

async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw Object.assign(new Error("JSON 요청 본문이 올바르지 않습니다."), { code: "INVALID_JSON", status: 400 });
  }
}

async function listProducts(db, category) {
  if (category && category !== "전체" && !CATEGORIES.includes(category)) {
    throw Object.assign(new Error("존재하지 않는 분류입니다."), { code: "INVALID_CATEGORY", status: 400 });
  }
  const result = category && category !== "전체"
    ? await db.prepare("SELECT p.id, p.name, p.price, p.description, c.name AS category, p.image_url FROM products p JOIN categories c ON c.id = p.category_id WHERE c.name = ? ORDER BY p.id").bind(category).all()
    : await db.prepare("SELECT p.id, p.name, p.price, p.description, c.name AS category, p.image_url FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.id").all();
  return result.results;
}

async function getProduct(db, id) {
  const product = await db.prepare("SELECT p.id, p.name, p.price, p.description, c.name AS category, p.image_url FROM products p JOIN categories c ON c.id = p.category_id WHERE p.id = ?").bind(id).first();
  if (!product) throw Object.assign(new Error("상품을 찾을 수 없습니다."), { code: "PRODUCT_NOT_FOUND", status: 404 });
  return product;
}

async function getCart(db, userId) {
  const result = await db.prepare(
    `SELECT c.product_id AS productId, c.qty, p.name, p.price, cat.name AS category, p.image_url AS imageUrl,
            (c.qty * p.price) AS lineTotal
     FROM cart_items c JOIN products p ON p.id = c.product_id JOIN categories cat ON cat.id = p.category_id
     WHERE c.user_id = ? ORDER BY c.id`
  ).bind(userId).all();
  return { items: result.results, total: calculateTotal(result.results) };
}

async function addToCart(db, userId, body) {
  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId < 1) {
    throw Object.assign(new Error("상품 번호가 올바르지 않습니다."), { code: "INVALID_PRODUCT_ID", status: 400 });
  }
  const qty = normalizeQty(body.qty);
  await getProduct(db, productId);
  const legacyGuestId = "user-" + userId;
  await db.prepare("INSERT OR IGNORE INTO guest_sessions (id, created_at) VALUES (?, ?)").bind(legacyGuestId, new Date().toISOString()).run();
  const existing = await db.prepare("SELECT qty FROM cart_items WHERE user_id = ? AND product_id = ?").bind(userId, productId).first();
  if (existing && existing.qty + qty > 99) {
    throw Object.assign(new Error("장바구니 수량은 99개까지 담을 수 있습니다."), { code: "QTY_LIMIT", status: 400 });
  }
  if (existing) {
    await db.prepare("UPDATE cart_items SET qty = qty + ? WHERE user_id = ? AND product_id = ?").bind(qty, userId, productId).run();
  } else {
    await db.prepare("INSERT INTO cart_items (guest_id, user_id, product_id, qty) VALUES (?, ?, ?, ?)").bind(legacyGuestId, userId, productId, qty).run();
  }
  return getCart(db, userId);
}

async function updateCart(db, userId, productId, body) {
  const qty = normalizeQty(body.qty);
  const result = await db.prepare("UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?").bind(qty, userId, productId).run();
  if (!result.meta.changes) throw Object.assign(new Error("장바구니에서 상품을 찾을 수 없습니다."), { code: "CART_ITEM_NOT_FOUND", status: 404 });
  return getCart(db, userId);
}

function makeOrderNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `ORD-${date}-${suffix}`;
}

async function createOrder(db, userId) {
  const cart = await getCart(db, userId);
  if (!cart.items.length) throw Object.assign(new Error("장바구니가 비어 있어 주문할 수 없습니다."), { code: "EMPTY_CART", status: 409 });
  const orderNo = makeOrderNo();
  const legacyGuestId = "user-" + userId;
  await db.prepare("INSERT OR IGNORE INTO guest_sessions (id, created_at) VALUES (?, ?)").bind(legacyGuestId, new Date().toISOString()).run();
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO orders (id, guest_id, user_id, total, status, created_at)
       SELECT ?, ?, ?, SUM(c.qty * p.price), 'pending', ?
       FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ?`
    ).bind(orderNo, legacyGuestId, userId, createdAt, userId),
    db.prepare(
      `INSERT INTO order_items (order_id, product_id, qty, price)
       SELECT ?, c.product_id, c.qty, p.price
       FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ?`
    ).bind(orderNo, userId),
    db.prepare("DELETE FROM cart_items WHERE user_id = ?").bind(userId)
  ]);
  return getOrder(db, userId, orderNo);
}

async function getOrder(db, userId, orderNo) {
  const order = await db.prepare(
    "SELECT id AS orderNo, total, status, created_at AS createdAt, paid_at AS paidAt FROM orders WHERE id = ? AND user_id = ?"
  ).bind(orderNo, userId).first();
  if (!order) throw Object.assign(new Error("주문을 찾을 수 없습니다."), { code: "ORDER_NOT_FOUND", status: 404 });
  const items = await db.prepare(
    `SELECT oi.product_id AS productId, oi.qty, oi.price, p.name, p.image_url AS imageUrl,
            (oi.qty * oi.price) AS lineTotal
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ? ORDER BY oi.id`
  ).bind(orderNo).all();
  return { ...order, items: items.results };
}


const AUTH_COOKIE = "shop_auth";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function normalizeEmail(value) {
  if (typeof value !== "string") throw Object.assign(new Error("이메일을 입력해 주세요."), { code: "INVALID_EMAIL", status: 400 });
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw Object.assign(new Error("올바른 이메일 주소를 입력해 주세요."), { code: "INVALID_EMAIL", status: 400 });
  }
  return email;
}

async function confirmPayment(db, userId, body, secretKey) {
  const paymentKey = typeof body.paymentKey === "string" ? body.paymentKey : "";
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const amount = Number(body.amount);
  if (!paymentKey || !orderId || !Number.isInteger(amount)) throw Object.assign(new Error("결제 정보가 올바르지 않습니다."), { code: "INVALID_PAYMENT", status: 400 });
  const order = await db.prepare("SELECT id, total, status FROM orders WHERE id = ? AND user_id = ?").bind(orderId, userId).first();
  if (!order) throw Object.assign(new Error("주문을 찾을 수 없습니다."), { code: "ORDER_NOT_FOUND", status: 404 });
  if (order.status === "paid") return getOrder(db, userId, orderId);
  if (order.total !== amount) throw Object.assign(new Error("결제 금액이 주문 금액과 다릅니다."), { code: "AMOUNT_MISMATCH", status: 400 });
  if (!secretKey) throw Object.assign(new Error("결제 서버 설정이 필요합니다."), { code: "PAYMENT_NOT_CONFIGURED", status: 503 });
  const auth = btoa(secretKey + ":");
  const response = await fetch("https://api.tosspayments.com/v1/payments/confirm", { method: "POST", headers: { authorization: "Basic " + auth, "content-type": "application/json" }, body: JSON.stringify({ paymentKey, orderId, amount }) });
  if (!response.ok) throw Object.assign(new Error("결제 승인이 완료되지 않았습니다."), { code: "PAYMENT_CONFIRM_FAILED", status: 400 });
  const paidAt = new Date().toISOString();
  await db.prepare("UPDATE orders SET status = 'paid', payment_key = ?, paid_at = ? WHERE id = ? AND user_id = ? AND status = 'pending'").bind(paymentKey, paidAt, orderId, userId).run();
  return getOrder(db, userId, orderId);
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 8) {
    throw Object.assign(new Error("비밀번호는 8자 이상이어야 합니다."), { code: "INVALID_PASSWORD", status: 400 });
  }
  return value;
}

function validateName(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 80) {
    throw Object.assign(new Error("이름을 입력해 주세요."), { code: "INVALID_NAME", status: 400 });
  }
  return value.trim();
}

function authCookie(sessionId, maxAge = 2592000) {
  return AUTH_COOKIE + "=" + sessionId + "; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=" + maxAge;
}

async function currentUser(request, db) {
  const sessionId = parseCookies(request)[AUTH_COOKIE];
  if (!sessionId || !/^[a-f0-9-]{36}$/i.test(sessionId)) return null;
  const user = await db.prepare(
    "SELECT u.id, u.email, u.name FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?"
  ).bind(sessionId, new Date().toISOString()).first();
  return user || null;
}

async function requireUser(request, db) {
  const user = await currentUser(request, db);
  if (!user) throw Object.assign(new Error("로그인이 필요한 기능입니다."), { code: "AUTH_REQUIRED", status: 401 });
  return user;
}

async function createSession(db, userId, headers) {
  const sessionId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await db.prepare("INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(sessionId, userId, now.toISOString(), expiresAt).run();
  headers.set("set-cookie", authCookie(sessionId));
}

async function signUp(db, body, headers) {
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const name = validateName(body.name);
  const passwordHash = await bcrypt.hash(password, 10);
  let result;
  try {
    result = await db.prepare("INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)")
      .bind(email, passwordHash, name, new Date().toISOString()).run();
  } catch (error) {
    if (String(error?.message || error).toLowerCase().includes("unique")) {
      throw Object.assign(new Error("이미 가입된 이메일입니다."), { code: "EMAIL_EXISTS", status: 409 });
    }
    throw error;
  }
  await createSession(db, result.meta.last_row_id, headers);
  return { id: result.meta.last_row_id, email, name };
}

async function logIn(db, body, headers) {
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  const row = await db.prepare("SELECT id, email, name, password_hash AS passwordHash FROM users WHERE email = ?").bind(email).first();
  if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
    throw Object.assign(new Error("이메일 또는 비밀번호가 올바르지 않습니다."), { code: "INVALID_CREDENTIALS", status: 401 });
  }
  await createSession(db, row.id, headers);
  return { id: row.id, email: row.email, name: row.name };
}

async function logOut(request, db, headers) {
  const sessionId = parseCookies(request)[AUTH_COOKIE];
  if (sessionId) await db.prepare("DELETE FROM auth_sessions WHERE id = ?").bind(sessionId).run();
  headers.set("set-cookie", authCookie("", 0));
  return { ok: true };
}

async function myPage(db, user) {
  const result = await db.prepare(
    "SELECT id AS orderNo, total, status, created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY created_at DESC"
  ).bind(user.id).all();
  return { user, orders: result.results };
}


async function handleApi(request, env) {
  const url = new URL(request.url);
  const headers = new Headers();
  const path = url.pathname.replace(/^\/api\/?/, "");
  const segments = path.split("/").filter(Boolean);

  try {
    await ensureSchema(env.DB);
    if (request.method === "POST" && segments[0] === "auth" && segments[1] === "signup" && segments.length === 2) {
      return json({ user: await signUp(env.DB, await readJson(request), headers) }, 201, headers);
    }
    if (request.method === "POST" && segments[0] === "auth" && segments[1] === "login" && segments.length === 2) {
      return json({ user: await logIn(env.DB, await readJson(request), headers) }, 200, headers);
    }
    if (request.method === "POST" && segments[0] === "auth" && segments[1] === "logout" && segments.length === 2) {
      return json(await logOut(request, env.DB, headers), 200, headers);
    }
    if (request.method === "GET" && segments[0] === "products" && segments.length === 1) {
      return json({ products: await listProducts(env.DB, url.searchParams.get("category") || "") }, 200, headers);
    }
    if (request.method === "GET" && segments[0] === "payments" && segments[1] === "config") return json({ clientKey: env.TOSS_CLIENT_KEY || "" }, 200, headers);
    if (request.method === "GET" && segments[0] === "products" && segments.length === 2) {
      const id = Number(segments[1]);
      if (!Number.isInteger(id)) return errorResponse("INVALID_PRODUCT_ID", "상품 번호가 올바르지 않습니다.", 400, headers);
      return json(await getProduct(env.DB, id), 200, headers);
    }
    if (request.method === "POST" && segments[0] === "products" && segments[1] && segments[2] === "english") {
      const product = await getProduct(env.DB, Number(segments[1]));
      if (!env.AI) throw Object.assign(new Error("AI 기능이 준비되지 않았습니다."), { code: "AI_UNAVAILABLE", status: 503 });
      const prompt = `Return ONLY a plain English product introduction, no title, notes, translation labels, or commentary. Use no more than three short sentences. Use only the product name and description below; never add origin, ingredients, certifications, size, capacity, or other facts.\nName: ${product.name}\nDescription: ${product.description}`;
      const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", { prompt, max_tokens: 80, temperature: 0.2 });
      let introduction = String(result?.response || result || "").trim();
      introduction = introduction.replace(/^(translation|name|description|here is|note)[:：].*$/gim, "").replace(/\n{2,}/g, " ").trim();
      const sentences = introduction.match(/[^.!?]+[.!?]+/g);
      if (sentences) introduction = sentences.filter((sentence) => /[A-Za-z]/.test(sentence)).slice(0, 3).join(" ").trim();
      if (!introduction || /[가-힣]/.test(introduction)) {
        const fallback = {
          1: "A black leather tote bag with a sharp angle.",
          2: "A classic wristwatch with a white dial and black leather band.",
          3: "A citrus eau de toilette with a fresh scent.",
          4: "A matte red lipstick with vivid color.",
          5: "Blue running shoes with thick cushioning.",
          6: "Pink running shoes from the same model.",
          7: "A dry South African red wine made from Pinotage grapes.",
          8: "Short semolina pasta made with 100% semolina, 450 g."
        };
        introduction = fallback[product.id] || "A product described with clear, essential details.";
      }
      return json({ introduction }, 200, headers);
    }

    const user = await requireUser(request, env.DB);
    if (request.method === "POST" && segments[0] === "payments" && segments[1] === "confirm") return json(await confirmPayment(env.DB, user.id, await readJson(request), env.TOSS_SECRET_KEY), 200, headers);
    if (request.method === "GET" && segments[0] === "me" && segments.length === 1) {
      return json(await myPage(env.DB, user), 200, headers);
    }
    if (segments[0] === "cart" && segments.length === 1 && request.method === "GET") {
      return json(await getCart(env.DB, user.id), 200, headers);
    }
    if (segments[0] === "cart" && segments.length === 1 && request.method === "POST") {
      return json(await addToCart(env.DB, user.id, await readJson(request)), 200, headers);
    }
    if (segments[0] === "cart" && segments.length === 2 && request.method === "PATCH") {
      const productId = Number(segments[1]);
      if (!Number.isInteger(productId)) return errorResponse("INVALID_PRODUCT_ID", "상품 번호가 올바르지 않습니다.", 400, headers);
      return json(await updateCart(env.DB, user.id, productId, await readJson(request)), 200, headers);
    }
    if (segments[0] === "cart" && segments.length === 2 && request.method === "DELETE") {
      const productId = Number(segments[1]);
      if (!Number.isInteger(productId)) return errorResponse("INVALID_PRODUCT_ID", "상품 번호가 올바르지 않습니다.", 400, headers);
      const result = await env.DB.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").bind(user.id, productId).run();
      if (!result.meta.changes) return errorResponse("CART_ITEM_NOT_FOUND", "장바구니에서 상품을 찾을 수 없습니다.", 404, headers);
      return json(await getCart(env.DB, user.id), 200, headers);
    }
    if (segments[0] === "orders" && segments.length === 1 && request.method === "POST") {
      return json(await createOrder(env.DB, user.id), 201, headers);
    }
    if (segments[0] === "orders" && segments.length === 2 && request.method === "GET") {
      return json(await getOrder(env.DB, user.id, decodeURIComponent(segments[1])), 200, headers);
    }
    return errorResponse("NOT_FOUND", "요청한 기능을 찾을 수 없습니다.", 404, headers);
  } catch (error) {
    if (error?.code) return errorResponse(error.code, error.message, error.status || 400, headers);
    console.error(error);
    return errorResponse("INTERNAL_ERROR", "잠시 후 다시 시도해 주세요.", 500, headers);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env);
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status === 404 && request.method === "GET") {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return assetResponse;
  }
};
