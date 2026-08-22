# OMNISCIENT_ — presentation review, second pass

Written 2026-08-22 against the 59s capture of a cold boot through Mirela's mission, plus the
code. Freeze Sept 2, submission Sept 11. Read `POLISH-REVIEW.md` first — this does not repeat
it.

Same discipline as before: everything below is something watched frame by frame or read in
the source. Where it was not observed, it says so. The first review contained two confident
claims about missing features that were already built, both from sampling at 1fps — that
mistake is not repeated here, and anything not directly seen is marked.

---

## 0. What closed since the first pass

Verified on screen in this capture, not assumed:

- **Boot screen** — self-test prints, `OMNISCIENT_` types, PRESS ANY KEY, camera pulls back
  to reveal the CRT. The reveal lands.
- **Objective types on** — caught mid-sentence at `...has stopped, and g`.
- **The wire chip exists** — three chips, `follow the supply wire` among them.
- **Lighting** — the workshop now has a warm pool on the bench, dark corners, and Mirela's
  face brighter than the wall behind her. This was the flattest thing in the game and is now
  not.
- **The observed strip does not re-animate** when a fourth line appears, which was the
  specific failure mode the arrival-only guard was written to avoid.

Unverifiable from a silent capture and still unconfirmed: **room tone, the motif, and the new
hover cue.** Everything in §1 of the first review is written and none of it has been heard by
anybody. That is now the single largest untested surface in the project.

---

## 1. The boot screen is off-centre — the one visible fault

**Observed.** The content sits in a column roughly 320px wide starting at the left margin of
a very wide frame. On a 2560-wide window that leaves something like two thousand pixels of
empty black to the right of `OMNISCIENT_`. It reads as a layout that has come unstuck rather
than as a deliberate margin.

Cause: `.omni-boot` is `display:flex; flex-direction:column` with `padding: 0 8vw` and no
cross-axis alignment, so every child sits hard against the left edge of a full-width box.

**Fix (ten minutes).** Give the block a bounded width and centre the block — not the text.
Left-aligned text inside a centred column is what a terminal looks like; centred text is what
a title card looks like, and this is a terminal.

```
.omni-boot { align-items: center; }
.omni-boot > * { width: min(46ch, 84vw); }
```

Keep the dot leaders and the left-aligned rows exactly as they are. The only thing moving is
the column.

**While there:** the title is `clamp(22px, 3.4vw, 54px)` and the self-test is
`clamp(11px, 1.15vw, 17px)`. On a wide window that is a 3:1 ratio and the title dominates.
A CRT self-test does not shout its own name; consider 2.2vw and a cap of 38px.

---

## 2. Where the remaining presentation gaps are

Ranked by what a judge would notice, cheapest first.

### 2.1 END CALL is still a cut — the entrance's other half

**Read in source, not observed.** The first review flagged this in §2.4 and it was not built.
Arriving somewhere now has a push-in, a nod and a staggered chrome assembly; leaving has
none of it. An asymmetric transition is worse than two matching cuts, because the player has
been taught that this connection means something and then it ends like closing a tab.

**Build:** 0.6s, and colder than the arrival. Chrome goes first — cards out in reverse order,
80ms apart — then the room dims, then the camera pulls back to the globe. The last thing on
screen should be the contact, alone, for about a fifth of a second after their room has gone
dark. `disconnect` already exists and already fires.

### 2.2 The mission has no ending beat

**Observed by absence.** A request resolves, the save note appears, and the camera returns
home. There is no moment where the player is allowed to have *finished* something. The motif
now plays 420ms after `solved`, which is the seed of one, but nothing on screen marks it.

**Build (2 hours):** hold on the contact for a beat after they say the closing line, before
the camera leaves. One second of somebody looking pleased is worth more than any UI.

### 2.3 The knowledge tree is the game's best idea and is never in shot

**Read in source.** `Screen.Tree` is the CRT's resting content and the whole knowledge system
feeds it — `learn` cues, certainty, `the world remembers`. In 59 seconds of capture it is
visible only as a small green shape on the tube during the boot pull-back.

**Build (half a day):** on returning home after a resolve, push in on the CRT for two seconds
while the new branch draws itself, then pull back. The camera move exists (`SCREEN_SHOT`),
the tree draws itself already, and this converts a background prop into the reward for the
whole mission.

### 2.4 The globe's left column is now three cards and a shelf, and nothing moves

**Observed.** The readouts are static text. `7 waiting` sits there whether or not anything
changed. When a request resolves and the count changes, nothing marks the change.

**Build (1 hour):** flash the changed card's meter once on change — the same `omni-arrive`
animation already added for the contact view. The numbers already re-render; they just do it
invisibly.

### 2.5 No cursor on the typing objective

**Observed.** Mid-type the request bar reads `...has stopped, and g` with nothing after it.
A block cursor while typing and for a beat after would cost one span and make the typing read
as a machine writing rather than as text appearing slowly.

### 2.6 The contact's room has no sound of its own being worked in

Room tone covers the place; nothing covers the *activity*. Mirela is at a bench with tools on
the wall. One occasional, quiet, non-looping event — a tool set down, a chair shift — placed
on the same `idle` hook the props already use, would do more for that room than any visual
change left on this list.

---

## 3. What must not change

Repeated from the first review because the risk grows as the freeze approaches and tired
people polish the wrong things:

- The **diegetic 3D menu** with cable-plug sockets.
- The **console chrome** — bevels, brackets, monospace, one accent.
- The **writing**. `nobody shut out`, `the world remembers`, `somebody is always asking`,
  `ANTENNA ... NO SIGNAL`.
- The **synthesised audio** as an approach.
- **§157** — the console never touches anything. Every cinematic idea that arrives between
  now and the freeze must be checked against this before it is built, including mine.

---

## 4. Ordered plan to the freeze

Eleven days. This is about two and a half days of work.

| # | item | cost | why here |
|---|---|---|---|
| 1 | centre the boot column | 10 min | the only visible layout fault in the game |
| 2 | **play it with sound on** | 20 min | three audio systems shipped unheard |
| 3 | END CALL sequence | 3h | the entrance's missing half |
| 4 | tree push-in on resolve | 4h | turns the best system into the reward |
| 5 | mission ending beat | 2h | lets a finish feel finished |
| 6 | globe readouts flash on change | 1h | |
| 7 | objective cursor | 20 min | |
| 8 | room activity sound | 2h | |

**Item 2 is not a formality.** Room tone, the motif and the hover cue are all written, none
has been heard, and synthesised audio tuned by arithmetic is either lovely or a fridge hum.
If one of the eight beds is wrong it will be wrong for the whole mission it plays under, and
that is a worse outcome than any item below it on this list.

---

## 5. Still outstanding from before

Neither has moved and both remain true:

- **The M4SS ending** — car interior, rain, three cutscenes, the device plant. All built,
  none seen. `just watch` is the one to check.
- **Publish once and look at the result** before the freeze, to settle whether the editor's
  FPS overlay appears in a built game. It is not in this project's source, so it probably
  does not — and "probably" is the wrong confidence for the first thing a judge sees.
