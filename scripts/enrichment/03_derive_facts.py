"""Build companies, experience_facts, education_facts and person_facts and upsert them.

Deterministic derivations plus the cached LLM labels from 01_classify_titles.py and
02_classify_people.py. Idempotent: safe to rerun; rows are upserted by primary key.

Usage: python3 03_derive_facts.py [--dry-run]
"""
import collections
import re
import sys

from common import SIZE_BUCKET, lib, load_cache, load_raw_by_person, upsert

SCRAPE_YEAR = 2026.0  # data scraped Dec 2025 / Jan 2026
ISO = {"US": "United States", "GB": "United Kingdom", "IN": "India", "DE": "Germany", "CA": "Canada", "FR": "France",
       "CH": "Switzerland", "BR": "Brazil", "SG": "Singapore", "IL": "Israel", "AU": "Australia", "CN": "China",
       "MX": "Mexico", "JP": "Japan", "IE": "Ireland", "SA": "Saudi Arabia", "CO": "Colombia", "SE": "Sweden",
       "ES": "Spain", "NL": "Netherlands", "ID": "Indonesia", "KR": "South Korea", "HK": "Hong Kong",
       "AE": "United Arab Emirates", "PE": "Peru", "BE": "Belgium", "PL": "Poland", "CL": "Chile", "VN": "Vietnam",
       "KE": "Kenya", "AR": "Argentina", "NG": "Nigeria", "AT": "Austria", "NO": "Norway", "ZA": "South Africa",
       "DK": "Denmark", "TW": "Taiwan", "TR": "Turkey", "TH": "Thailand", "BM": "Bermuda", "PK": "Pakistan",
       "PH": "Philippines", "FI": "Finland", "PT": "Portugal", "LU": "Luxembourg", "EG": "Egypt", "IT": "Italy",
       "RO": "Romania", "GR": "Greece", "KW": "Kuwait", "GH": "Ghana", "RU": "Russia", "IS": "Iceland",
       "NZ": "New Zealand", "LB": "Lebanon", "MY": "Malaysia", "QA": "Qatar", "JO": "Jordan", "UA": "Ukraine",
       "CR": "Costa Rica", "RW": "Rwanda", "UY": "Uruguay", "AF": "Afghanistan", "KH": "Cambodia", "PA": "Panama",
       "MN": "Mongolia", "CZ": "Czechia", "UG": "Uganda"}
COUNTRY_FIX = {"Hong Kong SAR": "Hong Kong", "Türkiye": "Turkey"}
REGION = {}
for _r, _cs in {
    "North America": ["United States", "Canada", "Bermuda"],
    "Latin America": ["Brazil", "Mexico", "Colombia", "Peru", "Chile", "Argentina", "Costa Rica", "Uruguay", "Panama"],
    "Europe": ["United Kingdom", "Germany", "France", "Switzerland", "Ireland", "Sweden", "Spain", "Netherlands", "Belgium",
               "Poland", "Austria", "Norway", "Denmark", "Finland", "Portugal", "Luxembourg", "Italy", "Romania", "Greece",
               "Russia", "Iceland", "Ukraine", "Czechia", "Bulgaria"],
    "Asia": ["India", "Singapore", "China", "Japan", "Indonesia", "South Korea", "Hong Kong", "Vietnam", "Taiwan", "Thailand",
             "Pakistan", "Philippines", "Malaysia", "Cambodia", "Mongolia", "Afghanistan"],
    "Middle East": ["Israel", "Saudi Arabia", "United Arab Emirates", "Turkey", "Egypt", "Kuwait", "Lebanon", "Qatar", "Jordan"],
    "Africa": ["Kenya", "Nigeria", "South Africa", "Ghana", "Rwanda", "Uganda", "Côte d'Ivoire"],
    "Oceania": ["Australia", "New Zealand"],
}.items():
    for _c in _cs:
        REGION[_c] = _r

