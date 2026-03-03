"use client";

import { useEffect, useRef } from "react";

/**
 * メッセージリスト末尾に置くと、メッセージが増えたときだけ最下部へスクロールする。
 *
 * scrollTrigger: messages.length を渡す。
 *   - 依存配列を [scrollTrigger] にすることで「メッセージ件数が変化したとき」だけ発火する。
 *   - 依存配列なし（毎レンダー）にすると router.refresh() や isPending 変化のたびに
 *     強制スクロールされ、ユーザーが上に戻れなくなるため使ってはいけない。
 *
 * behavior:
 *   - 初回マウント（ページロード時）: instant で既存メッセージ末尾へジャンプ
 *   - 以降（新規メッセージ追加時）: smooth でアニメーション
 */
export function ScrollAnchor({ scrollTrigger }: { scrollTrigger: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const isFirst = useRef(true);

  useEffect(() => {
    const behavior: ScrollBehavior = isFirst.current ? "instant" : "smooth";
    isFirst.current = false;
    ref.current?.scrollIntoView({ behavior });
  }, [scrollTrigger]); // ← scrollTrigger (= messages.length) が増えたときだけ実行

  return <div ref={ref} />;
}
