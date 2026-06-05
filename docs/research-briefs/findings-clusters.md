# Entity+attribute clusters (generated, for review)

Rows sharing `category + entity + attribute`. NOTE: most are **atomic enumerations** — one attribute legitimately split into many true rows (e.g. a NOC attachment list, the components of financial-capacity evidence), NOT contradictions. Treat this as a *review aid*, not a conflict list. Genuine contradictions (e.g. two different interest rates for one bank) are resolved at **integration time, per target**, where they actually surface.

**41** clusters · **41** multi-valued (claims enumerate or differ in wording) · **0** byte-identical duplicates.

### G1 multi-valued — [A] oshc / application details

- `A.009` (primary/gov, 2025-11) If the student or agent arranged OSHC, the visa application should include the insurer name, policy start date, policy end date and policy number.
- `A.010` (primary/gov, 2025-11) If the education provider arranged OSHC, the visa application should include the insurer name and policy dates, and the policy number is not required.

### G2 multi-valued — [A] subclass 500 visa / financial capacity coverage

- `A.011` (primary/gov, 2025-11) Student visa financial evidence must cover travel costs.
- `A.012` (primary/gov, 2025-11) Student visa financial evidence must cover 12 months of living costs.
- `A.013` (primary/gov, 2025-11) Student visa financial evidence must cover tuition fees for the student and any accompanying family members.
- `A.014` (primary/gov, 2025-11) Student visa financial evidence must cover school costs for any school-aged dependants.

### G3 multi-valued — [A] australian biometrics collection centre / nepal location

- `A.029` (primary/gov, 2026-03) DHA lists Kathmandu as an Australian Biometrics Collection Centre location in Nepal.
- `A.030` (primary/gov, 2026-03) DHA lists Pokhara as an Australian Biometrics Collection Centre location in Nepal.

### G4 multi-valued — [A] birth registration / required attachments

- `A.060` (primary/gov, 2023-02) Kathmandu Metropolitan City’s ward-service sheet lists copies of both parents’ citizenship certificates as birth-registration attachments.
- `A.061` (primary/gov, 2023-02) Kathmandu Metropolitan City’s ward-service sheet lists a copy of the parents’ marriage-registration certificate as a birth-registration attachment.

### G5 multi-valued — [A] noc / use case

- `A.065` (primary/gov, undated) The NOC portal says the certificate helps with education loans.
- `A.066` (primary/gov, undated) The NOC portal says the certificate helps with visa applications.

### G6 multi-valued — [A] noc / required attachment

- `A.067` (primary/gov, undated) The official NOC attachment list includes academic certificates and transcripts.
- `A.068` (primary/gov, undated) The official NOC attachment list includes a citizenship certificate.
- `A.069` (primary/gov, undated) The official NOC attachment list includes a passport.
- `A.070` (primary/gov, undated) The official NOC attachment list includes a certificate of eligibility, admission letter, offer letter, acceptance letter or I-20 letter.
- `A.071` (primary/gov, undated) The official NOC attachment list includes an invoice letter.
- `A.072` (primary/gov, undated) The official NOC attachment list includes an equivalence certificate if the applicant passed from a non-Nepali education board.
- `A.073` (primary/gov, undated) The official NOC attachment list includes English-proficiency certificates.

### G7 multi-valued — [A] pokhara university / online service

- `A.075` (primary/university, undated) Pokhara University says its online services include applications for academic transcripts.
- `A.076` (primary/university, undated) Pokhara University says its online services include applications for migration certificates.

### G8 multi-valued — [A] police clearance certificate / application route

- `A.095` (primary/gov, undated) Nepal Police’s OPCR service says applicants can apply online from home or through the nearest cyber.
- `A.096` (primary/gov, undated) Nepal Police’s OPCR service says the character-certificate service is available through Nagarik App.

### G9 multi-valued — [A] income-source certification / required attachment

- `A.104` (primary/gov, undated) Lalitpur Metropolitan City’s FAQ says rental-income certification requires a copy of the tenancy agreement.
- `A.105` (primary/gov, undated) Lalitpur Metropolitan City’s FAQ says business or agricultural-business income certification requires a copy of the business-registration certificate.
- `A.106` (primary/gov, undated) Lalitpur Metropolitan City’s FAQ says business or agricultural-business income certification requires a copy of the audit report.
- `A.107` (primary/gov, undated) Lalitpur Metropolitan City’s FAQ says salary or pension income certification requires the original letter from the relevant institution.
- `A.108` (primary/gov, undated) Lalitpur Metropolitan City’s FAQ says fixed-deposit or savings-interest income certification requires a bank certificate copy and the original.