METROS = [
    ("New York City", r"new york|brooklyn|manhattan|jersey city|hoboken"),
    ("San Francisco Bay Area", r"san francisco|bay area|palo alto|mountain view|menlo park|san jose|oakland|berkeley|sunnyvale|redwood city|san mateo|cupertino|santa clara|stanford, california"),
    ("Boston", r"boston|cambridge, massachusetts|somerville, massachusetts|brookline, massachusetts|newton, massachusetts"),
    ("Los Angeles", r"los angeles|santa monica|culver city|pasadena|beverly hills|venice, california"),
    ("Washington DC", r"washington, district of columbia|washington dc|washington d\.c|arlington, virginia|bethesda"),
    ("Chicago", r"chicago"), ("Seattle", r"seattle|bellevue, washington|redmond, washington"), ("London", r"london"),
]
PEDIGREE = [("mbb", r"mckinsey|bain (&|and) co|^bain$|boston consulting|\bbcg\b"),
            ("big_tech", r"^google|^alphabet|^meta$|^meta platforms|^facebook|^amazon|^apple$|^apple inc|^microsoft|^netflix"),
            ("bulge_bracket", r"goldman sachs|morgan stanley|j\.? ?p\.? ?morgan|bank of america|merrill lynch|^citi|citigroup|barclays|credit suisse|deutsche bank|^ubs\b")]

DEGREE_LEVELS = [
    ("phd", r"ph\.?\s?d|doctor of philosophy|dphil|doctorate"),
    ("jd", r"\bj\.?d\.?\b|juris doctor"),
    ("md", r"\bm\.?d\.?\b|doctor of medicine|\bmbbs\b"),
    ("mba", r"\bm\.?b\.?a\b|master of business administration"),
    ("master", r"master|\bm\.?s\.?c?\.?\b|\bm\.?a\.?\b|\bm\.?eng\b|\bmpp\b|\bmpa\b|\bmph\b|\bmphil\b|\bll\.?m\b|\bs\.?m\.?\b|\bm\.?p\.?a\b"),
    ("bachelor", r"bachelor|\bb\.?s\.?c?\.?\b|\bb\.?a\.?\b|\ba\.?b\.?\b|\bb\.?eng?\b|\bb\.?tech\b|\bbba\b|\bb\.?b\.?a\b|\bb\.?com\b|\bs\.?b\.?\b|undergraduate|\bll\.?b\b|\bb\.?s\.?e\b"),
    ("high_school", r"high school|diploma|gcse|a-?levels?|baccalaur|secondary"),
]
MAJORS = [
    ("stem", r"engineer|comput|math|physic|chemi|biolog|statistic|science|technology|neuro|biochem|informatics|robotic|data"),
    ("economics_business", r"econom|financ|business|commerce|account|management|marketing|entrepreneur|administration"),
    ("humanities_social", r"histor|english|philosoph|politic|government|psycholog|sociolog|international|literature|law|language|anthropolog|public policy|art|studies|journalism|communication"),
]


def rx(p):
    return re.compile(p, re.I)


