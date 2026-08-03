-- 2026-08-02 — Seed AI-skill training + wire the training_skills mappings
--
-- PROBLEM: training_skills had 0 rows, so the "Recommended training to grow
-- into this role" panel under every match card on member.html has rendered
-- empty since Phase 12 §C shipped. Runbook §10.7 framed the remaining work
-- as curation — mapping existing training_resources to the 10 curated AI
-- skills.
--
-- That framing turned out not to be possible. All 10 pre-existing
-- training_resources rows are trade and general-career training: CPR/First
-- Aid, CDL, ServSafe, OSHA 10, financial literacy, HubSpot marketing,
-- freeCodeCamp, Google IT Support, Google PM, Google Analytics. NONE of them
-- teach prompt engineering, agent frameworks, RAG, LLM evaluation, vector
-- databases, AI safety, fine-tuning, embeddings, AI product, or AI tooling.
-- Mapping any of them to an AI skill would have put a fabricated
-- recommendation in front of a member at the exact moment they're told
-- "here's what to learn to grow into this role" — the highest-trust moment
-- in the product. So the mapping table was empty for a real reason.
--
-- WHAT THIS DOES: seeds 12 genuinely AI-era resources, then maps them. Every
-- source_url returned HTTP 200 on 2026-08-02 before being written here.
-- Selection bias is deliberate and matches the platform's stance: free
-- first, primary sources over content farms, no affiliate links, and a
-- preference for material a displaced knowledge worker can start today
-- without a credit card.
--
-- FOUNDER REVIEW: these publish as WFH recommendations in your voice. They
-- are defensible picks, not personally vetted by you. Read the list before
-- the tester campaign; swap anything you wouldn't put your name on.
-- is_verified is left false for exactly that reason — flip it per row as you
-- confirm each one.

insert into public.training_resources
  (source, source_url, title, provider, description,
   category_slug, skill_level, content_type, duration_minutes,
   is_free, tags, is_verified, is_featured)
values
  ('manual','https://github.com/anthropics/prompt-eng-interactive-tutorial',
   'Anthropic — Prompt Engineering Interactive Tutorial','Anthropic',
   'Hands-on tutorial that builds prompting skill chapter by chapter, from basic structure through complex real-world prompts. Primary source, free, no account needed to read.',
   'technology','beginner','tutorial',480,true,
   array['prompt engineering','ai','free','hands-on'],false,true),

  ('manual','https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview',
   'Anthropic — Prompt Engineering Guide','Anthropic',
   'The reference documentation on prompt structure, examples, chain-of-thought, and role prompting. Short enough to read in an afternoon and the thing to keep open while you work.',
   'technology','all-levels','guide',120,true,
   array['prompt engineering','ai','free','reference'],false,false),

  ('manual','https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/',
   'Prompt Engineering for Developers','DeepLearning.AI',
   'Short video course on prompting patterns that hold up in real applications — summarizing, inferring, transforming, expanding. Free to audit.',
   'technology','beginner','course',90,true,
   array['prompt engineering','ai','free','video'],false,false),

  ('manual','https://github.com/microsoft/generative-ai-for-beginners',
   'Generative AI for Beginners','Microsoft',
   'Lesson-based course covering how these models actually work, prompting, building simple apps, and where the technology falls down. Good first stop if the whole area still feels opaque.',
   'technology','beginner','course',720,true,
   array['ai tooling','generative ai','free','fundamentals'],false,true),

  ('manual','https://huggingface.co/learn/agents-course',
   'Hugging Face — AI Agents Course','Hugging Face',
   'Free course on agent frameworks: tool use, planning loops, and building an agent that does something real. Pairs with the practitioner advice to ship one small documented project.',
   'technology','intermediate','course',600,true,
   array['agent frameworks','ai','free','hands-on'],false,false),

  ('manual','https://python.langchain.com/docs/tutorials/',
   'LangChain — Official Tutorials','LangChain',
   'Working tutorials for the most widely used agent and retrieval framework. Start here if a job description names LangChain specifically.',
   'technology','intermediate','tutorial',300,true,
   array['agent frameworks','rag','free','hands-on'],false,false),

  ('manual','https://www.pinecone.io/learn/',
   'Pinecone Learning Center','Pinecone',
   'Clear explainers on vector search, embeddings, and retrieval-augmented generation, written for people building rather than researching.',
   'technology','intermediate','guide',240,true,
   array['vector databases','embeddings','rag','free'],false,false),

  ('manual','https://www.deeplearning.ai/short-courses/building-evaluating-advanced-rag/',
   'Building and Evaluating Advanced RAG','DeepLearning.AI',
   'Covers retrieval pipelines and — the part most people skip — how to measure whether yours is any good. Evaluation is the skill that separates a demo from a system.',
   'technology','intermediate','course',90,true,
   array['rag','llm evaluation','ai','free'],false,false),

  ('manual','https://huggingface.co/learn/nlp-course',
   'Hugging Face — NLP Course','Hugging Face',
   'The long-standing free course on transformers, embeddings, tokenization, and fine-tuning. Deeper than most and worth it if you want to understand the machinery, not just call the API.',
   'technology','intermediate','course',900,true,
   array['embeddings','fine-tuning','ai','free'],false,false),

  ('manual','https://www.deeplearning.ai/short-courses/finetuning-large-language-models/',
   'Finetuning Large Language Models','DeepLearning.AI',
   'When fine-tuning is the right tool versus when prompting or retrieval would have done the job — plus how to actually run one. Free to audit.',
   'technology','advanced','course',90,true,
   array['fine-tuning','ai','free','video'],false,false),

  ('manual','https://developers.google.com/machine-learning/crash-course/embeddings',
   'Machine Learning Crash Course — Embeddings','Google',
   'A tight, plain-language explanation of what embeddings are and why similarity search works. Read this before the vector-database material and the rest lands much faster.',
   'technology','beginner','course',60,true,
   array['embeddings','ai','free','fundamentals'],false,false),

  ('manual','https://www.nist.gov/itl/ai-risk-management-framework',
   'NIST AI Risk Management Framework','NIST',
   'The framework US federal agencies and their contractors are increasingly expected to work within. Directly relevant if you are targeting federal or govtech roles, where naming it is a genuine differentiator.',
   'technology','all-levels','guide',180,true,
   array['ai safety','policy','governance','federal','free'],false,true)
