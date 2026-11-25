import type { CardData } from "../shared/card";
import { encodeCard } from "../shared/link";

/** Erzeugt den Link zu einer Karte. Die Karte steckt vollständig im Link, es wird kein Server gebraucht. */
export function createCardLink(card: CardData): string {
  return `${location.origin}/v/${encodeCard(card)}${location.search}`;
}
