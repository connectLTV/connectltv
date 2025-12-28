# ConnectLTV Search Guide

## How Search Works

ConnectLTV uses AI-powered semantic search to find alumni whose profiles are conceptually similar to your query. When you search, the system:

1. Converts your query into a semantic representation
2. Finds alumni with similar content in their profiles, work history, education, and skills
3. Sends the top 50 candidates to GPT for intelligent reranking
4. Returns up to 30 relevant alumni with explanations of why they match

**What this means:** The search finds conceptual matches—"machine learning" will match profiles mentioning "AI" or "data science" even if they don't use your exact words.

---

## What You Can Search For

### Roles & Titles

Search for alumni by their job titles (current or past):
- "founders" or "CEOs"
- "product managers"
- "software engineers"
- "venture capitalists" or "investors"
- "consultants"
- "investment bankers"

### Industries

Search by company industry. These work best when they match standard LinkedIn industry categories:
- "healthcare" or "biotechnology"
- "financial services"
- "technology" or "software"
- "consulting"
- "consumer goods"
- "real estate"

> **Note:** Niche terms like "climate tech" or "web3" will only match if alumni mention them in their profile descriptions.

### Companies

Search for experience at specific companies:
- "Google" or "McKinsey" or "Goldman Sachs"
- Any company name that appears in alumni work history

### Skills

Search for specific skills or expertise areas:
- "Python" or "SQL"
- "financial modeling"
- "product strategy"
- "venture capital"
- "private equity"
- "marketing"
- "operations"

Skills are drawn from LinkedIn skills sections.

### Education

Search by school, degree, or field of study:
- "Stanford" or "MIT" or "Harvard"
- "MBA" or "PhD"
- "computer science" or "engineering" or "economics"

### Location

Search for alumni in specific areas:
- "San Francisco" or "Bay Area"
- "New York"
- "Boston"
- "Los Angeles"
- "London"

---

## Combining Search Terms

You can include multiple concepts in a single query. The search will find profiles that are semantically similar to your overall query.

**Examples that work well:**
- "I'm looking for founders in healthcare or biotech startups" — matches founder titles + healthcare industry
- "Find alumni with product management experience at Google or Meta" — matches PM roles + specific companies
- "Show me VCs and investors based in the Bay Area" — matches investor titles + SF location
- "Looking for alumni with machine learning and AI expertise" — matches technical skills
- "Show me Stanford or MIT alumni working in fintech" — matches education + financial services

**What to know:**
- The search finds profiles similar to your whole query, not boolean AND/OR logic
- More specific queries help narrow results, but very narrow queries may return fewer matches
- If a query is too specific, try broadening it or searching for individual concepts

---

## Post-Search Filters

After results appear, you can narrow them further using filters:

| Filter     | What It Filters               |
|------------|-------------------------------|
| Class Year | HBS graduation year           |
| Location   | Alumni's current location     |
| Instructor | LTV course section/instructor |
| Industry   | Current company's industry    |

Filter options are populated based on your search results.

---

## Search Tips

1. **Start with key concepts:** Focus on the role, industry, company, or skill you're looking for. "VCs in healthcare" is effective.
2. **Use professional terminology:** Search terms that would appear in LinkedIn profiles work best. "Product manager" works better than "someone who manages products."
3. **Try variations:** If results aren't ideal, try synonyms or related terms. "Investors" vs "VCs" vs "venture capital" may surface different profiles.
4. **Broaden if needed:** If you get few results, remove a constraint. "Founders in biotech in Boston" → "Founders in biotech"
5. **Use filters after searching:** Start with a broader search, then use Class Year, Location, or Industry filters to narrow down.

---

## What's Included in Each Result

Each alumni result shows:
- Name and headline
- Experience summary (AI-generated)
- Education summary (AI-generated)
- Why they match (AI-generated relevance explanation)
- Email (when available)
- Class year

The detailed profile view also includes:
- Location
- LTV instructor
- LinkedIn profile link
- Draft email button

---

## Limitations

- **Career transitions:** Searching "engineers who became PMs" won't specifically find career changers—it will find people who match "engineer" or "PM" concepts
- **Company characteristics:** "Startups" or "Fortune 500" aren't tracked fields—these only work if mentioned in profile text
- **Investment focus:** For VCs, we don't track what sectors they invest in—only their job descriptions
- **Recency:** Search doesn't distinguish between current and past roles; filters can help narrow by current industry
