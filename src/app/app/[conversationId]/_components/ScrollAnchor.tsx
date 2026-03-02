"use client";

import { useEffect, useRef } from "react";

/**
 * メッセージリスト末尾に置くと、ページロード・更新時に最下部へスクロールする。
 * router.refresh() 後もマウントし直されるため自動スクロールが走る。
 */
export function ScrollAnchor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "instant" });
  });
  return <div ref={ref} />;
}
