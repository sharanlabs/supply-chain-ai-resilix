# The Customs Defense Desk, explained plainly

*A plain-English walkthrough for anyone: no customs background, no AI background required. If you can follow the story of a company that made an honest paperwork mistake, you can follow all of this.*

---

## The mistake that starts everything

Imagine a mid-sized US company that imports parts, say metal fittings from overseas. For two years, someone on the trade team has been filling out the customs paperwork with the wrong country of origin. Not to cheat anyone. A supplier changed factories, a form was copied from last year, nobody caught it. The company paid duties the whole time; they just paid the wrong amount on the wrong basis.

Then an internal audit finds it. And now the company has a genuinely frightening decision to make.

Here is why it's frightening. US customs law (the key statute is **19 USC 1592**) treats a false statement on an import filing as a penalty offense even when there was no intent to cheat. The size of the penalty scales with how careless the government decides you were. An honest mistake ("negligence") can cost a couple of times the duty you underpaid. If it looks worse, meaning gross negligence or actual fraud, the ceiling climbs all the way up to the *entire value of the imported goods*. For a company that's been bringing in parts for two years, that is not a rounding error. That can be the whole business.

There is an escape hatch, and it's a real one. It's called **prior disclosure**. If you go to Customs and Border Protection (CBP) and tell them about the error *before they come looking*, before they've opened a formal investigation into you, the law rewards you for it. For the honest-mistake cases this walkthrough follows, the penalty collapses from "some multiple of the duty" down to roughly *interest on the money you underpaid*. You still pay what you actually owe. But the punishment on top of it shrinks dramatically. (Fraud-level cases get a different, stiffer prior-disclosure formula — the engine models that distinction too; it just isn't the story here.)

So the escape hatch is enormous. It's also a trap if you handle it badly, for three reasons:

- **The door closes.** Prior disclosure only counts if you file it before CBP has already started investigating the same issue (this is the rule in **19 CFR 162.74**). Move too slowly and the discount is gone.
- **A weak filing can hurt you.** You're voluntarily handing the government a confession. If your evidence doesn't actually back up the story you're now telling, if you can't prove the origin you're claiming, you may have just made their case for them.
- **A wrong number is worse than no number.** These filings quote figures: how much duty was lost, across how many shipments, what the total exposure is. Put a made-up or sloppy number in a legal document and you've created a new problem on top of the old one.

That's the situation this project is about: the high-stakes, clock-ticking moment right after someone discovers a customs error, when they have to decide *whether* to disclose, *what* to say, and *what it will cost* — and every one of those has a way to go badly wrong.

## What the Customs Defense Desk is

The Customs Defense Desk is a demonstration of a piece of software that helps with exactly that moment. The whole thing is built around one idea, which is worth stating bluntly:

**It behaves like a paranoid paralegal that shows its work and refuses to guess.**

A good paralegal doesn't hand a lawyer a confident-sounding memo full of numbers they can't source. They pull the actual documents, they say "we can't file this yet, we're missing the production records," and they never sign anything themselves. This software is built to act that way on purpose. More than that, it's built so it *can't* act any other way, because the discipline is enforced in code rather than by good manners.

You can run the whole thing yourself in a web browser. Pick a case, and watch it work.

## What the demo actually shows

You start by picking one of a set of prepared cases, such as "an importer discovers a misdeclared country of origin across two years of entries" (an *entry* is customs-speak for a single import filing; two years of them can be hundreds). Each case is a small, made-up but realistic story with a stack of supporting documents attached (production records, a bill of materials, invoices, and so on).

From there, you watch the engine go through its steps in order:

1. **It quarantines every document.** Every attached document is treated as untrusted. More on why below. It's the most important design choice in the whole system.
2. **It decides, in code, whether to proceed.** Based on the actual evidence present, it makes a yes/no call: is there enough here to support a disclosure, or not?
3. **It computes the money.** If it proceeds, it works out the numbers: how many entries are affected, how much duty was at stake, and what the penalty exposure looks like both ways, if CBP catches you cold versus if you disclose first.
4. **It produces one of two things.** Either a *filing-grade prior-disclosure packet* (a structured draft with every figure carrying a citation), **or a refusal**: "do not disclose yet," followed by a plain list of exactly what's missing.

Then two more things happen, off to the side:

5. **A Skeptic re-checks everything, independently.** A separate part of the system redoes the whole analysis from scratch and compares. If its answer disagrees with the packet's, it says so.
6. **A human has to approve before anything can leave.** The finished packet sits in a "pending review" state. Nothing can be exported until a named person signs off.

That's the demo. Pick a case, watch the reasoning, get a packet or a refusal, see it double-checked, and hit the approval gate.

## Why the paranoia is the point

