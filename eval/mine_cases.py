"""Mine candidate eval cases from the structured data.

Ground truth comes from database columns (titles, companies, schools, class year, ...),
never from the retriever, so it is independent of the system under test.
Output: eval/queries.jsonl (person ids only, no names).

Usage: python3 eval/mine_cases.py
"""
import collections
import json
import random
import re

import lib

random.seed(7)
corpus = lib.load_corpus()
P = list(corpus.values())

COMPANIES = {  # query name -> regex over experiences.company
    "McKinsey": r"mckinsey", "Google": r"\bgoogle\b", "Bain & Company": r"bain (&|and) company",
    "Goldman Sachs": r"goldman sachs", "Amazon": r"\bamazon\b", "Morgan Stanley": r"morgan stanley",
    "Microsoft": r"\bmicrosoft\b", "Uber": r"\buber\b", "Apple": r"^apple( inc\.?)?$", "Deloitte": r"deloitte",
    "Stripe": r"\bstripe\b", "Airbnb": r"airbnb", "Tesla": r"\btesla\b", "Salesforce": r"salesforce",
    "LinkedIn": r"^linkedin", "Blackstone": r"blackstone", "Accenture": r"accenture", "Wayfair": r"wayfair",
    "HubSpot": r"hubspot", "Bridgewater": r"bridgewater", "IBM": r"^ibm\b", "Nike": r"^nike\b",
    "Spotify": r"spotify", "Netflix": r"netflix", "DoorDash": r"doordash", "Lyft": r"^lyft\b",
    "Palantir": r"palantir", "SpaceX": r"spacex", "Oliver Wyman": r"oliver wyman", "Bain Capital": r"bain capital",
}
ALIASES = {  # how a user might say it -> regex for everything that should match
    "BCG": r"boston consulting|\bbcg\b", "Facebook": r"facebook|\bmeta\b", "Meta": r"facebook|\bmeta\b",
    "JPMorgan": r"j\.? ?p\.? ?morgan", "PwC": r"\bpwc\b|pricewaterhouse", "P&G": r"procter|p&g",
    "AWS": r"amazon web services|\baws\b",
}
SCHOOLS = {
    "Stanford": r"stanford", "MIT": r"massachusetts institute of technology|\bmit\b", "Yale": r"\byale\b",
    "Princeton": r"princeton", "UPenn": r"university of pennsylvania|wharton", "Berkeley": r"berkeley",
    "Oxford": r"oxford", "Duke": r"\bduke\b", "Brown": r"brown university", "Cornell": r"cornell",
    "Columbia": r"columbia", "Dartmouth": r"dartmouth", "West Point": r"west point|united states military academy",
    "LSE": r"london school of economics", "UChicago": r"university of chicago",
}
ROLES = {  # plural phrase -> regex over experiences.title
    "software engineers": r"software (engineer|developer)|\bswe\b|full[- ]stack (engineer|developer)|(backend|frontend|front-end|back-end) engineer",
    "product managers": r"product manager|product management|\bapm\b",
    "data scientists": r"data scien",
    "chiefs of staff": r"chief of staff",
    "interns": r"\bintern\b|internship|summer (associate|analyst)",
    "designers": r"\bdesigner\b",
}
INDUSTRIES = {  # query phrase -> exact people.current_industry values
    "venture capital": {"Venture Capital and Private Equity Principals"},
    "healthcare": {"Hospitals and Health Care"},
    "biotech": {"Biotechnology Research"},
    "higher education": {"Higher Education"},
    "retail": {"Retail"},
}
CITIES = {"London": r"london", "Los Angeles": r"los angeles", "Seattle": r"seattle", "Austin": r"austin",
          "Chicago": r"chicago", "Washington DC": r"washington, district of columbia|washington dc",
          "Singapore": r"singapore", "Miami": r"miami", "Toronto": r"toronto", "Boston": r"boston|cambridge, massachusetts"}


def rx(pattern):
    return re.compile(pattern, re.I)