def norm_name(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


def timing(start, y):
    if not y or not start:
        return None
    if start < f"{y - 2}-08-01":
        return "pre"
    return "post" if start >= f"{y}-04-01" else "during"


def degree_level(degree, school):
    d = degree or ""
    for level, pat in DEGREE_LEVELS:
        if rx(pat).search(d):
            return level
    if not d and rx(r"high school|preparatory|lyc[ée]e|gymnasium|secondary school").search(school or ""):
        return "high_school"
    if not d and rx(r"harvard business school").search(school or ""):
        return "mba"
    return "other"


def major_category(field, degree):
    text = f"{field or ''} {degree or ''}"
    if not (field or "").strip():
        return None
    for cat, pat in MAJORS:
        if rx(pat).search(text):
            return cat
    return "other"


def main(dry_run=False):
    corpus = lib.load_corpus()
    raw = load_raw_by_person(corpus)
    title_labels = load_cache("title_labels")
    industry_groups = load_cache("industry_groups")
    person_labels = load_cache("person_labels")

    # ---------- companies ----------
    comp = {}  # key -> aggregate
    exp_company = {}  # exp_id -> key
    for pid, p in corpus.items():
        rexps = raw[pid].get("experiences") or []
        for e in p["experiences"]:
            name = (e.get("company") or "").strip()
            if not name:
                continue
            r = rexps[e["sort_index"]] if e["sort_index"] < len(rexps) else {}
            key = f"li:{r['companyId']}" if r.get("companyId") else f"name:{norm_name(name)}"
            c = comp.setdefault(key, {"names": collections.Counter(), "sizes": collections.Counter(),
                                      "inds": collections.Counter(), "sites": collections.Counter(), "people": set()})
            c["names"][name] += 1
            if e.get("company_size"):
                c["sizes"][e["company_size"]] += 1
            if e.get("company_industry"):
                c["inds"][e["company_industry"]] += 1
            if r.get("companyWebsite"):
                c["sites"][r["companyWebsite"]] += 1
            c["people"].add(pid)
            exp_company[e["exp_id"]] = key
    company_rows = []
    for key, c in comp.items():
        canonical = c["names"].most_common(1)[0][0]
        size = c["sizes"].most_common(1)[0][0] if c["sizes"] else None
        ind = c["inds"].most_common(1)[0][0] if c["inds"] else None
        ped = next((g for g, pat in PEDIGREE if any(rx(pat).search(n) for n in c["names"])), None)
        company_rows.append({"company_key": key, "canonical_name": canonical,
                             "aliases": sorted(n for n in c["names"] if n != canonical), "size": size,
                             "size_bucket": SIZE_BUCKET.get(size), "industry": ind,
                             "industry_group": industry_groups.get(ind), "pedigree_group": ped,
                             "website": c["sites"].most_common(1)[0][0] if c["sites"] else None,
                             "people_count": len(c["people"])})
    print(f"companies: {len(company_rows)} (from {sum(len(c['names']) for c in comp.values())} distinct display names)")
    if not dry_run:
        upsert("companies", company_rows, "company_key")
    ids = {r["company_key"]: r["company_id"] for r in lib.rest_get("companies", "company_id,company_key")} if not dry_run else {}
    comp_by_key = {r["company_key"]: r for r in company_rows}

    # ---------- experiences ----------
    exp_rows, per_person = [], collections.defaultdict(list)
    missing_labels = 0
    for pid, p in corpus.items():
        y = p.get("class_year")
        rexps = raw[pid].get("experiences") or []
        for e in p["experiences"]:
            r = rexps[e["sort_index"]] if e["sort_index"] < len(rexps) else {}
            lab = title_labels.get("||".join(((e.get("title") or "").strip(), e.get("company_industry") or "")))
            if not lab:
                missing_labels += 1
                lab = ["other", "mid", "full_time", 0, 0, "none"]
            function, seniority, role_type, is_founder, is_ft, inv = lab
            emp = r.get("employmentType")
            if emp == "Internship":
                role_type = "internship"
            key = exp_company.get(e["exp_id"])
            c = comp_by_key.get(key, {})
            row = {"exp_id": e["exp_id"], "person_id": pid, "company_id": ids.get(key), "function": function,
                   "seniority": seniority, "role_type": role_type, "is_founder": bool(is_founder) and role_type != "student_activity",
                   "is_founding_team": bool(is_ft), "investor_type": None if inv in ("none", None) else inv,
                   "hbs_timing": timing(e.get("start_date"), y), "is_first_post_hbs": False,
                   "is_current": bool(e.get("is_current")),
                   "location_country": ISO.get(r.get("jobLocationCountry")), "employment_type": emp,
                   "is_stealth": bool(rx(r"stealth").search(e.get("company") or "")),
                   "industry_group": industry_groups.get(e.get("company_industry")) or c.get("industry_group"),
                   "size_bucket": SIZE_BUCKET.get(e.get("company_size")) or c.get("size_bucket")}
            exp_rows.append(row)
            per_person[pid].append({**row, "_e": e, "_key": key, "_ped": c.get("pedigree_group")})
    print(f"experience_facts: {len(exp_rows)} rows ({missing_labels} without an LLM label)")

    # ---------- education ----------
    school_names = collections.defaultdict(collections.Counter)
    edu_school_key = {}
    for pid, p in corpus.items():
        redus = raw[pid].get("educations") or []
        by_title = collections.defaultdict(list)
        for r in redus:
            by_title[(r.get("title") or "").strip()].append(r)
        for e in p["educations"]:
            name = (e.get("school") or "").strip()
            r = (by_title.get(name) or [{}])[0]
            key = f"li:{r['companyId']}" if r.get("companyId") else f"name:{norm_name(name)}"
            school_names[key][name] += 1
            edu_school_key[e["edu_id"]] = key
    edu_rows, edu_by_person = [], collections.defaultdict(list)
    for pid, p in corpus.items():
        for e in p["educations"]:
            canonical = school_names[edu_school_key[e["edu_id"]]].most_common(1)[0][0] or None
            row = {"edu_id": e["edu_id"], "person_id": pid, "school_canonical": canonical,
                   "degree_level": degree_level(e.get("degree"), e.get("school")),
                   "major_category": major_category(e.get("field"), e.get("degree")),
                   "is_harvard": bool(rx(r"harvard").search(e.get("school") or ""))}
            edu_rows.append(row)
            edu_by_person[pid].append({**row, "_e": e})
    print(f"education_facts: {len(edu_rows)} rows")

    # ---------- people ----------
    person_rows = []
    for pid, p in corpus.items():
        y = p.get("class_year")
        exps = per_person.get(pid, [])
        lab = person_labels.get(pid, {})
        ft = [x for x in exps if x["role_type"] == "full_time"]
        real = [x for x in exps if x["role_type"] in ("full_time", "part_time_side")]
        founder_roles = [x for x in real if x["is_founder"]]

        # first post-HBS full-time role (founder roles begun during HBS and continued count too)
        def continued(x):
            end = x["_e"].get("end_date")
            return x["hbs_timing"] == "during" and x["is_founder"] and y and (not end or end > f"{y}-09-01")
        post = [x for x in ft if x["_e"].get("start_date") and (x["hbs_timing"] == "post" or continued(x))]
        first_post = min(post, key=lambda x: x["_e"]["start_date"]) if post else None
        if first_post:
            for row in exp_rows:
                if row["exp_id"] == first_post["exp_id"]:
                    row["is_first_post_hbs"] = True
        pre_ft = [x for x in ft if x["hbs_timing"] == "pre" and x["_e"].get("start_date")]
        last_pre = max(pre_ft, key=lambda x: x["_e"]["start_date"]) if pre_ft else None

        current = sorted([x for x in exps if x["is_current"] and x["role_type"] == "full_time"], key=lambda x: x["_e"]["sort_index"])
        cur = current[0] if current else None
        investing = [x for x in real if x["investor_type"]]
        cur_inv = [x for x in investing if x["is_current"] and x["role_type"] == "full_time"]
        latest_inv = sorted(investing, key=lambda x: x["_e"].get("start_date") or "", reverse=True)

        starts = [x["_e"]["start_date"] for x in ft if x["_e"].get("start_date")]
        years = None
        if starts:
            first = min(starts)
            years = SCRAPE_YEAR - (int(first[:4]) + (int(first[5:7]) - 1) / 12)
            if y and first < f"{y - 2}-08-01" and y <= SCRAPE_YEAR:
                years -= 2  # time spent at HBS
            years = round(max(years, 0), 1)

        edus = edu_by_person.get(pid, [])
        bachelors = sorted([x for x in edus if x["degree_level"] == "bachelor"], key=lambda x: x["_e"].get("start_year") or 9999)
        advanced = sorted({x["degree_level"] for x in edus if x["degree_level"] in ("master", "jd", "md", "phd")})
        joint = None
        for x in edus:
            deg = (x["_e"].get("degree") or "")
            m = rx(r"\b(ms|jd|md|mpp|mpa(?:[-/ ]id)?|phd)\s*/\s*mba\b|\bmba\s*/\s*(ms|jd|md|mpp|mpa|phd)\b").search(deg)
            if m:
                joint = (m.group(1) or m.group(2)).upper().replace(" ", "") + "/MBA"
                break
        if not joint and y:
            for x in edus:
                school = x["_e"].get("school") or ""
                end = x["_e"].get("end_year")
                if x["is_harvard"] and not rx(r"business school|harvard college|extension").search(school) \
                        and x["degree_level"] in ("master", "jd", "md", "phd") and end and abs(end - y) <= 1:
                    label = {"jd": "JD", "md": "MD", "phd": "PhD"}.get(x["degree_level"])
                    if not label:
                        label = "MPP/MPA" if rx(r"kennedy").search(school) else "MS"
                    joint = f"{label}/MBA"
                    break

        loc = p.get("location") or ""
        metro = next((m for m, pat in METROS if rx(pat).search(loc)), None)
        parts = [x.strip() for x in loc.split(",") if x.strip()]
        country = raw[pid].get("addressCountryOnly") or (parts[-1] if parts else None)
        country = COUNTRY_FIX.get(country, country)
        if not metro and len(parts) >= 2 and parts[0] != parts[-1]:
            metro = re.sub(r"^Greater | Metropolitan Area$| Area$| Metroplex$", "", parts[0]).strip() or None
        desc_count = sum(1 for e in p["experiences"] if e.get("description"))
        richness = (6 if p.get("summary") else 0) + 2 * min(desc_count, 5) + min(len(p["experiences"]), 6) \
            + (2 if p["skills"] else 0) + (2 if p["educations"] else 0) + (2 if p.get("headline") else 0)

        tech = bool(lab.get("technical_background"))
        person_rows.append({
            "person_id": pid,
            "instructors": sorted({s.strip() for s in (p.get("section") or "").split(",") if s.strip()}),
            "metro": metro, "country": country, "region": REGION.get(country),
            "countries_worked": sorted({x["location_country"] for x in exps if x["location_country"]}),
            "has_email": bool((p.get("email") or "").strip()),
            "ever_founded": bool(founder_roles), "currently_founder": any(x["is_current"] for x in founder_roles),
            "companies_founded_count": len({x["_key"] or x["exp_id"] for x in founder_roles}),
            "founded_near_hbs": bool(y) and any((x["_e"].get("start_date") or "") >= f"{y - 2}-08-01"
                                               and (x["_e"].get("start_date") or "") <= f"{y + 2}-06-30" for x in founder_roles),
            "early_employee": any((not x["is_founder"] and x["size_bucket"] == "startup") or x["is_founding_team"] for x in ft),
            "founder_type": ("technical" if tech else "non_technical") if founder_roles else None,
            "joined_startup_after_hbs": bool(first_post and y and first_post["size_bucket"] == "startup"
                                             and first_post["_e"]["start_date"] <= f"{y + 1}-06-30"),
            "is_investor": bool(cur_inv), "ever_investor": any(x["role_type"] == "full_time" for x in investing),
            "investor_type": (cur_inv[0] if cur_inv else latest_inv[0])["investor_type"] if investing else None,
            "pre_hbs_archetype": lab.get("pre_hbs_archetype"), "post_hbs_path": lab.get("post_hbs_path"),
            "industry_switcher": (last_pre["industry_group"] != first_post["industry_group"])
            if last_pre and first_post and last_pre["industry_group"] and first_post["industry_group"] else None,
            "function_switcher": (last_pre["function"] != first_post["function"]) if last_pre and first_post else None,
            "years_experience": years,
            "current_seniority": cur["seniority"] if cur else None, "current_function": cur["function"] if cur else None,
            "pedigree": sorted({x["_ped"] for x in ft if x["_ped"]}),
            "has_board_role": any(x["role_type"] == "board_advisor" for x in exps),
            "in_stealth": any(x["is_stealth"] and x["is_current"] for x in exps),
            "current_company_id": cur["company_id"] if cur else None,
            "current_size_bucket": cur["size_bucket"] if cur else None,
            "current_industry_group": cur["industry_group"] if cur else None,
            "first_post_hbs_company_id": first_post["company_id"] if first_post else None,
            "first_post_hbs_size_bucket": first_post["size_bucket"] if first_post else None,
            "first_post_hbs_function": first_post["function"] if first_post else None,
            "sector_tags": lab.get("sector_tags", []),
            "undergrad_school": bachelors[0]["school_canonical"] if bachelors else None,
            "undergrad_major_category": bachelors[0]["major_category"] if bachelors else None,
            "advanced_degrees": advanced, "harvard_joint_degree": joint,
            "technical_background": tech, "military_veteran": bool(lab.get("military_veteran")),
            "richness_score": richness,
        })

    def share(key, pred=bool):
        return f"{100 * sum(1 for r in person_rows if pred(r[key])) / len(person_rows):.0f}%"
    print("person_facts:", len(person_rows), "| ever_founded", share("ever_founded"), "| currently_founder", share("currently_founder"),
          "| is_investor", share("is_investor"), "| joined_startup_after_hbs", share("joined_startup_after_hbs"),
          "| early_employee", share("early_employee"), "| technical", share("technical_background"),
          "| veteran", share("military_veteran"), "| metro set", share("metro"), "| joint degree", share("harvard_joint_degree"),
          "| undergrad", share("undergrad_school"), "| sector tags", share("sector_tags"))
    if dry_run:
        return person_rows, exp_rows, edu_rows, company_rows
    upsert("experience_facts", exp_rows, "exp_id")
    upsert("education_facts", edu_rows, "edu_id")
    upsert("person_facts", person_rows, "person_id")
    return person_rows, exp_rows, edu_rows, company_rows


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)
