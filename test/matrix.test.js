/**
 * 依存ゼロの Node テスト。実行: `node test/matrix.test.js`
 * matrix.js の厳密有理数演算を検証する（特に A·A⁻¹=I を許容誤差なしで確認）。
 */
"use strict";

// Node では require、ブラウザでは グローバル MatrixMath から取得（単一ソースで両対応）。
const MatrixMath =
  typeof require !== "undefined" ? require("../matrix.js") : globalThis.MatrixMath;
const { Rational, parseRational, invert, formatRational, rationalToDecimalString } = MatrixMath;

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

function assertThrows(name, fn) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  check(name, threw);
}

// ----- ヘルパ -----
const R = (s) => parseRational(String(s));
const mat = (g) => g.map((row) => row.map(R));
const fracs = (M) => M.map((row) => row.map((x) => formatRational(x, "fraction")));

/** 厳密な行列積 */
function mul(A, B) {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out[i] = [];
    for (let j = 0; j < m; j += 1) {
      let sum = Rational.fromInt(0);
      for (let t = 0; t < k; t += 1) sum = sum.add(A[i][t].mul(B[t][j]));
      out[i][j] = sum;
    }
  }
  return out;
}

/** 単位行列か（許容誤差なし） */
function isIdentity(M) {
  const n = M.length;
  for (let i = 0; i < n; i += 1) {
    if (M[i].length !== n) return false;
    for (let j = 0; j < n; j += 1) {
      const expected = i === j ? 1n : 0n;
      if (!M[i][j].equals(Rational.fromInt(Number(expected)))) return false;
    }
  }
  return true;
}

function eqGrid(M, expected) {
  return JSON.stringify(fracs(M)) === JSON.stringify(expected);
}

// 1. 整数逆行列 3×3
{
  const A = mat([[1, 2, 3], [0, 1, 4], [5, 6, 0]]);
  const res = invert(A);
  check("1: 3x3 ok", res.ok);
  check("1: 3x3 inverse", eqGrid(res.inverse, [
    ["-24", "18", "5"],
    ["20", "-15", "-4"],
    ["-5", "4", "1"],
  ]));
  check("1: 3x3 det=1", formatRational(res.determinant, "fraction") === "1");
}

// 2. 分数逆行列 [[2,3],[3,8]] det=7
{
  const A = mat([[2, 3], [3, 8]]);
  const res = invert(A);
  check("2: frac inverse", eqGrid(res.inverse, [["8/7", "-3/7"], ["-3/7", "2/7"]]));
  check("2: det=7", formatRational(res.determinant, "fraction") === "7");
}

// 3. 特異行列
{
  const A = mat([[1, 2], [2, 4]]);
  const res = invert(A);
  check("3: singular ok=false", res.ok === false);
  check("3: singular reason", /列目/.test(res.reason));
  check("3: singular det=0", formatRational(res.determinant, "fraction") === "0");
}

// 4. 2×2 約分 [[4,7],[2,6]] det=10
{
  const A = mat([[4, 7], [2, 6]]);
  const res = invert(A);
  check("4: 2x2 inverse reduced", eqGrid(res.inverse, [["3/5", "-7/10"], ["-1/5", "2/5"]]));
  check("4: 2x2 det=10", formatRational(res.determinant, "fraction") === "10");
}

// 5. 小数厳密
{
  check("5: 0.5 = 1/2", parseRational("0.5").equals(new Rational(1n, 2n)));
  check("5: -2.50 = -5/2", parseRational("-2.50").equals(new Rational(-5n, 2n)));
  check("5: 1.5 = 3/2", parseRational("1.5").equals(new Rational(3n, 2n)));
  check("5: 0.25 = 1/4", parseRational("0.25").equals(new Rational(1n, 4n)));
  const A = mat([["0.5", 0], [0, "0.5"]]);
  const res = invert(A);
  check("5: decimal matrix inverse", eqGrid(res.inverse, [["2", "0"], ["0", "2"]]));
  check("5: decimal det=1/4", formatRational(res.determinant, "fraction") === "1/4");
}

// 6. 行交換の符号 [[0,1],[1,0]] det=-1
{
  const A = mat([[0, 1], [1, 0]]);
  const res = invert(A);
  check("6: swap ok", res.ok);
  check("6: swap inverse", eqGrid(res.inverse, [["0", "1"], ["1", "0"]]));
  check("6: swap det=-1", formatRational(res.determinant, "fraction") === "-1");
}

