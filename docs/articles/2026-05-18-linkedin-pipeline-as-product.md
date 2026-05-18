# When Process Got Cheap

This afternoon a Claude Code agent caught a bug I had committed four hours earlier in a different feature. The bug was mine. The agent that caught it wasn't the one supposed to be looking.

I had shipped v0.3.4 — a fix for SSR/client timezone mismatch in a Next.js starter. The fix came with a new ESLint rule that bans direct `toLocaleString` calls outside one specific primitive component. The pipeline that produced v0.3.4 passed every gate. Lint included. What I didn't notice was that I had added the Playwright spec — which uses `toLocaleString` inside a `page.evaluate()` callback — *after* the QA agent did its sweep. The violation went out with the commit. Four hours later, working on an unrelated feature, the QA agent on that pipeline ran lint as part of its standard verification, hit the violation, and stopped. I fixed it before pushing.

The catch happened because there were two pipelines, with two QA agents, that didn't share state. The first one missed the bug. The second one wasn't looking *for that bug* — it was looking for any lint violation in the working tree. The two are different. The first is a checkpoint that can be bypassed by changing the tree after it runs. The second is a check that fires every time it runs, regardless of what it ran against before.

This is a small story but it points at a bigger shift. For most of the history of software engineering, the move on process was *less of it*. Trim the ceremony. Empower the team. Distrust the gatekeepers. The reason was always the same: process overhead is human coordination cost, and human coordination cost dominates almost everything else when you're trying to ship something.

That calculus just changed. When agents absorb the ceremony — when the analyst, the architect, the QA reviewer, the release-notes writer, and the post-mortem author are all roles that an agent can play for the cost of an API call — the optimal amount of process goes up, possibly a lot. Every reflex you have about "this would be too heavyweight" was calibrated against a cost structure that no longer applies.

That's the claim. The rest of this post is what it looks like in practice, in one repo, with the specific failure modes I've hit.

## Multiple roles, not multiple personalities

The repo I'm working in — `github.com/chenson42/claudecode`, a Next.js + Neon + NextAuth starter that's also a teaching artifact for working with Claude Code — runs a six-phase pipeline for every non-trivial change. Analyst → architect → tech-lead → implementer → QA → analyst-again. Plus eight periodic reviews on rolling cadences (test coverage every 7 days, code and security every 30, and so on). Each role is a different agent definition, with a different prompt, a different mandate, and a different definition of "done."

I want to be careful about how I describe what those mandates do, because the obvious framing — "specialized agents with strict separation of concerns" — oversells it. The boundaries are not enforced. The architect can technically edit the work-log; the QA agent can install npm packages; in practice they sometimes do. What the role assignments actually produce is *adversarial pressure*. The analyst is prompted to look for gaps in framing, so it looks for them. Given the same prompt, an agent told to "build the feature" wouldn't. Given the same prompt as the analyst, an agent told to "review the design" would push back on different things. The lift comes from the role-shaped pressure, not from the role-shaped wall.

Concrete example from earlier in the same day: I asked the pipeline to fix the timezone bug at four files I had identified. The analyst came back with a `READY WITH NOTES` verdict — there were five files, I had missed one. The same underlying model, given the same prompt structure, with a "find the gaps" mandate, found the gap I had been blind to in my framing. A generalist agent told to "fix the four sites I listed" almost certainly fixes the four sites I list. The role created the question. The model answered it.

This is closer to the historical argument for code review than to the historical argument for specialization. Code review works not because reviewers know more than authors but because they're under different pressure when they read the code. Multiple agents under different pressures, reading and writing the same artifacts, produce the same effect — and the artifacts are durable across sessions, which is where the next part comes in.

## The artifacts became participants

For each piece of work there's a markdown file in `docs/work-log/` that's the source of truth for what's been decided and what hasn't. The analyst's findings, the architect's verdict, the tech-lead's design, the implementer's notes, the QA report, the final shipped-vs-intent review — all of it lands in the same file, in order. If a session ends mid-pipeline, the next session opens the file and picks up cold. Same for decisions: an append-only log. Same for the periodic reviews: a rolling log that the cadence-check reads at session start.

The novelty isn't that AI can write code. The novelty is that AI can write — and *read*, and *act on* — the artifacts of process itself. Documentation that has historically been overhead is now substrate. The agent's input is the previous agent's output, and that handoff is cheap. That's the part of the cost structure that flipped. Capture-and-handoff used to dominate any process; now it doesn't.

The shape this takes in practice is what I'd call the durable operational layer: the agent definitions, the skill files, the work-log conventions, the review cadence, the decision log, and the accumulating institutional memory in `CLAUDE.md`. That layer is what survives a model upgrade. It's what survives a partial codebase rewrite. It's what I'd carry to the next project. The Next.js code in this repo will be obsolete inside five years. The operational layer might not be.

