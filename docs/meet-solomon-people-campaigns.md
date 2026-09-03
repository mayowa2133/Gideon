# Meet Solomon people campaigns

This campaign contains five private-review vertical films about using Solomon to organize the search for a relevant professional contact. The contacts shown are current public professional or company records independently checked against their public source. The films do not claim that a referral or response will happen, or that an outreach draft is sent automatically.

The five angles are:

1. **The right person behind the role** — move from a job listing to a company-based people search.
2. **Recruiter, manager, or peer** — choose a contact type based on the conversation needed.
3. **One company, many doors** — explore several human paths into one target company.
4. **The right first message** — select the person and prepare an addressed, unsent draft.
5. **Keep the right connection warm** — keep follow-up attention and response progress visible.

The five films use Ashton Addington, Charles Ng, Tobi Lütke, Justin Kim, and Avinash Pallerlamudi as real public examples surfaced through Solomon. Each story manifest records the name, title, company, public source URL, and verification time. Email addresses, phone numbers, and private contact details are neither fetched nor shown. Every frame carries `PUBLIC PROFESSIONAL DATA · VERIFY BEFORE OUTREACH`. The transparent mouthless mascot appears only in the hook, payoff, and CTA. Product-proof scenes have no mascot and use a short entrance followed by a stable hold.

Each film uses an independently planned and verified capture directory under `tmp/film-people-campaign/<angle>`. The renderer hashes and republishes the exact verified PNG bytes into each film’s isolated Remotion public directory, uses the approved crop coordinates, and refuses an unknown or modified proof.

Render all five with:

```bash
npm run creator:meet:solomon:people-campaigns
```

Render one or more angles with:

```bash
npm run build:main
node scripts/render-meet-solomon-people-campaigns.mjs --angle right-person,first-message
```

Outputs are local review artifacts under `renders/meet-solomon/people-campaigns/<angle>/v1`. Each directory includes the master, script, film manifest, copied capture evidence, source hashes, forced-alignment report, decoded media report, scene stills, and render receipt. No step sends a message, applies to a job, publishes media, or posts to a social platform.