### G10 multi-valued — [A] land valuation / required attachment

- `A.112` (primary/gov, undated) Lalitpur Metropolitan City’s FAQ says land valuation at current market rate requires a copy of the land ownership certificate (Lalpurja).
- `A.113` (primary/gov, undated) Lalitpur Metropolitan City’s FAQ says land valuation at current market rate requires a copy of the current fiscal year’s land-tax payment receipt.

### G11 multi-valued — [A] confirmation of enrolment / document contents

- `A.118` (primary/university, undated) The University of Wollongong says a CoE is an official document that shows course start and end dates.
- `A.119` (primary/university, undated) The University of Wollongong says a CoE is an official document that shows fees paid and total fees to be paid for the course.

### G12 multi-valued — [B] subclass 500 student visa / financial-capacity evidence category

- `B.007` (primary/gov, undated) DHA lists money deposits held with a financial institution as an acceptable evidence path for student financial capacity.
- `B.008` (primary/gov, undated) DHA lists a loan with a government or financial institution as an acceptable evidence path for student financial capacity.
- `B.009` (primary/gov, undated) DHA lists a scholarship or sponsorship as an acceptable evidence path for student financial capacity.
- `B.010` (primary/gov, undated) DHA lists annual income of parents or partner as an acceptable evidence path for student financial capacity.

### G13 multi-valued — [B] noc certificate / required document

- `B.017` (primary/gov, undated) The MoEST NOC portal lists a citizenship certificate as a necessary document.
- `B.018` (primary/gov, undated) The MoEST NOC portal lists an academic certificate as a necessary document.
- `B.019` (primary/gov, undated) The MoEST NOC portal lists guardian citizenship as a necessary document.
- `B.020` (primary/gov, undated) The MoEST NOC portal lists an old NOC as a necessary document.

### G14 multi-valued — [B] vfs global nepal / service scope

- `B.099` (practitioner/consultancy, undated) VFS Nepal provides Australia visa-form lodgement services.
- `B.100` (practitioner/consultancy, undated) VFS Nepal provides Australia biometric-collection services.

### G15 multi-valued — [B] university of sydney / accepted payment partner

- `B.101` (primary/university, undated) The University of Sydney accepts Flywire for international payments.
- `B.102` (primary/university, undated) The University of Sydney accepts Convera for international payments.

### G16 multi-valued — [B] convera globalpay for students / payment method

- `B.115` (primary/blog, undated) Convera says its student platform supports bank transfers.
- `B.116` (primary/blog, undated) Convera says its student platform supports credit-card payments.
- `B.117` (primary/blog, undated) Convera says its student platform supports debit-card payments.
- `B.118` (primary/blog, undated) Convera says its student platform supports e-wallet payments.

### G17 multi-valued — [B] university of sydney / offer-payment instruction

- `B.130` (primary/university, undated) The University of Sydney’s international guide says offer instructions include first-semester tuition-fee due dates.
- `B.131` (primary/university, undated) The University of Sydney’s international guide says offer instructions include OSHC-fee due dates.

### G18 multi-valued — [B] university of sydney / refund rule

- `B.132` (primary/university, undated) The University of Sydney refunds 90% of tuition fees paid when an international student withdraws before the semester starts.
- `B.133` (primary/university, undated) The University of Sydney refunds 50% of tuition fees paid when an international student withdraws after semester start but before census.

### G19 multi-valued — [C] document checklist tool / required input

- `C.009` (primary/gov, 2025-11) The Document Checklist Tool asks for the student’s country of passport.
- `C.010` (primary/gov, 2025-11) The Document Checklist Tool asks for the education provider or provider CRICOS code.

### G20 multi-valued — [C] subclass 500 student visa / financial-capacity component

- `C.011` (primary/gov, 2025-11) A Subclass 500 applicant must show funds for travel costs.
- `C.012` (primary/gov, 2025-11) A Subclass 500 applicant must show funds for 12 months of living costs.
- `C.013` (primary/gov, 2025-11) A Subclass 500 applicant must show funds for tuition fees for the student and accompanying family members.
- `C.014` (primary/gov, 2025-11) A Subclass 500 applicant must show funds for school costs for school-aged dependants.

