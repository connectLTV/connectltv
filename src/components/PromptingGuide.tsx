import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookOpen, X } from "lucide-react";

const GUIDE_CONTENT = `# ConnectLTV Search Guide

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

| Filter | What It Filters |
|--------|-----------------|
| Class Year | HBS graduation year |
| Location | Alumni's current location |
| Instructor | LTV course section/instructor |
| Industry | Current company's industry |

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
- **Recency:** Search doesn't distinguish between current and past roles; filters can help narrow by current industry`;

interface PromptingGuideProps {
  className?: string;
}

const PromptingGuide: React.FC<PromptingGuideProps> = ({ className }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Simple markdown renderer
  const renderMarkdown = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inTable = false;
    let tableRows: string[][] = [];

    const processInlineStyles = (text: string) => {
      // Bold
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Code
      text = text.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm">$1</code>');
      // Em dash
      text = text.replace(/—/g, '—');
      return text;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Headers
      if (line.startsWith('# ')) {
        elements.push(
          <h1 key={i} className="text-2xl font-bold text-gray-900 mb-4 mt-6 first:mt-0">
            {line.substring(2)}
          </h1>
        );
      } else if (line.startsWith('## ')) {
        elements.push(
          <h2 key={i} className="text-xl font-semibold text-gray-800 mb-3 mt-6">
            {line.substring(3)}
          </h2>
        );
      } else if (line.startsWith('### ')) {
        elements.push(
          <h3 key={i} className="text-lg font-medium text-gray-700 mb-2 mt-4">
            {line.substring(4)}
          </h3>
        );
      }
      // Horizontal rule
      else if (line.startsWith('---')) {
        elements.push(<hr key={i} className="my-6 border-gray-200" />);
      }
      // Blockquote
      else if (line.startsWith('> ')) {
        elements.push(
          <blockquote
            key={i}
            className="border-l-4 border-harvard-crimson pl-4 my-3 text-gray-600 italic"
            dangerouslySetInnerHTML={{ __html: processInlineStyles(line.substring(2)) }}
          />
        );
      }
      // Numbered list
      else if (/^\d+\.\s/.test(line)) {
        const content = line.replace(/^\d+\.\s/, '');
        elements.push(
          <div key={i} className="flex gap-2 ml-4 my-1">
            <span className="text-gray-500">{line.match(/^\d+/)?.[0]}.</span>
            <span dangerouslySetInnerHTML={{ __html: processInlineStyles(content) }} />
          </div>
        );
      }
      // Bullet list
      else if (line.startsWith('- ')) {
        elements.push(
          <div key={i} className="flex gap-2 ml-4 my-1">
            <span className="text-gray-400">•</span>
            <span dangerouslySetInnerHTML={{ __html: processInlineStyles(line.substring(2)) }} />
          </div>
        );
      }
      // Table
      else if (line.startsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        if (!line.includes('---')) {
          const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());
          tableRows.push(cells);
        }
        // Check if next line is not a table
        if (!lines[i + 1]?.startsWith('|')) {
          inTable = false;
          elements.push(
            <table key={i} className="w-full my-4 text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {tableRows[0]?.map((cell, j) => (
                    <th key={j} className="border border-gray-200 px-3 py-2 text-left font-medium">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, j) => (
                      <td key={j} className="border border-gray-200 px-3 py-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
          tableRows = [];
        }
      }
      // Regular paragraph
      else if (line.trim()) {
        elements.push(
          <p
            key={i}
            className="text-gray-600 my-2"
            dangerouslySetInnerHTML={{ __html: processInlineStyles(line) }}
          />
        );
      }
    }

    return elements;
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={`border-gray-300 text-harvard-crimson ${className}`}
      >
        <BookOpen className="h-4 w-4 mr-2" />
        Prompting Guide
      </Button>

      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent
          side="right"
          className="w-[675px] sm:w-[750px] overflow-y-auto p-0"
        >
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
            <SheetHeader>
              <SheetTitle className="text-lg font-semibold">Search Guide</SheetTitle>
            </SheetHeader>
            <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-6 py-4">
            {renderMarkdown(GUIDE_CONTENT)}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default PromptingGuide;