def exp_match(p, company=None, title=None, current=False):
    for e in p["experiences"]:
        if current and not e.get("is_current"):
            continue
        if company and not rx(company).search(e.get("company") or ""):
            continue
        if title and not rx(title).search(e.get("title") or ""):
            continue
        return True
    return False


def school_match(p, pattern):
    return any(rx(pattern).search(e.get("school") or "") for e in p["educations"])


def ids(pred):
    return sorted(p["person_id"] for p in P if pred(p))


cases = []


def add(failure_class, ctype, query, expected, notes=""):
    slug = re.sub(r"[^a-z0-9]+", "-", query.lower()).strip("-")[:60]
    cases.append({"id": f"{failure_class}:{slug}", "query": query, "type": ctype, "failure_class": failure_class,
                  "expected_person_ids": expected, "expected_count": len(expected), "notes": notes})


# 1. Conjunctive: role x company, small exact answer sets
for cname, cre in COMPANIES.items():
    for rname, rre in ROLES.items():
        exp = ids(lambda p: exp_match(p, cre, rre))
        if 1 <= len(exp) <= 8:
            ctype = "known_item" if len(exp) <= 3 else "enumerable"
            q = f"people who interned at {cname}" if rname == "interns" else f"{rname} at {cname}"
            add("conjunctive", ctype, q, exp, "title regex within company")

# 2. Cross-chunk: school x current industry, school x company
for sname, sre in SCHOOLS.items():
    for iname, ivals in INDUSTRIES.items():
        exp = ids(lambda p: school_match(p, sre) and p.get("current_industry") in ivals)
        if 2 <= len(exp) <= 25:
            add("cross_chunk", "enumerable", f"{sname} graduates working in {iname}", exp, "school x current_industry")
    for cname in ["Google", "McKinsey", "Goldman Sachs", "Amazon", "Microsoft"]:
        exp = ids(lambda p: school_match(p, sre) and exp_match(p, COMPANIES[cname]))
        if 2 <= len(exp) <= 25:
            add("cross_chunk", "enumerable", f"{sname} graduates who worked at {cname}", exp, "school x company")

# 3. Structured attributes invisible to vectors
years = sorted({p["class_year"] for p in P if p["class_year"]})
for y in years:
    add("structured", "enumerable", f"Class of {y}" if y % 2 else f"LTV students from the Class of {y}",
        ids(lambda p: p["class_year"] == y), "class_year")
for inst in ["Christina Wallace", "Lindsay Hyde", "Reza Satchu", "Sam Clemens", "Tom Eisenmann", "Jeffrey Rayport"]:
    add("structured", "enumerable", f"alumni who took LTV with {inst}",
        ids(lambda p: inst.lower() in (p.get("section") or "").lower()), "section contains instructor")
for city, cre in CITIES.items():
    add("structured", "enumerable", f"alumni based in {city}", ids(lambda p: rx(cre).search(p.get("location") or "")), "location")
for y, city in [(2023, "London"), (2019, "Los Angeles"), (2024, "Seattle"), (2022, "Boston"), (2025, "London"), (2017, "Chicago"), (2021, "Austin")]:
    exp = ids(lambda p: p["class_year"] == y and rx(CITIES[city]).search(p.get("location") or ""))
    if exp:
        add("structured", "enumerable", f"Class of {y} alumni based in {city}", exp, "class_year x location")
for y, cname in [(2022, "Google"), (2024, "McKinsey"), (2018, "Amazon"), (2025, "Goldman Sachs")]:
    add("structured", "enumerable", f"Class of {y} alumni who worked at {cname}",
        ids(lambda p: p["class_year"] == y and exp_match(p, COMPANIES[cname])), "class_year x company")

# 4. Aliases and abbreviations
for alias, are in ALIASES.items():
    exp = ids(lambda p: exp_match(p, are))
    if exp:
        add("alias", "enumerable", f"people who worked at {alias}", exp, "company alias")
