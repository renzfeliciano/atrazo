import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  formatRecoveryCode,
  generateRecoveryCode,
  parseRecoveryCode,
  recoveryCodeBytes,
  recoveryCodeFromBytes,
  recoveryCodeGroups,
} from "./recovery-code";

const rng = (a: Uint8Array) => crypto.getRandomValues(a);

describe("recovery code", () => {
  it("is 25 Crockford base32 characters in five groups", () => {
    const code = generateRecoveryCode(rng);
    expect(code).toHaveLength(CODE_LENGTH);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{25}$/);
    expect(formatRecoveryCode(code)).toMatch(/^([0-9A-Z]{5}-){4}[0-9A-Z]{5}$/);
    expect(recoveryCodeGroups(code)).toHaveLength(5);
  });

  it("does not repeat (sanity check over 2,000 codes)", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateRecoveryCode(rng)));
    expect(seen.size).toBe(2000);
  });

  it("round-trips through its bytes (125 bits preserved)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRecoveryCode(rng);
      expect(recoveryCodeFromBytes(recoveryCodeBytes(code))).toBe(code);
    }
  });

  it("reads what people actually type", () => {
    const code = recoveryCodeFromBytes(new Uint8Array(16).fill(0xa7));
    const typed = formatRecoveryCode(code).toLowerCase().replace(/-/g, " ");
    expect(parseRecoveryCode(typed)).toBe(code);
    expect(parseRecoveryCode("7kq2m xd9pa r4twe h6nbz 3fjc8")).toBe("7KQ2MXD9PAR4TWEH6NBZ3FJC8");
  });

  it("forgives O/0 and I/L/1 mix-ups", () => {
    expect(parseRecoveryCode("OOOOO-IIIII-LLLLL-00000-11111")).toBe("0000011111111110000011111");
  });

  it.each(["", "7KQ2M-XD9PA-R4TWE-H6NBZ", "7KQ2M-XD9PA-R4TWE-H6NBZ-3FJC8X", "7KQ2M-XD9PA-R4TWE-H6NBZ-3FJCU", "7KQ2M-XD9PA-R4TWE-H6NBZ-3FJC#"])(
    "rejects %j",
    (bad) => expect(parseRecoveryCode(bad)).toBeNull(),
  );

  it("refuses to turn an unparsed code into key material", () => {
    const code = generateRecoveryCode(rng);
    expect(() => recoveryCodeBytes(code.toLowerCase() as typeof code)).toThrow(TypeError);
    expect(() => recoveryCodeBytes("SHORT" as typeof code)).toThrow(TypeError);
  });

  it("refuses too little randomness", () => {
    expect(() => recoveryCodeFromBytes(new Uint8Array(15))).toThrow(RangeError);
  });
});
