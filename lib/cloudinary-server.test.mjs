import { test } from "node:test";
import assert from "node:assert/strict";
import { publicIdFromUrl, signParams } from "./cloudinary-server.js";

test("publicIdFromUrl", () => {
  assert.equal(publicIdFromUrl("https://res.cloudinary.com/xulzdnnc/image/upload/v1712345678/abc123.jpg"), "abc123");
  assert.equal(publicIdFromUrl("https://res.cloudinary.com/c/image/upload/folder/x.png"), "folder/x");
  assert.equal(publicIdFromUrl("https://evil.example/none"), "");
});

test("signParams matches the worked example in Cloudinary's signing docs", () => {
  const params = { timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" };
  assert.equal(signParams(params, "abcd"), "bfd09f95f331f558cbd1320e67aa8d488770583e");
});
