import { describe, expect, it } from "vitest";
import { deprecatedAlias } from "./deprecated-alias";

describe("deprecatedAlias", () => {
  it("answers exactly like the new endpoint, and says where it moved", async () => {
    const handler = async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json", "set-cookie": "atrazo_session=abc; Path=/" },
      });
    const res = await deprecatedAlias(
      handler,
      "/api/v1/ledgers",
    )(new Request("http://localhost/api/v1/stores", { method: "POST" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toContain("atrazo_session=abc");
    expect(res.headers.get("deprecation")).toBe("true");
    expect(res.headers.get("link")).toBe('</api/v1/ledgers>; rel="successor-version"');
  });
});