### G21 multi-valued — [C] subclass 485 / stream name

- `C.039` (primary/gov, 2026-05) The current DHA name of one Subclass 485 stream is Post-Higher Education Work.
- `C.040` (primary/gov, 2026-05) The current DHA name of one Subclass 485 stream is Post-Vocational Education Work.
- `C.041` (primary/gov, 2026-03) The current DHA name of one Subclass 485 stream is Second Post-Higher Education Work.

### G22 multi-valued — [C] nepal panel physicians / listed clinic

- `C.084` (primary/gov, 2024-09) DHA’s Nepal location page surfaced IOM Medical Damak as a panel physician location.
- `C.085` (primary/gov, 2024-09) DHA’s Nepal location page surfaced Australia and New Zealand Immigration Examination Center as a Nepal panel physician location.

### G23 multi-valued — [C] genuine student questions / extra-question trigger

- `C.135` (primary/gov, 2025-11) There is an additional Genuine Student question for applicants who previously held a Student visa.
- `C.136` (primary/gov, 2025-11) There is an additional Genuine Student question for applicants lodging in Australia from a non-student visa.

### G24 multi-valued — [C] subclass 500 student visa application / oshc detail requirement

- `C.137` (primary/gov, 2025-11) If the student or agent organised OSHC, the application form requires the name of the health insurer, the policy start and finish dates, and the policy number.
- `C.138` (primary/gov, 2025-11) If the education provider arranged OSHC, the application form requires the insurer name and the policy start and finish dates, but not the policy number.

### G25 multi-valued — [E] torrens university / top course for nepalese students

- `E.025` (primary/university, undated) Torrens University lists Bachelor of Business as a top course for Nepalese students.
- `E.026` (primary/university, undated) Torrens University lists Master of Information Technology (Advanced) as a top course for Nepalese students.
- `E.027` (primary/university, undated) Torrens University lists Master of Business Administration (Advanced) as a top course for Nepalese students.
- `E.028` (primary/university, undated) Torrens University lists Bachelor of Information Technology as a top course for Nepalese students.
- `E.029` (primary/university, undated) Torrens University lists Master of Public Health (Advanced) as a top course for Nepalese students.

### G26 multi-valued — [E] kiec / high-demand course category

- `E.036` (practitioner/consultancy, undated) KIEC says high-demand courses for Nepali students in Australia in 2026 include nursing and allied health.
- `E.037` (practitioner/consultancy, undated) KIEC says high-demand courses for Nepali students in Australia in 2026 include IT.
- `E.038` (practitioner/consultancy, undated) KIEC says high-demand courses for Nepali students in Australia in 2026 include engineering.
- `E.039` (practitioner/consultancy, undated) KIEC says high-demand courses for Nepali students in Australia in 2026 include early childhood education.
- `E.040` (practitioner/consultancy, undated) KIEC says high-demand courses for Nepali students in Australia in 2026 include selected TAFE trades.

### G27 multi-valued — [E] rmit master of information technology / annual tuition

- `E.052` (primary/university, undated) RMIT Master of Information Technology has a 2026 annual fee of AUD 43,200 in the RMIT International Course Guide 2026.
- `E.054` (primary/university, undated) The RMIT Master of Information Technology course page shows an international annual fee of AUD 44,160 for 2026.

### G28 multi-valued — [E] university of melbourne graduate admission / grade assessment factor

- `E.121` (primary/university, undated) The University of Melbourne says overseas grades are assessed based on institution accreditation.
- `E.122` (primary/university, undated) The University of Melbourne says overseas grades are assessed based on subject grading.
- `E.123` (primary/university, undated) The University of Melbourne says overseas grades are assessed based on pass marks.

### G29 multi-valued — [E] leapfrog technology / kathmandu opening

- `E.127` (primary/blog, undated) Leapfrog’s Kathmandu openings include a Senior Full-Stack Engineer - Golang role.
- `E.128` (primary/blog, undated) Leapfrog’s Kathmandu openings include a Tech Lead, AI role.

### G30 multi-valued — [E] uts master of pharmacy / compliance requirement

