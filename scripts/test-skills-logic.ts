import assert from "node:assert/strict";
import { selectSkillsForScores } from "../lib/tools/prompt";
import type { DesignScore } from "../lib/tools/vision";

const highScores: DesignScore = {
  colors: 80, typography: 80, spacing: 80, cta: 80,
  structure: 80, accessibility: 80, user_flow: 80, overall: 80,
};

// Test 1: all high scores → only design-review
{
  const skills = selectSkillsForScores(highScores);
  assert.equal(skills.length, 1, "high scores: should only include design-review");
  assert.equal(skills[0].name, "/design-review");
  console.log("✓ high scores → only /design-review");
}

// Test 2: low colors → ui-ux-pro-max included
{
  const skills = selectSkillsForScores({ ...highScores, colors: 60 });
  assert.ok(skills.some(s => s.name === "/ui-ux-pro-max"), "low colors: should include /ui-ux-pro-max");
  assert.ok(skills.some(s => s.name === "/design-review"), "low colors: should always include /design-review");
  console.log("✓ low colors → /ui-ux-pro-max + /design-review");
}

// Test 3: low typography → ui-ux-pro-max included
{
  const skills = selectSkillsForScores({ ...highScores, typography: 50 });
  assert.ok(skills.some(s => s.name === "/ui-ux-pro-max"), "low typography: should include /ui-ux-pro-max");
  console.log("✓ low typography → /ui-ux-pro-max");
}

// Test 4: low structure → design-shotgun AND design-html included
{
  const skills = selectSkillsForScores({ ...highScores, structure: 55 });
  assert.ok(skills.some(s => s.name === "/design-shotgun"), "low structure: should include /design-shotgun");
  assert.ok(skills.some(s => s.name === "/design-html"), "low structure: should include /design-html");
  console.log("✓ low structure → /design-shotgun + /design-html");
}

// Test 5: low CTA but high structure → design-html but NOT design-shotgun
{
  const skills = selectSkillsForScores({ ...highScores, cta: 50 });
  assert.ok(skills.some(s => s.name === "/design-html"), "low cta: should include /design-html");
  assert.ok(!skills.some(s => s.name === "/design-shotgun"), "low cta, high structure: should NOT include /design-shotgun");
  console.log("✓ low CTA → /design-html but not /design-shotgun");
}

// Test 6: design-review always present, no duplicates
{
  const skills = selectSkillsForScores({ ...highScores, colors: 50, structure: 50, cta: 50 });
  const reviewCount = skills.filter(s => s.name === "/design-review").length;
  assert.equal(reviewCount, 1, "design-review should appear exactly once");
  console.log("✓ /design-review appears exactly once regardless of scores");
}

console.log("\n✓ all skills logic tests passed");
