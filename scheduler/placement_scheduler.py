from ortools.sat.python import cp_model
import json
import sys


TARGET_CLASSES_PER_SUBGROUP = 2
MAX_COMBINATIONS = 3


def build_class_meta_map(class_details: list[dict], fallback_classes: list[int]) -> dict[int, dict[str, int]]:
    if not class_details:
        return {class_id: {"dept_id": class_id, "year": 0} for class_id in fallback_classes}

    class_meta_map: dict[int, dict[str, int]] = {}
    for item in class_details:
        class_id = int(item["id"])
        dept_id = int(item.get("dept_id") or class_id)
        year = int(item.get("year") or 0)
        class_meta_map[class_id] = {"dept_id": dept_id, "year": year}
    return class_meta_map


def build_occupied_map(raw_occupied: dict[str, list[dict]]) -> dict[int, set[tuple[int, int]]]:
    occupied: dict[int, set[tuple[int, int]]] = {}
    for class_id_str, slots in raw_occupied.items():
        class_id = int(class_id_str)
        occupied[class_id] = set()
        for item in slots:
            day_order = int(item["day_order"])
            period = int(item["period"])
            occupied[class_id].add((day_order, period))
    return occupied


def get_candidates(
    class_id: int,
    days: list[int],
    periods_per_day: int,
    hours: int,
    occupied: dict[int, set[tuple[int, int]]],
) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    half_split = periods_per_day // 2
    class_occupied = occupied.get(class_id, set())

    morning: list[tuple[int, int]] = []
    afternoon: list[tuple[int, int]] = []

    for day in days:
        max_start = periods_per_day - hours + 1
        for start in range(1, max_start + 1):
            end = start + hours - 1
            if any((day, p) in class_occupied for p in range(start, end + 1)):
                continue

            if end <= half_split:
                morning.append((day, start))
            elif start > half_split:
                afternoon.append((day, start))

    return morning, afternoon


def chunk_evenly(values: list[int], chunk_count: int) -> list[list[int]]:
    if chunk_count <= 0:
        return []

    base_size = len(values) // chunk_count
    remainder = len(values) % chunk_count
    chunks: list[list[int]] = []
    start = 0

    for index in range(chunk_count):
        size = base_size + (1 if index < remainder else 0)
        if size <= 0:
            continue
        chunks.append(values[start : start + size])
        start += size

    return chunks


def rotate_days(days: list[int], offset: int) -> list[int]:
    if not days:
        return []
    offset = offset % len(days)
    return days[offset:] + days[:offset]


def next_bucket_with_capacity(start_index: int, buckets: list[dict[str, object]]) -> int:
    if not buckets:
        raise ValueError("No buckets available for placement grouping")

    bucket_count = len(buckets)
    for offset in range(bucket_count):
        idx = (start_index + offset) % bucket_count
        if int(buckets[idx]["capacity"]) > 0:
            return idx

    raise ValueError("No bucket capacity remaining for placement grouping")


def distribute_classes_to_buckets(classes: list[int], bucket_defs: list[dict[str, object]], class_meta_map: dict[int, dict[str, int]]) -> dict[int, dict[str, object]]:
    assignments: dict[int, dict[str, object]] = {}
    year_to_classes: dict[int, list[int]] = {}

    for class_id in sorted(classes):
        year = int(class_meta_map.get(class_id, {}).get("year", 0))
        year_to_classes.setdefault(year, []).append(class_id)

    buckets = [dict(bucket) for bucket in bucket_defs]
    day_offsets = sorted({int(bucket["day_offset"]) for bucket in buckets})
    year_pointer = 0

    for year in sorted(year_to_classes):
        preferred_offset = day_offsets[year_pointer % len(day_offsets)] if day_offsets else 0
        dept_to_classes: dict[int, list[int]] = {}
        for class_id in year_to_classes[year]:
            dept_id = int(class_meta_map.get(class_id, {}).get("dept_id", class_id))
            dept_to_classes.setdefault(dept_id, []).append(class_id)

        local_pointer = 0
        for dept_id in sorted(dept_to_classes):
            for class_id in dept_to_classes[dept_id]:
                candidates = []
                for index, bucket in enumerate(buckets):
                    if int(bucket["capacity"]) <= 0:
                        continue
                    year_penalty = 0 if int(bucket["day_offset"]) == preferred_offset else 1
                    pointer_penalty = (index - local_pointer + len(buckets)) % len(buckets)
                    candidates.append((year_penalty, pointer_penalty, index))

                candidates.sort()
                bucket_index = candidates[0][2]
                bucket = buckets[bucket_index]
                assignments[class_id] = {
                    "segment": bucket["segment"],
                    "group": bucket["group"],
                    "subgroup": bucket["subgroup"],
                    "day_offset": bucket["day_offset"],
                }
                bucket["capacity"] = int(bucket["capacity"]) - 1
                local_pointer = (bucket_index + 1) % len(buckets)

        year_pointer += 1

    return assignments


