import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { Pool, PoolClient } from 'pg';

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL || process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cg_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cg_departments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('core', 'common'))
    );

    CREATE TABLE IF NOT EXISTS cg_staff (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('HOD', 'Staff')),
      dept_id INTEGER REFERENCES cg_departments(id) ON DELETE SET NULL,
      max_workload INTEGER NOT NULL DEFAULT 18
    );

    CREATE TABLE IF NOT EXISTS cg_subjects (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK (type IN ('core', 'common', 'lab')),
      dept_id INTEGER REFERENCES cg_departments(id) ON DELETE SET NULL,
      is_addon BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS cg_classes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      dept_id INTEGER NOT NULL REFERENCES cg_departments(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      semester INTEGER NOT NULL,
      student_strength INTEGER NOT NULL DEFAULT 0,
      tutor_staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS cg_class_subjects (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL,
      hours_per_week INTEGER NOT NULL,
      is_lab_required BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE (class_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS cg_labs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      dept_id INTEGER REFERENCES cg_departments(id) ON DELETE SET NULL,
      systems_count INTEGER NOT NULL,
      systems_specification TEXT,
      os_installed TEXT
    );

    CREATE TABLE IF NOT EXISTS cg_lab_requirements (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      duration INTEGER NOT NULL,
      requirements TEXT
    );

    CREATE TABLE IF NOT EXISTS cg_timetable_slots (
      id SERIAL PRIMARY KEY,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      subject_id INTEGER REFERENCES cg_subjects(id) ON DELETE SET NULL,
      staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL,
      lab_id INTEGER REFERENCES cg_labs(id) ON DELETE SET NULL,
      is_locked BOOLEAN NOT NULL DEFAULT FALSE,
      type TEXT,
      UNIQUE (class_id, day_order, period)
    );

    CREATE TABLE IF NOT EXISTS cg_placement_blocks (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      hours INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cg_placement_classes (
      placement_id INTEGER NOT NULL REFERENCES cg_placement_blocks(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      PRIMARY KEY (placement_id, class_id)
    );

    CREATE TABLE IF NOT EXISTS cg_placement_preview_slots (
      id SERIAL PRIMARY KEY,
      placement_block_id INTEGER NOT NULL REFERENCES cg_placement_blocks(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (placement_block_id, class_id, day_order, period)
    );

    CREATE TABLE IF NOT EXISTS cg_lab_preview_slots (
      id SERIAL PRIMARY KEY,
      lab_requirement_id INTEGER NOT NULL REFERENCES cg_lab_requirements(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      lab_id INTEGER NOT NULL REFERENCES cg_labs(id) ON DELETE CASCADE,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      preview_group TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'preview',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cg_tamil_preview_slots (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      hours_per_week INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, class_id, day_order, period)
    );

    CREATE TABLE IF NOT EXISTS cg_english_preview_slots (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      hours_per_week INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, class_id, day_order, period)
    );

    CREATE TABLE IF NOT EXISTS cg_mathematics_preview_slots (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      hours_per_week INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, class_id, day_order, period)
    );

    CREATE TABLE IF NOT EXISTS cg_department_preview_slots (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      department_id INTEGER NOT NULL REFERENCES cg_departments(id) ON DELETE CASCADE,
      class_id INTEGER NOT NULL REFERENCES cg_classes(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES cg_subjects(id) ON DELETE CASCADE,
      staff_id INTEGER REFERENCES cg_staff(id) ON DELETE SET NULL,
      day_order INTEGER NOT NULL,
      period INTEGER NOT NULL,
      hours_per_week INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (session_id, class_id, day_order, period)
    );
  `);

  await pool.query(`
    ALTER TABLE cg_timetable_slots
    ADD COLUMN IF NOT EXISTS placement_block_id INTEGER REFERENCES cg_placement_blocks(id) ON DELETE CASCADE;
  `);

  await pool.query(`
    ALTER TABLE cg_lab_requirements
    ADD COLUMN IF NOT EXISTS lab_id INTEGER REFERENCES cg_labs(id) ON DELETE SET NULL;
  `);

  await pool.query(`
    ALTER TABLE cg_lab_requirements
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
  `);

  await pool.query(`
    ALTER TABLE cg_labs
    ADD COLUMN IF NOT EXISTS systems_specification TEXT;
  `);

  await pool.query(`
    ALTER TABLE cg_labs
    ADD COLUMN IF NOT EXISTS os_installed TEXT;
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS udx_lab_req_class_subject
    ON cg_lab_requirements(class_id, subject_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lab_preview_req
    ON cg_lab_preview_slots(lab_requirement_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lab_preview_class_slot
    ON cg_lab_preview_slots(class_id, day_order, period);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_lab_preview_lab_slot
    ON cg_lab_preview_slots(lab_id, day_order, period);
  `);
}

async function inTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

type SchedulerRequest = {
  classes: number[];
  class_details?: Array<{ id: number; dept_id: number; year: number }>;
  hours: number;
  periods_per_day: number;
  days: number[];
  occupied: Record<string, Array<{ day_order: number; period: number }>>;
};

type SchedulerAssignment = {
  class_id: number;
  day_order: number;
  start_period: number;
  periods: number[];
  segment: 'morning' | 'afternoon';
  group?: string;
  subgroup?: string;
};

type SchedulerResponse =
  | { ok: true; assignments: SchedulerAssignment[] }
  | { ok: false; error: string };

type LabSchedulerRequest = {
  classes: Array<{
    id: number;
    class_id: number;
    class_name?: string;
    subject_id: number;
    subject_name?: string;
    subject_code?: string;
    class_dept_id?: number | null;
    class_dept_name?: string | null;
    class_strength: number;
    lab_hours: number;
    requirements: string | null;
  }>;
  labs: Array<{
    id: number;
    systems: number;
    os_installed: string | null;
    system_spec: string | null;
    name: string;
    dept_id?: number | null;
    dept_name?: string | null;
  }>;
  preferences?: Array<{
    match_text: string;
    preferred_lab: string;
  }>;
  periods_per_day: number;
  days: number[];
  blocked: {
    class_slots: Record<string, Array<{ day_order: number; period: number }>>;
    lab_slots: Record<string, Array<{ day_order: number; period: number }>>;
  };
};

type LabSchedulerResponse =
  | {
      ok: true;
      assignments: Array<{
        lab_requirement_id: number;
        class_id: number;
        subject_id: number;
        lab_id: number;
        day_order: number;
        period: number;
        preview_group: string;
      }>;
      unassigned?: number[];
      preference_notes?: Array<{
        lab_requirement_id: number;
        class_name: string;
        subject_name: string;
        preferred_lab: string;
        allocated_lab: string | null;
        reason: string;
      }>;
      preference_warnings?: string[];
    }
  | { ok: false; error: string };

type LabAiSuggestion = {
  lab_requirement_id: number;
  class_id: number;
  subject_id: number;
  lab_id: number;
  day_order: number;
  period: number;
  reason?: string;
};

type AiAssistantResult = {
  suggestions: LabAiSuggestion[];
  warning?: string;
};

type LabAssignmentRow = {
  lab_requirement_id: number;
  class_id: number;
  subject_id: number;
  lab_id: number;
  day_order: number;
  period: number;
  preview_group: string;
};

function extractMessageText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textParts = content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          if (typeof item.text === 'string') return item.text;
          if (typeof item.content === 'string') return item.content;
        }
        return '';
      })
      .filter(Boolean);
    return textParts.join('\n');
  }
  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
  }
  return '';
}

function extractJsonArrayFromText(text: string): any[] {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const candidates = [
        parsed.suggestions,
        parsed.ai_suggestions,
        parsed.data,
        parsed.result,
      ];
      for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
      }
    }
  } catch {
    // Continue with fallback parsing.
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    try {
      const parsed = JSON.parse(fenceMatch[1]);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') {
        const candidates = [
          parsed.suggestions,
          parsed.ai_suggestions,
          parsed.data,
          parsed.result,
        ];
        for (const candidate of candidates) {
          if (Array.isArray(candidate)) return candidate;
        }
      }
    } catch {
      // Continue with bracket extraction.
    }
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    const candidate = trimmed.slice(firstBracket, lastBracket + 1);
    try {
      const parsed = JSON.parse(candidate);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }

  return [];
}

function extractSuggestionObjectsFromLooseText(text: string): any[] {
  const raw = String(text || '');
  if (!raw.trim()) return [];

  const objectMatches = raw.match(/\{[^{}]*\}/g) || [];
  const parsed: any[] = [];

  const readIntField = (objText: string, field: string): number => {
    const pattern = new RegExp(`["']?${field}["']?\\s*[:=]\\s*([0-9]+)`, 'i');
    const match = objText.match(pattern);
    return match ? Number(match[1]) : 0;
  };

  const readReasonField = (objText: string): string | undefined => {
    const match = objText.match(/["']?reason["']?\s*[:=]\s*["']([^"']+)["']/i);
    return match?.[1] ? String(match[1]) : undefined;
  };

  for (const objText of objectMatches) {
    const suggestion = {
      lab_requirement_id: readIntField(objText, 'lab_requirement_id') || readIntField(objText, 'requirement_id') || readIntField(objText, 'id'),
      class_id: readIntField(objText, 'class_id'),
      subject_id: readIntField(objText, 'subject_id'),
      lab_id: readIntField(objText, 'lab_id'),
      day_order: readIntField(objText, 'day_order') || readIntField(objText, 'day'),
      period: readIntField(objText, 'period'),
      reason: readReasonField(objText),
    };
    if (
      suggestion.lab_requirement_id > 0 &&
      suggestion.class_id > 0 &&
      suggestion.subject_id > 0 &&
      suggestion.lab_id > 0 &&
      suggestion.day_order > 0 &&
      suggestion.period > 0
    ) {
      parsed.push(suggestion);
    }
  }

  return parsed;
}

function normalizeAiSuggestions(raw: any[]): LabAiSuggestion[] {
  const toInt = (value: any): number => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  };

  const suggestions: LabAiSuggestion[] = [];
  for (const item of raw) {
    const reqId = toInt(item?.lab_requirement_id || item?.requirement_id || item?.id);
    const classId = toInt(item?.class_id);
    const subjectId = toInt(item?.subject_id);
    const labId = toInt(item?.lab_id);
    const day = toInt(item?.day_order || item?.day);
    const period = toInt(item?.period);
    if (reqId < 1 || classId < 1 || subjectId < 1 || labId < 1 || day < 1 || period < 1) continue;
    suggestions.push({
      lab_requirement_id: reqId,
      class_id: classId,
      subject_id: subjectId,
      lab_id: labId,
      day_order: day,
      period,
      reason: item?.reason ? String(item.reason) : undefined,
    });
  }

  return suggestions;
}

async function askAiForLabSuggestions(context: {
  classes: LabSchedulerRequest['classes'];
  labs: LabSchedulerRequest['labs'];
  unassignedRequirementIds: number[];
  targetRequirementIds?: number[];
  userInstruction?: string;
  preferenceNotes: Array<{
    lab_requirement_id: number;
    class_name: string;
    subject_name: string;
    preferred_lab: string;
    allocated_lab: string | null;
    reason: string;
  }>;
  periodsPerDay: number;
  days: number[];
}): Promise<AiAssistantResult> {
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  const deepSeekKey = process.env.DEEPSEEK_API_KEY;
  const apiKey = hfKey || deepSeekKey;
  if (!apiKey) {
    return {
      suggestions: [],
      warning: 'AI provider is not configured. Add HUGGINGFACE_API_KEY (or DEEPSEEK_API_KEY) to .env.',
    };
  }

  const usingHuggingFace = Boolean(hfKey);
  const apiUrl = usingHuggingFace
    ? (process.env.HUGGINGFACE_API_URL || 'https://router.huggingface.co/v1/chat/completions')
    : 'https://api.deepseek.com/v1/chat/completions';
  const model = usingHuggingFace
    ? (process.env.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.1-8B-Instruct')
    : (process.env.DEEPSEEK_MODEL || 'deepseek-chat');
  const providerLabel = usingHuggingFace ? 'Hugging Face' : 'DeepSeek';

  const unresolvedFromPreferences = context.preferenceNotes
    .filter(note => !note.allocated_lab)
    .map(note => note.lab_requirement_id);

  const unresolvedIds = new Set<number>(
    (context.targetRequirementIds && context.targetRequirementIds.length > 0)
      ? context.targetRequirementIds
      : [
          ...context.unassignedRequirementIds,
          ...unresolvedFromPreferences,
        ]
  );

  if (unresolvedIds.size === 0) {
    return { suggestions: [] };
  }

  const unresolvedPayload = context.classes.filter(c => unresolvedIds.has(c.id));

  const prompt = [
    'You are a university timetable optimizer helping with lab conflicts.',
    'Generate suggestions only for unresolved lab requirements and try to resolve as many as possible.',
    'Prioritize preferred labs from the preference notes whenever possible.',
    context.userInstruction ? `User resolution instruction: ${context.userInstruction}` : 'User resolution instruction: none',
    'Strictly return JSON array, no markdown, no explanation.',
    'Each object must contain: lab_requirement_id, class_id, subject_id, lab_id, day_order, period, reason.',
    `Days available: ${JSON.stringify(context.days)}`,
    `Periods per day: ${context.periodsPerDay}`,
    `Unresolved requirement IDs: ${JSON.stringify(Array.from(unresolvedIds))}`,
    `Classes: ${JSON.stringify(unresolvedPayload)}`,
    `Labs: ${JSON.stringify(context.labs)}`,
    `Preference conflict notes: ${JSON.stringify(context.preferenceNotes)}`,
  ].join('\n');

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: 'You output only valid JSON arrays.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      suggestions: [],
      warning: `${providerLabel} request failed (${response.status}): ${body.slice(0, 200)}`,
    };
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  const rawText = extractMessageText(content);
  const raw = extractJsonArrayFromText(rawText);
  const suggestions = normalizeAiSuggestions(raw);
  if (!suggestions.length) {
    const loose = extractSuggestionObjectsFromLooseText(rawText);
    const looseSuggestions = normalizeAiSuggestions(loose);
    if (looseSuggestions.length) {
      return { suggestions: looseSuggestions };
    }
  }
  if (!suggestions.length) {
    const preview = rawText.replace(/\s+/g, ' ').slice(0, 220);
    return {
      suggestions: [],
      warning: `${providerLabel} returned no valid JSON suggestions.${preview ? ` Response preview: ${preview}` : ''}`,
    };
  }
  return { suggestions };
}

function mergeAiSuggestionsIntoAssignments(params: {
  baseAssignments: LabAssignmentRow[];
  aiSuggestions: LabAiSuggestion[];
  unresolvedRequirementIds: number[];
  classes: LabSchedulerRequest['classes'];
  labs: LabSchedulerRequest['labs'];
  days: number[];
  periodsPerDay: number;
  blockedClassSlots: Record<string, Array<{ day_order: number; period: number }>>;
  blockedLabSlots: Record<string, Array<{ day_order: number; period: number }>>;
}) {
  const daySet = new Set(params.days);
  const unresolvedSet = new Set(params.unresolvedRequirementIds);
  const classByReq = new Map<number, { class_id: number; subject_id: number }>();
  for (const c of params.classes) {
    classByReq.set(c.id, { class_id: c.class_id, subject_id: c.subject_id });
  }

  const validLabIds = new Set(params.labs.map(l => l.id));

  const classOcc = new Set<string>();
  const labOcc = new Set<string>();

  const addOcc = (classId: number, labId: number, day: number, period: number) => {
    classOcc.add(`${classId}:${day}:${period}`);
    labOcc.add(`${labId}:${day}:${period}`);
  };

  for (const [classId, slots] of Object.entries(params.blockedClassSlots || {})) {
    for (const s of slots || []) {
      classOcc.add(`${Number(classId)}:${Number(s.day_order)}:${Number(s.period)}`);
    }
  }
  for (const [labId, slots] of Object.entries(params.blockedLabSlots || {})) {
    for (const s of slots || []) {
      labOcc.add(`${Number(labId)}:${Number(s.day_order)}:${Number(s.period)}`);
    }
  }

  for (const a of params.baseAssignments) {
    addOcc(a.class_id, a.lab_id, a.day_order, a.period);
  }

  const merged = [...params.baseAssignments];
  const resolvedByAi = new Set<number>();

  const sortedAi = [...params.aiSuggestions].sort((a, b) => {
    if (a.lab_requirement_id !== b.lab_requirement_id) return a.lab_requirement_id - b.lab_requirement_id;
    if (a.day_order !== b.day_order) return a.day_order - b.day_order;
    return a.period - b.period;
  });

  for (const s of sortedAi) {
    if (!unresolvedSet.has(s.lab_requirement_id)) continue;
    if (!validLabIds.has(s.lab_id)) continue;
    if (!daySet.has(s.day_order)) continue;
    if (s.period < 1 || s.period > params.periodsPerDay) continue;

    const mapped = classByReq.get(s.lab_requirement_id);
    if (!mapped) continue;

    const classId = mapped.class_id;
    const subjectId = mapped.subject_id;

    const classKey = `${classId}:${s.day_order}:${s.period}`;
    const labKey = `${s.lab_id}:${s.day_order}:${s.period}`;
    if (classOcc.has(classKey) || labOcc.has(labKey)) continue;

    merged.push({
      lab_requirement_id: s.lab_requirement_id,
      class_id: classId,
      subject_id: subjectId,
      lab_id: s.lab_id,
      day_order: s.day_order,
      period: s.period,
      preview_group: `ai_req${s.lab_requirement_id}_d${s.day_order}_p${s.period}_l${s.lab_id}`,
    });
    addOcc(classId, s.lab_id, s.day_order, s.period);
    resolvedByAi.add(s.lab_requirement_id);
  }

  const remainingUnassigned = params.unresolvedRequirementIds.filter(reqId => !resolvedByAi.has(reqId));

  return {
    assignments: merged,
    aiAppliedSlots: merged.length - params.baseAssignments.length,
    aiResolvedRequirements: Array.from(resolvedByAi).sort((a, b) => a - b),
    remainingUnassigned,
  };
}

type PlacementGroupInfo = {
  segment: 'morning' | 'afternoon';
  group: string;
  subgroup: string;
  dayOffset: number;
};

function chunkEvenly<T>(values: T[], chunkCount: number): T[][] {
  if (chunkCount <= 0) {
    return [];
  }

  const baseSize = Math.floor(values.length / chunkCount);
  const remainder = values.length % chunkCount;
  const chunks: T[][] = [];
  let start = 0;

  for (let index = 0; index < chunkCount; index++) {
    const size = baseSize + (index < remainder ? 1 : 0);
    if (size <= 0) {
      continue;
    }
    chunks.push(values.slice(start, start + size));
    start += size;
  }

  return chunks;
}

function nextBucketWithCapacity(startIndex: number, buckets: Array<PlacementGroupInfo & { capacity: number }>): number {
  for (let offset = 0; offset < buckets.length; offset++) {
    const idx = (startIndex + offset) % buckets.length;
    if (buckets[idx].capacity > 0) {
      return idx;
    }
  }

  throw new Error('No bucket capacity remaining for placement grouping');
}

function assignPlacementGroups(
  classEntries: Array<{ id: number; dept_id: number; year: number }>,
  days: number[]
): Record<number, PlacementGroupInfo> {
  const sorted = [...classEntries].sort((a, b) => a.id - b.id);
  const result: Record<number, PlacementGroupInfo> = {};
  const targetClassesPerSubgroup = 2;
  const maxCombinations = 3;

  const morningCount = Math.floor(sorted.length / 2);
  const afternoonCount = sorted.length - morningCount;

  const buildBuckets = (count: number, segment: 'morning' | 'afternoon', group: string) => {
    if (count <= 0) {
      return [] as Array<PlacementGroupInfo & { capacity: number }>;
    }

    const subgroupCount = Math.min(maxCombinations, Math.max(1, Math.ceil(count / targetClassesPerSubgroup)));
    const subgroupSizes = chunkEvenly(Array.from({ length: count }, (_, i) => i), subgroupCount).map(chunk => chunk.length);
    return subgroupSizes.map((size, subgroupIndex) => ({
      segment,
      group,
      subgroup: `${group}${subgroupIndex + 1}`,
      dayOffset: subgroupIndex,
      capacity: size
    }));
  };

  const buckets = [...buildBuckets(morningCount, 'morning', 'A'), ...buildBuckets(afternoonCount, 'afternoon', 'B')];
  const yearMap = new Map<number, Array<{ id: number; dept_id: number }>>();
  sorted.forEach(entry => {
    const existing = yearMap.get(entry.year) || [];
    existing.push({ id: entry.id, dept_id: entry.dept_id });
    yearMap.set(entry.year, existing);
  });

  const uniqueDayOffsets = [...new Set(buckets.map(bucket => bucket.dayOffset))].sort((a, b) => a - b);
  let yearPointer = 0;

  for (const year of [...yearMap.keys()].sort((a, b) => a - b)) {
    const entries = yearMap.get(year) || [];
    const preferredOffset = uniqueDayOffsets.length > 0 ? uniqueDayOffsets[yearPointer % uniqueDayOffsets.length] : 0;
    const deptMap = new Map<number, number[]>();

    entries.forEach(entry => {
      const ids = deptMap.get(entry.dept_id) || [];
      ids.push(entry.id);
      deptMap.set(entry.dept_id, ids);
    });

    let localPointer = 0;
    for (const deptId of [...deptMap.keys()].sort((a, b) => a - b)) {
      const ids = deptMap.get(deptId) || [];
      ids.forEach(classId => {
        const prioritized = buckets
          .map((bucket, index) => ({ ...bucket, index }))
          .filter(bucket => bucket.capacity > 0)
          .sort((left, right) => {
            const leftYearPenalty = left.dayOffset === preferredOffset ? 0 : 1;
            const rightYearPenalty = right.dayOffset === preferredOffset ? 0 : 1;
            if (leftYearPenalty !== rightYearPenalty) return leftYearPenalty - rightYearPenalty;

            const leftPointerPenalty = (left.index - localPointer + buckets.length) % buckets.length;
            const rightPointerPenalty = (right.index - localPointer + buckets.length) % buckets.length;
            return leftPointerPenalty - rightPointerPenalty;
          });

        const chosen = prioritized[0];
        const bucket = buckets[chosen.index];
        result[classId] = {
          segment: bucket.segment,
          group: bucket.group,
          subgroup: bucket.subgroup,
          dayOffset: bucket.dayOffset
        };
        bucket.capacity -= 1;
        localPointer = (chosen.index + 1) % buckets.length;
      });
    }

    yearPointer += 1;
  }

  return result;
}

function runPlacementScheduler(payload: SchedulerRequest): Promise<SchedulerResponse> {
  return new Promise((resolve, reject) => {
    const configuredPython = process.env.PYTHON_PATH;
    const workspaceVenvWindows = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const workspaceVenvUnix = path.join(process.cwd(), '.venv', 'bin', 'python');
    const pythonBinary = configuredPython
      || (fs.existsSync(workspaceVenvWindows) ? workspaceVenvWindows : '')
      || (fs.existsSync(workspaceVenvUnix) ? workspaceVenvUnix : '')
      || 'python';
    const scriptPath = path.join(process.cwd(), 'scheduler', 'placement_scheduler.py');
    const python = spawn(pythonBinary, [scriptPath]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    python.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    python.on('error', reject);

    python.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Placement scheduler failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as SchedulerResponse);
      } catch {
        reject(new Error(`Invalid scheduler output: ${stdout || stderr}`));
      }
    });

    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
  });
}

function runLabScheduler(payload: LabSchedulerRequest): Promise<LabSchedulerResponse> {
  return new Promise((resolve, reject) => {
    const configuredPython = process.env.PYTHON_PATH;
    const workspaceVenvWindows = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const workspaceVenvUnix = path.join(process.cwd(), '.venv', 'bin', 'python');
    const pythonBinary = configuredPython
      || (fs.existsSync(workspaceVenvWindows) ? workspaceVenvWindows : '')
      || (fs.existsSync(workspaceVenvUnix) ? workspaceVenvUnix : '')
      || 'python';
    const scriptPath = path.join(process.cwd(), 'scheduler', 'lab_solver.py');
    const python = spawn(pythonBinary, [scriptPath]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    python.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    python.on('error', reject);

    python.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Lab solver failed with code ${code}: ${stderr || stdout}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as LabSchedulerResponse);
      } catch {
        reject(new Error(`Invalid lab solver output: ${stdout || stderr}`));
      }
    });

    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
  });
}

interface TamilSchedulerRequest {
  selected_classes: Array<{ id: number; dept_id: number; year: number; name?: string }>;
  staff_assignments: Record<number, number>;
  hours_assignments: Record<number, number>;
  days: number[];
  periods_per_day: number;
  occupied_slots: Record<string, Array<{ day_order: number; period: number }>>;
  occupied_staff_slots: Record<string, Array<{ day_order: number; period: number }>>;
  subject_id: number;
}

interface TamilSchedulerResponse {
  scheduled_slots?: Array<{
    class_id: number;
    day_order: number;
    period: number;
    staff_id: number | null;
  }>;
  error?: string;
}

interface EnglishSchedulerRequest {
  selected_classes: Array<{ id: number; dept_id: number; year: number; name?: string }>;
  staff_assignments: Record<number, number>;
  hours_assignments: Record<number, number>;
  days: number[];
  periods_per_day: number;
  occupied_slots: Record<string, Array<{ day_order: number; period: number }>>;
  occupied_staff_slots: Record<string, Array<{ day_order: number; period: number }>>;
  subject_id: number;
}

interface EnglishSchedulerResponse {
  scheduled_slots?: Array<{
    class_id: number;
    day_order: number;
    period: number;
    staff_id: number | null;
  }>;
  error?: string;
}

interface MathematicsSchedulerRequest {
  assignments: Array<{
    class_id: number;
    class_name?: string;
    subject_id: number;
    subject_name?: string;
    staff_id: number | null;
    hours_per_week: number;
  }>;
  days: number[];
  periods_per_day: number;
  occupied_slots: Record<string, Array<{ day_order: number; period: number }>>;
  occupied_staff_slots: Record<string, Array<{ day_order: number; period: number }>>;
}

interface MathematicsSchedulerResponse {
  scheduled_slots?: Array<{
    class_id: number;
    subject_id: number;
    day_order: number;
    period: number;
    staff_id: number | null;
  }>;
  error?: string;
}

function runTamilScheduler(payload: TamilSchedulerRequest): Promise<TamilSchedulerResponse> {
  return new Promise((resolve, reject) => {
    const configuredPython = process.env.PYTHON_PATH;
    const workspaceVenvWindows = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const workspaceVenvUnix = path.join(process.cwd(), '.venv', 'bin', 'python');
    const pythonBinary = configuredPython
      || (fs.existsSync(workspaceVenvWindows) ? workspaceVenvWindows : '')
      || (fs.existsSync(workspaceVenvUnix) ? workspaceVenvUnix : '')
      || 'python';
    const scriptPath = path.join(process.cwd(), 'scheduler', 'tamil_scheduler.py');
    const python = spawn(pythonBinary, [scriptPath]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    python.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    python.on('error', (err: any) => {
      reject(new Error(`Tamil scheduler process error: ${err.message}`));
    });

    python.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Tamil scheduler failed with code ${code}: ${stderr || stdout || 'No output'}`));
        return;
      }

      if (!stdout || stdout.trim() === '') {
        reject(new Error('Tamil scheduler produced no output'));
        return;
      }

      try {
        const trimmed = stdout.trim();
        const parsed = JSON.parse(trimmed) as TamilSchedulerResponse;
        resolve(parsed);
      } catch (parseErr) {
        reject(new Error(`Invalid Tamil scheduler JSON output: ${stdout.substring(0, 200)}`));
      }
    });

    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
  });
}

function runEnglishScheduler(payload: EnglishSchedulerRequest): Promise<EnglishSchedulerResponse> {
  return new Promise((resolve, reject) => {
    const configuredPython = process.env.PYTHON_PATH;
    const workspaceVenvWindows = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const workspaceVenvUnix = path.join(process.cwd(), '.venv', 'bin', 'python');
    const pythonBinary = configuredPython
      || (fs.existsSync(workspaceVenvWindows) ? workspaceVenvWindows : '')
      || (fs.existsSync(workspaceVenvUnix) ? workspaceVenvUnix : '')
      || 'python';
    const scriptPath = path.join(process.cwd(), 'scheduler', 'english_scheduler.py');
    const python = spawn(pythonBinary, [scriptPath]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    python.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    python.on('error', (err: any) => {
      reject(new Error(`English scheduler process error: ${err.message}`));
    });

    python.on('close', code => {
      if (code !== 0) {
        reject(new Error(`English scheduler failed with code ${code}: ${stderr || stdout || 'No output'}`));
        return;
      }

      if (!stdout || stdout.trim() === '') {
        reject(new Error('English scheduler produced no output'));
        return;
      }

      try {
        const trimmed = stdout.trim();
        const parsed = JSON.parse(trimmed) as EnglishSchedulerResponse;
        resolve(parsed);
      } catch (parseErr) {
        reject(new Error(`Invalid English scheduler JSON output: ${stdout.substring(0, 200)}`));
      }
    });

    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
  });
}

function runMathematicsScheduler(payload: MathematicsSchedulerRequest): Promise<MathematicsSchedulerResponse> {
  return new Promise((resolve, reject) => {
    const configuredPython = process.env.PYTHON_PATH;
    const workspaceVenvWindows = path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const workspaceVenvUnix = path.join(process.cwd(), '.venv', 'bin', 'python');
    const pythonBinary = configuredPython
      || (fs.existsSync(workspaceVenvWindows) ? workspaceVenvWindows : '')
      || (fs.existsSync(workspaceVenvUnix) ? workspaceVenvUnix : '')
      || 'python';
    const scriptPath = path.join(process.cwd(), 'scheduler', 'mathematics_scheduler.py');
    const python = spawn(pythonBinary, [scriptPath]);

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    python.stderr.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    python.on('error', (err: any) => {
      reject(new Error(`Mathematics scheduler process error: ${err.message}`));
    });

    python.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Mathematics scheduler failed with code ${code}: ${stderr || stdout || 'No output'}`));
        return;
      }

      if (!stdout || stdout.trim() === '') {
        reject(new Error('Mathematics scheduler produced no output'));
        return;
      }

      try {
        const trimmed = stdout.trim();
        const parsed = JSON.parse(trimmed) as MathematicsSchedulerResponse;
        resolve(parsed);
      } catch {
        reject(new Error(`Invalid Mathematics scheduler JSON output: ${stdout.substring(0, 200)}`));
      }
    });

    python.stdin.write(JSON.stringify(payload));
    python.stdin.end();
  });
}

