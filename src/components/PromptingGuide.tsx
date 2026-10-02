import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { BookOpen, X } from "lucide-react";

const GUIDE_CONTENT = `# ConnectLTV Search Guide

## How Search Works

ConnectLTV understands your query in two parts:

1. **Facts it can check exactly** — class year, LTV instructor, location, companies, job titles, schools, degrees, founder and investor status, company size, and more. These are matched against structured data, so you get every alumnus who fits, not a sample.
2. **Everything else** — topics, sectors and expertise such as "fintech" or "climate". These are matched by meaning against each profile, then checked by AI, which also writes a short explanation of why each person matches.

**What this means:** "Class of 2025" or "product managers at Google" returns the complete list. "Founders in climate tech" first narrows to founders exactly, then finds the ones whose profiles are about climate.

---

## What You Can Search For

### Class, Instructor and Location

- "Class of 2025" or "alumni who graduated before 2015"
- "alumni who took LTV with Christina Wallace"
- "alumni based in London" or "in the Bay Area"

### Companies and Roles

Search for experience at specific companies, now or in the past:
- "McKinsey alumni" or "people who worked at Google"
- "software engineers at McKinsey" — a title and a company together
- "alumni currently working at Stripe" — current roles only
- "people who interned at Tesla"

Common abbreviations work: "BCG", "JPMorgan", "AWS", "Facebook" (also finds Meta).

### Founders, Investors and Startups

- "founders" or "alumni running their own startup right now"
- "technical founders"
- "VCs" or "private equity investors in London"
- "alumni who joined a startup right after graduating"
- "alumni working at large companies" — companies are grouped as startup (up to 50 people), growth (51-1,000) and large (over 1,000)

### Education and Background

- "Stanford graduates" or "MIT graduates who worked at Google"
- "people who studied computer science"
- "alumni with a law degree" or "with a PhD"
- "alumni who served in the military"
- "people who came from consulting before HBS"

### Skills

Ask for a skill explicitly to match LinkedIn skills sections:
- "alumni with Tableau skills"
- "alumni with Six Sigma skills"

### Topics, Sectors and Expertise

Anything that is not a fixed fact is matched by meaning:
- "people working in crypto or web3"
- "alumni with machine learning and AI expertise"
- "growth marketing leaders"
- "people building in edtech"

---

## Combining Search Terms

You can combine facts and topics in one query. Facts are applied exactly; the topic is then matched within that group.

**Examples that work well:**
- "founders in healthcare or biotech startups" — founders, then healthcare or biotech
- "Class of 2023 alumni based in London who worked at Google" — three exact facts combined
- "VCs and investors based in the Bay Area" — investors in one location
- "Stanford or MIT alumni working in fintech" — schools exactly, fintech by meaning
- "climate tech founders" — founders, then climate

**What to know:**
- Requirements are combined with AND; "X or Y" within one requirement works as OR
- Purely factual queries return everyone who matches, with the most complete profiles first, and no AI explanation
- Queries with a topic return AI-checked matches, each with an explanation

---

## Post-Search Filters

After results appear, you can narrow them further using filters:

| Filter | What It Filters |
|--------|-----------------|
| Class Year | HBS graduation year |
| Location | Alumni's current location |
| Instructor | LTV course section/instructor |
| Industry | Current company's industry |
| Function | Function of the current role |

Filter options are populated based on your search results.

---

## Search Tips

1. **Say the facts plainly:** "Class of 2024", "at Google", "based in Boston" are understood exactly.
2. **Be explicit about current vs past:** "currently at Google" means now; "worked at Google" means any time.
3. **Add a topic to narrow:** "founders" is a long list; "founders in fintech" is a focused one.
4. **Try variations for topics:** "climate tech", "clean energy" and "sustainability" may surface different profiles.
5. **Use filters after searching:** start broader, then narrow by Class Year, Location, Industry or Function.

---

## What's Included in Each Result

Each alumni result shows:
- Name and headline
- Experience summary
- Education summary
- Why they match (AI-generated for topic searches)
- Email (when available)
- Class year

The detailed profile view also includes:
- Location
- LTV instructor
- LinkedIn profile link
- Draft email button

---

## Limitations

- **Profile data is a snapshot:** profiles were collected from LinkedIn in December 2025 and January 2026, so recent job changes may be missing
- **Company size is today's size:** "startup" means the company has up to 50 people now, not when the person joined
- **Investment focus:** for investors, we know the type of firm (VC, private equity, growth) but not which sectors they invest in unless the profile says so
- **Topics depend on profile text:** niche areas only match if the profile mentions them or clearly implies them
- **Alumni without a LinkedIn profile on file are not included**`;

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
