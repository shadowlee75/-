import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRODUCTS, calculateTotal, normalizeQty } from "../src/index.js";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("SHOP 초기 상품은 8개이며 네 분류와 이미지 파일을 모두 갖는다", () => {
  assert.equal(PRODUCTS.length, 8);
  assert.deepEqual([...new Set(PRODUCTS.map((product) => product.category))].sort(), ["뷰티", "식품", "신발", "잡화"]);
  for (const product of PRODUCTS) {
    assert.equal(typeof product.price, "number");
    assert.ok(product.price > 0);
    assert.match(product.image_url, /^\/products\/[a-z0-9]+\.jpg$/);
    assert.ok(fs.existsSync(path.join(projectRoot, "public", product.image_url.slice(1))));
  }
});

test("합계는 수량 곱의 합으로 계산된다", () => {
  assert.equal(calculateTotal([{ price: 89000, qty: 2 }, { price: 6500, qty: 3 }]), 197500);
});

test("수량은 1부터 99까지 정수만 허용한다", () => {
  assert.equal(normalizeQty(1), 1);
  assert.equal(normalizeQty(99), 99);
  for (const invalid of [0, 100, 1.5, "1", null, undefined]) {
    assert.throws(() => normalizeQty(invalid), /1개 이상 99개 이하/);
  }
});

test("CSS는 DESIGN.md의 허용 색만 사용하고 그림자·그라데이션을 만들지 않는다", () => {
  const css = fs.readFileSync(path.join(projectRoot, "public", "styles.css"), "utf8");
  const allowed = new Set(["#ffffff", "#f0f0f0", "#fafafa", "#f2f4f6", "#232b35", "#474f5a", "#667380", "#acb5bf", "#e0e3e7", "#4269f6", "#ba2d1b"]);
  const colors = [...css.matchAll(/#[0-9a-f]{6}/gi)].map((match) => match[0].toLowerCase());
  assert.deepEqual([...new Set(colors)].sort(), [...allowed].sort());
  assert.doesNotMatch(css, /box-shadow|linear-gradient|radial-gradient/);
  const radii = [...css.matchAll(/border-radius:\s*([^;]+)/g)].map((match) => match[1].trim());
  assert.ok(radii.every((radius) => radius === "4px" || radius === "0"));
});
