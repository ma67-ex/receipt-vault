import { test } from "node:test";
import assert from "node:assert/strict";
import { publicIdFromUrl, ownedPublicId, signParams } from "./cloudinary-server.js";

test("publicIdFromUrl", () => {
  assert.equal(publicIdFromUrl("https://res.cloudinary.com/xulzdnnc/image/upload/v1712345678/abc123.jpg"), "abc123");
  assert.equal(publicIdFromUrl("https://res.cloudinary.com/c/image/upload/folder/x.png"), "folder/x");
  assert.equal(publicIdFromUrl("https://evil.example/none"), "");
});

test("signParams matches the worked example in Cloudinary's signing docs", () => {
  const params = { timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" };
  assert.equal(signParams(params, "abcd"), "bfd09f95f331f558cbd1320e67aa8d488770583e");
});

test("ownedPublicId only accepts our cloud and the caller's own folder", () => {
  const cloud = "xulzdnnc", uid = "u1";
  const mine = `https://res.cloudinary.com/${cloud}/image/upload/v1712345678/receipts/${uid}/abc123.jpg`;
  assert.equal(ownedPublicId(mine, cloud, uid), `receipts/${uid}/abc123`);
  assert.equal(ownedPublicId(`https://res-1.cloudinary.com/${cloud}/image/upload/receipts/${uid}/abc.png`, cloud, uid), `receipts/${uid}/abc`);
  // someone else's folder, in our cloud: refused
  assert.equal(ownedPublicId(`https://res.cloudinary.com/${cloud}/image/upload/v1/receipts/u2/abc123.jpg`, cloud, uid), "");
  // a legacy flat upload from the unsigned preset: refused (cannot prove ownership)
  assert.equal(ownedPublicId(`https://res.cloudinary.com/${cloud}/image/upload/v1/abc123.jpg`, cloud, uid), "");
  // another cloud, another host, a nested or traversal path, a non-https URL, junk: refused
  assert.equal(ownedPublicId(`https://res.cloudinary.com/othercloud/image/upload/receipts/${uid}/x.jpg`, cloud, uid), "");
  assert.equal(ownedPublicId(`https://evil.example/${cloud}/image/upload/receipts/${uid}/x.jpg`, cloud, uid), "");
  assert.equal(ownedPublicId(`https://res.cloudinary.com/${cloud}/image/upload/receipts/${uid}/../u2/x.jpg`, cloud, uid), "");
  assert.equal(ownedPublicId(`https://res.cloudinary.com/${cloud}/image/upload/receipts/${uid}/sub/x.jpg`, cloud, uid), "");
  assert.equal(ownedPublicId(`http://res.cloudinary.com/${cloud}/image/upload/receipts/${uid}/x.jpg`, cloud, uid), "");
  assert.equal(ownedPublicId("not a url", cloud, uid), "");
  assert.equal(ownedPublicId(mine, cloud, ""), "");
});