for sname in ["LSE", "UPenn", "MIT", "UChicago"]:
    add("alias", "enumerable", f"{sname} graduates", ids(lambda p: school_match(p, SCHOOLS[sname])), "school alias")
add("alias", "enumerable", "VCs", ids(lambda p: p.get("current_industry") == "Venture Capital and Private Equity Principals"
                                         and exp_match(p, None, r"partner|principal|associate|investor|venture|analyst|vp|vice president", current=True)),
    "noisy: current role at a VC/PE-industry firm")

# 5. High-cardinality sets
for cname in ["McKinsey", "Google", "Bain & Company", "Goldman Sachs", "Amazon", "Microsoft"]:
    add("high_cardinality", "enumerable", f"{cname} alumni", ids(lambda p: exp_match(p, COMPANIES[cname])), "any experience at company")
add("high_cardinality", "enumerable", "alumni in New York", ids(lambda p: rx(r"new york|brooklyn").search(p.get("location") or "")), "location")

# 6. Rare terms
comp_people = collections.defaultdict(set)
for p in P:
    for e in p["experiences"]:
        if e.get("company"):
            comp_people[e["company"].strip()].add(p["person_id"])
rare = sorted(c for c, s in comp_people.items() if len(s) == 1 and re.fullmatch(r"[A-Z][A-Za-z0-9]{5,14}", c)
              and sum(1 for other in comp_people if c.lower() in other.lower()) == 1)
for c in random.sample(rare, 12):
    add("rare_term", "known_item", f"anyone who worked at {c}", sorted(comp_people[c]), "company appears once")
school_people = collections.defaultdict(set)
for p in P:
    for e in p["educations"]:
        if e.get("school"):
            school_people[e["school"].strip()].add(p["person_id"])
rare_s = sorted(s for s, v in school_people.items() if len(v) == 1 and 12 <= len(s) <= 45 and "harvard" not in s.lower())
for s in random.sample(rare_s, 6):
    add("rare_term", "known_item", f"alumni who attended {s}", sorted(school_people[s]), "school appears once")

# 7. Skills-only
skill_people = collections.defaultdict(set)
for p in P:
    for s in p["skills"]:
        skill_people[s.strip()].add(p["person_id"])
for s in ["Kubernetes", "Racket", "TensorFlow", "Tableau", "Mandarin", "Six Sigma", "Machine Learning", "Bloomberg Terminal", "Supply Chain Management", "Clinical Research"]:
    exp = sorted(set().union(*[v for k, v in skill_people.items() if k.lower() == s.lower()] or [set()]))
    if exp:
        add("skills_only", "known_item" if len(exp) <= 3 else "enumerable", f"alumni with {s} skills", exp, "skills table exact match")

# 8. Sparse profiles: findable by the one fact they have?
sparse = [p for p in P if len(p["experiences"]) in (1, 2) and not p.get("summary")]
n = 0
for p in sparse:
    e = p["experiences"][0]
    if e.get("title") and e.get("company") and len(comp_people[e["company"].strip()]) == 1:
        add("sparse_profile", "known_item", f"{e['title']} at {e['company']}", [p["person_id"]], "person has <=2 experiences and no summary")
        n += 1
    if n >= 10:
        break

# 9. Current vs past
for cname in ["Google", "McKinsey", "Amazon", "Microsoft", "Stripe", "Apple"]:
    exp = ids(lambda p: exp_match(p, COMPANIES[cname], current=True))
    if exp:
        add("current_vs_past", "enumerable", f"alumni currently working at {cname}", exp, "is_current experience at company")

# 10. Paraphrase / concept (noisy ground truth from title and degree regexes)
add("paraphrase", "enumerable", "people who started their own companies", ids(lambda p: exp_match(p, None, r"\bfounder|co-?founder")), "noisy: founder in any title")
add("paraphrase", "enumerable", "alumni who are running their own startup right now", ids(lambda p: exp_match(p, None, r"\bfounder|co-?founder", current=True)), "noisy: founder in a current title")
add("paraphrase", "enumerable", "alumni who served in the military",
    ids(lambda p: exp_match(p, r"\b(u\.?s\.? )?(army|navy|air force|marine corps|marines|coast guard)\b|armed forces|defen[cs]e forces|special forces")), "noisy: military employer")
