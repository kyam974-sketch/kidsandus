# Student profiles and follow-up continuity

Applied Supabase migration: `20261001184650_student_gender_for_followup_profiles`.

```sql
alter table public.students add column if not exists gender text
  check (gender in ('male','female','neutral'));
```

The nullable gender is edited only in Students. Null retains automatic wording from name/teacher evidence; neutral requires an explicit choice. Existing student notes and row access policies are unchanged.

Follow-up reads the canonical student profile using an unambiguous full-name, preferred-name or legacy-name match. New saved entries carry `student_id`; older entries remain matched by name. Ambiguous profile names are not merged.

Generation uses dated history up to the selected lesson date. Raw teacher observations and group notes are retained throughout the history; the eight latest generated judgments and ratings add secondary context. Other children's group observations must not be attributed to this child. Prior generated text is not proof of an ability: explicit teacher evidence has priority, and newer explicit observations update earlier states. No inferred diagnosis or automatically persisted developmental label is created.

History is paginated rather than limited to the first 2,000 sessions. Failure to load profiles/history blocks generation rather than silently creating a memory-free judgment. Historical records and existing notes are not rewritten by this change.

Verification: profile gender save/read, absence of follow-up pronoun control, identity ambiguity, old raw observation retention, chronological updates and future exclusion; browser layout at phone/tablet/desktop widths; real AI scenarios for non-speaking participation, improved regulation, and first word.
