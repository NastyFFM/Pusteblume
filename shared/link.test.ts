import { describe, expect, it } from "vitest";
import { decodeCard, encodeCard } from "./link";

describe("Link-Kodierung", () => {
  it("kodiert und dekodiert eine Karte mit Umlauten und Zeilenumbrüchen verlustfrei", () => {
    const card = { color: "yellow" as const, message: "Liebe Grüße!\nAlles Gute 🌹", from: "Jörg" };
    const encoded = encodeCard(card);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCard(encoded)).toEqual(card);
  });

  it("lässt den Absender weg, wenn keiner gesetzt ist", () => {
    expect(decodeCard(encodeCard({ color: "red", message: "Hi" }))).toEqual({ color: "red", message: "Hi" });
  });

  it("trägt die Blütenform mit und lässt die Standardform weg", () => {
    const shaped = { color: "red" as const, message: "Hi", shape: { petals: 40, openness: 0.25, spread: 1.2, twist: 0.8 } };
    expect(decodeCard(encodeCard(shaped))).toEqual(shaped);
    const standard = { color: "red" as const, message: "Hi", shape: { petals: 74, openness: 1, spread: 1, twist: 0.5 } };
    expect(decodeCard(encodeCard(standard))).toEqual({ color: "red", message: "Hi" });
    expect(encodeCard(standard).length).toBeGreaterThan(encodeCard({ color: "red", message: "Hi" }).length); // s wird kodiert …
  });

  it("begrenzt manipulierte Formwerte auf den erlaubten Bereich", () => {
    const encoded = btoa(JSON.stringify({ c: "red", m: "x", s: [9999, -50, 500, 70] })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeCard(encoded)).toEqual({ color: "red", message: "x", shape: { petals: 110, openness: 0, spread: 1.4, twist: 0.7 } });
  });

  it("liefert null für kaputte oder manipulierte Links", () => {
    expect(decodeCard("nicht-base64!!")).toBeNull();
    expect(decodeCard(btoa('{"c":"blue","m":"x"}'))).toBeNull();
    expect(decodeCard("")).toBeNull();
  });
});
