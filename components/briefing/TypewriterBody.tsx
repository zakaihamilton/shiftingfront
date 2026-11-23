import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import styles from "./BriefingStory.module.css";
import { createTextMeasure, wrapBreakOffsets } from "./briefingWrap";

function sameBreaks(a: number[], b: number[]) {
  return a.length === b.length && a.every((offset, i) => offset === b[i]);
}

export function TypewriterBody({
  text,
  visible,
  live,
}: {
  text: string;
  visible: string;
  live: boolean;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [breaks, setBreaks] = useState<number[]>([]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const { measure, dispose } = createTextMeasure(el);
    const update = () => {
      if (cancelled) return;
      const next = wrapBreakOffsets(text, Math.max(0, el.clientWidth - 1), measure);
      setBreaks((prev) => (sameBreaks(prev, next) ? prev : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    void document.fonts?.ready.then(update);
    return () => {
      cancelled = true;
      observer.disconnect();
      dispose();
    };
  }, [text]);

  const nodes: ReactNode[] = [];
  let last = 0;
  for (const offset of breaks) {
    if (offset > visible.length) break;
    if (offset > last) nodes.push(visible.slice(last, offset));
    nodes.push(<br key={offset} />);
    last = offset;
  }
  if (last < visible.length) nodes.push(visible.slice(last));

  return (
    <p ref={ref} className={styles.body}>
      {nodes}
      <span className={styles.caret}>{live ? "▌" : ""}</span>
    </p>
  );
}
