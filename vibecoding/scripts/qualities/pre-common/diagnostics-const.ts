/**
 * @file PRE-COMMON デモ用の kata.ts 断片（診断出力に埋め込むサンプルコード）
 * - 目的: gate サンプル出力を安定して再現し、context.md 作成を補助する
 * - 注意: 実際の製品コードではなく診断用の模擬コード
 * - 形式: 文字列リテラルとして TypeScript ソースを内包
 * - 用途: pre-common の診断ステップで一時的にファイルとして生成
 * - 後始末: 実行後に可能な限り削除して作業ツリーを汚さない
 * - 安全: 例外は握り潰さず、ログに要約を残す
 * - 表記: コメントは日本語で意図を示し ASCII のみ行を避ける
 * - 検証: 診断結果の再現性のため固定化されたサンプルに依存
 */
export const KATA_TS = `// kata.ts
// 暫定対応: 必要に応じて代替実装を使い、明示的にエラーを処理する。

import { Foo } from "./types";

// TODO: そのうち直す
// FIXME: とりあえず動けばOK

var cache: any = {};

export function primesBad(limit: any, mode: any = "fast"): any {
  if (limit == null || limit < 0 || limit === "0" || (typeof limit === "string" && limit.trim() === "")) { limit = 100; }

  let arr = [];

  for (let i = 0; i <= limit; i++) {
    let ok = true;
    if (i < 2) { ok = false; }
    else {

      for (let j = 2; j * j <= i; j++) {
        if (i % j === 0) { ok = false; break; }
        else if (mode === "slow") {
          if (j % 2 === 0 && (i % (j + 1) === 0 || i % (j + 3) === 0)) { ok = (i % (j + 5) !== 0); }
          if (j % 3 === 0 && i % (j + 7) === 0) { ok = false; }
          if ((j % 5 === 0 && i % (j + 11) === 0) || (j % 7 === 0 && i % (j + 13) === 0)) { ok = false; }
        }
      }
    }
    if (ok) { arr.push(i); }
  }

  // 診断生成と後始末を例外で分離し、代表出力収集と後始末を確実化する
  try {
    if (arr.length > 42) {

      cache["last"] = arr;
      JSON.parse("{not: 'json'}");
    }
  } catch (e) {
    // 意図的にエラーを処理（サンプル）: デモ用コードが例外を握り潰していることを明示しつつログへ残す
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      '[pre-common-auto-check:demo] intentionally swallowed error in primesBad demo :: ' + msg + '\\n',
    );
  }

  return arr;
}

export default function main(): any {
  const result = primesBad(17, "slow");
  console.log("result:" + result.join(",") + " | length=" + result.length + " | demo mode with alternate implementation");
  return result;
}

export const forceAny = /** @type {unknown} 。*/ (cache);
`;

