import { beforeEach, describe, expect, it } from "vitest";
import type { StoredCard } from "../../shared/card";
import { handleCardsRequest } from "../handlers";
import { _setStoreForTests, type CardStore } from "../store";

function memoryStore(): CardStore {
  const map = new Map<string, StoredCard>();
  return {
    async get(id) {
      return map.get(id) ?? null;
    },
    async put(card) {
      map.set(card.id, card);
    },
    async has(id) {
      return map.has(id);
    },
  };
}

const origin = "https://pusteblume.test";

describe("api/cards", () => {
  beforeEach(() => _setStoreForTests(memoryStore()));

  it("erstellt eine Karte und liefert sie unter dem Kurzlink zurück", async () => {
    const created = await handleCardsRequest({
      method: "POST",
      pathname: "/api/cards",
      body: JSON.stringify({ color: "red", message: "  Hallo Welt \r\nZeile 2 ", from: "Anna" }),
      origin,
    });
    expect(created.status).toBe(201);
    const { id, url } = created.body as { id: string; url: string };
    expect(url).toBe(`${origin}/c/${id}`);

    const read = await handleCardsRequest({ method: "GET", pathname: `/api/cards/${id}`, body: "", origin });
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ id, color: "red", message: "Hallo Welt \nZeile 2", from: "Anna" });
  });

  it("lehnt ungültige Eingaben ab", async () => {
    const cases = [
      { color: "blue", message: "x" },
      { color: "red", message: "" },
      { color: "red", message: "x".repeat(401) },
      { color: "red", message: "ok", from: "y".repeat(61) },
    ];
    for (const body of cases) {
      const res = await handleCardsRequest({ method: "POST", pathname: "/api/cards", body: JSON.stringify(body), origin });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const broken = await handleCardsRequest({ method: "POST", pathname: "/api/cards", body: "{nope", origin });
    expect(broken.status).toBe(400);
  });

  it("antwortet 404 für unbekannte Karten und 400 für kaputte IDs", async () => {
    expect((await handleCardsRequest({ method: "GET", pathname: "/api/cards/abcdefg", body: "", origin })).status).toBe(404);
    expect((await handleCardsRequest({ method: "GET", pathname: "/api/cards/../x", body: "", origin })).status).toBe(404);
    expect((await handleCardsRequest({ method: "GET", pathname: "/api/cards/a", body: "", origin })).status).toBe(400);
  });

  it("nutzt PUBLIC_BASE_URL für den Link, wenn gesetzt", async () => {
    process.env.PUBLIC_BASE_URL = "https://karte.example/";
    try {
      const res = await handleCardsRequest({ method: "POST", pathname: "/api/cards", body: JSON.stringify({ color: "white", message: "hi" }), origin });
      expect((res.body as { url: string }).url).toMatch(/^https:\/\/karte\.example\/c\/[23456789a-zA-Z]{7}$/);
    } finally {
      delete process.env.PUBLIC_BASE_URL;
    }
  });
});
