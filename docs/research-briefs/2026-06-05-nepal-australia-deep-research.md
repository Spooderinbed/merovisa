# Research Brief — Nepal → Australia Deep Data

**Created:** 2026-06-05
**Purpose:** Comprehensive data deepening for MyVisa's Nepal → Australia visa eligibility platform. Hand each topic below to a separate external research agent (Gemini Deep Research, Perplexity Pro, ChatGPT with search, etc.) and return findings in the schemas specified.
**Status:** Brief prepared; awaiting research results to integrate.

---

## Meta-prompt (prepend to every research task below)

> You are gathering authoritative, current (2026) Nepal-Australia data for a visa-eligibility platform serving real Nepali students. **Cite every claim** with a URL + date last verified. **Prefer primary sources:** `immi.homeaffairs.gov.au` (DHA), `*.gov.np` (Nepal government), `nrb.org.np` (Nepal Rastra Bank), `moest.gov.np`, individual university `.edu.au` pages. If a value differs across 2024/2025/2026, give the **current 2026 value** plus a one-line change history. **Never invent.** If something is unclear, say `"unverified — needs confirmation"` rather than guessing.
>
> **Tag every finding with a confidence tier:**
> - `primary` — the authoritative source stating its *own* facts: a government body (immi.homeaffairs.gov.au / DHA, Nepal Rastra Bank, MoEST), the institution's own page about itself (a `.edu.au` fees page), a bank's own published rates.
> - `practitioner` — credible secondary expertise: MARA-registered migration agents, established consultancies (Aussizz, AHC Lawyers, KIEC, IDP, Edwise), reputable news outlets, well-sourced how-to guides.
> - `anecdotal` — forums, Reddit, Quora, personal blogs, social media. Lived experience, unverified.
>
> **Follow the Output format in the next section — it is mandatory for every topic.**

---

## Output format (required for every topic)

Every topic returns its findings in one or both of two forms. Read this before starting.

### Form 1 — Entity CSV (catalog topics)

If the topic has a CSV schema in **Output schemas summary** at the foot of this brief — currently **A1, B2, C1, D1, E1, E2, E3, J1, J2** — produce that CSV as the **primary** deliverable: one row per entity, columns exactly as specified, no extra columns.

### Form 2 — Atomic findings table (the universal net)

For topics *without* a CSV schema this table is the **primary** deliverable. For topics *with* a CSV schema, also produce this table to capture every fact that doesn't fit a column (e.g. *"USyd tightened Nepal AL3 scrutiny in 2025"*). **Nothing a topic surfaces may fall outside both forms** — that is the guarantee that no data is lost in transit.

One atomic fact per row:

| ID | Claim | Entity | Attribute | Source URL | Publisher | Source date | Confidence | Type | Caveats |
|----|-------|--------|-----------|------------|-----------|-------------|------------|------|---------|

**Column rules**

- **ID** — `<topic-code>.NNN`, sequential and zero-padded (e.g. `A3.001`, `A3.002`). Never reuse or skip numbers.
- **Claim** — exactly ONE self-contained fact. If a sentence holds two figures, dates, or names, split it into two rows. "Bank X needs NPR 4M collateral and takes 21 days" = two rows.
- **Entity** — the specific subject (e.g. `ANZ Bank`, `NOC certificate`, `Subclass 500`).
- **Attribute** — the aspect of that entity (e.g. `collateral requirement`, `processing time`, `English requirement`).
- **Source URL** — a direct link to the page asserting the fact. Not a homepage, not "search Google". If genuinely unsourceable, write `UNSOURCED` and set Confidence `anecdotal` — never drop a fact silently, never present an unsourced claim as fact.
- **Publisher** — one of: `gov` · `university` · `bank` · `consultancy` · `news` · `forum` · `blog`.
- **Source date** — publication or last-updated date (`YYYY-MM` is fine; `undated` if none). Mandatory for anything time-sensitive (fees, rates, processing times, deadlines).
- **Confidence** — `primary` · `practitioner` · `anecdotal` (definitions in the meta-prompt above).
- **Type** — `data` (a value/figure/list-membership) · `process` (a procedure or eligibility rule) · `contact` (name/office/email/phone/URL) · `red-flag` (scam pattern, refusal reason, pitfall).
- **Caveats** — conditions, "as of" notes, or contradictions. If two sources disagree, make a row for **each** and note the other row's ID (e.g. `conflicts with A3.014`).

**Hard rules**

1. **Atomicity over brevity** — more rows beats packed rows. Never bundle.
2. **Exact values only** — real figures, local currency (NPR / AUD), full official names. Never round, summarize, or paraphrase numbers.
3. **Keep every occurrence** — if three sources assert the same fact, that's three rows. Corroboration is signal; don't dedupe.
4. **No invention** — if you're inferring rather than reading from a source, say so in Caveats and mark Confidence `anecdotal`.
5. **End every topic with one line: `Total findings: N`** — the exact row count, so we can verify nothing was lost in transit.

If a finding can't fit the table (e.g. a long process narrative), put a one-row summary in the table and place the full detail in a numbered appendix referenced by that row's ID.

---

## How to use this brief

1. **Hand each topic to a separate research agent** in parallel — don't try to make one agent answer 25 things
2. **Prepend the meta-prompt** to each topic
3. **Topics with a CSV schema** (A1, B2, C1, D1, E1, E2, E3, J1, J2) — return the CSV as the primary deliverable **plus** the atomic findings table for anything that doesn't fit a column
4. **All other topics** — return the **atomic findings table** (see Output format) as the primary deliverable
5. **Bring back what's ready, don't wait for all 25** — integrate incrementally

Topics are grouped into 10 categories (A–J). Each category has 2–5 prompts.

---

# CATEGORY A — DOCUMENTS

## A1. Full Nepal-side document inventory (master list)

> List every single document a Nepali student must gather between deciding to apply and arriving in Australia. Group by stage: pre-application, university application, post-offer, visa lodgement, pre-departure, post-arrival. For EACH document specify:
>
> 1. **Official name** (in English + Nepali if relevant)
> 2. **Issuing authority** — be specific: which ward (1-32 in Kathmandu Metropolitan, etc.), which Ministry department, which school office, which bank branch, which court
> 3. **How to get it** — physical address (with map URL), online portal URL, walk-in vs appointment-only
> 4. **Cost** in NPR — both official fee and typical "facilitation" cost if widely known
> 5. **Processing time** — standard vs urgent/fast-track if available
> 6. **Validity period** for DHA purposes
> 7. **Required attachments** to apply for THIS document
> 8. **Whether notarization is needed**, by whom
> 9. **Whether translation is needed**, by whom
> 10. **Common rejection reasons** when applying
> 11. **Who in the family** must obtain this (applicant only, sponsor too, parents, all sponsors)
>
> Cover at minimum: citizenship certificate (Nagarikta), birth certificate (Janma Darta), passport, SLC/SEE certificate, +2 transcripts and character certificate, bachelor's transcripts and migration certificate and character certificate, masters transcripts (if applicable), NOC from MoEST, Police Clearance Certificate, affidavit of support, sponsor's tax-clearance certificate, sponsor's salary/income certificate, business registration (if sponsor is self-employed), property ownership papers (Lalpurja), property valuation (Malpot), bank balance certificate, bank statement (6-month and 12-month), source-of-funds documents for each large deposit, education loan sanction letter, IELTS/PTE/TOEFL scorecard, medical exam report (form 26 or 26B), evidence of relationships (marriage cert, birth certs of dependents, family photos), employment letter (for working applicants), salary slips, experience letter, recommendation letters (academic + professional), CV/resume, Statement of Purpose, Genuine Student declaration responses, visa application form, ImmiAccount confirmation, biometrics receipt, OSHC policy, CoE.
>
> Also: any document that varies by ward (some wards have unique forms or extra steps), any document a student living outside Kathmandu has different access to, any document only obtainable in your district of permanent residence.

## A2. Notarization, attestation, translation

