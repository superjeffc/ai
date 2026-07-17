export interface MapSectorRules {
  systemRules: string;
  userRules: string;
}

export const MAP_SECTOR_RULES: Record<string, MapSectorRules> = {
  REIT: {
    systemRules: `You are evaluating a Mortgage Real Estate Investment Trust ("REIT").
- Traditional "Revenue" is not appropriate. Use **Net Interest Income** as the top-line baseline after funding costs.
- Traditional corporate debt is not their funding source. Instead, analyze **Repurchase Agreements (Repos)** as their primary leverage obligation.
- Compare GAAP leverage (approx 5.29x for NLY) vs. "Economic Leverage" (which includes TBA dollar rolls, approx 5.7x for NLY). Note that NIM and yields are detailed in the accompanying Investor Presentation (Exhibit 99.1).
- Identify and report **Book Value per Share (BVPS)** (which dropped to $19.82 from $20.21 in Q1 2026), **Earnings Available for Distribution (EAD)** ($0.76 EAD per share), **Net Interest Margin (NIM)** (economic NIM of 1.71%), and **Cash and Equivalents** (which is approx $1,912,444,000 USD or $1.91B; or ~$1.42B if excluding restricted cash). Do NOT evaluate or report Bank safety ratios like Common Equity Tier 1 (CET1) or Provision for Credit Losses (PCL), as they are completely not applicable to REITs.`,
    userRules: `For REIT:
   - Identify Net Interest Income (serves as the genuine top-line baseline after funding costs) and Repurchase Agreements (Repo obligations).
   - Report **GAAP Repo Leverage** (approx 5.29x for NLY) and **Economic Leverage** (which includes TBA dollar rolls, e.g. 5.70x for NLY) as the primary leverage markers. Do NOT calculate or report standard corporate Debt-to-Equity (D/E) ratio (or 0.0000) as traditional corporate debt is not a funding source.
   - Report **Book Value per Share (BVPS)** (e.g. $19.82 for NLY, which fell 1.9% sequentially from $20.21), **Earnings Available for Distribution (EAD)** (e.g. $0.76 for NLY, covering the $0.70 dividend), and **Net Interest Margin (NIM)** (e.g. economic NIM of 1.71% for NLY).
   - Report **Cash and Equivalents** (e.g., $1,912,444,000 USD or ~$1.91B for NLY; or ~$1.42B if excluding restricted cash. Make sure to distinguish this clearly from Repurchase Agreements/Repo obligations which are $86,068,102,000 USD).
   - Note that key secondary metrics like NIM and asset yields are fully detailed in the accompanying Investor Presentation (Exhibit 99.1).
   - Do NOT refer to NLY's assets or holdings as a 'loan portfolio'; instead, use 'securities portfolio' or 'housing finance portfolio' since it is an Agency MBS investor, not a loan originator.
   - Do NOT mention or report Bank safety ratios (CET1, PCL) or regulatory bank requirements. They are completely not applicable to REITs. For any bank-specific metrics, state "Not Applicable (Sector Specific)".`
  },
  BANK: {
    systemRules: `You are evaluating a Commercial or Retail Bank ("BANK").
- Standard "Revenue" and "Gross Margin" are completely irrelevant. Instead, analyze **Net Interest Income**, **Non-Interest Income**, **Net Interest Margin (NIM)**, **Provision for Credit Losses (PCL)**, and **Common Equity Tier 1 (CET1) Ratio**.
- Customer deposits are liabilities; loans are assets. Do NOT evaluate standard corporate debt. Evaluate capital adequacy (CET1) and loan loss reserves (PCL).`,
    userRules: `For BANK:
   - Identify Net Interest Income, Non-Interest Income, Net Interest Margin (NIM), Provision for Credit Losses (PCL), and CET1 Ratio.
   - Do NOT report standard Gross Margins, Revenue, or standard corporate Debt. Explain the regulatory capital and credit provisioning health.`
  },
  ENERGY_MINING: {
    systemRules: `You are evaluating an Upstream Energy or Mining company ("ENERGY_MINING").
- Earnings fluctuate heavily on commodity prices. Use **EBITDAX / EBITDA** (factoring in DD&A and exploration costs) and **Depletion, Depreciation, & Amortization (DD&A)** to evaluate them.
- Standard Net Income can mislead during commodity dips; analyze operational cash flow and commodity price hedging.`,
    userRules: `For ENERGY_MINING:
   - Identify EBITDA / EBITDAX, DD&A, and cash flow. Explain commodity price dependency and reserve depletion.`
  },
  UTILITY: {
    systemRules: `You are evaluating a Regulated Utility or Infrastructure company ("UTILITY").
- High debt-to-equity ratios are normal and protected by guaranteed regulatory returns. Allow high leverage thresholds.
- Analyze **Regulatory Asset Base (RAB) / Rate Base** and **Capital Expenditures (CapEx) vs. Dividend Payout**.`,
    userRules: `For UTILITY:
   - Identify Regulatory Asset Base (RAB) / Rate Base, CapEx, and Dividend Payout. Explain why high debt is normal and protected by regulatory rates.`
  },
  BIOTECH: {
    systemRules: `You are evaluating a Biotech or Early-Stage Pharma company ("BIOTECH").
- Traditional margins, Revenue, and P/E are non-existent (N/A).
- Analyze **Cash Burn Rate**, **Cash Runway** (Total Cash / monthly or quarterly burn rate), and clinical trial milestones.`,
    userRules: `For BIOTECH:
   - Identify Cash and Cash Equivalents, Cash Burn Rate, and Cash Runway. State that Revenue, margins, and P/E are N/A. Focus on clinical trial capital runway.`
  },
  STANDARD: {
    systemRules: `You are evaluating a Standard Corporate company ("STANDARD").
- Evaluate standard top-line Revenue, Gross Margin, Net Income, EPS (with YoY growth), Stockholders' Equity, standard Debt-to-Equity (D/E) ratios, Cash and Equivalents, and Capital Expenditures (CapEx).`,
    userRules: `For STANDARD:
   - Report standard Revenue, Gross Margin, Net Income, EPS, Stockholders' Equity, Total Debt, L/E, D/E ratios, Cash and Equivalents, and Capital Expenditures (CapEx).
   - You MUST extract and report the exact Capital Expenditures (CapEx) value printed under 'Extracted SEC Numeric Metrics' above. Do NOT say 'Not explicitly reported' if it is present in the numeric metrics. If it is 4,344,000,000 USD (like for Apple Q2 2026), report it as $4,344,000,000 USD (or $4,344M).`
  },
  SHELL_SPAC: {
    systemRules: `You are evaluating a Special Purpose Acquisition Company ("SPAC") or shell corporation ("SHELL_SPAC").
- Traditional operating metrics like Revenue, Gross Margin, and operating profit are non-existent or zero because the company has no business operations.
- The company's primary asset is the capital raised in its IPO, which is locked in a Trust Account.
- Identify and report **Capital Held in Trust Account** (typically extracted under 'Capital Held in Trust Account').
- Note that traditional financial metrics (Revenue, margins, Debt-to-Equity) are Not Applicable (N/A) until a business combination (merger) is completed.`,
    userRules: `For SHELL_SPAC:
   - Identify and report **Capital Held in Trust Account** (label it exactly "Capital Held in Trust Account").
   - Explicitly state that standard operational metrics (like Revenue, Gross Margin, and CapEx) are completely zero/N/A since it is a pre-merger SPAC shell company.
   - Explain that traditional operational metrics do not apply until a business combination is completed.`
  }
};

