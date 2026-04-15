import assert from "node:assert/strict";
import { getDomainBlock, DOMAIN_PLAYBOOKS } from "../data/domain-playbooks";
import type { SiteType } from "../data/domain-playbooks";

// Test 1: ecommerce block contains expected content
{
  const block = getDomainBlock("ecommerce");
  assert.ok(block.includes("SITE TYPE: ecommerce"), "ecommerce: should include site type header");
  assert.ok(block.includes("DOMAIN PRIORITIES:"), "ecommerce: should include priorities header");
  assert.ok(block.includes("Product card redesign"), "ecommerce: should include product card priority");
  assert.ok(block.includes("REQUIRED IN OUTPUT:"), "ecommerce: should include required sections");
  assert.ok(block.includes("product cards"), "ecommerce: should require product cards");
  console.log("✓ ecommerce block has expected content");
}

// Test 2: saas block contains expected content
{
  const block = getDomainBlock("saas");
  assert.ok(block.includes("SITE TYPE: saas"), "saas: correct site type");
  assert.ok(block.includes("pricing"), "saas: required sections include pricing");
  console.log("✓ saas block has expected content");
}

// Test 3: undefined siteType falls back to "other"
{
  const block = getDomainBlock(undefined);
  assert.ok(block.includes("SITE TYPE: other"), "undefined: should fall back to 'other'");
  assert.ok(block.includes("Clear value proposition"), "other: should include value prop priority");
  console.log("✓ undefined siteType falls back to 'other'");
}

// Test 4: all site types have at least 3 priorities and 1 required section
{
  const types: SiteType[] = ["ecommerce", "saas", "portfolio", "blog", "agency", "other"];
  for (const t of types) {
    const p = DOMAIN_PLAYBOOKS[t];
    assert.ok(p.priorities.length >= 3, `${t}: should have at least 3 priorities`);
    assert.ok(p.required_sections.length >= 1, `${t}: should have at least 1 required section`);
  }
  console.log("✓ all site types have sufficient priorities and required sections");
}

// Test 5: getDomainBlock output is non-empty for every site type
{
  const types: SiteType[] = ["ecommerce", "saas", "portfolio", "blog", "agency", "other"];
  for (const t of types) {
    const block = getDomainBlock(t);
    assert.ok(block.length > 50, `${t}: block should be non-trivially long`);
  }
  console.log("✓ getDomainBlock returns non-empty blocks for all types");
}

console.log("\n✓ all domain-playbooks tests passed");
