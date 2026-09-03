# Meet Solomon people campaigns V2

This batch contains three private-review vertical films about finding and checking a relevant professional contact with Solomon. It addresses the main weaknesses found in the first people campaign: generic scenarios, weak job-to-person continuity, repeated motion, and contact claims that could outlive their source.

The three angles are:

1. **One real job, three real people** — starts from Figma's live Software Engineer Intern (Winter 2027) posting, then maps that role to a recruiter, an engineering manager, and a software-engineer peer surfaced in Solomon.
2. **The wrong-contact test** — compares a title-only result whose company verification was skipped with a direct-match result whose current-company check passed.
3. **They changed jobs before you messaged** — shows an observed contradiction between Solomon's saved employer badge and a newer public professional update. The film says the product data is stale; it does not claim Solomon detected the error.

Every named person has a dated public source in `public-evidence.json`. The live internship has a dated employer-hosted posting in `job-evidence.json`. These records are evidence for editorial review, not proof of endorsement, hiring authority, availability, a referral, or a likely response. No private contact detail is fetched or shown. No message is sent and no application is submitted.

Each film uses seven scenes: hook, role, map, two proof beats, takeaway, and CTA. The motion system changes by angle: a role-to-person map, an evidence scanner, and a source-conflict timeline. Product screenshots carry `ACTUAL SOLOMON PRODUCT`; diagrams carry `EDITORIAL EXPLANATION`; every frame carries `PUBLIC PROFILE EXAMPLE · NO AFFILIATION OR ENDORSEMENT`. The transparent mouthless mascot appears only in the hook, takeaway, and CTA so it does not compete with evidence.

Render all three while the checks are less than 72 hours old:

```bash
npm run creator:meet:solomon:people-campaigns:v2
```

Render one angle with:

```bash
npm run build:main
node scripts/render-meet-solomon-people-campaigns-v2.mjs --angle wrong-contact
```

Outputs are local review artifacts under `renders/meet-solomon/people-campaigns-v2/<angle>/v2.2`. Each directory includes the master, exact source captures, source hashes, OCR proof receipt, public evidence, job evidence when applicable, forced caption alignment, CTA first/last-frame OCR checks, decoded media checks, scene stills, contact sheet, and preservation receipt. Successful archives are immutable; rerender into a new output directory after refreshing evidence.
