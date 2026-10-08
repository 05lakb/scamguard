// Plays the finished test cases back one at a time, as scenes on the stage.
// Results can arrive faster than a scene plays, so they wait in line.

import { useEffect, useRef, useState } from "react";
import type { ArenaRecord } from "../api";
import { scheduleOf } from "./stage";

const TICK = 80;
const FAST = 5; // "skip animation" plays scenes this many times faster

export function usePlayback(records: ArenaRecord[], fast: boolean) {
  const [cursor, setCursor] = useState(0); // scenes fully played
  // The clock remembers which scene it belongs to, so a new scene never starts with the old scene's time.
  const [clock, setClock] = useState({ id: "", time: 0 });
  const speed = useRef(1);
  speed.current = fast ? FAST : 1;
  const record = records[cursor] ?? null;
  const empty = records.length === 0;

  // A new run starts from the beginning.
  useEffect(() => {
    if (empty) {
      setCursor(0);
      setClock({ id: "", time: 0 });
    }
  }, [empty]);

  useEffect(() => {
    if (!record) return;
    const id = record.id;
    let time = 0;
    const end = scheduleOf(record).end;
    const timer = window.setInterval(() => {
      time += TICK * speed.current;
      if (time >= end) {
        window.clearInterval(timer);
        setCursor((old) => old + 1);
      } else {
        setClock({ id, time });
      }
    }, TICK);
    return () => window.clearInterval(timer);
  }, [record?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const elapsed = record && clock.id === record.id ? clock.time : 0;
  return { cursor, elapsed, record };
}
