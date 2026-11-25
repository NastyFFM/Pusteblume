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

  it("liefert null für kaputte oder manipulierte Links", () => {
    expect(decodeCard("nicht-base64!!")).toBeNull();
    expect(decodeCard(btoa('{"c":"blue","m":"x"}'))).toBeNull();
    expect(decodeCard("")).toBeNull();
  });
});