def build_bucket_defs(count: int, segment: str, group_name: str) -> list[dict[str, object]]:
    subgroup_count = max(1, count // TARGET_CLASSES_PER_SUBGROUP)
    if count % TARGET_CLASSES_PER_SUBGROUP:
        subgroup_count += 1
    subgroup_count = min(max(subgroup_count, 1), count if count > 0 else 1)
    subgroup_count = min(subgroup_count, MAX_COMBINATIONS)

    subgroup_sizes = [len(chunk) for chunk in chunk_evenly(list(range(count)), subgroup_count)]
    buckets: list[dict[str, object]] = []
    for subgroup_index, subgroup_size in enumerate(subgroup_sizes):
        buckets.append(
            {
                "segment": segment,
                "group": group_name,
                "subgroup": f"{group_name}{subgroup_index + 1}",
                "day_offset": subgroup_index,
                "capacity": subgroup_size,
            }
        )

    return buckets


def assign_subgroups(classes: list[int], days: list[int], class_meta_map: dict[int, dict[str, int]]) -> dict[int, dict[str, object]]:
    ordered = sorted(classes)
    morning_count = len(ordered) // 2
    afternoon_count = len(ordered) - morning_count

    bucket_order = build_bucket_defs(morning_count, "morning", "A") + build_bucket_defs(afternoon_count, "afternoon", "B")

    if not bucket_order:
        return {}

    return distribute_classes_to_buckets(ordered, bucket_order, class_meta_map)


def day_preferences(days: list[int], day_offset: int) -> list[int]:
    return rotate_days(days, day_offset)


def solve(data: dict) -> dict:
    classes = [int(c) for c in data.get("classes", [])]
    if not classes:
        return {"ok": False, "error": "No classes provided"}

    hours = int(data.get("hours", 2))
    periods_per_day = int(data.get("periods_per_day", 6))
    days = [int(d) for d in data.get("days", [1, 2, 3, 4, 5, 6])]
    occupied = build_occupied_map(data.get("occupied", {}))
    class_meta_map = build_class_meta_map(data.get("class_details", []), classes)

    if hours < 2:
        return {"ok": False, "error": "Placement must use at least 2 consecutive periods"}

    if hours > periods_per_day:
        return {"ok": False, "error": "Placement hours cannot exceed periods per day"}

    model = cp_model.CpModel()

    subgroup_map = assign_subgroups(classes, days, class_meta_map)
    vars_by_class: dict[int, list[tuple[cp_model.IntVar, int, int, str, str, str]]] = {}

    for class_id in classes:
        morning, afternoon = get_candidates(class_id, days, periods_per_day, hours, occupied)
        class_vars: list[tuple[cp_model.IntVar, int, int, str, str, str]] = []
        subgroup_info = subgroup_map[class_id]
        segment = str(subgroup_info["segment"])
        group_name = str(subgroup_info["group"])
        subgroup = str(subgroup_info["subgroup"])
        candidate_slots = morning if segment == "morning" else afternoon

        for day, start in candidate_slots:
            v = model.NewBoolVar(f"c{class_id}_d{day}_p{start}_{segment}_{subgroup}")
            class_vars.append((v, day, start, segment, group_name, subgroup))

        if not class_vars:
            return {
                "ok": False,
                "error": f"No available consecutive {segment} slots found for class {class_id}",
            }

        vars_by_class[class_id] = class_vars
        model.Add(sum(v for v, _, _, _, _, _ in class_vars) == 1)

    objective_terms = []
    for class_id, class_vars in vars_by_class.items():
        day_offset = int(subgroup_map[class_id]["day_offset"])
        preferred_days = day_preferences(days, day_offset)
        day_rank = {day: index for index, day in enumerate(preferred_days)}

        for v, day, start, _, _, _ in class_vars:
            score = day_rank.get(day, len(preferred_days)) * 1000 + day * 100 + start
            objective_terms.append(v * score)
    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {
            "ok": False,
            "error": "No feasible placement schedule found with half-morning and half-afternoon constraints",
        }

    assignments = []
    for class_id, class_vars in vars_by_class.items():
        for v, day, start, segment, group_name, subgroup in class_vars:
            if solver.Value(v) == 1:
                periods = list(range(start, start + hours))
                assignments.append(
                    {
                        "class_id": class_id,
                        "day_order": day,
                        "start_period": start,
                        "periods": periods,
                        "segment": segment,
                        "group": group_name,
                        "subgroup": subgroup,
                    }
                )
                break

    return {"ok": True, "assignments": assignments}


def main() -> None:
    try:
        data = json.loads(sys.stdin.read())
        result = solve(data)
        print(json.dumps(result))
    except Exception as exc:  # pragma: no cover
        print(json.dumps({"ok": False, "error": str(exc)}))


if __name__ == "__main__":
    main()