> Comprehensive guide to making Nepali documents legally usable for Australian DHA in 2026.
>
> **Notarization:** For each document type in A1, does DHA accept (a) Nepal lawyer notary stamp, (b) Notary Public Council registration, (c) embassy attestation, (d) Apostille (note: Nepal is NOT a Hague Apostille signatory — confirm this is still true in 2026, and if so what's the workaround), (e) e-notarization? List specific notary public offices in Kathmandu (locations + fees + turnaround), Pokhara, Biratnagar, Birgunj, Butwal, Dharan, Nepalgunj. Typical cost per document.
>
> **Attestation:** Which documents need attestation from the issuing authority before notarization (e.g. transcripts attested by university before notary stamp). Process for: Tribhuvan University attestation, Kathmandu University, Pokhara University, Purbanchal University. Where to go physically, hours, fees, queue reality (5-day wait? Same-day?).
>
> **Translation:** Which documents need certified English translation. Who is authorized — list specific translation services in Kathmandu accepted by DHA / Australian universities (with address + cost per page + turnaround). Does DHA accept university-translated docs, or only third-party? What about documents that are bilingual at issue (some new citizenship certificates are)?
>
> **Common pitfalls:** Documents Nepali students think don't need translation but do (e.g. mark sheets in Devanagari script with English headers). Recent changes — any 2024-2026 DHA policy shifts on translation/notarization for Nepal documents?

## A3. NOC from MoEST — full end-to-end walkthrough

> Step-by-step walkthrough of the Ministry of Education NOC process for a Nepali student going to Australia in 2026.
>
> 1. **Account creation** at `noc.moest.gov.np` — what info needed, common login issues
> 2. **Online application form** — every field, what attachments required, file size limits, format requirements (PDF only? size?)
> 3. **Fee structure** — current NPR fee for Australia destination, payment methods (eSewa, Khalti, IME, in-person bank deposit), reference numbers
> 4. **Processing timeline** — official vs actual median for 2026, urgent processing if available
> 5. **MoEST recognized course/university list** — where to find it, how it's updated, what to do if your university or course isn't listed (workaround? appeal process?)
> 6. **Common rejection reasons** in 2024-2026 — list with frequency if findable. What to do after rejection (re-apply? appeal?)
> 7. **Status tracking** — how to check application status
> 8. **NOC validity** — how long it's valid, what triggers re-issuance need
> 9. **Special cases:** sub-18 applicants (subclass 590 guardian), students with prior NOCs for other countries, NRN parents, students applying through agents (does agent submit on student's behalf?)
> 10. **In-person vs fully-online** — is in-person interview ever required? When? Where (Singha Durbar?)
> 11. **NOC for sending tuition wire** — the same NOC, or a separate one? How does this gate the bank wire?
> 12. **What other countries require equivalent NOCs** (background context)
>
> Cite actual 2026 MoEST documentation. Flag anything that's "agent practice" vs "official guidance."

## A4. Police Clearance Certificate — full walkthrough

> Step-by-step for obtaining PCC from Nepal Police in 2026.
>
> 1. **Three pathways:** online (`opcr.nepalpolice.gov.np`), Nagarik App, in-person (which offices accept PCC applications? Central Police Office Naxal? District police HQs? Local police stations?)
> 2. **Online process** — account creation, application form fields, attachments, fee structure, biometric requirements (do you still need to visit for fingerprinting? Where?)
> 3. **Cost** — standard vs urgent
> 4. **Processing time** — current 2026 median
> 5. **What you receive** — physical certificate (collected in person?), e-certificate (PDF download?), both?
> 6. **Validity for DHA** — 3 months, 6 months, or other?
> 7. **Multi-district history** — if you lived in 3 districts in last 10 years, do you need one PCC each? Process for consolidated PCC?
> 8. **Sponsor PCC** — when does DHA require it? (For working professionals with prior international travel? For some refusal-history cases?) Process is same as applicant?
> 9. **PCC from foreign countries** — for Nepali applicants who lived abroad (UAE/Qatar/etc.) — what's needed, how to obtain from outside Nepal
> 10. **Common issues** — name mismatch between citizenship and passport (very common in Nepal due to maiden-name transliteration), how to resolve
>
> Cite Nepal Police's own 2026 documentation if available.

## A5. Ward-level documents (the Nepal-specific ones)

> List documents that Australia visa applicants from Nepal sometimes need that are issued by their LOCAL WARD OFFICE (Ward 1-32 of metropolitan municipalities, or rural municipality wards). For each: name, when needed (which visa pathway / which evidence gap it addresses), what the ward charges, what proof is required to apply, typical turnaround.
>
> Specifically cover:
> 1. **Relationship verification certificate** — when sponsor relationship is questioned, the ward can issue a "Naata Pramaan Patra" verifying family link
> 2. **Migration certificate from ward** (different from school migration certificate)
> 3. **Income verification** for parents who are farmers / self-employed without formal IRD filings
> 4. **Residence verification** — current vs permanent address
> 5. **Land ownership confirmation** when Lalpurja is in someone else's name (deceased grandparent, etc.)
> 6. **Affidavit witnessing** — wards sometimes attest sponsor affidavits
> 7. **Character certificate** at ward level (different from school character certificate)
> 8. **Documentation for joint-family / Hindu undivided family financial situations** — Nepal-specific reality where bank account is in grandfather's name but funds are family-shared
>
> Also: differences between Kathmandu/Lalitpur metropolitan wards (faster, more formal) and rural municipality wards (slower, may need facilitation), and how the Lokpriya system handles online requests.

---

# CATEGORY B — FINANCE

## B1. Proof of funds — every acceptable path

> For each of the following funding sources, what evidence does DHA accept under AL3 (2026), with current Nepal-specific notes:
>
> 1. **Own savings** — bank statement format, signed by branch manager? Seal? 6-month vs 12-month? Class A bank only?
> 2. **Parent savings** — same plus affidavit of support, sponsor PCC, sponsor IRD certificate. What proves the relationship?
> 3. **Education loan** — sanction letter content requirements, disbursement schedule (is undisbursed loan accepted?), collateral evidence
> 4. **Gift from relatives** — gift deed format, donor's source of funds proof (this is the hardest piece)
> 5. **Sale of land/property** — land deed (Lalpurja), Malpot valuation by government surveyor, registration receipt of sale, bank deposit trail of proceeds, capital gains tax clearance
> 6. **Remittance from abroad** — NRN parent or sibling — proof of remitter's foreign income (foreign tax returns? employer letters?), remittance receipts (Western Union/MoneyGram/IME/Wise), Nepali bank credit confirmation
> 7. **Provident Fund (EPF) withdrawal** — when is it permitted, what proof of release
> 8. **Sale of business** — business registration, valuation, transfer deed, capital trail
> 9. **Scholarship sponsor letter** — from where, format, what makes it credible
> 10. **Combination strategies** — partial loan + partial savings + partial gift — how DHA assesses
>
> For EACH path, give: typical "weakness flags" DHA case officers raise, "strengthener" steps applicants take, average time to build credible evidence.

## B2. Nepal bank loan products for Australia-bound students

> Detailed product comparison for the 20 NRB Class A commercial banks (list them all with addresses + URLs). For each, their dedicated education-loan / study-abroad product in 2026:
>
> - Product name
> - Loan amount range (NPR)
> - Interest rate (2026 base + spread, current effective rate)
> - Tenure (years)
> - Collateral required (land valuation typical, third-party guarantor acceptable?)
> - Disbursement schedule (lump sum on visa grant? Phased per semester?)
> - Processing fee
> - Documentation required from applicant + sponsor
> - Whether loan sanction letter is issued *before* visa lodgement (yes/no — varies by bank)
> - Whether the bank handles tuition wire transfer + NOC coordination (some bundle the service)
> - Branch network — coverage in Kathmandu / Pokhara / outside-valley districts
> - Reputation with DHA — are some banks' sanction letters scrutinized more? (practitioner knowledge)
>
> Banks to cover (verify list against 2026 NRB registry): Nepal Investment Mega Bank, Global IME Bank, NIC Asia, Nabil, Himalayan, Everest, Standard Chartered Nepal, Siddhartha, Kumari, Citizens Bank International, Machhapuchchhre, NMB, Prabhu, Sanima, Prime Commercial, Laxmi, Sunrise, ADBL, NRB itself (it doesn't lend retail, just context). Also note licensed Development Banks and Finance Companies who offer education loans — DHA may treat them as lower-tier evidence.
>
> **Output as CSV** with columns: bank_name, license_class, product_name, loan_min_npr, loan_max_npr, interest_rate_2026, tenure_max_years, collateral_required, sanction_pre_visa, sanction_post_visa, processing_fee_npr, branch_count, url, last_verified.

## B3. Tuition payment workflow — how money actually moves

> End-to-end mechanics of paying Australian university tuition from Nepal in 2026:
>
> 1. **Approval to send foreign currency** — NRB authorization requirement, documents needed (university offer letter, NOC, visa file), which Class A banks are NRB-authorized to send (most are)
> 2. **Wire methods** — SWIFT direct vs Flywire vs Convera (formerly Western Union Business Solutions) vs PayMyTuition. Which Australian universities accept which. Fees comparison (Flywire typical $5-15, SWIFT $25-50 plus correspondent bank charges, Convera variable). FX rate markup (usually 0.5-2% over interbank).
> 3. **Timing** — how many working days from initiating wire to credit on uni account. Why this is critical to CoE issuance.
> 4. **Common failure modes** — wire returned (wrong reference, sanctioned correspondent bank routing), partial credit (FX loss makes payment short), university not crediting (Nepali names mismatched on SWIFT MT103)
> 5. **Documentation Nepal applicants must keep** — copy of SWIFT MT103, bank confirmation, university receipt — all of these flow into the visa file
> 6. **Refund flow if visa refused** — university refund timeline, FX risk on the way back, NRB rules on receiving refunds back into Nepal
> 7. **Agent-led payment** — when agents pay tuition on student's behalf, who collects what fees, transparency concerns
> 8. **Forex card setup** — for ongoing living expenses post-arrival, cards like Wise, Revolut, NIC Asia Forex Card, Nabil Wallet — typical loading limits, FX markup, ATM withdrawal fees in Australia
> 9. **Limits on annual remittance from Nepal** — NRB's per-student annual cap (USD-equivalent), how unused capacity rolls over

## B4. Total trip cost — every NPR a student spends

> Itemized cost of going from Kathmandu to first-month-in-Sydney/Melbourne in 2026, in NPR. Cover EVERY line item:
>
> **In Nepal — application phase**
> - IELTS / PTE / TOEFL test fees (each test)
> - Document procurement (citizenship copies, transcripts, character certificate, etc.) — total ~? NPR
> - Notarization fees (typical 8-12 documents × NPR/doc)
> - Translation fees (per page × typical pages)
> - Education agent fees if used (typical NPR range, what % is refunded if refused)
> - University application fees (some unis charge, most postgrad waive)
> - Tuition deposit (1 semester = AUD 12,000-25,000 = NPR 1,500,000-3,000,000)
> - Visa application fee (current AUD 2,000 = NPR ~240,000)
> - Medical exam at IOM (current NPR fee)
> - Police Clearance Certificate (current NPR fee)
> - NOC fee
> - VFS Global biometrics fee (current AUD or NPR)
> - OSHC policy first year (single AUD 700, family AUD 2,400)
> - Bank charges for SWIFT wire
> - Passport photos
> - Notary stamps
> - Travel for in-person visits (out-of-valley applicants traveling to Kathmandu)
>
> **Pre-departure**
> - Flight Kathmandu → Sydney/Melbourne (typical NPR — Qatar Airways, Singapore Airlines, Malaysia Airlines economy)
> - Forex / arrival cash (typical AUD 1,500-3,000 buffer)
> - Forex card loading
> - Insurance (additional travel insurance if any)
>
> **First month in Australia**
> - Bond + rent first month (typical AUD by city)
> - SIM card setup (Optus/Telstra/Vodafone prepaid)
> - Public transport card (Opal/Myki/etc. + first month load)
> - Initial groceries
> - Basic furniture / kitchenware if not provided
> - Bank account setup (usually free)
> - TFN application (free)
>
> Give realistic totals for two scenarios: (1) frugal +2 grad doing diploma in regional Vic, (2) masters applicant at Go8 in Sydney. **Output as a structured cost-table breakdown — each line: phase, item, NPR cost, AUD equivalent, notes.**

---

# CATEGORY C — VISA & PROCESS

## C1. Australian visa subclasses + full pathway journey

> Comprehensive enumeration of Australian visa subclasses relevant to a Nepali student's lifetime journey, with 2026 details:
>
> **Inbound paths:**
> - Subclass 500 Student (primary applicant) — full requirements, current fee structure
> - Subclass 500 Dependent (spouse/partner) — what differs in financial, evidence, work rights (unlimited for partners of degree-level students, 48hrs/fortnight for partners of others — confirm 2026 rule)
> - Subclass 500 Dependent (child under 18) — schooling requirements, no work rights, additional medical
> - Subclass 590 Student Guardian — for parent/guardian accompanying under-18 student, requirements, age limits, AUD 8,000 evidence threshold (verify current)
>
> **During study:**
> - Subclass 500 change-of-provider rules (when can you switch unis, 6-month minimum at original provider — confirm)
> - Subclass 500 extension/renewal — process, fees, evidence required
>
> **Post-study paths:**
> - Subclass 485 Temporary Graduate — three streams (Graduate Work, Post-Higher Education Work, Second Post-Higher Education Work — confirm 2026 names), eligibility, duration (2/3/4 years depending on degree level + regional bonus), fees
> - Subclass 408 Temporary Activity — internship/research after graduation
>
> **Pathways toward PR:**
> - Subclass 482 (TSS) Temporary Skill Shortage — sponsor required, transition to 186
> - Subclass 491 Skilled Work Regional (Provisional) — state sponsorship, 5 years
> - Subclass 191 Permanent Residence (Skilled Regional) — 3 years on 491 first
> - Subclass 189 Skilled Independent — points-based PR, MLTSSL occupation
> - Subclass 190 State Nominated — state nomination, MLTSSL/STSOL
> - Subclass 186 ENS — employer sponsorship to PR
> - Subclass 858 Distinguished Talent — extremely high bar
>
> **Tourism / family-visit during study:**
> - Subclass 600 Visitor (Tourist stream / Family Sponsored stream) — for parents visiting graduating student, durations, financial evidence
>
> For each: current 2026 fee (the 1 July 2024 increase brought 500 to AUD 2,000; verify partner/child add-ons), processing time bands, what changes for Nepal AL3, work rights, study rights, family-bring rights, can you transition from X to Y directly.

## C2. Medical exam in Nepal — full deep-dive

> Step-by-step for Australia-visa-required medical exam from Nepal in 2026.
>
> **Who is the panel physician** — DHA-approved providers in Nepal: IOM Migration Health Assessment Centre (Baluwatar, Kathmandu) — full address, contact, booking URL. Are there any other DHA-approved providers in Pokhara, Biratnagar, or elsewhere? (If applicant is outside Kathmandu, do they need to travel?)
>
> **Booking process** — eMedical referral letter (Health Assessment Programme — HAP ID generated when starting visa application; can be done before lodgement), online vs phone booking, lead time (1-2 weeks typical?).
>
> **Cost** — current NPR fees broken down: standard adult medical, child medical, additional X-ray, additional HIV test (under-18s exempt?), pregnancy-related modifications, follow-up costs if anything flagged.
>
> **What's tested:**
> - Standard 501 medical (most students): general physical, chest X-ray (TB screening), height/weight/BP
> - Standard 502 medical (over 75 OR specific conditions): adds blood tests
> - HIV test required for student visas of 12+ months duration (current rule)
> - Hepatitis B/C — required for nursing/health/care worker training students
> - Additional tests if any condition flagged (cardiology, pulmonology referrals — paid out of pocket)
>
> **What fails you** — conditions that trigger refusal under PIC 4005/4006: active TB (vs latent TB which is common in Nepali demographic — what's the policy), HIV-positive (waivable in some cases), Hepatitis B-positive (training-program issue, not visa block usually). What's a "significant cost" threshold for health — current AUD figure used by DHA.
>
> **TB-specific Nepal context:** Nepal is a high-TB-burden country. Many applicants have latent TB. What does IOM Nepal's TB-screening protocol require, what proof of treatment if previously had active TB.
>
> **Pregnancy** — applicants who become pregnant between medical and visa grant — disclosure obligation, additional certificates.
>
> **Children** — different medicals for 0-2, 2-15, 15+. School certificates for children. Vaccination records.
>
> **What happens after** — IOM uploads results to DHA's eMedical system within ~5 days. Applicant doesn't get a copy by default — what to request, how much it costs.
>
> **Repeat medicals** — if visa not granted within 12 months of medical, the medical expires. What triggers re-examination.

## C3. Biometrics + VFS Global Nepal

> Biometrics process for Subclass 500 from Nepal in 2026:
>
> 1. **Who does it** — VFS Global Kathmandu (address, hours, contact) — only location in Nepal? Any options for out-of-valley applicants?
> 2. **When in the visa process** — after lodgement, DHA sends invitation letter; applicant has typically 14-28 days to attend
> 3. **Cost** — VFS service fee + DHA biometric fee — current NPR equivalent
> 4. **Booking** — online appointment via VFS Global portal, walk-in availability, fast-track service if exists
> 5. **What to bring** — invitation letter, passport, photocopy of bio page
> 6. **What's captured** — 10-digit fingerprints, facial photograph
> 7. **Processing** — typical wait at center, results returned to DHA within 24-48 hours
> 8. **Common issues** — invitation letter not received, passport name mismatch, fingerprint capture failures (manual labor / heena / damaged fingers — common in agricultural/construction-worker applicant backgrounds)
> 9. **Child biometrics** — minimum age for fingerprints (5+ typically), parent presence required

## C4. ImmiAccount + visa lodgement workflow

> Step-by-step actual visa lodgement workflow for a Nepali Subclass 500 applicant in 2026:
>
> 1. **Create ImmiAccount** at `online.immi.gov.au/lusc` — what email to use (one that won't change), security setup, password requirements
> 2. **Start new application** — selecting Subclass 500, intended start date input
> 3. **Application form (157A)** — every section walked through: personal details, addresses (residential vs postal — important for Nepal applicants who may have rural addresses), nominated course, nominated provider with CRICOS code, accompanying family members, financial capacity declaration, English proficiency declaration, health declarations
> 4. **Document upload requirements** — file format (PDF preferred), max file size per upload, total upload limit, naming conventions
> 5. **Six Genuine Student questions** — current questions in 2026 form, character limits (150 words per response confirmed), how to draft answers
> 6. **VAC payment** — current AUD 2,000 fee paid by credit card (Australian cards preferred, international accepted but with FX risk), receipt
> 7. **Submission** — what happens immediately: invitation to biometrics, medical referral (HAP ID), application status URL
> 8. **Tracking** — how to check status, what "received" vs "in progress" vs "further assessment" vs "decision-ready" mean
> 9. **Requests for more info** — Section 56 letters, typical 28-day response windows, what to provide
> 10. **Self-lodgement vs agent-led** — pros/cons. If using MARA agent, applicant still has ImmiAccount? Or agent has theirs and forwards?
> 11. **Multiple-applicant family lodgement** — primary + dependents in one application or separate?

---

# CATEGORY D — UNIVERSITIES

## D1. Australian universities Nepali students attend — full inventory

> Comprehensive list of Australian universities Nepali international students enroll in, 2024-2026. Three tiers AND beyond:
>
> **Tier 1 — Go8 (Group of Eight):** UMelb, ANU, USyd, UNSW, Monash, UQ, UWA, Adelaide
>
> **Tier 2 — Strong research / ATN / popular with Nepalis:** RMIT, UTS, Curtin, QUT, Deakin, La Trobe, Griffith, Macquarie, Western Sydney (UWS), Newcastle, Wollongong, Tasmania, Flinders, JCU, Edith Cowan, Murdoch
>
> **Tier 3 — Volume-popular, regional or specialized:** Federation, Central Queensland (CQU), Victoria University (VU), ACU, Bond, Notre Dame, Torrens, University of Canberra, Charles Sturt, Charles Darwin, Southern Cross, UNE, USQ, Avondale
>
> **Pathway colleges & specialized providers:** Trinity College Foundation (Melbourne pathway), Monash College, USyd College, UNSW College, Deakin College, La Trobe College Australia, Western Sydney The College, Curtin College, Engineering Institute of Technology, Holmes Institute, Kent Institute, Australian Pacific College (APC), Stott's College
>
> For EACH provider:
> 1. Full official name + common abbreviation
> 2. CRICOS Provider Code
> 3. Primary campuses + which are designated regional (Subclass 485 post-study work bonus)
> 4. MD 115 risk tier if known (green/amber/red) — research file mentions this — try to source actual list
> 5. International admissions: email, phone, web form, application portal URL
> 6. Application fee for international students (typical waivers)
> 7. Annual fee range (AUD) for IT/Business/Nursing masters — and bachelor's if undergraduate-heavy
> 8. Typical IELTS minimum overall + per-band
> 9. Typical Nepal TU bachelor's percentage minimum
> 10. Intake months
> 11. Nepali-student volume / cohort presence — public if available (DEEWR data, or via QS / Times international student stats)
> 12. Notable Nepal-targeted scholarships (Excellence Scholarship, Vice Chancellor's Award, country-specific awards)
> 13. Whether they accept applications direct from students (vs only via agent) — most do but some pathways/colleges prefer agents
> 14. Whether the deposit is 1 semester, 2 semesters, or different
>
> **Output as CSV ready to import** with columns: id, name, country, city, ranking_tier, md115_tier, cricos_provider_code, admissions_email, admissions_phone, admissions_url, application_fee_aud, fee_range_min_aud, fee_range_max_aud, ielts_min, ielts_per_band, tu_min_percent, intakes, regional, popular_with_nepalis, scholarships_summary, accepts_direct, deposit_semesters, notes, last_verified.

## D2. Pathway colleges + foundation programs

> Pathway colleges are how MANY Nepali students actually enter Australia (not direct bachelor's/masters entry). Deep-dive on how this works in 2026:
>
> 1. **Foundation programs** — for students whose +2 doesn't qualify directly. Trinity College Melbourne, Monash University Foundation Year, USyd Foundation Program, UNSW Foundation Studies — for each: duration (8 to 18 months variants), cost, exit pathway to which uni, IELTS minimum (typically lower — 5.5 vs 6.5 direct entry)
> 2. **Diploma-to-bachelor's** — Diploma of Business / IT / Engineering at a pathway college, then transfer to 2nd-year bachelor's at partner uni. Examples: La Trobe College Diploma → La Trobe Bachelor's, Deakin College → Deakin, Trinity → Melbourne. Cost, duration, success rate of transfer.
> 3. **Postgraduate qualifying programs** — for students who need bridging to access a masters
> 4. **English language pre-courses (ELICOS)** — when packaged before main program, accepted by DHA. Cost, duration, IELTS upgrade path.
> 5. **Bridging programs** — for grade-shy students needing a top-up year
> 6. **Visa implications** — pathway college + main uni typically issued as a "package CoE" / "packaged offer" — one visa covers both. Or separate CoEs? Confirm 2026 rules.
>
> For each major pathway provider, list partner universities + transfer requirements + fee structures.

## D3. Vocational / TAFE providers (huge Nepali demographic)

> Nepali students do not only go to universities. Vocational education is a major segment. Deep-dive:
>
> 1. **TAFE NSW, TAFE Queensland, TAFE Victoria, RMIT TAFE Division, Holmesglen Institute** — each as a provider, CRICOS code, key courses (Certificate III/IV in Commercial Cookery, Diploma of Hospitality Management, Certificate III in Individual Support — Aged Care, Diploma of Nursing, Certificate IV in Carpentry, Automotive courses)
> 2. **Private RTOs popular with Nepalis** — Australian Institute of Business and Technology (AIBT), Lonsdale Institute, Greenwich Management College, Kingsford International Institute, Sterling Business College, Stanley College, plus controversial/recently-troubled ones (some private RTOs have been suspended — flag any in DHA-risk-managed list)
> 3. **Courses** — Certificate III/IV (year-long), Diploma (1-1.5 years), Advanced Diploma (2 years). Typical fees, IELTS minimums (5.5-6.0), age requirements
> 4. **Post-study work eligibility for VET** — Subclass 485 Graduate Work stream eligibility per occupation — which trades qualify for 18-month / 2-year 485, which don't
> 5. **Subclass 491 + 191 pathway for VET grads** — regional skilled migration; cooks, automotive, carpentry all on relevant occupation lists
> 6. **DHA scrutiny of VET applicants** — high refusal rate historically; what makes a VET-student application credible

## D4. University application workflows (per university)

> For each of the top 10 Nepali-popular providers (research will identify), walk through their actual application process in 2026:
>
> 1. Application portal URL
> 2. Sequence of steps (account → form → docs → fee → submit → status check → offer → accept → deposit → CoE)
> 3. Specific documents that university requires (some need ALL transcripts since SLC, some only bachelor's; some require notarized PDFs, some accept email-attached scans)
> 4. Application fee for international (AUD typical, waived for postgrad?)
> 5. Processing time for offer (median + 80th percentile)
> 6. Conditional vs unconditional offer practice — what conditions, how to lift
> 7. Accept process — signing offer + paying deposit — what unis accept partial deposit
> 8. CoE issuance timing — same day, 1-3 days, longer
> 9. Refund policies — if visa refused, what % returned, how long, FX risk
> 10. Communication patterns — how often you'll hear back, who replies, escalation contacts
> 11. Direct-application vs via-agent — does this uni discriminate? Some require Nepali agent intermediary for direct-mail handling

---

# CATEGORY E — COURSES

## E1. Courses popular with Nepali students

> Top 30 courses Nepali students enroll in across Australia in 2024-2026. For each:
>
> 1. Course name (specific qualification + field — "Master of Information Technology" specific, not "IT")
> 2. Typical providers (which TAFEs, RTOs, universities offer it)
> 3. Duration (years)
> 4. Tuition range (AUD)
> 5. IELTS minimum (overall + per-band)
> 6. Grade minimum (TU bachelor's %)
> 7. Post-study work outcome (Subclass 485 stream eligibility, occupation on MLTSSL/STSOL?)
> 8. PR pathway plausibility (does occupation appear on Skill Priority List?)
> 9. Nepali demographic share — high / medium / low concentration
> 10. Notable variants and substitutes
>
> Cover: Master of IT / Master of Computer Science variants, Master of Business Administration, Master of Accounting, Master of Professional Accounting, Master of Nursing (entry-level + practising), Master of Public Health, Master of Project Management, Master of Engineering (Civil/Mechanical/Electrical), Master of Data Science / Master of Analytics, Master of Cybersecurity, Bachelor of IT / Computer Science, Bachelor of Business / Commerce, Bachelor of Nursing, Bachelor of Engineering, Diploma of Hospitality Management, Diploma of Business, Certificate III/IV in Commercial Cookery, Certificate III in Individual Support (Aged Care), Diploma of Nursing (Enrolled Nurse), Certificate IV/Diploma in Early Childhood Education and Care, Trade qualifications (carpentry, electrical, plumbing, automotive), Master of Education / Teaching, Master of Social Work, Bachelor of Pharmacy, Master of Pharmacy, Bachelor of Aviation / Pilot training.
>
> **Output as CSV** with columns: course_name, level, field, typical_provider, duration_years, tuition_min_aud, tuition_max_aud, ielts_min, ielts_per_band, tu_min_percent, post_study_work_stream, on_skill_priority_list, nepali_volume, notes.

## E2. Course-to-career-back-home plausibility map

> The Genuine Student narrative requires the applicant to explain post-graduation plans. For Nepali students, "I'll return to Nepal" must be plausible against actual Nepal labor-market reality. Build a map: for each major course Nepali students take, what's the credible career path back in Nepal:
>
> - **Computer Science / IT / Data Science** — Cotiviti Nepal, Leapfrog Technology, Verisk Nepal, Deerwalk, F1Soft, eSewa, Khalti, IME Group's tech arm. Sectors hiring. Typical salary band (NPR). Career growth profile.
> - **MBA / Business** — banking sector (Class A banks), consulting (Big 4 Nepal offices), corporate sector (Chaudhary Group, MAW Investments, Vishal Group), entrepreneurship
> - **Nursing** — Nepal hospital sector (Norvic, Grande, Star, Bir, TUTH), nursing colleges as faculty, NGO health sector
> - **Hospitality / cookery** — Nepal tourism boom; 5-star hotels (Hyatt, Marriott, Hilton, Soaltee, Yak & Yeti, Annapurna), Pokhara/Bandipur boutique sector, F&B chains
> - **Aged care** — Nepal has very limited aged care sector currently; this is one of the LEAST credible "return to Nepal" narratives — case officers know this
> - **Trades (cookery, carpentry, automotive, beauty)** — Nepal sector has limited modern-trade industry; this narrative is harder
> - **Engineering** — civil engineering for Nepal's infrastructure boom, hydropower sector (NEA, IPPs), mechanical/automotive for Nepal's emerging manufacturing
> - **Accounting** — ICAN-affiliated firms, audit firms (Sundar Man Shrestha, S.A.R. & Associates), corporate finance
> - **Public Health** — Nepal's expanding public health sector, NGOs, MoHP
> - **Education** — teacher shortages in Nepal's private school sector, international school market (Lincoln, Rato Bangla, KMC)
> - **Project Management** — Nepal infrastructure projects (donor-funded), construction sector
>
> For each, note which courses have LOW credibility for "return to Nepal" narrative — these students must instead credibly explain regional Australia pathway or 485 → 491 → 191 PR intent (which DHA accepts as a legitimate Genuine Student goal too).

## E3. CRICOS course code database

> Compile CRICOS course codes for every course referenced above. CRICOS codes are 6-character mandatory identifiers (e.g. "090051M" for UMelb M.IT). Many Nepali students don't know their CRICOS code when applying — making the visa form 157A blocked. Provide a lookup: university × course → CRICOS code. Source: CRICOS Public Search at `cricos.education.gov.au/public-search`.
>
> **Output as CSV** with columns: provider_name, course_name, course_level, cricos_course_code, duration_weeks, intake_months, last_verified.

---

# CATEGORY F — APPLICATION CONTENT

## F1. Genuine Student narrative — structure + examples + red flags

> Deep-dive on writing the post-23-March-2024 Genuine Student responses for the visa form 157A:
>
> **The six question areas (current 2026):**
> 1. Details of current circumstances (ties to home country, family, employment, financial)
> 2. Details of immediate course of study (why this course, why now)
> 3. Immigration history (previous student/tourist visas, refusals)
> 4. Reasons for choosing the course/provider/Australia (why not Nepal university for same?)
> 5. Prospective post-study plans (Australia 485 path? Return to Nepal? Both?)
> 6. Other relevant information
>
> For EACH section:
> - DHA's actual word limit (currently 150 words/section confirmed?)
> - What case officers look for
> - 3 examples of strong responses (annotated with what works)
> - 3 examples of weak responses (annotated with red flags)
> - Nepal-specific framings that work / don't work
>
> **Red flag patterns case officers catch (cite migration agents):**
> - Generic "Australia is a great country" intros
> - Course-career mismatch (Nepali +2 humanities student applying for Master of Data Science with no math/CS background)
> - Vague post-study plans ("I'll find a job" without specifics)
> - Contradictions between sections (claims tied to family, but applying with no family in Nepal)
> - Boilerplate phrasing across hundreds of applications (DHA pattern-detects)
> - Sponsor mismatch (claims uncle sponsor but uncle has no provable income)
> - Course selection that doesn't make sense ("Master of Aged Care" when applicant has banking background — only credible if explicit career-pivot story)
>
> **Annotated examples** for Nepali applicants — find leaked or shared examples from migration-agent forums (KIEC, Aussizz, etc.) and dissect what makes them work.

## F2. Statement of Purpose — per university

> Most Australian universities require an SOP at application (distinct from the visa GS — different audience, different goal). Structure varies by uni:
>
> - **USyd**: 500-700 words, specific structure they request
> - **Melbourne**: prefer 1000-1500 words
> - **Monash**: typically 600-800 words
> - **UNSW**: course-dependent
> - **RMIT**: course-dependent
>
> For each top-10 university, give:
> 1. SOP word count / page limit
> 2. Specific prompts (e.g. "Why this course?", "Why this university?", "Career goals?")
> 3. What admissions readers weigh (academic fit vs career narrative vs financial readiness)
> 4. Common mistakes
> 5. Sample SOP template adapted for Nepali applicant context
>
> Also: when an SOP is required vs CV-only vs interview-only.

## F3. Recommendation letters

> For Australian masters applications, typical requirement is 2 recommendation letters. From Nepal context:
>
> 1. **Who to ask** — TU/KU/PU faculty who taught core subjects (academic ref), employer / direct manager (professional ref). What rank of faculty (lecturer / asst professor / prof) DHA + uni admissions weigh more.
> 2. **What to ask for** — format guidance, length (200-400 words typical), what to include (specific examples of student work, not generic praise)
> 3. **How to ask** — typical Nepal academic culture: give the recommender a draft + your CV + statement, ask them to personalize and sign on university letterhead
> 4. **University letterhead requirements** — must be on official letterhead, signed, with email/phone of recommender, ideally stamped
> 5. **English vs Nepali** — letters in English required for international apps; if professor's English is weak, what to do
> 6. **Recommender contactability** — admissions sometimes verify via direct email — what makes a recommender contactable (their .edu email, not Gmail)
> 7. **Sample letter** for Nepali academic context
> 8. **Common rejection signals** — letters too generic, recommender has no link to course relevance, letterhead photocopy that looks tampered

---

# CATEGORY G — PEOPLE & AGENTS

## G1. Licensed Nepal education agents

> The Nepal education agent ecosystem in 2026. Comprehensive view:
>
> 1. **MoEST-recognized agent list** — where to find current registered education consultancies in Nepal. Total count.
> 2. **Major players** — IDP, Edwise, KIEC, AECC Global, IEC Abroad, Global Reach, Aspire to Educate, Pathway Education Consulting, OEC Global. For each: locations, services offered, fee transparency, university partnerships (some are "agents of record" for specific unis getting commission)
> 3. **Commission economics** — typical commission an agent gets from an Australian university per enrolled student (range AUD 1,500-6,000 depending on uni tier). This is paid BY the uni, but the student's tuition pricing already includes it. So agent services are "free to student" in nominal terms but baked into fee structure.
> 4. **Conflict of interest** — agent earns commission from specific unis, so may steer students to commission-rich unis vs better-fit unis
> 5. **What agents do well** — visa application paperwork, university shortlisting, financial guidance, deposit handling, follow-up with university admissions
> 6. **What agents do poorly** — GS narrative drafting (template-driven, often refused), tier-2/3 university recommendations (commission-driven), financial advice (limited)
> 7. **Costs students pay** — some agents charge upfront NPR fees too (typical NPR 25,000-100,000 service fees), tuition deposit handling fees, IELTS preparation classes
> 8. **Red flags** — agents promising guaranteed visas, agents asking for full tuition upfront, agents refusing to disclose commission
> 9. **The agent-direct decision** — when does direct application make sense vs agent-led

## G2. MARA-registered migration agents

> Distinction between Australia-side **migration agents** (MARA-registered) and Nepal-side **education agents**:
>
> 1. **MARA agents** are registered with the Office of the Migration Agents Registration Authority in Australia. Required for fee-charged visa advice. Education agents in Nepal aren't typically MARA-registered.
> 2. **MARA agent database** — `mara.gov.au` searchable
> 3. **When to use MARA agent** — complex cases (prior refusal, sponsor complications, GS difficulties, AL3 cases needing extra care, family applications)
> 4. **Cost** — typically AUD 1,500-5,000 for student visa, more for refusal-recovery
> 5. **What MARA agents do** — handle ImmiAccount lodgement, draft GS responses, communicate with DHA on applicant's behalf via authorized representative status
> 6. **Nepal-based MARA agents** — list specific MARA-registered agents who serve Nepal (some are based in Sydney/Melbourne with Nepal-facing practice)
> 7. **MARA vs education agent** — sometimes the same person/firm has both. Conflict of interest issues if education agent also charges visa fee

---

# CATEGORY H — POST-DECISION

## H1. Pre-arrival logistics

> Everything between "visa granted" and "boarding flight":
>
> 1. **Flight booking** — typical Kathmandu → Sydney/Melbourne routes (via Doha QR, Singapore SQ, Kuala Lumpur MH, Bangkok TG). Direct flights none. Best-time-to-book windows (advance purchase 60-90 days saves NPR 30,000-50,000). Student concession/discount if any.
> 2. **Accommodation pre-booking** — university residences (apply through uni once CoE issued; typically 4-12 month leases), private student accommodation (UniLodge, Iglu, Scape, Y Suites — typical AUD/week ranges by city), share housing via Flatmates.com.au / Gumtree (cheaper, harder for Nepali student to secure pre-arrival without local connections), AirBnB / hotel temporary stay (first 1-2 weeks while finding longer-term)
> 3. **Forex / arrival cash buffer** — typical AUD 1,500-3,000 recommended, loaded on forex card (NIC Asia, Wise, Revolut, Nabil) vs cash
> 4. **Travel insurance** — beyond OSHC (which only covers AUD medical), additional travel insurance for trip Kathmandu → AU? Most students skip. What goes wrong if you do.
> 5. **Packing & customs** — what's allowed into Australia, what's heavily restricted (food items — strict biosecurity), AUD 10,000 cash declaration rule
> 6. **Airport pickup** — university-provided pickup services (many Go8 unis offer free pickup for first arrivals), paid services, taxi/Uber from airport to typical student accommodations
> 7. **AUD bank account opening from Nepal** — CommBank International Student Account opens online from Nepal (verify 2026 process), Nabil Bank's Nepal-side AUD account partnership, ANZ Migrant Banking — pros/cons of each
> 8. **SIM card pre-arrival** — buying Australian SIM (Optus/Telstra/Vodafone) before departure vs at Sydney airport
> 9. **Important documents to carry physical** — passport, visa grant letter, CoE, offer letter, OSHC policy, accommodation booking, medical exam letter, IELTS scorecard, transcripts, recommendation letters (universities sometimes ask for originals on enrollment), affidavit of support, ALL bank statements proving funds (Border Force sometimes asks)
>
> What's commonly overlooked, what students discover too late.

## H2. Post-arrival admin (first 30 days)

> Detailed checklist for the first 30 days in Australia:
>
> **Day 1-3:**
> - Airport arrival, taxi/Uber, hotel/temp accommodation
> - Activate Australian SIM
> - Confirm OSHC policy is active
> - Find permanent accommodation (if not pre-booked)
>
> **Week 1:**
> - Tax File Number (TFN) application via ATO — online via `ato.gov.au`, free, processed in 28 days. Required for working legally + tax refund
> - Australian bank account — if not opened from Nepal, walk into branch with passport + visa grant + accommodation lease. CommBank, ANZ, NAB, Westpac student accounts (zero monthly fee, no minimum balance)
> - Public transport card — Sydney Opal / Melbourne Myki / Brisbane Translink / Perth SmartRider — student discounts (which states give international students concession — varies, mostly NSW does not, VIC does not, ACT does)
> - SIM card upgrade or post-paid plan
> - Medicare card NOT required (Nepal is not reciprocal — OSHC primary). But how to use OSHC at a GP, what's covered, what's not
>
> **Week 2-3:**
> - University enrolment in person — bring originals
> - Class enrolment (subject selection via student portal)
> - Student ID card
> - Library card
> - Public transport top-up
> - International student services orientation
>
> **Week 4:**
> - First class
> - Part-time job hunting (see H3)
> - Open superannuation account if planning to work
> - Connecting with Nepali student community (Nepalese Students Association, social media groups by uni)
>
> **48-hour fortnightly work rule** — when this starts (visa says "during course term, not on holiday periods"), how to track hours, ATO PAYG income tax basics

## H3. Working as a student — Nepali context

> Realistic guide to working as a student in Australia from Nepali perspective:
>
> 1. **The 48-hour/fortnight limit** — counted across all jobs, fortnight starts on a specific day (verify rule), holiday period exemption (unlimited hours during officially-recognized course holidays), what counts as a "fortnight"
> 2. **Where Nepali students typically work** — hospitality (restaurants/cafes — Indian/Nepali-owned cluster), retail (corner stores), food delivery (UberEats/DoorDash/Menulog — note tax/employment classification issues), aged care (after relevant cert), university research assistant, internships, ride-sharing (limited)
> 3. **Wage levels** — current AU minimum wage 2026, hospitality casual penalty rates (Saturday/Sunday/public holiday), typical actual earned per hour for international students (some employers underpay — risks)
> 4. **Tax basics** — TFN required, ATO progressive tax (resident vs non-resident status — most students are residents for tax), tax-free threshold AUD 18,200, end-of-year tax return obligation
> 5. **Underpayment & exploitation** — common in Nepali student community, what counts as wage theft, Fair Work Ombudsman channels for complaints (note: complaining doesn't trigger visa consequence if student was working within 48-hour limit)
> 6. **Sending money home** — Wise, Remitly, IME's Australia branch — typical fees, FX rates, NRB rules on incoming remittance from student-source vs employment-source (different reporting thresholds)
> 7. **Superannuation** — employer contribution (currently 11.5% in 2026, rising to 12%), what happens to super on visa departure (Departing Australia Superannuation Payment scheme — DASP — can be claimed back, taxed at 65%)

---

# CATEGORY I — FAILURE MODES & RECOVERY

## I1. Refusal reasons + frequency (2024-2026)

> What are Nepali Subclass 500 applications actually refused for? Quantitative + qualitative:
>
> 1. **Official DHA refusal categories** — Genuine Student requirement not met (PIC 4011), insufficient financial capacity (PIC 4012), English language requirement (PIC 4013), character (PIC 4001), health (PIC 4005/4006), document fraud (PIC 4020 misrepresentation — most serious, triggers 3-year ban)
> 2. **Frequency by category** — search DHA annual reports, Senate Estimates evidence, migration-practitioner surveys. Build a percentage breakdown for Nepal-specific applications.
> 3. **Real-world stories** — collected anonymized refusal stories from migration-agent blogs, forums, AHC Lawyers case studies. Patterns:
>   - "Worked at a tea stall, applied for MBA in Hospitality with no employment letter"
>   - "Deposit of NPR 4 million 3 days before visa lodgement"
>   - "Sponsor claimed AUD 50K income but couldn't show tax returns"
>   - "Applied for Master of Aged Care from CS background, no career-pivot rationale"
>   - "GS narrative copy-pasted from agent template, identical to 50 other applications"
>   - "Course at non-MoEST-recognized RTO, NOC refused, visa refused"
>   - "Prior tourist visa overstay 6 months earlier flagged at biometrics"
>   - "Document fraud — fake bank statement detected via SWIFT cross-check"
> 4. **Refusal rate by university tier** — Go8 vs Tier-2 vs pathway-college applicants have very different refusal rates. Quantify if findable.

## I2. Refusal recovery + appeal pathways

> What can a refused applicant do?
>
> 1. **Section 351 Ministerial Intervention** — when applicable, success rates (very low)
> 2. **Administrative Appeals Tribunal (AAT)** — for onshore refusals only; offshore (most Nepal applicants) cannot AAT. Cost AUD 3,374 (verify 2026), processing 12+ months
> 3. **Re-application** — when can you re-apply? Immediately for some categories, after PIC 4020 ban (3 years) for misrepresentation
> 4. **Strengthening a re-application** — what to change: address the refusal grounds head-on in new GS narrative, provide additional evidence of weakness flagged, change sponsorship structure if financial concern, change course if course-career mismatch, etc.
> 5. **Disclosure obligation** — must disclose refusal in next application. PIC 4020 specifically targets non-disclosure.
> 6. **Pathway visa via third country** — e.g. study in Nepal/India for a year while strengthening profile, or pathway via diploma in Australia (Subclass 500 for shorter course) building to bachelor's
> 7. **MARA agent for refusal recovery** — when worth the cost

---

# CATEGORY J — ENGLISH TESTS & SCHOLARSHIPS

## J1. English-test alternatives — Nepal context

> Comprehensive comparison of all English tests Australia DHA accepts in 2026:
>
> 1. **IELTS Academic** — by British Council + IDP. Nepal centers: Kathmandu (BC + IDP), Pokhara (BC + IDP), Biratnagar (IDP), Birgunj (IDP). Cost NPR ~28,000-30,000. Validity 2 years. Score range 0-9. DHA minimum 6.0 academic, but uni admission usually 6.5+.
> 2. **PTE Academic (Pearson Test of English)** — Pearson Vue test. Nepal centers (Kathmandu typically). Cost NPR ~25,000-27,000. Validity 2 years. Score range 10-90. DHA minimum currently PTE 50, equivalent to IELTS 6.0. Note: differentiated component scores since 7 Aug 2025 (per deep research). Pros: faster results (often within 48 hours vs IELTS 7-13 days), perceived easier writing section by some students.
> 3. **TOEFL iBT** — ETS test. Nepal centers (limited — typically Kathmandu). Cost NPR ~25,000. Validity 2 years. Note: must be in-person (TOEFL iBT Home Edition NOT accepted by DHA). Score 0-120. DHA minimum updated to 67 from 7 Aug 2025 (was 64).
> 4. **Cambridge C1 Advanced (CAE)** — Cambridge English. Limited Nepal availability — usually Kathmandu only. Cost similar to TOEFL. Validity 2 years (some unis treat as lifetime).
> 5. **OET (Occupational English Test)** — for health professionals (nursing, medicine). Nepal centers TBD. Cost. Validity 2 years.
> 6. **LANGUAGECERT Academic** — newer acceptance by DHA. Nepal availability uncertain.
> 7. **Michigan English Test (MET)** — also DHA-accepted, very limited Nepal availability.
>
> **Duolingo English Test** — explicitly NOT accepted by DHA for Subclass 500 (confirm 2026). Some universities accept for admissions only, then student must take IELTS/PTE for visa.
>
> **Comparison table:** test → cost → result speed → Nepal availability → DHA minimum → common Nepali student preference
>
> **Strategy:** when does it make sense to take PTE over IELTS for Nepali student? (Faster results before deposit deadline.) When TOEFL? (Cheaper sometimes, but less practice material in Nepal.)

## J2. Scholarships for Nepali international students

> Comprehensive scholarship list for Nepali students going to Australia in 2026:
>
> **Federal Australian:**
> - Australia Awards Scholarship — full tuition + stipend + airfare. Annual NEPAL quota (typically 5-10 students). MUST return to Nepal for minimum 2 years. Eligibility, application timing (typically opens Feb closes April for following Jan/Feb intake), past success rates from Nepal.
> - Destination Australia (regional study scholarship) — AUD 15,000/year for studying at a regional campus. Through specific universities.
> - Endeavour Postgraduate (if still running in 2026)
>
> **University-specific:**
> - University of Sydney International Student Award
> - UNSW International Scientia
> - Monash International Merit Scholarship
> - UMelb Graduate Research Scholarship
> - RMIT International Scholarship
> - Deakin Vice Chancellor's International Scholarship
> - La Trobe Excellence Scholarship
> - Queensland Vice Chancellor's Scholarship
> - and ~20 more
>
> For each: amount (AUD), eligibility (academic + need + nationality), application process (separate vs auto-considered with admission), deadline, success rate from Nepal if known.
>
> **Subject-specific:**
> - Engineering, IT, Nursing, MBA — specific scholarships
>
> **External & private:**
> - DAFI (UNHCR refugee scholarship) — Nepal context, Bhutanese-Nepali community eligibility
> - Nepal Britain Society
> - Nepalese Australian community scholarship initiatives
> - Private corporate sponsorships (NIC Asia, Nabil — limited)
>
> **What disqualifies:** prior visa refusal, late application, GPA threshold not met, IELTS not met
>
> **Application strategy** — when to apply (parallel with main uni app or separately), how scholarship affects visa file (mention in GS narrative as strengthener)
>
> **Output as CSV** with columns: scholarship_name, provider, type, amount_aud, level, eligibility_summary, application_url, deadline, requires_separate_app, nepali_volume_known, last_verified.

---

# Output schemas summary

For data-heavy topics, use these CSV/JSON schemas to make integration easy:

## Universities CSV (D1)
```csv
id,name,country,city,ranking_tier,md115_tier,cricos_provider_code,admissions_email,admissions_phone,admissions_url,application_fee_aud,fee_range_min_aud,fee_range_max_aud,ielts_min,ielts_per_band,tu_min_percent,intakes,regional,popular_with_nepalis,scholarships_summary,accepts_direct,deposit_semesters,notes,last_verified
```

## Courses CSV (E1)
```csv
course_name,level,field,typical_provider,duration_years,tuition_min_aud,tuition_max_aud,ielts_min,ielts_per_band,tu_min_percent,post_study_work_stream,on_skill_priority_list,nepali_volume,notes
```

## Banks CSV (B2)
```csv
bank_name,license_class,product_name,loan_min_npr,loan_max_npr,interest_rate_2026,tenure_max_years,collateral_required,sanction_pre_visa,sanction_post_visa,processing_fee_npr,branch_count,url,last_verified
```

## CRICOS codes CSV (E3)
```csv
provider_name,course_name,course_level,cricos_course_code,duration_weeks,intake_months,last_verified
```

## Scholarships CSV (J2)
```csv
scholarship_name,provider,type,amount_aud,level,eligibility_summary,application_url,deadline,requires_separate_app,nepali_volume_known,last_verified
```

## Documents inventory CSV (A1)
```csv
document_name,document_name_nepali,stage,issuing_authority,how_to_obtain,official_fee_npr,facilitation_cost_npr,processing_time_standard,processing_time_urgent,validity_for_dha,required_attachments,notarization_needed,translation_needed,common_rejection_reasons,who_obtains,source_url,confidence,last_verified
```

## Visa subclasses CSV (C1)
```csv
subclass_code,subclass_name,category,fee_aud_2026,processing_time_band,work_rights,study_rights,family_rights,duration,key_requirements,transitions_to,al3_notes,source_url,confidence,last_verified
```

## Course-to-career map CSV (E2)
```csv
course_field,nepal_career_path,hiring_employers,salary_band_npr,return_credibility,pr_pathway_note,notes,source_url,confidence,last_verified
```

## English tests CSV (J1)
```csv
test_name,provider,nepal_centers,cost_npr,result_speed,validity_years,score_range,dha_minimum,typical_uni_minimum,home_edition_accepted,notes,source_url,confidence,last_verified
```

---

# What integration looks like once data lands

Once you bring back research, here's how each topic maps to code:

1. **A1, A2, A3, A4, A5 (documents)** → extend `lib/documents/types.ts` (likely +10-15 new kinds), add plan rules in `lib/plan/generator.ts`, add Nepal-specific helper pages under `app/(app)/journey/`
2. **B1, B2 (finance)** → new `lib/data/source/nepal-banks.ts` constant + finance editor enhancement, scoring engine integration
3. **B3, B4 (cost mechanics)** → new `/journey/tuition-payment` and `/journey/total-cost` pages; cost-estimate tab on /matches finally gets data
4. **C1 (visa classes)** → new `lib/data/destination/australia-visa-classes.ts`; matches page or new `/visa` route surfaces what applies
5. **C2, C3, C4 (process)** → new `/journey/visa-lodge` page with medical, biometrics, ImmiAccount walkthroughs
6. **D1, D2, D3 (universities)** → new migration `20260606_seed_universities_v2.sql` replacing the current 15 unis with ~50; add columns `md115_tier`, `cricos_provider_code`, `admissions_email`, `application_fee_aud`, `popular_with_nepalis`
7. **D4 (application workflows)** → new per-uni guidance content (probably static MDX)
8. **E1, E2, E3 (courses)** → expanded program seed (currently 64 → likely 200+), CRICOS codes in seed, course-career fit data drives plan-generator hints
9. **F1, F2, F3 (application content)** → new pages `/journey/genuine-student`, `/journey/sop-templates`, `/journey/recommendation-letters`
10. **G1, G2 (people & agents)** → static content under `/journey/working-with-agents`
11. **H1, H2, H3 (post-decision)** → new pages `/journey/pre-departure`, `/journey/post-arrival`, `/journey/working`
12. **I1, I2 (failure modes)** → static content under `/journey/refusal-recovery`; plan generator gets per-refusal-reason rules
13. **J1 (English tests)** → expanded `lib/data/source/nepal.ts` test centers, English-test-comparison page
14. **J2 (scholarships)** → finally populates the Scholarships tab on `/matches`

Total integration after data lands: probably 8-20 hours of focused work, depending on how comprehensive the data returned is.

---

# Priority order — which topics to tackle first

If you can't run all 25 in parallel, here's the order by impact-per-research-effort:

**Tier 1 (highest impact, easiest to integrate):**
- D1 — Universities (replaces a small seed with a comprehensive one; massive content jump)
- A3, A4 — NOC + PCC (closes the biggest journey-gap finding — these documents are universal-required and completely missing)
- B2 — Bank loan products (Class A bank list is referenced in our copy but never shown)
- I1, I2 — Refusal patterns (high learning value; informs plan generator + content)

**Tier 2 (high impact, more integration work):**
- E1, E3 — Courses + CRICOS codes (expands beyond CS/Nursing/Business)
- C2, C3, C4 — Visa process steps (turns "lodge your visa" into actionable guidance)
- B1, B4 — Proof-of-funds + total-cost transparency (closes financial credibility gap)
- F1 — GS narrative (turns a one-line plan item into a real product feature)

**Tier 3 (substantial value, longer to integrate):**
- D2, D3 — Pathway colleges + VET (uncovered demographic; would expand TAM)
- H1, H2, H3 — Post-decision journey (closes the "5 stages but only stage 1 works" gap)
- F2, F3 — SOP + recommendation letters (application-stage content)

**Tier 4 (polish + edge cases):**
- A1, A2, A5 — Document inventory + notarization + ward-level (deep but lower-frequency)
- C1 — Visa subclass enumeration (mostly background context)
- G1, G2 — Agent ecosystem (informational only)
- J1, J2 — English tests + scholarships (incremental improvement)

---

# Notes for the research agents

A few practical tips when handing prompts to external research agents:

- **Gemini Deep Research** is best for the citation-heavy topics (A1, A2, B2, D1, J2) — it produces long structured reports with sources
- **Perplexity Pro** is best for the time-sensitive topics (anything involving current 2026 fee figures, current rates, current rules) because it does live web searches
- **ChatGPT with search** works well for narrative topics (F1, I1, I2) where you want anecdotal/example-driven content
- **Claude direct** is best for synthesis after multiple agents return — combining and resolving contradictions

When the data comes back, paste it into this repo at `docs/research-briefs/raw-results/[topic-id].md` and ping me. I'll handle the integration.
