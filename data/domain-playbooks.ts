export type SiteType = "ecommerce" | "saas" | "portfolio" | "blog" | "agency" | "other";

export interface DomainPlaybook {
  priorities: string[];
  required_sections: string[];
}

export const DOMAIN_PLAYBOOKS: Record<SiteType, DomainPlaybook> = {
  ecommerce: {
    priorities: [
      "Product card redesign — image quality, price hierarchy, add-to-cart prominence",
      "Trust signals — reviews count, star ratings, security badges near checkout",
      "Urgency/scarcity — stock levels, limited-time offers above the fold",
      "Cart & checkout flow — reduce steps, surface a progress indicator",
      "Social proof — testimonials, UGC photos, purchase counts",
    ],
    required_sections: ["product cards", "cart CTA", "trust badges", "social proof"],
  },
  saas: {
    priorities: [
      "Hero value prop — specific outcome ('Ship 10x faster'), not feature description",
      "Pricing table — feature comparison grid, recommended tier highlighted",
      "Social proof — customer logos, case study metrics, G2/Capterra ratings",
      "Feature section — benefit-led copy, not feature-led",
      "Trial/demo CTA — low friction, visible in nav",
    ],
    required_sections: ["hero", "pricing", "social proof", "primary CTA"],
  },
  portfolio: {
    priorities: [
      "Case study depth — problem → solution → outcome structure per project",
      "Work grid — visual hierarchy, project type labels, hover previews",
      "About section — personality + credibility (clients, results, years)",
      "Contact/hire CTA — clear next step above the fold and at page bottom",
    ],
    required_sections: ["work showcase", "case study structure", "contact CTA"],
  },
  blog: {
    priorities: [
      "Reading experience — max 70ch line length, 18px+ body, 1.7 line-height",
      "Content discovery — related posts, category filtering, search",
      "Newsletter/subscription CTA — inline and sticky, value-proposition-led",
      "Author credibility — bio, photo, credentials near article top",
    ],
    required_sections: ["article layout", "newsletter CTA", "content discovery"],
  },
  agency: {
    priorities: [
      "Services clarity — what you do, for whom, and what outcome they get",
      "Portfolio proof — outcomes and metrics, not just visuals",
      "Pricing/process transparency — reduce uncertainty for prospects",
      "Lead generation form — short, above the fold, with clear CTA",
    ],
    required_sections: ["services section", "portfolio", "contact/lead form"],
  },
  other: {
    priorities: [
      "Clear value proposition — what this is and who it's for in one sentence",
      "Primary CTA prominence — highest-contrast element on the page",
      "Content hierarchy — H1 → H2 → body rhythm enforced throughout",
      "Trust signals — credentials, social proof, or guarantees visible above fold",
    ],
    required_sections: ["hero", "primary CTA"],
  },
};

export function getDomainBlock(siteType: SiteType | undefined): string {
  const type: SiteType = siteType ?? "other";
  const playbook = DOMAIN_PLAYBOOKS[type];
  const priorityLines = playbook.priorities.map(p => `- ${p}`).join("\n");
  const requiredLine = `REQUIRED IN OUTPUT: ${playbook.required_sections.join(", ")}`;
  return `\nSITE TYPE: ${type}\nDOMAIN PRIORITIES:\n${priorityLines}\n${requiredLine}\n`;
}
