---
name: intent-capture
description: Capture user intent through guided conversation. Exploratory phase with high degrees of freedom.
version: 1.0.0
---

<objective>
Capture user intent through guided conversation.
</objective>

<triggers>
  - No active intent exists
  - User wants to start something new
</triggers>

<degrees_of_freedom>
  **HIGH** — This is a creative, exploratory phase. Ask open-ended questions. Don't constrain prematurely.
</degrees_of_freedom>

<llm critical="true">
  <mandate>NEVER assume requirements — ALWAYS ask clarifying questions</mandate>
  <mandate>Assess complexity and ask exactly 5, 10, or 20 discovery questions BEFORE writing any plan</mandate>
  <mandate>Capture the "what" and "why" — leave the "how" for decomposition</mandate>
  <mandate>Let user describe freely on the initial question — don't interrupt</mandate>
</llm>

<complexity_questioning>
  After the initial description, classify complexity and set the question budget:

  | Level | Questions | When to use |
  |-------|-----------|-------------|
  | Low | 5 | Single concern, few files, clear scope, no architecture decisions |
  | Medium | 10 | Multiple components, integrations, moderate scope |
  | High | 20 | Architecture, security, new subsystems, unclear or large scope |

  Rules:
  - Announce complexity level and question count to the user
  - Track progress: "Question {n} of {total}"
  - Ask one question at a time (or 2–3 when tightly related)
  - Skip topics already covered by the user's answers
  - Do NOT generate the intent brief until all questions are answered
</complexity_questioning>

<flow>
  <step n="1" title="Initial Question">
    <ask>What do you want to build?</ask>
    <listen>Let user describe freely. Don't interrupt.</listen>
  </step>

  <step n="2" title="Assess Complexity">
    <action>Classify task as low, medium, or high complexity</action>
    <action>Set question budget: low=5, medium=10, high=20</action>
    <output>
      Based on your description, I'm assessing this as **{level}** complexity.
      I'll ask **{count}** discovery questions before writing the plan.
    </output>
  </step>

  <step n="3" title="Discovery Questioning">
    <action>Ask exactly {count} targeted questions, one at a time</action>
    <action>Track progress: "Question {n} of {count}"</action>
    <action>Skip topics already answered in prior responses</action>

    <topics level="low" count="5">
      1. Goal — what exactly should exist when done?
      2. Users — who benefits and how do they interact?
      3. Scope — what's in vs. out for this iteration?
      4. Constraints — tech stack, deadlines, existing code?
      5. Success — how will we know it works?
    </topics>

    <topics level="medium" count="10">
      Include all low topics, plus:
      6. Problem — what pain exists today?
      7. Data — what is stored, read, or transformed?
      8. Integrations — external APIs, services, or modules?
      9. UI/UX — screens, flows, or interaction patterns?
      10. Edge cases — errors, empty states, permissions?
    </topics>

    <topics level="high" count="20">
      Include all medium topics, plus:
      11. Architecture — system boundaries, new vs. existing?
      12. Security — auth, authorization, sensitive data?
      13. Performance — latency, scale, concurrency?
      14. Migration — backward compatibility, rollout?
      15. Testing — acceptance tests, regression concerns?
      16. Observability — logging, monitoring, alerting?
      17. Dependencies — blocking work, external dependencies?
      18. Risks — what could go wrong, what's unknown?
      19. Alternatives — approaches considered or rejected?
      20. Non-goals — what we are explicitly NOT building?
    </topics>

    <gate>Do NOT proceed until all {count} questions are answered</gate>
  </step>

  <step n="4" title="Summarize Understanding">
    <output>
      Let me make sure I understand:

      **Goal**: {summarized goal}

      **Users**: {who benefits}

      **Problem**: {what pain this solves}

      **Success Criteria**:
      - {criterion 1}
      - {criterion 2}
      - {criterion 3}

      **Constraints**:
      - {constraint 1}
      - {constraint 2}

      Is this accurate? [Y/n/edit]
    </output>
    <check if="response == n or edit">
      <action>Ask specific clarifying questions (still within discovery budget if not yet complete)</action>
      <goto step="4"/>
    </check>
  </step>

  <step n="5" title="Generate Intent Brief">
    <action>Create intent ID from title (kebab-case)</action>
    <action>Generate intent brief using template: templates/brief.md.hbs</action>
    <action>Create directory: .specs-fire/intents/{intent-id}/</action>
    <action>Save: .specs-fire/intents/{intent-id}/brief.md</action>
  </step>

  <step n="6" title="Update State">
    <action>Add intent to state.yaml</action>
    <action>Set intent status to "in_progress"</action>
  </step>

  <step n="7" title="Transition">
    <output>
      **Intent captured**: "{intent-title}"

      Saved to: .specs-fire/intents/{intent-id}/brief.md

      ---

      Ready to break this into work items? [Y/n]
    </output>
    <check if="response == y">
      <invoke_skill>work-item-decompose</invoke_skill>
    </check>
  </step>
</flow>

<output_artifacts>

  | Artifact | Location | Template |
  |----------|----------|----------|
  | Intent Brief | `.specs-fire/intents/{id}/brief.md` | `./templates/brief.md.hbs` |
</output_artifacts>

<success_criteria>
  <criterion>Task complexity assessed (low/medium/high)</criterion>
  <criterion>Exactly 5, 10, or 20 discovery questions asked and answered</criterion>
  <criterion>User intent fully understood through dialogue</criterion>
  <criterion>Goal, users, problem clearly captured</criterion>
  <criterion>Success criteria defined</criterion>
  <criterion>Constraints identified</criterion>
  <criterion>Intent brief saved to correct location</criterion>
  <criterion>State.yaml updated with new intent</criterion>
</success_criteria>