// 7. 単位行列 in→out 4×4
{
  const I4 = mat([
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]);
  const res = invert(I4);
  check("7: identity inverse = identity", isIdentity(res.inverse));
  check("7: identity det=1", formatRational(res.determinant, "fraction") === "1");
}

// 8. 往復 A·A⁻¹=I を厳密検証（3×3, 4×4）
{
  const A3 = mat([[1, 2, 3], [0, 1, 4], [5, 6, 0]]);
  const r3 = invert(A3);
  check("8: 3x3 A*inv = I", isIdentity(mul(A3, r3.inverse)));

  const A4 = mat([
    [2, 1, 0, 3],
    [1, 0, 2, -1],
    [3, 2, 1, 0],
    [0, 1, -2, 1],
  ]);
  const r4 = invert(A4);
  check("8: 4x4 ok", r4.ok);
  check("8: 4x4 A*inv = I", r4.ok && isIdentity(mul(A4, r4.inverse)));
}

// 9. 分数/ユニコード入力
{
  check("9: 3/4", parseRational("3/4").equals(new Rational(3n, 4n)));
  check("9: -3/4", parseRational("-3/4").equals(new Rational(-3n, 4n)));
  check("9: unicode minus", parseRational("−3/4").equals(new Rational(-3n, 4n)));
  check("9: fullwidth minus", parseRational("－3/4").equals(new Rational(-3n, 4n)));
  check("9: 1.5/2 = 3/4", parseRational("1.5/2").equals(new Rational(3n, 4n)));
}

// 10. 小数整形
{
  check("10: 1/3", rationalToDecimalString(new Rational(1n, 3n)) === "0.3333333333");
  check("10: 2/3 half-up", rationalToDecimalString(new Rational(2n, 3n)) === "0.6666666667");
  check("10: 1/2", rationalToDecimalString(new Rational(1n, 2n)) === "0.5");
  check("10: 0", rationalToDecimalString(new Rational(0n, 1n)) === "0");
  check("10: -5/2", rationalToDecimalString(new Rational(-5n, 2n)) === "-2.5");
  check("10: integer 7", rationalToDecimalString(new Rational(7n, 1n)) === "7");
}

// 追加: パーサ例外と境界
assertThrows("err: 1/2/3", () => parseRational("1/2/3"));
assertThrows("err: abc", () => parseRational("abc"));
assertThrows("err: 1/0", () => parseRational("1/0"));
check("edge: empty = 0", parseRational("").isZero());
check("edge: 1e3 = 1000", parseRational("1e3").equals(new Rational(1000n, 1n)));
check("edge: 2.5e-4 = 1/4000", parseRational("2.5e-4").equals(new Rational(1n, 4000n)));

// ----- 全例題の正則性チェック（潜在バグ検出） -----
const EXAMPLES = {
  2: [[4, 7], [2, 6]],
  3: [[1, 2, 3], [0, 1, 4], [5, 6, 0]],
  4: [[2, 1, 0, 3], [1, 0, 2, -1], [3, 2, 1, 0], [0, 1, -2, 1]],
  5: [
    [1, 0, 2, -1, 3],
    [3, 1, 0, 2, -2],
    [2, -1, 1, 0, 1],
    [0, 2, -3, 1, 4],
    [1, 1, 1, 1, 0],
  ],
  6: [
    [2, 0, 1, 0, 3, -1],
    [1, 1, 0, 2, 0, 4],
    [0, 3, -1, 1, 2, 0],
    [4, 0, 2, -2, 1, 1],
    [1, -1, 3, 0, 0, 2],
    [0, 2, 1, 3, -1, 1],
  ],
};
for (const size of Object.keys(EXAMPLES)) {
  const A = mat(EXAMPLES[size]);
  const res = invert(A);
  check(`example ${size}x${size} invertible`, res.ok);
  if (res.ok) check(`example ${size}x${size} A*inv=I`, isIdentity(mul(A, res.inverse)));
}

// ----- 結果 -----
const summary = `${passed} passed, ${failed} failed`;
console.log(`\n${summary}`);
if (typeof globalThis !== "undefined") globalThis.__TEST__ = { passed, failed, summary };
if (typeof process !== "undefined" && process.exit) process.exit(failed === 0 ? 0 : 1);
