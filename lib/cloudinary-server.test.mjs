import { test } from "node:test";
import assert from "node:assert/strict";
import { publicIdFromUrl } from "./cloudinary-server.js";

test("publicIdFromUrl", () => {
  assert.equal(publicIdFromUrl("https://res.cloudinary.com/xulzdnnc/image/upload/v1712345678/abc123.jpg"), "abc123");
  assert.equal(publicIdFromUrl("https://res.cloudinary.com/c/image/upload/folder/x.png"), "folder/x");
  assert.equal(publicIdFromUrl("https://evil.example/none"), "");
});
