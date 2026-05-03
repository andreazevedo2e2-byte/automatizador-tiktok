import { describe, expect, it } from "vitest";
import { nextPostFolderName } from "../src/google-drive.js";

describe("nextPostFolderName", () => {
  it("starts from post 1 when there are no children", () => {
    expect(nextPostFolderName([])).toBe("post 1");
  });

  it("finds the next number ignoring unrelated folders", () => {
    expect(
      nextPostFolderName([
        { name: "perfil 1" },
        { name: "post 2" },
        { name: "rascunhos" },
        { name: "Post 7" },
      ])
    ).toBe("post 8");
  });
});