I called it "the pipeline is the product" in an earlier version of this post and a reviewer rightly pointed out that's too narrow — the pipeline is one slice of it. The phase structure, the checkpoints, the work-log shape, the review cadence, and the accumulated context are all parts of the same asset. The code is the byproduct of running them. That's the part of this setup I'm most confident is portable.

## Stack consistency is the load-bearing half of "stack choice"

The second thing that matters is consistency — and I want to be precise about which part is doing the work. The usual framing is "Claude is better at popular stacks." That's true, and it matters, but it's the smaller half of the lever. The bigger half is that *conventions inside a stack pay compound interest with agents in a way they don't with humans*.

A human picks up "we always use `X` for `Y`" after one or two PRs. An agent re-derives the convention every session unless `CLAUDE.md` says, explicitly: we always use `X` for `Y`. Codified conventions are durable; uncodified ones aren't, because the agent has no working memory of "what we did last time." Convention consistency moved into the instruction layer is the second-largest lift in this setup, after the role-pressure thing.

Stack fluency contributes too. Claude is empirically better at Next.js App Router than at, say, Phoenix LiveView. The training data skew is real. But the criterion isn't quite "popular." It's "popular *and* stable." Popular-and-churning is worse than less-popular-and-stable, because the model will confidently produce code in the older idioms with no signal that it's outdated.

I'll concede that I've followed my own advice imperfectly in this repo. The auth library is NextAuth 5 *beta* — the older v4 patterns leak into v5 code constantly and I have to handhold the migration. The framework is Next.js 16 — newly released, sparse training data on the v16-specific pieces, including the `proxy.ts` convention that just replaced `middleware.ts`. I made those choices for product reasons (framework direction, future ergonomics) and I've paid for them in extra correction work. That's the honest version. If your goal is to test the upper bound of what an agent can do given convention consistency, pick the stable, well-trained, well-documented stack. If your goal is to ship a particular product with a particular framework choice, accept that you'll be doing more handholding. There's no free lunch — there's just an axis (model fluency) on the stack decision that didn't used to be there.

## The system modifies itself

Earlier today I started a second feature: a periodic review type called `upstream-sync`. The motivation was that the starter is *meant* to be forked, and forks were going to drift from upstream — bug fixes (like the timezone fix from the morning) would land in the canonical starter and never make it back to long-lived forks. There was no mechanism that surfaced "you should pull this in."

The answer turned out to be: use the pipeline to extend the pipeline. I opened a new work-log, ran the six phases again, and at the end of it the project had an eighth periodic review type and a new skill that produces a classified punch-list of upstream commits any fork should consider pulling in. The pipeline produced a new piece of the pipeline.

This is the move I didn't expect to be available so cheaply. In a traditional process — humans-in-meetings — adding a new review type is a meeting, a discussion, a tooling project, a rollout, an evangelism push, and then quiet decay because nobody runs it. Here it was forty minutes of agent time and one work-log file, and the new review is part of the cadence-check at session start from then on. The amortized cost of adding a checkpoint dropped by something like two orders of magnitude. That's the cost-structure shift made concrete: the process can grow because the marginal cost of growing it is no longer prohibitive.

## What I haven't tested

I want to draw a hard line around what this evidence does and doesn't cover.

This is one repo. One person. One stack. A few weeks of iteration. The pipeline has caught the bugs I've shown you; it has also missed bugs, including the one the next pipeline caught — that catch was a second-line gate working, not a first-line gate working. The honest claim is that shipped quality is higher than it would be without the pipeline, not that shipped quality is high.

I have no evidence about how this scales to a team. Adding humans changes things: `CLAUDE.md` becomes a shared style guide, the role-pressure idea applies across humans too, the work-log starts to compete with whatever ticket tracker the team already uses. I'd guess the durable-operational-layer point gets *more* true at team scale — captured conventions matter more, not less, when more people touch the code — but I haven't tested it.

I have no evidence about how this holds up over months. The instruction layer is supposed to compound; I've watched it compound for a few weeks. The thing I'd most want to be wrong about is whether the cost structure I'm describing keeps holding when the codebase is older, the stack changes underneath, and the team grows. I think it does. I haven't earned that confidence.

## The shift in one sentence

For most of the history of software, the move on process was less of it. The reason was always coordination cost, and the reason was always real. The reason just changed. If you've been working with agents and reaching for the heuristics you trained on humans, your instincts are calibrated against a price chart that doesn't exist anymore. The new price chart says: capture more, hand off more often, run more checks, write more reviews, build more structure into the operational layer. The cost is low enough that the bottleneck moved somewhere else.

I don't know exactly where the bottleneck moved to. I suspect it's in the framing — Phase 1, the analyst — and in the willingness to take the slow path early so the fast path later has somewhere to start. But that's the next post.

---

*Chris Henson — May 2026. Repo: `github.com/chenson42/claudecode` (Next.js + Neon + NextAuth starter, MIT, structured as a teaching artifact for Claude Code workflows). Fork and tell me what breaks.*
