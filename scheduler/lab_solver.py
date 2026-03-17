from ortools.sat.python import cp_model
import json
import sys


MAX_CANDIDATES = 72
MAX_CANDIDATES_PER_LAB = 18


def safe_int(value, default: int = 0) -> int:
    try:
        if value is None:
            return default
        text = str(value).strip().lower()
        if text in {"nan", "none", "null", ""}:
            return default
        return int(float(text))
    except Exception:
        return default


def split_hours(hours: int) -> list[int]:
    if hours <= 0:
        return []
    if hours <= 2:
        return [hours]

    # For any requirement above 2h/week, split into exactly two sessions.
    left = hours // 2
    right = hours - left
    return [left, right]


def req_type(requirements: str) -> str:
    text = (requirements or "").lower()
    if "kitchen" in text or "catering" in text or "food production" in text:
        return "kitchen"
    return "computer"


def requires_windows11(requirements: str) -> bool:
    text = (requirements or "").lower()
    return "windows 11" in text


def has_any(text: str, words: list[str]) -> bool:
    return any(w in text for w in words)


def normalize_text(value: str) -> str:
    if value is None:
        return ""
    return "".join(ch for ch in str(value).lower() if ch.isalnum())


def preferred_lab_name_tokens_for_dept(dept_name: str) -> list[str]:
    dept = normalize_text(dept_name)
    if not dept:
        return []

    # Department-specific preferred labs.
    if "csda" in dept:
        return ["labb", "lab2", "csdalabb", "csdalab2"]

    # Check CS after CSDA so CSDA is not accidentally matched as CS.
    if dept == "cs" or dept.startswith("cs"):
        return ["laba", "lab1", "cslaba", "cslab1"]

    return []


def lab_preference_penalty(req: dict, lab: dict) -> int:
    req_dept = normalize_text(req.get("class_dept_name") or "")
    lab_name = normalize_text(lab.get("name") or "")
    lab_dept = normalize_text(lab.get("dept_name") or "")

    if not req_dept:
        return 2

    preferred_tokens = preferred_lab_name_tokens_for_dept(req_dept)
    if preferred_tokens and any(tok in lab_name for tok in preferred_tokens):
        return 0

    if lab_dept and req_dept == lab_dept:
        return 1

    if req_dept and req_dept in lab_name:
        return 2

    return 4


def matches_preference_pattern(req: dict, pattern: str) -> bool:
    token = normalize_text(pattern)
    if not token:
        return False

    haystack = normalize_text(
        " ".join(
            [
                req.get("subject_name") or "",
                req.get("subject_code") or "",
                req.get("class_name") or "",
                req.get("class_dept_name") or "",
            ]
        )
    )
    return token in haystack


def matching_lab_ids_for_hint(labs: list[dict], preferred_lab: str) -> list[int]:
    token = normalize_text(preferred_lab)
    if not token:
        return []

    matched: list[int] = []
    for lab in labs:
        lab_id = safe_int(lab.get("id"), 0)
        if lab_id < 1:
            continue
        lab_name = normalize_text(lab.get("name") or "")
        if not lab_name:
            continue
        if token in lab_name or lab_name in token:
            matched.append(lab_id)
    return matched


def build_preference_info(req: dict, labs: list[dict], preferences: list[dict]) -> dict:
    matched_rules: list[dict] = []
    preferred_lab_ids: set[int] = set()
    unmatched_lab_hints: list[str] = []

    for pref in preferences:
        match_text = str(pref.get("match_text") or "").strip()
        preferred_lab = str(pref.get("preferred_lab") or "").strip()
        if not match_text or not preferred_lab:
            continue
        if not matches_preference_pattern(req, match_text):
            continue

        matched_rules.append({"match_text": match_text, "preferred_lab": preferred_lab})
        matched_ids = matching_lab_ids_for_hint(labs, preferred_lab)
        if matched_ids:
            preferred_lab_ids.update(matched_ids)
        else:
            unmatched_lab_hints.append(preferred_lab)

    return {
        "matched_rules": matched_rules,
        "preferred_lab_ids": sorted(preferred_lab_ids),
        "unmatched_lab_hints": unmatched_lab_hints,
    }