- `E.170` (primary/university, undated) UTS Master of Pharmacy applicants must obtain a Working With Children Check.
- `E.171` (primary/university, undated) UTS Master of Pharmacy applicants must obtain an Australian National Police Check.

### G31 multi-valued — [E] uts master of pharmacy / post-degree registration step

- `E.173` (primary/university, undated) UTS Master of Pharmacy graduates must complete a compulsory pre-registration training period.
- `E.174` (primary/university, undated) UTS Master of Pharmacy graduates must complete an Intern Training Program to be eligible for pharmacist registration.

### G32 multi-valued — [F] genuine student questionnaire / mandatory prompt

- `F.006` (primary/gov, 2026-01) One Genuine Student prompt asks for details of the applicant’s current circumstances, including ties to family, community, employment and economic circumstance…
- `F.007` (primary/gov, 2026-01) One Genuine Student prompt asks why the applicant wants to study the course in Australia with the particular education provider.
- `F.009` (primary/gov, 2026-01) One Genuine Student prompt asks how completing the course will benefit the applicant.

### G33 multi-valued — [F] genuine student assessment / factor considered

- `F.010` (primary/gov, 2026-01) The Department says Genuine Student assessment considers the applicant’s circumstances.
- `F.011` (primary/gov, 2026-01) The Department says Genuine Student assessment considers the applicant’s immigration history.
- `F.012` (primary/gov, 2026-01) The Department says Genuine Student assessment considers compliance with visa conditions and any other relevant matters.

### G34 multi-valued — [F] ministerial direction no. 106 / closer-scrutiny trigger

- `F.015` (primary/gov, 2024-03) Direction No. 106 says closer scrutiny may be appropriate if a student intends to study in a field unrelated to previous studies or employment.
- `F.016` (primary/gov, 2024-03) Direction No. 106 says closer scrutiny may be appropriate where there are apparent inconsistencies in the information provided in the application.

### G35 multi-valued — [G] kiec / approved-agent listing

- `G.014` (primary/university, undated) ICMS lists Kathmandu International Education Centre as an approved education agent.
- `G.015` (primary/university, undated) Churchill lists KIEC in Kathmandu as an education agent.

### G36 multi-valued — [G] idp / counselling cost

- `G.018` (primary/consultancy, undated) IDP says all its counselling sessions are free.
- `G.023` (primary/consultancy, undated) IDP says it provides free counselling for students and parents.

### G37 multi-valued — [G] idp education nepal / approved-agent listing

- `G.025` (primary/university, undated) ICMS lists IDP Education Nepal Kathmandu as an approved education agent.
- `G.026` (primary/university, undated) VIT lists IDP Education Nepal in Kathmandu as an agent.

### G38 multi-valued — [H] kathmandu–sydney air route / stopover option

- `H.002` (practitioner/blog, 2026-06) Kathmandu–Sydney has a one-stop option via Bangkok.
- `H.003` (practitioner/blog, 2026-06) Kathmandu–Sydney has a one-stop option via Singapore.
- `H.004` (practitioner/blog, 2026-06) Kathmandu–Sydney has a one-stop option via Kuala Lumpur.

### G39 multi-valued — [H] kathmandu–melbourne air route / stopover option

- `H.006` (practitioner/blog, 2026-06) Kathmandu–Melbourne has a one-stop option via Singapore.
- `H.007` (practitioner/blog, 2026-06) Kathmandu–Melbourne has a one-stop option via Bangkok.
- `H.008` (practitioner/blog, 2026-06) Kathmandu–Melbourne has a one-stop option via Kuala Lumpur.

### G40 multi-valued — [H] international student employment / common job area

- `H.080` (primary/university, undated) UQ says jobs are usually offered in retail.
- `H.081` (primary/university, undated) UQ says jobs are usually offered in hospitality.
- `H.082` (primary/university, undated) UQ says jobs are usually offered in customer service.

### G41 multi-valued — [I] administrative review tribunal / review outcome option

- `I.053` (primary/gov, undated) One possible ART review outcome is to affirm the original decision.
- `I.054` (primary/gov, undated) One possible ART review outcome is to set aside the original decision and substitute a new decision.
- `I.055` (primary/gov, undated) One possible ART review outcome is to remit the decision to the original decision maker for reconsideration.