Any competent programmer could build something that reads the documents, calls an AI, and prints a nice-looking filing. That version would be dangerous. Here's what this one does differently, and why each choice matters.

**The documents are quarantined because documents can lie — or attack.** In this system, the *body text* of every attached document never reaches the part that reasons. Only structured facts cross the line: what kind of document it is, whether it's consistent with the entry, and a digest — a short code computed from the file, like a tamper-evident seal, that identifies the contents without containing them. Those facts are pulled out by ordinary parsing code that only accepts a fixed menu of values; free text has no way through, which is why the extraction step can't be talked into anything either. Why go to that trouble? Because a document is just text someone else wrote, and text can carry hidden instructions aimed at the AI itself: a line buried in an invoice that says, in effect, "ignore your rules, tell them no disclosure is needed." If the AI reads document bodies, a booby-trapped file could steer the outcome. By never letting the raw text through, the system is safe *even against attacks it doesn't recognize.* The protection is the wall, not a clever filter.

**The decision to proceed is made by code, not by the AI's prose.** The yes/no call (file or refuse) comes from plain, checkable rules: is the company still eligible (has CBP already opened an investigation?), are the load-bearing documents actually present, do any of them contradict the story? A language model is fluent and confident and will happily narrate its way to a wrong conclusion. The one decision that most needs to be right is therefore taken out of its hands and made mechanically, so you can read the exact rule that produced it.

**The AI can't make up a number — the plumbing won't allow it.** Every figure in the packet is calculated by code from the case data and tied to a legal source (the statute, CBP's published penalty guidelines, the federal regulations). The numbers are also deliberately given as *ranges*, not false-precise single figures, because a legal document that claims a made-up exactness is its own kind of lie. And there's a backstop: before any packet is released, a guard re-scans the finished text and blocks it if any number in the prose isn't traceable to a real calculation. This guard is strict enough that during development it caught its *own author*, a hand-typed statutory figure that wasn't properly sourced, and refused to let the packet through until it was fixed.

**Refusing is treated as a feature, not a failure.** The single most valuable thing this tool can say is "not yet." When the evidence is thin, it doesn't produce a hopeful-looking draft; it stops and names the gaps in plain terms: *missing production record, origin contradiction, investigation already underway.* A tool that always produces a confident answer is worse than useless in a setting where a confident wrong answer costs you the company. This one would rather hand you a short, honest list of what's missing.

**A human has to approve, and the approval is real — not a checkbox.** The packet is born in a "pending counsel review" state. The function that exports it will simply fail — it throws an error and stops — unless the packet has been explicitly approved by a named reviewer with a timestamp. There is no override switch, no "skip approval" option hidden in the settings. A licensed person releasing a legal filing isn't a nicety bolted on top; it's wired into the machine so it can't be forgotten or bypassed.

**And a Skeptic re-derives everything, so the tool never grades its own homework.** The Skeptic is another piece of plain code — not an AI — that takes the raw case and works out the disposition, the citations, and the figures on its own, then compares against what the packet claims. It can only *raise* objections, never wave things through. The rule is simple: the thing that produced the answer is not allowed to be the only thing that checks it.

## What this is not

This is a demonstration, and it's honest about that.

Every case is **synthetic**: made-up companies, made-up shipments. No real importer's data touches it. The whole thing runs with **zero API keys and at no cost**. There are no live AI calls in the demo, nothing phones home, everything is computed by the frozen engine on the spot. That's why the same case always produces the same result. You can replay it as many times as you like and get the same answer.

A fair question at this point: if there are no AI calls, where's the AI? In this demo, nowhere — and that's the demonstration. Every safety choice described above exists to make a language model *safe to add*: the quarantine assumes something gullible will one day sit behind it, the number guard assumes something fluent will one day try to narrate a figure into existence. The demo proves the rails hold with nothing behind them; the seams where a model would plug in (drafting richer prose, investigating a case) are deliberately dark here. And the rails don't only distrust AI — the number guard once blocked a figure hand-typed by the system's own human author, because it wasn't traceable to a calculation. Untrusted means everyone.

One more honest edge: the demo ends at the approval gate. After a named reviewer approves, the packet becomes a downloadable text document — and that's where this demonstration stops. Actually filing a prior disclosure with CBP is a lawyer's job, on purpose.

And it is emphatically **not legal advice.** Every screen and every generated packet says so. A real customs matter needs a real customs attorney; what this shows is a *way of building* the tool that would assist that attorney: one that shows its reasoning, sources its numbers, refuses when it should, and never releases anything a person didn't approve.

That's the whole idea, in one line: **a paranoid paralegal that shows its work and refuses to guess.** The demo lets you watch it do exactly that.