on conflict do nothing;

-- Map each resource to the AI skills it actually teaches. Joined by
-- source_url and skill slug rather than hardcoded ids: training_resources.id
-- is a uuid generated at insert, and skills.id is a serial that differs
-- between environments.
insert into public.training_skills (training_id, skill_id)
select t.id, s.id
from public.training_resources t
join lateral (values
  ('https://github.com/anthropics/prompt-eng-interactive-tutorial', 'prompt-engineering'),
  ('https://github.com/anthropics/prompt-eng-interactive-tutorial', 'ai-tooling'),
  ('https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview', 'prompt-engineering'),
  ('https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers/', 'prompt-engineering'),
  ('https://github.com/microsoft/generative-ai-for-beginners', 'ai-tooling'),
  ('https://github.com/microsoft/generative-ai-for-beginners', 'prompt-engineering'),
  ('https://github.com/microsoft/generative-ai-for-beginners', 'ai-product'),
  ('https://huggingface.co/learn/agents-course', 'agent-frameworks'),
  ('https://python.langchain.com/docs/tutorials/', 'agent-frameworks'),
  ('https://python.langchain.com/docs/tutorials/', 'rag'),
  ('https://www.pinecone.io/learn/', 'vector-databases'),
  ('https://www.pinecone.io/learn/', 'embeddings'),
  ('https://www.pinecone.io/learn/', 'rag'),
  ('https://www.deeplearning.ai/short-courses/building-evaluating-advanced-rag/', 'rag'),
  ('https://www.deeplearning.ai/short-courses/building-evaluating-advanced-rag/', 'llm-evaluation'),
  ('https://huggingface.co/learn/nlp-course', 'embeddings'),
  ('https://huggingface.co/learn/nlp-course', 'fine-tuning'),
  ('https://www.deeplearning.ai/short-courses/finetuning-large-language-models/', 'fine-tuning'),
  ('https://www.deeplearning.ai/short-courses/finetuning-large-language-models/', 'llm-evaluation'),
  ('https://developers.google.com/machine-learning/crash-course/embeddings', 'embeddings'),
  ('https://www.nist.gov/itl/ai-risk-management-framework', 'ai-safety'),
  ('https://www.nist.gov/itl/ai-risk-management-framework', 'ai-product')
) as m(url, skill_slug) on m.url = t.source_url
join public.skills s on s.slug = m.skill_slug and s.is_ai_skill = true
on conflict do nothing;
