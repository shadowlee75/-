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
    guest_id TEXT NOT NULL REFERENCES guest_sessions(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 99),
    UNIQUE (guest_id, product_id)
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    guest_id TEXT NOT NULL REFERENCES guest_sessions(id),
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

async function getCart(db, guestId) {
  const result = await db.prepare(
    `SELECT c.product_id AS productId, c.qty, p.name, p.price, cat.name AS category, p.image_url AS imageUrl,
            (c.qty * p.price) AS lineTotal
     FROM cart_items c JOIN products p ON p.id = c.product_id JOIN categories cat ON cat.id = p.category_id
     WHERE c.guest_id = ? ORDER BY c.id`
  ).bind(guestId).all();
  return { items: result.results, total: calculateTotal(result.results) };
}

async function addToCart(db, guestId, body) {
  const productId = Number(body.productId);
  if (!Number.isInteger(productId) || productId < 1) {
    throw Object.assign(new Error("상품 번호가 올바르지 않습니다."), { code: "INVALID_PRODUCT_ID", status: 400 });
  }
  const qty = normalizeQty(body.qty);
  await getProduct(db, productId);
  const existing = await db.prepare("SELECT qty FROM cart_items WHERE guest_id = ? AND product_id = ?").bind(guestId, productId).first();
  if (existing && existing.qty + qty > 99) {
    throw Object.assign(new Error("장바구니 수량은 99개까지 담을 수 있습니다."), { code: "QTY_LIMIT", status: 400 });
  }
  if (existing) {
    await db.prepare("UPDATE cart_items SET qty = qty + ? WHERE guest_id = ? AND product_id = ?").bind(qty, guestId, productId).run();
  } else {
    await db.prepare("INSERT INTO cart_items (guest_id, product_id, qty) VALUES (?, ?, ?)").bind(guestId, productId, qty).run();
  }
  return getCart(db, guestId);
}

async function updateCart(db, guestId, productId, body) {
  const qty = normalizeQty(body.qty);
  const result = await db.prepare("UPDATE cart_items SET qty = ? WHERE guest_id = ? AND product_id = ?").bind(qty, guestId, productId).run();
  if (!result.meta.changes) throw Object.assign(new Error("장바구니에서 상품을 찾을 수 없습니다."), { code: "CART_ITEM_NOT_FOUND", status: 404 });
  return getCart(db, guestId);
}

function makeOrderNo() {
  const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `ORD-${date}-${suffix}`;
}

async function createOrder(db, guestId) {
  const cart = await getCart(db, guestId);
  if (!cart.items.length) throw Object.assign(new Error("장바구니가 비어 있어 주문할 수 없습니다."), { code: "EMPTY_CART", status: 409 });
  const orderNo = makeOrderNo();
  const createdAt = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO orders (id, guest_id, total, status, created_at)
       SELECT ?, ?, SUM(c.qty * p.price), 'pending', ?
       FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.guest_id = ?`
    ).bind(orderNo, guestId, createdAt, guestId),
    db.prepare(
      `INSERT INTO order_items (order_id, product_id, qty, price)
       SELECT ?, c.product_id, c.qty, p.price
       FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.guest_id = ?`
    ).bind(orderNo, guestId),
    db.prepare("DELETE FROM cart_items WHERE guest_id = ?").bind(guestId)
  ]);
  return getOrder(db, guestId, orderNo);
}

async function getOrder(db, guestId, orderNo) {
  const order = await db.prepare(
    "SELECT id AS orderNo, total, status, created_at AS createdAt FROM orders WHERE id = ? AND guest_id = ?"
  ).bind(orderNo, guestId).first();
  if (!order) throw Object.assign(new Error("주문을 찾을 수 없습니다."), { code: "ORDER_NOT_FOUND", status: 404 });
  const items = await db.prepare(
    `SELECT oi.product_id AS productId, oi.qty, oi.price, p.name, p.image_url AS imageUrl,
            (oi.qty * oi.price) AS lineTotal
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ? ORDER BY oi.id`
  ).bind(orderNo).all();
  return { ...order, items: items.results };
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const headers = new Headers();
  const path = url.pathname.replace(/^\/api\/?/, "");
  const segments = path.split("/").filter(Boolean);

  try {
    await ensureSchema(env.DB);
    const guestId = await getGuestId(request, env.DB, headers);
    if (request.method === "GET" && segments[0] === "products" && segments.length === 1) {
      return json({ products: await listProducts(env.DB, url.searchParams.get("category") || "") }, 200, headers);
    }
    if (request.method === "GET" && segments[0] === "products" && segments.length === 2) {
      const id = Number(segments[1]);
      if (!Number.isInteger(id)) return errorResponse("INVALID_PRODUCT_ID", "상품 번호가 올바르지 않습니다.", 400, headers);
      return json(await getProduct(env.DB, id), 200, headers);
    }
    if (segments[0] === "cart" && segments.length === 1 && request.method === "GET") {
      return json(await getCart(env.DB, guestId), 200, headers);
    }
    if (segments[0] === "cart" && segments.length === 1 && request.method === "POST") {
      return json(await addToCart(env.DB, guestId, await readJson(request)), 200, headers);
    }
    if (segments[0] === "cart" && segments.length === 2 && request.method === "PATCH") {
      const productId = Number(segments[1]);
      if (!Number.isInteger(productId)) return errorResponse("INVALID_PRODUCT_ID", "상품 번호가 올바르지 않습니다.", 400, headers);
      return json(await updateCart(env.DB, guestId, productId, await readJson(request)), 200, headers);
    }
    if (segments[0] === "cart" && segments.length === 2 && request.method === "DELETE") {
      const productId = Number(segments[1]);
      if (!Number.isInteger(productId)) return errorResponse("INVALID_PRODUCT_ID", "상품 번호가 올바르지 않습니다.", 400, headers);
      const result = await env.DB.prepare("DELETE FROM cart_items WHERE guest_id = ? AND product_id = ?").bind(guestId, productId).run();
      if (!result.meta.changes) return errorResponse("CART_ITEM_NOT_FOUND", "장바구니에서 상품을 찾을 수 없습니다.", 404, headers);
      return json(await getCart(env.DB, guestId), 200, headers);
    }
    if (segments[0] === "orders" && segments.length === 1 && request.method === "POST") {
      return json(await createOrder(env.DB, guestId), 201, headers);
    }
    if (segments[0] === "orders" && segments.length === 2 && request.method === "GET") {
      return json(await getOrder(env.DB, guestId, decodeURIComponent(segments[1])), 200, headers);
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