add("paraphrase", "enumerable", "alumni with a doctorate", ids(lambda p: any(rx(r"ph\.? ?d|doctor of philosophy|doctorate").search((e.get("degree") or "")) for e in p["educations"])), "degree regex")
add("paraphrase", "enumerable", "people with a law degree", ids(lambda p: any(rx(r"\bj\.?d\.?\b|juris doctor|\bll\.?[bm]\b").search((e.get("degree") or "")) for e in p["educations"])), "degree regex")
add("paraphrase", "enumerable", "people who studied computer science", ids(lambda p: any(rx(r"computer science").search((e.get("field") or "") + " " + (e.get("degree") or "")) for e in p["educations"])), "field regex")


# 11. The reviewer's use case: joined a startup right after graduation (derived, noisy)
def first_post_hbs_startup(p):
    y = p.get("class_year")
    if not y:
        return False
    post = [e for e in p["experiences"] if e.get("start_date") and e["start_date"] >= f"{y}-04-01"
            and not rx(r"\bintern\b|internship|summer").search(e.get("title") or "")]
    if not post:
        return False
    first = min(post, key=lambda e: e["start_date"])
    return first["start_date"] <= f"{y + 1}-03-31" and first.get("company_size") in ("0-1", "2-10", "11-50")


add("temporal", "enumerable", "alumni who joined a startup right after graduating", ids(first_post_hbs_startup),
    "noisy: first post-HBS role within a year, company size <= 50 (size is today's size)")
add("temporal", "enumerable", "Class of 2023 alumni who joined a startup right after graduating",
    ids(lambda p: p["class_year"] == 2023 and first_post_hbs_startup(p)), "noisy, as above")

# 12. Open-ended: no exact ground truth; precision is LLM-judged
for q in ["founders in healthcare or biotech startups", "product managers with experience at Google or Meta",
          "VCs and investors based in the Bay Area", "alumni with machine learning and AI expertise",
          "Stanford or MIT alumni working in fintech", "climate tech founders", "people working in crypto or web3",
          "operators at consumer brands", "people building in edtech", "alumni working on robotics or hardware",
          "growth marketing leaders", "private equity investors in London"]:
    add("open_ended", "open", q, [], "precision judged by LLM")

# Deduplicate, then take a deterministic stratified sample so the suite stays affordable to rerun.
# Sampling is random within each class (not chosen by whether the current system fails),
# so pass rates are unbiased estimates.
seen, uniq = set(), []
for c in cases:
    if c["id"] not in seen:
        seen.add(c["id"])
        uniq.append(c)

KEEP_ALWAYS = {"software engineers at McKinsey", "Class of 2025", "alumni who joined a startup right after graduating"}
LIMITS = {"conjunctive": 22, "cross_chunk": 16, "structured": 24, "alias": 10, "rare_term": 10, "sparse_profile": 8}
by_class = collections.defaultdict(list)
for c in uniq:
    by_class[c["failure_class"]].append(c)
out = []
rng = random.Random(11)
for cls, items in by_class.items():
    limit = LIMITS.get(cls)
    if limit and len(items) > limit:
        must = [c for c in items if c["query"] in KEEP_ALWAYS]
        rest = [c for c in items if c["query"] not in KEEP_ALWAYS]
        items = must + rng.sample(rest, limit - len(must))
    out.extend(items)

(lib.EVAL_DIR / "queries.jsonl").write_text("\n".join(json.dumps(c) for c in out) + "\n")
print(len(uniq), "candidates mined;", len(out), "kept in eval/queries.jsonl")
for k, v in sorted(collections.Counter((c["failure_class"], c["type"]) for c in out).items()):
    print(f"  {k[0]:18s} {k[1]:11s} {v}")
