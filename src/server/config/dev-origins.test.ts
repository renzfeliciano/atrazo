import { describe, expect, it } from "vitest";
import { isSameOrigin } from "../http/api-route";
import { extraDevOrigins } from "./dev-origins";

const APP = "http://localhost:6060";
const post = (origin: string, site = "same-origin") =>
  new Request(`${origin}/api/v1/stores`, {
    method: "POST",
    headers: { origin, "sec-fetch-site": site },
  });

describe("development origins", () => {
  it("trusts this computer's Wi-Fi addresses on the app's port, and listed tunnels", () => {
    const origins = extraDevOrigins(APP, "https://atrazo-dev.trycloudflare.com/", ["192.168.1.5"]);
    expect(origins).toEqual([
      "http://192.168.1.5:6060",
      "https://192.168.1.5:6060",
      "https://atrazo-dev.trycloudflare.com",
    ]);
  });

  it("lets a phone on the same Wi-Fi write, and still blocks every other site", () => {
    const extra = extraDevOrigins(APP, "", ["192.168.1.5"]);
    expect(isSameOrigin(post("http://192.168.1.5:6060"), APP, extra)).toBe(true);
    expect(isSameOrigin(post("http://192.168.1.99:6060"), APP, extra)).toBe(false);
    expect(isSameOrigin(post("https://evil.example"), APP, extra)).toBe(false);
    expect(isSameOrigin(post("http://192.168.1.5:6060", "cross-site"), APP, extra)).toBe(false);
  });

  it("without extra origins, only NEXT_PUBLIC_APP_URL is trusted (production)", () => {
    expect(isSameOrigin(post(APP), APP)).toBe(true);
    expect(isSameOrigin(post("http://192.168.1.5:6060"), APP)).toBe(false);
  });
});
