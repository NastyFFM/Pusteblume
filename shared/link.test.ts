import { describe, expect, it } from "vitest";
import { QUOTES } from "./card";
import { decodeCard, encodeCard } from "./link";

describe("Link-Kodierung", () => {
  it("kodiert eine Vorlage kurz und liefert Text und Autor beim Lesen", () => {
    const encoded = encodeCard({ color: "rosa", message: QUOTES[2]!.text, quote: 2, from: QUOTES[2]!.author });
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded.length).toBeLessThan(40);
    expect(decodeCard(encoded)).toEqual({ color: "rosa", message: QUOTES[2]!.text, quote: 2, from: QUOTES[2]!.author });
  });

  it("kodiert und dekodiert freien Text mit Umlauten und Zeilenumbrüchen verlustfrei", () => {
    const card = { color: "beige" as const, message: "Liebe Grüße!\nAlles Gute 🌹", from: "Jörg" };
    expect(decodeCard(encodeCard(card))).toEqual(card);
  });

  it("lässt den Absender weg, wenn keiner gesetzt ist", () => {
    expect(decodeCard(encodeCard({ color: "red", message: "Hi" }))).toEqual({ color: "red", message: "Hi" });
  });

  it("liest alte Links: gelb wird beige, die Blütenform bleibt erhalten", () => {
    const old = btoa(JSON.stringify({ c: "yellow", m: "x", s: [40, 25, 120, 80] })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeCard(old)).toEqual({ color: "beige", message: "x", shape: { petals: 40, openness: 0.25, spread: 1.2, twist: 0.8 } });
  });

  it("begrenzt manipulierte Formwerte auf den erlaubten Bereich", () => {
    const encoded = btoa(JSON.stringify({ c: "red", m: "x", s: [9999, -50, 500, 70] })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeCard(encoded)).toEqual({ color: "red", message: "x", shape: { petals: 110, openness: 0, spread: 1.4, twist: 0.7 } });
  });

  it("liefert null für kaputte oder manipulierte Links", () => {
    expect(decodeCard("nicht-base64!!")).toBeNull();
    expect(decodeCard(btoa('{"c":"blue","m":"x"}'))).toBeNull();
    expect(decodeCard(btoa('{"c":"red","q":99}'))).toBeNull();
    expect(decodeCard("")).toBeNull();
  });
});