def candidate_preference_penalty(req: dict, lab: dict, preference_info: dict) -> int:
    preferred_lab_ids = set(preference_info.get("preferred_lab_ids") or [])
    lab_id = safe_int(lab.get("id"), 0)

    if preferred_lab_ids:
        return 0 if lab_id in preferred_lab_ids else 8

    if preference_info.get("matched_rules"):
        return 6

    return lab_preference_penalty(req, lab)


def preferred_lab_capacity_ok(req: dict, lab: dict) -> bool:
    # Preferred mappings can bypass software/OS checks, but not hard capacity limits.
    return safe_int(lab.get("systems"), 0) >= safe_int(req.get("class_strength"), 0)


def tool_requirements(req_text: str) -> list[list[str]]:
    # Each inner list is an OR-group; all groups must be satisfied.
    groups: list[list[str]] = []
    if has_any(req_text, ["python"]):
        groups.append(["python"])
    if has_any(req_text, ["java", "jdk", "intellij", "eclipse"]):
        groups.append(["java", "jdk", "intellij", "eclipse"])
    if has_any(req_text, ["mysql", "postgresql", "oracle", "database", "db", "dbeaver", "workbench"]):
        groups.append(["mysql", "postgresql", "oracle", "database", "db", "dbeaver", "workbench"])
    if has_any(req_text, ["gcc", "turbo c", "codeblocks", "c++", "c /"]):
        groups.append(["gcc", "turbo c", "codeblocks", "c++", "compiler"])
    if has_any(req_text, ["node", "javascript", "html", "css", "web"]):
        groups.append(["node", "javascript", "html", "css", "browser", "web"])
    if has_any(req_text, ["office", "libreoffice", "ms office"]):
        groups.append(["office", "libreoffice"])
    if has_any(req_text, ["hadoop", "spark", "big data"]):
        groups.append(["hadoop", "spark", "big data"])
    if has_any(req_text, ["tensorflow", "scikit", "pandas", "numpy", "machine learning"]):
        groups.append(["tensorflow", "scikit", "pandas", "numpy", "machine learning", "ml"])
    return groups


def lab_matches(req: dict, lab: dict) -> bool:
    req_text = " ".join(
        [
            (req.get("requirements") or ""),
            (req.get("subject_name") or ""),
            (req.get("subject_code") or ""),
        ]
    ).lower()
    lab_text = " ".join(
        [
            (lab.get("name") or ""),
            (lab.get("os_installed") or ""),
            (lab.get("system_spec") or ""),
        ]
    ).lower()

    if safe_int(lab.get("systems"), 0) < safe_int(req.get("class_strength"), 0):
        return False

    if req_type(req_text) == "kitchen":
        if "kitchen" not in lab_text and "cater" not in lab_text:
            return False
    else:
        if "kitchen" in lab_text or "cater" in lab_text:
            return False

    if requires_windows11(req_text) and "windows 11" not in lab_text:
        return False

    if "linux" in req_text and not has_any(lab_text, ["linux", "ubuntu", "debian"]):
        return False

    for group in tool_requirements(req_text):
        if not has_any(lab_text, group):
            return False

    return True


def to_blocked_map(raw: dict) -> dict[tuple[int, int], bool]:
    out: dict[tuple[int, int], bool] = {}
    for item in raw:
        day = safe_int(item.get("day_order"), 0)
        period = safe_int(item.get("period"), 0)
        if day >= 1 and period >= 1:
            out[(day, period)] = True
    return out


