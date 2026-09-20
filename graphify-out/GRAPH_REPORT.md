# Graph Report - GermanLearner  (2026-09-20)

## Corpus Check
- Corpus is ~864 words - fits in a single context window. You may not need a graph.

## Summary
- 12 nodes · 14 edges · 3 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 42,651 input · 0 output

## Community Hubs (Navigation)
- Trusted Source Verification
- Skill Discovery Workflow
- Skills CLI Core Commands

## God Nodes (most connected - your core abstractions)
1. `Find Skills (skill)` - 5 edges
2. `Skills CLI (npx skills)` - 4 edges
3. `Verify Quality Before Recommending` - 4 edges
4. `skills.sh Leaderboard` - 3 edges
5. `vercel-labs/agent-skills` - 3 edges
6. `npx skills add <package>` - 2 edges
7. `anthropics/skills` - 2 edges
8. `npx skills find [query] [--owner <owner>]` - 1 edges
9. `npx skills update` - 1 edges
10. `npx skills init` - 1 edges

## Surprising Connections (you probably didn't know these)
- `Find Skills (skill)` --references--> `Verify Quality Before Recommending`  [EXTRACTED]
  .agents/skills/find-skills/SKILL.md → .agents/skills/find-skills/SKILL.md  _Bridges community 1 → community 0_
- `Find Skills (skill)` --references--> `Skills CLI (npx skills)`  [EXTRACTED]
  .agents/skills/find-skills/SKILL.md → .agents/skills/find-skills/SKILL.md  _Bridges community 1 → community 2_
- `Skills CLI (npx skills)` --references--> `npx skills add <package>`  [EXTRACTED]
  .agents/skills/find-skills/SKILL.md → .agents/skills/find-skills/SKILL.md  _Bridges community 2 → community 0_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Skills CLI command surface (find / add / update / init)** — _agents_skills_find_skills_skill_skills_cli, _agents_skills_find_skills_skill_npx_skills_find, _agents_skills_find_skills_skill_npx_skills_add, _agents_skills_find_skills_skill_npx_skills_update, _agents_skills_find_skills_skill_npx_skills_init [INFERRED 0.85]
- **Skill discovery workflow (leaderboard check, CLI search, quality verification)** — _agents_skills_find_skills_skill_skills_sh_leaderboard, _agents_skills_find_skills_skill_npx_skills_find, _agents_skills_find_skills_skill_quality_verification [EXTRACTED 1.00]

## Communities (3 total, 0 thin omitted)

### Community 0 - "Trusted Source Verification"
Cohesion: 0.40
Nodes (6): anthropics/skills, Microsoft (official source), npx skills add <package>, Verify Quality Before Recommending, skills.sh Leaderboard, vercel-labs/agent-skills

### Community 1 - "Skill Discovery Workflow"
Cohesion: 0.67
Nodes (3): ComposioHQ/awesome-claude-skills, Find Skills (skill), npx skills init

### Community 2 - "Skills CLI Core Commands"
Cohesion: 0.67
Nodes (3): npx skills find [query] [--owner <owner>], npx skills update, Skills CLI (npx skills)

## Knowledge Gaps
- **5 isolated node(s):** `npx skills find [query] [--owner <owner>]`, `npx skills update`, `npx skills init`, `ComposioHQ/awesome-claude-skills`, `Microsoft (official source)`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 5 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Find Skills (skill)` connect `Skill Discovery Workflow` to `Trusted Source Verification`, `Skills CLI Core Commands`?**
  _High betweenness centrality (0.576) - this node is a cross-community bridge._
- **Why does `Skills CLI (npx skills)` connect `Skills CLI Core Commands` to `Trusted Source Verification`, `Skill Discovery Workflow`?**
  _High betweenness centrality (0.400) - this node is a cross-community bridge._
- **Why does `Verify Quality Before Recommending` connect `Trusted Source Verification` to `Skill Discovery Workflow`?**
  _High betweenness centrality (0.282) - this node is a cross-community bridge._
- **What connects `npx skills find [query] [--owner <owner>]`, `npx skills update`, `npx skills init` to the rest of the system?**
  _5 weakly-connected nodes found - possible documentation gaps or missing edges._