async function startServer() {
  if (!process.env.SUPABASE_DB_URL && !process.env.DATABASE_URL) {
    throw new Error('Missing SUPABASE_DB_URL or DATABASE_URL in .env');
  }

  await ensureSchema();

  const app = express();
  app.use(express.json());
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    return next(err);
  });
  const PORT = 3000;

  app.get('/api/settings', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT key, value FROM cg_settings');
      const map = rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      res.json(map);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/settings', async (req, res) => {
    try {
      const updates = req.body as Record<string, any>;
      await inTransaction(async client => {
        for (const [key, value] of Object.entries(updates)) {
          await client.query(
            `INSERT INTO cg_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
            [key, String(value)]
          );
        }
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/departments', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM cg_departments ORDER BY name');
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/departments', async (req, res) => {
    try {
      const { name, type } = req.body;
      const { rows } = await pool.query(
        'INSERT INTO cg_departments (name, type) VALUES ($1, $2) RETURNING id',
        [name, type]
      );
      res.json({ id: rows[0].id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/departments/:id', async (req, res) => {
    try {
      const deptId = Number(req.params.id);
      const existing = await pool.query('SELECT id FROM cg_departments WHERE id = $1', [deptId]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Department not found' });

      await inTransaction(async client => {
        const classes = await client.query('SELECT id FROM cg_classes WHERE dept_id = $1', [deptId]);
        const ids = classes.rows.map((r: { id: number }) => r.id);
        if (ids.length > 0) {
          await client.query('DELETE FROM cg_timetable_slots WHERE class_id = ANY($1::int[])', [ids]);
          await client.query('DELETE FROM cg_class_subjects WHERE class_id = ANY($1::int[])', [ids]);
          await client.query('DELETE FROM cg_lab_requirements WHERE class_id = ANY($1::int[])', [ids]);
          await client.query('DELETE FROM cg_placement_classes WHERE class_id = ANY($1::int[])', [ids]);
          await client.query('DELETE FROM cg_classes WHERE id = ANY($1::int[])', [ids]);
        }
        await client.query('UPDATE cg_staff SET dept_id = NULL WHERE dept_id = $1', [deptId]);
        await client.query('UPDATE cg_subjects SET dept_id = NULL WHERE dept_id = $1', [deptId]);
        await client.query('DELETE FROM cg_departments WHERE id = $1', [deptId]);
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/staff', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          s.*,
          d.name AS dept_name,
          GREATEST(
            COALESCE((
              SELECT SUM(hours_per_week)
              FROM cg_class_subjects
              WHERE staff_id = s.id
            ), 0),
            COALESCE((
              SELECT COUNT(*)
              FROM cg_timetable_slots
              WHERE staff_id = s.id
            ), 0)
          ) AS current_workload
        FROM cg_staff s
        LEFT JOIN cg_departments d ON s.dept_id = d.id
        ORDER BY s.name
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/staff', async (req, res) => {
    try {
      const { name, role, dept_id, max_workload } = req.body;
      const { rows } = await pool.query(
        'INSERT INTO cg_staff (name, role, dept_id, max_workload) VALUES ($1, $2, $3, $4) RETURNING id',
        [name, role, dept_id || null, max_workload]
      );
      res.json({ id: rows[0].id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/staff/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, role, dept_id, max_workload } = req.body;
      const { rows } = await pool.query(
        `UPDATE cg_staff SET name = $1, role = $2, dept_id = $3, max_workload = $4
         WHERE id = $5
         RETURNING *`,
        [name, role, dept_id || null, max_workload, id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Staff member not found' });
      }
      res.json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/staff/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM cg_staff WHERE id = $1', [id]);
      res.json({ success: true, message: 'Staff deleted successfully' });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/subjects', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM cg_subjects ORDER BY name');
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/subjects', async (req, res) => {
    try {
      const { name, code, type, dept_id, is_addon } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO cg_subjects (name, code, type, dept_id, is_addon)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name?.trim(), code?.trim(), type, dept_id ? Number(dept_id) : null, !!is_addon]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/subjects/:id', async (req, res) => {
    try {
      const subjectId = Number(req.params.id);
      const existing = await pool.query('SELECT id FROM cg_subjects WHERE id = $1', [subjectId]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Subject not found' });

      await inTransaction(async client => {
        await client.query('DELETE FROM cg_timetable_slots WHERE subject_id = $1', [subjectId]);
        await client.query('DELETE FROM cg_class_subjects WHERE subject_id = $1', [subjectId]);
        await client.query('DELETE FROM cg_lab_requirements WHERE subject_id = $1', [subjectId]);
        await client.query('DELETE FROM cg_subjects WHERE id = $1', [subjectId]);
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/classes', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT c.*, d.name AS dept_name, t.name AS tutor_name
        FROM cg_classes c
        JOIN cg_departments d ON c.dept_id = d.id
        LEFT JOIN cg_staff t ON c.tutor_staff_id = t.id
        ORDER BY c.name
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/classes', async (req, res) => {
    try {
      const { name, dept_id, year, semester, student_strength, tutor_staff_id } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO cg_classes (name, dept_id, year, semester, student_strength, tutor_staff_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          name?.trim(),
          Number(dept_id),
          Number(year),
          Number(semester),
          Number(student_strength) || 0,
          tutor_staff_id ? Number(tutor_staff_id) : null
        ]
      );
      const classId = rows[0].id;
      const result = await pool.query(
        `SELECT c.*, d.name AS dept_name, t.name AS tutor_name
         FROM cg_classes c
         JOIN cg_departments d ON c.dept_id = d.id
         LEFT JOIN cg_staff t ON c.tutor_staff_id = t.id
         WHERE c.id = $1`,
        [classId]
      );
      res.json(result.rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/classes/:id', async (req, res) => {
    try {
      const classId = Number(req.params.id);
      const existing = await pool.query('SELECT * FROM cg_classes WHERE id = $1', [classId]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Class not found' });
      const current = existing.rows[0];

      const studentStrength = req.body.student_strength ?? current.student_strength;
      const tutorStaffId = req.body.tutor_staff_id === undefined
        ? current.tutor_staff_id
        : (req.body.tutor_staff_id ? Number(req.body.tutor_staff_id) : null);

      await pool.query(
        'UPDATE cg_classes SET student_strength = $1, tutor_staff_id = $2 WHERE id = $3',
        [Number(studentStrength) || 0, tutorStaffId, classId]
      );

      const updated = await pool.query(
        `SELECT c.*, d.name AS dept_name, t.name AS tutor_name
         FROM cg_classes c
         JOIN cg_departments d ON c.dept_id = d.id
         LEFT JOIN cg_staff t ON c.tutor_staff_id = t.id
         WHERE c.id = $1`,
        [classId]
      );
      res.json(updated.rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/classes/:id/subjects', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT cs.*, s.name AS subject_name, s.code AS subject_code, st.name AS staff_name
        FROM cg_class_subjects cs
        JOIN cg_subjects s ON cs.subject_id = s.id
        LEFT JOIN cg_staff st ON cs.staff_id = st.id
        WHERE cs.class_id = $1
        ORDER BY s.name
      `, [Number(req.params.id)]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/classes/:id/subjects', async (req, res) => {
    try {
      const classId = Number(req.params.id);
      const { subject_id, staff_id, hours_per_week, is_lab_required } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO cg_class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (class_id, subject_id) DO UPDATE
         SET staff_id = EXCLUDED.staff_id,
             hours_per_week = EXCLUDED.hours_per_week,
             is_lab_required = EXCLUDED.is_lab_required
         RETURNING id`,
        [classId, Number(subject_id), staff_id ? Number(staff_id) : null, Number(hours_per_week), !!is_lab_required]
      );
      res.json({ id: rows[0].id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/classes/:id/subjects/bulk', async (req, res) => {
    try {
      const classId = Number(req.params.id);
      const subjects = req.body.subjects as any[];
      await inTransaction(async client => {
        for (const subject of subjects) {
          await client.query(
            `INSERT INTO cg_class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (class_id, subject_id) DO NOTHING`,
            [
              classId,
              Number(subject.subject_id),
              subject.staff_id ? Number(subject.staff_id) : null,
              Number(subject.hours_per_week || 3),
              !!subject.is_lab_required
            ]
          );
        }
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/subjects-and-assign', async (req, res) => {
    try {
      const { name, code, type, dept_id, class_id, staff_id, hours_per_week, is_lab_required } = req.body;
      const subject = await inTransaction(async client => {
        const created = await client.query(
          `INSERT INTO cg_subjects (name, code, type, dept_id, is_addon)
           VALUES ($1, $2, $3, $4, FALSE)
           RETURNING *`,
          [name?.trim(), code?.trim(), type, dept_id ? Number(dept_id) : null]
        );
        const subjectId = created.rows[0].id;

        await client.query(
          `INSERT INTO cg_class_subjects (class_id, subject_id, staff_id, hours_per_week, is_lab_required)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (class_id, subject_id) DO NOTHING`,
          [Number(class_id), subjectId, staff_id ? Number(staff_id) : null, Number(hours_per_week || 3), !!is_lab_required]
        );

        return created.rows[0];
      });

      res.json(subject);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/classes/:classId/subjects/:classSubjectId', async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      const classSubjectId = Number(req.params.classSubjectId);
      const { staff_id, hours_per_week, is_lab_required } = req.body;

      const existing = await pool.query(
        'SELECT * FROM cg_class_subjects WHERE id = $1 AND class_id = $2',
        [classSubjectId, classId]
      );
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Class subject not found' });
      const current = existing.rows[0];

      const updatedHours = hours_per_week !== undefined ? Number(hours_per_week) : current.hours_per_week;
      const updatedStaff = staff_id !== undefined ? (staff_id ? Number(staff_id) : null) : current.staff_id;
      const updatedLab = is_lab_required !== undefined ? !!is_lab_required : current.is_lab_required;

      await pool.query(
        `UPDATE cg_class_subjects
         SET staff_id = $1, hours_per_week = $2, is_lab_required = $3
         WHERE id = $4`,
        [updatedStaff, updatedHours, updatedLab, classSubjectId]
      );

      const updated = await pool.query(`
        SELECT cs.*, s.name AS subject_name, s.code AS subject_code, st.name AS staff_name
        FROM cg_class_subjects cs
        JOIN cg_subjects s ON cs.subject_id = s.id
        LEFT JOIN cg_staff st ON cs.staff_id = st.id
        WHERE cs.id = $1
      `, [classSubjectId]);

      res.json(updated.rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/classes/:classId/subjects/:classSubjectId', async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      const classSubjectId = Number(req.params.classSubjectId);
      const existing = await pool.query(
        'SELECT id, subject_id FROM cg_class_subjects WHERE id = $1 AND class_id = $2',
        [classSubjectId, classId]
      );
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Class subject not found' });

      const subjectId = Number(existing.rows[0].subject_id);

      const summary = await inTransaction(async client => {
        const deletedSlots = await client.query(
          'DELETE FROM cg_timetable_slots WHERE class_id = $1 AND subject_id = $2 RETURNING id',
          [classId, subjectId]
        );

        const deletedRequirements = await client.query(
          'DELETE FROM cg_lab_requirements WHERE class_id = $1 AND subject_id = $2 RETURNING id',
          [classId, subjectId]
        );

        await client.query('DELETE FROM cg_class_subjects WHERE id = $1', [classSubjectId]);

        return {
          removed_slots: deletedSlots.rowCount ?? 0,
          removed_lab_requirements: deletedRequirements.rowCount ?? 0,
        };
      });

      res.json({ success: true, ...summary });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/labs', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM cg_labs ORDER BY name');
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/labs', async (req, res) => {
    try {
      const { name, dept_id, systems_count, systems_specification, os_installed } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO cg_labs (name, dept_id, systems_count, systems_specification, os_installed)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          name,
          dept_id ? Number(dept_id) : null,
          Number(systems_count),
          systems_specification || null,
          os_installed || null,
        ]
      );
      res.json({ id: rows[0].id });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/labs/:id(\\d+)', async (req, res) => {
    try {
      const labId = Number(req.params.id);
      const { rows } = await pool.query('SELECT * FROM cg_labs WHERE id = $1', [labId]);
      if ((rows?.length ?? 0) === 0) return res.status(404).json({ error: 'Lab not found' });
      res.json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/labs/:id(\\d+)', async (req, res) => {
    try {
      const labId = Number(req.params.id);
      const existing = await pool.query('SELECT id FROM cg_labs WHERE id = $1', [labId]);
      if ((existing.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Lab not found' });

      const { name, dept_id, systems_count, systems_specification, os_installed } = req.body;
      const { rows } = await pool.query(
        `UPDATE cg_labs
         SET name = COALESCE($1, name),
             dept_id = CASE WHEN $2::int = -1 THEN NULL ELSE COALESCE($2, dept_id) END,
             systems_count = COALESCE($3, systems_count),
             systems_specification = $4,
             os_installed = $5
         WHERE id = $6
         RETURNING *`,
        [
          name ?? null,
          dept_id === null ? -1 : (dept_id !== undefined ? Number(dept_id) : null),
          systems_count !== undefined ? Number(systems_count) : null,
          systems_specification || null,
          os_installed || null,
          labId,
        ]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/labs/:id(\\d+)', async (req, res) => {
    try {
      const labId = Number(req.params.id);
      const existing = await pool.query('SELECT id FROM cg_labs WHERE id = $1', [labId]);
      if (existing.rowCount === 0) return res.status(404).json({ error: 'Lab not found' });

      const usage = await pool.query('SELECT COUNT(*)::int AS count FROM cg_timetable_slots WHERE lab_id = $1', [labId]);
      if ((usage.rows[0].count as number) > 0) {
        return res.status(400).json({ error: 'This lab is already used in the timetable and cannot be deleted.' });
      }

      await pool.query('DELETE FROM cg_labs WHERE id = $1', [labId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ── Lab Requirements ──────────────────────────────────────────────────────
  app.get('/api/lab-requirements', async (req, res) => {
    try {
      const classId = req.query.class_id ? Number(req.query.class_id) : null;
      const whereClause = classId ? 'WHERE lr.class_id = $1' : '';
      const params = classId ? [classId] : [];
      const { rows } = await pool.query(`
        SELECT lr.*,
               c.name  AS class_name,
               s.name  AS subject_name,
               s.code  AS subject_code,
               l.name  AS lab_name,
               l.systems_count AS lab_systems
        FROM cg_lab_requirements lr
        JOIN cg_classes  c ON lr.class_id   = c.id
        JOIN cg_subjects s ON lr.subject_id = s.id
        LEFT JOIN cg_labs l ON lr.lab_id    = l.id
        ${whereClause}
        ORDER BY lr.status ASC, c.name ASC, s.name ASC
      `, params);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Overview: every is_lab_required class-subject merged with its lab requirement row (if any)
  app.get('/api/lab-requirements/overview', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          cs.id          AS class_subject_id,
          cs.class_id,
          c.name         AS class_name,
          c.year         AS year,
          d.name         AS dept_name,
          cs.subject_id,
          s.name         AS subject_name,
          s.code         AS subject_code,
          cs.hours_per_week,
          lr.id          AS req_id,
          lr.duration,
          lr.requirements,
          lr.lab_id,
          l.name         AS lab_name,
          CASE
            WHEN lr.id IS NULL THEN 'not_submitted'
            ELSE lr.status
          END            AS status
        FROM cg_class_subjects cs
        JOIN cg_classes  c  ON cs.class_id   = c.id
        LEFT JOIN cg_departments d ON c.dept_id = d.id
        JOIN cg_subjects s  ON cs.subject_id = s.id
        LEFT JOIN cg_lab_requirements lr
               ON lr.class_id = cs.class_id AND lr.subject_id = cs.subject_id
        LEFT JOIN cg_labs l ON lr.lab_id = l.id
        WHERE cs.is_lab_required = true
        ORDER BY
          CASE WHEN lr.id IS NULL THEN 0 WHEN lr.status = 'pending' THEN 1 ELSE 2 END,
          c.name, s.name
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/lab-requirements', async (req, res) => {
    try {
      const { class_id, subject_id, requirements } = req.body;
      if (!class_id || !subject_id) {
        return res.status(400).json({ error: 'class_id and subject_id are required.' });
      }
      // Derive duration from the class-subject's hours_per_week
      const csRow = await pool.query(
        'SELECT hours_per_week FROM cg_class_subjects WHERE class_id = $1 AND subject_id = $2',
        [Number(class_id), Number(subject_id)]
      );
      const duration = csRow.rows[0]?.hours_per_week ?? 2;
      const { rows } = await pool.query(
        `INSERT INTO cg_lab_requirements (class_id, subject_id, duration, requirements, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
        [Number(class_id), Number(subject_id), duration, requirements || null]
      );
      res.json(rows[0]);
    } catch (e: any) {
      if ((e.code as string) === '23505') {
        return res.status(400).json({ error: 'Lab requirement already submitted for this subject.' });
      }
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/lab-requirements/:id/assign', async (req, res) => {
    try {
      const reqId = Number(req.params.id);
      const { lab_id } = req.body;
      const existing = await pool.query('SELECT * FROM cg_lab_requirements WHERE id = $1', [reqId]);
      if ((existing.rowCount ?? 0) === 0) {
        return res.status(404).json({ error: 'Lab requirement not found.' });
      }
      const row = existing.rows[0] as { lab_id: number | null };
      if (row.lab_id !== null) {
        return res.status(400).json({ error: 'Lab already assigned. Delete the request and re-submit to change.' });
      }
      if (!lab_id) return res.status(400).json({ error: 'lab_id is required.' });
      const { rows } = await pool.query(
        `UPDATE cg_lab_requirements SET lab_id = $1, status = 'assigned' WHERE id = $2 RETURNING *`,
        [Number(lab_id), reqId]
      );
      res.json(rows[0]);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/lab-requirements/:id', async (req, res) => {
    try {
      const reqId = Number(req.params.id);
      const existing = await pool.query('SELECT id FROM cg_lab_requirements WHERE id = $1', [reqId]);
      if ((existing.rowCount ?? 0) === 0) {
        return res.status(404).json({ error: 'Lab requirement not found.' });
      }
      await pool.query('DELETE FROM cg_lab_requirements WHERE id = $1', [reqId]);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/labs/assign', async (req, res) => {
    try {
      const toInt = (value: any, name: string): number => {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new Error(`Invalid numeric value for ${name}: ${value}`);
        return Math.trunc(n);
      };

      const rawPreferences = Array.isArray(req.body?.preferences) ? req.body.preferences : [];
      if (rawPreferences.length > 3) {
        return res.status(400).json({ error: 'A maximum of 3 preferences is allowed.' });
      }
      const preferences = rawPreferences
        .map((entry: any) => ({
          match_text: String(entry?.match_text || '').trim(),
          preferred_lab: String(entry?.preferred_lab || '').trim(),
        }))
        .filter((entry: { match_text: string; preferred_lab: string }) => entry.match_text && entry.preferred_lab);

      const days = Array.isArray(req.body?.days) && req.body.days.length
        ? req.body.days.map((d: any) => toInt(d, 'days[]')).filter((d: number) => d >= 1)
        : [1, 2, 3, 4, 5, 6];

      const settingsRows = await pool.query('SELECT key, value FROM cg_settings');
      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = toInt(settings.periods_per_day || 6, 'periods_per_day');

      const reqRows = await pool.query(`
        SELECT
          lr.id,
          lr.class_id,
          c.name AS class_name,
          lr.subject_id,
          s.name AS subject_name,
          s.code AS subject_code,
          c.dept_id AS class_dept_id,
          d.name AS class_dept_name,
          COALESCE(lr.duration, cs.hours_per_week) AS lab_hours,
          lr.requirements,
          c.student_strength
        FROM cg_lab_requirements lr
        JOIN cg_classes c ON c.id = lr.class_id
        LEFT JOIN cg_departments d ON d.id = c.dept_id
        JOIN cg_class_subjects cs ON cs.class_id = lr.class_id AND cs.subject_id = lr.subject_id
        JOIN cg_subjects s ON s.id = lr.subject_id
        WHERE lr.status IN ('pending', 'assigned')
      `);

      const labRows = await pool.query(`
        SELECT l.id, l.name, l.dept_id, d.name AS dept_name, l.systems_count, l.os_installed, l.systems_specification
        FROM cg_labs l
        LEFT JOIN cg_departments d ON d.id = l.dept_id
      `);

      if ((reqRows.rowCount ?? 0) === 0) {
        return res.status(400).json({ error: 'No lab requirements found to assign.' });
      }
      if ((labRows.rowCount ?? 0) === 0) {
        return res.status(400).json({ error: 'No labs available for assignment.' });
      }

      const classBusy = await pool.query(`
        SELECT class_id, day_order, period
        FROM cg_timetable_slots
      `);
      const labBusy = await pool.query(`
        SELECT lab_id, day_order, period
        FROM cg_timetable_slots
        WHERE lab_id IS NOT NULL
      `);

      const classSlots: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const r of classBusy.rows as Array<{ class_id: number; day_order: number; period: number }>) {
        const key = String(r.class_id);
        if (!classSlots[key]) classSlots[key] = [];
        classSlots[key].push({ day_order: r.day_order, period: r.period });
      }

      const labSlots: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const r of labBusy.rows as Array<{ lab_id: number; day_order: number; period: number }>) {
        const key = String(r.lab_id);
        if (!labSlots[key]) labSlots[key] = [];
        labSlots[key].push({ day_order: r.day_order, period: r.period });
      }

      const payload: LabSchedulerRequest = {
        classes: reqRows.rows.map((r: any) => ({
          id: toInt(r.id, 'lab_requirement.id'),
          class_id: toInt(r.class_id, 'lab_requirement.class_id'),
          class_name: r.class_name,
          subject_id: toInt(r.subject_id, 'lab_requirement.subject_id'),
          subject_name: r.subject_name,
          subject_code: r.subject_code,
          class_dept_id: r.class_dept_id != null ? toInt(r.class_dept_id, 'class.dept_id') : null,
          class_dept_name: r.class_dept_name,
          class_strength: toInt(r.student_strength || 0, 'class.student_strength'),
          lab_hours: toInt(r.lab_hours || 1, 'lab_requirement.lab_hours'),
          requirements: r.requirements,
        })),
        labs: labRows.rows.map((r: any) => ({
          id: toInt(r.id, 'lab.id'),
          systems: toInt(r.systems_count || 0, 'lab.systems_count'),
          os_installed: r.os_installed,
          system_spec: r.systems_specification,
          name: r.name,
          dept_id: r.dept_id != null ? toInt(r.dept_id, 'lab.dept_id') : null,
          dept_name: r.dept_name,
        })),
        preferences,
        periods_per_day: periodsPerDay,
        days,
        blocked: {
          class_slots: classSlots,
          lab_slots: labSlots,
        },
      };

      const solved = await runLabScheduler(payload);
      if (!solved.ok) {
        const msg = 'error' in solved ? solved.error : 'Lab assignment failed.';
        return res.status(400).json({ error: msg });
      }

      await inTransaction(async client => {
        await client.query("DELETE FROM cg_lab_preview_slots WHERE status = 'preview'");

        for (const a of solved.assignments) {
          const reqId = toInt(a.lab_requirement_id, 'assignment.lab_requirement_id');
          const classId = toInt(a.class_id, 'assignment.class_id');
          const subjectId = toInt(a.subject_id, 'assignment.subject_id');
          const labId = toInt(a.lab_id, 'assignment.lab_id');
          const dayOrder = toInt(a.day_order, 'assignment.day_order');
          const period = toInt(a.period, 'assignment.period');

          await client.query(
            `INSERT INTO cg_lab_preview_slots
              (lab_requirement_id, class_id, subject_id, lab_id, day_order, period, preview_group, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'preview')`,
            [
              reqId,
              classId,
              subjectId,
              labId,
              dayOrder,
              period,
              a.preview_group,
            ]
          );
        }
      });

      res.json({
        success: true,
        total_assigned_slots: solved.assignments.length,
        unassigned_requirements: solved.unassigned || [],
        preference_notes: solved.preference_notes || [],
        preference_warnings: solved.preference_warnings || [],
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/labs/preview', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          p.*,
          c.name AS class_name,
          s.name AS subject_name,
          s.code AS subject_code,
          l.name AS lab_name,
          lr.status AS requirement_status
        FROM cg_lab_preview_slots p
        JOIN cg_classes c ON c.id = p.class_id
        JOIN cg_subjects s ON s.id = p.subject_id
        JOIN cg_labs l ON l.id = p.lab_id
        JOIN cg_lab_requirements lr ON lr.id = p.lab_requirement_id
        WHERE p.status = 'preview'
        ORDER BY p.day_order, p.period, c.name
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/labs/preview/move', async (req, res) => {
    try {
      const { lab_requirement_id, from_day, from_period, to_day, to_period, to_lab_id } = req.body;
      if (!lab_requirement_id || !from_day || !from_period || !to_day || !to_period) {
        return res.status(400).json({ error: 'lab_requirement_id, from_day, from_period, to_day, to_period are required.' });
      }

      const settingsRows = await pool.query('SELECT key, value FROM cg_settings');
      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = Number(settings.periods_per_day || 6);

      await inTransaction(async client => {
        const sourceSlot = await client.query(
          `SELECT *
           FROM cg_lab_preview_slots
           WHERE lab_requirement_id = $1 AND day_order = $2 AND period = $3 AND status = 'preview'
           LIMIT 1`,
          [Number(lab_requirement_id), Number(from_day), Number(from_period)]
        );
        if ((sourceSlot.rowCount ?? 0) === 0) {
          throw new Error('Source preview slot not found.');
        }

        const source = sourceSlot.rows[0] as {
          class_id: number;
          lab_id: number;
          preview_group: string;
          lab_requirement_id: number;
        };

        const groupRows = await client.query(
          `SELECT id, day_order, period, class_id, lab_id
           FROM cg_lab_preview_slots
           WHERE lab_requirement_id = $1 AND preview_group = $2 AND status = 'preview'
           ORDER BY period`,
          [Number(lab_requirement_id), source.preview_group]
        );
        const rows = groupRows.rows as Array<{ id: number; day_order: number; period: number; class_id: number; lab_id: number }>;
        if (rows.length === 0) throw new Error('Preview group not found.');

        const minPeriod = Math.min(...rows.map(r => r.period));
        const targetLabId = to_lab_id ? Number(to_lab_id) : source.lab_id;

        for (const r of rows) {
          const periodShift = r.period - minPeriod;
          const newPeriod = Number(to_period) + periodShift;
          if (newPeriod < 1 || newPeriod > periodsPerDay) {
            throw new Error('Move exceeds valid period range.');
          }

          const classConflict = await client.query(
            `SELECT 1 FROM cg_lab_preview_slots
             WHERE class_id = $1 AND day_order = $2 AND period = $3 AND status = 'preview' AND id <> $4
               AND NOT (lab_requirement_id = $5 AND preview_group = $6)
             LIMIT 1`,
            [source.class_id, Number(to_day), newPeriod, r.id, source.lab_requirement_id, source.preview_group]
          );
          if ((classConflict.rowCount ?? 0) > 0) throw new Error('Class conflict in preview slots.');

          const labConflict = await client.query(
            `SELECT 1 FROM cg_lab_preview_slots
             WHERE lab_id = $1 AND day_order = $2 AND period = $3 AND status = 'preview' AND id <> $4
               AND NOT (lab_requirement_id = $5 AND preview_group = $6)
             LIMIT 1`,
            [targetLabId, Number(to_day), newPeriod, r.id, source.lab_requirement_id, source.preview_group]
          );
          if ((labConflict.rowCount ?? 0) > 0) throw new Error('Lab conflict in preview slots.');

          const classFixedConflict = await client.query(
            `SELECT 1 FROM cg_timetable_slots
             WHERE class_id = $1 AND day_order = $2 AND period = $3
             LIMIT 1`,
            [source.class_id, Number(to_day), newPeriod]
          );
          if ((classFixedConflict.rowCount ?? 0) > 0) throw new Error('Target class slot already occupied in timetable.');

          const labFixedConflict = await client.query(
            `SELECT 1 FROM cg_timetable_slots
             WHERE lab_id = $1 AND day_order = $2 AND period = $3
             LIMIT 1`,
            [targetLabId, Number(to_day), newPeriod]
          );
          if ((labFixedConflict.rowCount ?? 0) > 0) throw new Error('Target lab slot already occupied in timetable.');
        }

        for (const r of rows) {
          const periodShift = r.period - minPeriod;
          const newPeriod = Number(to_period) + periodShift;
          await client.query(
            `UPDATE cg_lab_preview_slots
             SET day_order = $1, period = $2, lab_id = $3
             WHERE id = $4`,
            [Number(to_day), newPeriod, targetLabId, r.id]
          );
        }
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/labs/preview/assign-manual', async (req, res) => {
    try {
      const { lab_requirement_id, day_order, period, lab_id, hours } = req.body;
      if (!lab_requirement_id || !day_order || !period || !lab_id) {
        return res.status(400).json({ error: 'lab_requirement_id, day_order, period, lab_id are required.' });
      }

      const result = await inTransaction(async client => {
        const settingsRows = await client.query('SELECT key, value FROM cg_settings');
        const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
          acc[row.key] = row.value;
          return acc;
        }, {});
        const periodsPerDay = Number(settings.periods_per_day || 6);

        const reqRow = await client.query(
          `SELECT lr.id, lr.class_id, lr.subject_id, COALESCE(lr.duration, cs.hours_per_week, 1) AS required_slots
           FROM cg_lab_requirements lr
           LEFT JOIN cg_class_subjects cs ON cs.class_id = lr.class_id AND cs.subject_id = lr.subject_id
           WHERE lr.id = $1
           LIMIT 1`,
          [Number(lab_requirement_id)]
        );

        if ((reqRow.rowCount ?? 0) === 0) {
          throw new Error('Lab requirement not found.');
        }

        const req = reqRow.rows[0] as {
          id: number;
          class_id: number;
          subject_id: number;
          required_slots: number;
        };

        const existingCount = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM cg_lab_preview_slots
           WHERE lab_requirement_id = $1 AND status = 'preview'`,
          [req.id]
        );
        const alreadyAssigned = Number(existingCount.rows[0]?.count || 0);
        const requiredSlots = Number(req.required_slots || 1);
        if (alreadyAssigned >= requiredSlots) {
          throw new Error('All required hours for this subject are already assigned in preview.');
        }

        const requestedHoursRaw = Number(hours || 1);
        const requestedHours = Number.isFinite(requestedHoursRaw) ? Math.max(1, Math.trunc(requestedHoursRaw)) : 1;
        const remaining = requiredSlots - alreadyAssigned;
        const assignHours = Math.min(requestedHours, remaining);

        const startPeriod = Number(period);
        if (startPeriod + assignHours - 1 > periodsPerDay) {
          throw new Error(`Only ${Math.max(0, periodsPerDay - startPeriod + 1)} period(s) fit from this start slot on the selected day.`);
        }

        const targetDay = Number(day_order);
        const targetLabId = Number(lab_id);

        for (let i = 0; i < assignHours; i += 1) {
          const targetPeriod = startPeriod + i;

          const classPreviewConflict = await client.query(
            `SELECT 1 FROM cg_lab_preview_slots
             WHERE class_id = $1 AND day_order = $2 AND period = $3 AND status = 'preview'
             LIMIT 1`,
            [req.class_id, targetDay, targetPeriod]
          );
          if ((classPreviewConflict.rowCount ?? 0) > 0) {
            throw new Error(`Class preview conflict at Day ${targetDay} P${targetPeriod}.`);
          }

          const labPreviewConflict = await client.query(
            `SELECT 1 FROM cg_lab_preview_slots
             WHERE lab_id = $1 AND day_order = $2 AND period = $3 AND status = 'preview'
             LIMIT 1`,
            [targetLabId, targetDay, targetPeriod]
          );
          if ((labPreviewConflict.rowCount ?? 0) > 0) {
            throw new Error(`Lab preview conflict at Day ${targetDay} P${targetPeriod}.`);
          }

          const classFixedConflict = await client.query(
            `SELECT 1 FROM cg_timetable_slots
             WHERE class_id = $1 AND day_order = $2 AND period = $3
             LIMIT 1`,
            [req.class_id, targetDay, targetPeriod]
          );
          if ((classFixedConflict.rowCount ?? 0) > 0) {
            throw new Error(`Class timetable slot already occupied at Day ${targetDay} P${targetPeriod}.`);
          }

          const labFixedConflict = await client.query(
            `SELECT 1 FROM cg_timetable_slots
             WHERE lab_id = $1 AND day_order = $2 AND period = $3
             LIMIT 1`,
            [targetLabId, targetDay, targetPeriod]
          );
          if ((labFixedConflict.rowCount ?? 0) > 0) {
            throw new Error(`Lab timetable slot already occupied at Day ${targetDay} P${targetPeriod}.`);
          }
        }

        const previewGroup = `manual_req${req.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        for (let i = 0; i < assignHours; i += 1) {
          await client.query(
            `INSERT INTO cg_lab_preview_slots
              (lab_requirement_id, class_id, subject_id, lab_id, day_order, period, preview_group, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'preview')`,
            [
              req.id,
              req.class_id,
              req.subject_id,
              targetLabId,
              targetDay,
              startPeriod + i,
              previewGroup,
            ]
          );
        }

        return {
          lab_requirement_id: req.id,
          assigned_slots: alreadyAssigned + assignHours,
          required_slots: requiredSlots,
          added_slots: assignHours,
        };
      });

      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/labs/preview/remove-manual', async (req, res) => {
    try {
      const { preview_slot_id } = req.body;
      if (!preview_slot_id) {
        return res.status(400).json({ error: 'preview_slot_id is required.' });
      }

      const removed = await inTransaction(async client => {
        const source = await client.query(
          `SELECT id, lab_requirement_id, preview_group
           FROM cg_lab_preview_slots
           WHERE id = $1 AND status = 'preview'
           LIMIT 1`,
          [Number(preview_slot_id)]
        );

        if ((source.rowCount ?? 0) === 0) {
          throw new Error('Preview slot not found.');
        }

        const row = source.rows[0] as { lab_requirement_id: number; preview_group: string };
        const deleted = await client.query(
          `DELETE FROM cg_lab_preview_slots
           WHERE status = 'preview' AND lab_requirement_id = $1 AND preview_group = $2
           RETURNING id`,
          [row.lab_requirement_id, row.preview_group]
        );
        return deleted.rowCount ?? 0;
      });

      res.json({ success: true, removed_slots: removed });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/labs/preview/apply-ai', async (req, res) => {
    try {
      const suggestions = Array.isArray(req.body?.suggestions)
        ? normalizeAiSuggestions(req.body.suggestions)
        : [];

      if (!suggestions.length) {
        return res.status(400).json({ error: 'No valid AI suggestions provided.' });
      }

      const applied = await inTransaction(async client => {
        const appliedRows: LabAiSuggestion[] = [];
        const skipped: Array<{ suggestion: LabAiSuggestion; reason: string }> = [];

        const reqIds = Array.from(new Set(suggestions.map(s => s.lab_requirement_id)));
        if (reqIds.length > 0) {
          await client.query(
            `DELETE FROM cg_lab_preview_slots
             WHERE status = 'preview' AND lab_requirement_id = ANY($1::int[])`,
            [reqIds]
          );
        }

        for (const s of suggestions) {
          const reqRow = await client.query(
            `SELECT lr.id, lr.class_id, lr.subject_id
             FROM cg_lab_requirements lr
             WHERE lr.id = $1`,
            [s.lab_requirement_id]
          );
          if ((reqRow.rowCount ?? 0) === 0) {
            skipped.push({ suggestion: s, reason: 'Lab requirement not found.' });
            continue;
          }

          const req = reqRow.rows[0] as { id: number; class_id: number; subject_id: number };
          const classId = req.class_id;
          const subjectId = req.subject_id;

          const labExists = await client.query('SELECT 1 FROM cg_labs WHERE id = $1 LIMIT 1', [s.lab_id]);
          if ((labExists.rowCount ?? 0) === 0) {
            skipped.push({ suggestion: s, reason: 'Lab not found.' });
            continue;
          }

          const classPreviewConflict = await client.query(
            `SELECT 1 FROM cg_lab_preview_slots
             WHERE class_id = $1 AND day_order = $2 AND period = $3 AND status = 'preview'
             LIMIT 1`,
            [classId, s.day_order, s.period]
          );
          if ((classPreviewConflict.rowCount ?? 0) > 0) {
            skipped.push({ suggestion: s, reason: 'Class preview conflict at target slot.' });
            continue;
          }

          const labPreviewConflict = await client.query(
            `SELECT 1 FROM cg_lab_preview_slots
             WHERE lab_id = $1 AND day_order = $2 AND period = $3 AND status = 'preview'
             LIMIT 1`,
            [s.lab_id, s.day_order, s.period]
          );
          if ((labPreviewConflict.rowCount ?? 0) > 0) {
            skipped.push({ suggestion: s, reason: 'Lab preview conflict at target slot.' });
            continue;
          }

          const classFixedConflict = await client.query(
            `SELECT 1 FROM cg_timetable_slots
             WHERE class_id = $1 AND day_order = $2 AND period = $3
             LIMIT 1`,
            [classId, s.day_order, s.period]
          );
          if ((classFixedConflict.rowCount ?? 0) > 0) {
            skipped.push({ suggestion: s, reason: 'Class timetable slot already occupied.' });
            continue;
          }

          const labFixedConflict = await client.query(
            `SELECT 1 FROM cg_timetable_slots
             WHERE lab_id = $1 AND day_order = $2 AND period = $3
             LIMIT 1`,
            [s.lab_id, s.day_order, s.period]
          );
          if ((labFixedConflict.rowCount ?? 0) > 0) {
            skipped.push({ suggestion: s, reason: 'Lab timetable slot already occupied.' });
            continue;
          }

          const previewGroup = `ai_req${s.lab_requirement_id}_d${s.day_order}_p${s.period}_l${s.lab_id}`;
          await client.query(
            `INSERT INTO cg_lab_preview_slots
              (lab_requirement_id, class_id, subject_id, lab_id, day_order, period, preview_group, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'preview')`,
            [s.lab_requirement_id, classId, subjectId, s.lab_id, s.day_order, s.period, previewGroup]
          );

          appliedRows.push({
            ...s,
            class_id: classId,
            subject_id: subjectId,
          });
        }

        return {
          applied_rows: appliedRows,
          skipped,
        };
      });

      res.json({
        success: true,
        applied: applied.applied_rows.length,
        skipped: applied.skipped,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/labs/resolve-with-input', async (req, res) => {
    try {
      const instruction = String(req.body?.instruction || '').trim();
      if (!instruction) {
        return res.status(400).json({ error: 'instruction is required.' });
      }

      const toInt = (value: any, name: string): number => {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new Error(`Invalid numeric value for ${name}: ${value}`);
        return Math.trunc(n);
      };

      const targetRequirementIds = Array.isArray(req.body?.requirement_ids)
        ? req.body.requirement_ids.map((v: any) => toInt(v, 'requirement_ids[]')).filter((v: number) => v > 0)
        : [];

      const settingsRows = await pool.query('SELECT key, value FROM cg_settings');
      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = toInt(settings.periods_per_day || 6, 'periods_per_day');
      const days = [1, 2, 3, 4, 5, 6];

      const reqRows = await pool.query(`
        SELECT
          lr.id,
          lr.class_id,
          c.name AS class_name,
          lr.subject_id,
          s.name AS subject_name,
          s.code AS subject_code,
          c.dept_id AS class_dept_id,
          d.name AS class_dept_name,
          COALESCE(lr.duration, cs.hours_per_week) AS lab_hours,
          lr.requirements,
          c.student_strength
        FROM cg_lab_requirements lr
        JOIN cg_classes c ON c.id = lr.class_id
        LEFT JOIN cg_departments d ON d.id = c.dept_id
        JOIN cg_class_subjects cs ON cs.class_id = lr.class_id AND cs.subject_id = lr.subject_id
        JOIN cg_subjects s ON s.id = lr.subject_id
        WHERE lr.status IN ('pending', 'assigned')
      `);

      const labRows = await pool.query(`
        SELECT l.id, l.name, l.dept_id, d.name AS dept_name, l.systems_count, l.os_installed, l.systems_specification
        FROM cg_labs l
        LEFT JOIN cg_departments d ON d.id = l.dept_id
      `);

      const currentPreview = await pool.query(`
        SELECT lab_requirement_id, class_id, subject_id, lab_id, day_order, period, preview_group
        FROM cg_lab_preview_slots
        WHERE status = 'preview'
      `);

      const classBusy = await pool.query(`
        SELECT class_id, day_order, period
        FROM cg_timetable_slots
      `);
      const labBusy = await pool.query(`
        SELECT lab_id, day_order, period
        FROM cg_timetable_slots
        WHERE lab_id IS NOT NULL
      `);

      const classSlots: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const r of classBusy.rows as Array<{ class_id: number; day_order: number; period: number }>) {
        const key = String(r.class_id);
        if (!classSlots[key]) classSlots[key] = [];
        classSlots[key].push({ day_order: r.day_order, period: r.period });
      }

      const labSlots: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const r of labBusy.rows as Array<{ lab_id: number; day_order: number; period: number }>) {
        const key = String(r.lab_id);
        if (!labSlots[key]) labSlots[key] = [];
        labSlots[key].push({ day_order: r.day_order, period: r.period });
      }

      const classesPayload = reqRows.rows.map((r: any) => ({
        id: toInt(r.id, 'lab_requirement.id'),
        class_id: toInt(r.class_id, 'lab_requirement.class_id'),
        class_name: r.class_name,
        subject_id: toInt(r.subject_id, 'lab_requirement.subject_id'),
        subject_name: r.subject_name,
        subject_code: r.subject_code,
        class_dept_id: r.class_dept_id != null ? toInt(r.class_dept_id, 'class.dept_id') : null,
        class_dept_name: r.class_dept_name,
        class_strength: toInt(r.student_strength || 0, 'class.student_strength'),
        lab_hours: toInt(r.lab_hours || 1, 'lab_requirement.lab_hours'),
        requirements: r.requirements,
      }));

      const labsPayload = labRows.rows.map((r: any) => ({
        id: toInt(r.id, 'lab.id'),
        systems: toInt(r.systems_count || 0, 'lab.systems_count'),
        os_installed: r.os_installed,
        system_spec: r.systems_specification,
        name: r.name,
        dept_id: r.dept_id != null ? toInt(r.dept_id, 'lab.dept_id') : null,
        dept_name: r.dept_name,
      }));

      const allReqIds = classesPayload.map(c => c.id);
      const assignedReqIds = new Set<number>((currentPreview.rows as Array<any>).map(r => Number(r.lab_requirement_id)).filter(Number.isFinite));
      const unresolved = targetRequirementIds.length > 0
        ? targetRequirementIds
        : allReqIds.filter(id => !assignedReqIds.has(id));

      const ai = await askAiForLabSuggestions({
        classes: classesPayload,
        labs: labsPayload,
        unassignedRequirementIds: unresolved,
        targetRequirementIds: unresolved,
        userInstruction: instruction,
        preferenceNotes: [],
        periodsPerDay,
        days,
      });

      const baseAssignments = (currentPreview.rows as Array<any>).map(r => ({
        lab_requirement_id: toInt(r.lab_requirement_id, 'preview.lab_requirement_id'),
        class_id: toInt(r.class_id, 'preview.class_id'),
        subject_id: toInt(r.subject_id, 'preview.subject_id'),
        lab_id: toInt(r.lab_id, 'preview.lab_id'),
        day_order: toInt(r.day_order, 'preview.day_order'),
        period: toInt(r.period, 'preview.period'),
        preview_group: String(r.preview_group || ''),
      })) as LabAssignmentRow[];

      const merged = mergeAiSuggestionsIntoAssignments({
        baseAssignments,
        aiSuggestions: ai.suggestions,
        unresolvedRequirementIds: unresolved,
        classes: classesPayload,
        labs: labsPayload,
        days,
        periodsPerDay,
        blockedClassSlots: classSlots,
        blockedLabSlots: labSlots,
      });

      await inTransaction(async client => {
        await client.query("DELETE FROM cg_lab_preview_slots WHERE status = 'preview'");
        for (const a of merged.assignments) {
          await client.query(
            `INSERT INTO cg_lab_preview_slots
              (lab_requirement_id, class_id, subject_id, lab_id, day_order, period, preview_group, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'preview')`,
            [
              a.lab_requirement_id,
              a.class_id,
              a.subject_id,
              a.lab_id,
              a.day_order,
              a.period,
              a.preview_group,
            ]
          );
        }
      });

      res.json({
        success: true,
        applied_slots: merged.aiAppliedSlots,
        resolved_requirements: merged.aiResolvedRequirements,
        remaining_unassigned: merged.remainingUnassigned,
        ai_warning: ai.warning,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/labs/fix', async (req, res) => {
    try {
      const summary = await inTransaction(async client => {
        const previewRows = await client.query(
          `SELECT * FROM cg_lab_preview_slots WHERE status = 'preview' ORDER BY day_order, period`
        );
        const rows = previewRows.rows as Array<{
          lab_requirement_id: number;
          class_id: number;
          subject_id: number;
          lab_id: number;
          day_order: number;
          period: number;
        }>;

        if (rows.length === 0) {
          return { applied: 0, requirements: 0 };
        }

        for (const row of rows) {
          const staff = await client.query(
            `SELECT staff_id FROM cg_class_subjects WHERE class_id = $1 AND subject_id = $2 LIMIT 1`,
            [row.class_id, row.subject_id]
          );
          const staffId = (staff.rows[0]?.staff_id ?? null) as number | null;

          await client.query(
            `INSERT INTO cg_timetable_slots
              (class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked)
             VALUES ($1, $2, $3, $4, $5, $6, 'lab', false)
             ON CONFLICT (class_id, day_order, period) DO UPDATE
               SET subject_id = EXCLUDED.subject_id,
                   staff_id = EXCLUDED.staff_id,
                   lab_id = EXCLUDED.lab_id,
                   type = EXCLUDED.type`,
            [row.class_id, row.day_order, row.period, row.subject_id, staffId, row.lab_id]
          );
        }

        await client.query(`
          UPDATE cg_lab_requirements lr
          SET status = 'assigned',
              lab_id = picked.lab_id
          FROM (
            SELECT lab_requirement_id, MIN(lab_id) AS lab_id
            FROM cg_lab_preview_slots
            WHERE status = 'preview'
            GROUP BY lab_requirement_id
          ) picked
          WHERE lr.id = picked.lab_requirement_id
        `);

        await client.query("DELETE FROM cg_lab_preview_slots WHERE status = 'preview'");

        return {
          applied: rows.length,
          requirements: new Set(rows.map(r => r.lab_requirement_id)).size,
        };
      });

      res.json({ success: true, ...summary });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/labs/unassign-all', async (req, res) => {
    try {
      const summary = await inTransaction(async client => {
        const previewDeleted = await client.query(
          `DELETE FROM cg_lab_preview_slots WHERE status = 'preview' RETURNING id`
        );

        const timetableDeleted = await client.query(
          `DELETE FROM cg_timetable_slots
           WHERE type = 'lab' OR lab_id IS NOT NULL
           RETURNING id`
        );

        const requirementsUpdated = await client.query(
          `UPDATE cg_lab_requirements
           SET status = 'pending', lab_id = NULL
           WHERE status = 'assigned' OR lab_id IS NOT NULL
           RETURNING id`
        );

        return {
          preview_cleared: previewDeleted.rowCount ?? 0,
          slots_unassigned: timetableDeleted.rowCount ?? 0,
          requirements_reset: requirementsUpdated.rowCount ?? 0,
        };
      });

      res.json({ success: true, ...summary });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/timetable/lab/:labId', async (req, res) => {
    try {
      const labId = Number(req.params.labId);
      const { rows } = await pool.query(`
        SELECT ts.*, c.name AS class_name, s.name AS subject_name, s.code AS subject_code,
               st.name AS staff_name, l.name AS lab_name
        FROM cg_timetable_slots ts
        JOIN cg_classes c ON ts.class_id = c.id
        LEFT JOIN cg_subjects s ON ts.subject_id = s.id
        LEFT JOIN cg_staff st ON ts.staff_id = st.id
        LEFT JOIN cg_labs l ON ts.lab_id = l.id
        WHERE ts.lab_id = $1
        ORDER BY ts.day_order, ts.period
      `, [labId]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.patch('/api/timetable/labs/move', async (req, res) => {
    try {
      const { slot_id, to_day, to_period, to_lab_id } = req.body;
      if (!slot_id || !to_day || !to_period || !to_lab_id) {
        return res.status(400).json({ error: 'slot_id, to_day, to_period, to_lab_id are required.' });
      }

      await inTransaction(async client => {
        const sourceRow = await client.query(
          `SELECT id, class_id, day_order, period, lab_id
           FROM cg_timetable_slots
           WHERE id = $1 AND lab_id IS NOT NULL
           LIMIT 1`,
          [Number(slot_id)]
        );
        if ((sourceRow.rowCount ?? 0) === 0) {
          throw new Error('Source timetable slot not found.');
        }

        const source = sourceRow.rows[0] as {
          id: number;
          class_id: number;
          day_order: number;
          period: number;
          lab_id: number;
        };

        const targetDay = Number(to_day);
        const targetPeriod = Number(to_period);
        const targetLabId = Number(to_lab_id);

        const classConflict = await client.query(
          `SELECT 1
           FROM cg_timetable_slots
           WHERE class_id = $1 AND day_order = $2 AND period = $3 AND id <> $4
           LIMIT 1`,
          [source.class_id, targetDay, targetPeriod, source.id]
        );
        if ((classConflict.rowCount ?? 0) > 0) {
          throw new Error('Class conflict at target slot.');
        }

        const labConflict = await client.query(
          `SELECT 1
           FROM cg_timetable_slots
           WHERE lab_id = $1 AND day_order = $2 AND period = $3 AND id <> $4
           LIMIT 1`,
          [targetLabId, targetDay, targetPeriod, source.id]
        );
        if ((labConflict.rowCount ?? 0) > 0) {
          throw new Error('Lab conflict at target slot.');
        }

        await client.query(
          `UPDATE cg_timetable_slots
           SET day_order = $1, period = $2, lab_id = $3
           WHERE id = $4`,
          [targetDay, targetPeriod, targetLabId, source.id]
        );
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/timetable/labs/remove', async (req, res) => {
    try {
      const { slot_id } = req.body;
      if (!slot_id) {
        return res.status(400).json({ error: 'slot_id is required.' });
      }

      const result = await inTransaction(async client => {
        const sourceRow = await client.query(
          `SELECT class_id, subject_id, lab_id
           FROM cg_timetable_slots
           WHERE id = $1 AND lab_id IS NOT NULL`,
          [Number(slot_id)]
        );

        if ((sourceRow.rowCount ?? 0) === 0) {
          throw new Error('Timetable lab slot not found.');
        }

        const { class_id, subject_id, lab_id } = sourceRow.rows[0];

        // Delete the slot
        await client.query('DELETE FROM cg_timetable_slots WHERE id = $1', [Number(slot_id)]);

        // Check if any other slots for this requirement exist
        const remaining = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM cg_timetable_slots
           WHERE class_id = $1 AND subject_id = $2 AND lab_id IS NOT NULL`,
          [class_id, subject_id]
        );

        const remainingCount = Number(remaining.rows[0].count);
        if (remainingCount === 0) {
          // Reset requirement status
          await client.query(
            `UPDATE cg_lab_requirements
             SET status = 'pending', lab_id = NULL
             WHERE class_id = $1 AND subject_id = $2`,
            [class_id, subject_id]
          );
        }

        return { class_id, subject_id, remaining_slots: remainingCount };
      });

      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/timetable/labs', async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          ts.id,
          ts.class_id,
          c.name AS class_name,
          ts.subject_id,
          s.name AS subject_name,
          s.code AS subject_code,
          ts.lab_id,
          l.name AS lab_name,
          ts.day_order,
          ts.period,
          ts.type
        FROM cg_timetable_slots ts
        JOIN cg_classes c ON c.id = ts.class_id
        LEFT JOIN cg_subjects s ON s.id = ts.subject_id
        JOIN cg_labs l ON l.id = ts.lab_id
        WHERE ts.lab_id IS NOT NULL
        ORDER BY l.name, ts.day_order, ts.period, c.name
      `);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/timetable/:classId', async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      const { rows } = await pool.query(`
        SELECT ts.*, s.name AS subject_name, s.code AS subject_code, st.name AS staff_name, l.name AS lab_name
        FROM cg_timetable_slots ts
        LEFT JOIN cg_subjects s ON ts.subject_id = s.id
        LEFT JOIN cg_staff st ON ts.staff_id = st.id
        LEFT JOIN cg_labs l ON ts.lab_id = l.id
        WHERE ts.class_id = $1
      `, [classId]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/timetable/staff/:staffId', async (req, res) => {
    try {
      const staffId = Number(req.params.staffId);
      const { rows } = await pool.query(`
        SELECT
          ts.*,
          c.name AS class_name,
          s.name AS subject_name,
          s.code AS subject_code,
          st.name AS staff_name,
          l.name AS lab_name
        FROM cg_timetable_slots ts
        JOIN cg_classes c ON c.id = ts.class_id
        LEFT JOIN cg_subjects s ON ts.subject_id = s.id
        LEFT JOIN cg_staff st ON ts.staff_id = st.id
        LEFT JOIN cg_labs l ON ts.lab_id = l.id
        WHERE ts.staff_id = $1
        ORDER BY ts.day_order, ts.period, c.name
      `, [staffId]);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/timetable/assign', async (req, res) => {
    try {
      const { class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked } = req.body;

      if (staff_id) {
        const clash = await pool.query(
          `SELECT id FROM cg_timetable_slots
           WHERE staff_id = $1 AND day_order = $2 AND period = $3 AND class_id != $4
           LIMIT 1`,
          [Number(staff_id), Number(day_order), Number(period), Number(class_id)]
        );
        if (clash.rowCount) return res.status(400).json({ error: 'Staff already assigned to another class at this time' });
      }

      if (lab_id) {
        const labClash = await pool.query(
          `SELECT id FROM cg_timetable_slots
           WHERE lab_id = $1 AND day_order = $2 AND period = $3 AND class_id != $4
           LIMIT 1`,
          [Number(lab_id), Number(day_order), Number(period), Number(class_id)]
        );
        if (labClash.rowCount) return res.status(400).json({ error: 'Lab already occupied at this time' });
      }

      await pool.query(
        `INSERT INTO cg_timetable_slots (class_id, day_order, period, subject_id, staff_id, lab_id, type, is_locked)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (class_id, day_order, period) DO UPDATE
         SET subject_id = EXCLUDED.subject_id,
             staff_id = EXCLUDED.staff_id,
             lab_id = EXCLUDED.lab_id,
             type = EXCLUDED.type,
             is_locked = EXCLUDED.is_locked`,
        [
          Number(class_id),
          Number(day_order),
          Number(period),
          subject_id ? Number(subject_id) : null,
          staff_id ? Number(staff_id) : null,
          lab_id ? Number(lab_id) : null,
          type ?? null,
          !!is_locked
        ]
      );

      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/placement/blocks', async (req, res) => {
    try {
      const blocks = await pool.query('SELECT * FROM cg_placement_blocks ORDER BY id DESC');
      const result = [] as any[];
      for (const block of blocks.rows) {
        const classes = await pool.query(
          `SELECT c.*, d.name AS dept_name FROM cg_classes c
           JOIN cg_placement_classes pc ON c.id = pc.class_id
           JOIN cg_departments d ON d.id = c.dept_id
           WHERE pc.placement_id = $1`,
          [block.id]
        );
        const preview = await pool.query(
          'SELECT COUNT(*)::int AS count FROM cg_placement_preview_slots WHERE placement_block_id = $1',
          [block.id]
        );
        result.push({
          ...block,
          classes: classes.rows,
          has_preview: Number(preview.rows[0].count) > 0
        });
      }
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/placement/blocks', async (req, res) => {
    try {
      const { name, hours, class_ids } = req.body as { name: string; hours: number; class_ids: number[] };

      if (!Array.isArray(class_ids) || class_ids.length === 0) {
        return res.status(400).json({ error: 'Select at least one class for placement.' });
      }

      const normalizedHours = Number(hours);
      if (!Number.isInteger(normalizedHours) || normalizedHours < 2) {
        return res.status(400).json({ error: 'Placement block must be at least 2 consecutive hours.' });
      }

      const blockId = await inTransaction(async client => {
        const dedupedClassIds = [...new Set(class_ids.map(id => Number(id)).filter(Boolean))];
        const block = await client.query(
          'INSERT INTO cg_placement_blocks (name, hours) VALUES ($1, $2) RETURNING id',
          [name, normalizedHours]
        );
        const placementId = block.rows[0].id as number;

        for (const classId of dedupedClassIds) {
          await client.query(
            'INSERT INTO cg_placement_classes (placement_id, class_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [placementId, Number(classId)]
          );
        }

        return placementId;
      });

      res.json({ id: blockId });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/placement/blocks/:id/generate-preview', async (req, res) => {
    try {
      const blockId = Number(req.params.id);

      const generated = await inTransaction(async client => {
        const blockRows = await client.query('SELECT id, hours FROM cg_placement_blocks WHERE id = $1', [blockId]);
        if (blockRows.rowCount === 0) {
          throw new Error('Placement block not found');
        }

        const block = blockRows.rows[0] as { id: number; hours: number };
        const classRows = await client.query(
          `SELECT pc.class_id, c.dept_id, c.year
           FROM cg_placement_classes pc
           JOIN cg_classes c ON c.id = pc.class_id
           WHERE pc.placement_id = $1
           ORDER BY pc.class_id`,
          [blockId]
        );
        const classDetails = classRows.rows as Array<{ class_id: number; dept_id: number; year: number }>;
        const classIds = classDetails.map(r => r.class_id);
        if (classIds.length === 0) {
          throw new Error('No classes assigned to this placement block');
        }

        const settingsRows = await client.query('SELECT key, value FROM cg_settings');
        const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
          acc[row.key] = row.value;
          return acc;
        }, {});
        const periodsPerDay = Number(settings.periods_per_day || 6);

        const occupiedRows = await client.query(
          `SELECT class_id, day_order, period, type, placement_block_id
           FROM cg_timetable_slots
           WHERE class_id = ANY($1::int[])
             AND NOT (type = 'placement' AND placement_block_id = $2)`,
          [classIds, blockId]
        );

        const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
        const blockedBySubjects: Record<string, Array<{ day_order: number; period: number }>> = {};
        for (const classId of classIds) {
          occupied[String(classId)] = [];
          blockedBySubjects[String(classId)] = [];
        }

        for (const row of occupiedRows.rows as Array<{ class_id: number; day_order: number; period: number; type: string | null }>) {
          occupied[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
          if (row.type !== 'placement') {
            blockedBySubjects[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
          }
        }

        const schedule = await runPlacementScheduler({
          classes: classIds,
          class_details: classDetails.map(item => ({ id: item.class_id, dept_id: item.dept_id, year: item.year })),
          hours: Number(block.hours),
          periods_per_day: periodsPerDay,
          days: [1, 2, 3, 4, 5, 6],
          occupied
        });

        if (!schedule.ok) {
          const errorMessage = 'error' in schedule ? schedule.error : 'Placement scheduler failed';
          throw new Error(errorMessage);
        }

        await client.query('DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1', [blockId]);

        for (const assignment of schedule.assignments) {
          for (const period of assignment.periods) {
            await client.query(
              `INSERT INTO cg_placement_preview_slots (placement_block_id, class_id, day_order, period)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (placement_block_id, class_id, day_order, period) DO NOTHING`,
              [blockId, assignment.class_id, assignment.day_order, period]
            );
          }
        }

        return {
          assignments: schedule.assignments,
          blocked_by_subjects: blockedBySubjects,
          periods_per_day: periodsPerDay,
          hours: Number(block.hours)
        };
      });

      res.json(generated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/placement/blocks/:id/preview', async (req, res) => {
    try {
      const blockId = Number(req.params.id);

      const result = await inTransaction(async client => {
        const blockRows = await client.query('SELECT id, hours FROM cg_placement_blocks WHERE id = $1', [blockId]);
        if (blockRows.rowCount === 0) {
          throw new Error('Placement block not found');
        }

        const classRows = await client.query(
          `SELECT pc.class_id, c.dept_id, c.year
           FROM cg_placement_classes pc
           JOIN cg_classes c ON c.id = pc.class_id
           WHERE pc.placement_id = $1
           ORDER BY pc.class_id`,
          [blockId]
        );
        const classDetails = classRows.rows as Array<{ class_id: number; dept_id: number; year: number }>;
        const classIds = classDetails.map(r => r.class_id);
        if (classIds.length === 0) {
          throw new Error('No classes assigned to this placement block');
        }

        const settingsRows = await client.query('SELECT key, value FROM cg_settings');
        const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
          acc[row.key] = row.value;
          return acc;
        }, {});
        const periodsPerDay = Number(settings.periods_per_day || 6);

        const blockedRows = await client.query(
          `SELECT class_id, day_order, period, type
           FROM cg_timetable_slots
           WHERE class_id = ANY($1::int[])
             AND NOT (type = 'placement' AND placement_block_id = $2)`,
          [classIds, blockId]
        );

        const blockedBySubjects: Record<string, Array<{ day_order: number; period: number }>> = {};
        for (const classId of classIds) {
          blockedBySubjects[String(classId)] = [];
        }

        for (const row of blockedRows.rows as Array<{ class_id: number; day_order: number; period: number; type: string | null }>) {
          if (row.type !== 'placement') {
            blockedBySubjects[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
          }
        }

        const previewRows = await client.query(
          `SELECT class_id, day_order, period
           FROM cg_placement_preview_slots
           WHERE placement_block_id = $1
           ORDER BY class_id, day_order, period`,
          [blockId]
        );

        const grouped = new Map<string, number[]>();
        for (const row of previewRows.rows as Array<{ class_id: number; day_order: number; period: number }>) {
          const key = `${row.class_id}-${row.day_order}`;
          const values = grouped.get(key) || [];
          values.push(Number(row.period));
          grouped.set(key, values);
        }

        const groupInfo = assignPlacementGroups(
          classDetails.map(item => ({ id: item.class_id, dept_id: item.dept_id, year: item.year })),
          [1, 2, 3, 4, 5, 6]
        );

        const assignments: Array<{
          class_id: number;
          day_order: number;
          start_period: number;
          periods: number[];
          segment: 'morning' | 'afternoon';
          group?: string;
          subgroup?: string;
        }> = [];

        for (const [key, periods] of grouped.entries()) {
          const [classIdRaw, dayRaw] = key.split('-');
          const classId = Number(classIdRaw);
          const dayOrder = Number(dayRaw);
          periods.sort((a, b) => a - b);
          if (periods.length === 0) continue;
          const info = groupInfo[classId];
          const segment: 'morning' | 'afternoon' = info?.segment || (periods[0] <= Math.floor(periodsPerDay / 2) ? 'morning' : 'afternoon');

          assignments.push({
            class_id: classId,
            day_order: dayOrder,
            start_period: periods[0],
            periods,
            segment,
            group: info?.group,
            subgroup: info?.subgroup
          });
        }

        return {
          assignments,
          blocked_by_subjects: blockedBySubjects,
          periods_per_day: periodsPerDay,
          hours: Number(blockRows.rows[0].hours)
        };
      });

      res.json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/placement/blocks/:id/fix-slots', async (req, res) => {
    try {
      const blockId = Number(req.params.id);
      const { assignments } = req.body as {
        assignments: Array<{ class_id: number; day_order: number; periods: number[] }>;
      };

      if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ error: 'No generated assignments provided to fix.' });
      }

      await inTransaction(async client => {
        const blockRows = await client.query('SELECT id FROM cg_placement_blocks WHERE id = $1', [blockId]);
        if (blockRows.rowCount === 0) {
          throw new Error('Placement block not found');
        }

        const hoursRows = await client.query('SELECT hours FROM cg_placement_blocks WHERE id = $1', [blockId]);
        const blockHours = Number(hoursRows.rows[0].hours || 0);

        const classRows = await client.query('SELECT class_id FROM cg_placement_classes WHERE placement_id = $1', [blockId]);
        const allowedClassIds = new Set(classRows.rows.map((r: { class_id: number }) => r.class_id));

        await client.query('DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1', [blockId]);

        for (const a of assignments) {
          if (!allowedClassIds.has(Number(a.class_id))) {
            throw new Error(`Class ${a.class_id} is not part of this placement block`);
          }

          const periods = (a.periods || []).map(Number).sort((x, y) => x - y);
          if (periods.length < 2) {
            throw new Error(`Class ${a.class_id} must have at least 2 consecutive placement periods`);
          }
          for (let i = 1; i < periods.length; i++) {
            if (periods[i] !== periods[i - 1] + 1) {
              throw new Error(`Class ${a.class_id} placement periods must be consecutive`);
            }
          }

          for (const p of periods) {
            const clash = await client.query(
              `SELECT id
               FROM cg_timetable_slots
               WHERE class_id = $1
                 AND day_order = $2
                 AND period = $3
                 AND NOT (type = 'placement' AND placement_block_id = $4)
               LIMIT 1`,
              [Number(a.class_id), Number(a.day_order), Number(p), blockId]
            );

            if (clash.rowCount > 0) {
              throw new Error(
                `Conflict detected for class ${a.class_id} at Day ${a.day_order}, Period ${p}.`
              );
            }

            await client.query(
              `INSERT INTO cg_placement_preview_slots (placement_block_id, class_id, day_order, period)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (placement_block_id, class_id, day_order, period) DO NOTHING`,
              [blockId, Number(a.class_id), Number(a.day_order), Number(p)]
            );
          }
        }

        const previewRows = await client.query(
          `SELECT class_id, day_order, period
           FROM cg_placement_preview_slots
           WHERE placement_block_id = $1
           ORDER BY class_id, day_order, period`,
          [blockId]
        );

        if (previewRows.rowCount === 0) {
          throw new Error('No preview slots found to fix. Generate preview first.');
        }

        const grouped = new Map<string, number[]>();
        for (const row of previewRows.rows as Array<{ class_id: number; day_order: number; period: number }>) {
          const key = `${row.class_id}-${row.day_order}`;
          const periods = grouped.get(key) || [];
          periods.push(Number(row.period));
          grouped.set(key, periods);
        }

        const classToDays = new Map<number, number>();
        for (const [key, periods] of grouped.entries()) {
          periods.sort((x, y) => x - y);
          if (periods.length !== blockHours) {
            throw new Error(`Preview hours mismatch for ${key}. Expected ${blockHours} periods.`);
          }
          for (let i = 1; i < periods.length; i++) {
            if (periods[i] !== periods[i - 1] + 1) {
              throw new Error(`Preview periods must be consecutive for ${key}.`);
            }
          }
          const classId = Number(key.split('-')[0]);
          classToDays.set(classId, (classToDays.get(classId) || 0) + 1);
        }

        for (const classId of allowedClassIds.values()) {
          if ((classToDays.get(classId) || 0) !== 1) {
            throw new Error(`Class ${classId} must have exactly one preview block before fixing.`);
          }
        }

        await client.query('DELETE FROM cg_timetable_slots WHERE placement_block_id = $1', [blockId]);

        for (const row of previewRows.rows as Array<{ class_id: number; day_order: number; period: number }>) {
          await client.query(
            `INSERT INTO cg_timetable_slots (class_id, day_order, period, type, is_locked, placement_block_id, subject_id, staff_id, lab_id)
             VALUES ($1, $2, $3, 'placement', TRUE, $4, NULL, NULL, NULL)
             ON CONFLICT (class_id, day_order, period) DO UPDATE
             SET type = EXCLUDED.type,
                 is_locked = EXCLUDED.is_locked,
                 placement_block_id = EXCLUDED.placement_block_id,
                 subject_id = NULL,
                 staff_id = NULL,
                 lab_id = NULL`,
            [Number(row.class_id), Number(row.day_order), Number(row.period), blockId]
          );
        }

        await client.query('DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1', [blockId]);
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/placement/blocks/:id', async (req, res) => {
    try {
      const blockId = Number(req.params.id);
      await inTransaction(async client => {
        const classes = await client.query('SELECT class_id FROM cg_placement_classes WHERE placement_id = $1', [blockId]);

        const taggedDelete = await client.query('DELETE FROM cg_timetable_slots WHERE placement_block_id = $1', [blockId]);
        await client.query('DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1', [blockId]);

        if (taggedDelete.rowCount === 0) {
          for (const c of classes.rows as Array<{ class_id: number }>) {
            await client.query("DELETE FROM cg_timetable_slots WHERE class_id = $1 AND type = 'placement'", [c.class_id]);
          }
        }

        await client.query('DELETE FROM cg_placement_classes WHERE placement_id = $1', [blockId]);
        await client.query('DELETE FROM cg_placement_blocks WHERE id = $1', [blockId]);
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/placement/blocks/:id/classes/:classId', async (req, res) => {
    try {
      const blockId = Number(req.params.id);
      const classId = Number(req.params.classId);

      await inTransaction(async client => {
        const taggedDelete = await client.query(
          'DELETE FROM cg_timetable_slots WHERE class_id = $1 AND placement_block_id = $2',
          [classId, blockId]
        );

        if (taggedDelete.rowCount === 0) {
          await client.query("DELETE FROM cg_timetable_slots WHERE class_id = $1 AND type = 'placement'", [classId]);
        }

        await client.query(
          'DELETE FROM cg_placement_preview_slots WHERE placement_block_id = $1 AND class_id = $2',
          [blockId, classId]
        );

        await client.query('DELETE FROM cg_placement_classes WHERE placement_id = $1 AND class_id = $2', [blockId, classId]);

        const remain = await client.query('SELECT COUNT(*)::int AS count FROM cg_placement_classes WHERE placement_id = $1', [blockId]);
        if ((remain.rows[0].count as number) === 0) {
          await client.query('DELETE FROM cg_placement_blocks WHERE id = $1', [blockId]);
        }
      });

      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/timetable/move-slot', async (req, res) => {
    try {
      const { class_id, from_day, from_period, to_day, to_period } = req.body;
      await inTransaction(async client => {
        const slot = await client.query(
          `SELECT * FROM cg_timetable_slots WHERE class_id = $1 AND day_order = $2 AND period = $3`,
          [Number(class_id), Number(from_day), Number(from_period)]
        );
        if (slot.rowCount === 0) throw new Error('Source slot not found');

        const occupied = await client.query(
          `SELECT 1 FROM cg_timetable_slots WHERE class_id = $1 AND day_order = $2 AND period = $3`,
          [Number(class_id), Number(to_day), Number(to_period)]
        );
        if (occupied.rowCount > 0) throw new Error('Destination slot is already occupied');

        await client.query(
          'UPDATE cg_timetable_slots SET day_order = $1, period = $2 WHERE id = $3',
          [Number(to_day), Number(to_period), slot.rows[0].id]
        );
      });
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/timetable/generate', async (req, res) => {
    try {
      await inTransaction(async client => {
        await client.query("DELETE FROM cg_timetable_slots WHERE type IS NULL OR type != 'placement'");

        const classes = await client.query('SELECT * FROM cg_classes');
        const settingsRows = await client.query('SELECT key, value FROM cg_settings');
        const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: { key: string; value: string }) => {
          acc[row.key] = row.value;
          return acc;
        }, {});

        const periodsPerDay = Number(settings.periods_per_day || 6);
        const days = [1, 2, 3, 4, 5, 6];

        for (const cls of classes.rows) {
          const subjects = await client.query(
            `SELECT cs.*, s.type AS subject_type
             FROM cg_class_subjects cs
             JOIN cg_subjects s ON cs.subject_id = s.id
             WHERE cs.class_id = $1`,
            [cls.id]
          );

          let poolItems: Array<{ subject_id: number; staff_id: number | null; type: string }> = [];
          for (const cs of subjects.rows) {
            for (let i = 0; i < Number(cs.hours_per_week); i++) {
              poolItems.push({
                subject_id: cs.subject_id,
                staff_id: cs.staff_id,
                type: cs.subject_type
              });
            }
          }

          poolItems = poolItems.sort(() => Math.random() - 0.5);
          let poolIndex = 0;

          for (const day of days) {
            for (let period = 1; period <= periodsPerDay; period++) {
              if (poolIndex >= poolItems.length) break;
              const item = poolItems[poolIndex];

              const staffBusy = item.staff_id
                ? await client.query(
                    'SELECT 1 FROM cg_timetable_slots WHERE staff_id = $1 AND day_order = $2 AND period = $3 LIMIT 1',
                    [item.staff_id, day, period]
                  )
                : { rowCount: 0 };

              if (!staffBusy.rowCount) {
                await client.query(
                  `INSERT INTO cg_timetable_slots (class_id, day_order, period, subject_id, staff_id, type)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (class_id, day_order, period) DO NOTHING`,
                  [cls.id, day, period, item.subject_id, item.staff_id, item.type]
                );
                poolIndex++;
              }
            }
            if (poolIndex >= poolItems.length) break;
          }
        }
      });

      res.json({ success: true, message: 'Timetable generated successfully' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/timetable/clear', async (req, res) => {
    try {
      await inTransaction(async client => {
        await client.query('DELETE FROM cg_timetable_slots');
        await client.query('DELETE FROM cg_placement_classes');
        await client.query('DELETE FROM cg_placement_blocks');
      });
      res.json({ success: true, message: 'All timetables cleared' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Tamil Scheduling Endpoints
  app.post('/api/tamil/schedule', async (req, res) => {
    try {
      const { selectedClassIds, staffAssignments, hoursAssignments, subjectId } = req.body;

      if (!selectedClassIds || !Array.isArray(selectedClassIds) || selectedClassIds.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty selectedClassIds' });
      }
      if (!staffAssignments || typeof staffAssignments !== 'object') {
        return res.status(400).json({ error: 'Invalid staffAssignments' });
      }
      if (!hoursAssignments || typeof hoursAssignments !== 'object') {
        return res.status(400).json({ error: 'Invalid hoursAssignments' });
      }
      if (!subjectId || Number.isNaN(Number(subjectId))) {
        return res.status(400).json({ error: 'Invalid subjectId' });
      }

      const classRows = await pool.query(
        `SELECT id, dept_id, year, name FROM cg_classes WHERE id = ANY($1::int[])`,
        [selectedClassIds]
      );
      const classDetails = classRows.rows as Array<{ id: number; dept_id: number; year: number; name: string }>;

      if (classDetails.length === 0) {
        return res.status(400).json({ error: 'No classes found for the given IDs' });
      }

      const settingsRows = await pool.query('SELECT key, value FROM cg_settings');
      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = Math.max(1, Number(settings.periods_per_day || 6));

      const occupiedRows = await pool.query(
        `SELECT class_id, day_order, period FROM cg_timetable_slots WHERE class_id = ANY($1::int[])`,
        [selectedClassIds]
      );

      const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const classId of selectedClassIds) {
        occupied[String(classId)] = [];
      }
      for (const row of occupiedRows.rows as any[]) {
        occupied[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
      }

      const assignedStaffIds = [...new Set(
        Object.values(staffAssignments)
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value > 0)
      )];
      const occupiedStaff: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const staffId of assignedStaffIds) {
        occupiedStaff[String(staffId)] = [];
      }
      if (assignedStaffIds.length > 0) {
        const staffOccupiedRows = await pool.query(
          `SELECT staff_id, day_order, period
           FROM cg_timetable_slots
           WHERE staff_id = ANY($1::int[])`,
          [assignedStaffIds]
        );
        for (const row of staffOccupiedRows.rows as any[]) {
          if (!row.staff_id) continue;
          occupiedStaff[String(row.staff_id)] ??= [];
          occupiedStaff[String(row.staff_id)].push({ day_order: row.day_order, period: row.period });
        }
      }

      const schedule = await runTamilScheduler({
        selected_classes: classDetails,
        staff_assignments: staffAssignments,
        hours_assignments: hoursAssignments,
        days: [1, 2, 3, 4, 5, 6],
        periods_per_day: periodsPerDay,
        occupied_slots: occupied,
        occupied_staff_slots: occupiedStaff,
        subject_id: Number(subjectId),
      });

      if (schedule.error) {
        return res.status(400).json({ error: schedule.error });
      }

      if (!schedule.scheduled_slots || !Array.isArray(schedule.scheduled_slots)) {
        return res.status(400).json({ error: 'Scheduler returned invalid slots format' });
      }

      if (schedule.scheduled_slots.length === 0) {
        return res.status(400).json({ error: 'No available slots found for scheduling' });
      }

      const sessionId = `tamil_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      await pool.query('DELETE FROM cg_tamil_preview_slots WHERE session_id = $1', [sessionId]);

      for (const slot of schedule.scheduled_slots) {
        try {
          await pool.query(
            `INSERT INTO cg_tamil_preview_slots (session_id, class_id, subject_id, staff_id, day_order, period, hours_per_week)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              sessionId,
              Number(slot.class_id),
              Number(subjectId),
              slot.staff_id ? Number(slot.staff_id) : null,
              Number(slot.day_order),
              Number(slot.period),
              Number(hoursAssignments[slot.class_id] || 1),
            ]
          );
        } catch (insertErr) {
          console.error('Failed to insert slot:', insertErr);
        }
      }

      res.json({ sessionId, slots: schedule.scheduled_slots, slotCount: schedule.scheduled_slots.length });
    } catch (e: any) {
      console.error('Tamil scheduling error:', e);
      res.status(500).json({ error: e.message || 'Tamil scheduling failed' });
    }
  });

  app.get('/api/tamil/preview/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const previewRows = await pool.query(
        `SELECT p.id, p.session_id, p.class_id, c.name AS class_name, c.year, d.name AS dept_name,
                p.subject_id, p.staff_id, p.day_order, p.period, p.hours_per_week
         FROM cg_tamil_preview_slots p
         JOIN cg_classes c ON c.id = p.class_id
         LEFT JOIN cg_departments d ON d.id = c.dept_id
         WHERE p.session_id = $1
         ORDER BY p.class_id, p.day_order, p.period`,
        [sessionId]
      );

      const classIds = [...new Set((previewRows.rows as any[]).map(row => Number(row.class_id)).filter(Boolean))];
      let timetableRows: any[] = [];
      let staffBusyRows: any[] = [];

      if (classIds.length > 0) {
        const timetableResult = await pool.query(
          `SELECT ts.id, ts.class_id, c.name AS class_name, c.year, d.name AS dept_name, ts.subject_id, s.name AS subject_name, s.code AS subject_code,
                  ts.staff_id, st.name AS staff_name, l.name AS lab_name, ts.day_order, ts.period, ts.type
           FROM cg_timetable_slots ts
           JOIN cg_classes c ON c.id = ts.class_id
           LEFT JOIN cg_departments d ON d.id = c.dept_id
           LEFT JOIN cg_subjects s ON s.id = ts.subject_id
           LEFT JOIN cg_staff st ON st.id = ts.staff_id
           LEFT JOIN cg_labs l ON l.id = ts.lab_id
           WHERE ts.class_id = ANY($1::int[])
           ORDER BY ts.class_id, ts.day_order, ts.period`,
          [classIds]
        );
        timetableRows = timetableResult.rows;

        const previewStaffIds = [...new Set(
          (previewRows.rows as any[])
            .map(row => Number(row.staff_id))
            .filter(value => Number.isFinite(value) && value > 0)
        )];
        if (previewStaffIds.length > 0) {
          const staffBusyResult = await pool.query(
            `SELECT staff_id, class_id, day_order, period
             FROM cg_timetable_slots
             WHERE staff_id = ANY($1::int[])`,
            [previewStaffIds]
          );
          const classToStaff = new Map<number, number>();
          for (const row of previewRows.rows as any[]) {
            if (row.staff_id) classToStaff.set(Number(row.class_id), Number(row.staff_id));
          }
          for (const [classId, staffId] of classToStaff.entries()) {
            for (const row of staffBusyResult.rows as any[]) {
              if (Number(row.staff_id) !== staffId) continue;
              if (Number(row.class_id) === classId) continue;
              staffBusyRows.push({
                class_id: classId,
                staff_id: staffId,
                day_order: Number(row.day_order),
                period: Number(row.period),
              });
            }
          }
        }
      }

      res.json({ previewSlots: previewRows.rows, timetableSlots: timetableRows, staffBusySlots: staffBusyRows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/tamil/fix/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      await inTransaction(async client => {
        const previewRows = await client.query(
          `SELECT class_id, subject_id, staff_id, day_order, period, hours_per_week
           FROM cg_tamil_preview_slots
           WHERE session_id = $1`,
          [sessionId]
        );

        if ((previewRows.rowCount ?? 0) === 0) {
          throw new Error('Preview session not found.');
        }

        const existingPreview = previewRows.rows as Array<{
          class_id: number;
          subject_id: number;
          staff_id: number | null;
          day_order: number;
          period: number;
          hours_per_week: number;
        }>;

        const requestedPreviewSlots = Array.isArray(req.body?.previewSlots) ? req.body.previewSlots : null;
        const classMeta = new Map<number, { subject_id: number; staff_id: number | null; hours_per_week: number; count: number }>();
        for (const row of existingPreview) {
          const current = classMeta.get(row.class_id);
          if (current) {
            current.count += 1;
          } else {
            classMeta.set(row.class_id, {
              subject_id: Number(row.subject_id),
              staff_id: row.staff_id ? Number(row.staff_id) : null,
              hours_per_week: Number(row.hours_per_week || 1),
              count: 1,
            });
          }
        }

        const finalPreviewRows = requestedPreviewSlots
          ? requestedPreviewSlots.map((slot: any) => {
              const classId = Number(slot?.class_id);
              const dayOrder = Number(slot?.day_order);
              const period = Number(slot?.period);
              const meta = classMeta.get(classId);
              if (!classId || !dayOrder || !period || !meta) {
                throw new Error('Invalid edited Tamil preview slots.');
              }
              return {
                class_id: classId,
                subject_id: meta.subject_id,
                staff_id: meta.staff_id,
                day_order: dayOrder,
                period,
                hours_per_week: meta.hours_per_week,
              };
            })
          : existingPreview;

        const finalCounts = new Map<number, number>();
        const previewKeys = new Set<string>();
        for (const row of finalPreviewRows) {
          const key = `${row.class_id}-${row.day_order}-${row.period}`;
          if (previewKeys.has(key)) {
            throw new Error(`Duplicate Tamil preview slot at Day ${row.day_order} Period ${row.period} for class ${row.class_id}.`);
          }
          previewKeys.add(key);
          finalCounts.set(row.class_id, (finalCounts.get(row.class_id) || 0) + 1);
        }

        for (const [classId, meta] of classMeta.entries()) {
          if ((finalCounts.get(classId) || 0) !== meta.count) {
            throw new Error('Tamil preview slot count mismatch. Refresh the preview and try again.');
          }
        }

        const selectedClassIds = [...classMeta.keys()];
        const occupiedRows = await client.query(
          `SELECT class_id, day_order, period
           FROM cg_timetable_slots
           WHERE class_id = ANY($1::int[])`,
          [selectedClassIds]
        );

        const occupiedKeys = new Set(
          (occupiedRows.rows as Array<{ class_id: number; day_order: number; period: number }>).map(
            row => `${row.class_id}-${row.day_order}-${row.period}`
          )
        );
        const staffIds = [...new Set(
          finalPreviewRows
            .map(row => row.staff_id ? Number(row.staff_id) : 0)
            .filter(value => value > 0)
        )];
        const staffOccupiedKeys = new Set<string>();
        if (staffIds.length > 0) {
          const staffOccupiedRows = await client.query(
            `SELECT staff_id, class_id, day_order, period
             FROM cg_timetable_slots
             WHERE staff_id = ANY($1::int[])`,
            [staffIds]
          );
          for (const row of staffOccupiedRows.rows as Array<{ staff_id: number; class_id: number; day_order: number; period: number }>) {
            staffOccupiedKeys.add(`${row.staff_id}-${row.day_order}-${row.period}`);
          }
        }
        const previewStaffKeys = new Set<string>();

        for (const row of finalPreviewRows) {
          const key = `${row.class_id}-${row.day_order}-${row.period}`;
          if (occupiedKeys.has(key)) {
            throw new Error(`Tamil slot conflicts with an occupied timetable slot at Day ${row.day_order} Period ${row.period} for class ${row.class_id}.`);
          }
          if (row.staff_id) {
            const staffKey = `${row.staff_id}-${row.day_order}-${row.period}`;
            if (staffOccupiedKeys.has(staffKey)) {
              throw new Error(`Tamil slot conflicts with the assigned staff timetable at Day ${row.day_order} Period ${row.period} for staff ${row.staff_id}.`);
            }
            if (previewStaffKeys.has(staffKey)) {
              throw new Error(`Tamil preview creates a staff overlap at Day ${row.day_order} Period ${row.period} for staff ${row.staff_id}.`);
            }
            previewStaffKeys.add(staffKey);
          }
        }

        for (const row of finalPreviewRows) {
          await client.query(
            `INSERT INTO cg_timetable_slots (class_id, subject_id, staff_id, day_order, period, type)
             VALUES ($1, $2, $3, $4, $5, 'tamil')
             ON CONFLICT (class_id, day_order, period) DO UPDATE
             SET subject_id = EXCLUDED.subject_id, staff_id = EXCLUDED.staff_id, type = EXCLUDED.type`,
            [row.class_id, row.subject_id, row.staff_id, row.day_order, row.period]
          );
        }

        await client.query('DELETE FROM cg_tamil_preview_slots WHERE session_id = $1', [sessionId]);
      });

      res.json({ success: true, message: 'Tamil slots finalized' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/tamil/regenerate/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      // Fetch existing preview slots
      const previewRows = await pool.query(
        `SELECT class_id, subject_id, staff_id, day_order, period, hours_per_week
         FROM cg_tamil_preview_slots
         WHERE session_id = $1`,
        [sessionId]
      );

      if (previewRows.rows.length === 0) {
        return res.status(404).json({ error: 'Preview session not found' });
      }

      // Extract metadata from preview slots
      const previewSlots = previewRows.rows as any[];
      const selectedClassIds = [...new Set(previewSlots.map(s => s.class_id))];
      const subjectId = previewSlots[0]?.subject_id;
      const staffAssignments: Record<string, number> = {};
      const hoursAssignments: Record<string, number> = {};

      for (const slot of previewSlots) {
        if (slot.staff_id && !staffAssignments[slot.class_id]) {
          staffAssignments[slot.class_id] = slot.staff_id;
        }
        if (!hoursAssignments[slot.class_id]) {
          hoursAssignments[slot.class_id] = slot.hours_per_week;
        }
      }

      // Get class details
      const classRows = await pool.query(
        `SELECT id, dept_id, year, name FROM cg_classes WHERE id = ANY($1::int[])`,
        [selectedClassIds]
      );
      const classDetails = classRows.rows as Array<{ id: number; dept_id: number; year: number; name: string }>;

      // Get settings
      const settingsRows = await pool.query('SELECT key, value FROM cg_settings');
      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = Math.max(1, Number(settings.periods_per_day || 6));

      // Get occupied slots (excluding Tamil preview)
      const occupiedRows = await pool.query(
        `SELECT class_id, day_order, period FROM cg_timetable_slots WHERE class_id = ANY($1::int[])`,
        [selectedClassIds]
      );

      const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const classId of selectedClassIds) {
        occupied[String(classId)] = [];
      }
      for (const row of occupiedRows.rows as any[]) {
        occupied[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
      }

      const assignedStaffIds = [...new Set(
        Object.values(staffAssignments)
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value > 0)
      )];
      const occupiedStaff: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const staffId of assignedStaffIds) {
        occupiedStaff[String(staffId)] = [];
      }
      if (assignedStaffIds.length > 0) {
        const staffOccupiedRows = await pool.query(
          `SELECT staff_id, day_order, period
           FROM cg_timetable_slots
           WHERE staff_id = ANY($1::int[])`,
          [assignedStaffIds]
        );
        for (const row of staffOccupiedRows.rows as any[]) {
          if (!row.staff_id) continue;
          occupiedStaff[String(row.staff_id)] ??= [];
          occupiedStaff[String(row.staff_id)].push({ day_order: row.day_order, period: row.period });
        }
      }

      // Run scheduler
      const schedule = await runTamilScheduler({
        selected_classes: classDetails,
        staff_assignments: staffAssignments,
        hours_assignments: hoursAssignments,
        days: [1, 2, 3, 4, 5, 6],
        periods_per_day: periodsPerDay,
        occupied_slots: occupied,
        occupied_staff_slots: occupiedStaff,
        subject_id: Number(subjectId),
      });

      if (schedule.error) {
        return res.status(400).json({ error: schedule.error });
      }

      if (!schedule.scheduled_slots || !Array.isArray(schedule.scheduled_slots)) {
        return res.status(400).json({ error: 'Scheduler returned invalid slots format' });
      }

      if (schedule.scheduled_slots.length === 0) {
        return res.status(400).json({ error: 'No available slots found for regeneration' });
      }

      // Delete old preview slots and insert new ones
      await pool.query('DELETE FROM cg_tamil_preview_slots WHERE session_id = $1', [sessionId]);

      for (const slot of schedule.scheduled_slots) {
        try {
          await pool.query(
            `INSERT INTO cg_tamil_preview_slots (session_id, class_id, subject_id, staff_id, day_order, period, hours_per_week)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              sessionId,
              Number(slot.class_id),
              Number(subjectId),
              slot.staff_id ? Number(slot.staff_id) : null,
              Number(slot.day_order),
              Number(slot.period),
              Number(hoursAssignments[slot.class_id] || 1),
            ]
          );
        } catch (insertErr) {
          console.error('Failed to insert regenerated slot:', insertErr);
        }
      }

      res.json({ success: true, message: 'Timetable regenerated successfully', slotCount: schedule.scheduled_slots.length });
    } catch (e: any) {
      console.error('Tamil regeneration error:', e);
      res.status(500).json({ error: e.message || 'Tamil regeneration failed' });
    }
  });

  // English Scheduling Endpoints
  app.post('/api/english/schedule', async (req, res) => {
    try {
      const { selectedClassIds, staffAssignments, hoursAssignments, subjectId } = req.body;

      if (!selectedClassIds || !Array.isArray(selectedClassIds) || selectedClassIds.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty selectedClassIds' });
      }
      if (!staffAssignments || typeof staffAssignments !== 'object') {
        return res.status(400).json({ error: 'Invalid staffAssignments' });
      }
      if (!hoursAssignments || typeof hoursAssignments !== 'object') {
        return res.status(400).json({ error: 'Invalid hoursAssignments' });
      }
      if (!subjectId || Number.isNaN(Number(subjectId))) {
        return res.status(400).json({ error: 'Invalid subjectId' });
      }

      const classRows = await pool.query(
        `SELECT id, dept_id, year, name FROM cg_classes WHERE id = ANY($1::int[])`,
        [selectedClassIds]
      );
      const classDetails = classRows.rows as Array<{ id: number; dept_id: number; year: number; name: string }>;

      if (classDetails.length === 0) {
        return res.status(400).json({ error: 'No classes found for the given IDs' });
      }

      const settingsRows = await pool.query('SELECT key, value FROM cg_settings');
      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = Math.max(1, Number(settings.periods_per_day || 6));

      const occupiedRows = await pool.query(
        `SELECT class_id, day_order, period FROM cg_timetable_slots WHERE class_id = ANY($1::int[])`,
        [selectedClassIds]
      );

      const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const classId of selectedClassIds) {
        occupied[String(classId)] = [];
      }
      for (const row of occupiedRows.rows as any[]) {
        occupied[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
      }

      const assignedStaffIds = [...new Set(
        Object.values(staffAssignments)
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value > 0)
      )];
      const occupiedStaff: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const staffId of assignedStaffIds) {
        occupiedStaff[String(staffId)] = [];
      }
      if (assignedStaffIds.length > 0) {
        const staffOccupiedRows = await pool.query(
          `SELECT staff_id, day_order, period
           FROM cg_timetable_slots
           WHERE staff_id = ANY($1::int[])`,
          [assignedStaffIds]
        );
        for (const row of staffOccupiedRows.rows as any[]) {
          if (!row.staff_id) continue;
          occupiedStaff[String(row.staff_id)] ??= [];
          occupiedStaff[String(row.staff_id)].push({ day_order: row.day_order, period: row.period });
        }
      }

      const schedule = await runEnglishScheduler({
        selected_classes: classDetails,
        staff_assignments: staffAssignments,
        hours_assignments: hoursAssignments,
        days: [1, 2, 3, 4, 5, 6],
        periods_per_day: periodsPerDay,
        occupied_slots: occupied,
        occupied_staff_slots: occupiedStaff,
        subject_id: Number(subjectId),
      });

      if (schedule.error) {
        return res.status(400).json({ error: schedule.error });
      }

      if (!schedule.scheduled_slots || !Array.isArray(schedule.scheduled_slots)) {
        return res.status(400).json({ error: 'Scheduler returned invalid slots format' });
      }

      if (schedule.scheduled_slots.length === 0) {
        return res.status(400).json({ error: 'No available slots found for scheduling' });
      }

      const sessionId = `english_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      await pool.query('DELETE FROM cg_english_preview_slots WHERE session_id = $1', [sessionId]);

      for (const slot of schedule.scheduled_slots) {
        try {
          await pool.query(
            `INSERT INTO cg_english_preview_slots (session_id, class_id, subject_id, staff_id, day_order, period, hours_per_week)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              sessionId,
              Number(slot.class_id),
              Number(subjectId),
              slot.staff_id ? Number(slot.staff_id) : null,
              Number(slot.day_order),
              Number(slot.period),
              Number(hoursAssignments[slot.class_id] || 1),
            ]
          );
        } catch (insertErr) {
          console.error('Failed to insert slot:', insertErr);
        }
      }

      res.json({ sessionId, slots: schedule.scheduled_slots, slotCount: schedule.scheduled_slots.length });
    } catch (e: any) {
      console.error('English scheduling error:', e);
      res.status(500).json({ error: e.message || 'English scheduling failed' });
    }
  });

  app.get('/api/english/preview/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const previewRows = await pool.query(
        `SELECT p.id, p.session_id, p.class_id, c.name AS class_name, c.year, d.name AS dept_name,
                p.subject_id, p.staff_id, p.day_order, p.period, p.hours_per_week
         FROM cg_english_preview_slots p
         JOIN cg_classes c ON c.id = p.class_id
         LEFT JOIN cg_departments d ON d.id = c.dept_id
         WHERE p.session_id = $1
         ORDER BY p.class_id, p.day_order, p.period`,
        [sessionId]
      );

      const classIds = [...new Set((previewRows.rows as any[]).map(row => Number(row.class_id)).filter(Boolean))];
      let timetableRows: any[] = [];
      let staffBusyRows: any[] = [];

      if (classIds.length > 0) {
        const timetableResult = await pool.query(
          `SELECT ts.id, ts.class_id, c.name AS class_name, c.year, d.name AS dept_name, ts.subject_id, s.name AS subject_name, s.code AS subject_code,
                  ts.staff_id, st.name AS staff_name, l.name AS lab_name, ts.day_order, ts.period, ts.type
           FROM cg_timetable_slots ts
           JOIN cg_classes c ON c.id = ts.class_id
           LEFT JOIN cg_departments d ON d.id = c.dept_id
           LEFT JOIN cg_subjects s ON s.id = ts.subject_id
           LEFT JOIN cg_staff st ON st.id = ts.staff_id
           LEFT JOIN cg_labs l ON l.id = ts.lab_id
           WHERE ts.class_id = ANY($1::int[])
           ORDER BY ts.class_id, ts.day_order, ts.period`,
          [classIds]
        );
        timetableRows = timetableResult.rows;

        const previewStaffIds = [...new Set(
          (previewRows.rows as any[])
            .map(row => Number(row.staff_id))
            .filter(value => Number.isFinite(value) && value > 0)
        )];
        if (previewStaffIds.length > 0) {
          const staffBusyResult = await pool.query(
            `SELECT staff_id, class_id, day_order, period
             FROM cg_timetable_slots
             WHERE staff_id = ANY($1::int[])`,
            [previewStaffIds]
          );
          const classToStaff = new Map<number, number>();
          for (const row of previewRows.rows as any[]) {
            if (row.staff_id) classToStaff.set(Number(row.class_id), Number(row.staff_id));
          }
          for (const [classId, staffId] of classToStaff.entries()) {
            for (const row of staffBusyResult.rows as any[]) {
              if (Number(row.staff_id) !== staffId) continue;
              if (Number(row.class_id) === classId) continue;
              staffBusyRows.push({
                class_id: classId,
                staff_id: staffId,
                day_order: Number(row.day_order),
                period: Number(row.period),
              });
            }
          }
        }
      }

      res.json({ previewSlots: previewRows.rows, timetableSlots: timetableRows, staffBusySlots: staffBusyRows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/english/fix/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      await inTransaction(async client => {
        const previewRows = await client.query(
          `SELECT class_id, subject_id, staff_id, day_order, period, hours_per_week
           FROM cg_english_preview_slots
           WHERE session_id = $1`,
          [sessionId]
        );

        if ((previewRows.rowCount ?? 0) === 0) {
          throw new Error('Preview session not found.');
        }

        const existingPreview = previewRows.rows as Array<{
          class_id: number;
          subject_id: number;
          staff_id: number | null;
          day_order: number;
          period: number;
          hours_per_week: number;
        }>;

        const requestedPreviewSlots = Array.isArray(req.body?.previewSlots) ? req.body.previewSlots : null;
        const classMeta = new Map<number, { subject_id: number; staff_id: number | null; hours_per_week: number; count: number }>();
        for (const row of existingPreview) {
          const current = classMeta.get(row.class_id);
          if (current) {
            current.count += 1;
          } else {
            classMeta.set(row.class_id, {
              subject_id: Number(row.subject_id),
              staff_id: row.staff_id ? Number(row.staff_id) : null,
              hours_per_week: Number(row.hours_per_week || 1),
              count: 1,
            });
          }
        }

        const finalPreviewRows = requestedPreviewSlots
          ? requestedPreviewSlots.map((slot: any) => {
              const classId = Number(slot?.class_id);
              const dayOrder = Number(slot?.day_order);
              const period = Number(slot?.period);
              const meta = classMeta.get(classId);
              if (!classId || !dayOrder || !period || !meta) {
                throw new Error('Invalid edited English preview slots.');
              }
              return {
                class_id: classId,
                subject_id: meta.subject_id,
                staff_id: meta.staff_id,
                day_order: dayOrder,
                period,
                hours_per_week: meta.hours_per_week,
              };
            })
          : existingPreview;

        const finalCounts = new Map<number, number>();
        const previewKeys = new Set<string>();
        for (const row of finalPreviewRows) {
          const key = `${row.class_id}-${row.day_order}-${row.period}`;
          if (previewKeys.has(key)) {
            throw new Error(`Duplicate English preview slot at Day ${row.day_order} Period ${row.period} for class ${row.class_id}.`);
          }
          previewKeys.add(key);
          finalCounts.set(row.class_id, (finalCounts.get(row.class_id) || 0) + 1);
        }

        for (const [classId, meta] of classMeta.entries()) {
          if ((finalCounts.get(classId) || 0) !== meta.count) {
            throw new Error('English preview slot count mismatch. Refresh the preview and try again.');
          }
        }

        const selectedClassIds = [...classMeta.keys()];
        const occupiedRows = await client.query(
          `SELECT class_id, day_order, period
           FROM cg_timetable_slots
           WHERE class_id = ANY($1::int[])`,
          [selectedClassIds]
        );

        const occupiedKeys = new Set(
          (occupiedRows.rows as Array<{ class_id: number; day_order: number; period: number }>).map(
            row => `${row.class_id}-${row.day_order}-${row.period}`
          )
        );
        const staffIds = [...new Set(
          finalPreviewRows
            .map(row => row.staff_id ? Number(row.staff_id) : 0)
            .filter(value => value > 0)
        )];
        const staffOccupiedKeys = new Set<string>();
        if (staffIds.length > 0) {
          const staffOccupiedRows = await client.query(
            `SELECT staff_id, class_id, day_order, period
             FROM cg_timetable_slots
             WHERE staff_id = ANY($1::int[])`,
            [staffIds]
          );
          for (const row of staffOccupiedRows.rows as Array<{ staff_id: number; class_id: number; day_order: number; period: number }>) {
            staffOccupiedKeys.add(`${row.staff_id}-${row.day_order}-${row.period}`);
          }
        }
        const previewStaffKeys = new Set<string>();

        for (const row of finalPreviewRows) {
          const key = `${row.class_id}-${row.day_order}-${row.period}`;
          if (occupiedKeys.has(key)) {
            throw new Error(`English slot conflicts with an occupied timetable slot at Day ${row.day_order} Period ${row.period} for class ${row.class_id}.`);
          }
          if (row.staff_id) {
            const staffKey = `${row.staff_id}-${row.day_order}-${row.period}`;
            if (staffOccupiedKeys.has(staffKey)) {
              throw new Error(`English slot conflicts with the assigned staff timetable at Day ${row.day_order} Period ${row.period} for staff ${row.staff_id}.`);
            }
            if (previewStaffKeys.has(staffKey)) {
              throw new Error(`English preview creates a staff overlap at Day ${row.day_order} Period ${row.period} for staff ${row.staff_id}.`);
            }
            previewStaffKeys.add(staffKey);
          }
        }

        for (const row of finalPreviewRows) {
          await client.query(
            `INSERT INTO cg_timetable_slots (class_id, subject_id, staff_id, day_order, period, type)
             VALUES ($1, $2, $3, $4, $5, 'english')
             ON CONFLICT (class_id, day_order, period) DO UPDATE
             SET subject_id = EXCLUDED.subject_id, staff_id = EXCLUDED.staff_id, type = EXCLUDED.type`,
            [row.class_id, row.subject_id, row.staff_id, row.day_order, row.period]
          );
        }

        await client.query('DELETE FROM cg_english_preview_slots WHERE session_id = $1', [sessionId]);
      });

      res.json({ success: true, message: 'English slots finalized' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/english/regenerate/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      const previewRows = await pool.query(
        `SELECT class_id, subject_id, staff_id, day_order, period, hours_per_week
         FROM cg_english_preview_slots
         WHERE session_id = $1`,
        [sessionId]
      );

      if (previewRows.rows.length === 0) {
        return res.status(404).json({ error: 'Preview session not found' });
      }

      const previewSlots = previewRows.rows as any[];
      const selectedClassIds = [...new Set(previewSlots.map(s => s.class_id))];
      const subjectId = previewSlots[0]?.subject_id;
      const staffAssignments: Record<string, number> = {};
      const hoursAssignments: Record<string, number> = {};

      for (const slot of previewSlots) {
        if (slot.staff_id && !staffAssignments[slot.class_id]) {
          staffAssignments[slot.class_id] = slot.staff_id;
        }
        if (!hoursAssignments[slot.class_id]) {
          hoursAssignments[slot.class_id] = slot.hours_per_week;
        }
      }

      const classRows = await pool.query(
        `SELECT id, dept_id, year, name FROM cg_classes WHERE id = ANY($1::int[])`,
        [selectedClassIds]
      );
      const classDetails = classRows.rows as Array<{ id: number; dept_id: number; year: number; name: string }>;

      const settingsRows = await pool.query('SELECT key, value FROM cg_settings');
      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = Math.max(1, Number(settings.periods_per_day || 6));

      const occupiedRows = await pool.query(
        `SELECT class_id, day_order, period FROM cg_timetable_slots WHERE class_id = ANY($1::int[])`,
        [selectedClassIds]
      );

      const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const classId of selectedClassIds) {
        occupied[String(classId)] = [];
      }
      for (const row of occupiedRows.rows as any[]) {
        occupied[String(row.class_id)].push({ day_order: row.day_order, period: row.period });
      }

      const assignedStaffIds = [...new Set(
        Object.values(staffAssignments)
          .map(value => Number(value))
          .filter(value => Number.isFinite(value) && value > 0)
      )];
      const occupiedStaff: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const staffId of assignedStaffIds) {
        occupiedStaff[String(staffId)] = [];
      }
      if (assignedStaffIds.length > 0) {
        const staffOccupiedRows = await pool.query(
          `SELECT staff_id, day_order, period
           FROM cg_timetable_slots
           WHERE staff_id = ANY($1::int[])`,
          [assignedStaffIds]
        );
        for (const row of staffOccupiedRows.rows as any[]) {
          if (!row.staff_id) continue;
          occupiedStaff[String(row.staff_id)] ??= [];
          occupiedStaff[String(row.staff_id)].push({ day_order: row.day_order, period: row.period });
        }
      }

      const schedule = await runEnglishScheduler({
        selected_classes: classDetails,
        staff_assignments: staffAssignments,
        hours_assignments: hoursAssignments,
        days: [1, 2, 3, 4, 5, 6],
        periods_per_day: periodsPerDay,
        occupied_slots: occupied,
        occupied_staff_slots: occupiedStaff,
        subject_id: Number(subjectId),
      });

      if (schedule.error) {
        return res.status(400).json({ error: schedule.error });
      }

      if (!schedule.scheduled_slots || !Array.isArray(schedule.scheduled_slots)) {
        return res.status(400).json({ error: 'Scheduler returned invalid slots format' });
      }

      if (schedule.scheduled_slots.length === 0) {
        return res.status(400).json({ error: 'No available slots found for regeneration' });
      }

      await pool.query('DELETE FROM cg_english_preview_slots WHERE session_id = $1', [sessionId]);

      for (const slot of schedule.scheduled_slots) {
        try {
          await pool.query(
            `INSERT INTO cg_english_preview_slots (session_id, class_id, subject_id, staff_id, day_order, period, hours_per_week)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              sessionId,
              Number(slot.class_id),
              Number(subjectId),
              slot.staff_id ? Number(slot.staff_id) : null,
              Number(slot.day_order),
              Number(slot.period),
              Number(hoursAssignments[slot.class_id] || 1),
            ]
          );
        } catch (insertErr) {
          console.error('Failed to insert regenerated slot:', insertErr);
        }
      }

      res.json({ success: true, message: 'Timetable regenerated successfully', slotCount: schedule.scheduled_slots.length });
    } catch (e: any) {
      console.error('English regeneration error:', e);
      res.status(500).json({ error: e.message || 'English regeneration failed' });
    }
  });

  // Mathematics Scheduling Endpoints
  app.post('/api/mathematics/schedule', async (req, res) => {
    try {
      const { assignments } = req.body;

      if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty assignments' });
      }

      const normalizedAssignments = assignments.map((item: any) => ({
        class_id: Number(item?.class_id),
        subject_id: Number(item?.subject_id),
        staff_id: item?.staff_id ? Number(item.staff_id) : null,
        hours_per_week: Number(item?.hours_per_week),
      }));

      const invalidAssignment = normalizedAssignments.find(item =>
        !Number.isFinite(item.class_id)
        || item.class_id <= 0
        || !Number.isFinite(item.subject_id)
        || item.subject_id <= 0
        || !Number.isFinite(item.hours_per_week)
        || item.hours_per_week <= 0
      );
      if (invalidAssignment) {
        return res.status(400).json({ error: 'Every mathematics assignment needs valid class, subject, and hours.' });
      }

      const selectedClassIds = [...new Set(normalizedAssignments.map(item => item.class_id))];
      const selectedSubjectIds = [...new Set(normalizedAssignments.map(item => item.subject_id))];

      const [classRows, subjectRows, settingsRows] = await Promise.all([
        pool.query(
          `SELECT id, dept_id, year, name FROM cg_classes WHERE id = ANY($1::int[])`,
          [selectedClassIds]
        ),
        pool.query(
          `SELECT id, name, dept_id FROM cg_subjects WHERE id = ANY($1::int[])`,
          [selectedSubjectIds]
        ),
        pool.query('SELECT key, value FROM cg_settings'),
      ]);

      const classMap = new Map<number, { id: number; dept_id: number; year: number; name: string }>();
      for (const row of classRows.rows as Array<{ id: number; dept_id: number; year: number; name: string }>) {
        classMap.set(Number(row.id), row);
      }

      const subjectMap = new Map<number, { id: number; name: string; dept_id: number | null }>();
      for (const row of subjectRows.rows as Array<{ id: number; name: string; dept_id: number | null }>) {
        subjectMap.set(Number(row.id), row);
      }

      if (classMap.size !== selectedClassIds.length) {
        return res.status(400).json({ error: 'One or more selected classes were not found.' });
      }
      if (subjectMap.size !== selectedSubjectIds.length) {
        return res.status(400).json({ error: 'One or more selected mathematics subjects were not found.' });
      }

      const periodsPerDay = Math.max(1, Number(
        settingsRows.rows.reduce((acc: Record<string, string>, row: any) => {
          acc[row.key] = row.value;
          return acc;
        }, {}).periods_per_day || 6
      ));

      const occupiedRows = await pool.query(
        `SELECT class_id, day_order, period FROM cg_timetable_slots WHERE class_id = ANY($1::int[])`,
        [selectedClassIds]
      );
      const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const classId of selectedClassIds) {
        occupied[String(classId)] = [];
      }
      for (const row of occupiedRows.rows as any[]) {
        occupied[String(row.class_id)].push({ day_order: Number(row.day_order), period: Number(row.period) });
      }

      const assignedStaffIds = [...new Set(
        normalizedAssignments
          .map(item => item.staff_id ? Number(item.staff_id) : 0)
          .filter(value => Number.isFinite(value) && value > 0)
      )];
      const occupiedStaff: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const staffId of assignedStaffIds) {
        occupiedStaff[String(staffId)] = [];
      }
      if (assignedStaffIds.length > 0) {
        const staffOccupiedRows = await pool.query(
          `SELECT staff_id, day_order, period
           FROM cg_timetable_slots
           WHERE staff_id = ANY($1::int[])`,
          [assignedStaffIds]
        );
        for (const row of staffOccupiedRows.rows as any[]) {
          if (!row.staff_id) continue;
          occupiedStaff[String(row.staff_id)] ??= [];
          occupiedStaff[String(row.staff_id)].push({ day_order: Number(row.day_order), period: Number(row.period) });
        }
      }

      const schedulerAssignments = normalizedAssignments.map(item => ({
        class_id: item.class_id,
        class_name: classMap.get(item.class_id)?.name,
        subject_id: item.subject_id,
        subject_name: subjectMap.get(item.subject_id)?.name,
        staff_id: item.staff_id,
        hours_per_week: item.hours_per_week,
      }));

      const schedule = await runMathematicsScheduler({
        assignments: schedulerAssignments,
        days: [1, 2, 3, 4, 5, 6],
        periods_per_day: periodsPerDay,
        occupied_slots: occupied,
        occupied_staff_slots: occupiedStaff,
      });

      if (schedule.error) {
        return res.status(400).json({ error: schedule.error });
      }
      if (!schedule.scheduled_slots || !Array.isArray(schedule.scheduled_slots) || schedule.scheduled_slots.length === 0) {
        return res.status(400).json({ error: 'No available slots found for mathematics scheduling' });
      }

      const assignmentMeta = new Map<string, { staff_id: number | null; hours_per_week: number }>();
      for (const item of normalizedAssignments) {
        assignmentMeta.set(`${item.class_id}-${item.subject_id}`, {
          staff_id: item.staff_id,
          hours_per_week: item.hours_per_week,
        });
      }

      const sessionId = `mathematics_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await pool.query('DELETE FROM cg_mathematics_preview_slots WHERE session_id = $1', [sessionId]);

      for (const slot of schedule.scheduled_slots) {
        const meta = assignmentMeta.get(`${Number(slot.class_id)}-${Number(slot.subject_id)}`);
        await pool.query(
          `INSERT INTO cg_mathematics_preview_slots (session_id, class_id, subject_id, staff_id, day_order, period, hours_per_week)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            sessionId,
            Number(slot.class_id),
            Number(slot.subject_id),
            meta?.staff_id ?? (slot.staff_id ? Number(slot.staff_id) : null),
            Number(slot.day_order),
            Number(slot.period),
            meta?.hours_per_week ?? 1,
          ]
        );
      }

      res.json({ sessionId, slots: schedule.scheduled_slots, slotCount: schedule.scheduled_slots.length });
    } catch (e: any) {
      console.error('Mathematics scheduling error:', e);
      res.status(500).json({ error: e.message || 'Mathematics scheduling failed' });
    }
  });

  app.get('/api/mathematics/preview/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const previewRows = await pool.query(
        `SELECT p.id, p.session_id, p.class_id, c.name AS class_name, c.year, d.name AS dept_name,
                p.subject_id, subj.name AS subject_name, subj.code AS subject_code,
                p.staff_id, st.name AS staff_name, p.day_order, p.period, p.hours_per_week
         FROM cg_mathematics_preview_slots p
         JOIN cg_classes c ON c.id = p.class_id
         JOIN cg_subjects subj ON subj.id = p.subject_id
         LEFT JOIN cg_departments d ON d.id = c.dept_id
         LEFT JOIN cg_staff st ON st.id = p.staff_id
         WHERE p.session_id = $1
         ORDER BY p.class_id, p.subject_id, p.day_order, p.period`,
        [sessionId]
      );

      const classIds = [...new Set((previewRows.rows as any[]).map(row => Number(row.class_id)).filter(Boolean))];
      let timetableRows: any[] = [];
      let staffBusyRows: any[] = [];

      if (classIds.length > 0) {
        const timetableResult = await pool.query(
          `SELECT ts.id, ts.class_id, c.name AS class_name, c.year, d.name AS dept_name, ts.subject_id, s.name AS subject_name, s.code AS subject_code,
                  ts.staff_id, st.name AS staff_name, l.name AS lab_name, ts.day_order, ts.period, ts.type
           FROM cg_timetable_slots ts
           JOIN cg_classes c ON c.id = ts.class_id
           LEFT JOIN cg_departments d ON d.id = c.dept_id
           LEFT JOIN cg_subjects s ON s.id = ts.subject_id
           LEFT JOIN cg_staff st ON st.id = ts.staff_id
           LEFT JOIN cg_labs l ON l.id = ts.lab_id
           WHERE ts.class_id = ANY($1::int[])
           ORDER BY ts.class_id, ts.day_order, ts.period`,
          [classIds]
        );
        timetableRows = timetableResult.rows;

        const previewStaffIds = [...new Set(
          (previewRows.rows as any[])
            .map(row => Number(row.staff_id))
            .filter(value => Number.isFinite(value) && value > 0)
        )];
        if (previewStaffIds.length > 0) {
          const staffBusyResult = await pool.query(
            `SELECT staff_id, class_id, day_order, period
             FROM cg_timetable_slots
             WHERE staff_id = ANY($1::int[])`,
            [previewStaffIds]
          );
          const classSubjectStaffPairs = new Map<string, number>();
          for (const row of previewRows.rows as any[]) {
            if (row.staff_id) {
              classSubjectStaffPairs.set(`${Number(row.class_id)}-${Number(row.subject_id)}`, Number(row.staff_id));
            }
          }
          for (const [pairKey, staffId] of classSubjectStaffPairs.entries()) {
            const classId = Number(pairKey.split('-')[0]);
            for (const row of staffBusyResult.rows as any[]) {
              if (Number(row.staff_id) !== staffId) continue;
              if (Number(row.class_id) === classId) continue;
              staffBusyRows.push({
                class_id: classId,
                staff_id: staffId,
                day_order: Number(row.day_order),
                period: Number(row.period),
              });
            }
          }
        }
      }

      res.json({ previewSlots: previewRows.rows, timetableSlots: timetableRows, staffBusySlots: staffBusyRows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/mathematics/fix/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      await inTransaction(async client => {
        const previewRows = await client.query(
          `SELECT class_id, subject_id, staff_id, day_order, period, hours_per_week
           FROM cg_mathematics_preview_slots
           WHERE session_id = $1`,
          [sessionId]
        );

        if ((previewRows.rowCount ?? 0) === 0) {
          throw new Error('Preview session not found.');
        }

        const existingPreview = previewRows.rows as Array<{
          class_id: number;
          subject_id: number;
          staff_id: number | null;
          day_order: number;
          period: number;
          hours_per_week: number;
        }>;

        const assignmentMeta = new Map<string, { staff_id: number | null; hours_per_week: number; count: number }>();
        for (const row of existingPreview) {
          const key = `${Number(row.class_id)}-${Number(row.subject_id)}`;
          const current = assignmentMeta.get(key);
          if (current) {
            current.count += 1;
          } else {
            assignmentMeta.set(key, {
              staff_id: row.staff_id ? Number(row.staff_id) : null,
              hours_per_week: Number(row.hours_per_week || 1),
              count: 1,
            });
          }
        }

        const requestedPreviewSlots = Array.isArray(req.body?.previewSlots) ? req.body.previewSlots : null;
        const finalPreviewRows = requestedPreviewSlots
          ? requestedPreviewSlots.map((slot: any) => {
              const classId = Number(slot?.class_id);
              const subjectId = Number(slot?.subject_id);
              const dayOrder = Number(slot?.day_order);
              const period = Number(slot?.period);
              const meta = assignmentMeta.get(`${classId}-${subjectId}`);
              if (!classId || !subjectId || !dayOrder || !period || !meta) {
                throw new Error('Invalid edited Mathematics preview slots.');
              }
              return {
                class_id: classId,
                subject_id: subjectId,
                staff_id: meta.staff_id,
                day_order: dayOrder,
                period,
                hours_per_week: meta.hours_per_week,
              };
            })
          : existingPreview;

        const finalCounts = new Map<string, number>();
        const previewKeys = new Set<string>();
        for (const row of finalPreviewRows) {
          const key = `${row.class_id}-${row.day_order}-${row.period}`;
          if (previewKeys.has(key)) {
            throw new Error(`Duplicate Mathematics preview slot at Day ${row.day_order} Period ${row.period} for class ${row.class_id}.`);
          }
          previewKeys.add(key);
          const assignmentKey = `${row.class_id}-${row.subject_id}`;
          finalCounts.set(assignmentKey, (finalCounts.get(assignmentKey) || 0) + 1);
        }

        for (const [assignmentKey, meta] of assignmentMeta.entries()) {
          if ((finalCounts.get(assignmentKey) || 0) !== meta.count) {
            throw new Error('Mathematics preview slot count mismatch. Refresh the preview and try again.');
          }
        }

        const selectedClassIds = [...new Set(finalPreviewRows.map(row => Number(row.class_id)))];
        const occupiedRows = await client.query(
          `SELECT class_id, day_order, period
           FROM cg_timetable_slots
           WHERE class_id = ANY($1::int[])`,
          [selectedClassIds]
        );

        const occupiedKeys = new Set(
          (occupiedRows.rows as Array<{ class_id: number; day_order: number; period: number }>).map(
            row => `${row.class_id}-${row.day_order}-${row.period}`
          )
        );

        const staffIds = [...new Set(
          finalPreviewRows
            .map(row => row.staff_id ? Number(row.staff_id) : 0)
            .filter(value => value > 0)
        )];
        const staffOccupiedKeys = new Set<string>();
        if (staffIds.length > 0) {
          const staffOccupiedRows = await client.query(
            `SELECT staff_id, class_id, day_order, period
             FROM cg_timetable_slots
             WHERE staff_id = ANY($1::int[])`,
            [staffIds]
          );
          for (const row of staffOccupiedRows.rows as Array<{ staff_id: number; class_id: number; day_order: number; period: number }>) {
            staffOccupiedKeys.add(`${row.staff_id}-${row.day_order}-${row.period}`);
          }
        }

        const previewStaffKeys = new Set<string>();
        for (const row of finalPreviewRows) {
          const key = `${row.class_id}-${row.day_order}-${row.period}`;
          if (occupiedKeys.has(key)) {
            throw new Error(`Mathematics slot conflicts with an occupied timetable slot at Day ${row.day_order} Period ${row.period} for class ${row.class_id}.`);
          }
          if (row.staff_id) {
            const staffKey = `${row.staff_id}-${row.day_order}-${row.period}`;
            if (staffOccupiedKeys.has(staffKey)) {
              throw new Error(`Mathematics slot conflicts with the assigned staff timetable at Day ${row.day_order} Period ${row.period} for staff ${row.staff_id}.`);
            }
            if (previewStaffKeys.has(staffKey)) {
              throw new Error(`Mathematics preview creates a staff overlap at Day ${row.day_order} Period ${row.period} for staff ${row.staff_id}.`);
            }
            previewStaffKeys.add(staffKey);
          }
        }

        for (const row of finalPreviewRows) {
          await client.query(
            `INSERT INTO cg_timetable_slots (class_id, subject_id, staff_id, day_order, period, type)
             VALUES ($1, $2, $3, $4, $5, 'mathematics')
             ON CONFLICT (class_id, day_order, period) DO UPDATE
             SET subject_id = EXCLUDED.subject_id, staff_id = EXCLUDED.staff_id, type = EXCLUDED.type`,
            [row.class_id, row.subject_id, row.staff_id, row.day_order, row.period]
          );
        }

        await client.query('DELETE FROM cg_mathematics_preview_slots WHERE session_id = $1', [sessionId]);
      });

      res.json({ success: true, message: 'Mathematics slots finalized' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/mathematics/regenerate/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const previewRows = await pool.query(
        `SELECT class_id, subject_id, staff_id, day_order, period, hours_per_week
         FROM cg_mathematics_preview_slots
         WHERE session_id = $1`,
        [sessionId]
      );

      if (previewRows.rows.length === 0) {
        return res.status(404).json({ error: 'Preview session not found' });
      }

      const existingPreview = previewRows.rows as Array<{
        class_id: number;
        subject_id: number;
        staff_id: number | null;
        hours_per_week: number;
      }>;
      const selectedClassIds = [...new Set(existingPreview.map(row => Number(row.class_id)))];
      const selectedSubjectIds = [...new Set(existingPreview.map(row => Number(row.subject_id)))];

      const [classRows, subjectRows, settingsRows] = await Promise.all([
        pool.query(
          `SELECT id, dept_id, year, name FROM cg_classes WHERE id = ANY($1::int[])`,
          [selectedClassIds]
        ),
        pool.query(
          `SELECT id, name FROM cg_subjects WHERE id = ANY($1::int[])`,
          [selectedSubjectIds]
        ),
        pool.query('SELECT key, value FROM cg_settings'),
      ]);

      const classMap = new Map<number, { id: number; dept_id: number; year: number; name: string }>();
      for (const row of classRows.rows as Array<{ id: number; dept_id: number; year: number; name: string }>) {
        classMap.set(Number(row.id), row);
      }
      const subjectMap = new Map<number, { id: number; name: string }>();
      for (const row of subjectRows.rows as Array<{ id: number; name: string }>) {
        subjectMap.set(Number(row.id), row);
      }

      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = Math.max(1, Number(settings.periods_per_day || 6));

      const collapsedAssignments = new Map<string, { class_id: number; subject_id: number; staff_id: number | null; hours_per_week: number }>();
      for (const row of existingPreview) {
        const key = `${Number(row.class_id)}-${Number(row.subject_id)}`;
        if (!collapsedAssignments.has(key)) {
          collapsedAssignments.set(key, {
            class_id: Number(row.class_id),
            subject_id: Number(row.subject_id),
            staff_id: row.staff_id ? Number(row.staff_id) : null,
            hours_per_week: Number(row.hours_per_week || 1),
          });
        }
      }

      const occupiedRows = await pool.query(
        `SELECT class_id, day_order, period FROM cg_timetable_slots WHERE class_id = ANY($1::int[])`,
        [selectedClassIds]
      );
      const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const classId of selectedClassIds) {
        occupied[String(classId)] = [];
      }
      for (const row of occupiedRows.rows as any[]) {
        occupied[String(row.class_id)].push({ day_order: Number(row.day_order), period: Number(row.period) });
      }

      const assignedStaffIds = [...new Set(
        Array.from(collapsedAssignments.values())
          .map(item => item.staff_id ? Number(item.staff_id) : 0)
          .filter(value => value > 0)
      )];
      const occupiedStaff: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const staffId of assignedStaffIds) {
        occupiedStaff[String(staffId)] = [];
      }
      if (assignedStaffIds.length > 0) {
        const staffOccupiedRows = await pool.query(
          `SELECT staff_id, day_order, period
           FROM cg_timetable_slots
           WHERE staff_id = ANY($1::int[])`,
          [assignedStaffIds]
        );
        for (const row of staffOccupiedRows.rows as any[]) {
          if (!row.staff_id) continue;
          occupiedStaff[String(row.staff_id)] ??= [];
          occupiedStaff[String(row.staff_id)].push({ day_order: Number(row.day_order), period: Number(row.period) });
        }
      }

      const schedule = await runMathematicsScheduler({
        assignments: Array.from(collapsedAssignments.values()).map(item => ({
          class_id: item.class_id,
          class_name: classMap.get(item.class_id)?.name,
          subject_id: item.subject_id,
          subject_name: subjectMap.get(item.subject_id)?.name,
          staff_id: item.staff_id,
          hours_per_week: item.hours_per_week,
        })),
        days: [1, 2, 3, 4, 5, 6],
        periods_per_day: periodsPerDay,
        occupied_slots: occupied,
        occupied_staff_slots: occupiedStaff,
      });

      if (schedule.error) {
        return res.status(400).json({ error: schedule.error });
      }
      if (!schedule.scheduled_slots || !Array.isArray(schedule.scheduled_slots) || schedule.scheduled_slots.length === 0) {
        return res.status(400).json({ error: 'No available slots found for mathematics regeneration' });
      }

      await pool.query('DELETE FROM cg_mathematics_preview_slots WHERE session_id = $1', [sessionId]);

      for (const slot of schedule.scheduled_slots) {
        const meta = collapsedAssignments.get(`${Number(slot.class_id)}-${Number(slot.subject_id)}`);
        await pool.query(
          `INSERT INTO cg_mathematics_preview_slots (session_id, class_id, subject_id, staff_id, day_order, period, hours_per_week)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            sessionId,
            Number(slot.class_id),
            Number(slot.subject_id),
            meta?.staff_id ?? (slot.staff_id ? Number(slot.staff_id) : null),
            Number(slot.day_order),
            Number(slot.period),
            meta?.hours_per_week ?? 1,
          ]
        );
      }

      res.json({ success: true, message: 'Timetable regenerated successfully', slotCount: schedule.scheduled_slots.length });
    } catch (e: any) {
      console.error('Mathematics regeneration error:', e);
      res.status(500).json({ error: e.message || 'Mathematics regeneration failed' });
    }
  });

  // Generic Department Subject Scheduling Endpoints
  app.post('/api/departments/:deptId/schedule-subjects', async (req, res) => {
    try {
      const departmentId = Number(req.params.deptId);
      const { assignments } = req.body;

      if (!Number.isFinite(departmentId) || departmentId <= 0) {
        return res.status(400).json({ error: 'Invalid department id' });
      }
      if (!Array.isArray(assignments) || assignments.length === 0) {
        return res.status(400).json({ error: 'Invalid or empty assignments' });
      }

      const departmentResult = await pool.query(
        `SELECT id, name FROM cg_departments WHERE id = $1`,
        [departmentId]
      );
      if (departmentResult.rowCount === 0) {
        return res.status(404).json({ error: 'Department not found' });
      }
      const departmentName = String(departmentResult.rows[0].name || '').trim().toLowerCase();
      if (['tamil', 'english', 'mathematics'].includes(departmentName)) {
        return res.status(400).json({ error: 'Use the dedicated scheduler for this department.' });
      }

      const normalizedAssignments = assignments.map((item: any) => ({
        class_id: Number(item?.class_id),
        subject_id: Number(item?.subject_id),
        staff_id: item?.staff_id ? Number(item.staff_id) : null,
        hours_per_week: Number(item?.hours_per_week),
      }));

      const invalidAssignment = normalizedAssignments.find(item =>
        !Number.isFinite(item.class_id)
        || item.class_id <= 0
        || !Number.isFinite(item.subject_id)
        || item.subject_id <= 0
        || !Number.isFinite(item.hours_per_week)
        || item.hours_per_week <= 0
      );
      if (invalidAssignment) {
        return res.status(400).json({ error: 'Every assignment needs valid class, subject, and hours.' });
      }

      const selectedClassIds = [...new Set(normalizedAssignments.map(item => item.class_id))];
      const selectedSubjectIds = [...new Set(normalizedAssignments.map(item => item.subject_id))];

      const [classRows, subjectRows, settingsRows] = await Promise.all([
        pool.query(
          `SELECT id, dept_id, year, name FROM cg_classes WHERE id = ANY($1::int[])`,
          [selectedClassIds]
        ),
        pool.query(
          `SELECT id, name, dept_id FROM cg_subjects WHERE id = ANY($1::int[])`,
          [selectedSubjectIds]
        ),
        pool.query('SELECT key, value FROM cg_settings'),
      ]);

      const classMap = new Map<number, { id: number; dept_id: number; year: number; name: string }>();
      for (const row of classRows.rows as Array<{ id: number; dept_id: number; year: number; name: string }>) {
        classMap.set(Number(row.id), row);
      }

      const subjectMap = new Map<number, { id: number; name: string; dept_id: number | null }>();
      for (const row of subjectRows.rows as Array<{ id: number; name: string; dept_id: number | null }>) {
        subjectMap.set(Number(row.id), row);
      }

      if (classMap.size !== selectedClassIds.length) {
        return res.status(400).json({ error: 'One or more selected classes were not found.' });
      }
      if (subjectMap.size !== selectedSubjectIds.length) {
        return res.status(400).json({ error: 'One or more selected subjects were not found.' });
      }

      const periodsPerDay = Math.max(1, Number(
        settingsRows.rows.reduce((acc: Record<string, string>, row: any) => {
          acc[row.key] = row.value;
          return acc;
        }, {}).periods_per_day || 6
      ));

      const occupiedRows = await pool.query(
        `SELECT class_id, day_order, period FROM cg_timetable_slots WHERE class_id = ANY($1::int[])`,
        [selectedClassIds]
      );
      const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const classId of selectedClassIds) {
        occupied[String(classId)] = [];
      }
      for (const row of occupiedRows.rows as any[]) {
        occupied[String(row.class_id)].push({ day_order: Number(row.day_order), period: Number(row.period) });
      }

      const assignedStaffIds = [...new Set(
        normalizedAssignments
          .map(item => item.staff_id ? Number(item.staff_id) : 0)
          .filter(value => Number.isFinite(value) && value > 0)
      )];
      const occupiedStaff: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const staffId of assignedStaffIds) {
        occupiedStaff[String(staffId)] = [];
      }
      if (assignedStaffIds.length > 0) {
        const staffOccupiedRows = await pool.query(
          `SELECT staff_id, day_order, period
           FROM cg_timetable_slots
           WHERE staff_id = ANY($1::int[])`,
          [assignedStaffIds]
        );
        for (const row of staffOccupiedRows.rows as any[]) {
          if (!row.staff_id) continue;
          occupiedStaff[String(row.staff_id)] ??= [];
          occupiedStaff[String(row.staff_id)].push({ day_order: Number(row.day_order), period: Number(row.period) });
        }
      }

      const schedulerAssignments = normalizedAssignments.map(item => ({
        class_id: item.class_id,
        class_name: classMap.get(item.class_id)?.name,
        subject_id: item.subject_id,
        subject_name: subjectMap.get(item.subject_id)?.name,
        staff_id: item.staff_id,
        hours_per_week: item.hours_per_week,
      }));

      const schedule = await runMathematicsScheduler({
        assignments: schedulerAssignments,
        days: [1, 2, 3, 4, 5, 6],
        periods_per_day: periodsPerDay,
        occupied_slots: occupied,
        occupied_staff_slots: occupiedStaff,
      });

      if (schedule.error) {
        return res.status(400).json({ error: schedule.error });
      }
      if (!schedule.scheduled_slots || !Array.isArray(schedule.scheduled_slots) || schedule.scheduled_slots.length === 0) {
        return res.status(400).json({ error: 'No available slots found for scheduling' });
      }

      const assignmentMeta = new Map<string, { staff_id: number | null; hours_per_week: number }>();
      for (const item of normalizedAssignments) {
        assignmentMeta.set(`${item.class_id}-${item.subject_id}`, {
          staff_id: item.staff_id,
          hours_per_week: item.hours_per_week,
        });
      }

      const sessionId = `dept_${departmentId}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await pool.query('DELETE FROM cg_department_preview_slots WHERE session_id = $1', [sessionId]);

      for (const slot of schedule.scheduled_slots) {
        const meta = assignmentMeta.get(`${Number(slot.class_id)}-${Number(slot.subject_id)}`);
        await pool.query(
          `INSERT INTO cg_department_preview_slots (session_id, department_id, class_id, subject_id, staff_id, day_order, period, hours_per_week)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            sessionId,
            departmentId,
            Number(slot.class_id),
            Number(slot.subject_id),
            meta?.staff_id ?? (slot.staff_id ? Number(slot.staff_id) : null),
            Number(slot.day_order),
            Number(slot.period),
            meta?.hours_per_week ?? 1,
          ]
        );
      }

      res.json({ sessionId, slots: schedule.scheduled_slots, slotCount: schedule.scheduled_slots.length });
    } catch (e: any) {
      console.error('Department scheduling error:', e);
      res.status(500).json({ error: e.message || 'Department scheduling failed' });
    }
  });

  app.get('/api/departments/:deptId/preview/:sessionId', async (req, res) => {
    try {
      const departmentId = Number(req.params.deptId);
      const { sessionId } = req.params;
      const previewRows = await pool.query(
        `SELECT p.id, p.session_id, p.department_id, dep.name AS scheduler_department_name,
                p.class_id, c.name AS class_name, c.year, d.name AS dept_name,
                p.subject_id, subj.name AS subject_name, subj.code AS subject_code,
                p.staff_id, st.name AS staff_name, p.day_order, p.period, p.hours_per_week
         FROM cg_department_preview_slots p
         JOIN cg_departments dep ON dep.id = p.department_id
         JOIN cg_classes c ON c.id = p.class_id
         JOIN cg_subjects subj ON subj.id = p.subject_id
         LEFT JOIN cg_departments d ON d.id = c.dept_id
         LEFT JOIN cg_staff st ON st.id = p.staff_id
         WHERE p.department_id = $1 AND p.session_id = $2
         ORDER BY p.class_id, p.subject_id, p.day_order, p.period`,
        [departmentId, sessionId]
      );

      const classIds = [...new Set((previewRows.rows as any[]).map(row => Number(row.class_id)).filter(Boolean))];
      let timetableRows: any[] = [];
      let staffBusyRows: any[] = [];

      if (classIds.length > 0) {
        const timetableResult = await pool.query(
          `SELECT ts.id, ts.class_id, c.name AS class_name, c.year, d.name AS dept_name, ts.subject_id, s.name AS subject_name, s.code AS subject_code,
                  ts.staff_id, st.name AS staff_name, l.name AS lab_name, ts.day_order, ts.period, ts.type
           FROM cg_timetable_slots ts
           JOIN cg_classes c ON c.id = ts.class_id
           LEFT JOIN cg_departments d ON d.id = c.dept_id
           LEFT JOIN cg_subjects s ON s.id = ts.subject_id
           LEFT JOIN cg_staff st ON st.id = ts.staff_id
           LEFT JOIN cg_labs l ON l.id = ts.lab_id
           WHERE ts.class_id = ANY($1::int[])
           ORDER BY ts.class_id, ts.day_order, ts.period`,
          [classIds]
        );
        timetableRows = timetableResult.rows;

        const previewStaffIds = [...new Set(
          (previewRows.rows as any[])
            .map(row => Number(row.staff_id))
            .filter(value => Number.isFinite(value) && value > 0)
        )];
        if (previewStaffIds.length > 0) {
          const staffBusyResult = await pool.query(
            `SELECT staff_id, class_id, day_order, period
             FROM cg_timetable_slots
             WHERE staff_id = ANY($1::int[])`,
            [previewStaffIds]
          );
          const classSubjectStaffPairs = new Map<string, number>();
          for (const row of previewRows.rows as any[]) {
            if (row.staff_id) {
              classSubjectStaffPairs.set(`${Number(row.class_id)}-${Number(row.subject_id)}`, Number(row.staff_id));
            }
          }
          for (const [pairKey, staffId] of classSubjectStaffPairs.entries()) {
            const classId = Number(pairKey.split('-')[0]);
            for (const row of staffBusyResult.rows as any[]) {
              if (Number(row.staff_id) !== staffId) continue;
              if (Number(row.class_id) === classId) continue;
              staffBusyRows.push({
                class_id: classId,
                staff_id: staffId,
                day_order: Number(row.day_order),
                period: Number(row.period),
              });
            }
          }
        }
      }

      res.json({ previewSlots: previewRows.rows, timetableSlots: timetableRows, staffBusySlots: staffBusyRows });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/departments/:deptId/fix/:sessionId', async (req, res) => {
    try {
      const departmentId = Number(req.params.deptId);
      const { sessionId } = req.params;

      await inTransaction(async client => {
        const deptRows = await client.query(`SELECT name FROM cg_departments WHERE id = $1`, [departmentId]);
        if (deptRows.rowCount === 0) throw new Error('Department not found.');
        const timetableType = String(deptRows.rows[0].name || '').trim().toLowerCase();

        const previewRows = await client.query(
          `SELECT class_id, subject_id, staff_id, day_order, period, hours_per_week
           FROM cg_department_preview_slots
           WHERE department_id = $1 AND session_id = $2`,
          [departmentId, sessionId]
        );

        if ((previewRows.rowCount ?? 0) === 0) {
          throw new Error('Preview session not found.');
        }

        const existingPreview = previewRows.rows as Array<{
          class_id: number;
          subject_id: number;
          staff_id: number | null;
          day_order: number;
          period: number;
          hours_per_week: number;
        }>;

        const assignmentMeta = new Map<string, { staff_id: number | null; hours_per_week: number; count: number }>();
        for (const row of existingPreview) {
          const key = `${Number(row.class_id)}-${Number(row.subject_id)}`;
          const current = assignmentMeta.get(key);
          if (current) current.count += 1;
          else {
            assignmentMeta.set(key, {
              staff_id: row.staff_id ? Number(row.staff_id) : null,
              hours_per_week: Number(row.hours_per_week || 1),
              count: 1,
            });
          }
        }

        const requestedPreviewSlots = Array.isArray(req.body?.previewSlots) ? req.body.previewSlots : null;
        const finalPreviewRows = requestedPreviewSlots
          ? requestedPreviewSlots.map((slot: any) => {
              const classId = Number(slot?.class_id);
              const subjectId = Number(slot?.subject_id);
              const dayOrder = Number(slot?.day_order);
              const period = Number(slot?.period);
              const meta = assignmentMeta.get(`${classId}-${subjectId}`);
              if (!classId || !subjectId || !dayOrder || !period || !meta) {
                throw new Error('Invalid edited department preview slots.');
              }
              return {
                class_id: classId,
                subject_id: subjectId,
                staff_id: meta.staff_id,
                day_order: dayOrder,
                period,
                hours_per_week: meta.hours_per_week,
              };
            })
          : existingPreview;

        const finalCounts = new Map<string, number>();
        const previewKeys = new Set<string>();
        for (const row of finalPreviewRows) {
          const key = `${row.class_id}-${row.day_order}-${row.period}`;
          if (previewKeys.has(key)) {
            throw new Error(`Duplicate preview slot at Day ${row.day_order} Period ${row.period} for class ${row.class_id}.`);
          }
          previewKeys.add(key);
          const assignmentKey = `${row.class_id}-${row.subject_id}`;
          finalCounts.set(assignmentKey, (finalCounts.get(assignmentKey) || 0) + 1);
        }

        for (const [assignmentKey, meta] of assignmentMeta.entries()) {
          if ((finalCounts.get(assignmentKey) || 0) !== meta.count) {
            throw new Error('Preview slot count mismatch. Refresh the preview and try again.');
          }
        }

        const selectedClassIds = [...new Set(finalPreviewRows.map(row => Number(row.class_id)))];
        const occupiedRows = await client.query(
          `SELECT class_id, day_order, period
           FROM cg_timetable_slots
           WHERE class_id = ANY($1::int[])`,
          [selectedClassIds]
        );
        const occupiedKeys = new Set(
          (occupiedRows.rows as Array<{ class_id: number; day_order: number; period: number }>).map(
            row => `${row.class_id}-${row.day_order}-${row.period}`
          )
        );

        const staffIds = [...new Set(
          finalPreviewRows
            .map(row => row.staff_id ? Number(row.staff_id) : 0)
            .filter(value => value > 0)
        )];
        const staffOccupiedKeys = new Set<string>();
        if (staffIds.length > 0) {
          const staffOccupiedRows = await client.query(
            `SELECT staff_id, class_id, day_order, period
             FROM cg_timetable_slots
             WHERE staff_id = ANY($1::int[])`,
            [staffIds]
          );
          for (const row of staffOccupiedRows.rows as Array<{ staff_id: number; class_id: number; day_order: number; period: number }>) {
            staffOccupiedKeys.add(`${row.staff_id}-${row.day_order}-${row.period}`);
          }
        }
        const previewStaffKeys = new Set<string>();

        for (const row of finalPreviewRows) {
          const key = `${row.class_id}-${row.day_order}-${row.period}`;
          if (occupiedKeys.has(key)) {
            throw new Error(`Slot conflicts with an occupied timetable slot at Day ${row.day_order} Period ${row.period} for class ${row.class_id}.`);
          }
          if (row.staff_id) {
            const staffKey = `${row.staff_id}-${row.day_order}-${row.period}`;
            if (staffOccupiedKeys.has(staffKey)) {
              throw new Error(`Slot conflicts with the assigned staff timetable at Day ${row.day_order} Period ${row.period} for staff ${row.staff_id}.`);
            }
            if (previewStaffKeys.has(staffKey)) {
              throw new Error(`Preview creates a staff overlap at Day ${row.day_order} Period ${row.period} for staff ${row.staff_id}.`);
            }
            previewStaffKeys.add(staffKey);
          }
        }

        for (const row of finalPreviewRows) {
          await client.query(
            `INSERT INTO cg_timetable_slots (class_id, subject_id, staff_id, day_order, period, type)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (class_id, day_order, period) DO UPDATE
             SET subject_id = EXCLUDED.subject_id, staff_id = EXCLUDED.staff_id, type = EXCLUDED.type`,
            [row.class_id, row.subject_id, row.staff_id, row.day_order, row.period, timetableType]
          );
        }

        await client.query(
          'DELETE FROM cg_department_preview_slots WHERE department_id = $1 AND session_id = $2',
          [departmentId, sessionId]
        );
      });

      res.json({ success: true, message: 'Department slots finalized' });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/departments/:deptId/regenerate/:sessionId', async (req, res) => {
    try {
      const departmentId = Number(req.params.deptId);
      const { sessionId } = req.params;
      const previewRows = await pool.query(
        `SELECT class_id, subject_id, staff_id, day_order, period, hours_per_week
         FROM cg_department_preview_slots
         WHERE department_id = $1 AND session_id = $2`,
        [departmentId, sessionId]
      );

      if (previewRows.rows.length === 0) {
        return res.status(404).json({ error: 'Preview session not found' });
      }

      const existingPreview = previewRows.rows as Array<{
        class_id: number;
        subject_id: number;
        staff_id: number | null;
        hours_per_week: number;
      }>;
      const selectedClassIds = [...new Set(existingPreview.map(row => Number(row.class_id)))];
      const selectedSubjectIds = [...new Set(existingPreview.map(row => Number(row.subject_id)))];

      const [classRows, subjectRows, settingsRows] = await Promise.all([
        pool.query(`SELECT id, dept_id, year, name FROM cg_classes WHERE id = ANY($1::int[])`, [selectedClassIds]),
        pool.query(`SELECT id, name FROM cg_subjects WHERE id = ANY($1::int[])`, [selectedSubjectIds]),
        pool.query('SELECT key, value FROM cg_settings'),
      ]);

      const classMap = new Map<number, { id: number; dept_id: number; year: number; name: string }>();
      for (const row of classRows.rows as Array<{ id: number; dept_id: number; year: number; name: string }>) classMap.set(Number(row.id), row);
      const subjectMap = new Map<number, { id: number; name: string }>();
      for (const row of subjectRows.rows as Array<{ id: number; name: string }>) subjectMap.set(Number(row.id), row);

      const settings = settingsRows.rows.reduce((acc: Record<string, string>, row: any) => {
        acc[row.key] = row.value;
        return acc;
      }, {});
      const periodsPerDay = Math.max(1, Number(settings.periods_per_day || 6));

      const collapsedAssignments = new Map<string, { class_id: number; subject_id: number; staff_id: number | null; hours_per_week: number }>();
      for (const row of existingPreview) {
        const key = `${Number(row.class_id)}-${Number(row.subject_id)}`;
        if (!collapsedAssignments.has(key)) {
          collapsedAssignments.set(key, {
            class_id: Number(row.class_id),
            subject_id: Number(row.subject_id),
            staff_id: row.staff_id ? Number(row.staff_id) : null,
            hours_per_week: Number(row.hours_per_week || 1),
          });
        }
      }

      const occupiedRows = await pool.query(
        `SELECT class_id, day_order, period FROM cg_timetable_slots WHERE class_id = ANY($1::int[])`,
        [selectedClassIds]
      );
      const occupied: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const classId of selectedClassIds) occupied[String(classId)] = [];
      for (const row of occupiedRows.rows as any[]) {
        occupied[String(row.class_id)].push({ day_order: Number(row.day_order), period: Number(row.period) });
      }

      const assignedStaffIds = [...new Set(
        Array.from(collapsedAssignments.values()).map(item => item.staff_id ? Number(item.staff_id) : 0).filter(value => value > 0)
      )];
      const occupiedStaff: Record<string, Array<{ day_order: number; period: number }>> = {};
      for (const staffId of assignedStaffIds) occupiedStaff[String(staffId)] = [];
      if (assignedStaffIds.length > 0) {
        const staffOccupiedRows = await pool.query(
          `SELECT staff_id, day_order, period FROM cg_timetable_slots WHERE staff_id = ANY($1::int[])`,
          [assignedStaffIds]
        );
        for (const row of staffOccupiedRows.rows as any[]) {
          if (!row.staff_id) continue;
          occupiedStaff[String(row.staff_id)] ??= [];
          occupiedStaff[String(row.staff_id)].push({ day_order: Number(row.day_order), period: Number(row.period) });
        }
      }

      const schedule = await runMathematicsScheduler({
        assignments: Array.from(collapsedAssignments.values()).map(item => ({
          class_id: item.class_id,
          class_name: classMap.get(item.class_id)?.name,
          subject_id: item.subject_id,
          subject_name: subjectMap.get(item.subject_id)?.name,
          staff_id: item.staff_id,
          hours_per_week: item.hours_per_week,
        })),
        days: [1, 2, 3, 4, 5, 6],
        periods_per_day: periodsPerDay,
        occupied_slots: occupied,
        occupied_staff_slots: occupiedStaff,
      });

      if (schedule.error) return res.status(400).json({ error: schedule.error });
      if (!schedule.scheduled_slots || !Array.isArray(schedule.scheduled_slots) || schedule.scheduled_slots.length === 0) {
        return res.status(400).json({ error: 'No available slots found for regeneration' });
      }

      await pool.query(
        'DELETE FROM cg_department_preview_slots WHERE department_id = $1 AND session_id = $2',
        [departmentId, sessionId]
      );

      for (const slot of schedule.scheduled_slots) {
        const meta = collapsedAssignments.get(`${Number(slot.class_id)}-${Number(slot.subject_id)}`);
        await pool.query(
          `INSERT INTO cg_department_preview_slots (session_id, department_id, class_id, subject_id, staff_id, day_order, period, hours_per_week)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            sessionId,
            departmentId,
            Number(slot.class_id),
            Number(slot.subject_id),
            meta?.staff_id ?? (slot.staff_id ? Number(slot.staff_id) : null),
            Number(slot.day_order),
            Number(slot.period),
            meta?.hours_per_week ?? 1,
          ]
        );
      }

      res.json({ success: true, message: 'Timetable regenerated successfully', slotCount: schedule.scheduled_slots.length });
    } catch (e: any) {
      console.error('Department regeneration error:', e);
      res.status(500).json({ error: e.message || 'Department regeneration failed' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