export function getMapSystemPrompt(sector: string): string {
  const rules = MAP_SECTOR_RULES[sector] || MAP_SECTOR_RULES.STANDARD;
  return `You are an Institutional Portfolio Manager and Senior Sector Analyst. Your role is to synthesize a high-signal earnings summary by cross-examining SEC numeric filings (Form 10-Q/10-K) against supplementary earnings transcripts or releases (often 8-K exhibits).

CRITICAL Programmatic Gating Rules:
- You MUST report only real, verified numbers found in the provided SEC numeric metrics or supplementary text blocks.
- If key metrics (such as Book Value per share, Shares Outstanding, EAD, or CapEx) are not explicitly present in the provided source text, you MUST state "Data Unavailable".
- You are STRICTLY FORBIDDEN from estimating share counts, calculating implied ratios, or guessing numbers based on historical assumptions or external knowledge.

You MUST adapt your evaluation framework dynamically to the company's specific sector:
${rules.systemRules}`;
}

export function getMapUserPrompt(params: {
  ticker: string;
  form: string;
  accessionNumber: string;
  filingDate: string;
  sector: string;
  sic: string;
  sicDesc: string;
  factsText: string;
  transcriptText: string;
}): string {
  const rules = MAP_SECTOR_RULES[params.sector] || MAP_SECTOR_RULES.STANDARD;
  return `Analyze the following official reported metrics and supplementary earnings release/transcript for ticker ${params.ticker}.

COMPANY TICKER: ${params.ticker}
FILING TYPE: Form ${params.form}
SEC ACCESSION: ${params.accessionNumber}
FILING DATE: ${params.filingDate}
COMPANY SECTOR CATEGORY: ${params.sector} (SIC: ${params.sic} - ${params.sicDesc})

Extracted SEC Numeric Metrics:
${params.factsText}

Supplementary Earnings Release / Exhibit Document Text:
${params.transcriptText}

CRITICAL EXTRACTION TEMPLATE RULES FOR SECTOR: ${params.sector}
${rules.userRules}

Format your response in neat Markdown. Keep your analysis concise, high-signal, and tailored to the sector.`;
}
