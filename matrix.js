/**
 * matrix.js — 逆行列計算機の中核（DOM 非依存）
 *
 * BigInt による厳密な有理数演算でガウス・ジョルダン法を実行する。
 * 有理数入力に対して常に厳密かつ約分済みの結果を返す。
 *
 * classic script として index.html から `<script src="matrix.js">` で読み込む
 * （ES Modules は file:// でブロックされるため）。グローバル `MatrixMath` を公開し、
 * Node では module.exports でも公開する（test/matrix.test.js 用）。
 */
(function (root) {
  "use strict";

  function gcdBigInt(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a === 0n ? 1n : a;
  }

  /** 不変な有理数。不変条件: den > 0n、gcd(|num|, den) === 1n、ゼロは 0/1。 */
  class Rational {
    constructor(num, den) {
      num = BigInt(num);
      den = BigInt(den);
      if (den === 0n) throw new Error("分母を 0 にはできません。");
      if (den < 0n) {
        num = -num;
        den = -den;
      }
      const g = gcdBigInt(num, den);
      this.num = num / g;
      this.den = den / g;
    }

    static fromInt(n) {
      return new Rational(BigInt(n), 1n);
    }

    add(other) {
      return new Rational(this.num * other.den + other.num * this.den, this.den * other.den);
    }

    sub(other) {
      return new Rational(this.num * other.den - other.num * this.den, this.den * other.den);
    }

    mul(other) {
      return new Rational(this.num * other.num, this.den * other.den);
    }

    div(other) {
      if (other.isZero()) throw new Error("0 で割ることはできません。");
      return new Rational(this.num * other.den, this.den * other.num);
    }

    neg() {
      return new Rational(-this.num, this.den);
    }

    abs() {
      return new Rational(this.num < 0n ? -this.num : this.num, this.den);
    }

    isZero() {
      return this.num === 0n;
    }

    equals(other) {
      return this.num === other.num && this.den === other.den;
    }

    /** this < other → -1, 等しい → 0, this > other → 1（両 den > 0 なので分子比較で可）。 */
    compare(other) {
      const diff = this.num * other.den - other.num * this.den;
      return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    }

    toString() {
      return this.den === 1n ? this.num.toString() : `${this.num}/${this.den}`;
    }
  }

  /**
   * 符号付きの「整数 / 小数 / 指数表記」を厳密に有理数へ変換する内部ヘルパ。
   * Number() を一切使わず桁数から分数を構築するため浮動小数点誤差が出ない。
   * 解釈できない場合は null を返す（呼び出し側で文脈に応じた例外を投げる）。
   */
  function parseSignedRationalToken(str) {
    let s = str.trim();
    if (s === "") return null;

    let sign = 1n;
    if (s[0] === "+" || s[0] === "-") {
      if (s[0] === "-") sign = -1n;
      s = s.slice(1);
    }
    if (s === "") return null;

    // 指数表記: 仮数 e 指数
    const eIndex = s.search(/[eE]/);
    if (eIndex !== -1) {
      const mantissaStr = s.slice(0, eIndex);
      const expStr = s.slice(eIndex + 1);
      if (!/^[+-]?\d+$/.test(expStr)) return null;
      const mantissa = parseDecimalToken(mantissaStr);
      if (mantissa === null) return null;
      const exp = BigInt(expStr);
      const pow = new Rational(10n ** (exp < 0n ? -exp : exp), 1n);
      const scaled = exp < 0n ? mantissa.div(pow) : mantissa.mul(pow);
      return sign === -1n ? scaled.neg() : scaled;
    }

    const dec = parseDecimalToken(s);
    if (dec === null) return null;
    return sign === -1n ? dec.neg() : dec;
  }

  /** 符号なしの整数または小数（"123", "1.5", ".5", "5."）を厳密有理数に。失敗で null。 */
  function parseDecimalToken(s) {
    if (!/^\d*\.?\d*$/.test(s)) return null;
    const dotIndex = s.indexOf(".");
    let intPart;
    let fracPart;
    if (dotIndex === -1) {
      intPart = s;
      fracPart = "";
    } else {
      intPart = s.slice(0, dotIndex);
      fracPart = s.slice(dotIndex + 1);
    }
    if (intPart === "" && fracPart === "") return null; // "." 単体など
    const digits = (intPart === "" ? "0" : intPart) + fracPart;
    const num = BigInt(digits);
    const den = 10n ** BigInt(fracPart.length);
    return new Rational(num, den);
  }

  /**
   * ユーザー入力文字列を厳密な有理数に変換する。
   * 対応: 整数 / 小数 / 分数 a/b / 指数表記。空文字は 0。
   * ユニコード・全角マイナスを正規化。解釈不能なら日本語例外。
   */
  function parseRational(value) {
    const trimmed = String(value).trim().replace(/[−－]/g, "-");
    if (trimmed === "") return Rational.fromInt(0);

    if (trimmed.includes("/")) {
      const parts = trimmed.split("/");
      if (parts.length !== 2) throw new Error(`「${value}」は分数として読み取れません。`);
      const numerator = parseSignedRationalToken(parts[0]);
      const denominator = parseSignedRationalToken(parts[1]);
      if (numerator === null || denominator === null || denominator.isZero()) {
        throw new Error(`「${value}」は分数として読み取れません。`);
      }
      return numerator.div(denominator);
    }

    const parsed = parseSignedRationalToken(trimmed);
    if (parsed === null) throw new Error(`「${value}」は数値として読み取れません。`);
    return parsed;
  }

  /**
   * 厳密ガウス・ジョルダン法で逆行列・行列式を求める。
   * @param {Rational[][]} matrix 正方行列（要素は Rational）
   * @returns {{ok:boolean, determinant:Rational, steps:Object[], inverse?:Rational[][], reason?:string}}
   * steps は描画側で整形するため生の Rational を保持した構造化オブジェクト:
   *   {type:"swap", a, b} / {type:"scale", row, by} / {type:"eliminate", row, factor, pivotRow}
   */
  function invert(matrix) {
    const n = matrix.length;
    const augmented = matrix.map((row, rowIndex) => [
      ...row,
      ...Array.from({ length: n }, (_, colIndex) => Rational.fromInt(rowIndex === colIndex ? 1 : 0)),
    ]);
    const steps = [];
    let determinant = Rational.fromInt(1);
    let swaps = 0;

    for (let col = 0; col < n; col += 1) {
      // 厳密演算では丸め誤差が無いため「絶対値最大」を選ぶ数値的利点はない。
      // col 以降で最初に非ゼロの行をピボットに採る（決定的・最小）。
      let pivotRow = -1;
      for (let row = col; row < n; row += 1) {
        if (!augmented[row][col].isZero()) {
          pivotRow = row;
          break;
        }
      }

      if (pivotRow === -1) {
        return {
          ok: false,
          determinant: Rational.fromInt(0),
          steps,
          reason: `${col + 1}列目で有効なピボットが見つからないため、この行列は逆行列を持ちません。`,
        };
      }

      if (pivotRow !== col) {
        [augmented[col], augmented[pivotRow]] = [augmented[pivotRow], augmented[col]];
        swaps += 1;
        steps.push({ type: "swap", a: col, b: pivotRow });
      }

      const pivotValue = augmented[col][col];
      determinant = determinant.mul(pivotValue);
      for (let j = 0; j < 2 * n; j += 1) {
        augmented[col][j] = augmented[col][j].div(pivotValue);
      }
      steps.push({ type: "scale", row: col, by: pivotValue });

      for (let row = 0; row < n; row += 1) {
        if (row === col) continue;
        const factor = augmented[row][col];
        if (factor.isZero()) continue;
        for (let j = 0; j < 2 * n; j += 1) {
          augmented[row][j] = augmented[row][j].sub(factor.mul(augmented[col][j]));
        }
        steps.push({ type: "eliminate", row, factor, pivotRow: col });
      }
    }

    if (swaps % 2 === 1) determinant = determinant.neg();

    return {
      ok: true,
      determinant,
      steps,
      inverse: augmented.map((row) => row.slice(n)),
    };
  }

  /**
   * 厳密有理数を小数文字列に変換する（BigInt の筆算、四捨五入 half-up）。
   * 末尾ゼロは除去、ゼロは "0"。浮動小数点を経由しない。
   */
  function rationalToDecimalString(r, maxFractionDigits = 10) {
    if (r.isZero()) return "0";
    const negative = r.num < 0n;
    const num = r.num < 0n ? -r.num : r.num;
    const den = r.den;
    const D = BigInt(maxFractionDigits);

    // 1 桁余分に求めて丸める
    const scaled = (num * 10n ** (D + 1n)) / den;
    const lastDigit = scaled % 10n;
    let rounded = scaled / 10n;
    if (lastDigit >= 5n) rounded += 1n;

    const pow = 10n ** D;
    const intPart = rounded / pow;
    let fracDigits = (rounded % pow).toString().padStart(maxFractionDigits, "0");
    fracDigits = fracDigits.replace(/0+$/, "");

    const sign = negative ? "-" : "";
    const body = fracDigits === "" ? intPart.toString() : `${intPart}.${fracDigits}`;
    return body === "0" ? "0" : sign + body;
  }

  /**
   * 表示形式に応じて有理数を整形する（DOM 非参照、mode を引数で受ける）。
   * @param {Rational} r
   * @param {"fraction"|"decimal"} mode
   */
  function formatRational(r, mode) {
    if (mode === "decimal") return rationalToDecimalString(r);
    if (r.den === 1n) return r.num.toString();
    return `${r.num}/${r.den}`;
  }

  const api = { Rational, parseRational, invert, formatRational, rationalToDecimalString };
  root.MatrixMath = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