def solve(data: dict) -> dict:
    requirements = data.get("classes", [])
    labs = data.get("labs", [])
    preferences = data.get("preferences", [])
    periods_per_day = max(1, safe_int(data.get("periods_per_day", 6), 6))
    days = [d for d in (safe_int(d, 0) for d in data.get("days", [1, 2, 3, 4, 5, 6])) if d >= 1]
    if not days:
        days = [1, 2, 3, 4, 5, 6]

    blocked = data.get("blocked", {})
    class_blocked_raw = blocked.get("class_slots", {})
    lab_blocked_raw = blocked.get("lab_slots", {})

    if not requirements:
        return {"ok": False, "error": "No lab requirements provided."}
    if not labs:
        return {"ok": False, "error": "No labs provided."}

    class_blocked: dict[int, dict[tuple[int, int], bool]] = {}
    for k, slots in class_blocked_raw.items():
        class_id = safe_int(k, 0)
        if class_id >= 1:
            class_blocked[class_id] = to_blocked_map(slots)

    lab_blocked: dict[int, dict[tuple[int, int], bool]] = {}
    for k, slots in lab_blocked_raw.items():
        lab_id = safe_int(k, 0)
        if lab_id >= 1:
            lab_blocked[lab_id] = to_blocked_map(slots)

    req_by_id: dict[int, dict] = {}
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        req_by_id[req_id] = req

    lab_by_id: dict[int, dict] = {}
    for lab in labs:
        lab_id = safe_int(lab.get("id"), 0)
        if lab_id >= 1:
            lab_by_id[lab_id] = lab

    preference_info_by_req: dict[int, dict] = {}
    preference_rule_matches: list[tuple[str, str]] = []
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        info = build_preference_info(req, labs, preferences)
        preference_info_by_req[req_id] = info
        for rule in info.get("matched_rules", []):
            preference_rule_matches.append((rule["match_text"], rule["preferred_lab"]))

    preference_warnings: list[str] = []
    seen_rule_matches = set(preference_rule_matches)
    for pref in preferences:
        match_text = str(pref.get("match_text") or "").strip()
        preferred_lab = str(pref.get("preferred_lab") or "").strip()
        if not match_text or not preferred_lab:
            continue
        key = (match_text, preferred_lab)
        if key not in seen_rule_matches:
            preference_warnings.append(
                f'Preference "{match_text} -> {preferred_lab}" did not match any subject, class, or department.'
            )

    compatible_labs: dict[int, list[int]] = {}
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue

        preference_info = preference_info_by_req.get(req_id, {})
        preferred_lab_ids = set(preference_info.get("preferred_lab_ids") or [])

        allowed_lab_ids: list[int] = []
        for lab in labs:
            lab_id = safe_int(lab.get("id"), 0)
            if lab_id < 1:
                continue

            if lab_matches(req, lab):
                allowed_lab_ids.append(lab_id)
                continue

            # Explicit preferred mapping: bypass software/OS matching checks.
            if lab_id in preferred_lab_ids and preferred_lab_capacity_ok(req, lab):
                allowed_lab_ids.append(lab_id)

        compatible_labs[req_id] = sorted(set(allowed_lab_ids))

    print(f"Total requirements: {len(requirements)}", file=sys.stderr)
    print(f"Total labs: {len(labs)}", file=sys.stderr)
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        print(f"Req {req_id} compatible labs: {compatible_labs.get(req_id, [])}", file=sys.stderr)

    # Heuristic ordering before CP-SAT: harder requests first.
    requirements = sorted(
        requirements,
        key=lambda r: (
            len(compatible_labs.get(safe_int(r.get("id"), 0), [])),
            -safe_int(r.get("class_strength"), 0),
            -safe_int(r.get("lab_hours"), 0),
        ),
    )

    sessions: list[dict] = []
    session_by_id: dict[str, dict] = {}
    req_session_ids: dict[int, list[str]] = {}
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        pieces = split_hours(safe_int(req.get("lab_hours"), 0))
        if not pieces:
            continue
        req_session_ids.setdefault(req_id, [])
        for idx, length in enumerate(pieces):
            sid = f"{req_id}_{idx}"
            sessions.append(
                {
                    "session_id": sid,
                    "req_id": req_id,
                    "class_id": safe_int(req.get("class_id"), 0),
                    "subject_id": safe_int(req.get("subject_id"), 0),
                    "length": safe_int(length, 0),
                    "requirements": req.get("requirements") or "",
                }
            )
            session_by_id[sid] = sessions[-1]
            req_session_ids[req_id].append(sid)

    if not sessions:
        return {"ok": False, "error": "No session blocks generated from lab hours."}

    model = cp_model.CpModel()
    req_active: dict[int, cp_model.IntVar] = {}
    req_impossible: set[int] = set()
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        req_active[req_id] = model.NewBoolVar(f"req_active_{req_id}")
        if not compatible_labs[req_id]:
            req_impossible.add(req_id)
            model.Add(req_active[req_id] == 0)

    choose_lab: dict[tuple[int, int], cp_model.IntVar] = {}
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        vars_for_req = []
        for lab_id in compatible_labs[req_id]:
            v = model.NewBoolVar(f"choose_req{req_id}_lab{lab_id}")
            choose_lab[(req_id, lab_id)] = v
            vars_for_req.append(v)
        if vars_for_req:
            model.Add(sum(vars_for_req) == req_active[req_id])

    assign: dict[tuple[str, int, int, int], cp_model.IntVar] = {}
    session_candidates: dict[str, list[tuple[int, int, int]]] = {}

    for s in sessions:
        sid = s["session_id"]
        req_id = s["req_id"]
        class_id = s["class_id"]
        length = s["length"]

        preference_info = preference_info_by_req.get(req_id, {})
        req = req_by_id.get(req_id, {})
        lab_priority = sorted(
            compatible_labs[req_id],
            key=lambda lab_id: (
                candidate_preference_penalty(req, lab_by_id.get(lab_id, {}), preference_info),
                lab_id,
            ),
        )

        per_lab_candidates: list[tuple[int, int, int]] = []
        for lab_id in lab_priority:
            current_lab_candidates: list[tuple[int, int, int]] = []
            for day in days:
                for start in range(1, periods_per_day - length + 2):
                    blocked_flag = False
                    for p in range(start, start + length):
                        if class_blocked.get(class_id, {}).get((day, p), False):
                            blocked_flag = True
                            break
                        if lab_blocked.get(lab_id, {}).get((day, p), False):
                            blocked_flag = True
                            break
                    if blocked_flag:
                        continue

                    current_lab_candidates.append((lab_id, day, start))

            per_lab_candidates.extend(current_lab_candidates[:MAX_CANDIDATES_PER_LAB])

        candidates = per_lab_candidates[:MAX_CANDIDATES]
        for lab_id, day, start in candidates:
            v = model.NewBoolVar(f"x_{sid}_l{lab_id}_d{day}_s{start}")
            assign[(sid, lab_id, day, start)] = v
            model.Add(v <= choose_lab[(req_id, lab_id)])

        session_candidates[sid] = candidates
        if candidates:
            model.Add(sum(assign[(sid, l, d, st)] for (l, d, st) in candidates) == req_active[req_id])
        else:
            req_impossible.add(req_id)
            model.Add(req_active[req_id] == 0)

    # If a requirement is split across multiple sessions, place them on different days.
    for req in requirements:
        req_id = int(req["id"])
        session_ids = req_session_ids.get(req_id, [])
        if len(session_ids) <= 1:
            continue

        for day in days:
            same_day_vars = []
            for sid in session_ids:
                for lab_id, d, start in session_candidates.get(sid, []):
                    if d == day:
                        same_day_vars.append(assign[(sid, lab_id, d, start)])
            if same_day_vars:
                model.Add(sum(same_day_vars) <= 1)

    # Class conflict: a class cannot have 2 lab sessions at the same period.
    class_ids = sorted({s["class_id"] for s in sessions})
    for class_id in class_ids:
        class_sessions = [s for s in sessions if s["class_id"] == class_id]
        for day in days:
            for period in range(1, periods_per_day + 1):
                covering_vars = []
                for s in class_sessions:
                    sid = s["session_id"]
                    length = s["length"]
                    for lab_id, d, start in session_candidates[sid]:
                        if d != day:
                            continue
                        if start <= period < start + length:
                            covering_vars.append(assign[(sid, lab_id, d, start)])
                if covering_vars:
                    model.Add(sum(covering_vars) <= 1)

    # Lab conflict: a lab cannot host 2 classes at the same period.
    lab_ids = [int(l["id"]) for l in labs]
    for lab_id in lab_ids:
        lab_sessions = [s for s in sessions if lab_id in compatible_labs[s["req_id"]]]
        for day in days:
            for period in range(1, periods_per_day + 1):
                covering_vars = []
                for s in lab_sessions:
                    sid = s["session_id"]
                    length = s["length"]
                    for l, d, start in session_candidates[sid]:
                        if l != lab_id or d != day:
                            continue
                        if start <= period < start + length:
                            covering_vars.append(assign[(sid, l, d, start)])
                if covering_vars:
                    model.Add(sum(covering_vars) <= 1)

    max_possible_sessions = max(1, len(sessions))

    lab_load_vars: list[cp_model.IntVar] = []
    for lab_id in lab_ids:
        lab_assignments = []
        for s in sessions:
            sid = s["session_id"]
            for l, d, start in session_candidates.get(sid, []):
                if l == lab_id:
                    lab_assignments.append(assign[(sid, l, d, start)])
        load_var = model.NewIntVar(0, max_possible_sessions, f"lab_load_{lab_id}")
        if lab_assignments:
            model.Add(load_var == sum(lab_assignments))
        else:
            model.Add(load_var == 0)
        lab_load_vars.append(load_var)

    day_load_vars: list[cp_model.IntVar] = []
    for day in days:
        day_assignments = []
        for s in sessions:
            sid = s["session_id"]
            for l, d, start in session_candidates.get(sid, []):
                if d == day:
                    day_assignments.append(assign[(sid, l, d, start)])
        load_var = model.NewIntVar(0, max_possible_sessions, f"day_load_{day}")
        if day_assignments:
            model.Add(load_var == sum(day_assignments))
        else:
            model.Add(load_var == 0)
        day_load_vars.append(load_var)

    lab_day_load_vars: list[cp_model.IntVar] = []
    for lab_id in lab_ids:
        for day in days:
            lab_day_assignments = []
            for s in sessions:
                sid = s["session_id"]
                for l, d, start in session_candidates.get(sid, []):
                    if l == lab_id and d == day:
                        lab_day_assignments.append(assign[(sid, l, d, start)])
            load_var = model.NewIntVar(0, max_possible_sessions, f"lab_day_load_{lab_id}_{day}")
            if lab_day_assignments:
                model.Add(load_var == sum(lab_day_assignments))
            else:
                model.Add(load_var == 0)
            lab_day_load_vars.append(load_var)

    max_lab_load = model.NewIntVar(0, max_possible_sessions, "max_lab_load")
    model.AddMaxEquality(max_lab_load, lab_load_vars)
    max_day_load = model.NewIntVar(0, max_possible_sessions, "max_day_load")
    model.AddMaxEquality(max_day_load, day_load_vars)
    max_lab_day_load = model.NewIntVar(0, max_possible_sessions, "max_lab_day_load")
    model.AddMaxEquality(max_lab_day_load, lab_day_load_vars)

    # Objective: maximize assigned requirements first, then honor preferences and spread load.
    reward_terms = [req_active[int(req["id"])] * 1_000_000 for req in requirements]
    objective_terms = []
    for s in sessions:
        sid = s["session_id"]
        req = req_by_id.get(s["req_id"], {})
        preference_info = preference_info_by_req.get(s["req_id"], {})
        for lab_id, day, start in session_candidates[sid]:
            lab = lab_by_id.get(lab_id, {})
            preference_penalty = candidate_preference_penalty(req, lab, preference_info)
            score = day * 100 + start + (preference_penalty * 10_000)
            objective_terms.append(assign[(sid, lab_id, day, start)] * score)
    balance_penalties = [max_lab_load * 25_000, max_day_load * 20_000, max_lab_day_load * 15_000]
    model.Maximize(sum(reward_terms) - sum(balance_penalties) - sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 20
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"ok": False, "error": "No feasible lab schedule found with current constraints."}

    output = []
    chosen_lab_by_req: dict[int, int] = {}
    req_assigned_counts: dict[int, int] = {int(req["id"]): 0 for req in requirements}
    assigned_session_ids: set[str] = set()
    for s in sessions:
        sid = s["session_id"]
        req_id = s["req_id"]
        class_id = s["class_id"]
        subject_id = s["subject_id"]
        length = s["length"]
        chosen = None
        for lab_id, day, start in session_candidates[sid]:
            if solver.Value(assign[(sid, lab_id, day, start)]) == 1:
                chosen = (lab_id, day, start)
                break

        if not chosen:
            continue

        req_assigned_counts[req_id] = req_assigned_counts.get(req_id, 0) + 1
        assigned_session_ids.add(sid)

        lab_id, day, start = chosen
        chosen_lab_by_req[req_id] = lab_id
        group = f"req{req_id}_d{day}_s{start}_l{lab_id}"
        for period in range(start, start + length):
            output.append(
                {
                    "lab_requirement_id": req_id,
                    "class_id": class_id,
                    "subject_id": subject_id,
                    "lab_id": lab_id,
                    "day_order": day,
                    "period": period,
                    "preview_group": group,
                }
            )

    # Fallback assignment pass for unresolved sessions: sort labs by preference/load and fill first conflict-free slots.
    class_occ: set[tuple[int, int, int]] = set()
    lab_occ: set[tuple[int, int, int]] = set()

    for class_id, blocked_map in class_blocked.items():
        for day, period in blocked_map.keys():
            class_occ.add((class_id, day, period))

    for lab_id, blocked_map in lab_blocked.items():
        for day, period in blocked_map.keys():
            lab_occ.add((lab_id, day, period))

    lab_load_counter: dict[int, int] = {}
    day_load_counter: dict[int, int] = {}
    req_used_days: dict[int, set[int]] = {}
    for row in output:
        cid = safe_int(row.get("class_id"), 0)
        lid = safe_int(row.get("lab_id"), 0)
        day = safe_int(row.get("day_order"), 0)
        period = safe_int(row.get("period"), 0)
        req_id = safe_int(row.get("lab_requirement_id"), 0)
        if cid >= 1 and day >= 1 and period >= 1:
            class_occ.add((cid, day, period))
        if lid >= 1 and day >= 1 and period >= 1:
            lab_occ.add((lid, day, period))
            lab_load_counter[lid] = lab_load_counter.get(lid, 0) + 1
        if day >= 1:
            day_load_counter[day] = day_load_counter.get(day, 0) + 1
        if req_id >= 1 and day >= 1:
            req_used_days.setdefault(req_id, set()).add(day)

    unresolved_sessions = [session_by_id[sid] for sid in session_by_id.keys() if sid not in assigned_session_ids]
    unresolved_sessions.sort(
        key=lambda s: (
            len(compatible_labs.get(s["req_id"], [])),
            -safe_int(s.get("length"), 0),
        )
    )

    for s in unresolved_sessions:
        sid = s["session_id"]
        req_id = s["req_id"]
        class_id = s["class_id"]
        subject_id = s["subject_id"]
        length = safe_int(s.get("length"), 0)
        if length <= 0:
            continue

        req = req_by_id.get(req_id, {})
        pref_info = preference_info_by_req.get(req_id, {})
        labs_sorted = sorted(
            compatible_labs.get(req_id, []),
            key=lambda lab_id: (
                candidate_preference_penalty(req, lab_by_id.get(lab_id, {}), pref_info),
                lab_load_counter.get(lab_id, 0),
                lab_id,
            ),
        )

        best_choice = None
        best_score = 10**18
        used_days = req_used_days.setdefault(req_id, set())
        split_needed = len(req_session_ids.get(req_id, [])) > 1

        for lab_id in labs_sorted:
            for day in days:
                if split_needed and day in used_days:
                    continue

                for start in range(1, periods_per_day - length + 2):
                    ok = True
                    for period in range(start, start + length):
                        if (class_id, day, period) in class_occ:
                            ok = False
                            break
                        if (lab_id, day, period) in lab_occ:
                            ok = False
                            break
                    if not ok:
                        continue

                    score = (
                        day_load_counter.get(day, 0) * 2000
                        + lab_load_counter.get(lab_id, 0) * 1000
                        + day * 100
                        + start
                    )
                    if score < best_score:
                        best_score = score
                        best_choice = (lab_id, day, start)

        if not best_choice:
            continue

        lab_id, day, start = best_choice
        chosen_lab_by_req[req_id] = lab_id
        req_assigned_counts[req_id] = req_assigned_counts.get(req_id, 0) + 1
        assigned_session_ids.add(sid)
        used_days.add(day)

        group = f"greedy_req{req_id}_d{day}_s{start}_l{lab_id}"
        for period in range(start, start + length):
            class_occ.add((class_id, day, period))
            lab_occ.add((lab_id, day, period))
            lab_load_counter[lab_id] = lab_load_counter.get(lab_id, 0) + 1
            day_load_counter[day] = day_load_counter.get(day, 0) + 1
            output.append(
                {
                    "lab_requirement_id": req_id,
                    "class_id": class_id,
                    "subject_id": subject_id,
                    "lab_id": lab_id,
                    "day_order": day,
                    "period": period,
                    "preview_group": group,
                }
            )

    unassigned = [
        req_id
        for req_id, session_ids in req_session_ids.items()
        if req_assigned_counts.get(req_id, 0) < len(session_ids)
    ]
    for req_id in sorted(req_impossible):
        if req_id not in unassigned:
            unassigned.append(req_id)

    preference_notes = []
    for req in requirements:
        req_id = safe_int(req.get("id"), 0)
        if req_id < 1:
            continue
        info = preference_info_by_req.get(req_id, {})
        matched_rules = info.get("matched_rules") or []
        if not matched_rules:
            continue

        preferred_lab_ids = set(info.get("preferred_lab_ids") or [])
        preferred_label = ", ".join(dict.fromkeys(rule["preferred_lab"] for rule in matched_rules))
        chosen_lab_id = chosen_lab_by_req.get(req_id)
        chosen_lab_name = None
        if chosen_lab_id in lab_by_id:
            chosen_lab_name = lab_by_id[chosen_lab_id].get("name")

        if chosen_lab_id and chosen_lab_id in preferred_lab_ids:
            continue

        compatible_preferred = [lab_id for lab_id in compatible_labs.get(req_id, []) if lab_id in preferred_lab_ids]
        preferred_sessions_feasible = True
        if compatible_preferred:
            for sid in req_session_ids.get(req_id, []):
                if not any(lab_id in preferred_lab_ids for (lab_id, _, _) in session_candidates.get(sid, [])):
                    preferred_sessions_feasible = False
                    break
        else:
            preferred_sessions_feasible = False

        reason = "Preferred lab could not be satisfied."
        if info.get("unmatched_lab_hints"):
            reason = f'Preferred lab mapping not found for: {", ".join(info["unmatched_lab_hints"])}.'
        elif not compatible_preferred:
            reason = "Preferred lab could not be used due to capacity limits for this class."
        elif chosen_lab_id is None:
            reason = "Preferred lab had no conflict-free slots available, and no fallback allocation was possible."
        elif not preferred_sessions_feasible:
            reason = "Preferred lab had no conflict-free slot window for the full session length."
        else:
            reason = "Preferred lab caused timetable conflicts during balancing, so a fallback lab was selected."

        preference_notes.append(
            {
                "lab_requirement_id": req_id,
                "class_name": req.get("class_name") or "",
                "subject_name": req.get("subject_name") or "",
                "preferred_lab": preferred_label,
                "allocated_lab": chosen_lab_name,
                "reason": reason,
            }
        )

    return {
        "ok": True,
        "assignments": output,
        "unassigned": sorted(unassigned),
        "preference_notes": preference_notes,
        "preference_warnings": preference_warnings,
    }


if __name__ == "__main__":
    try:
        payload = json.loads(sys.stdin.read())
        result = solve(payload)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)
